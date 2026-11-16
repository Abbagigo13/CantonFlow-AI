# CantonFlow AI

A workspace for private trade agreements between buyers and sellers. People sign in with a wallet signature and work as members of an organization, and each agreement is visible only to its two organizations. Agreements are stored in a database and can be committed to a Canton ledger, where the buyer and seller approve as separate parties. Either side can attach PDF and image evidence, and AI review can compare an agreement with those files, pasted text and its ledger record, as advice only. Agreements can carry terms, line items (the amount is their exact total) and a deadline after which they expire. The creator can edit or cancel an agreement until it is committed, and can send the other side a one-time invite link. Each person sees what needs their action, a live activity feed, and can export agreements as CSV or a PDF audit report. Every service shows live status.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- Bun API server with PostgreSQL
- Daml contracts and tests for Canton (`daml/`), run on a local Canton ledger backed by PostgreSQL
- PDF reports with pdf-lib

## Development

Prerequisites: Bun, Docker, a JDK (17 or newer) and the Daml SDK (`dpm`).

```bash
bun install
docker run -d --name cantonflow-pg --restart unless-stopped \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cantonflow \
  -v cantonflow_pgdata:/var/lib/postgresql -p 5432:5432 postgres:18-alpine
bun run ledger   # local Canton ledger, saved in PostgreSQL (JSON Ledger API on port 6864)
bun run server   # API on port 3001
bun run dev      # app on port 5173, proxies /api to the API
```

Next time, `bun run db:up` restarts the existing database container. The ledger keeps its contracts and parties across restarts. `bun run ledger -- --memory` starts a throwaway ledger instead.

### Production

```bash
bun run build   # builds the app into dist/
bun run start   # serves the app and the API together on API_PORT
```

In production the API is available under `/api` and every other path serves the app. Put it behind HTTPS, and set `TRUST_PROXY=1` only if your proxy overwrites `X-Forwarded-For`.

### Backups

```bash
bun run backup                              # writes backups/<timestamp>/ (app and ledger databases)
bash scripts/restore-db.sh backups/<timestamp>   # replaces current data; stop the API and ledger first
```

### Environment variables

- `DATABASE_URL`: PostgreSQL connection string. Required.
- `API_PORT`: API port. Optional, defaults to 3001.
- `HOST`: address the API listens on. Optional, defaults to `127.0.0.1`. Use `0.0.0.0` in a container.
- `NODE_ENV`: set to `production` (done by `bun run start`) to serve the built app.
- `STATIC_DIR`: folder of the built app. Optional, defaults to `dist`.
- `TRUST_PROXY`: set to `1` behind a reverse proxy that sets `X-Forwarded-For`. Optional.
- `RATE_LIMIT_PER_MIN`: requests per minute per visitor. Optional, defaults to 600.
- `DB_POOL_MAX`: database connections the API may hold. Optional, defaults to 20 (PostgreSQL allows 100 in total).
- `RATE_LIMIT_DISABLED`: set to `1` to switch off every rate limit for a load test. Ignored in production.
- `CANTON_DB_HOST`, `CANTON_DB_PORT`, `CANTON_DB_USER`, `CANTON_DB_PASSWORD`: PostgreSQL used by the local ledger. Optional, default to the local container.
- `LEDGER_API_URL`: Canton JSON Ledger API base URL, for example `http://127.0.0.1:6864`. Optional. Without it the app reports the ledger as not configured and agreements stay database-only.
- `LEDGER_USER_ID`: ledger user the API submits commands as. Optional, defaults to `participant_admin`.
- `AI_BASE_URL`: base URL of an OpenAI-compatible chat completions API, for example `https://api.meta.ai/v1`. Optional. Without it AI review is disabled.
- `AI_MODEL`: model name, for example `muse-spark-1.3`. Optional.
- `AI_API_KEY`: AI provider key, kept on the server only. Optional.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: provisioned by Arc Studio. Optional outside Arc Studio.

### Notes

Signing in needs a browser wallet. Sessions last 7 days and can be ended with Sign out.

Evidence files (PDF, PNG, JPEG, WebP, up to 5 MB each, 10 per agreement) are stored in the database, so backups include them. A PDF must contain text to be reviewed by AI; scans should be uploaded as images. Files included in an AI review are sent to the configured AI provider.

The Overview page includes an activity chart drawn from stored history. The app has light and dark themes (it follows the device by default) and a compact table view on the Agreements page.

Alerts are in the app: a count on the Overview tab, a notice when a new item needs you, and the count in the browser tab title. There are no emails or push notifications.

If the ledger is ever replaced by a fresh one, the app detects it and returns committed agreements to "not committed" so they can be committed again.

### Checks

```bash
bun run check      # lint and typecheck
bun run test       # unit tests
bun run daml:test  # build the contract and run the Daml tests
bun run test:api   # end-to-end API checks (needs the API, database and ledger running)
bun run test:load  # load test with 20,000 agreements (see docs/load-test.md)
```
