import type { TransactionSQL } from "bun";
import { listReviews, runReview, type Review } from "./ai";
import { membershipsOf, type Roles } from "./auth";
import { isExpired, orgKey, sql, withTx, todayUtc, toAgreement, toEvent, type Agreement, type AgreementEvent, type Db } from "./db";
import { listEvidence, loadForReview, type EvidenceMeta } from "./evidence";
import type { ItemInput } from "./money";
import { HttpError, parseAmount, parseCurrency, parseDeadline, parseItems, parseListQuery, parseNewAgreement, parseTerms, parseText, totalOfItems } from "./validate";
import { participantRoles, verifyAgreement, type Verification } from "./workflow";

// Every read and write here is scoped to the signed-in wallet's organizations.
// An agreement is visible only to members of its buyer or seller organization.

async function visibleKeys(address: string): Promise<string[]> {
  return (await membershipsOf(address)).map((m) => m.key);
}

export async function listAgreements(address: string, url: URL) {
  const { search, status, limit, offset } = parseListQuery(url.searchParams);
  const keys = await visibleKeys(address);
  if (keys.length === 0) return { agreements: [] as Agreement[], total: 0 };
  const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;
  const statusParam = status && status !== "Expired" ? status : null;
  const expiredOnly = status === "Expired";
  const today = todayUtc();

  const rows = await sql`
    SELECT * FROM agreements
    WHERE (buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)})
      AND (${pattern}::text IS NULL
        OR title ILIKE ${pattern} OR buyer ILIKE ${pattern}
        OR seller ILIKE ${pattern} OR id ILIKE ${pattern})
      AND (${statusParam}::text IS NULL OR status = ${statusParam})
      AND (${expiredOnly}::boolean IS NOT TRUE OR (status IN ('Awaiting approval', 'Approved') AND deadline < ${today}))
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const [count] = await sql`
    SELECT count(*)::int AS total FROM agreements
    WHERE (buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)})
      AND (${pattern}::text IS NULL
        OR title ILIKE ${pattern} OR buyer ILIKE ${pattern}
        OR seller ILIKE ${pattern} OR id ILIKE ${pattern})
      AND (${statusParam}::text IS NULL OR status = ${statusParam})
      AND (${expiredOnly}::boolean IS NOT TRUE OR (status IN ('Awaiting approval', 'Approved') AND deadline < ${today}))
  `;
  return { agreements: rows.map(toAgreement), total: Number(count.total) };
}

type Tx = TransactionSQL;

async function replaceItems(tx: Tx, agreementId: string, items: ItemInput[]): Promise<void> {
  await tx`DELETE FROM agreement_items WHERE agreement_id = ${agreementId}`;
  for (const [index, item] of items.entries()) {
    await tx`
      INSERT INTO agreement_items (agreement_id, position, description, quantity, unit_price)
      VALUES (${agreementId}, ${index + 1}, ${item.description}, ${item.quantity}, ${item.unitPrice})
    `;
  }
}

export interface ItemView {
  position: number;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export async function itemsOf(agreementId: string): Promise<ItemView[]> {
  const rows = await sql`SELECT position, description, quantity, unit_price, line_total FROM agreement_items WHERE agreement_id = ${agreementId} ORDER BY position`;
  return rows.map((r: { position: number; description: string; quantity: string; unit_price: string; line_total: string }) => ({
    position: r.position,
    description: r.description,
    quantity: String(r.quantity),
    unitPrice: String(r.unit_price),
    lineTotal: String(r.line_total),
  }));
}

async function registeredName(key: string, db: Db = sql): Promise<string | null> {
  const [row] = await db`SELECT name FROM organizations WHERE key = ${key}`;
  return (row?.name as string | undefined) ?? null;
}

export async function createAgreement(address: string, body: unknown): Promise<Agreement> {
  const input = parseNewAgreement(body);
  const [buyerKey, sellerKey] = [orgKey(input.buyer), orgKey(input.seller)];

  const mine = await membershipsOf(address);
  const buyerOrg = mine.find((m) => m.key === buyerKey);
  const sellerOrg = mine.find((m) => m.key === sellerKey);
  if (!buyerOrg && !sellerOrg) {
    throw new HttpError(403, "You can only create an agreement for an organization you belong to as the buyer or the seller.");
  }
  if (buyerOrg && sellerOrg) throw new HttpError(400, "Your wallet belongs to both organizations. A wallet cannot be on both sides of an agreement.");

  // Use the registered spelling for both sides so names stay consistent.
  const buyer = buyerOrg?.name ?? (await registeredName(buyerKey)) ?? input.buyer;
  const seller = sellerOrg?.name ?? (await registeredName(sellerKey)) ?? input.seller;
  const creatorKey = buyerOrg ? buyerKey : sellerKey;
  const id = `CF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const actor = buyerOrg?.name ?? sellerOrg?.name ?? null;
  return withTx(async (tx) => {
    const [row] = await tx`
      INSERT INTO agreements (id, title, buyer, seller, buyer_key, seller_key, amount, currency, created_by, creator_key, terms, deadline)
      VALUES (${id}, ${input.title}, ${buyer}, ${seller}, ${buyerKey}, ${sellerKey}, ${input.amount}, ${input.currency}, ${address}, ${creatorKey}, ${input.terms}, ${input.deadline})
      RETURNING *
    `;
    await replaceItems(tx, id, input.items);
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, actor_address)
      VALUES (${id}, 'created', ${actor}, 'Agreement record created.', ${address})
    `;
    return toAgreement(row);
  });
}

export interface Permissions {
  role: "buyer" | "seller";
  canCommit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canConfirm: boolean;
  canReview: boolean;
  canVerify: boolean;
  canEdit: boolean;
  canCancel: boolean;
}

export interface AgreementDetail {
  agreement: Agreement;
  events: AgreementEvent[];
  reviews: Review[];
  evidence: EvidenceMeta[];
  terms: string | null;
  items: ItemView[];
  permissions: Permissions;
  registered: { buyer: boolean; seller: boolean };
}

export async function getAgreement(address: string, id: string): Promise<AgreementDetail> {
  const [row] = await sql`SELECT * FROM agreements WHERE id = ${id}`;
  if (!row) throw new HttpError(404, "Agreement not found.");
  const roles = await participantRoles(address, row);

  const committed = row.ledger_status === "committed";
  const awaiting = row.status === "Awaiting approval";
  const live = !isExpired(row);
  const permissions: Permissions = {
    role: roles.buyer ? "buyer" : "seller",
    canCommit: live && roles.seller && !committed && awaiting,
    canApprove: live && roles.buyer && committed && awaiting,
    canReject: live && roles.buyer && committed && awaiting,
    canConfirm: live && roles.seller && committed && row.status === "Approved",
    canReview: true,
    canVerify: committed,
    canEdit: awaiting && !committed && isCreatorSide(row, roles),
    canCancel: awaiting && !committed && isCreatorSide(row, roles),
  };

  const [orgs] = await sql`
    SELECT
      EXISTS (SELECT 1 FROM organizations WHERE key = ${row.buyer_key}) AS buyer,
      EXISTS (SELECT 1 FROM organizations WHERE key = ${row.seller_key}) AS seller
  `;
  const events = await sql`SELECT * FROM agreement_events WHERE agreement_id = ${id} ORDER BY id`;
  return {
    agreement: toAgreement(row),
    events: events.map(toEvent),
    reviews: await listReviews(id),
    evidence: await listEvidence(id, permissions.role, row.status as string),
    terms: (row.terms as string | null) ?? null,
    items: await itemsOf(id),
    permissions,
    registered: { buyer: Boolean(orgs.buyer), seller: Boolean(orgs.seller) },
  };
}

const MAX_EVIDENCE_CHARS = 8000;
const MAX_REVIEW_FILES = 5;

export async function reviewAgreement(address: string, id: string, req: Request) {
  const raw = (await req.text()).trim();
  let evidence: string | null = null;
  let evidenceIds: string[] = [];
  if (raw) {
    if (raw.length > MAX_EVIDENCE_CHARS + 1024) throw new HttpError(413, "Evidence is too long.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Request body must be valid JSON.");
    }
    const ids = (body as { evidenceIds?: unknown } | null)?.evidenceIds;
    if (ids !== undefined && ids !== null) {
      if (!Array.isArray(ids) || ids.length > MAX_REVIEW_FILES || !ids.every((v) => typeof v === "string" && /^[0-9]{1,18}$/.test(v))) {
        throw new HttpError(400, `Pick up to ${MAX_REVIEW_FILES} files to include.`);
      }
      evidenceIds = [...new Set(ids as string[])];
    }
    const value = (body as { evidence?: unknown } | null)?.evidence;
    if (value !== undefined && value !== null) {
      if (typeof value !== "string") throw new HttpError(400, "Evidence must be text.");
      const trimmed = value.trim();
      if (trimmed.length > MAX_EVIDENCE_CHARS) throw new HttpError(400, `Evidence must be ${MAX_EVIDENCE_CHARS} characters or fewer.`);
      evidence = trimmed || null;
    }
  }

  const { agreement, events, terms, items } = await getAgreement(address, id);
  const files = await loadForReview(id, evidenceIds);

  let ledgerChecks: Verification["checks"] | null = null;
  let ledgerNote = "This agreement is not committed to a ledger, so there is nothing to compare.";
  if (agreement.ledgerStatus === "committed") {
    try {
      ledgerChecks = (await verifyAgreement(id, address)).checks;
    } catch {
      ledgerNote = "The ledger could not be reached, so no comparison was made.";
    }
  }

  return runReview(id, {
    agreement: {
      id: agreement.id,
      title: agreement.title,
      buyer: agreement.buyer,
      seller: agreement.seller,
      amount: agreement.amount,
      currency: agreement.currency,
      status: agreement.status,
      committedToLedger: agreement.ledgerStatus === "committed",
      createdAt: agreement.createdAt,
      deadline: agreement.deadline,
      expired: agreement.expired,
      terms: terms ?? null,
      lineItems: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    },
    history: events.map((e) => ({ kind: e.kind, actor: e.actor, at: e.createdAt })),
    ledgerChecks,
    ledgerNote,
    evidence,
    files,
  });
}

// Every figure is computed from the caller's own stored rows. Totals are kept
// per currency because amounts in different currencies are never added.
export async function metrics(address: string) {
  const keys = await visibleKeys(address);
  const empty = {
    total: 0,
    byStatus: { "Awaiting approval": 0, Approved: 0, Completed: 0, Rejected: 0, Cancelled: 0 },
    expired: 0,
    onLedger: 0,
    valueByCurrency: [] as { currency: string; total: string; count: number }[],
  };
  if (keys.length === 0) return empty;

  const [totals] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'Awaiting approval')::int AS awaiting,
      count(*) FILTER (WHERE status = 'Approved')::int AS approved,
      count(*) FILTER (WHERE status = 'Completed')::int AS completed,
      count(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
      count(*) FILTER (WHERE status = 'Cancelled')::int AS cancelled,
      count(*) FILTER (WHERE ledger_status = 'committed')::int AS "onLedger",
      count(*) FILTER (WHERE status IN ('Awaiting approval', 'Approved') AND deadline < ${todayUtc()})::int AS expired
    FROM agreements WHERE buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)}
  `;
  const value = await sql`
    SELECT currency, sum(amount)::text AS total, count(*)::int AS count
    FROM agreements WHERE buyer_key IN ${sql(keys)} OR seller_key IN ${sql(keys)}
    GROUP BY currency ORDER BY sum(amount) DESC
  `;
  return {
    total: totals.total as number,
    byStatus: {
      "Awaiting approval": totals.awaiting as number,
      Approved: totals.approved as number,
      Completed: totals.completed as number,
      Rejected: totals.rejected as number,
      Cancelled: totals.cancelled as number,
    },
    onLedger: totals.onLedger as number,
    expired: totals.expired as number,
    valueByCurrency: value.map((v: { currency: string; total: string; count: number }) => ({ currency: v.currency, total: v.total, count: v.count })),
  };
}

// Only the organization that created an agreement may change or cancel it, and
// only while it is still a draft: once it is on the ledger it is fixed.
function isCreatorSide(row: { creator_key: string | null; buyer_key: string; seller_key: string }, roles: Roles): boolean {
  const myKey = roles.buyer ? row.buyer_key : row.seller_key;
  return !row.creator_key || row.creator_key === myKey;
}

function assertDraftEditor(row: { status: string; ledger_status: string; creator_key: string | null; buyer_key: string; seller_key: string }, roles: Roles, verb: string) {
  if (row.ledger_status === "committed") throw new HttpError(409, `This agreement is already on the ledger, so it can no longer be ${verb}.`);
  if (row.status !== "Awaiting approval") throw new HttpError(409, `A ${row.status.toLowerCase()} agreement cannot be ${verb}.`);
  if (!isCreatorSide(row, roles)) throw new HttpError(403, `Only the organization that created this agreement can ${verb === "edited" ? "edit" : "cancel"} it.`);
}

export async function editAgreement(address: string, id: string, body: unknown): Promise<Agreement> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, "Request body must be a JSON object.");
  const patch = body as Record<string, unknown>;
  if (!["title", "counterparty", "amount", "currency", "terms", "items", "deadline"].some((k) => patch[k] !== undefined)) throw new HttpError(400, "Nothing to change.");

  return withTx(async (tx) => {
    const [row] = await tx`SELECT * FROM agreements WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new HttpError(404, "Agreement not found.");
    const roles = await participantRoles(address, row, tx);
    assertDraftEditor(row, roles, "edited");

    const changes: string[] = [];
    let title = row.title as string;
    let amount = String(row.amount);
    let currency = row.currency as string;
    let buyer = row.buyer as string;
    let seller = row.seller as string;
    let buyerKey = row.buyer_key as string;
    let sellerKey = row.seller_key as string;

    if (patch.title !== undefined) {
      const next = parseText(patch.title, "Title", 120);
      if (next !== title) changes.push("title");
      title = next;
    }
    let deadline = (row.deadline as string | null) ?? null;
    if (patch.deadline !== undefined) {
      const next = parseDeadline(patch.deadline);
      if (next !== deadline) changes.push(next === null ? "deadline removed" : `deadline ${deadline ?? "none"} to ${next}`);
      deadline = next;
    }
    let terms = (row.terms as string | null) ?? null;
    if (patch.terms !== undefined) {
      const next = parseTerms(patch.terms);
      if (next !== terms) changes.push(next === null ? "terms removed" : "terms");
      terms = next;
    }
    const [{ n: itemCount }] = await tx`SELECT count(*)::int AS n FROM agreement_items WHERE agreement_id = ${id}`;
    let newItems: ItemInput[] | null = null;
    if (patch.items !== undefined) {
      newItems = parseItems(patch.items);
      if (newItems.length > 0) {
        const total = totalOfItems(newItems);
        if (Number(total) !== Number(amount)) changes.push(`amount ${amount} to ${total}`);
        amount = total;
        changes.push(`line items (${newItems.length})`);
      } else if (Number(itemCount) > 0) {
        changes.push("line items removed");
      }
    }
    const hasItemsAfter = newItems ? newItems.length > 0 : Number(itemCount) > 0;
    if (patch.amount !== undefined && hasItemsAfter) {
      throw new HttpError(400, "The amount comes from the line items. Change the line items instead.");
    }
    if (patch.amount !== undefined) {
      const next = parseAmount(patch.amount);
      if (Number(next) !== Number(amount)) changes.push(`amount ${amount} to ${Number(next).toFixed(2)}`);
      amount = next;
    }
    if (patch.currency !== undefined) {
      const next = parseCurrency(patch.currency);
      if (next !== currency) changes.push(`currency ${currency} to ${next}`);
      currency = next;
    }
    if (patch.counterparty !== undefined) {
      const typed = parseText(patch.counterparty, "Counterparty", 100);
      const key = orgKey(typed);
      const mine = roles.buyer ? buyerKey : sellerKey;
      if (key === mine) throw new HttpError(400, "Buyer and seller must be different parties.");
      const name = (await registeredName(key, tx)) ?? typed;
      const current = roles.buyer ? seller : buyer;
      if (orgKey(current) !== key || current !== name) changes.push(`${roles.buyer ? "seller" : "buyer"} ${current} to ${name}`);
      if (roles.buyer) [seller, sellerKey] = [name, key];
      else [buyer, buyerKey] = [name, key];
    }

    if (changes.length === 0) throw new HttpError(400, "Nothing to change.");

    const [updated] = await tx`
      UPDATE agreements
      SET title = ${title}, amount = ${amount}, currency = ${currency}, terms = ${terms}, deadline = ${deadline},
          buyer = ${buyer}, seller = ${seller}, buyer_key = ${buyerKey}, seller_key = ${sellerKey}, updated_at = now()
      WHERE id = ${id} RETURNING *
    `;
    if (newItems) await replaceItems(tx, id, newItems);
    const actor = roles.buyer ? buyer : seller;
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, actor_address)
      VALUES (${id}, 'edited', ${actor}, ${`Changed: ${changes.join("; ")}.`.slice(0, 400)}, ${address})
    `;
    return toAgreement(updated);
  });
}

export async function cancelAgreement(address: string, id: string): Promise<Agreement> {
  return withTx(async (tx) => {
    const [row] = await tx`SELECT * FROM agreements WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new HttpError(404, "Agreement not found.");
    const roles = await participantRoles(address, row, tx);
    assertDraftEditor(row, roles, "cancelled");

    const [updated] = await tx`UPDATE agreements SET status = 'Cancelled', updated_at = now() WHERE id = ${id} RETURNING *`;
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, actor_address)
      VALUES (${id}, 'cancelled', ${roles.buyer ? row.buyer : row.seller}, 'Cancelled before it was committed to the ledger.', ${address})
    `;
    return toAgreement(updated);
  });
}

export interface TimelinePoint {
  date: string;
  created: number;
  completed: number;
}

// Agreements created and completed per day (UTC), counted from the history of
// the caller's own agreements. Days with nothing are included as zeros.
export async function timeline(address: string, daysRaw: number): Promise<{ days: number; points: TimelinePoint[] }> {
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const keys = await visibleKeys(address);
  const to = todayUtc();
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = fromDate.toISOString().slice(0, 10);

  if (keys.length === 0) {
    const empty: TimelinePoint[] = [];
    for (let d = new Date(fromDate); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      empty.push({ date: d.toISOString().slice(0, 10), created: 0, completed: 0 });
    }
    return { days, points: empty };
  }

  const rows = await sql`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS d
    ), ev AS (
      SELECT (e.created_at AT TIME ZONE 'UTC')::date AS d, e.kind
      FROM agreement_events e JOIN agreements a ON a.id = e.agreement_id
      WHERE (a.buyer_key IN ${sql(keys)} OR a.seller_key IN ${sql(keys)})
        AND e.kind IN ('created', 'confirmed')
        AND (e.created_at AT TIME ZONE 'UTC')::date >= ${from}::date
    )
    SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
           count(ev.kind) FILTER (WHERE ev.kind = 'created')::int AS created,
           count(ev.kind) FILTER (WHERE ev.kind = 'confirmed')::int AS completed
    FROM days LEFT JOIN ev ON ev.d = days.d
    GROUP BY days.d ORDER BY days.d
  `;
  return { days, points: rows.map((r: { date: string; created: number; completed: number }) => ({ date: r.date, created: Number(r.created), completed: Number(r.completed) })) };
}
