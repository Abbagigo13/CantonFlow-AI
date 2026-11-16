import { CURRENCIES, STATUSES, todayUtc, type Currency, type Status } from "./db";
import { centsToString, isPrice, isQuantity, sumCents, type ItemInput } from "./money";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface NewAgreement {
  title: string;
  buyer: string;
  seller: string;
  amount: string;
  currency: Currency;
  terms: string | null;
  items: ItemInput[];
  deadline: string | null;
}

const MAX_TERMS = 4000;
const MAX_ITEMS = 50;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} is required.`);
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) throw new HttpError(400, `${field} is required.`);
  if (clean.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return clean;
}

export function parseAmount(raw: unknown): string {
  const rawAmount = typeof raw === "number" ? String(raw) : raw;
  if (typeof rawAmount !== "string" || !AMOUNT_RE.test(rawAmount.trim())) {
    throw new HttpError(400, "Amount must be a positive number with at most 2 decimals.");
  }
  const amount = rawAmount.trim();
  if (Number(amount) <= 0) throw new HttpError(400, "Amount must be greater than zero.");
  if (Number(amount) > 1_000_000_000) throw new HttpError(400, "Amount exceeds the allowed maximum.");
  return amount;
}

export function parseCurrency(raw: unknown): Currency {
  const currency = raw ?? "USD";
  if (!CURRENCIES.includes(currency as Currency)) {
    throw new HttpError(400, `Currency must be one of ${CURRENCIES.join(", ")}.`);
  }
  return currency as Currency;
}

export { text as parseText };

export function parseTerms(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "Terms must be text.");
  // Keep line breaks, drop other control characters.
  const clean = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (clean.length > MAX_TERMS) throw new HttpError(400, `Terms must be ${MAX_TERMS} characters or fewer.`);
  return clean || null;
}

/** A real calendar day, today or later, within five years. null clears it. */
export function parseDeadline(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, "Deadline must be a date like 2026-12-31.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, "That deadline is not a real date.");
  const today = todayUtc();
  if (value < today) throw new HttpError(400, "The deadline cannot be in the past.");
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCFullYear(limit.getUTCFullYear() + 5);
  if (date > limit) throw new HttpError(400, "The deadline can be at most five years away.");
  return value;
}

export function parseItems(value: unknown): ItemInput[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Line items must be a list.");
  if (value.length > MAX_ITEMS) throw new HttpError(400, `An agreement can have at most ${MAX_ITEMS} line items.`);
  return value.map((raw, index) => {
    const row = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const label = `Line item ${index + 1}`;
    const description = text(row.description, `${label} description`, 200);
    const quantity = String(row.quantity ?? "").trim();
    const unitPrice = String(row.unitPrice ?? "").trim();
    if (!isQuantity(quantity)) throw new HttpError(400, `${label}: quantity must be a positive number with at most 3 decimals.`);
    if (!isPrice(unitPrice)) throw new HttpError(400, `${label}: unit price must be a positive number with at most 2 decimals.`);
    return { description, quantity, unitPrice };
  });
}

/** The agreement amount that line items add up to, checked against the limits. */
export function totalOfItems(items: ItemInput[]): string {
  const total = centsToString(sumCents(items));
  if (Number(total) > 1_000_000_000) throw new HttpError(400, "The line items add up to more than the allowed maximum.");
  return total;
}

export function parseNewAgreement(input: unknown): NewAgreement {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  const body = input as Record<string, unknown>;

  const title = text(body.title, "Title", 120);
  const buyer = text(body.buyer, "Buyer", 100);
  const seller = text(body.seller, "Seller", 100);
  if (buyer.toLowerCase() === seller.toLowerCase()) {
    throw new HttpError(400, "Buyer and seller must be different parties.");
  }

  const items = body.items === undefined || body.items === null ? [] : parseItems(body.items);
  // With line items the amount is their sum, whatever the client sent.
  const amount = items.length > 0 ? totalOfItems(items) : parseAmount(body.amount);
  const currency = parseCurrency(body.currency);
  const terms = body.terms === undefined ? null : parseTerms(body.terms);
  const deadline = body.deadline === undefined ? null : parseDeadline(body.deadline);

  return { title, buyer, seller, amount, currency, terms, items, deadline };
}

export interface ListQuery {
  search: string | null;
  status: Status | "Expired" | null;
  limit: number;
  offset: number;
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const search = params.get("search")?.trim().slice(0, 100) || null;

  const rawStatus = params.get("status");
  if (rawStatus && rawStatus !== "Expired" && !STATUSES.includes(rawStatus as Status)) {
    throw new HttpError(400, `Status must be one of ${[...STATUSES, "Expired"].join(", ")}.`);
  }

  const limit = Math.min(Math.max(Number(params.get("limit") ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(params.get("offset") ?? 0) || 0, 0);

  return { search, status: (rawStatus as Status | "Expired" | null) || null, limit, offset };
}
