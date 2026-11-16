import { useRef, useState } from 'react'
import { Download, FileImage, FileText, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useRemoveEvidence, useUploadEvidence } from '@/hooks/useApi'
import { download, type EvidenceFile } from '@/lib/api'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
const day = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))

function FileRow({ file, agreementId, canEdit }: { file: EvidenceFile; agreementId: string; canEdit: boolean }) {
  const remove = useRemoveEvidence(agreementId)
  const [confirming, setConfirming] = useState(false)
  const Icon = file.kind === 'pdf' ? FileText : FileImage

  async function save() {
    try {
      await download(`/evidence/${file.id}`, file.filename)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The download failed.')
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Icon size={20} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.filename}</div>
          <div className="text-xs text-muted">
            {size(file.size)} · added by the {file.side} · {day(file.uploadedAt)}
            {file.pages ? ` · ${file.pages} page${file.pages === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <button onClick={() => void save()} aria-label={`Download ${file.filename}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-tint/5 hover:text-ink">
          <Download size={18} />
        </button>
        {file.canRemove && canEdit && (
          <button
            onClick={() => (confirming ? remove.mutate(file.id, { onSuccess: () => toast.success('File removed') }) : setConfirming(true))}
            onBlur={() => setConfirming(false)}
            disabled={remove.isPending}
            aria-label={confirming ? `Confirm removing ${file.filename}` : `Remove ${file.filename}`}
            className={`grid h-11 shrink-0 place-items-center rounded-xl px-3 text-xs font-medium transition ${confirming ? 'bg-bad/10 text-bad' : 'w-11 text-muted hover:bg-tint/5 hover:text-bad'}`}
          >
            {confirming ? 'Remove?' : <Trash2 size={18} />}
          </button>
        )}
      </div>
      <div className="mt-1 pl-8 font-mono text-[11px] text-muted" title={file.sha256}>
        SHA-256 {file.sha256.slice(0, 16)}...
      </div>
      {!file.readable && <p className="mt-1 pl-8 text-xs text-warn">No readable text in this PDF. Upload it as an image to include it in an AI review.</p>}
      {remove.isError && <p className="mt-1 pl-8 text-xs text-bad">{remove.error.message}</p>}
    </li>
  )
}

export function EvidencePanel({ agreementId, files, canEdit }: { agreementId: string; files: EvidenceFile[]; canEdit: boolean }) {
  const upload = useUploadEvidence(agreementId)
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')

  function pick(list: FileList | null) {
    setProblem('')
    const file = list?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) return setProblem('That file is larger than 5 MB.')
    if (file.size === 0) return setProblem('That file is empty.')
    upload.mutate(file, {
      onSuccess: () => toast.success('Evidence added'),
      onError: (error) => setProblem(error.message),
    })
    if (input.current) input.current.value = ''
  }

  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <p className="text-sm text-muted">No files yet. Attach an invoice, purchase order or contract page so both sides and the AI review work from the same documents.</p>
      ) : (
        <ul className="divide-y divide-line">
          {files.map((f) => (
            <FileRow key={f.id} file={f} agreementId={agreementId} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {canEdit ? (
        <>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files)} />
          <button
            onClick={() => input.current?.click()}
            disabled={upload.isPending}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pick(e.dataTransfer.files)
            }}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm font-medium text-muted transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={16} /> {upload.isPending ? 'Uploading...' : 'Add a file'}
          </button>
          <p className="text-xs text-muted">PDF, PNG, JPEG or WebP, up to 5 MB, 10 files per agreement. Either side can add files, and only the side that added a file can remove it.</p>
        </>
      ) : (
        files.length > 0 && <p className="text-xs text-muted">Files are locked because this agreement is finished.</p>
      )}
      {problem && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
          {problem}
        </p>
      )}
    </div>
  )
}
