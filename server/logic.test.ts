import { describe, expect, test } from "bun:test";
import { parseAddress, rateLimit } from "./auth";
import { orgKey } from "./db";
import { LedgerError, statusFromLedger } from "./ledger";
import { HttpError } from "./validate";

describe("orgKey", () => {
  test("treats case and spacing differences as the same organization", () => {
    expect(orgKey("  Northstar   Trading ")).toBe("northstar trading");
    expect(orgKey("NORTHSTAR TRADING")).toBe(orgKey("northstar trading"));
  });

  test("keeps different names apart", () => {
    expect(orgKey("Northstar Trading")).not.toBe(orgKey("Northstar Trading Ltd"));
  });
});

describe("parseAddress", () => {
  const address = "0x52908400098527886E0F7030069857D2E4169EE7";

  test("lowercases a valid address", () => {
    expect(parseAddress(address)).toBe(address.toLowerCase());
    expect(parseAddress(`  ${address}  `)).toBe(address.toLowerCase());
  });

  test.each(["", "0x123", "not an address", 42, null, undefined, `${address}00`])("rejects %p", (value) => {
    expect(() => parseAddress(value)).toThrow(HttpError);
  });
});

describe("rateLimit", () => {
  test("allows up to the limit, then blocks with 429", () => {
    const key = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);
    try {
      rateLimit(key, 3, 60_000);
      throw new Error("expected a 429");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(429);
    }
  });

  test("keeps separate counters per key", () => {
    const [a, b] = [`test:${crypto.randomUUID()}`, `test:${crypto.randomUUID()}`];
    rateLimit(a, 1, 60_000);
    expect(() => rateLimit(b, 1, 60_000)).not.toThrow();
  });
});

describe("statusFromLedger", () => {
  test("maps every ledger status to its label", () => {
    expect(statusFromLedger("AwaitingApproval")).toBe("Awaiting approval");
    expect(statusFromLedger("Approved")).toBe("Approved");
    expect(statusFromLedger("Completed")).toBe("Completed");
    expect(statusFromLedger("Rejected")).toBe("Rejected");
  });

  test("refuses a status it does not know instead of guessing", () => {
    expect(() => statusFromLedger("Settled")).toThrow(LedgerError);
    expect(() => statusFromLedger(undefined)).toThrow(LedgerError);
  });
});
