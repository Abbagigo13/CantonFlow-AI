import { membershipsOf } from "./auth";
import { isExpired, sql, type EventKind } from "./db";

// "Needs your action" is derived from the stored agreement state and the
// caller's organizations. Nothing is queued or marked read: when the state
// changes, the item disappears by itself.

export type NextAction = "commit" | "approve" | "confirm";

export interface InboxItem {
  agreementId: string;
  title: string;
  counterparty: string;
  amount: string;
  currency: string;
  action: NextAction;
  label: string;
  since: string;
  deadline: string | null;
}

export interface WaitingItem {
  agreementId: string;
  title: string;
  waitingOn: string;
  label: string;
  since: string;
}

export interface ExpiredItem {
  agreementId: string;
  title: string;
  deadline: string;
  committed: boolean;
}

export interface Inbox {
  actionNeeded: InboxItem[];
  waiting: WaitingItem[];
  expired: ExpiredItem[];
}

interface Row {
  id: string;
  title: string;
  buyer: string;
  seller: string;
  buyer_key: string;
  seller_key: string;
  amount: string;
  currency: string;
  status: string;
  ledger_status: string;
  deadline: string | null;
  updated_at: Date | string;
}

export async function inbox(address: string): Promise<Inbox> {
  const keys = (await membershipsOf(address)).map((m) => m.key);
  const result: Inbox = { actionNeeded: [], waiting: [], expired: [] };
  if (keys.length === 0) return result;

  const rows = (await sql`
    SELECT id, title, buyer, seller, buyer_key, seller_key, amount, currency, status, ledger_status, deadline, updated_at
    FROM agreements
    WHERE (buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)}) AND status IN ('Awaiting approval', 'Approved')
    ORDER BY deadline ASC NULLS LAST, updated_at ASC
  `) as Row[];

  for (const r of rows) {
    const isBuyer = keys.includes(r.buyer_key);
    const isSeller = keys.includes(r.seller_key);
    if (isBuyer === isSeller) continue; // a wallet on both sides cannot act
    const committed = r.ledger_status === "committed";
    if (isExpired(r) && r.deadline) {
      result.expired.push({ agreementId: r.id, title: r.title, deadline: r.deadline, committed });
      continue;
    }
    const since = new Date(r.updated_at).toISOString();
    const base = { agreementId: r.id, title: r.title, since };

    let action: NextAction | null = null;
    let waitingOn: string | null = null;
    if (r.status === "Awaiting approval" && !committed) {
      if (isSeller) action = "commit";
      else waitingOn = r.seller;
    } else if (r.status === "Awaiting approval" && committed) {
      if (isBuyer) action = "approve";
      else waitingOn = r.buyer;
    } else if (r.status === "Approved") {
      if (isSeller) action = "confirm";
      else waitingOn = r.seller;
    }

    const LABEL: Record<NextAction, string> = {
      commit: "Commit to the ledger",
      approve: "Approve or reject",
      confirm: "Confirm to complete",
    };
    if (action) {
      result.actionNeeded.push({
        ...base,
        counterparty: isBuyer ? r.seller : r.buyer,
        amount: String(r.amount),
        currency: r.currency,
        action,
        label: LABEL[action],
        deadline: r.deadline,
      });
    } else if (waitingOn) {
      const what = r.status === "Approved" ? "to confirm" : committed ? "to approve or reject" : "to commit";
      result.waiting.push({ ...base, waitingOn, label: `Waiting for ${waitingOn} ${what}` });
    }
  }
  return result;
}

export interface ActivityItem {
  id: string;
  agreementId: string;
  title: string;
  kind: EventKind;
  actor: string | null;
  at: string;
}

export async function activity(address: string, limit = 30): Promise<ActivityItem[]> {
  const keys = (await membershipsOf(address)).map((m) => m.key);
  if (keys.length === 0) return [];
  const capped = Math.min(Math.max(limit, 1), 100);
  const rows = await sql`
    SELECT e.id, e.agreement_id, e.kind, e.actor, e.created_at, a.title
    FROM agreement_events e JOIN agreements a ON a.id = e.agreement_id
    WHERE a.buyer_key IN ${sql(keys)} OR a.seller_key IN ${sql(keys)}
    ORDER BY e.id DESC LIMIT ${capped}
  `;
  return rows.map((r: { id: string | number; agreement_id: string; kind: string; actor: string | null; created_at: Date | string; title: string }) => ({
    id: String(r.id),
    agreementId: r.agreement_id,
    title: r.title,
    kind: r.kind as EventKind,
    actor: r.actor,
    at: new Date(r.created_at).toISOString(),
  }));
}
