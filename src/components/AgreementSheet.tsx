import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Circle, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAgreement, useSystemStatus } from '@/hooks/useApi'
import type { AgreementDetail, AgreementEvent } from '@/lib/api'
import { dueText, formatDay, formatMoney } from '@/lib/format'
import { AiReview } from '@/components/AiReview'
import { EvidencePanel } from '@/components/EvidencePanel'
import { DownloadButton } from '@/components/DownloadButton'
import { DraftControls } from '@/components/DraftControls'
import { InviteButton } from '@/components/InviteButton'
import { AgreementActions, VerifyOnLedger } from '@/components/AgreementActions'
import { ErrorState, ServiceBadge, Skeleton, StatusBadge } from '@/components/ui'

const short = (value: string | null) => (value && value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : (value ?? ''))

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-muted">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  )
}

function Step({ done, title, note }: { done: boolean; title: string; note: string }) {
  return (
    <li className="flex gap-3">
      <span className={done ? 'mt-0.5 text-ok' : 'mt-0.5 text-muted'}>{done ? <Check size={18} /> : <Circle size={18} />}</span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm text-muted">{note}</div>
      </div>
    </li>
  )
}

function eventOf(events: AgreementEvent[], ...kinds: AgreementEvent['kind'][]) {
  const matching = events.filter((e) => kinds.includes(e.kind))
  return matching[matching.length - 1]
}

function Details({ detail }: { detail: AgreementDetail }) {
  const { agreement: a, events, reviews, evidence, permissions, registered, terms, items } = detail
  const status = useSystemStatus()
  const onLedger = a.ledgerStatus === 'committed'
  const ledgerUp = status.data?.ledger.status === 'connected'

  const committed = eventOf(events, 'committed')
  const buyerDecision = eventOf(events, 'approved', 'rejected')
  const confirmed = eventOf(events, 'confirmed')
  const reset = eventOf(events, 'ledger_reset')
  const cancelled = eventOf(events, 'cancelled')
  const rejected = buyerDecision?.kind === 'rejected'

  return (
    <>
      <div className="pb-5">
        <StatusBadge status={a.status} expired={a.expired} />
        <h2 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight">{a.title}</h2>
        <div className="mt-4 font-display text-4xl font-semibold tabular-nums tracking-tight">{formatMoney(a.amount, a.currency)}</div>
      </div>

      {a.expired && a.deadline && (
        <p className="mb-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          This agreement passed its deadline on {formatDay(a.deadline)}. It can no longer be committed or acted on
          {permissions.canEdit ? '. You can extend the deadline or cancel it.' : '.'}
        </p>
      )}

      {reset && !onLedger && (
        <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
          The local ledger was reset on {dateTime(reset.createdAt)}. This agreement is no longer on a ledger and can be committed again.
        </p>
      )}

      <Section title="Actions">
        <AgreementActions a={a} permissions={permissions} registered={registered} />
        <DraftControls key={`${a.updatedAt}`} a={a} permissions={permissions} terms={terms} items={items} />
        <InviteButton
          a={a}
          counterparty={permissions.role === 'buyer' ? a.seller : a.buyer}
          registered={permissions.role === 'buyer' ? registered.seller : registered.buyer}
        />
      </Section>

      <Section title="Parties">
        <dl>
          <Row label="Buyer">
            {a.buyer}
            {permissions.role === 'buyer' && <span className="ml-2 text-xs font-normal text-accent">You</span>}
          </Row>
          <Row label="Seller">
            {a.seller}
            {permissions.role === 'seller' && <span className="ml-2 text-xs font-normal text-accent">You</span>}
          </Row>
        </dl>
      </Section>

      {(terms || items.length > 0) && (
        <Section title="Terms and line items">
          {items.length > 0 && (
            <div className="mb-3">
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.position} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block break-words">{i.description}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {i.quantity} x {formatMoney(i.unitPrice, a.currency)}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatMoney(i.lineTotal, a.currency)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-line pt-2.5 text-sm font-medium">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(a.amount, a.currency)}</span>
              </div>
            </div>
          )}
          {terms && <p className="whitespace-pre-wrap break-words text-sm text-muted">{terms}</p>}
        </Section>
      )}

      <Section title="Progress">
        <ol className="space-y-4">
          <Step done title="Agreement created" note={dateTime(a.createdAt)} />
          {a.status === 'Cancelled' ? (
            <Step done title="Cancelled" note={`${dateTime(cancelled?.createdAt ?? a.updatedAt)}${cancelled?.actor ? ` by ${cancelled.actor}` : ''}. It was never committed to the ledger.`} />
          ) : (
            <>
          <Step
              done={Boolean(committed)}
              title="Committed to ledger"
              note={committed ? `${dateTime(committed.createdAt)} by ${committed.actor}` : ledgerUp ? 'Waiting for the seller to commit.' : 'The ledger is not connected.'}
            />
            <Step
              done={Boolean(buyerDecision)}
              title={rejected ? 'Rejected by buyer' : 'Approved by buyer'}
              note={buyerDecision ? `${dateTime(buyerDecision.createdAt)} by ${buyerDecision.actor}` : 'Waiting for the buyer.'}
            />
            <Step
              done={Boolean(confirmed)}
              title="Confirmed by seller"
              note={confirmed ? `${dateTime(confirmed.createdAt)} by ${confirmed.actor}` : rejected ? 'Not applicable.' : 'Waiting for the seller.'}
            />
  
            </>
          )}
        </ol>
      </Section>

      <Section title="Ledger record">
        <div className="mb-3">
          {onLedger ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              On the Canton ledger
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tint/5 px-2.5 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Not committed
            </span>
          )}
        </div>
        {onLedger ? (
          <>
            <dl>
              <Row label="Contract ID">
                <span className="font-mono text-xs">{short(a.ledgerContractId)}</span>
              </Row>
              <Row label="Transaction">
                <span className="font-mono text-xs">{short(a.ledgerUpdateId)}</span>
              </Row>
              <Row label="Offset">
                <span className="font-mono text-xs tabular-nums">{a.ledgerOffset}</span>
              </Row>
              <Row label="Buyer party">
                <span className="font-mono text-xs">{short(a.buyerParty)}</span>
              </Row>
              <Row label="Seller party">
                <span className="font-mono text-xs">{short(a.sellerParty)}</span>
              </Row>
            </dl>
            <VerifyOnLedger id={a.id} />
          </>
        ) : (
          <p className="text-sm text-muted">This agreement exists in the database only. It has no ledger contract ID or offset.</p>
        )}
        {status.data && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            Canton ledger <ServiceBadge state={status.data.ledger.status} />
          </div>
        )}
      </Section>

      <Section title="Evidence">
        <EvidencePanel agreementId={a.id} files={evidence} canEdit={a.status === 'Awaiting approval' || a.status === 'Approved'} />
      </Section>

      <Section title="AI review">
        <AiReview id={a.id} reviews={reviews} files={evidence} />
      </Section>

      <Section title="Record">
        <dl>
          {a.deadline && (
            <Row label="Deadline">
              {formatDay(a.deadline)}
              {!a.expired && (a.status === 'Awaiting approval' || a.status === 'Approved') && <span className="ml-2 text-xs font-normal text-muted">{dueText(a.deadline)}</span>}
            </Row>
          )}
          <Row label="Last updated">{dateTime(a.updatedAt)}</Row>
        </dl>
        <div className="mt-4 grid gap-2">
          <DownloadButton path={`/agreements/${a.id}/audit.pdf`} filename={`${a.id}-audit-report.pdf`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:opacity-50">
            Audit report (PDF)
          </DownloadButton>
          <DownloadButton path={`/agreements/${a.id}/events.csv`} filename={`${a.id}-history.csv`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:opacity-50">
            History (CSV)
          </DownloadButton>
        </div>
      </Section>
    </>
  )
}

export function AgreementSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useAgreement(id)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])

  useEffect(() => {
    if (!id) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [id])

  async function copy() {
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy the ID')
    }
  }

  return (
    <AnimatePresence>
      {id && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Agreement details"
            className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-3xl sm:border-y-0 sm:border-r-0"
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-center justify-between gap-3 px-6 pt-5">
              <button
                onClick={() => void copy()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-mono text-xs text-muted transition hover:bg-tint/5 hover:text-ink"
                aria-label="Copy agreement ID"
              >
                {id}
                {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
              </button>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-tint/5"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
              {query.isError ? (
                <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
              ) : !query.data ? (
                <div className="space-y-4 pt-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-12 w-1/2" />
                  <Skeleton className="h-40" />
                </div>
              ) : (
                <Details detail={query.data} />
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
