import { sql } from "./db";

export type ServiceState = "connected" | "unreachable" | "not-configured" | "configured";

export interface ServiceStatus {
  status: ServiceState;
  detail: string;
  latencyMs?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

export async function databaseStatus(): Promise<ServiceStatus> {
  try {
    const { ms } = await timed(() => sql`SELECT 1`);
    return { status: "connected", detail: "PostgreSQL is accepting queries.", latencyMs: ms };
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.message : "Database query failed.",
    };
  }
}

// Probes the Canton JSON Ledger API. It only reports "connected" when the
// ledger itself answers; nothing is assumed from configuration alone.
export async function ledgerStatus(): Promise<ServiceStatus & { version?: string; participantId?: string }> {
  const base = process.env.LEDGER_API_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    return { status: "not-configured", detail: "LEDGER_API_URL is not set. No agreement is committed to a ledger." };
  }
  try {
    const { value, ms } = await timed(async () => {
      const response = await fetch(`${base}/v2/version`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error(`Ledger API answered HTTP ${response.status}.`);
      return (await response.json()) as { version?: string };
    });
    const participant = await fetch(`${base}/v2/parties/participant-id`, { signal: AbortSignal.timeout(2500) })
      .then((r) => (r.ok ? (r.json() as Promise<{ participantId?: string }>) : null))
      .catch(() => null);
    return {
      status: "connected",
      detail: "Canton Ledger API answered.",
      latencyMs: ms,
      version: value.version,
      participantId: participant?.participantId,
    };
  } catch (error) {
    return {
      status: "unreachable",
      detail: error instanceof Error ? error.message : "Ledger API did not respond.",
    };
  }
}
