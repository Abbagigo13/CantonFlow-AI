import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { download } from '@/lib/api'

export function DownloadButton({ path, filename, children, className }: { path: string; filename: string; children: ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      await download(path, filename)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The download failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={() => void run()}
      disabled={busy}
      className={
        className ??
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      <Download size={16} /> {busy ? 'Preparing...' : children}
    </button>
  )
}
