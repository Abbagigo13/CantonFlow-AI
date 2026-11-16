import { createOrganization, hashToken, membershipsOf, randomHex } from "./auth";
import { isExpired, orgKey, sql, withTx } from "./db";
import { HttpError } from "./validate";
import { participantRoles } from "./workflow";

// An invite is a one-time link the creator of an agreement sends to the other
// side. It never grants access by itself: the other side still has to sign in,
// and the agreement is only visible to members of its two organizations. What
// the link adds is a safe way to register the invited organization under the
// exact name on the agreement, so nobody else can claim that name first.

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function parseToken(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(value)) throw new HttpError(404, "This invite link is not valid.");
  return value;
}

export async function createInvite(address: string, agreementId: string) {
  const [row] = await sql`SELECT * FROM agreements WHERE id = ${agreementId}`;
  if (!row) throw new HttpError(404, "Agreement not found.");
  const roles = await participantRoles(address, row);
  if (row.status !== "Awaiting approval" && row.status !== "Approved") throw new HttpError(409, `A ${String(row.status).toLowerCase()} agreement cannot be shared.`);
  if (isExpired(row)) throw new HttpError(409, "This agreement passed its deadline, so it cannot be shared.");

  const targetKey = roles.buyer ? (row.seller_key as string) : (row.buyer_key as string);
  const targetName = roles.buyer ? (row.seller as string) : (row.buyer as string);

  const token = crypto.randomUUID().replace(/-/g, "") + randomHex(8); // 48 hex characters
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await withTx(async (tx) => {
    // A new link replaces any older unused one for the same agreement.
    await tx`UPDATE invites SET revoked_at = now() WHERE agreement_id = ${agreementId} AND used_at IS NULL AND revoked_at IS NULL`;
    await tx`
      INSERT INTO invites (token_hash, agreement_id, target_key, target_name, created_by, expires_at)
      VALUES (${hashToken(token)}, ${agreementId}, ${targetKey}, ${targetName}, ${address}, ${expiresAt})
    `;
  });

  const [registered] = await sql`SELECT 1 AS ok FROM organizations WHERE key = ${targetKey}`;
  return { token, expiresAt: expiresAt.toISOString(), targetName, targetRegistered: Boolean(registered) };
}

async function loadInvite(tokenRaw: unknown) {
  const token = parseToken(tokenRaw);
  const [invite] = await sql`
    SELECT i.*, a.title, a.amount, a.currency, a.status, a.buyer, a.seller, a.buyer_key, a.seller_key, a.deadline
    FROM invites i JOIN agreements a ON a.id = i.agreement_id
    WHERE i.token_hash = ${hashToken(token)}
  `;
  if (!invite) throw new HttpError(404, "This invite link is not valid.");
  if (invite.revoked_at) throw new HttpError(410, "This invite link was replaced by a newer one. Ask for a fresh link.");
  if (invite.used_at) throw new HttpError(410, "This invite link has already been used.");
  if (new Date(invite.expires_at) < new Date()) throw new HttpError(410, "This invite link has expired. Ask for a fresh link.");
  if (invite.status !== "Awaiting approval" && invite.status !== "Approved") throw new HttpError(410, "This agreement is no longer open.");
  if (isExpired(invite)) throw new HttpError(410, "This agreement passed its deadline.");
  return invite;
}

// What the signed-in link holder may see before accepting: only enough to
// recognise the request.
export async function previewInvite(address: string, tokenRaw: unknown) {
  const invite = await loadInvite(tokenRaw);
  const inviterName = invite.target_key === invite.buyer_key ? invite.seller : invite.buyer;
  const [registered] = await sql`SELECT 1 AS ok FROM organizations WHERE key = ${invite.target_key}`;
  const mine = (await membershipsOf(address)).map((m) => m.key);
  return {
    title: invite.title as string,
    amount: String(invite.amount),
    currency: invite.currency as string,
    inviter: inviterName as string,
    targetName: invite.target_name as string,
    targetRegistered: Boolean(registered),
    youBelong: mine.includes(invite.target_key as string),
    deadline: (invite.deadline as string | null) ?? null,
    expiresAt: new Date(invite.expires_at).toISOString(),
  };
}

export async function acceptInvite(address: string, tokenRaw: unknown) {
  const invite = await loadInvite(tokenRaw);
  const targetKey = invite.target_key as string;
  const inviterKey = targetKey === invite.buyer_key ? (invite.seller_key as string) : (invite.buyer_key as string);
  const mine = (await membershipsOf(address)).map((m) => m.key);

  if (mine.includes(inviterKey)) throw new HttpError(400, "This link was created by your own organization. Send it to the other side.");

  // Already a member of the invited organization: nothing to register.
  if (mine.includes(targetKey)) return { agreementId: invite.agreement_id as string, joined: false, organization: invite.target_name as string };

  const [existing] = await sql`SELECT 1 AS ok FROM organizations WHERE key = ${targetKey}`;
  if (existing) {
    throw new HttpError(403, `${invite.target_name} is already registered. Ask one of its owners to add your wallet on the Team page.`);
  }

  // The invited organization does not exist yet: register it under the exact
  // name on the agreement, with this wallet as its owner.
  const created = await createOrganization(address, invite.target_name);
  if (orgKey(created.name) !== targetKey) throw new HttpError(500, "The organization could not be registered with that name.");
  await sql`UPDATE invites SET used_at = now(), used_by = ${address} WHERE token_hash = ${invite.token_hash} AND used_at IS NULL`;
  await sql`
    INSERT INTO agreement_events (agreement_id, kind, actor, detail, actor_address)
    VALUES (${invite.agreement_id}, 'invite_accepted', ${created.name}, ${`${created.name} joined through an invite link.`}, ${address})
  `;
  return { agreementId: invite.agreement_id as string, joined: true, organization: created.name };
}
