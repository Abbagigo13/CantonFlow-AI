import { activity, inbox } from "./activity";
import { acceptInvite, createInvite, previewInvite } from "./invites";
import { cancelAgreement, createAgreement, editAgreement, getAgreement, listAgreements, metrics, reviewAgreement, timeline } from "./agreements";
import { aiStatus, ensureAiTables } from "./ai";
import {
  addMember,
  authenticate,
  createNonce,
  deleteExpiredAuth,
  createOrganization,
  listMembers,
  membershipsOf,
  pruneRateLimits,
  rateLimit,
  removeMember,
  signOut,
  verifySignIn,
} from "./auth";
import { migrate, sql } from "./db";
import { addEvidence, ensureEvidenceTables, getEvidenceFile, MAX_FILE_BYTES, removeEvidence } from "./evidence";
import { agreementsCsv, auditPdf, eventsCsv } from "./exports";
import { databaseStatus, ledgerStatus } from "./integrations";
import { LedgerError, isLedgerConfigured, syncLedgerIdentity } from "./ledger";
import { serveStatic, staticEnabled } from "./static";
import { HttpError } from "./validate";
import { commitAgreement, transition, verifyAgreement, type Action } from "./workflow";

const PORT = Number(process.env.API_PORT || 3001);
const MAX_BODY_BYTES = 16 * 1024;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function file(body: string | Uint8Array, type: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "Request body exceeds 16 KB.");
  if (!raw.trim()) throw new HttpError(400, "Request body is empty.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new HttpError(400, "Request body must be a JSON object.");
  return data as Record<string, unknown>;
}

// Behind a reverse proxy that overwrites X-Forwarded-For, set TRUST_PROXY=1 so
// limits apply per visitor. Without it the header is ignored (it can be forged).
function clientKey(req: Request, ip: string): string {
  if (process.env.TRUST_PROXY === "1") return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ip;
  return ip;
}

async function status() {
  if (isLedgerConfigured()) await syncLedgerIdentity().catch(() => undefined);
  const [database, ledger] = await Promise.all([databaseStatus(), ledgerStatus()]);
  return {
    api: { status: "connected", detail: "CantonFlow AI API is running." },
    database,
    ledger,
    ai: await aiStatus(),
    timestamp: new Date().toISOString(),
  };
}

const ID = "([A-Za-z0-9-]{1,40})";

async function route(req: Request, pathname: string, ip: string): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  // ---- public ----
  if (method === "GET" && pathname === "/health") {
    const database = await databaseStatus();
    return json({ ok: database.status === "connected", database: database.status }, database.status === "connected" ? 200 : 503);
  }
  if (method === "POST" && pathname === "/auth/nonce") {
    rateLimit(`nonce:${clientKey(req, ip)}`, 20, 60_000);
    return json(await createNonce((await readBody(req)).address));
  }
  if (method === "POST" && pathname === "/auth/verify") {
    rateLimit(`verify:${clientKey(req, ip)}`, 20, 60_000);
    const body = await readBody(req);
    const session = await verifySignIn(body.address, body.signature);
    return json({ ...session, organizations: await membershipsOf(session.address) });
  }

  // ---- everything below needs a signed-in wallet ----
  const address = await authenticate(req);
  const limit = (name: string, max: number, windowMs = 60_000) => rateLimit(`${name}:${address}`, max, windowMs);

  if (method === "POST" && pathname === "/auth/logout") {
    await signOut(req);
    return json({ ok: true });
  }
  if (method === "GET" && pathname === "/me") return json({ address, organizations: await membershipsOf(address) });
  if (method === "GET" && pathname === "/status") return json(await status());
  if (method === "GET" && pathname === "/metrics") return json(await metrics(address));
  if (method === "GET" && pathname === "/metrics/timeline") return json(await timeline(address, Number(url.searchParams.get("days") ?? 30)));
  if (method === "GET" && pathname === "/inbox") return json(await inbox(address));
  if (method === "GET" && pathname === "/activity") return json({ items: await activity(address, Number(url.searchParams.get("limit") ?? 30) || 30) });
  if (method === "GET" && pathname === "/export/agreements.csv") {
    limit("export", 20);
    return file(await agreementsCsv(address, url.searchParams), "text/csv; charset=utf-8", "cantonflow-agreements.csv");
  }

  if (method === "POST" && pathname === "/organizations") {
    limit("org", 10, 3_600_000);
    return json({ organization: await createOrganization(address, (await readBody(req)).name) }, 201);
  }
  const members = /^\/organizations\/([^/]{1,120})\/members(?:\/(0x[0-9a-fA-F]{40}))?$/.exec(pathname);
  if (members) {
    const key = decodeURIComponent(members[1]);
    if (method === "GET" && !members[2]) return json({ members: await listMembers(address, key) });
    if (method === "POST" && !members[2]) {
      await addMember(address, key, (await readBody(req)).address);
      return json({ members: await listMembers(address, key) }, 201);
    }
    if (method === "DELETE" && members[2]) {
      await removeMember(address, key, members[2]);
      return json({ ok: true });
    }
  }

  if (method === "GET" && pathname === "/agreements") return json(await listAgreements(address, url));
  if (method === "POST" && pathname === "/agreements") {
    limit("create", 30);
    return json({ agreement: await createAgreement(address, await readBody(req)) }, 201);
  }

  const one = new RegExp(`^/agreements/${ID}$`).exec(pathname);
  if (method === "GET" && one) return json(await getAgreement(address, one[1]));
  if (method === "PATCH" && one) {
    limit("act", 60);
    return json({ agreement: await editAgreement(address, one[1], await readBody(req)) });
  }

  const invite = new RegExp(`^/agreements/${ID}/invite$`).exec(pathname);
  if (method === "POST" && invite) {
    limit("invite", 10);
    return json(await createInvite(address, invite[1]), 201);
  }

  const cancel = new RegExp(`^/agreements/${ID}/cancel$`).exec(pathname);
  if (method === "POST" && cancel) {
    limit("act", 60);
    return json({ agreement: await cancelAgreement(address, cancel[1]) });
  }

  const eventsFile = new RegExp(`^/agreements/${ID}/events\\.csv$`).exec(pathname);
  if (method === "GET" && eventsFile) {
    limit("export", 20);
    return file(await eventsCsv(address, eventsFile[1]), "text/csv; charset=utf-8", `${eventsFile[1]}-history.csv`);
  }

  const pdfFile = new RegExp(`^/agreements/${ID}/audit\\.pdf$`).exec(pathname);
  if (method === "GET" && pdfFile) {
    limit("export", 20);
    return file(await auditPdf(address, pdfFile[1]), "application/pdf", `${pdfFile[1]}-audit-report.pdf`);
  }

  if (method === "POST" && pathname === "/invites/preview") {
    limit("invite-read", 30);
    return json(await previewInvite(address, ((await readBody(req)) as { token?: unknown } | null)?.token));
  }
  if (method === "POST" && pathname === "/invites/accept") {
    limit("invite-accept", 10);
    return json(await acceptInvite(address, ((await readBody(req)) as { token?: unknown } | null)?.token));
  }

  const evidenceUpload = new RegExp(`^/agreements/${ID}/evidence$`).exec(pathname);
  if (method === "POST" && evidenceUpload) {
    limit("upload", 20);
    return json({ evidence: await addEvidence(address, evidenceUpload[1], req, url.searchParams.get("filename")) }, 201);
  }

  const evidenceOne = /^\/evidence\/([0-9]{1,18})$/.exec(pathname);
  if (method === "GET" && evidenceOne) {
    limit("download", 60);
    const f = await getEvidenceFile(address, evidenceOne[1]);
    const ascii = f.filename.replace(/[^\x20-\x7e]/g, "_");
    return new Response(f.bytes, {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }
  if (method === "DELETE" && evidenceOne) {
    limit("upload", 20);
    await removeEvidence(address, evidenceOne[1]);
    return json({ ok: true });
  }

  const review = new RegExp(`^/agreements/${ID}/review$`).exec(pathname);
  if (method === "POST" && review) {
    limit("review", 6);
    return json({ review: await reviewAgreement(address, review[1], req) }, 201);
  }

  const act = new RegExp(`^/agreements/${ID}/(commit|approve|reject|confirm|verify)$`).exec(pathname);
  if (method === "POST" && act) {
    const [, id, verb] = act;
    limit("act", verb === "verify" ? 30 : 60);
    if (verb === "commit") return json({ agreement: await commitAgreement(id, address) });
    if (verb === "verify") return json(await verifyAgreement(id, address));
    return json({ agreement: await transition(id, verb as Action, address) });
  }

  throw new HttpError(404, "Route not found.");
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    const res = json({ error: error.message }, error.status);
    if (error.status === 429) res.headers.set("Retry-After", "60");
    return res;
  }
  if (error instanceof LedgerError) {
    const code = { unconfigured: 503, unreachable: 503, rejected: 409, failed: 502 }[error.kind];
    const prefix = error.kind === "rejected" ? "The ledger rejected the command: " : "";
    return json({ error: prefix + error.message, ledger: error.kind }, code);
  }
  console.error(error);
  return json({ error: "Unexpected server error." }, 500);
}

const GLOBAL_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 600);

async function handle(req: Request, ip: string): Promise<Response> {
  const { pathname } = new URL(req.url);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  // In production the built app and the API share one port: the API lives under
  // /api and every other path is the app. In development Vite proxies /api and
  // removes the prefix, so unprefixed paths are the API.
  if (!isApi && staticEnabled && (req.method === "GET" || req.method === "HEAD")) return serveStatic(pathname, req.headers.get("accept-encoding"));

  rateLimit(`ip:${clientKey(req, ip)}`, GLOBAL_LIMIT_PER_MIN, 60_000);
  return route(req, isApi ? pathname.slice(4) || "/" : pathname, ip);
}

await migrate();
await ensureAiTables();
await ensureEvidenceTables();

const server = Bun.serve({
  port: PORT,
  // Uploads are the largest request; everything else is far smaller.
  maxRequestBodySize: MAX_FILE_BYTES + 64 * 1024,
  hostname: process.env.HOST || "127.0.0.1",
  async fetch(req, srv) {
    const start = performance.now();
    const { pathname } = new URL(req.url);
    let res: Response;
    try {
      res = await handle(req, srv.requestIP(req)?.address ?? "unknown");
    } catch (error) {
      res = errorResponse(error);
    }
    if (!pathname.endsWith("/health")) {
      // Method, path and outcome only: no query string, headers or body.
      console.log(`${new Date().toISOString()} ${req.method} ${pathname} ${res.status} ${Math.round(performance.now() - start)}ms`);
    }
    return res;
  },
});

// Expired sessions, sign-in nonces and rate-limit counters are cleared regularly.
const janitor = setInterval(() => {
  pruneRateLimits();
  deleteExpiredAuth().catch((error: unknown) => console.error("Cleanup failed:", error));
}, 10 * 60_000);

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down.`);
  clearInterval(janitor);
  await server.stop();
  await sql.close().catch(() => undefined);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log(`CantonFlow AI listening on http://${server.hostname}:${server.port}${staticEnabled ? " (serving the built app)" : ""}`);
