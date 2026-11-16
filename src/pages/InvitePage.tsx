import { useState } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Screen } from '@/components/AuthGate'
import { ErrorState, PrimaryButton, Skeleton } from '@/components/ui'
import { useAcceptInvite, useMe, usePreviewInvite } from '@/hooks/useApi'
import { formatDay, formatMoney } from '@/lib/format'

export function InvitePage({ onHome, onOpen }: { onHome: () => void; onOpen: (agreementId: string) => void }) {
  // The secret lives in the #fragment, so it is never sent to a server or kept in history entries.
  const [token] = useState(() => window.location.hash.slice(1))
  const me = useMe(true)
  const preview = usePreviewInvite(token)
  const accept = useAcceptInvite()

  function go(agreementId: string) {
    window.history.replaceState(null, '', window.location.pathname)
    onOpen(agreementId)
  }

  if (!token) {
    return (
      <Screen onHome={onHome}>
        <h1 className="font-display text-2xl font-semibold">This link is incomplete</h1>
        <p className="mt-2 text-sm text-muted">Open the full invite link you were sent. It has a long code after the # sign.</p>
      </Screen>
    )
  }
  if (preview.isError) {
    return (
      <Screen onHome={onHome}>
        <ErrorState message={preview.error.message} onRetry={() => void preview.refetch()} />
      </Screen>
    )
  }
  if (!preview.data) {
    return (
      <Screen onHome={onHome}>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-4 h-28" />
      </Screen>
    )
  }

  const p = preview.data
  const blocked = p.targetRegistered && !p.youBelong

  return (
    <Screen onHome={onHome}>
      <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight">{p.inviter} invited you to review an agreement</h1>
      <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted">Agreement</dt>
          <dd className="text-right font-medium">{p.title}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted">Value</dt>
          <dd className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted">You are</dt>
          <dd className="text-right font-medium">{p.targetName}</dd>
        </div>
        {p.deadline && (
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">Deadline</dt>
            <dd className="font-medium">{formatDay(p.deadline)}</dd>
          </div>
        )}
      </dl>

      {blocked ? (
        <div className="mt-6 space-y-3 text-sm">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-warn">{p.targetName} is already registered on CantonFlow, and this wallet is not a member. Ask one of its owners to add your wallet on the Team page.</p>
          {me.data && (
            <button
              onClick={() => void navigator.clipboard.writeText(me.data.address).then(() => toast.success('Address copied'))}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line px-3 font-mono text-xs"
            >
              {me.data.address}
              <Copy size={14} />
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {p.targetRegistered
              ? `You belong to ${p.targetName}, so you can open this agreement.`
              : `Accepting registers ${p.targetName} as your organization, with this wallet as its owner. Only people with this link can claim that name for this agreement.`}
          </p>
          <PrimaryButton
            className="mt-4 w-full"
            disabled={accept.isPending}
            onClick={() => accept.mutate(token, { onSuccess: (r) => go(r.agreementId), onError: () => undefined })}
          >
            {accept.isPending ? 'Working...' : p.targetRegistered ? 'Open the agreement' : `Register ${p.targetName} and open`}
          </PrimaryButton>
        </>
      )}
      {accept.isError && (
        <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {accept.error.message}
        </p>
      )}
      <p className="mt-6 text-xs text-muted">This link works once and expires on {formatDay(p.expiresAt.slice(0, 10))}.</p>
    </Screen>
  )
}
