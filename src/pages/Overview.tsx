import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useAgreements, useMetrics, useSystemStatus } from '@/hooks/useApi'
import { formatDate, formatMoney } from '@/lib/format'
import { STATUSES } from '@/lib/api'
import type { Route } from '@/lib/router'
import { ActivityChart } from '@/components/ActivityChart'
import { ActivityFeed } from '@/components/ActivityFeed'
import { InboxPanel } from '@/components/InboxPanel'
import { Card, EmptyState, ErrorState, PrimaryButton, ServiceBadge, Skeleton, StatusBadge } from '@/components/ui'

function Stat({ label, children, note }: { label: string; children: React.ReactNode; note: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="h-full p-5">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</div>
        <div className="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight">{children}</div>
        <div className="mt-1 text-sm text-muted">{note}</div>
      </Card>
    </motion.div>
  )
}

export function Overview({ onCreate, onNavigate, onSelect }: { onCreate: () => void; onNavigate: (to: Route) => void; onSelect: (id: string) => void }) {
  const metrics = useMetrics()
  const recent = useAgreements('', 'All')
  const status = useSystemStatus()

  const m = metrics.data

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-muted">Workspace</div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Overview</h1>
        </div>
        <PrimaryButton onClick={onCreate} className="hidden sm:inline-flex">
          <Plus size={18} /> New agreement
        </PrimaryButton>
      </header>

      {status.data && status.data.ledger.status !== 'connected' && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <ServiceBadge state={status.data.ledger.status} />
          <span className="text-muted">Agreements are stored in the database only. None are committed to a Canton ledger.</span>
        </div>
      )}

      <InboxPanel onSelect={onSelect} />

      {metrics.isError ? (
        <Card>
          <ErrorState message={metrics.error.message} onRetry={() => void metrics.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!m ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)
          ) : (
            <>
              <Stat label="Agreements" note="Stored records">
                {m.total}
              </Stat>
              <Stat label="Awaiting approval" note="Need a decision">
                {m.byStatus['Awaiting approval']}
              </Stat>
              <Stat label="On ledger" note="Committed to Canton">
                {m.onLedger}
              </Stat>
              <Stat label="Total value" note={m.valueByCurrency.length > 1 ? 'Per currency' : 'All agreements'}>
                {m.valueByCurrency.length === 0 ? (
                  '0'
                ) : (
                  <div className="space-y-0.5 text-lg leading-tight sm:text-xl">
                    {m.valueByCurrency.map((v) => (
                      <div key={v.currency}>{formatMoney(v.total, v.currency)}</div>
                    ))}
                  </div>
                )}
              </Stat>
            </>
          )}
        </div>
      )}

      {m && m.total > 0 && <ActivityChart />}

      {m && m.total > 0 && (
        <Card className="p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-muted">Status breakdown</div>
          <div className="flex h-2 overflow-hidden rounded-full bg-raised">
            {STATUSES.map((s) => (
              <div
                key={s}
                style={{ width: `${(m.byStatus[s] / m.total) * 100}%` }}
                className={{ 'Awaiting approval': 'bg-warn', Approved: 'bg-accent', Completed: 'bg-ok', Rejected: 'bg-bad', Cancelled: 'bg-muted' }[s]}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {m.expired > 0 && (
              <span className="tabular-nums text-bad">
                Expired <strong>{m.expired}</strong>
              </span>
            )}
            {STATUSES.map((s) => (
              <span key={s} className="tabular-nums">
                {s} <strong className="text-ink">{m.byStatus[s]}</strong>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-display text-lg font-semibold">Recent agreements</h2>
          <button onClick={() => onNavigate('/agreements')} className="min-h-11 px-2 text-sm font-medium text-accent hover:underline">
            View all
          </button>
        </div>
        {recent.isError ? (
          <ErrorState message={recent.error.message} onRetry={() => void recent.refetch()} />
        ) : !recent.data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : recent.data.agreements.length === 0 ? (
          <EmptyState
            title="No agreements yet"
            description="Create your first agreement. It is saved to the database and appears here immediately."
            action={
              <PrimaryButton onClick={onCreate}>
                <Plus size={18} /> Create first agreement
              </PrimaryButton>
            }
          />
        ) : (
          <ul className="divide-y divide-line px-5 pb-2">
            {recent.data.agreements.slice(0, 5).map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onSelect(a.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-4 text-left transition hover:bg-tint/[0.03]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.title}</div>
                    <div className="truncate text-sm text-muted">
                      {a.buyer} to {a.seller} · {formatDate(a.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-medium tabular-nums">{formatMoney(a.amount, a.currency)}</span>
                    <StatusBadge status={a.status} expired={a.expired} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ActivityFeed onSelect={onSelect} />
    </div>
  )
}
