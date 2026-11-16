import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useDisconnect, useSignMessage } from 'wagmi'
import { Copy, LogOut, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api, sessionToken } from '@/lib/api'
import { SessionProvider, useSignOut, useToken } from '@/lib/session'
import { useCreateOrganization, useMe } from '@/hooks/useApi'
import { ErrorState, PrimaryButton, Skeleton } from '@/components/ui'

export function Screen({ onHome, children }: { onHome: () => void; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-5 py-10 text-ink">
      <div className="w-full max-w-sm">
        <button onClick={onHome} className="mb-10 flex items-center gap-2.5" aria-label="CantonFlow AI home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-display text-lg font-bold text-onaccent">C</span>
          <span className="font-display text-base font-semibold">CantonFlow AI</span>
        </button>
        {children}
      </div>
    </div>
  )
}

const FIELD =
  'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none'

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/user rejected|denied|rejected/i.test(message)) return 'Signature cancelled. Nothing was sent.'
  return message || 'Sign-in failed. Please try again.'
}

function SignIn({ onHome }: { onHome: () => void }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn() {
    if (!address) return
    setBusy(true)
    setError('')
    try {
      const { message } = await api.nonce(address)
      const signature = await signMessageAsync({ message })
      const session = await api.verifySignIn(address, signature)
      sessionToken.set(session.token)
      window.dispatchEvent(new Event('cantonflow:session'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen onHome={onHome}>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in with your wallet</h1>
      <p className="mt-3 text-muted">
        You sign one message to prove you own the wallet. It costs nothing and moves no funds. Your wallet address is your identity here.
      </p>

      <div className="mt-8 space-y-3">
        <ConnectKitButton.Custom>
          {({ show, isConnecting }) =>
            isConnected && address ? (
              <>
                <PrimaryButton className="w-full" onClick={() => void signIn()} disabled={busy}>
                  <Wallet size={18} /> {busy ? 'Check your wallet...' : `Sign in as ${short(address)}`}
                </PrimaryButton>
                <button
                  onClick={() => disconnect()}
                  disabled={busy}
                  className="min-h-11 w-full rounded-xl text-sm font-medium text-muted transition hover:text-ink disabled:opacity-50"
                >
                  Use a different wallet
                </button>
              </>
            ) : (
              <PrimaryButton className="w-full" onClick={show} disabled={isConnecting}>
                <Wallet size={18} /> {isConnecting ? 'Connecting...' : 'Connect wallet'}
              </PrimaryButton>
            )
          }
        </ConnectKitButton.Custom>
        {error && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </Screen>
  )
}

function Onboarding({ address, onHome }: { address: string; onHome: () => void }) {
  const [name, setName] = useState('')
  const create = useCreateOrganization()
  const signOut = useSignOut()

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate(name, { onSuccess: ({ organization }) => toast.success(`${organization.name} created`) })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Address copied')
    } catch {
      toast.error('Could not copy the address')
    }
  }

  return (
    <Screen onHome={onHome}>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Create your organization</h1>
      <p className="mt-3 text-muted">Agreements are made between organizations. The name you choose is what your counterparty types when they create an agreement with you.</p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block text-sm font-medium">
          Organization name
          <input className={`${FIELD} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="Northstar Trading" />
        </label>
        <PrimaryButton type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending ? 'Creating...' : 'Create organization'}
        </PrimaryButton>
        {create.isError && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
            {create.error.message}
          </p>
        )}
      </form>

      <div className="mt-10 border-t border-line pt-6 text-sm">
        <h2 className="font-display text-base font-semibold">Joining an existing organization?</h2>
        <p className="mt-1 text-muted">Ask an owner to add this wallet address on their Team page.</p>
        <button onClick={() => void copy()} className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line px-3 text-left transition hover:bg-raised">
          <span className="break-all font-mono text-xs">{address}</span>
          <Copy size={16} className="shrink-0 text-muted" />
        </button>
      </div>

      <button onClick={() => void signOut()} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition hover:text-ink">
        <LogOut size={16} /> Sign out
      </button>
    </Screen>
  )
}

export function AuthGate({ onHome, children, requireOrg = true }: { onHome: () => void; children: ReactNode; requireOrg?: boolean }) {
  const token = useToken()
  const me = useMe(Boolean(token))
  const signOut = useSignOut()
  const { address: wallet, status } = useAccount()

  // If the person switches accounts in their wallet, end the session instead
  // of showing one wallet's data to another.
  useEffect(() => {
    if (me.data && status === 'connected' && wallet && wallet.toLowerCase() !== me.data.address) void signOut()
  }, [me.data, status, wallet, signOut])

  if (!token) return <SignIn onHome={onHome} />

  if (me.isError) {
    return (
      <Screen onHome={onHome}>
        <ErrorState message={me.error.message} onRetry={() => void me.refetch()} />
      </Screen>
    )
  }

  if (!me.data) {
    return (
      <Screen onHome={onHome}>
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="mt-4 h-24" />
      </Screen>
    )
  }

  // The invite page lets a person without an organization register the one they were invited as.
  if (me.data.organizations.length === 0) return requireOrg ? <Onboarding address={me.data.address} onHome={onHome} /> : <>{children}</>

  return (
    <SessionProvider address={me.data.address} organizations={me.data.organizations} onSignOut={() => void signOut()}>
      {children}
    </SessionProvider>
  )
}
