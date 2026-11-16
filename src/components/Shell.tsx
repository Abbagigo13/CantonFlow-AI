import type { ReactNode } from 'react'
import { LayoutDashboard, FileText, LogOut, Plug, Plus, Users } from 'lucide-react'
import clsx from 'clsx'
import type { Route } from '@/lib/router'
import { PrimaryButton } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useInboxAlerts } from '@/hooks/useInboxAlerts'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV: { to: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/agreements', label: 'Agreements', icon: FileText },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/integrations', label: 'Integrations', icon: Plug },
]

interface Props {
  route: Route
  onNavigate: (to: Route) => void
  onCreate: () => void
  children: ReactNode
}

export function Shell({ route, onNavigate, onCreate, children }: Props) {
  const session = useSession()
  const pending = useInboxAlerts()
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface/60 p-5 lg:flex">
        <button onClick={() => onNavigate('/')} aria-label="CantonFlow AI home" className="mb-8 flex items-center gap-3 px-2 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-display text-lg font-bold text-onaccent">C</span>
          <div className="leading-tight">
            <div className="font-display text-base font-semibold">CantonFlow AI</div>
            <div className="text-xs text-muted">Private agreements</div>
          </div>
        </button>

        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => onNavigate(to)}
              aria-current={route === to ? 'page' : undefined}
              className={clsx(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                route === to ? 'bg-raised text-ink' : 'text-muted hover:bg-tint/5 hover:text-ink',
              )}
            >
              <Icon size={18} />
              {label}
              {to === '/dashboard' && pending > 0 && (
                <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-onaccent tabular-nums" aria-label={`${pending} need your action`}>
                  {pending}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <PrimaryButton onClick={onCreate} className="w-full">
            <Plus size={18} /> New agreement
          </PrimaryButton>
          <ThemeToggle className="w-full justify-between" />
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <div className="min-w-0 px-1">
              <div className="truncate text-sm font-medium">{session.activeOrg.name}</div>
              <div className="font-mono text-xs text-muted">{`${session.address.slice(0, 6)}...${session.address.slice(-4)}`}</div>
            </div>
            <button onClick={session.signOut} aria-label="Sign out" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-tint/5 hover:text-ink">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:max-w-none lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <button
        onClick={onCreate}
        aria-label="New agreement"
        className="fixed bottom-20 right-4 z-20 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-onaccent shadow-lg shadow-black/40 transition active:scale-95 lg:hidden"
      >
        <Plus size={24} />
      </button>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <button
            key={to}
            onClick={() => onNavigate(to)}
            aria-current={route === to ? 'page' : undefined}
            className={clsx(
              'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium',
              route === to ? 'text-accent' : 'text-muted',
            )}
          >
            <span className="relative">
              <Icon size={20} />
              {to === '/dashboard' && pending > 0 && (
                <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-onaccent tabular-nums">{pending}</span>
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
