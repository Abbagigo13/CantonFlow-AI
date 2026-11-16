# Load test

`bun run test:load` seeds 20,000 agreements and about 54,000 history events across 20 organizations, then measures the API.

How to run it (it refuses to start if the database already holds agreements):

```
RATE_LIMIT_DISABLED=1 API_PORT=3003 bun run server/index.ts   # a second API with the limits off
bun run test:load                                              # LOAD_API, LOAD_SEED, LOAD_VUS and LOAD_SECONDS change the defaults
```

The test deletes everything it created when it finishes.

## What it does

1. Read speed, one request at a time, for the largest organization (4,000 agreements): list, search, status filter, metrics, timeline, inbox, activity, detail, CSV export.
2. 40 simulated users at once for 15 seconds, reads only.
3. Creating 200 agreements at once, committing 30 on the real ledger at once, approving 30, then 10 people committing and approving the same agreement at the same time.
4. 40 users at once for 15 seconds, 80% reads and 20% creating agreements.

It fails on any server error, any network error, any unexpected 4xx, a race with more than one winner, or a 95th percentile over its limit.

## Result of the last run

Environment: the 4 GB workspace, shared with the Canton ledger, PostgreSQL and the dev server. Numbers on a real server will differ.

| Request | Count | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|
| list | 4113 | 53 | 97 | 124 |
| search | 1971 | 56 | 101 | 136 |
| filter | 2058 | 54 | 100 | 134 |
| metrics | 2064 | 56 | 104 | 130 |
| timeline (90 days) | 2113 | 68 | 123 | 159 |
| inbox | 2037 | 53 | 95 | 127 |
| activity | 2056 | 42 | 79 | 108 |
| detail | 1113 | 82 | 149 | 190 |
| create | 1954 | 83 | 136 | 170 |
| commit (real ledger) | 30 | 713 | 1767 | 1798 |
| approve (real ledger) | 30 | 678 | 735 | 736 |

About 650 requests per second for the read-only phase. No server errors, no network errors, no unexpected failures. Ten people acting on the same agreement at once produced exactly one winner for commit and for approve.

## What the first runs found

- The API stopped answering when about 10 transactions ran at once. A transaction asked for a second database connection while every connection was already held by a transaction. Fixed: queries inside a transaction now use that transaction, and the number of simultaneous transactions is capped below the pool size.
- Two commits for the same new organization at once both tried to create its ledger party, and one failed with a conflict. Fixed: requests for the same party now share one attempt, and a conflict is retried by looking the party up again.

## Not covered

The AI review (it costs money per call), file uploads, and the PDF report. The ledger is a local sandbox, so ledger timings say little about the public Canton network.
