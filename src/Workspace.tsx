import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { ConnectKitProvider } from 'connectkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/config'
import { useTheme } from '@/lib/theme'
import type { Route } from '@/lib/router'
import { Shell } from '@/components/Shell'
import { AgreementSheet } from '@/components/AgreementSheet'
import { CreateAgreementSheet } from '@/components/CreateAgreementSheet'
import { AuthGate } from '@/components/AuthGate'
import { Overview } from '@/pages/Overview'
import { Agreements } from '@/pages/Agreements'
import { Integrations } from '@/pages/Integrations'
import { Team } from '@/pages/Team'
import { InvitePage } from '@/pages/InvitePage'

const queryClient = new QueryClient()

function WorkspaceRoutes({ route, navigate }: { route: Route; navigate: (to: Route) => void }) {
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openCreate = () => setCreating(true)

  if (route === '/invite') {
    return (
      <AuthGate requireOrg={false} onHome={() => navigate('/')}>
        <InvitePage
          onHome={() => navigate('/')}
          onOpen={(agreementId) => {
            navigate('/dashboard')
            setSelectedId(agreementId)
          }}
        />
      </AuthGate>
    )
  }

  return (
    <AuthGate onHome={() => navigate('/')}>
      <Shell route={route} onNavigate={navigate} onCreate={openCreate}>
        {route === '/dashboard' && <Overview onCreate={openCreate} onNavigate={navigate} onSelect={setSelectedId} />}
        {route === '/agreements' && <Agreements onCreate={openCreate} onSelect={setSelectedId} />}
        {route === '/team' && <Team />}
        {route === '/integrations' && <Integrations />}
        <AgreementSheet id={selectedId} onClose={() => setSelectedId(null)} />
        <CreateAgreementSheet open={creating} onClose={() => setCreating(false)} />
      </Shell>
    </AuthGate>
  )
}

/** Everything that needs the wallet and data libraries. Loaded only when someone leaves the landing page. */
export default function Workspace({ route, navigate }: { route: Route; navigate: (to: Route) => void }) {
  const { resolved } = useTheme()
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider mode={resolved}>
          <WorkspaceRoutes route={route} navigate={navigate} />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
