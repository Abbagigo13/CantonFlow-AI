import { useState } from 'react'
import clsx from 'clsx'
import { useTimeline } from '@/hooks/useApi'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui'

const RANGES = [7, 30, 90] as const

const W = 640
const H = 200
const PAD = { top: 12, right: 8, bottom: 26, left: 28 }

const day = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

// A round number at or above the largest bar, so the grid lines read cleanly.
function niceMax(value: number): number {
  if (value <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / step) * step
}

export function ActivityChart() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [hover, setHover] = useState<number | null>(null)
  const query = useTimeline(days)

  const points = query.data?.points ?? []
  const created = points.reduce((n, p) => n + p.created, 0)
  const completed = points.reduce((n, p) => n + p.completed, 0)
  const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.created, p.completed))))

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = points.length > 0 ? innerW / points.length : innerW
  const bar = Math.max(2, Math.min(14, slot * 0.34))
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const active = hover !== null ? points[hover] : null

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Activity</h2>
          <p className="text-sm text-muted">Agreements created and completed per day, from your stored history.</p>
        </div>
        <div role="group" aria-label="Time range" className="flex rounded-xl border border-line p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={clsx('min-h-11 rounded-[10px] px-3 sm:min-h-9 text-sm font-medium transition', days === r ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="mt-4 h-52" />
      ) : created + completed === 0 ? (
        <EmptyState title="No activity in this period" description="Create or complete an agreement and it will show up here." />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Created <strong className="tabular-nums">{created}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-ok" /> Completed <strong className="tabular-nums">{completed}</strong>
              </span>
            </div>
            <span className="min-h-5 text-xs text-muted tabular-nums" aria-live="polite">
              {active ? `${day(active.date)}: ${active.created} created, ${active.completed} completed` : 'Hover a day for details'}
            </span>
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-2 w-full touch-pan-y"
            role="img"
            aria-label={`Bar chart: ${created} agreements created and ${completed} completed in the last ${days} days.`}
            onMouseLeave={() => setHover(null)}
          >
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(max * t)} y2={y(max * t)} stroke="currentColor" className="text-line" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(max * t) + 4} textAnchor="end" className="fill-muted text-[10px] tabular-nums">
                  {Math.round(max * t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + slot * i + slot / 2
              return (
                <g key={p.date} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                  <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                  {hover === i && <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} className="fill-tint/5" />}
                  {p.created > 0 && <rect x={cx - bar - 0.5} y={y(p.created)} width={bar} height={PAD.top + innerH - y(p.created)} rx={Math.min(3, bar / 2)} className="fill-accent" />}
                  {p.completed > 0 && <rect x={cx + 0.5} y={y(p.completed)} width={bar} height={PAD.top + innerH - y(p.completed)} rx={Math.min(3, bar / 2)} className="fill-ok" />}
                </g>
              )
            })}
            {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i, n) => {
              const p = points[i]
              if (!p) return null
              return (
                <text key={n} x={PAD.left + slot * i + slot / 2} y={H - 8} textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'} className="fill-muted text-[10px]">
                  {day(p.date)}
                </text>
              )
            })}
          </svg>
        </>
      )}
    </Card>
  )
}
