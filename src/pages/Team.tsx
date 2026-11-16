import { useState, type FormEvent } from 'react'
import { Copy, LogOut, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAddMember, useCreateOrganization, useMembers, useRemoveMember } from '@/hooks/useApi'
import { useSession } from '@/lib/session'
import { formatDate } from '@/lib/format'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Card, ErrorState, PrimaryButton, Skeleton } from '@/components/ui'

const FIELD =
  'min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none'

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error('Could not copy')
  }
}

export function Team() {
  const session = useSession()
  const org = session.activeOrg
  const members = useMembers(org.key)
  const add = useAddMember(org.key)
  const remove = useRemoveMember(org.key)
  const createOrg = useCreateOrganization()
  const [address, setAddress] = useState('')
  const [newOrg, setNewOrg] = useState('')
  const isOwner = org.role === 'owner'

  function submitMember(e: FormEvent) {
    e.preventDefault()
    add.mutate(address.trim(), {
      onSuccess: () => {
        setAddress('')
        toast.success('Member added')
      },
    })
  }

  function submitOrg(e: FormEvent) {
    e.preventDefault()
    createOrg.mutate(newOrg, {
      onSuccess: ({ organization }) => {
        setNewOrg('')
        session.setActiveOrg(organization.key)
        toast.success(`${organization.name} created`)
      },
    })
  }

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs font-medium uppercase tracking-[0.1em] text-muted">Account</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Team</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Everyone in an organization can see its agreements and act for it. Members are identified by wallet address.
        </p>
      </header>

      {session.organizations.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Organizations">
          {session.organizations.map((o) => (
            <button
              key={o.key}
              role="tab"
              aria-selected={o.key === org.key}
              onClick={() => session.setActiveOrg(o.key)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition ${o.key === org.key ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink'}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <h2 className="font-display text-lg font-semibold">{org.name}</h2>
          <span className="rounded-full bg-tint/5 px-2.5 py-1 text-xs font-medium capitalize text-muted">You are {org.role === 'owner' ? 'an owner' : 'a member'}</span>
        </div>

        {members.isError ? (
          <ErrorState message={members.error.message} onRetry={() => void members.refetch()} />
        ) : !members.data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <ul className="divide-y divide-line px-5 pb-2 pt-3">
            {members.data.members.map((m) => {
              const me = m.address === session.address
              return (
                <li key={m.address} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs sm:text-sm">{m.address}</div>
                    <div className="text-sm text-muted">
                      <span className="capitalize">{m.role}</span> · since {formatDate(m.since)}
                      {me && <span className="ml-2 text-accent">You</span>}
                    </div>
                  </div>
                  {(isOwner || me) && (
                    <button
                      onClick={() => remove.mutate(m.address, { onSuccess: () => toast.success(me ? 'You left the organization' : 'Member removed') })}
                      disabled={remove.isPending}
                      aria-label={me ? 'Leave organization' : `Remove ${m.address}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-bad/10 hover:text-bad disabled:opacity-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {remove.isError && (
          <p role="alert" className="mx-5 mb-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
            {remove.error.message}
          </p>
        )}

        {isOwner && (
          <form onSubmit={submitMember} className="border-t border-line p-5">
            <label className="block text-sm font-medium">
              Add a member by wallet address
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input className={`${FIELD} font-mono`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x..." required spellCheck={false} />
                <PrimaryButton type="submit" disabled={add.isPending} className="sm:w-32">
                  {add.isPending ? 'Adding...' : 'Add'}
                </PrimaryButton>
              </div>
            </label>
            {add.isError && (
              <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
                {add.error.message}
              </p>
            )}
          </form>
        )}
      </Card>

      <section className="space-y-3 border-t border-line pt-6">
        <h2 className="font-display text-lg font-semibold">Appearance</h2>
        <ThemeToggle />
      </section>

      <section className="space-y-3 border-t border-line pt-6">
        <h2 className="font-display text-lg font-semibold">Your wallet</h2>
        <button
          onClick={() => void copy(session.address, 'Address copied')}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line px-3 text-left transition hover:bg-raised sm:max-w-xl"
        >
          <span className="break-all font-mono text-xs">{session.address}</span>
          <Copy size={16} className="shrink-0 text-muted" />
        </button>
        <button onClick={session.signOut} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised">
          <LogOut size={16} /> Sign out
        </button>
      </section>

      <details className="border-t border-line pt-4">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-muted">Create another organization</summary>
        <form onSubmit={submitOrg} className="mt-3 flex flex-col gap-2 sm:max-w-xl sm:flex-row">
          <input className={FIELD} value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder="Organization name" maxLength={100} required />
          <PrimaryButton type="submit" disabled={createOrg.isPending} className="sm:w-40">
            {createOrg.isPending ? 'Creating...' : 'Create'}
          </PrimaryButton>
        </form>
        {createOrg.isError && (
          <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad sm:max-w-xl">
            {createOrg.error.message}
          </p>
        )}
      </details>
    </div>
  )
}
