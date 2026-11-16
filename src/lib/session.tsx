import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, sessionToken, setUnauthorizedHandler, type Membership } from '@/lib/api'

interface Session {
  address: string
  organizations: Membership[]
  activeOrg: Membership
  setActiveOrg: (key: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a signed-in view')
  return value
}

export function SessionProvider({
  address,
  organizations,
  onSignOut,
  children,
}: {
  address: string
  organizations: Membership[]
  onSignOut: () => void
  children: ReactNode
}) {
  const [activeKey, setActiveKey] = useState(() => localStorage.getItem('cantonflow.activeOrg') ?? '')
  const activeOrg = organizations.find((o) => o.key === activeKey) ?? organizations[0]

  const value = useMemo<Session>(
    () => ({
      address,
      organizations,
      activeOrg,
      setActiveOrg: (key) => {
        localStorage.setItem('cantonflow.activeOrg', key)
        setActiveKey(key)
      },
      signOut: onSignOut,
    }),
    [address, organizations, activeOrg, onSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// Ends the session on the server, forgets the token, and drops every cached
// answer so the next wallet never sees the previous wallet's data.
export function useSignOut() {
  const client = useQueryClient()
  return useMemo(
    () => async () => {
      try {
        await api.logout()
      } catch {
        // The token is forgotten locally either way.
      }
      sessionToken.clear()
      client.clear()
      window.dispatchEvent(new Event('cantonflow:session'))
    },
    [client],
  )
}

// Tracks whether a session token exists, including changes from other tabs.
export function useToken(): string | null {
  const client = useQueryClient()
  const [token, setToken] = useState(() => sessionToken.get())

  useEffect(() => {
    const sync = () => setToken(sessionToken.get())
    window.addEventListener('cantonflow:session', sync)
    window.addEventListener('storage', sync)
    setUnauthorizedHandler(() => {
      sessionToken.clear()
      client.clear()
      sync()
    })
    return () => {
      window.removeEventListener('cantonflow:session', sync)
      window.removeEventListener('storage', sync)
      setUnauthorizedHandler(null)
    }
  }, [client])

  return token
}
