import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('eventhub-token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and user if unauthorized
      localStorage.removeItem('eventhub-token')
      localStorage.removeItem('eventhub-user')
      localStorage.setItem('eventhub-auth', 'false')
      window.dispatchEvent(new Event('eventhub-auth'))
      
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }
    return Promise.reject(error)
  }
)
