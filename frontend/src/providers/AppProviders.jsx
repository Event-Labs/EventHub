import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ToastProvider } from './ToastProvider.jsx'

export function AppProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  useEffect(() => {
    const clearSessionQueries = (event) => {
      if (event?.type === 'storage' && !['eventhub-token', 'eventhub-user', 'eventhub-auth'].includes(event.key)) {
        return
      }
      if (event?.detail?.type === 'user-updated') return
      queryClient.removeQueries()
    }

    window.addEventListener('eventhub-auth', clearSessionQueries)
    window.addEventListener('storage', clearSessionQueries)
    return () => {
      window.removeEventListener('eventhub-auth', clearSessionQueries)
      window.removeEventListener('storage', clearSessionQueries)
    }
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
