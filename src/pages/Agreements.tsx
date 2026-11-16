import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useAgreements } from '@/hooks/useApi'
import { STATUSES, type Status } from '@/lib/api'
import { formatDate, formatDay, formatMoney } from '@/lib/format'
import { DownloadButton } from '@/components/DownloadButton'
import { Card, EmptyState, ErrorState, PrimaryButton, Skeleton, StatusBadge } from '@/components/ui'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

type Density = 'comfortable' | 'compact'
const DENSITY_KEY = 'cantonflow.density'

export function Agreements({ onCreate, onSelect }: { onCreate: () => void; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status | 'Expired' | 'All'>('All')
  const [density, setDensityState] = useState<Density>(() => (localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'))
  const compact = density === 'compact'
  const setDensity = (next: Density) => {
    localStorage.setItem(DENSITY_KEY, next)
    setDensityState(next)
  }
  const debounced = useDebounced(search.trim(), 250)
  const query = useAgreements(debounced, status)

  const filtering = debounced !== '' || status !== 'All'
  const rows = query.data?.agreements ?? []
  const exportParams = new URLSearchParams()
  if (debounced) exportParams.set('search', debounced)
  if (status !== 'All') exportParams.set('status', status)
  const exportQuery = exportParams.size > 0 ? `?${exportParams.toString()}` : ''

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-muted">Workspace</div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Agreements</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="Row density" className="hidden rounded-xl border border-line p-0.5 sm:inline-flex">
            {(['comfortable', 'compact'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                aria-pressed={density === d}
                className={`min-h-10 rounded-[10px] px-3 text-sm font-medium capitalize transition ${density === d ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <DownloadButton path={`/export/agreements.csv${exportQuery}`} filename="cantonflow-agreements.csv">
            Export CSV
          </DownloadButton>
          <PrimaryButton onClick={onCreate} className="hidden sm:inline-flex">
            <Plus size={18} /> New agreement
          </PrimaryButton>
        </div>
      </header>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search agreements</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, party or ID"
              className="min-h-11 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
          </label>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | 'Expired' | 'All')}
            className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm focus:border-accent focus:outline-none"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option>Expired</option>
          </select>
        </div>

        {query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtering ? 'No matching agreements' : 'No agreements yet'}
            description={filtering ? 'Try a different search or status filter.' : 'Create an agreement to see it listed here.'}
            action={
              !filtering && (
                <PrimaryButton onClick={onCreate}>
                  <Plus size={18} /> Create first agreement
                </PrimaryButton>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Agreement</th>
                    <th className="px-3 py-3 font-medium">Buyer</th>
                    <th className="px-3 py-3 font-medium">Seller</th>
                    {compact && <th className="px-3 py-3 font-medium">Due</th>}
                    <th className="px-3 py-3 text-right font-medium">Value</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((a) => (
                    <tr key={a.id} onClick={() => onSelect(a.id)} className="cursor-pointer transition hover:bg-tint/[0.03]">
                      <td className={compact ? 'px-5 py-1.5' : 'px-5 py-4'}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelect(a.id)
                          }}
                          className="text-left font-medium hover:text-accent"
                        >
                          {a.title}
                        </button>
                        {compact ? (
                          <span className="ml-2 font-mono text-xs text-muted">{a.id}</span>
                        ) : (
                          <div className="font-mono text-xs text-muted">
                            {a.id} · {formatDate(a.createdAt)}
                            {a.deadline ? ` · due ${formatDay(a.deadline)}` : ''}
                          </div>
                        )}
                      </td>
                      <td className={compact ? 'px-3 py-1.5' : 'px-3 py-4'}>{a.buyer}</td>
                      <td className={compact ? 'px-3 py-1.5' : 'px-3 py-4'}>{a.seller}</td>
                      {compact && <td className={`px-3 py-1.5 tabular-nums ${a.expired ? 'text-bad' : 'text-muted'}`}>{a.deadline ? formatDay(a.deadline) : ''}</td>}
                      <td className={`${compact ? 'px-3 py-1.5' : 'px-3 py-4'} text-right font-medium tabular-nums`}>{formatMoney(a.amount, a.currency)}</td>
                      <td className={compact ? 'px-5 py-1.5' : 'px-5 py-4'}>
                        <StatusBadge status={a.status} expired={a.expired} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <button onClick={() => onSelect(a.id)} className={`w-full text-left transition active:bg-tint/[0.04] ${compact ? 'space-y-1 px-4 py-2.5' : 'space-y-2 p-4'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.title}</div>
                        <div className="font-mono text-xs text-muted">
                          {a.id}
                          {a.deadline ? ` · due ${formatDay(a.deadline)}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(a.amount, a.currency)}</span>
                    </div>
                    {!compact && (
                      <div className="truncate text-sm text-muted">
                        {a.buyer} to {a.seller}
                      </div>
                    )}
                    <StatusBadge status={a.status} expired={a.expired} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {query.data && (
          <div className="border-t border-line px-5 py-3 text-sm text-muted tabular-nums">
            Showing {rows.length} of {query.data.total}
          </div>
        )}
      </Card>
    </div>
  )
}
