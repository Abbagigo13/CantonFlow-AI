import { useActivity } from '@/hooks/useApi'
import type { EventKind } from '@/lib/api'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui'

const VERB: Record<EventKind, string> = {
  created: 'created',
  committed: 'committed to the ledger',
  approved: 'approved',
  rejected: 'rejected',
  confirmed: 'confirmed',
  invite_accepted: 'accepted an invite to',
  edited: 'edited',
  cancelled: 'cancelled',
  evidence_added: 'added evidence to',
  evidence_removed: 'removed evidence from',
  ledger_reset: 'was returned to not committed after a ledger reset',
}

const when = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export function ActivityFeed({ onSelect }: { onSelect: (id: string) => void }) {
  const activity = useActivity()

  return (
    <Card>
      <div className="px-5 pt-5">
        <h2 className="font-display text-lg font-semibold">Recent activity</h2>
      </div>
      {activity.isError ? (
        <ErrorState message={activity.error.message} onRetry={() => void activity.refetch()} />
      ) : !activity.data ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : activity.data.items.length === 0 ? (
        <EmptyState title="No activity yet" description="Creating, committing and approving agreements shows up here." />
      ) : (
        <ul className="px-5 pb-3 pt-3">
          {activity.data.items.map((e) => (
            <li key={e.id} className="relative border-l border-line pb-4 pl-5 last:pb-1">
              <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-accent" />
              <button onClick={() => onSelect(e.agreementId)} className="text-left text-sm transition hover:text-accent">
                <span className="font-medium">{e.actor ?? 'The system'}</span> {e.kind === 'ledger_reset' ? '' : VERB[e.kind]}{' '}
                <span className="font-medium">{e.title}</span>
                {e.kind === 'ledger_reset' ? ` ${VERB[e.kind]}` : ''}
              </button>
              <div className="text-xs text-muted tabular-nums">{when(e.at)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
