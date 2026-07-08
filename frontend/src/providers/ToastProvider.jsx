/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const TOAST_STYLES = {
  success: {
    icon: CheckCircle2,
    className: 'border-success/30 bg-success/15 text-success',
  },
  error: {
    icon: AlertCircle,
    className: 'border-error/30 bg-error/15 text-error',
  },
  info: {
    icon: Info,
    className: 'border-primary/30 bg-primary/15 text-primary',
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, leaving: true } : toast,
      ),
    )
    window.setTimeout(() => removeToast(id), 320)
  }, [removeToast])

  const showToast = useCallback((message, options = {}) => {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    const toast = {
      id,
      message,
      type: options.type || 'info',
    }

    setToasts((current) => [...current, toast].slice(-4))
    window.setTimeout(() => dismiss(id), options.duration || 4500)
    return id
  }, [dismiss])

  const value = useMemo(() => ({
    showToast,
    success: (message, options) => showToast(message, { ...options, type: 'success' }),
    error: (message, options) => showToast(message, { ...options, type: 'error' }),
    info: (message, options) => showToast(message, { ...options, type: 'info' }),
    dismiss,
  }), [dismiss, showToast])

  useEffect(() => {
    const handleToastEvent = (event) => {
      const detail = event.detail || {}
      showToast(detail.message, { type: detail.type || 'info', duration: detail.duration })
    }

    window.addEventListener('eventhub:toast', handleToastEvent)
    return () => window.removeEventListener('eventhub:toast', handleToastEvent)
  }, [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-20 z-[100] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

function ToastItem({ toast, onDismiss }) {
  const config = TOAST_STYLES[toast.type] || TOAST_STYLES.info
  const Icon = config.icon

  return (
    <div
      role="status"
      className={`eventhub-toast ${toast.leaving ? 'eventhub-toast-leave' : 'eventhub-toast-enter'} flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-md ${config.className}`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{toast.message}</p>
      <button
        type="button"
        className="rounded p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100"
        onClick={() => onDismiss(toast.id)}
        aria-label="Đóng thông báo"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
