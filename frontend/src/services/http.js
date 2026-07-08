import axios from 'axios'
import { clearAuthSession, getAuthToken } from '@/lib/auth.js'
import { normalizeMessage } from '@/lib/messages.js'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const token = getAuthToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data) {
      const data = error.response.data
      data.message = normalizeMessage(data.message)

      const issues = data.errors || data.data
      if (Array.isArray(issues)) {
        issues.forEach((issue) => {
          if (issue?.message) {
            issue.message = normalizeMessage(issue.message, 'Dữ liệu chưa hợp lệ.')
          }
        })
      }
    }

    if (error.response?.status === 401) {
      // Clear token and user if unauthorized
      clearAuthSession()
      
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }

    if (error.response?.status === 403 && (error.response?.data?.errorCode === 'ACCOUNT_LOCKED' || error.response?.data?.error === 'ACCOUNT_LOCKED')) {
      const lockData = error.response.data.data || error.response.data;
      clearAuthSession()

      // Nếu đang ở trang login, KHÔNG lưu sessionStorage và KHÔNG dispatch event.
      // Để local catch trong LoginPage tự xử lý và hiển thị modal trực tiếp,
      // tránh race condition giữa event dispatch và async state update của React.
      if (window.location.pathname.includes('/login')) {
        return Promise.reject(error)
      }

      // Nếu đang ở trang khác: lưu lock info rồi redirect về login.
      // Trang login sẽ đọc sessionStorage trong useEffect và hiện modal.
      sessionStorage.setItem('eventhub-lock-info', JSON.stringify(lockData))
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)
