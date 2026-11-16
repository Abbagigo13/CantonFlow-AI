import { sql, withTx, type Status } from "./db";

// Thin client for the Canton JSON Ledger API (v2). Every function either
// returns what the ledger confirmed or throws a LedgerError. Nothing here
// assumes success.

export type LedgerErrorKind = "unconfigured" | "unreachable" | "rejected" | "failed";

export class LedgerError extends Error {
  constructor(
    public kind: LedgerErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const TEMPLATE_ID = "#cantonflow:CantonFlow:TradeAgreement";
const USER_ID = process.env.LEDGER_USER_ID?.trim() || "participant_admin";

const STATUS_FROM_LEDGER: Record<string, Status> = {
  AwaitingApproval: "Awaiting approval",
  Approved: "Approved",
  Completed: "Completed",
  Rejected: "Rejected",
};

export function statusFromLedger(value: unknown): Status {
  const status = typeof value === "string" ? STATUS_FROM_LEDGER[value] : undefined;
  if (!status) throw new LedgerError("failed", `The ledger returned an unknown status: ${String(value)}.`);
  return status;
}

export const isLedgerConfigured = (): boolean => Boolean(process.env.LEDGER_API_URL?.trim());

function baseUrl(): string {
  const base = process.env.LEDGER_API_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new LedgerError("unconfigured", "The Canton ledger is not configured. Set LEDGER_API_URL.");
  return base;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(baseUrl() + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    throw new LedgerError("unreachable", "The Canton ledger is not reachable.");
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON body: handled below.
  }

  if (!response.ok) {
    const cause = (data as { cause?: string } | null)?.cause ?? `The ledger answered HTTP ${response.status}.`;
    throw new LedgerError(response.status >= 500 ? "failed" : "rejected", cause);
  }
  return data as T;
}

// ---- identity ---------------------------------------------------------------

// The local sandbox keeps its state in memory. When it restarts it comes back
// as a new participant with an empty ledger, so any agreement we recorded as
// committed no longer exists there. Detect that and say so, instead of
// pretending the old contracts are still on a ledger.
export async function syncLedgerIdentity(): Promise<{ participantId: string; reset: boolean }> {
  const { participantId } = await call<{ participantId: string }>("/v2/parties/participant-id");
  const [meta] = await sql`SELECT value FROM ledger_meta WHERE key = 'participant_id'`;
  if (meta?.value === participantId) return { participantId, reset: false };

  let reset = false;
  await withTx(async (tx) => {
    if (meta) {
      const lost = await tx`
        UPDATE agreements SET
          ledger_status = 'not-submitted', ledger_contract_id = NULL, ledger_offset = NULL,
          ledger_update_id = NULL, buyer_party = NULL, seller_party = NULL,
          status = 'Awaiting approval', updated_at = now()
        WHERE ledger_status = 'committed'
        RETURNING id
      `;
      for (const row of lost) {
        await tx`
          INSERT INTO agreement_events (agreement_id, kind, detail)
          VALUES (${row.id}, 'ledger_reset', 'The local ledger was reset. This agreement is no longer on a ledger and can be committed again.')
        `;
      }
      await tx`DELETE FROM parties`;
      reset = true;
    }
    await tx`
      INSERT INTO ledger_meta (key, value) VALUES ('participant_id', ${participantId})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  });
  return { participantId, reset };
}

// ---- parties ----------------------------------------------------------------

// Two requests for the same new organization at once must not both try to allocate its party.
const partiesInFlight = new Map<string, Promise<string>>();

export function ensureParty(displayName: string): Promise<string> {
  const key = displayName.trim().toLowerCase().replace(/\s+/g, " ");
  const running = partiesInFlight.get(key);
  if (running) return running;
  const started = allocateParty(key, displayName.trim()).finally(() => partiesInFlight.delete(key));
  partiesInFlight.set(key, started);
  return started;
}

async function allocateParty(key: string, displayName: string): Promise<string> {
  const [existing] = await sql`SELECT party_id FROM parties WHERE name_key = ${key}`;
  if (existing) return existing.party_id as string;

  const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "party";
  const hash = new Bun.CryptoHasher("sha1").update(key).digest("hex").slice(0, 8);
  const hint = `${slug}-${hash}`;

  let partyId: string;
  try {
    const created = await call<{ partyDetails: { party: string } }>("/v2/parties", { partyIdHint: hint, identityProviderId: "" });
    partyId = created.partyDetails.party;
  } catch (error) {
    if (!(error instanceof LedgerError) || error.kind !== "rejected") throw error;
    // Already allocated on the ledger (the cache was cleared, or another API process just did it): reuse it.
    // The ledger can take a moment to list a party that was only just created, so look a few times.
    let found: string | undefined;
    for (let attempt = 0; attempt < 8 && !found; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
      const all = await call<{ partyDetails: { party: string }[] }>("/v2/parties");
      found = all.partyDetails.find((p) => p.party.startsWith(`${hint}::`))?.party;
    }
    if (!found) throw error;
    partyId = found;
  }

  await sql`
    INSERT INTO parties (name_key, display_name, party_id) VALUES (${key}, ${displayName}, ${partyId})
    ON CONFLICT (name_key) DO NOTHING
  `;
  return partyId;
}

// ---- commands ---------------------------------------------------------------

interface LedgerEvent {
  CreatedEvent?: { contractId: string; offset: number; createArgument: Record<string, unknown> };
  ArchivedEvent?: { contractId: string };
}

interface TransactionResponse {
  transaction: { updateId: string; offset: number; events: LedgerEvent[] };
}

export interface LedgerResult {
  contractId: string;
  offset: number;
  updateId: string;
  status: Status;
}

function resultOf(response: TransactionResponse): LedgerResult {
  const created = response.transaction.events.map((e) => e.CreatedEvent).find((e) => e !== undefined);
  if (!created) throw new LedgerError("failed", "The ledger accepted the command but returned no contract.");
  return {
    contractId: created.contractId,
    offset: response.transaction.offset,
    updateId: response.transaction.updateId,
    status: statusFromLedger(created.createArgument.status),
  };
}

function submit(command: unknown, actAs: string, commandId: string) {
  return call<TransactionResponse>("/v2/commands/submit-and-wait-for-transaction", {
    commands: { commands: [command], userId: USER_ID, commandId, actAs: [actAs], readAs: [] },
  });
}

export async function createAgreementContract(input: {
  id: string;
  title: string;
  buyerParty: string;
  sellerParty: string;
  amount: string;
  currency: string;
}): Promise<LedgerResult> {
  const response = await submit(
    {
      CreateCommand: {
        templateId: TEMPLATE_ID,
        createArguments: {
          agreementId: input.id,
          title: input.title,
          buyer: input.buyerParty,
          seller: input.sellerParty,
          amount: input.amount,
          currency: input.currency,
          status: "AwaitingApproval",
        },
      },
    },
    input.sellerParty,
    `cf-commit-${input.id}`,
  );
  return resultOf(response);
}

export type Choice = "ApproveByBuyer" | "RejectByBuyer" | "ConfirmBySeller";

export async function exerciseChoice(contractId: string, choice: Choice, actAs: string): Promise<LedgerResult> {
  const response = await submit(
    { ExerciseCommand: { templateId: TEMPLATE_ID, contractId, choice, choiceArgument: {} } },
    actAs,
    `cf-${choice}-${crypto.randomUUID()}`,
  );
  return resultOf(response);
}

// ---- reads ------------------------------------------------------------------

export interface ActiveContract {
  contractId: string;
  offset: number;
  arguments: Record<string, unknown>;
}

export async function activeAgreementContracts(party: string): Promise<ActiveContract[]> {
  const { offset } = await call<{ offset: number }>("/v2/state/ledger-end");
  const rows = await call<
    { contractEntry?: { JsActiveContract?: { createdEvent: { contractId: string; offset: number; createArgument: Record<string, unknown> } } } }[]
  >("/v2/state/active-contracts", {
    eventFormat: {
      filtersByParty: {
        [party]: {
          cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId: TEMPLATE_ID, includeCreatedEventBlob: false } } } }],
        },
      },
      verbose: true,
    },
    activeAtOffset: offset,
  });
  return rows.flatMap((r) => {
    const created = r.contractEntry?.JsActiveContract?.createdEvent;
    return created ? [{ contractId: created.contractId, offset: created.offset, arguments: created.createArgument }] : [];
  });
}

export async function transactionOffset(updateId: string, party: string): Promise<number | null> {
  try {
    const response = await call<{ update?: { Transaction?: { value?: { offset?: number } } } }>("/v2/updates/update-by-id", {
      updateId,
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            filtersByParty: { [party]: { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] } },
            verbose: true,
          },
          transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
        },
      },
    });
    return response.update?.Transaction?.value?.offset ?? null;
  } catch (error) {
    if (error instanceof LedgerError && error.kind === "rejected") return null;
    throw error;
  }
}
