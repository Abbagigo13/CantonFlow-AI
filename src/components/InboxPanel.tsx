import { ArrowRight, Clock } from 'lucide-react'
import { useInbox } from '@/hooks/useApi'
import { dayDiff, dueText, formatDay, formatMoney } from '@/lib/format'
import { Card, ErrorState, Skeleton } from '@/components/ui'

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export function InboxPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const inbox = useInbox()

  if (inbox.isError) {
    return (
      <Card>
        <ErrorState message={inbox.error.message} onRetry={() => void inbox.refetch()} />
      </Card>
    )
  }
  if (!inbox.data) return <Skeleton className="h-28" />

  const { actionNeeded, waiting, expired } = inbox.data
  if (actionNeeded.length === 0 && waiting.length === 0 && expired.length === 0) return null

  return (
    <Card>
      <div className="px-5 pt-5">
        <h2 className="font-display text-lg font-semibold">
          Needs your action
          {actionNeeded.length > 0 && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-semibold text-onaccent tabular-nums">{actionNeeded.length}</span>}
        </h2>
      </div>

      {actionNeeded.length === 0 ? (
        <p className="px-5 pb-2 pt-2 text-sm text-muted">Nothing is waiting on you.</p>
      ) : (
        <ul className="divide-y divide-line px-5 pb-2">
          {actionNeeded.map((i) => (
            <li key={`${i.agreementId}:${i.action}`}>
              <button onClick={() => onSelect(i.agreementId)} className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-4 text-left transition hover:bg-tint/[0.03]">
                <div className="min-w-0">
                  <div className="truncate font-medium">{i.title}</div>
                  <div className="truncate text-sm text-muted">
                    With {i.counterparty} · {formatMoney(i.amount, i.currency)} · {ago(i.since)}
                  </div>
                  {i.deadline && (
                    <div className={`text-xs ${dayDiff(i.deadline) <= 2 ? 'text-warn' : 'text-muted'}`}>{dueText(i.deadline)} · {formatDay(i.deadline)}</div>
                  )}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent">
                  {i.label} <ArrowRight size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {expired.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-bad">Expired</h3>
          <ul className="space-y-1">
            {expired.map((x) => (
              <li key={x.agreementId}>
                <button onClick={() => onSelect(x.agreementId)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm text-muted transition hover:text-ink">
                  <span className="truncate font-medium text-ink">{x.title}</span>
                  <span className="shrink-0 text-xs">was due {formatDay(x.deadline)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Waiting on others</h3>
          <ul className="space-y-1">
            {waiting.map((w) => (
              <li key={w.agreementId}>
                <button onClick={() => onSelect(w.agreementId)} className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-muted transition hover:text-ink">
                  <Clock size={14} className="shrink-0" />
                  <span className="truncate">
                    <span className="font-medium text-ink">{w.title}</span> · {w.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
