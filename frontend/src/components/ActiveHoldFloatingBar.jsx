import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Clock, Ticket, ArrowRight, X } from 'lucide-react'
import {
  clearBookingDraft,
  formatCountdown,
  getResumeBookingPath,
  hasActiveSeatHold,
  readBookingDraft,
  secondsLeft,
} from '@/utils/bookingDraft.js'
import { isAuthenticated } from '@/lib/auth.js'

export function ActiveHoldFloatingBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isAuth, setIsAuth] = useState(() => isAuthenticated())
  const [cart, setCart] = useState(() => (isAuthenticated() ? readBookingDraft() : null))
  const [dismissed, setDismissed] = useState(false)
  const [tick, setTick] = useState(0)

  // Listen to auth changes (login/logout) and clear-draft events to instantly update bar visibility
  useEffect(() => {
    const handleAuth = () => {
      const authed = isAuthenticated()
      setIsAuth(authed)
      if (!authed) {
        setCart(null)
      } else {
        setCart(readBookingDraft())
      }
    }
    const handleDraftCleared = () => {
      setCart(null)
      setDismissed(true)
    }
    window.addEventListener('eventhub-auth', handleAuth)
    window.addEventListener('eventhub-booking-draft-cleared', handleDraftCleared)
    return () => {
      window.removeEventListener('eventhub-auth', handleAuth)
      window.removeEventListener('eventhub-booking-draft-cleared', handleDraftCleared)
    }
  }, [])

  useEffect(() => {
    if (!isAuth) return
    const timer = window.setInterval(() => {
      setTick((t) => t + 1)
      if (!isAuthenticated()) {
        setIsAuth(false)
        setCart(null)
        return
      }
      const current = readBookingDraft()
      setCart(current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isAuth])

  // Do not show for unauthenticated visitors or on booking flow pages
  if (!isAuth || !isAuthenticated()) return null
  if (location.pathname.startsWith('/booking/')) return null
  if (dismissed) return null
  if (!cart || !hasActiveSeatHold(cart)) return null

  const holdExpiresAt = cart.holdExpiresAt || cart.hold_expires_at
  const remaining = secondsLeft(holdExpiresAt)
  if (remaining <= 0) {
    clearBookingDraft(cart?.eventId)
    return null
  }

  const totalSeats = (cart.selectedSeatIds?.length) || (cart.items?.reduce((s, i) => s + (i.quantity || 0), 0)) || 0

  const handleResume = () => {
    const targetPath = getResumeBookingPath(cart)
    navigate(targetPath, { state: { cart } })
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm sm:max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="rounded-2xl border border-primary/40 bg-slate-950/95 p-4 shadow-[0_8px_32px_0_rgba(6,182,212,0.3)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-sm">
              <Clock className="size-4 animate-pulse text-primary" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  Đang giữ {totalSeats} ghế
                </span>
                <span className="font-mono text-xs font-bold text-primary">
                  {formatCountdown(remaining)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-white max-w-[220px] sm:max-w-[280px]">
                {cart.eventTitle || 'Đơn đặt vé sự kiện'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Đóng thông báo"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={handleResume}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all hover:brightness-110 hover:shadow-[0_0_16px_rgba(201,154,71,0.5)] active:scale-95 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
          >
            <span>Tiếp tục đặt vé</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
