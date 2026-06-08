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

    if (error.response?.status === 403 && (error.response?.data?.errorCode === 'ACCOUNT_LOCKED' || error.response?.data?.error === 'ACCOUNT_LOCKED')) {
      const lockData = error.response.data.data || error.response.data;
      localStorage.removeItem('eventhub-token')
      localStorage.removeItem('eventhub-user')
      localStorage.setItem('eventhub-auth', 'false')
      window.dispatchEvent(new Event('eventhub-auth'))

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
