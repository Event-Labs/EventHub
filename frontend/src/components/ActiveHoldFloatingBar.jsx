import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Clock, ArrowRight, X, Loader2 } from 'lucide-react'
import {
  clearBookingDraft,
  formatCountdown,
  getResumeBookingPath,
  hasActiveSeatHold,
  readBookingDraft,
  secondsLeft,
} from '@/utils/bookingDraft.js'
import { isAuthenticated } from '@/lib/auth.js'
import { cancelActiveHold } from '@/services/events.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

export function ActiveHoldFloatingBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { isEnglish } = useLanguage()
  const [isAuth, setIsAuth] = useState(() => isAuthenticated())
  const [cart, setCart] = useState(() => (isAuthenticated() ? readBookingDraft() : null))
  const [dismissed, setDismissed] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [tick, setTick] = useState(0)
  const prevPathRef = useRef(location.pathname)

  // Listen to auth, draft update, and draft clear events
  useEffect(() => {
    const handleAuth = () => {
      const authed = isAuthenticated()
      setIsAuth(authed)
      if (!authed) {
        setCart(null)
      } else {
        const d = readBookingDraft()
        setCart(d)
        if (d && hasActiveSeatHold(d)) {
          setDismissed(false)
        }
      }
    }
    const handleDraftUpdated = (e) => {
      const updatedCart = e.detail?.cart || readBookingDraft()
      setCart(updatedCart)
      if (updatedCart && hasActiveSeatHold(updatedCart)) {
        setDismissed(false)
      }
    }
    const handleDraftCleared = () => {
      setCart(null)
    }

    window.addEventListener('eventhub-auth', handleAuth)
    window.addEventListener('eventhub-booking-draft-updated', handleDraftUpdated)
    window.addEventListener('eventhub-booking-draft-cleared', handleDraftCleared)
    return () => {
      window.removeEventListener('eventhub-auth', handleAuth)
      window.removeEventListener('eventhub-booking-draft-updated', handleDraftUpdated)
      window.removeEventListener('eventhub-booking-draft-cleared', handleDraftCleared)
    }
  }, [])

  // When leaving /booking/ routes, reset dismissed and refresh draft so user always sees the floating bar
  useEffect(() => {
    if (prevPathRef.current.startsWith('/booking/') && !location.pathname.startsWith('/booking/')) {
      setDismissed(false)
      const current = readBookingDraft()
      setCart(current)
    }
    prevPathRef.current = location.pathname
  }, [location.pathname])

  // Periodic tick every second to update countdown & sync draft
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
      setCart((prev) => {
        // If a new or different hold appeared, ensure it's not dismissed
        const prevExp = prev?.holdExpiresAt || prev?.hold_expires_at
        const currExp = current?.holdExpiresAt || current?.hold_expires_at
        if (currExp && currExp !== prevExp) {
          setDismissed(false)
        }
        return current
      })
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

  const handleCancelHold = async () => {
    const eventId = cart?.eventId || cart?.eventSlug
    if (!eventId) return
    setIsCancelling(true)
    try {
      await cancelActiveHold(eventId)
      clearBookingDraft(cart?.eventId)
      setCart(null)
      toast.success(isEnglish ? 'Hold reservation cancelled successfully.' : 'Đã hủy giữ chỗ thành công.')
    } catch {
      clearBookingDraft(cart?.eventId)
      setCart(null)
      toast.info(isEnglish ? 'Reservation ended.' : 'Lượt giữ chỗ đã kết thúc.')
    } finally {
      setIsCancelling(false)
    }
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
                  {isEnglish ? `Holding ${totalSeats} seats` : `Đang giữ ${totalSeats} ghế`}
                </span>
                <span className="font-mono text-xs font-bold text-primary">
                  {formatCountdown(remaining)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-white max-w-[220px] sm:max-w-[280px]">
                {cart.eventTitle || (isEnglish ? 'Ticket reservation' : 'Đơn đặt vé sự kiện')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
            title={isEnglish ? 'Close notification' : 'Đóng thông báo'}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={handleCancelHold}
            disabled={isCancelling}
            className="rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-200 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isCancelling && <Loader2 className="size-3 animate-spin text-rose-300" />}
            <span>{isCancelling ? (isEnglish ? 'Cancelling...' : 'Đang hủy...') : (isEnglish ? 'Cancel hold' : 'Hủy giữ chỗ')}</span>
          </button>
          <button
            type="button"
            onClick={handleResume}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all hover:brightness-110 hover:shadow-[0_0_16px_rgba(201,154,71,0.5)] active:scale-95 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
          >
            <span>{isEnglish ? 'Continue' : 'Tiếp tục đặt vé'}</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
