import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useCancelAgreement, useEditAgreement } from '@/hooks/useApi'
import { CURRENCIES, type Agreement, type Currency, type EditInput, type ItemView, type Permissions } from '@/lib/api'
import { LineItemsEditor } from '@/components/LineItemsEditor'
import { totalText, type ItemDraft } from '@/lib/money'
import { today } from '@/lib/format'
import { PrimaryButton } from '@/components/ui'

const FIELD =
  'min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none'
const GHOST =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50'

// Edit and cancel are offered to the organization that created the agreement,
// and only until it is committed to the ledger.
export function DraftControls({ a, permissions, terms, items }: { a: Agreement; permissions: Permissions; terms: string | null; items: ItemView[] }) {
  const edit = useEditAgreement(a.id)
  const cancel = useCancelAgreement(a.id)
  const [editing, setEditing] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const counterparty = permissions.role === 'buyer' ? a.seller : a.buyer
  const [form, setForm] = useState({ title: a.title, counterparty, amount: String(a.amount), currency: a.currency })
  const [deadline, setDeadline] = useState(a.deadline ?? '')
  const [termsText, setTermsText] = useState(terms ?? '')
  const [draftItems, setDraftItems] = useState<ItemDraft[]>(items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })))
  const [error, setError] = useState('')

  if (!permissions.canEdit && !permissions.canCancel) return null

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const patch: EditInput = {}
    if (form.title.trim() !== a.title) patch.title = form.title
    if (form.counterparty.trim() !== counterparty) patch.counterparty = form.counterparty
    if (draftItems.length === 0 && Number(form.amount) !== Number(a.amount)) patch.amount = form.amount
    if (deadline !== (a.deadline ?? '')) patch.deadline = deadline === '' ? null : deadline
    if (termsText.trim() !== (terms ?? '')) patch.terms = termsText.trim() === '' ? null : termsText
    const itemsChanged = JSON.stringify(draftItems) !== JSON.stringify(items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })))
    if (draftItems.length > 0 && totalText(draftItems) === null) return setError('Finish or remove the incomplete line items.')
    if (itemsChanged) patch.items = draftItems
    if (form.currency !== a.currency) patch.currency = form.currency
    if (Object.keys(patch).length === 0) return setError('Nothing has changed.')
    edit.mutate(patch, {
      onSuccess: () => {
        toast.success('Agreement updated')
        setEditing(false)
      },
      onError: (err) => setError(err.message),
    })
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="mt-4 space-y-3 border-t border-line pt-4">
        <label className="block text-sm font-medium">
          Title
          <input className={`${FIELD} mt-1.5`} value={form.title} maxLength={120} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="block text-sm font-medium">
          {permissions.role === 'buyer' ? 'Seller' : 'Buyer'}
          <input className={`${FIELD} mt-1.5`} value={form.counterparty} maxLength={100} required onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
        </label>
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <label className="block text-sm font-medium">
            Amount
            <input
              className={`${FIELD} mt-1.5 tabular-nums`}
              inputMode="decimal"
              value={draftItems.length > 0 ? (totalText(draftItems) ?? '') : form.amount}
              readOnly={draftItems.length > 0}
              required
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium">
            Currency
            <select className={`${FIELD} mt-1.5`} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">
          Deadline
          <input className={`${FIELD} mt-1.5`} type="date" min={today()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <span className="mt-1 block text-xs font-normal text-muted">Clear the date to remove the deadline.</span>
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Line items</legend>
          <div className="mt-1.5">
            <LineItemsEditor items={draftItems} currency={form.currency} onChange={setDraftItems} />
          </div>
        </fieldset>
        <label className="block text-sm font-medium">
          Terms
          <textarea className={`${FIELD} mt-1.5 min-h-24 py-2`} rows={4} maxLength={4000} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
        </label>
        <p className="text-xs text-muted">If you change the other organization, the old one loses access to this agreement.</p>
        {error && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={GHOST} onClick={() => setEditing(false)}>
            Discard
          </button>
          <PrimaryButton type="submit" disabled={edit.isPending}>
            {edit.isPending ? 'Saving...' : 'Save changes'}
          </PrimaryButton>
        </div>
      </form>
    )
  }

  return (
    <div className="mt-4 space-y-2 border-t border-line pt-4">
      <p className="text-xs text-muted">You created this agreement, so you can change it until it is committed to the ledger.</p>
      {permissions.canEdit && (
        <button className={GHOST} onClick={() => setEditing(true)}>
          <Pencil size={16} /> Edit details
        </button>
      )}
      {permissions.canCancel &&
        (confirmingCancel ? (
          <div className="grid grid-cols-2 gap-2">
            <button className={GHOST} onClick={() => setConfirmingCancel(false)}>
              Keep it
            </button>
            <button
              className={`${GHOST} !border-bad/40 text-bad`}
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSuccess: () => toast.success('Agreement cancelled') })}
            >
              {cancel.isPending ? 'Cancelling...' : 'Confirm cancel'}
            </button>
          </div>
        ) : (
          <button className={`${GHOST} text-muted`} onClick={() => setConfirmingCancel(true)}>
            Cancel agreement
          </button>
        ))}
      {cancel.isError && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {cancel.error.message}
        </p>
      )}
    </div>
  )
}
