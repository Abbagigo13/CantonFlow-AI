import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import type { ServiceState, Status } from '@/lib/api'

const STATUS_STYLE: Record<Status, string> = {
  'Awaiting approval': 'bg-warn/10 text-warn',
  Approved: 'bg-accent/10 text-accent',
  Completed: 'bg-ok/10 text-ok',
  Rejected: 'bg-bad/10 text-bad',
  Cancelled: 'bg-tint/5 text-muted',
}

export function StatusBadge({ status, expired = false }: { status: Status; expired?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', STATUS_STYLE[status])}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {status}
      </span>
      {expired && <span className="inline-flex items-center rounded-full bg-bad/10 px-2.5 py-1 text-xs font-medium text-bad">Expired</span>}
    </span>
  )
}

const SERVICE_STYLE: Record<ServiceState, { label: string; cls: string }> = {
  connected: { label: 'Connected', cls: 'bg-ok/10 text-ok' },
  configured: { label: 'Configured', cls: 'bg-accent/10 text-accent' },
  unreachable: { label: 'Unreachable', cls: 'bg-bad/10 text-bad' },
  'not-configured': { label: 'Not configured', cls: 'bg-tint/5 text-muted' },
}

export function ServiceBadge({ state }: { state: ServiceState }) {
  const { label, cls } = SERVICE_STYLE[state]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-2xl border border-line bg-surface', className)}>{children}</section>
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton', className)} />
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-raised text-muted">
        <Inbox size={22} />
      </span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-bad/10 text-bad">
        <AlertTriangle size={22} />
      </span>
      <h3 className="font-display text-lg font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      <button
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised"
      >
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  )
}

export function PrimaryButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-onaccent transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  )
}
