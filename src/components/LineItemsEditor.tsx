import { Plus, Trash2 } from 'lucide-react'
import { centsText, EMPTY_ITEM, lineCents, totalText, type ItemDraft } from '@/lib/money'
import { formatMoney } from '@/lib/format'

const CELL =
  'min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none'

export const MAX_ITEMS = 50

export function LineItemsEditor({ items, currency, onChange }: { items: ItemDraft[]; currency: string; onChange: (items: ItemDraft[]) => void }) {
  const total = totalText(items)

  function update(index: number, patch: Partial<ItemDraft>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item, i) => {
            const line = lineCents(item)
            return (
              <li key={i} className="space-y-2 rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <input
                    className={CELL}
                    aria-label={`Item ${i + 1} description`}
                    placeholder="Description"
                    maxLength={200}
                    value={item.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove item ${i + 1}`}
                    onClick={() => onChange(items.filter((_, n) => n !== i))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-tint/5 hover:text-bad"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <input className={`${CELL} tabular-nums`} aria-label={`Item ${i + 1} quantity`} inputMode="decimal" placeholder="Qty" value={item.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                  <input className={`${CELL} tabular-nums`} aria-label={`Item ${i + 1} unit price`} inputMode="decimal" placeholder="Unit price" value={item.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
                  <span className="min-w-20 text-right text-sm tabular-nums text-muted">{line === null ? '' : formatMoney(centsText(line), currency)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {items.length < MAX_ITEMS && (
        <button
          type="button"
          onClick={() => onChange([...items, { ...EMPTY_ITEM }])}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm font-medium text-muted transition hover:border-accent hover:text-ink"
        >
          <Plus size={16} /> Add a line item
        </button>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Total (the server recalculates it when you save)</span>
          <span className="font-display text-lg font-semibold tabular-nums">{total === null ? 'Incomplete' : formatMoney(total, currency)}</span>
        </div>
      )}
    </div>
  )
}
