import { useEffect, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateInvite } from '@/hooks/useApi'
import { buildShareLink, getShareBase } from '@/lib/share'
import { formatDay } from '@/lib/format'
import type { Agreement } from '@/lib/api'

const GHOST =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50'

// Creates a one-time link for the other side. The link carries a secret, so it
// goes in the #fragment (which is never sent to a server) and is shown once.
export function InviteButton({ a, counterparty, registered }: { a: Agreement; counterparty: string; registered: boolean }) {
  const create = useCreateInvite(a.id)
  const [link, setLink] = useState<string | null>(null)
  const [expires, setExpires] = useState('')
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)

  // Resolve the share base once so copying works inside the click.
  useEffect(() => {
    void getShareBase().then(() => setReady(true))
  }, [])

  if (!['Awaiting approval', 'Approved'].includes(a.status) || a.expired) return null

  async function make() {
    const made = await create.mutateAsync()
    setLink(`${await buildShareLink('/invite')}#${made.token}`)
    setExpires(made.expiresAt.slice(0, 10))
    setCopied(false)
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Invite link copied')
    } catch {
      toast.error('Copy failed. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-line pt-4">
      {link ? (
        <>
          <label className="block text-sm font-medium">
            Link for {counterparty}
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 font-mono text-xs text-ink focus:border-accent focus:outline-none" />
          </label>
          <button className={GHOST} onClick={() => void copy()} disabled={!ready}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="text-xs text-muted">
            It works once, until {formatDay(expires)}. It is shown only now, so copy it before you close this. Making a new link cancels this one.
          </p>
        </>
      ) : (
        <>
          <button className={GHOST} onClick={() => void make().catch(() => undefined)} disabled={create.isPending}>
            <Link2 size={16} /> {create.isPending ? 'Creating link...' : `Invite ${counterparty}`}
          </button>
          <p className="text-xs text-muted">
            {registered
              ? `${counterparty} is already on CantonFlow. The link opens this agreement for their members.`
              : `${counterparty} is not on CantonFlow yet. The link lets them register under exactly this name, so nobody else can claim it.`}
          </p>
        </>
      )}
      {create.isError && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {create.error.message}
        </p>
      )}
    </div>
  )
}
