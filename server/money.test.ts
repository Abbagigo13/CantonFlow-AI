import { describe, expect, test } from "bun:test";
import { centsToString, isPrice, isQuantity, lineTotalCents, sumCents } from "./money";

describe("lineTotalCents", () => {
  test("multiplies exactly", () => {
    expect(lineTotalCents("2", "10.50")).toBe(2100n);
    expect(lineTotalCents("40", "450")).toBe(1_800_000n);
    expect(lineTotalCents("1.5", "3.00")).toBe(450n);
  });

  test("rounds half up to a whole cent", () => {
    expect(lineTotalCents("0.005", "1")).toBe(1n); // 0.5 cent rounds up
    expect(lineTotalCents("0.004", "1")).toBe(0n);
    expect(lineTotalCents("3", "0.01")).toBe(3n);
    expect(lineTotalCents("0.333", "0.10")).toBe(3n); // 3.33 cents
  });

  test("avoids the float errors a plain Number would make", () => {
    // 0.1 + 0.2 style traps and large products stay exact.
    expect(lineTotalCents("3", "0.10")).toBe(30n);
    expect(lineTotalCents("999999999", "999999999")).toBe(99999999800000000100n);
  });
});

describe("sumCents and centsToString", () => {
  test("adds the rounded lines", () => {
    const total = sumCents([
      { quantity: "40", unitPrice: "450.00" },
      { quantity: "1", unitPrice: "99.99" },
      { quantity: "0.5", unitPrice: "3.33" },
    ]);
    expect(centsToString(total)).toBe("18101.66");
  });

  test("formats cents with two decimals", () => {
    expect(centsToString(0n)).toBe("0.00");
    expect(centsToString(5n)).toBe("0.05");
    expect(centsToString(2450000n)).toBe("24500.00");
  });
});

describe("input checks", () => {
  test("quantity: up to 3 decimals, positive", () => {
    for (const ok of ["1", "0.5", "12.345", "999999999"]) expect(isQuantity(ok)).toBe(true);
    for (const bad of ["0", "-1", "1.2345", "abc", "", "1e3", "1,5"]) expect(isQuantity(bad)).toBe(false);
  });

  test("price: up to 2 decimals, positive", () => {
    for (const ok of ["0.01", "10", "450.50"]) expect(isPrice(ok)).toBe(true);
    for (const bad of ["0", "0.00", "1.234", "-2", "x", ""]) expect(isPrice(bad)).toBe(false);
  });
});
