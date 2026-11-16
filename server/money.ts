// Exact decimal arithmetic for line items. Amounts never pass through floating
// point: quantities (up to 3 decimals) and prices (up to 2 decimals) become
// whole numbers, and each line is rounded half up to a whole cent.

export interface ItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

const QTY_RE = /^\d{1,9}(\.\d{1,3})?$/;
const PRICE_RE = /^\d{1,9}(\.\d{1,2})?$/;

export function isQuantity(value: string): boolean {
  return QTY_RE.test(value) && Number(value) > 0;
}

export function isPrice(value: string): boolean {
  return PRICE_RE.test(value) && Number(value) > 0;
}

function scaled(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/** Line total in cents: round-half-up of quantity x price. */
export function lineTotalCents(quantity: string, unitPrice: string): bigint {
  const milli = scaled(quantity, 3); // quantity x 1000
  const cents = scaled(unitPrice, 2); // price x 100
  return (milli * cents + 500n) / 1000n;
}

export function sumCents(items: Pick<ItemInput, "quantity" | "unitPrice">[]): bigint {
  return items.reduce((total, item) => total + lineTotalCents(item.quantity, item.unitPrice), 0n);
}

export function centsToString(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
