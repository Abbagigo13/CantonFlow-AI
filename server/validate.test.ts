import { describe, expect, test } from "bun:test";
import { HttpError, parseListQuery, parseNewAgreement } from "./validate";

const valid = { title: "Solar supply", buyer: "Helio Partners", seller: "Volt Systems", amount: "18200.50", currency: "USD" as const };

function failure(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("expected the call to throw");
}

describe("parseNewAgreement", () => {
  test("accepts a valid agreement and tidies whitespace", () => {
    const parsed = parseNewAgreement({ ...valid, title: "  Solar   supply  " });
    expect(parsed).toEqual({ ...valid, title: "Solar supply", terms: null, items: [], deadline: null });
  });

  test("accepts a numeric amount", () => {
    expect(parseNewAgreement({ ...valid, amount: 250 }).amount).toBe("250");
  });

  test("defaults the currency to USD", () => {
    const { currency: _ignored, ...rest } = valid;
    expect(parseNewAgreement(rest).currency).toBe("USD");
  });

  test("rejects the same party on both sides, ignoring case and spacing", () => {
    expect(failure(() => parseNewAgreement({ ...valid, seller: "helio   PARTNERS" })).status).toBe(400);
  });

  test.each(["0", "-5", "abc", "1.234", "1e5", "", "1000000001", "NaN"])("rejects amount %p", (amount) => {
    expect(failure(() => parseNewAgreement({ ...valid, amount })).status).toBe(400);
  });

  test("rejects an unknown currency", () => {
    expect(failure(() => parseNewAgreement({ ...valid, currency: "BTC" })).status).toBe(400);
  });

  test("rejects missing and oversized text", () => {
    expect(failure(() => parseNewAgreement({ ...valid, title: "   " })).status).toBe(400);
    expect(failure(() => parseNewAgreement({ ...valid, title: "x".repeat(121) })).status).toBe(400);
    expect(failure(() => parseNewAgreement({ ...valid, buyer: "x".repeat(101) })).status).toBe(400);
  });

  test("rejects bodies that are not objects", () => {
    for (const body of [null, "text", 5, [valid]]) expect(failure(() => parseNewAgreement(body)).status).toBe(400);
  });
});

describe("parseListQuery", () => {
  test("applies defaults", () => {
    expect(parseListQuery(new URLSearchParams())).toEqual({ search: null, status: null, limit: 100, offset: 0 });
  });

  test("clamps limit and offset", () => {
    const q = parseListQuery(new URLSearchParams({ limit: "99999", offset: "-4" }));
    expect(q.limit).toBe(200);
    expect(q.offset).toBe(0);
  });

  test("rejects an unknown status", () => {
    expect(failure(() => parseListQuery(new URLSearchParams({ status: "Done" }))).status).toBe(400);
  });

  test("accepts a known status and trims the search", () => {
    const q = parseListQuery(new URLSearchParams({ status: "Approved", search: "  solar " }));
    expect(q.status).toBe("Approved");
    expect(q.search).toBe("solar");
  });
});

describe("terms and line items", () => {
  const items = [
    { description: "Solar panel", quantity: "40", unitPrice: "450.00" },
    { description: "Install", quantity: "1", unitPrice: "1200.50" },
  ];

  test("the amount becomes the sum of the line items, whatever was sent", () => {
    const parsed = parseNewAgreement({ ...valid, amount: "1", items });
    expect(parsed.amount).toBe("19200.50");
    expect(parsed.items).toHaveLength(2);
  });

  test("without items the amount is required", () => {
    const { amount: _ignored, ...rest } = valid;
    expect(failure(() => parseNewAgreement(rest)).status).toBe(400);
  });

  test("accepts items without an amount", () => {
    const { amount: _ignored, ...rest } = valid;
    expect(parseNewAgreement({ ...rest, items }).amount).toBe("19200.50");
  });

  test("rejects bad items", () => {
    const bad = (item: object) => failure(() => parseNewAgreement({ ...valid, items: [item] })).status;
    expect(bad({ description: "", quantity: "1", unitPrice: "1" })).toBe(400);
    expect(bad({ description: "x", quantity: "0", unitPrice: "1" })).toBe(400);
    expect(bad({ description: "x", quantity: "1", unitPrice: "-1" })).toBe(400);
    expect(bad({ description: "x", quantity: "1.2345", unitPrice: "1" })).toBe(400);
    expect(bad({ description: "x", quantity: "1", unitPrice: "1.999" })).toBe(400);
    expect(bad({ description: "x".repeat(201), quantity: "1", unitPrice: "1" })).toBe(400);
  });

  test("limits the number of items and the total", () => {
    const many = Array.from({ length: 51 }, () => ({ description: "x", quantity: "1", unitPrice: "1" }));
    expect(failure(() => parseNewAgreement({ ...valid, items: many })).status).toBe(400);
    expect(failure(() => parseNewAgreement({ ...valid, items: [{ description: "x", quantity: "999999999", unitPrice: "999999999" }] })).status).toBe(400);
  });

  test("terms keep line breaks, lose control characters, and have a limit", () => {
    expect(parseNewAgreement({ ...valid, terms: "  Net 30\r\nShips FOB\u0000  " }).terms).toBe("Net 30\nShips FOB");
    expect(parseNewAgreement({ ...valid, terms: "   " }).terms).toBeNull();
    expect(failure(() => parseNewAgreement({ ...valid, terms: "x".repeat(4001) })).status).toBe(400);
    expect(failure(() => parseNewAgreement({ ...valid, terms: 5 })).status).toBe(400);
  });
});
