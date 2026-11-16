import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useInbox } from '@/hooks/useApi'

const BASE_TITLE = 'CantonFlow AI'

// Watches the real inbox (polled from the API). Shows the count in the tab
// title and raises a toast only for items that appear after the first load.
export function useInboxAlerts() {
  const inbox = useInbox()
  const seen = useRef<Set<string> | null>(null)
  const count = inbox.data?.actionNeeded.length ?? 0

  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE
    return () => {
      document.title = BASE_TITLE
    }
  }, [count])

  useEffect(() => {
    if (!inbox.data) return
    const ids = new Set(inbox.data.actionNeeded.map((i) => `${i.agreementId}:${i.action}`))
    if (seen.current) {
      for (const item of inbox.data.actionNeeded) {
        if (!seen.current.has(`${item.agreementId}:${item.action}`)) {
          toast.info(`${item.label}: ${item.title}`, { description: `With ${item.counterparty}` })
        }
      }
    }
    seen.current = ids
  }, [inbox.data])

  return count
}
