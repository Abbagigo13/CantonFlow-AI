import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, Info, OctagonAlert, Sparkles } from 'lucide-react'
import { useReviewAgreement, useSystemStatus } from '@/hooks/useApi'
import type { ComparisonRow, EvidenceFile, Finding, Review } from '@/lib/api'

const MAX_EVIDENCE = 8000
const MAX_FILES = 5

const RESULT_STYLE: Record<ComparisonRow['result'], string> = {
  match: 'bg-ok/10 text-ok',
  mismatch: 'bg-bad/10 text-bad',
  'not found': 'bg-tint/5 text-muted',
}

const RISK_STYLE = { low: 'bg-ok/10 text-ok', medium: 'bg-warn/10 text-warn', high: 'bg-bad/10 text-bad' } as const

const SEVERITY: Record<Finding['severity'], { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: 'text-muted' },
  warning: { icon: AlertTriangle, cls: 'text-warn' },
  critical: { icon: OctagonAlert, cls: 'text-bad' },
}

const when = (iso: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

function ReviewView({ review }: { review: Review }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize', RISK_STYLE[review.risk])}>
          {review.risk} risk
        </span>
        <span className="text-xs text-muted">
          {review.model} · {when(review.createdAt)} · {review.hadEvidence ? 'with evidence' : 'record only'}
        </span>
      </div>
      <p className="text-sm">{review.summary}</p>
      {review.files.length > 0 && (
        <p className="text-xs text-muted">Files reviewed: {review.files.map((f) => f.filename).join(', ')}</p>
      )}
      {review.comparison.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Record against evidence</h4>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {review.comparison.map((row, i) => (
              <li key={i} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{row.field}</span>
                  <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium capitalize', RESULT_STYLE[row.result])}>{row.result}</span>
                </div>
                <div className="mt-1 grid gap-0.5 text-xs text-muted">
                  <span>
                    Record: <span className="text-ink">{row.record || 'none'}</span>
                  </span>
                  <span>
                    Evidence: <span className="text-ink">{row.evidence || 'not stated'}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="space-y-3">
        {review.findings.map((f, i) => {
          const { icon: Icon, cls } = SEVERITY[f.severity]
          return (
            <li key={i} className="flex gap-2.5 text-sm">
              <Icon size={16} className={clsx('mt-0.5 shrink-0', cls)} />
              <span>
                <span className="font-medium">{f.title}</span>
                <span className="block text-muted">{f.detail}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AiReview({ id, reviews, files }: { id: string; reviews: Review[]; files: EvidenceFile[] }) {
  const [evidence, setEvidence] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const seen = useRef<Set<string>>(new Set())
  const review = useReviewAgreement(id)
  const status = useSystemStatus()

  // New readable files are included automatically (up to the limit); removed ones drop out.
  useEffect(() => {
    const ids = new Set(files.map((f) => f.id))
    setPicked((current) => {
      const next = current.filter((x) => ids.has(x))
      for (const f of files) {
        if (!seen.current.has(f.id)) {
          seen.current.add(f.id)
          if (f.readable && next.length < MAX_FILES) next.push(f.id)
        }
      }
      return next
    })
  }, [files])

  const aiUp = status.data?.ai.status === 'connected'
  const readable = files.filter((f) => f.readable)
  const [latest, ...earlier] = reviews

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Advice only. A review never approves, rejects or changes an agreement.</p>
      <p className="text-xs text-muted">Selected files and pasted text are sent to the AI provider for the review. Nothing is sent until you run it.</p>

      {readable.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">Files to include</legend>
          <ul className="mt-1.5 space-y-1">
            {readable.map((f) => {
              const on = picked.includes(f.id)
              const blocked = !on && picked.length >= MAX_FILES
              return (
                <li key={f.id}>
                  <label className={clsx('flex min-h-11 items-center gap-3 text-sm', blocked && 'opacity-50')}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={blocked}
                      onChange={() => setPicked((cur) => (on ? cur.filter((x) => x !== f.id) : [...cur, f.id]))}
                      className="h-4 w-4 accent-[rgb(var(--c-accent))]"
                    />
                    <span className="truncate">{f.filename}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          {readable.length > MAX_FILES && <p className="text-xs text-muted">Up to {MAX_FILES} files per review.</p>}
        </fieldset>
      )}

      <label className="block text-sm font-medium">
        Pasted evidence (optional)
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          maxLength={MAX_EVIDENCE}
          rows={4}
          placeholder="Paste text from an invoice, purchase order or message to compare with this record."
          className="mt-1.5 w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-normal placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <span className="mt-1 block text-right text-xs font-normal text-muted tabular-nums">
          {evidence.length} / {MAX_EVIDENCE}
        </span>
      </label>

      <button
        onClick={() => review.mutate({ evidence, evidenceIds: picked })}
        disabled={review.isPending || !aiUp}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles size={16} />{' '}
        {review.isPending ? 'Reviewing, this can take up to a minute...' : picked.length > 0 ? `Run AI review with ${picked.length} file${picked.length === 1 ? '' : 's'}` : 'Run AI review'}
      </button>
      {!aiUp && status.data && <p className="text-sm text-muted">{status.data.ai.detail}</p>}

      {review.isError && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {review.error.message}
        </p>
      )}

      {latest ? <ReviewView review={latest} /> : <p className="text-sm text-muted">No review has been run for this agreement.</p>}

      {earlier.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-muted">Earlier reviews ({earlier.length})</summary>
          <div className="space-y-6 pt-3">
            {earlier.map((r) => (
              <ReviewView key={r.id} review={r} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
