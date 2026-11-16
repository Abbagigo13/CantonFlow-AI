import { lazy, Suspense } from 'react'
import { useRoute } from '@/lib/router'

const Landing = lazy(() => import('@/pages/Landing').then((m) => ({ default: m.Landing })))
const Workspace = lazy(() => import('@/Workspace'))

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  )
}

export default function App() {
  const [route, navigate] = useRoute()
  return (
    <Suspense fallback={<Loading />}>{route === '/' ? <Landing onNavigate={navigate} /> : <Workspace route={route} navigate={navigate} />}</Suspense>
  )
}
