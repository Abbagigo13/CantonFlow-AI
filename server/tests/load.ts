// Load test: `bun run test:load`.
//
// Start a separate API with the limits off, on its own port, then run this:
//   RATE_LIMIT_DISABLED=1 API_PORT=3003 bun run server/index.ts
//   bun run test:load
// It fills the database with LOAD_SEED fake agreements (ids start with "LT-"), measures read speed on
// that large set, runs many users at once, creates and commits agreements in parallel on the real
// ledger, checks that two people acting on the same agreement at once cannot both win, and deletes
// everything it created. It does not call the AI.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { orgKey, sql } from "../db";

const API = process.env.LOAD_API ?? "http://127.0.0.1:3003";
const SEED = Number(process.env.LOAD_SEED ?? 20000);
const VUS = Number(process.env.LOAD_VUS ?? 40);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 15);
const COMMITS = Number(process.env.LOAD_COMMITS ?? 30);
const run = Date.now().toString(36);
const ORGS = 10;

// p95 limits in milliseconds. Override with LOAD_LIMIT_<NAME> for slower machines.
const LIMITS: Record<string, number> = { list: 400, search: 600, filter: 400, metrics: 400, timeline: 400, inbox: 400, activity: 400, detail: 300, export: 3000, create: 600, commit: 5000, approve: 5000 };

interface Sample {
  name: string;
  ms: number;
  status: number;
  note?: string;
}
const samples: Sample[] = [];
let networkErrors = 0;

interface Wallet {
  address: string;
  token: string;
  org: string;
}

async function call(name: string, token: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const start = performance.now();
  try {
    const res = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (res.headers.get("content-type")?.includes("json")) data = JSON.parse(text) as Record<string, unknown>;
    samples.push({ name, ms: performance.now() - start, status: res.status, note: res.ok ? undefined : String(data.error ?? "").slice(0, 160) });
    return { status: res.status, data };
  } catch {
    networkErrors += 1;
    return { status: 0, data: {} };
  }
}

async function plain(method: string, path: string, body?: unknown, token?: string): Promise<Record<string, unknown>> {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function signIn(org: string): Promise<Wallet> {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = (await plain("POST", "/auth/nonce", { address: account.address })) as { message: string };
  const signature = await account.signMessage({ message: nonce.message });
  const { token } = (await plain("POST", "/auth/verify", { address: account.address, signature })) as { token: string };
  const created = await fetch(API + "/organizations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: org }) });
  if (!created.ok) throw new Error(`Could not create ${org}: ${created.status}`);
  return { address: account.address.toLowerCase(), token, org };
}

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

async function pool(count: number, worker: (index: number) => Promise<void>, size: number): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < count) {
        const i = next++;
        await worker(i);
      }
    }),
  );
}

async function cleanup(wallets: Wallet[]): Promise<void> {
  const addresses = wallets.map((w) => w.address);
  const keys = wallets.map((w) => orgKey(w.org));
  await sql`DELETE FROM agreements WHERE id LIKE 'LT-%' OR created_by IN ${sql(addresses)} OR buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)}`;
  await sql`DELETE FROM organizations WHERE key IN ${sql(keys)}`;
  await sql`DELETE FROM sessions WHERE address IN ${sql(addresses)}`;
}

async function main(): Promise<void> {
  const health = await fetch(API + "/health").then((r) => r.json()).catch(() => null);
  if (!health) throw new Error(`No API at ${API}. Start one with: RATE_LIMIT_DISABLED=1 API_PORT=3003 bun run server/index.ts`);
  const [{ count: before }] = (await sql`SELECT count(*)::int AS count FROM agreements`) as { count: number }[];
  if (before > 0 && process.env.LOAD_ALLOW_NONEMPTY !== "1") throw new Error(`The database already has ${before} agreements. Use an empty database, or set LOAD_ALLOW_NONEMPTY=1 (only fake rows with ids starting LT- are deleted).`);

  console.log(`Setting up ${ORGS * 2} wallets and organizations...`);
  const buyers: Wallet[] = [];
  const sellers: Wallet[] = [];
  for (let i = 0; i < ORGS; i++) {
    buyers.push(await signIn(`LT Buyer ${i} ${run}`));
    sellers.push(await signIn(`LT Seller ${i} ${run}`));
  }
  const all = [...buyers, ...sellers];

  try {
    // Bulk seed. Organization 0 on the buyer side is a "whale" with about 28% of all rows.
    console.log(`Seeding ${SEED} agreements and their history...`);
    const values = (list: Wallet[]) => list.map((w, i) => `(${i}, '${w.org}', '${orgKey(w.org)}', '${w.address}')`).join(",");
    const t0 = performance.now();
    await sql.unsafe(`
      WITH b(i, n, k, a) AS (VALUES ${values(buyers)}),
           s(i, n, k, a) AS (VALUES ${values(sellers)}),
           gen AS (
             SELECT g, CASE WHEN g % 5 = 0 THEN 0 ELSE g % ${ORGS} END AS bi, (g * 7) % ${ORGS} AS si, random() AS r,
                    now() - (random() * interval '120 days') AS ts
             FROM generate_series(1, ${SEED}) g
           )
      INSERT INTO agreements (id, title, buyer, seller, buyer_key, seller_key, creator_key, created_by, amount, currency, status, ledger_status, created_at, updated_at, deadline)
      SELECT 'LT-' || lpad(g::text, 8, '0'), 'Load test agreement ' || g, b.n, s.n, b.k, s.k, b.k, b.a,
             round((100 + random() * 99900)::numeric, 2), CASE WHEN g % 4 = 0 THEN 'USDC' ELSE 'USD' END,
             CASE WHEN r < 0.35 THEN 'Awaiting approval' WHEN r < 0.55 THEN 'Approved' WHEN r < 0.85 THEN 'Completed' WHEN r < 0.93 THEN 'Rejected' ELSE 'Cancelled' END,
             CASE WHEN r < 0.05 OR r >= 0.93 THEN 'not-submitted' ELSE 'committed' END,
             ts, ts, CASE WHEN g % 3 = 0 THEN to_char(ts + interval '60 days', 'YYYY-MM-DD') END
      FROM gen JOIN b ON b.i = gen.bi JOIN s ON s.i = gen.si
    `);
    await sql.unsafe(`
      INSERT INTO agreement_events (agreement_id, kind, actor, actor_address, created_at)
      SELECT id, 'created', buyer, created_by, created_at FROM agreements WHERE id LIKE 'LT-%'
      UNION ALL SELECT id, 'committed', seller, NULL, created_at + interval '1 hour' FROM agreements WHERE id LIKE 'LT-%' AND ledger_status = 'committed'
      UNION ALL SELECT id, 'approved', buyer, created_by, created_at + interval '2 hours' FROM agreements WHERE id LIKE 'LT-%' AND status IN ('Approved', 'Completed')
      UNION ALL SELECT id, 'confirmed', seller, NULL, created_at + interval '1 day' FROM agreements WHERE id LIKE 'LT-%' AND status = 'Completed'
    `);
    await sql`ANALYZE agreements`;
    await sql`ANALYZE agreement_events`;
    const [{ events }] = (await sql`SELECT count(*)::int AS events FROM agreement_events WHERE agreement_id LIKE 'LT-%'`) as { events: number }[];
    console.log(`Seeded in ${Math.round(performance.now() - t0)} ms (${events} history events).`);

    const whale = buyers[0]!;
    const whaleIds = ((await sql`SELECT id FROM agreements WHERE buyer_key = ${orgKey(whale.org)} AND id LIKE 'LT-%' LIMIT 2000`) as { id: string }[]).map((r) => r.id);
    const whaleCount = ((await sql`SELECT count(*)::int AS c FROM agreements WHERE buyer_key = ${orgKey(whale.org)}`) as { c: number }[])[0]!.c;
    console.log(`The largest organization can see ${whaleCount} agreements.`);

    // Phase A: one request at a time on the big set.
    console.log("\nPhase A: read speed, one request at a time");
    const reads: [string, string][] = [
      ["list", "/agreements"],
      ["search", "/agreements?search=agreement%2012"],
      ["filter", "/agreements?status=Approved"],
      ["filter", "/agreements?status=Expired"],
      ["metrics", "/metrics"],
      ["timeline", "/metrics/timeline?days=90"],
      ["inbox", "/inbox"],
      ["activity", "/activity"],
      ["detail", `/agreements/${whaleIds[0]}`],
    ];
    for (const [name, path] of reads) for (let i = 0; i < 30; i++) await call(name, whale.token, "GET", path);
    for (let i = 0; i < 5; i++) await call("export", whale.token, "GET", "/export/agreements.csv");

    // Phase B: many users at once.
    console.log(`Phase B: ${VUS} users at once for ${SECONDS} s (reads only)`);
    const mix: [string, string][] = [
      ["list", "/agreements"],
      ["list", "/agreements?limit=50&offset=50"],
      ["search", "/agreements?search=load"],
      ["filter", "/agreements?status=Awaiting%20approval"],
      ["metrics", "/metrics"],
      ["timeline", "/metrics/timeline?days=30"],
      ["inbox", "/inbox"],
      ["activity", "/activity"],
      ["detail", "/agreements/DETAIL"],
    ];
    const end = Date.now() + SECONDS * 1000;
    const readStart = performance.now();
    const before = samples.length;
    await Promise.all(
      Array.from({ length: VUS }, async () => {
        while (Date.now() < end) {
          const [name, path] = pick(mix);
          // A detail page only opens for someone on the agreement, so those requests come from the largest organization.
          if (name === "detail") await call(name, whale.token, "GET", path.replace("DETAIL", pick(whaleIds)));
          else await call(name, pick(all).token, "GET", path);
        }
      }),
    );
    const readSeconds = (performance.now() - readStart) / 1000;
    const readCount = samples.length - before;
    console.log(`  ${readCount} requests, ${(readCount / readSeconds).toFixed(0)} per second`);

    // Phase C: writes, including the real ledger.
    console.log("Phase C: creating, committing and approving at once");
    const created: { id: string; buyer: Wallet; seller: Wallet }[] = [];
    await pool(
      COMMITS * 2,
      async (i) => {
        const buyer = buyers[i % ORGS]!;
        const seller = sellers[(i * 3) % ORGS]!;
        const r = await call("create", buyer.token, "POST", "/agreements", { title: `Load create ${i}`, buyer: buyer.org, seller: seller.org, amount: "1234.56", currency: "USD" });
        const id = (r.data.agreement as { id?: string } | undefined)?.id;
        if (r.status === 201 && id) created.push({ id, buyer, seller });
      },
      20,
    );
    const batch = created.slice(0, COMMITS);
    await pool(batch.length, async (i) => void (await call("commit", batch[i]!.seller.token, "POST", `/agreements/${batch[i]!.id}/commit`)), 10);
    await pool(batch.length, async (i) => void (await call("approve", batch[i]!.buyer.token, "POST", `/agreements/${batch[i]!.id}/approve`)), 10);

    // Two people acting on the same agreement at once: exactly one may win.
    const target = created[COMMITS] ?? created[created.length - 1]!;
    const commitRace = await Promise.all(Array.from({ length: 10 }, () => call("race", target.seller.token, "POST", `/agreements/${target.id}/commit`)));
    const commitWins = commitRace.filter((r) => r.status === 200).length;
    const approveRace = await Promise.all(Array.from({ length: 10 }, () => call("race", target.buyer.token, "POST", `/agreements/${target.id}/approve`)));
    const approveWins = approveRace.filter((r) => r.status === 200).length;
    const raceOthers = [...commitRace, ...approveRace].filter((r) => r.status !== 200 && r.status !== 409).length;

    // Phase D: reads and writes together.
    console.log(`Phase D: ${VUS} users at once for ${SECONDS} s (80% reads, 20% creates)`);
    const end2 = Date.now() + SECONDS * 1000;
    await Promise.all(
      Array.from({ length: VUS }, async () => {
        while (Date.now() < end2) {
          const i = Math.floor(Math.random() * ORGS);
          if (Math.random() < 0.2) {
            await call("create", buyers[i]!.token, "POST", "/agreements", { title: "Mixed create", buyer: buyers[i]!.org, seller: sellers[(i * 3) % ORGS]!.org, amount: "99.00", currency: "USD" });
          } else {
            const [name, path] = pick(mix.filter(([, p]) => !p.includes("DETAIL")));
            await call(name, pick(all).token, "GET", path);
          }
        }
      }),
    );

    // Report.
    const names = [...new Set(samples.map((s) => s.name))].filter((n) => n !== "race");
    console.log("\nname        count   p50    p95    p99    max   limit(p95)  result");
    let failed = false;
    for (const name of names) {
      const ok = samples.filter((s) => s.name === name && s.status >= 200 && s.status < 300).map((s) => s.ms);
      const limit = Number(process.env[`LOAD_LIMIT_${name.toUpperCase()}`] ?? LIMITS[name] ?? 1000);
      const p95 = pct(ok, 95);
      const pass = p95 <= limit;
      if (!pass) failed = true;
      console.log(`${name.padEnd(10)} ${String(ok.length).padStart(6)} ${pct(ok, 50).toFixed(0).padStart(5)} ${p95.toFixed(0).padStart(6)} ${pct(ok, 99).toFixed(0).padStart(6)} ${Math.max(...ok).toFixed(0).padStart(6)}   ${String(limit).padStart(6)}      ${pass ? "ok" : "TOO SLOW"}`);
    }
    const bad = samples.filter((s) => s.name !== "race" && (s.status >= 500 || s.status === 429 || s.status === 0));
    const unexpected4xx = samples.filter((s) => s.name !== "race" && s.status >= 400 && s.status < 500 && s.status !== 429);
    console.log(`\nServer errors or rate limits: ${bad.length}. Network errors: ${networkErrors}. Unexpected 4xx: ${unexpected4xx.length}.`);
    const byKind = new Map<string, number>();
    for (const s of [...bad, ...unexpected4xx]) byKind.set(`${s.name} ${s.status} "${s.note ?? ""}"`, (byKind.get(`${s.name} ${s.status} "${s.note ?? ""}"`) ?? 0) + 1);
    if (byKind.size) console.log("  " + [...byKind].map(([k, n]) => `${k} x${n}`).join(", "));
    console.log(`Same-agreement race: commit winners ${commitWins} of 10, approve winners ${approveWins} of 10, other statuses ${raceOthers}.`);
    if (bad.length || networkErrors || unexpected4xx.length) failed = true;
    if (commitWins !== 1 || approveWins !== 1 || raceOthers !== 0) {
      failed = true;
      console.log("RACE CHECK FAILED");
    }
    console.log(failed ? "\nLOAD TEST FAILED" : "\nLoad test passed.");
    process.exitCode = failed ? 1 : 0;
  } finally {
    console.log("Cleaning up...");
    await cleanup(all);
  }
}

await main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.close();
    process.exit(process.exitCode ?? 0);
  });
