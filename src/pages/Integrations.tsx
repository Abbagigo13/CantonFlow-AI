import { Bot, Database, Network, Server } from 'lucide-react'
import { useSystemStatus } from '@/hooks/useApi'
import type { ServiceStatus } from '@/lib/api'
import { Card, ErrorState, ServiceBadge, Skeleton } from '@/components/ui'

function ServiceCard({ icon: Icon, title, subtitle, service }: { icon: typeof Server; title: string; subtitle: string; service: ServiceStatus }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-raised text-accent">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">{title}</h2>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        <ServiceBadge state={service.status} />
      </div>
      <p className="mt-4 text-sm text-muted">{service.detail}</p>
      {(service.latencyMs !== undefined || service.version || service.participantId) && (
        <dl className="mt-4 flex gap-6 border-t border-line pt-4 text-sm">
          {service.latencyMs !== undefined && (
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted">Latency</dt>
              <dd className="font-mono tabular-nums">{service.latencyMs} ms</dd>
            </div>
          )}
          {service.version && (
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted">Version</dt>
              <dd className="font-mono">{service.version}</dd>
            </div>
          )}
        </dl>
      )}
      {service.participantId && (
        <div className="mt-3 text-sm">
          <div className="text-xs uppercase tracking-[0.08em] text-muted">Participant</div>
          <div className="break-all font-mono text-xs">{service.participantId}</div>
        </div>
      )}
    </Card>
  )
}

export function Integrations() {
  const status = useSystemStatus()

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs font-medium uppercase tracking-[0.1em] text-muted">System</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-2 text-sm text-muted">Live checks against each service. A service shows Connected only when it answers.</p>
      </header>

      {status.isError ? (
        <Card>
          <ErrorState message={status.error.message} onRetry={() => void status.refetch()} />
        </Card>
      ) : !status.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ServiceCard icon={Server} title="API server" subtitle="CantonFlow backend" service={status.data.api} />
            <ServiceCard icon={Database} title="PostgreSQL" subtitle="Agreement storage" service={status.data.database} />
            <ServiceCard icon={Network} title="Canton ledger" subtitle="JSON Ledger API" service={status.data.ledger} />
            <ServiceCard icon={Bot} title="AI provider" subtitle="Agreement review" service={status.data.ai} />
          </div>
          <p className="text-xs text-muted tabular-nums">Last checked {new Date(status.data.timestamp).toLocaleTimeString()}</p>
        </>
      )}
    </div>
  )
}
