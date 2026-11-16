import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { CURRENCIES, type Currency } from '@/lib/api'
import { useCreateAgreement } from '@/hooks/useApi'
import { useSession } from '@/lib/session'
import { LineItemsEditor } from '@/components/LineItemsEditor'
import { totalText, type ItemDraft } from '@/lib/money'
import { today } from '@/lib/format'
import { PrimaryButton } from '@/components/ui'

const EMPTY = { title: '', counterparty: '', role: 'buyer' as 'buyer' | 'seller', amount: '', currency: 'USD' as Currency, terms: '', deadline: '' }
const FIELD =
  'min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none'

export function CreateAgreementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([])
  const create = useCreateAgreement()
  const session = useSession()
  const [orgKey, setOrgKey] = useState('')
  const org = session.organizations.find((o) => o.key === orgKey) ?? session.activeOrg

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const mine = org.name
    if (items.length > 0 && totalText(items) === null) return setError('Finish or remove the incomplete line items.')
    create.mutate(
      {
        title: form.title,
        ...(items.length > 0 ? { items } : { amount: form.amount }),
        terms: form.terms,
        ...(form.deadline ? { deadline: form.deadline } : {}),
        currency: form.currency,
        buyer: form.role === 'buyer' ? mine : form.counterparty,
        seller: form.role === 'seller' ? mine : form.counterparty,
      },
      {
        onSuccess: ({ agreement }) => {
          toast.success(`Agreement ${agreement.id} saved`)
          setForm(EMPTY)
          setItems([])
          onClose()
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-label="New agreement"
            onSubmit={submit}
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">New agreement</h2>
                <p className="mt-1 text-sm text-muted">Saved to the database. The seller commits it to the ledger.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-tint/5">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-medium">
                Title
                <input className={`${FIELD} mt-1.5`} value={form.title} maxLength={120} required placeholder="Agricultural equipment supply" onChange={(e) => set('title', e.target.value)} />
              </label>
              {session.organizations.length > 1 ? (
                <label className="block text-sm font-medium">
                  Your organization
                  <select className={`${FIELD} mt-1.5`} value={org.key} onChange={(e) => setOrgKey(e.target.value)}>
                    {session.organizations.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="text-sm">
                  <span className="text-muted">Creating as </span>
                  <span className="font-medium">{org.name}</span>
                </div>
              )}
              <fieldset>
                <legend className="text-sm font-medium">{org.name} is the</legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(['buyer', 'seller'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={form.role === r}
                      onClick={() => set('role', r)}
                      className={`min-h-11 rounded-xl border text-sm font-medium capitalize transition ${form.role === r ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium">
                {form.role === 'buyer' ? 'Seller' : 'Buyer'} (the other organization)
                <input className={`${FIELD} mt-1.5`} value={form.counterparty} maxLength={100} required placeholder="Exactly as they registered it" onChange={(e) => set('counterparty', e.target.value)} />
              </label>
              <div className="grid grid-cols-[1fr_6.5rem] gap-4">
                <label className="block text-sm font-medium">
                  Amount
                  <input
                    className={`${FIELD} mt-1.5 tabular-nums`}
                    inputMode="decimal"
                    value={items.length > 0 ? (totalText(items) ?? '') : form.amount}
                    readOnly={items.length > 0}
                    required
                    placeholder="0.00"
                    onChange={(e) => set('amount', e.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Currency
                  <select className={`${FIELD} mt-1.5`} value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">
                Deadline (optional)
                <input className={`${FIELD} mt-1.5`} type="date" min={today()} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
                <span className="mt-1 block text-xs font-normal text-muted">After this day the agreement expires and can no longer be committed or approved.</span>
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Line items (optional)</legend>
                <p className="mb-2 mt-0.5 text-xs text-muted">With line items, the amount is their total.</p>
                <LineItemsEditor items={items} currency={form.currency} onChange={setItems} />
              </fieldset>
              <label className="block text-sm font-medium">
                Terms (optional)
                <textarea
                  className={`${FIELD} mt-1.5 min-h-24 py-2`}
                  rows={4}
                  maxLength={4000}
                  value={form.terms}
                  placeholder="Payment due in 30 days. Delivery FOB Rotterdam."
                  onChange={(e) => set('terms', e.target.value)}
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}

            <PrimaryButton type="submit" disabled={create.isPending} className="mt-6 w-full">
              {create.isPending ? 'Saving...' : 'Create agreement'}
            </PrimaryButton>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  )
}
