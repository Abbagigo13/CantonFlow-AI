# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

CantonFlow AI: tracks private trade agreements. Imported from github.com/Abbagigo13/CantonFlow-AI (kept in `CantonFlow-AI/` for reference; the live app is in `src/`).

Rules from the user: nothing mocked. No demo records. Anything not connected (Canton ledger, AI) must show as not connected, never as success.

Design direction (accepted): Swiss/Minimalism structure, Flat 2.0 depth, restrained glass on key surfaces only. Deep navy canvas, one pale-blue accent, Space Grotesk / DM Sans / JetBrains Mono, lucide icons, mobile-first with bottom tabs.

Backend (Milestone 1 done): `server/` is a Bun API on port 3001 (`bun run server`), proxied by Vite at `/api`. PostgreSQL runs in Docker container `cantonflow-pg` (named volume `cantonflow_pgdata`), `DATABASE_URL` in `.env`. Routes: GET /health, /status, /metrics, /agreements, /agreements/:id; POST /agreements.

Milestones 2 and 3 done. M2: landing page (Docs, FAQs), agreement detail sheet. M3: Daml project in `daml/` (contract with status enum; tests in `daml/tests`, run `bun run daml:test`). JDK 17 at `~/jdk`, Daml SDK 3.6.3 via `dpm` (`~/.dpm`). Local Canton sandbox: `bun run ledger` (JSON API :6864, in-memory state), `LEDGER_API_URL` in `.env`. Backend: `server/ledger.ts` (JSON Ledger API v2 client; uses `update-by-id` and ACS `eventFormat` because the older endpoints are disabled in 3.6), `server/workflow.ts` (commit, approve, reject, confirm, verify; row-locked, DB updated only from the ledger's own response). Parties are allocated per buyer/seller name and cached in `parties`. A new participant id means the sandbox was reset: committed agreements revert to not-committed with a `ledger_reset` event. Routes added: POST /agreements/:id/(commit|approve|reject|confirm|verify); GET /agreements/:id also returns `events`. No sign-in yet: anyone can act as buyer or seller. If the sandbox or API is down after a sandbox restart, start with `bun run db:up`, `bun run ledger`, `bun run server`. M4 done: `server/ai.ts` calls an OpenAI-compatible API (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`; user chose Meta Muse `muse-spark-1.3`, the Qwen key expires 2026-12-10). Model is a reasoning model: token limit must leave room for reasoning (status test uses 1000, review 4000). AI status is Connected only after a real test call (cached 5 min). Reviews stored in `ai_reviews`, JSON validated server-side, evidence treated as untrusted, review never writes status/approvals. Route: POST /agreements/:id/review {evidence?}; GET /agreements/:id returns `reviews`. NOTE: saving `.env` from the Code panel once truncated the last character of `LEDGER_API_URL`; check values after the user edits it. M5 done (sign-in and roles): wallet-signature sign-in (`server/auth.ts`): server-written message with one-time nonce, viem `verifyMessage`, session token stored hashed (7 days), sent as `Authorization: Bearer` from localStorage (`cantonflow.session`). EOAs only (no ERC-1271 contract wallets). Organizations = buyer/seller names (key = lowercase, collapsed spaces); first to claim a name owns it; owners add members by wallet address. Everything except /health and /auth/* needs a session. Agreements are visible only to members of the buyer or seller org (404 otherwise); commit = seller org, approve/reject = buyer org, confirm = seller org; a wallet in both orgs is blocked; `GET /agreements/:id` returns `permissions` and `registered`. Events store `actor_address`. `bun run test:api` runs 38 end-to-end checks with throwaway wallets and cleans up after itself. Routes: POST /auth/nonce, /auth/verify, /auth/logout, GET /me, POST /organizations, GET|POST /organizations/:key/members, DELETE /organizations/:key/members/:address. Frontend: `AuthGate` (sign in, create organization), `session.tsx`, Team page, Create sheet picks org, role and counterparty. Name squatting is possible (no verification of who owns a name). M8 done: `server/activity.ts` (inbox = actionNeeded + waiting, derived from state, plus activity feed), `server/exports.ts` + `server/csv.ts` (agreements CSV with formula neutralizing, history CSV, PDF audit report via pdf-lib with live ledger check; non-Latin text prints as `?`), `created` events now recorded. Frontend: `useInboxAlerts` (tab title count, toast on new items, nav badge on Overview), `InboxPanel`, `ActivityFeed`, `DownloadButton` (authenticated downloads via fetch + blob). Alerts are in-app only (no email/push).
M9 done: persistent ledger. `bun run ledger` runs the Canton daemon directly (`ledger/canton.conf`, `ledger/bootstrap.canton`, DBs canton_participant, canton_sequencer, canton_sequencer_blocks, canton_mediator in the same Postgres container). The built-in `sandbox` command cannot take a bootstrap script, which is why it is not used. The reference sequencer needs its own DB (sharing one breaks Flyway). Verified: participant id, contracts and approvals survive a restart. `-- --memory` gives a throwaway sandbox. Also: per-IP and per-wallet rate limits, request log lines (method, path, status, ms only), 10-minute cleanup job, graceful shutdown, production mode (`bun run build`, `bun run start`: API under `/api`, app and CSP served from `dist`), `scripts/backup-db.sh` / `restore-db.sh` (RESTORE_SUFFIX for dry runs), 43 unit tests (`bun run test`) plus 55+ API checks (`bun run test:api`).
Process tips: when restarting the API or ledger, kill the old process in one command and start the new one in a LATER command (a kill pattern in the same batch can kill the new process). The CSP and the production build were checked with curl, not in a browser.
M7 done (evidence files): `server/evidence.ts`. Raw-body upload to `POST /agreements/:id/evidence?filename=` (no multipart), type decided from magic bytes (PDF, PNG, JPEG, WebP only), 5 MB per file, 10 files and 25 MB per agreement, SHA-256 per file, files stored as bytea in `evidence_files` (included in backups), PDF text extracted at upload with `unpdf` (15 s timeout, 30 pages max) and kept in `extracted_text`; a PDF with under 20 characters of text is "unreadable" and cannot go to the AI (scans must be uploaded as images). Either side adds files; only the adding side removes them; no changes once Completed or Rejected; events `evidence_added`/`evidence_removed`. Downloads are attachments with nosniff and a sandbox CSP. Review: `POST /agreements/:id/review {evidence?, evidenceIds?}` (max 5 files): images go to the model as `image_url` data URLs (verified with Meta Muse), PDF text as `<document>` blocks; results gain a `comparison` table and the reviewed file names and hashes (`ai_reviews.evidence_refs`); a provider 400 with images attached is reported as an image problem. The audit PDF lists evidence files with SHA-256. Review takes about 20 to 45 seconds. Upload rate limit 20 per minute per wallet; request size cap is 5 MB plus headroom (Bun `maxRequestBodySize`). E2E now has 87 checks, unit tests 50.
Small features (done, in this order): (1) edit/cancel before commit: only the creating org (`agreements.creator_key`), status `Cancelled`, events `edited`/`cancelled`, `PATCH /agreements/:id`, `POST /agreements/:id/cancel`; changing the counterparty moves access to the new org. (2) Terms and line items: `agreements.terms`, table `agreement_items` (line_total is a generated column, round half up); with items the amount is their exact sum (`server/money.ts`, BigInt cents; client preview in `src/lib/money.ts`); items and terms go to the AI review and the audit PDF. (3) Deadlines: `agreements.deadline` as YYYY-MM-DD text (UTC), `expired` is derived (open status and today after the deadline), blocks commit/approve/reject/confirm, creator can extend while draft; inbox has an `expired` list; list filter `status=Expired`. The deadline is an app rule, NOT enforced on the ledger (the Daml contract is unchanged). (4) Invites: table `invites` (token hash, one-time, 14 days, a new link revokes older ones); link carries the token in the `#fragment` via `buildShareLink('/invite')`; `/invite` page uses `AuthGate requireOrg={false}`; accepting registers the invited org under the exact agreement name if it does not exist yet, otherwise grants nothing; event `invite_accepted`. (5) `GET /metrics/timeline?days=7|30|90` and `ActivityChart` (SVG, no library). (6) Themes: Tailwind colors are CSS variables (`--c-*` in `src/index.css`, `data-theme` on `<html>`), `src/lib/theme.tsx` (system/light/dark, also sets ConnectKit mode), use `bg-tint/5` not `bg-white/5` and `text-onaccent` on accent backgrounds; compact density is stored in `cantonflow.density`. Contrast of the light palette was computed (all text pairs at least 4.5), but neither theme has been looked at in a browser.
Settlement was deliberately skipped (user decision): no money moves, amounts are records only. Options discussed if it returns: a test-token holding on the local ledger, Arc Testnet USDC, or real USDCx on Canton TestNet (needs a validator node and onboarded parties).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Concurrency and bundles (latest)
- Inside `withTx(...)` (server/db.ts) every query must use `tx`, never the shared `sql`: a nested pool query deadlocks the API when all connections are held by transactions. `participantRoles`, `rolesFor`, `membershipsOf` take an optional connection for this. `withTx` caps simultaneous transactions at pool size minus 4 (`DB_POOL_MAX`, default 20).
- `ensureParty` is single-flight per name and retries the party lookup after a conflict.
- The landing page is a separate small chunk. `src/Workspace.tsx` holds the wallet, data and app code and is loaded only when leaving `/`. Wagmi, viem and ConnectKit sit in the `vendor-web3` chunk (vite.config.ts `manualChunks`; Vite's preload helper is pinned to `vendor-react` so the landing page does not pull the wallet libraries). The production server gzips text files in memory.
- Responsive checks and bundle measurements ran in a headless browser through Docker (`mcr.microsoft.com/playwright:v1.65.1-noble`, `--network host`) with a session token in localStorage key `cantonflow.session`. Details: docs/load-test.md for the load test.
