import { SQL, type TransactionSQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env and restart the API.");
  process.exit(1);
}

// Connections the API may hold open. Postgres allows 100 in total, and the Canton ledger uses some of them too.
const POOL_MAX = Math.max(8, Number(process.env.DB_POOL_MAX ?? 20));
export const sql = new SQL(url, { max: POOL_MAX });

// Anything that runs inside a transaction must use that transaction (`tx`) for its own queries.
// A query on the shared pool from inside a transaction needs a second connection, and when every
// connection is already held by a transaction waiting for one, the whole API stops answering.
export type Db = SQL | TransactionSQL;

// At most POOL_MAX - 4 transactions run at once, so ordinary reads always find a free connection
// even while many slow ledger calls are in flight. The rest wait their turn here.
const MAX_TX = POOL_MAX - 4;
let activeTx = 0;
const txWaiters: (() => void)[] = [];

export async function withTx<T>(work: (tx: TransactionSQL) => Promise<T>): Promise<T> {
  if (activeTx < MAX_TX) activeTx += 1;
  else await new Promise<void>((resolve) => txWaiters.push(resolve)); // the finishing transaction hands its slot over
  try {
    return (await sql.begin(work)) as T;
  } finally {
    const next = txWaiters.shift();
    if (next) next();
    else activeTx -= 1;
  }
}

export const STATUSES = ["Awaiting approval", "Approved", "Completed", "Rejected", "Cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export const CURRENCIES = ["USD", "USDC", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type LedgerStatus = "not-submitted" | "committed";

export interface Agreement {
  id: string;
  title: string;
  buyer: string;
  seller: string;
  amount: string;
  currency: Currency;
  status: Status;
  ledgerStatus: LedgerStatus;
  ledgerContractId: string | null;
  ledgerOffset: string | null;
  ledgerUpdateId: string | null;
  buyerParty: string | null;
  sellerParty: string | null;
  deadline: string | null;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}

// Organizations are matched by this key, so "Northstar  Trading" and
// "northstar trading" are the same organization.
export function orgKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS agreements (
      id text PRIMARY KEY,
      title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
      buyer text NOT NULL CHECK (char_length(buyer) BETWEEN 1 AND 100),
      seller text NOT NULL CHECK (char_length(seller) BETWEEN 1 AND 100),
      amount numeric(18,2) NOT NULL CHECK (amount > 0),
      currency text NOT NULL DEFAULT 'USD',
      status text NOT NULL DEFAULT 'Awaiting approval',
      ledger_status text NOT NULL DEFAULT 'not-submitted',
      ledger_contract_id text,
      ledger_offset bigint,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (lower(buyer) <> lower(seller))
    )
  `;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS ledger_update_id text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS buyer_party text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS seller_party text`;
  await sql`
    CREATE TABLE IF NOT EXISTS parties (
      name_key text PRIMARY KEY,
      display_name text NOT NULL,
      party_id text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS agreement_events (
      id bigserial PRIMARY KEY,
      agreement_id text NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      kind text NOT NULL,
      actor text,
      detail text,
      ledger_update_id text,
      ledger_offset bigint,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE agreement_events ADD COLUMN IF NOT EXISTS actor_address text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS created_by text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS creator_key text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS terms text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS deadline text CHECK (deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`;
  await sql`
    CREATE TABLE IF NOT EXISTS agreement_items (
      id bigserial PRIMARY KEY,
      agreement_id text NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      position integer NOT NULL,
      description text NOT NULL,
      quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
      unit_price numeric(18,2) NOT NULL CHECK (unit_price > 0),
      line_total numeric(18,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS invites (
      token_hash text PRIMARY KEY,
      agreement_id text NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
      target_key text NOT NULL,
      target_name text NOT NULL,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      used_by text,
      revoked_at timestamptz
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS invites_agreement_idx ON invites (agreement_id)`;
  await sql`CREATE INDEX IF NOT EXISTS agreement_items_agreement_idx ON agreement_items (agreement_id, position)`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS buyer_key text`;
  await sql`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS seller_key text`;
  await sql`UPDATE agreements SET buyer_key = lower(regexp_replace(btrim(buyer), '\s+', ' ', 'g')) WHERE buyer_key IS NULL`;
  await sql`UPDATE agreements SET seller_key = lower(regexp_replace(btrim(seller), '\s+', ' ', 'g')) WHERE seller_key IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS agreements_buyer_key_idx ON agreements (buyer_key)`;
  await sql`CREATE INDEX IF NOT EXISTS agreements_seller_key_idx ON agreements (seller_key)`;
  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      key text PRIMARY KEY,
      name text NOT NULL,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS memberships (
      org_key text NOT NULL REFERENCES organizations(key) ON DELETE CASCADE,
      address text NOT NULL,
      role text NOT NULL CHECK (role IN ('owner', 'member')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (org_key, address)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS memberships_address_idx ON memberships (address)`;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash text PRIMARY KEY,
      address text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS auth_nonces (
      nonce text PRIMARY KEY,
      address text NOT NULL,
      message text NOT NULL,
      expires_at timestamptz NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS agreement_events_agreement_idx ON agreement_events (agreement_id, id)`;
  await sql`CREATE TABLE IF NOT EXISTS ledger_meta (key text PRIMARY KEY, value text NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS agreements_created_idx ON agreements (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS agreements_status_idx ON agreements (status)`;
}

interface Row {
  id: string;
  title: string;
  buyer: string;
  seller: string;
  amount: string;
  currency: string;
  status: string;
  ledger_status: string;
  ledger_contract_id: string | null;
  ledger_offset: string | number | bigint | null;
  ledger_update_id: string | null;
  buyer_party: string | null;
  seller_party: string | null;
  created_by: string | null;
  creator_key: string | null;
  terms: string | null;
  deadline: string | null;
  buyer_key: string;
  seller_key: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export type EventKind = "created" | "committed" | "approved" | "rejected" | "confirmed" | "ledger_reset" | "evidence_added" | "evidence_removed" | "edited" | "cancelled" | "invite_accepted";

export interface AgreementEvent {
  id: string;
  kind: EventKind;
  actor: string | null;
  actorAddress: string | null;
  detail: string | null;
  ledgerUpdateId: string | null;
  ledgerOffset: string | null;
  createdAt: string;
}

export function toEvent(row: {
  id: string | number | bigint;
  kind: string;
  actor: string | null;
  actor_address: string | null;
  detail: string | null;
  ledger_update_id: string | null;
  ledger_offset: string | number | bigint | null;
  created_at: Date | string;
}): AgreementEvent {
  return {
    id: String(row.id),
    kind: row.kind as EventKind,
    actor: row.actor,
    actorAddress: row.actor_address,
    detail: row.detail,
    ledgerUpdateId: row.ledger_update_id,
    ledgerOffset: row.ledger_offset === null ? null : String(row.ledger_offset),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// Deadlines are whole days in UTC, kept as YYYY-MM-DD text so there is no
// time zone to get wrong. An agreement expires the day after its deadline.
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const OPEN_STATUSES = ["Awaiting approval", "Approved"] as const;

export function isExpired(row: { status: string; deadline: string | null }): boolean {
  return row.deadline !== null && todayUtc() > row.deadline && (OPEN_STATUSES as readonly string[]).includes(row.status);
}

export function toAgreement(row: Row): Agreement {
  return {
    id: row.id,
    title: row.title,
    buyer: row.buyer,
    seller: row.seller,
    amount: String(row.amount),
    currency: row.currency as Currency,
    status: row.status as Status,
    ledgerStatus: row.ledger_status as LedgerStatus,
    ledgerContractId: row.ledger_contract_id,
    ledgerOffset: row.ledger_offset === null ? null : String(row.ledger_offset),
    ledgerUpdateId: row.ledger_update_id,
    buyerParty: row.buyer_party,
    sellerParty: row.seller_party,
    deadline: row.deadline ?? null,
    expired: isExpired(row),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
