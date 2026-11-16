import { useCallback, useEffect, useState } from 'react'

export type Route = '/' | '/invite' | '/dashboard' | '/agreements' | '/team' | '/integrations'

const ROUTES: Route[] = ['/', '/invite', '/dashboard', '/agreements', '/team', '/integrations']

function current(): Route {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return (ROUTES as string[]).includes(path) ? (path as Route) : '/'
}

export function useRoute(): [Route, (to: Route) => void] {
  const [route, setRoute] = useState<Route>(current)

  useEffect(() => {
    const onPop = () => setRoute(current())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: Route) => {
    window.history.pushState(null, '', to)
    setRoute(to)
    window.scrollTo({ top: 0 })
  }, [])

  return [route, navigate]
}
