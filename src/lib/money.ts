// Display-only preview of what the server will compute when an agreement with
// line items is saved. The server is the authority: same rule, whole numbers
// only (quantity to 3 decimals, price to 2), each line rounded half up to a cent.

export interface ItemDraft {
  description: string
  quantity: string
  unitPrice: string
}

const QTY = /^\d{1,9}(\.\d{1,3})?$/
const PRICE = /^\d{1,9}(\.\d{1,2})?$/

function scaled(value: string, decimals: number): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(decimals, '0'))
}

export function lineCents(item: ItemDraft): bigint | null {
  const q = item.quantity.trim()
  const p = item.unitPrice.trim()
  if (!QTY.test(q) || !PRICE.test(p) || Number(q) <= 0 || Number(p) <= 0) return null
  return (scaled(q, 3) * scaled(p, 2) + 500n) / 1000n
}

export function centsText(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

/** The total of all valid lines, or null when any line is incomplete. */
export function totalText(items: ItemDraft[]): string | null {
  let total = 0n
  for (const item of items) {
    const line = lineCents(item)
    if (line === null) return null
    total += line
  }
  return centsText(total)
}

export const EMPTY_ITEM: ItemDraft = { description: '', quantity: '1', unitPrice: '' }
