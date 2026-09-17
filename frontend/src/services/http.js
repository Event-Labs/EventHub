import axios from 'axios'
import { clearAuthSession, getAuthToken, updateAuthToken } from '@/lib/auth.js'
import { normalizeMessage } from '@/lib/messages.js'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

export const http = axios.create({
  baseURL,
  withCredentials: true,
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

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

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

    // Handle 403 Account Locked
    if (
      error.response?.status === 403 &&
      (error.response?.data?.errorCode === 'ACCOUNT_LOCKED' || error.response?.data?.error === 'ACCOUNT_LOCKED')
    ) {
      const lockData = error.response.data.data || error.response.data
      clearAuthSession()

      if (window.location.pathname.includes('/login')) {
        return Promise.reject(error)
      }

      sessionStorage.setItem('eventhub-lock-info', JSON.stringify(lockData))
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Handle 401 Unauthorized with Silent Refresh
    if (error.response?.status === 401) {
      const requestUrl = String(originalRequest?.url || '')
      const isAuthEndpoint =
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/register') ||
        requestUrl.includes('/auth/google') ||
        requestUrl.includes('/auth/verify-login-otp') ||
        requestUrl.includes('/auth/verify-admin-otp') ||
        requestUrl.includes('/auth/forgot-password') ||
        requestUrl.includes('/auth/reset-password')

      // Nếu là request đăng nhập/xác thực bị sai mật khẩu hoặc OTP -> không refresh, trả lỗi về form
      if (isAuthEndpoint) {
        return Promise.reject(error)
      }

      // Nếu chính request gọi /auth/refresh bị lỗi 401 (Refresh token đã hết hạn sau 7 ngày)
      if (requestUrl.includes('/auth/refresh')) {
        processQueue(error, null)
        isRefreshing = false
        clearAuthSession()
        if (!window.location.pathname.includes('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
        }
        return Promise.reject(error)
      }

      // Nếu không có access token nào trong storage (chưa từng đăng nhập)
      if (!getAuthToken()) {
        clearAuthSession()
        if (!window.location.pathname.includes('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
        }
        return Promise.reject(error)
      }

      // Nếu request này đã từng thử refresh rồi nhưng vẫn 401 -> dừng tránh lặp vô tận
      if (originalRequest._retry) {
        clearAuthSession()
        if (!window.location.pathname.includes('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
        }
        return Promise.reject(error)
      }

      // Nếu đang có 1 request khác thực hiện refresh token -> xếp hàng chờ
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return http(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshResponse = await axios.post(
          `${baseURL.replace(/\/$/, '')}/auth/refresh`,
          {},
          { withCredentials: true }
        )

        const newAccessToken = refreshResponse.data?.data?.accessToken

        if (!newAccessToken) {
          throw new Error('Refresh token response missing access token')
        }

        updateAuthToken(newAccessToken)
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        processQueue(null, newAccessToken)
        isRefreshing = false

        return http(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        isRefreshing = false
        clearAuthSession()
        if (!window.location.pathname.includes('/login')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)
