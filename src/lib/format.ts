// Amounts arrive from the API as exact decimal strings. Number() is used only
// to render them; no arithmetic is done on amounts in the browser.
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount)
  const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, ...digits }).format(value)
  } catch {
    // Not an ISO 4217 code (for example USDC).
    return `${new Intl.NumberFormat('en-US', digits).format(value)} ${currency}`
  }
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

const DAY = 86_400_000

/** A deadline is a calendar day (YYYY-MM-DD, UTC). */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

export function dayDiff(day: string): number {
  const today = new Date().toISOString().slice(0, 10)
  return Math.round((new Date(`${day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY)
}

export function dueText(day: string): string {
  const d = dayDiff(day)
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? '' : 's'}`
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  return `Due in ${d} days`
}

/** Today as a calendar day (UTC), for date inputs. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
