import clsx from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Match device', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme()
  return (
    <div role="group" aria-label="Theme" className={clsx('inline-flex rounded-xl border border-line p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setPreference(value)}
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition', preference === value ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}

// A single button for tight places such as the landing page header.
export function ThemeCycleButton() {
  const { resolved, setPreference } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-tint/5 hover:text-ink"
    >
      {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
