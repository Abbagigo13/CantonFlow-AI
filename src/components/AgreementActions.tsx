import { useState } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAgreementAction, useSystemStatus, useVerifyAgreement } from '@/hooks/useApi'
import type { Agreement, AgreementAction, Permissions } from '@/lib/api'
import { PrimaryButton } from '@/components/ui'

const GHOST =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50'

function Waiting({ who, what, registered }: { who: string; what: string; registered: boolean }) {
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>
        Waiting for <span className="font-medium text-ink">{who}</span> {what}.
      </p>
      {!registered && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-warn">
          {who} has not registered on CantonFlow yet. They need to sign in and create an organization with exactly this name before they can act.
        </p>
      )}
    </div>
  )
}

export function AgreementActions({ a, permissions, registered }: { a: Agreement; permissions: Permissions; registered: { buyer: boolean; seller: boolean } }) {
  const act = useAgreementAction(a.id)
  const status = useSystemStatus()
  const [confirmingReject, setConfirmingReject] = useState(false)

  const ledgerUp = status.data?.ledger.status === 'connected'
  const committed = a.ledgerStatus === 'committed'
  const busy = act.isPending

  function run(action: AgreementAction, message: string) {
    setConfirmingReject(false)
    act.mutate(action, { onSuccess: () => toast.success(message) })
  }

  let body: React.ReactNode

  if (a.expired) {
    body = <p className="text-sm text-muted">This agreement expired, so there are no actions to take.</p>
  } else if (a.status === 'Completed' || a.status === 'Rejected' || a.status === 'Cancelled') {
    body = <p className="text-sm text-muted">This agreement is {a.status.toLowerCase()}. No further actions.</p>
  } else if (!committed) {
    body = permissions.canCommit ? (
      <div className="space-y-2">
        <PrimaryButton className="w-full" disabled={busy || !ledgerUp} onClick={() => run('commit', 'Committed to the ledger')}>
          {busy ? 'Waiting for the ledger...' : `Commit to ledger for ${a.seller}`}
        </PrimaryButton>
        <p className="text-sm text-muted">
          {ledgerUp
            ? 'Creates the contract on the Canton ledger. The buyer can approve only after this.'
            : 'The Canton ledger is not reachable, so this agreement cannot be committed right now.'}
        </p>
      </div>
    ) : (
      <Waiting who={a.seller} what="to commit this agreement to the ledger" registered={registered.seller} />
    )
  } else if (a.status === 'Awaiting approval') {
    body = permissions.canApprove ? (
      <div className="space-y-2">
        <PrimaryButton className="w-full" disabled={busy || !ledgerUp} onClick={() => run('approve', 'Approved on the ledger')}>
          {busy ? 'Waiting for the ledger...' : `Approve for ${a.buyer}`}
        </PrimaryButton>
        {confirmingReject ? (
          <div className="flex gap-2">
            <button className={GHOST} onClick={() => setConfirmingReject(false)}>
              Keep
            </button>
            <button className={`${GHOST} !border-bad/40 text-bad`} disabled={busy} onClick={() => run('reject', 'Rejected on the ledger')}>
              Confirm reject
            </button>
          </div>
        ) : (
          <button className={GHOST} disabled={busy || !ledgerUp} onClick={() => setConfirmingReject(true)}>
            Reject for {a.buyer}
          </button>
        )}
      </div>
    ) : (
      <Waiting who={a.buyer} what="to approve or reject" registered={registered.buyer} />
    )
  } else if (a.status === 'Approved') {
    body = permissions.canConfirm ? (
      <PrimaryButton className="w-full" disabled={busy || !ledgerUp} onClick={() => run('confirm', 'Confirmed on the ledger')}>
        {busy ? 'Waiting for the ledger...' : `Confirm for ${a.seller}`}
      </PrimaryButton>
    ) : (
      <Waiting who={a.seller} what="to confirm" registered={registered.seller} />
    )
  }

  return (
    <>
      <p className="mb-3 text-sm text-muted">
        You are acting as the <span className="font-medium text-ink">{permissions.role}</span> ({permissions.role === 'buyer' ? a.buyer : a.seller}).
      </p>
      {body}
      {act.isError && (
        <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {act.error.message}
        </p>
      )}
    </>
  )
}

export function VerifyOnLedger({ id }: { id: string }) {
  const verify = useVerifyAgreement(id)

  return (
    <div className="mt-4">
      <button className={GHOST} disabled={verify.isPending} onClick={() => verify.mutate()}>
        <ShieldCheck size={16} /> {verify.isPending ? 'Checking the ledger...' : 'Verify on ledger'}
      </button>
      {verify.isError && (
        <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {verify.error.message}
        </p>
      )}
      {verify.data && (
        <div className="mt-4 space-y-3">
          <p className={verify.data.verified ? 'text-sm font-medium text-ok' : 'text-sm font-medium text-bad'}>
            {verify.data.verified ? 'Verified: the ledger matches this record.' : 'Mismatch: the ledger does not match this record.'}
          </p>
          <ul className="space-y-2">
            {verify.data.checks.map((c) => (
              <li key={c.name} className="flex gap-2.5 text-sm">
                <span className={c.ok ? 'mt-0.5 text-ok' : 'mt-0.5 text-bad'}>{c.ok ? <Check size={16} /> : <X size={16} />}</span>
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
