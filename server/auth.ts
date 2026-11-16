import { getAddress, isAddress, verifyMessage } from "viem";
import { orgKey, sql, withTx, type Db } from "./db";
import { HttpError } from "./validate";

// Sign-in is a wallet signature. The server writes the message, stores it with
// a one-time nonce, and only accepts a signature that verifies against that
// exact stored message. Sessions are random tokens; only their hash is stored.

const NONCE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ORGS_PER_WALLET = 5;

export interface Membership {
  key: string;
  name: string;
  role: "owner" | "member";
}

export interface Member {
  address: string;
  role: "owner" | "member";
  since: string;
}

// ---- helpers ----------------------------------------------------------------

const buckets = new Map<string, { count: number; resetAt: number }>();

// Load tests turn the limits off with RATE_LIMIT_DISABLED=1. It is ignored in production.
const limitsDisabled = process.env.RATE_LIMIT_DISABLED === "1" && process.env.NODE_ENV !== "production";

export function rateLimit(key: string, max: number, windowMs: number): void {
  if (limitsDisabled) return;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) throw new HttpError(429, "Too many requests. Wait a moment and try again.");
}

export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
}

export async function deleteExpiredAuth(): Promise<void> {
  await sql`DELETE FROM sessions WHERE expires_at < now()`;
  await sql`DELETE FROM auth_nonces WHERE expires_at < now()`;
}

function hash(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

export const hashToken = hash;

export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseAddress(value: unknown): string {
  if (typeof value !== "string" || !isAddress(value.trim(), { strict: false })) {
    throw new HttpError(400, "A valid wallet address is required.");
  }
  return value.trim().toLowerCase();
}

// ---- sign-in ----------------------------------------------------------------

export async function createNonce(addressInput: unknown): Promise<{ message: string }> {
  const address = parseAddress(addressInput);
  const nonce = randomHex(16);
  const issued = new Date();
  const expires = new Date(issued.getTime() + NONCE_TTL_MS);
  const message = [
    "CantonFlow AI sign-in",
    "",
    `Sign this message to prove you control ${getAddress(address)}.`,
    "It costs nothing and does not move funds.",
    "",
    `Nonce: ${nonce}`,
    `Issued at: ${issued.toISOString()}`,
    `Expires at: ${expires.toISOString()}`,
  ].join("\n");

  await sql`DELETE FROM auth_nonces WHERE expires_at < now() OR address = ${address}`;
  await sql`INSERT INTO auth_nonces (nonce, address, message, expires_at) VALUES (${nonce}, ${address}, ${message}, ${expires})`;
  return { message };
}

export async function verifySignIn(addressInput: unknown, signature: unknown): Promise<{ token: string; address: string; expiresAt: string }> {
  const address = parseAddress(addressInput);
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{100,1000}$/.test(signature)) {
    throw new HttpError(400, "A valid signature is required.");
  }

  // The nonce is consumed first, so a wrong guess cannot be retried.
  const [row] = await sql`
    DELETE FROM auth_nonces WHERE address = ${address} AND expires_at > now() RETURNING message
  `;
  if (!row) throw new HttpError(401, "The sign-in request expired. Please try again.");

  let valid = false;
  try {
    valid = await verifyMessage({ address: getAddress(address), message: row.message as string, signature: signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) throw new HttpError(401, "The signature does not match this wallet.");

  const token = `cf_${randomHex(32)}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sql`DELETE FROM sessions WHERE expires_at < now()`;
  await sql`INSERT INTO sessions (token_hash, address, expires_at) VALUES (${hash(token)}, ${address}, ${expiresAt})`;
  return { token, address, expiresAt: expiresAt.toISOString() };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  const match = header ? /^Bearer\s+(cf_[0-9a-f]{64})$/.exec(header) : null;
  return match ? match[1] : null;
}

// Returns the wallet address of the signed-in caller or throws 401.
export async function authenticate(req: Request): Promise<string> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "Sign in with your wallet to continue.");
  const [row] = await sql`SELECT address FROM sessions WHERE token_hash = ${hash(token)} AND expires_at > now()`;
  if (!row) throw new HttpError(401, "Your session has expired. Sign in again.");
  return row.address as string;
}

export async function signOut(req: Request): Promise<void> {
  const token = bearerToken(req);
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hash(token)}`;
}

// ---- organizations ----------------------------------------------------------

export async function membershipsOf(address: string, db: Db = sql): Promise<Membership[]> {
  const rows = await db`
    SELECT o.key, o.name, m.role FROM memberships m
    JOIN organizations o ON o.key = m.org_key
    WHERE m.address = ${address} ORDER BY o.name
  `;
  return rows.map((r: { key: string; name: string; role: string }) => ({ key: r.key, name: r.name, role: r.role as Membership["role"] }));
}

export async function createOrganization(address: string, nameInput: unknown): Promise<Membership> {
  if (typeof nameInput !== "string") throw new HttpError(400, "Organization name is required.");
  const name = nameInput.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 100) throw new HttpError(400, "Organization name must be 2 to 100 characters.");

  const mine = await membershipsOf(address);
  if (mine.length >= MAX_ORGS_PER_WALLET) throw new HttpError(400, `A wallet can belong to at most ${MAX_ORGS_PER_WALLET} organizations.`);

  const key = orgKey(name);
  return withTx(async (tx) => {
    const inserted = await tx`
      INSERT INTO organizations (key, name, created_by) VALUES (${key}, ${name}, ${address})
      ON CONFLICT (key) DO NOTHING RETURNING key
    `;
    if (inserted.length === 0) throw new HttpError(409, "That organization name is already taken.");
    await tx`INSERT INTO memberships (org_key, address, role) VALUES (${key}, ${address}, 'owner')`;
    return { key, name, role: "owner" as const };
  });
}

async function roleIn(address: string, key: string): Promise<Membership["role"] | null> {
  const [row] = await sql`SELECT role FROM memberships WHERE org_key = ${key} AND address = ${address}`;
  return row ? (row.role as Membership["role"]) : null;
}

export async function listMembers(address: string, key: string): Promise<Member[]> {
  if (!(await roleIn(address, key))) throw new HttpError(404, "Organization not found.");
  const rows = await sql`SELECT address, role, created_at FROM memberships WHERE org_key = ${key} ORDER BY created_at`;
  return rows.map((r: { address: string; role: string; created_at: Date | string }) => ({
    address: r.address,
    role: r.role as Member["role"],
    since: new Date(r.created_at).toISOString(),
  }));
}

export async function addMember(caller: string, key: string, addressInput: unknown): Promise<void> {
  if ((await roleIn(caller, key)) !== "owner") throw new HttpError(403, "Only an organization owner can add members.");
  const address = parseAddress(addressInput);
  if ((await membershipsOf(address)).length >= MAX_ORGS_PER_WALLET) {
    throw new HttpError(400, `That wallet already belongs to ${MAX_ORGS_PER_WALLET} organizations.`);
  }
  const added = await sql`
    INSERT INTO memberships (org_key, address, role) VALUES (${key}, ${address}, 'member')
    ON CONFLICT DO NOTHING RETURNING address
  `;
  if (added.length === 0) throw new HttpError(409, "That wallet is already a member.");
}

export async function removeMember(caller: string, key: string, targetInput: unknown): Promise<void> {
  const target = parseAddress(targetInput);
  const callerRole = await roleIn(caller, key);
  if (!callerRole) throw new HttpError(404, "Organization not found.");
  if (caller !== target && callerRole !== "owner") throw new HttpError(403, "Only an organization owner can remove members.");

  await withTx(async (tx) => {
    const [targetRow] = await tx`SELECT role FROM memberships WHERE org_key = ${key} AND address = ${target} FOR UPDATE`;
    if (!targetRow) throw new HttpError(404, "That wallet is not a member.");
    if (targetRow.role === "owner") {
      const [owners] = await tx`SELECT count(*)::int AS n FROM memberships WHERE org_key = ${key} AND role = 'owner'`;
      if (Number(owners.n) <= 1) throw new HttpError(409, "An organization needs at least one owner.");
    }
    await tx`DELETE FROM memberships WHERE org_key = ${key} AND address = ${target}`;
  });
}

// ---- agreement roles --------------------------------------------------------

export interface Roles {
  buyer: boolean;
  seller: boolean;
}

export async function rolesFor(address: string, buyerKey: string, sellerKey: string, db: Db = sql): Promise<Roles> {
  const keys = (await membershipsOf(address, db)).map((m) => m.key);
  return { buyer: keys.includes(buyerKey), seller: keys.includes(sellerKey) };
}
