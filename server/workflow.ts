import { isExpired, sql, withTx, toAgreement, type Agreement, type Db, type EventKind } from "./db";
import {
  activeAgreementContracts,
  createAgreementContract,
  ensureParty,
  exerciseChoice,
  syncLedgerIdentity,
  transactionOffset,
  statusFromLedger,
  type Choice,
  type LedgerResult,
} from "./ledger";
import { rolesFor, type Roles } from "./auth";
import { HttpError } from "./validate";

export type Action = "approve" | "reject" | "confirm";

const ACTIONS: Record<Action, { choice: Choice; actor: "buyer" | "seller"; from: string; kind: EventKind }> = {
  approve: { choice: "ApproveByBuyer", actor: "buyer", from: "Awaiting approval", kind: "approved" },
  reject: { choice: "RejectByBuyer", actor: "buyer", from: "Awaiting approval", kind: "rejected" },
  confirm: { choice: "ConfirmBySeller", actor: "seller", from: "Approved", kind: "confirmed" },
};

// Who is acting is decided here from the signed-in wallet's organizations,
// never from anything the browser sends. The same wallet cannot sit on both
// sides of one agreement.
export async function participantRoles(address: string, row: { buyer_key: string; seller_key: string }, db: Db = sql): Promise<Roles> {
  const roles = await rolesFor(address, row.buyer_key, row.seller_key, db);
  if (!roles.buyer && !roles.seller) throw new HttpError(404, "Agreement not found.");
  if (roles.buyer && roles.seller) throw new HttpError(403, "This wallet belongs to both parties, so it cannot act on this agreement.");
  return roles;
}

// A row is only changed after the ledger has confirmed the transaction, and
// the new status is read back from the ledger's own response. The row stays
// locked for the duration so two requests cannot act on the same contract.

export async function commitAgreement(id: string, address: string): Promise<Agreement> {
  await syncLedgerIdentity();

  const [pre] = await sql`SELECT buyer, seller, buyer_key, seller_key FROM agreements WHERE id = ${id}`;
  if (!pre) throw new HttpError(404, "Agreement not found.");
  const roles = await participantRoles(address, pre);
  if (!roles.seller) throw new HttpError(403, `Only a member of ${pre.seller} can commit this agreement.`);
  const [buyerParty, sellerParty] = [await ensureParty(pre.buyer), await ensureParty(pre.seller)];

  return withTx(async (tx) => {
    const [row] = await tx`SELECT * FROM agreements WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new HttpError(404, "Agreement not found.");
    if (row.ledger_status === "committed") throw new HttpError(409, "This agreement is already committed to the ledger.");
    if (row.status !== "Awaiting approval") throw new HttpError(409, `A ${row.status.toLowerCase()} agreement cannot be committed.`);
    if (isExpired(row)) throw new HttpError(409, `This agreement passed its deadline (${row.deadline}), so it can no longer be committed. The creator can extend the deadline or cancel it.`);

    const result = await createAgreementContract({
      id,
      title: row.title,
      buyerParty,
      sellerParty,
      amount: String(row.amount),
      currency: row.currency,
    });

    const [updated] = await tx`
      UPDATE agreements SET
        ledger_status = 'committed', ledger_contract_id = ${result.contractId}, ledger_offset = ${result.offset},
        ledger_update_id = ${result.updateId}, buyer_party = ${buyerParty}, seller_party = ${sellerParty},
        status = ${result.status}, updated_at = now()
      WHERE id = ${id} RETURNING *
    `;
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, ledger_update_id, ledger_offset, actor_address)
      VALUES (${id}, 'committed', ${row.seller}, 'Contract created on the ledger by the seller.', ${result.updateId}, ${result.offset}, ${address})
    `;
    return toAgreement(updated);
  });
}

export async function transition(id: string, action: Action, address: string): Promise<Agreement> {
  await syncLedgerIdentity();
  const spec = ACTIONS[action];

  return withTx(async (tx) => {
    const [row] = await tx`SELECT * FROM agreements WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new HttpError(404, "Agreement not found.");
    const roles = await participantRoles(address, row, tx);
    if (!roles[spec.actor]) {
      throw new HttpError(403, `Only a member of ${spec.actor === "buyer" ? row.buyer : row.seller} (the ${spec.actor}) can do this.`);
    }
    if (isExpired(row)) throw new HttpError(409, `This agreement passed its deadline (${row.deadline}), so it can no longer be acted on.`);
    if (row.ledger_status !== "committed" || !row.ledger_contract_id) {
      throw new HttpError(409, "Commit this agreement to the ledger first. Approvals are only recorded on the ledger.");
    }
    if (row.status !== spec.from) {
      throw new HttpError(409, `This action needs the status "${spec.from}", but the agreement is "${row.status}".`);
    }

    const party = (spec.actor === "buyer" ? row.buyer_party : row.seller_party) as string;
    const actorName = (spec.actor === "buyer" ? row.buyer : row.seller) as string;
    const result: LedgerResult = await exerciseChoice(row.ledger_contract_id, spec.choice, party);

    const [updated] = await tx`
      UPDATE agreements SET
        ledger_contract_id = ${result.contractId}, ledger_offset = ${result.offset},
        ledger_update_id = ${result.updateId}, status = ${result.status}, updated_at = now()
      WHERE id = ${id} RETURNING *
    `;
    await tx`
      INSERT INTO agreement_events (agreement_id, kind, actor, detail, ledger_update_id, ledger_offset, actor_address)
      VALUES (${id}, ${spec.kind}, ${actorName}, ${`${spec.choice} exercised by the ${spec.actor}.`}, ${result.updateId}, ${result.offset}, ${address})
    `;
    return toAgreement(updated);
  });
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Verification {
  verified: boolean;
  checkedAt: string;
  checks: Check[];
}

// Re-reads the agreement from the ledger and compares it with the database.
export async function verifyAgreement(id: string, address: string): Promise<Verification> {
  await syncLedgerIdentity();
  const [row] = await sql`SELECT * FROM agreements WHERE id = ${id}`;
  if (!row) throw new HttpError(404, "Agreement not found.");
  await participantRoles(address, row);
  if (row.ledger_status !== "committed") throw new HttpError(409, "This agreement is not committed to the ledger, so there is nothing to verify.");

  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const offset = await transactionOffset(row.ledger_update_id, row.seller_party);
  add(
    "Transaction exists on the ledger",
    offset !== null && String(offset) === String(row.ledger_offset),
    offset === null ? "The ledger has no transaction with the stored ID." : `Found at offset ${offset}.`,
  );

  const active = await activeAgreementContracts(row.seller_party);
  const contract = active.find((c) => c.contractId === row.ledger_contract_id);
  add("Contract is active", Boolean(contract), contract ? "The stored contract ID is an active contract." : "The stored contract ID is not active on the ledger.");

  if (contract) {
    const a = contract.arguments;
    add("Parties match", a.buyer === row.buyer_party && a.seller === row.seller_party, "Buyer and seller party IDs compared with the database.");
    add("Value matches", Number(a.amount) === Number(row.amount) && a.currency === row.currency, `Ledger ${String(a.amount)} ${String(a.currency)}, database ${String(row.amount)} ${String(row.currency)}.`);
    let ledgerStatus = "unknown";
    try {
      ledgerStatus = statusFromLedger(a.status);
    } catch {
      // reported below
    }
    add("Status matches", ledgerStatus === row.status, `Ledger "${ledgerStatus}", database "${String(row.status)}".`);
  }

  return { verified: checks.every((c) => c.ok), checkedAt: new Date().toISOString(), checks };
}
