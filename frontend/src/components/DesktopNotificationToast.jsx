import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, X, ExternalLink, ShieldAlert, Sparkles, UserCheck, CheckCircle2 } from 'lucide-react'
import { markNotificationRead } from '@/services/notifications.js'
import { formatNotificationDisplay, stripNotificationHtml } from '@/lib/notifications.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

/**
 * Synthesizes a soft, crisp desktop chime using the native Web Audio API
 * without requiring any external audio files.
 */
export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime

    // Note 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.001, now)
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.2)

    // Note 2: A5 (880.00 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.1)
    gain2.gain.setValueAtTime(0.001, now + 0.1)
    gain2.gain.linearRampToValueAtTime(0.15, now + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.1)
    osc2.stop(now + 0.5)

    // Note 3: High harmonic shimmer E6 (1318.51 Hz)
    const osc3 = ctx.createOscillator()
    const gain3 = ctx.createGain()
    osc3.type = 'sine'
    osc3.frequency.setValueAtTime(1318.51, now + 0.12)
    gain3.gain.setValueAtTime(0.001, now + 0.12)
    gain3.gain.linearRampToValueAtTime(0.04, now + 0.14)
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    osc3.connect(gain3)
    gain3.connect(ctx.destination)
    osc3.start(now + 0.12)
    osc3.stop(now + 0.5)

    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 1000)
  } catch {
    // Autoplay or unsupported environment handled silently
  }
}

function getRoleBadge(targetRole) {
  switch (targetRole) {
    case 'ADMIN':
      return {
        label: 'ADMIN SYSTEM',
        icon: ShieldAlert,
        badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
        glowClass: 'from-red-600/30 to-amber-600/30',
        borderClass: 'border-red-500/35',
      }
    case 'ORGANIZER':
      return {
        label: 'BAN TỔ CHỨC',
        icon: Sparkles,
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        glowClass: 'from-amber-600/30 to-yellow-600/30',
        borderClass: 'border-amber-500/35',
      }
    case 'STAFF':
      return {
        label: 'NHÂN SỰ VẬN HÀNH',
        icon: UserCheck,
        badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        glowClass: 'from-cyan-600/30 to-blue-600/30',
        borderClass: 'border-cyan-500/35',
      }
    default:
      return {
        label: 'EVENTHUB',
        icon: Bell,
        badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        glowClass: 'from-blue-600/30 to-indigo-600/30',
        borderClass: 'border-blue-500/35',
      }
  }
}

function resolveNotificationPageUrl(notification) {
  const targetRole = String(notification?.target_role || '').trim().toUpperCase()
  const hash = notification?.id ? `#notification-${notification.id}` : ''

  if (targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN') {
    return `/admin/notifications${hash}`
  }
  if (targetRole === 'ORGANIZER') {
    return `/organizer/notifications${hash}`
  }
  if (targetRole === 'STAFF') {
    return `/staff/notifications${hash}`
  }
  if (targetRole === 'CUSTOMER') {
    return `/notifications${hash}`
  }

  // Fallback for 'ALL' or missing target_role: stay in the active portal's notification page
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  if (pathname.startsWith('/admin')) return `/admin/notifications${hash}`
  if (pathname.startsWith('/organizer')) return `/organizer/notifications${hash}`
  if (pathname.startsWith('/staff')) return `/staff/notifications${hash}`

  return `/notifications${hash}`
}

function DesktopToastItem({ notification, onDismiss, onNavigate, isEnglish }) {
  const [hovered, setHovered] = useState(false)
  const [progress, setProgress] = useState(100)
  const DURATION = 8500 // 8.5 seconds
  const startTimeRef = useRef(Date.now())
  const remainingTimeRef = useRef(DURATION)

  const roleInfo = getRoleBadge(notification.target_role)
  const RoleIcon = roleInfo.icon
  const display = formatNotificationDisplay(notification, isEnglish)
  const previewText = display.preview || stripNotificationHtml(display.content || '')

  useEffect(() => {
    let animId
    const step = () => {
      if (!hovered) {
        const elapsed = Date.now() - startTimeRef.current
        const remaining = Math.max(0, remainingTimeRef.current - elapsed)
        const pct = (remaining / DURATION) * 100
        setProgress(pct)

        if (remaining <= 0) {
          onDismiss(notification.id)
          return
        }
      }
      animId = requestAnimationFrame(step)
    }

    if (!hovered) {
      startTimeRef.current = Date.now()
      animId = requestAnimationFrame(step)
    }

    return () => cancelAnimationFrame(animId)
  }, [hovered, notification.id, onDismiss])

  const handleMouseEnter = () => {
    const elapsed = Date.now() - startTimeRef.current
    remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed)
    setHovered(true)
  }

  const handleMouseLeave = () => {
    setHovered(false)
  }

  const handleClick = (e) => {
    e.stopPropagation()
    onNavigate(notification)
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative pointer-events-auto overflow-hidden rounded-2xl border ${roleInfo.borderClass} bg-[#0A1628]/95 sm:bg-[#071322]/95 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.65)] ring-1 ring-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(0,0,0,0.8)] cursor-pointer w-full max-w-[380px] sm:max-w-[420px]`}
      onClick={handleClick}
      role="alert"
      aria-live="polite"
    >
      {/* Glow highlight header background */}
      <div className={`absolute -top-12 -right-12 size-36 rounded-full bg-gradient-to-br ${roleInfo.glowClass} blur-2xl pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="relative p-4 sm:p-4.5">
        {/* Top Header: Badge, App Name, Time, Dismiss button */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase border shrink-0 ${roleInfo.badgeClass}`}>
              <RoleIcon className="size-3" />
              {roleInfo.label}
            </span>
            <span className="text-[11px] font-medium text-slate-400 shrink-0">
              {isEnglish ? 'Just now' : 'Vừa xong'}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDismiss(notification.id)
            }}
            className="grid size-6 place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title={isEnglish ? 'Dismiss' : 'Đóng thông báo'}
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="pt-2.5 min-w-0">
          <h4 className="text-sm font-extrabold text-slate-100 line-clamp-1 group-hover:text-[#E6C17A] transition-colors leading-snug">
            {display.title}
          </h4>
          <p className="mt-1 text-xs text-slate-300 line-clamp-2 leading-relaxed">
            {previewText}
          </p>
        </div>

        {/* Footer Action */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald-400" />
            {isEnglish ? 'Click to view in notifications' : 'Nhấp để mở trong thông báo'}
          </span>
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center gap-1 font-bold text-[#E6C17A] hover:underline cursor-pointer"
          >
            {isEnglish ? 'View now' : 'Xem ngay'}
            <ExternalLink className="size-3 ml-0.5" />
          </button>
        </div>
      </div>

      {/* Countdown Progress Bar */}
      <div className="h-1 w-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] transition-all ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export function DesktopNotificationToast() {
  const [items, setItems] = useState([])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isEnglish } = useLanguage()

  const dismissToast = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const handleNavigate = useCallback((notification) => {
    dismissToast(notification.id)
    if (notification.id && !String(notification.id).startsWith('notif-')) {
      markNotificationRead(notification.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
        })
        .catch(() => {})
    }
    const targetUrl = resolveNotificationPageUrl(notification)
    if (targetUrl) {
      navigate(targetUrl)
    }
    if (notification.id) {
      window.dispatchEvent(
        new CustomEvent('eventhub:scroll-notification', {
          detail: { id: notification.id },
        }),
      )
    }
  }, [dismissToast, navigate, queryClient])

  useEffect(() => {
    const handleIncomingNotification = (event) => {
      const data = event.detail
      if (!data || !data.title) return

      // Play soft chime sound
      playNotificationChime()

      const notificationItem = {
        id: data.id || `notif-${Date.now()}-${Math.random()}`,
        title: data.title,
        content: data.content,
        target_role: data.target_role || 'CUSTOMER',
        event_id: data.event_id,
        metadata: data.metadata || {},
        created_at: data.created_at || new Date().toISOString(),
      }

      setItems((prev) => {
        // Prevent duplicate toasts if same notification ID received
        const filtered = prev.filter((item) => item.id !== notificationItem.id)
        // Keep max 3 latest toasts stacked
        return [notificationItem, ...filtered].slice(0, 3)
      })
    }

    window.addEventListener('eventhub:desktop-notification', handleIncomingNotification)
    return () => {
      window.removeEventListener('eventhub:desktop-notification', handleIncomingNotification)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-3 pointer-events-none select-none max-w-full px-4 sm:px-0"
      style={{ isolation: 'isolate' }}
    >
      {items.map((notification) => (
        <DesktopToastItem
          key={notification.id}
          notification={notification}
          onDismiss={dismissToast}
          onNavigate={handleNavigate}
          isEnglish={isEnglish}
        />
      ))}
    </div>
  )
}
