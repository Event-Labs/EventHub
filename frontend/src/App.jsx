import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { router } from '@/routes/index.jsx'

function App() {
  useEffect(() => {
    let currentPathname = router.state.location.pathname
    let firstFrame = null
    let secondFrame = null

    const unsubscribe = router.subscribe((state) => {
      const nextPathname = state.location.pathname
      if (nextPathname === currentPathname) return

      currentPathname = nextPathname
      if (firstFrame) window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)

      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        })
      })
    })

    return () => {
      unsubscribe()
      if (firstFrame) window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
  }, [])

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <RouterProvider router={router} />
    </GoogleOAuthProvider>
  )
}

export default App