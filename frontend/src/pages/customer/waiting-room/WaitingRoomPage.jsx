import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  WifiOff,
  Ticket,
  ChevronLeft,
  RefreshCw,
  Sparkles,
  ShoppingBag,
} from 'lucide-react'
import { waitingRoomService } from '@/services/waitingRoom'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { CosmicStarryBackground } from '@/components/CosmicStarryBackground'
import logoSrc from '@/assets/eventhub-logo.png'

export function WaitingRoomPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { isEnglish } = useLanguage()

  // State management
  const [status, setStatus] = useState('LOADING') // LOADING | WAITING | NEAR_TURN | ADMITTED | SOLD_OUT | EXPIRED | CONNECTION_LOST | CLOSED
  const [position, setPosition] = useState(0)
  const [initialPosition, setInitialPosition] = useState(null)
  const [totalWaiting, setTotalWaiting] = useState(0)
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState(null)
  const [pollIntervalMs, setPollIntervalMs] = useState(3000)
  const [eventData, setEventData] = useState(null)
  const [bookingToken, setBookingToken] = useState(null)
  const [admittedSecondsLeft, setAdmittedSecondsLeft] = useState(600) // 10 minutes
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const sessionIdKey = useMemo(() => `eventhub_queue_session_${eventId}`, [eventId])
  const activeSessionIdRef = useRef(null)
  const pollTimerRef = useRef(null)
  const sseRef = useRef(null)
  const countdownTimerRef = useRef(null)

  // Format Vietnamese number: 32.157
  const formatNumberVi = (num) => {
    if (num === null || num === undefined) return '0'
    return Number(num).toLocaleString('vi-VN')
  }

  // Format countdown mm:ss
  const formatCountdown = (secs) => {
    const s = Math.max(0, secs)
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }

  // 1. Join queue or restore existing session on initial load
  useEffect(() => {
    let isMounted = true

    const initQueue = async () => {
      try {
        const savedSessionId =
          sessionStorage.getItem(sessionIdKey) || localStorage.getItem(sessionIdKey)
        activeSessionIdRef.current = savedSessionId

        const res = await waitingRoomService.joinQueue(eventId, savedSessionId)
        if (!isMounted) return

        // If event disabled waiting room, redirect straight to booking seats
        if (!res.enabled && res.status === 'DIRECT_ACCESS') {
          navigate(`/booking/seats`, {
            state: { cart: location.state?.cart || { eventId } },
            replace: true,
          })
          return
        }

        if (res.event) {
          setEventData(res.event)
        }

        if (res.session_id) {
          activeSessionIdRef.current = res.session_id
          sessionStorage.setItem(sessionIdKey, res.session_id)
          localStorage.setItem(sessionIdKey, res.session_id)
        }

        if (res.status === 'ACTIVE' || res.status === 'ADMITTED') {
          handleAdmitted(res)
        } else if (res.status === 'WAITING' || res.status === 'QUEUED') {
          handleQueued(res)
        } else if (res.status === 'SOLD_OUT') {
          setStatus('SOLD_OUT')
        } else if (res.status === 'PAUSED') {
          setStatus('PAUSED')
        }
      } catch (err) {
        if (!isMounted) return
        console.error('Queue initialization error:', err)
        setStatus('CONNECTION_LOST')
      }
    }

    initQueue()

    return () => {
      isMounted = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (sseRef.current) sseRef.current.close()
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [eventId, sessionIdKey, navigate])

  // Handle when session is QUEUED / WAITING
  const handleQueued = (data) => {
    const currentPos = Number(data.position || 0)
    setPosition(currentPos)
    if (initialPosition === null || currentPos > initialPosition) {
      setInitialPosition(currentPos)
    }
    setTotalWaiting(Number(data.total_waiting || currentPos + 1))
    setEstimatedWaitSeconds(data.estimated_wait_seconds || Math.ceil((currentPos + 1) * 3))
    if (data.poll_interval_ms) {
      setPollIntervalMs(data.poll_interval_ms)
    }

    if (data.is_near_turn || currentPos <= 5) {
      setStatus('NEAR_TURN')
    } else {
      setStatus('WAITING')
    }
  }

  // Handle when session is ADMITTED
  const handleAdmitted = (data) => {
    setStatus('ADMITTED')
    setBookingToken(data.booking_token)

    // Save booking token for HTTP interceptor
    sessionStorage.setItem('eventhub_booking_token', data.booking_token)
    localStorage.setItem('eventhub_booking_token', data.booking_token)

    if (data.remaining_seconds) {
      setAdmittedSecondsLeft(data.remaining_seconds)
    }

    // Start countdown timer for booking grace period
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = setInterval(() => {
      setAdmittedSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current)
          setStatus('EXPIRED')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Auto navigate to booking seats after a short moment (2.5s) to allow customer to see the admitted card
    const timer = setTimeout(() => {
      proceedToBooking(data.booking_token)
    }, 2500)

    return () => clearTimeout(timer)
  }

  // Polling loop to get status updates
  useEffect(() => {
    if (status !== 'WAITING' && status !== 'NEAR_TURN' && status !== 'CONNECTION_LOST') {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      return
    }

    const poll = async () => {
      if (!activeSessionIdRef.current) return
      try {
        const res = await waitingRoomService.getQueueStatus(eventId, activeSessionIdRef.current)

        if (status === 'CONNECTION_LOST') {
          setIsReconnecting(false)
        }

        if (res.status === 'ACTIVE' || res.status === 'ADMITTED') {
          handleAdmitted(res)
        } else if (res.status === 'WAITING' || res.status === 'QUEUED') {
          handleQueued(res)
        } else if (res.status === 'SOLD_OUT') {
          setStatus('SOLD_OUT')
        } else if (res.status === 'EXPIRED') {
          setStatus('EXPIRED')
        }
      } catch (err) {
        console.warn('Queue polling error:', err)
        setStatus('CONNECTION_LOST')
        setIsReconnecting(true)
        setReconnectAttempts((prev) => prev + 1)
      }
    }

    pollTimerRef.current = setInterval(poll, pollIntervalMs)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [status, eventId, pollIntervalMs])

  // Proceed to booking flow
  const proceedToBooking = (tokenToUse) => {
    const token = tokenToUse || bookingToken
    const baseCart = location.state?.cart || {
      eventId: eventId,
      eventTitle: eventData?.title,
      eventStartTime: eventData?.start_time,
      eventEndTime: eventData?.end_time,
      venueSummary: eventData?.venueSummary || '',
      items: [],
    }

    navigate('/booking/seats', {
      state: {
        cart: {
          ...baseCart,
          bookingToken: token,
          waitingRoomAdmitted: true,
        },
      },
      replace: true,
    })
  }

  // Handle Voluntary Leave
  const handleLeave = async () => {
    try {
      if (activeSessionIdRef.current) {
        await waitingRoomService.leaveQueue(eventId, activeSessionIdRef.current)
      }
    } catch (_) {}
    navigate(`/events/${eventId}`)
  }

  // Handle Retry after expiration
  const handleRetry = () => {
    sessionStorage.removeItem(sessionIdKey)
    localStorage.removeItem(sessionIdKey)
    window.location.reload()
  }

  // Progress Bar Calculation
  const progressPercent = useMemo(() => {
    if (status === 'ADMITTED') return 100
    if (initialPosition && initialPosition > 0) {
      const p = Math.round(((initialPosition - position) / initialPosition) * 100)
      return Math.min(95, Math.max(5, p))
    }
    return 10
  }, [status, initialPosition, position])

  return (
    <div className="force-dark min-h-screen bg-[#030712] flex flex-col justify-between items-center relative overflow-hidden select-none font-sans text-content">
      {/* ── Signature Customer Cosmic Starry Background ── */}
      <CosmicStarryBackground />

      {/* Subtle radial ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)_0%,_transparent_65%)] opacity-20" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_bottom_right,_#C99A47_0%,_transparent_60%)] opacity-10" />

      {/* ── Top Header Bar (Customer Theme) ── */}
      <header className="w-full fixed top-0 inset-x-0 bg-[#081126]/80 backdrop-blur-xl border-b border-white/10 px-6 py-3.5 flex items-center justify-between z-30 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
            <img
              src={logoSrc}
              alt="EventHub"
              className="h-8 sm:h-10 w-auto object-contain mix-blend-screen transition-opacity hover:opacity-85"
            />
          </div>
          <span className="hidden sm:inline-block text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#E6C17A]/15 text-[#E6C17A] border border-[#E6C17A]/30">
            {isEnglish ? 'Virtual Waiting Room' : 'Phòng Chờ Ảo'}
          </span>
        </div>

        <button
          onClick={handleLeave}
          className="text-xs font-bold text-slate-300 hover:text-[#E6C17A] flex items-center space-x-1.5 px-4 py-1.5 rounded-full border border-white/15 bg-white/5 hover:border-[#C99A47]/60 hover:bg-[#C99A47]/10 transition-all active:scale-95"
        >
          <ChevronLeft className="w-4 h-4 text-[#E6C17A]" />
          <span>{isEnglish ? 'Back to event' : 'Quay lại sự kiện'}</span>
        </button>
      </header>

      {/* ── Center Content Area ── */}
      <main className="w-full max-w-[540px] px-4 pt-24 pb-12 flex flex-col items-center justify-center my-auto z-10 relative">
        {/* Concert Bus Illustration with EventHub Gold Identity */}
        <div className="mb-4 relative flex items-center justify-center">
          <div className="w-36 h-18 relative flex items-center justify-center">
            <svg
              viewBox="0 0 200 100"
              className="w-full h-full drop-shadow-[0_4px_20px_rgba(201,154,71,0.25)] transition-transform hover:scale-105 duration-300"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Road shadow */}
              <ellipse cx="100" cy="88" rx="85" ry="5" fill="#030712" opacity="0.8" />
              {/* Bus body - Dark Navy with Gold Trim */}
              <rect x="35" y="35" width="130" height="42" rx="14" fill="#0C1446" stroke="#C99A47" strokeWidth="1.5" />
              <rect x="42" y="40" width="116" height="18" rx="6" fill="#1E293B" stroke="#475569" strokeWidth="1" />
              {/* Concert Fans (Glowing Heads) */}
              <circle cx="58" cy="48" r="6" fill="#10B981" />
              <circle cx="82" cy="48" r="6" fill="#F59E0B" />
              <circle cx="106" cy="48" r="6" fill="#E6C17A" />
              <circle cx="130" cy="48" r="6" fill="#38BDF8" />
              {/* Headlights */}
              <circle cx="160" cy="62" r="4.5" fill="#FDE047" />
              <circle cx="40" cy="62" r="4.5" fill="#EF4444" />
              {/* Wheels with Gold Rims */}
              <circle cx="65" cy="78" r="11" fill="#020617" stroke="#64748B" strokeWidth="1.5" />
              <circle cx="65" cy="78" r="4.5" fill="#E6C17A" />
              <circle cx="135" cy="78" r="11" fill="#020617" stroke="#64748B" strokeWidth="1.5" />
              <circle cx="135" cy="78" r="4.5" fill="#E6C17A" />
              {/* EventHub Golden Flag on Roof */}
              <path d="M48 35 L48 16" stroke="#E6C17A" strokeWidth="2" strokeLinecap="round" />
              <path d="M48 16 L70 21.5 L48 27 Z" fill="url(#goldFlagGrad)" />
              <defs>
                <linearGradient id="goldFlagGrad" x1="48" y1="16" x2="70" y2="27" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FDE047" />
                  <stop offset="1" stopColor="#C99A47" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* ── Main Waiting Room Card (Customer Dark & Gold Style) ── */}
        <div
          className={`w-full bg-[#0a1128]/85 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all duration-300 relative ${
            status === 'NEAR_TURN'
              ? 'ring-4 ring-[#E6C17A]/40 border-[#E6C17A] shadow-[0_0_35px_rgba(201,154,71,0.35)]'
              : status === 'ADMITTED'
              ? 'ring-4 ring-emerald-500/40 border-emerald-400 shadow-[0_0_35px_rgba(16,185,129,0.35)]'
              : ''
          }`}
        >
          {/* Connection Lost Banner */}
          {status === 'CONNECTION_LOST' && (
            <div className="mb-4 p-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center space-x-2 text-amber-300 text-xs font-semibold animate-pulse">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                {isEnglish
                  ? 'Connection lost. Auto-reconnecting... Your queue spot is preserved.'
                  : 'Mất kết nối mạng. Đang tự động kết nối lại... Vị trí của bạn được giữ nguyên.'}
              </span>
            </div>
          )}

          {/* Event Title */}
          <h1 className="text-center font-extrabold text-sm sm:text-base text-white uppercase tracking-wider line-clamp-2 px-2 mb-3 drop-shadow-sm">
            {eventData?.title || (isEnglish ? 'Concert Event Waiting Room' : 'Phòng Chờ Sự Kiện')}
          </h1>

          {/* STATE 1 & 2: WAITING / NEAR_TURN */}
          {(status === 'WAITING' || status === 'NEAR_TURN' || status === 'LOADING' || status === 'CONNECTION_LOST') && (
            <>
              {/* Queue Status Subtitle */}
              <p className="text-center text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-widest mb-2">
                {isEnglish ? 'Number of people ahead of you in line' : 'Số người đang xếp hàng trước bạn'}
              </p>

              {/* Big Queue Position Number (Signature Gold Glow) */}
              <div className="py-2 text-center">
                <span className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FDE047] via-[#E6C17A] to-[#C99A47] tracking-tight font-mono inline-block drop-shadow-[0_4px_16px_rgba(230,193,122,0.35)]">
                  {status === 'LOADING' ? (
                    <RefreshCw className="w-12 h-12 text-[#E6C17A] animate-spin inline-block" />
                  ) : (
                    formatNumberVi(position)
                  )}
                </span>
              </div>

              {/* Near Turn Alert Banner */}
              {status === 'NEAR_TURN' && (
                <div className="my-2 py-2 px-4 bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] text-xs font-extrabold rounded-xl text-center shadow-[0_0_20px_rgba(201,154,71,0.5)] animate-pulse flex items-center justify-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-[#0D1B2A]" />
                  <span>
                    {isEnglish
                      ? 'Almost your turn! Get ready to select tickets.'
                      : 'Sắp đến lượt của bạn! Xin hãy chuẩn bị chọn vé.'}
                  </span>
                </div>
              )}

              {/* Progress Bar (Gold Gradient System Bar) */}
              <div className="w-full mt-4 mb-5">
                <div className="h-2 w-full bg-slate-800/90 border border-white/5 rounded-full relative overflow-visible">
                  <div
                    className="h-full bg-gradient-to-r from-[#8C6D23] via-[#C99A47] to-[#E6C17A] rounded-full transition-all duration-700 ease-out relative"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-[#E6C17A] border-2 border-[#0D1B2A] rounded-full shadow-[0_0_12px_rgba(230,193,122,0.9)]" />
                  </div>
                </div>
              </div>

              {/* Waiting Guidelines & Estimated Time */}
              <div className="text-center space-y-1.5 text-slate-300 text-xs leading-relaxed px-2">
                <p className="font-semibold text-slate-200">
                  {isEnglish
                    ? "Please don't refresh or close this page, or you will lose your turn."
                    : 'Đừng thoát hoặc tải lại trang, bạn sẽ mất lượt mua vé.'}
                </p>
                <p className="text-slate-400">
                  {isEnglish
                    ? 'You will have 10 minutes to select tickets and 5 minutes to pay.'
                    : 'Bạn có 10 phút để đặt vé và 5 phút để thanh toán.'}
                </p>
                {estimatedWaitSeconds && estimatedWaitSeconds > 0 && (
                  <p className="text-[11px] text-[#E6C17A] pt-1 font-bold flex items-center justify-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#E6C17A]" />
                    <span>
                      {isEnglish
                        ? `Estimated wait: ~${Math.ceil(estimatedWaitSeconds / 60)} min`
                        : `Thời gian chờ dự kiến: ~${Math.ceil(estimatedWaitSeconds / 60)} phút`}
                    </span>
                  </p>
                )}
              </div>
            </>
          )}

          {/* STATE 3: ADMITTED */}
          {status === 'ADMITTED' && (
            <div className="py-4 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.3)] animate-pulse">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FDE047] via-[#E6C17A] to-[#C99A47] uppercase tracking-tight">
                  {isEnglish ? "IT'S YOUR TURN!" : 'ĐÃ ĐẾN LƯỢT CỦA BẠN!'}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {isEnglish
                    ? 'You have been admitted to the booking area.'
                    : 'Bạn đã được cấp quyền vào khu vực đặt vé.'}
                </p>
              </div>

              <div className="p-3 bg-black/40 rounded-2xl border border-[#C99A47]/40 inline-block px-6 shadow-inner">
                <span className="text-xs text-slate-300 font-semibold block mb-0.5">
                  {isEnglish ? 'Time remaining to book' : 'Thời gian còn lại để đặt vé'}
                </span>
                <span className="text-2xl font-black text-[#E6C17A] font-mono">
                  {formatCountdown(admittedSecondsLeft)}
                </span>
              </div>

              <div>
                {/* System Gold Button */}
                <button
                  onClick={() => proceedToBooking(bookingToken)}
                  className="w-full py-3.5 px-6 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] hover:brightness-110 font-extrabold text-sm sm:text-base shadow-[0_4px_20px_rgba(201,154,71,0.45)] transition-all transform active:scale-95 flex items-center justify-center space-x-2"
                >
                  <ShoppingBag className="w-4 h-4 text-[#0D1B2A]" />
                  <span>{isEnglish ? 'Enter Booking Area Now' : 'Tiến Hành Chọn Vé Ngay'}</span>
                </button>
                <p className="text-[11px] text-slate-400 mt-2">
                  {isEnglish ? 'Auto-redirecting in 2 seconds...' : 'Tự động chuyển hướng trong giây lát...'}
                </p>
              </div>
            </div>
          )}

          {/* STATE 4: SOLD OUT */}
          {status === 'SOLD_OUT' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(244,63,94,0.25)]">
                <Ticket className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-rose-400 uppercase">
                {isEnglish ? 'SOLD OUT' : 'SỰ KIỆN ĐÃ BÁN HẾT VÉ'}
              </h3>
              <p className="text-xs text-slate-300 max-w-xs mx-auto">
                {isEnglish
                  ? 'All available tickets for this event have been completely booked.'
                  : 'Toàn bộ số lượng vé của sự kiện đã được đặt hết. Cảm ơn sự quan tâm của bạn.'}
              </p>
              {/* Gold Button */}
              <button
                onClick={handleLeave}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] hover:brightness-110 font-extrabold text-xs transition-all active:scale-95 shadow-md"
              >
                {isEnglish ? 'Return to event details' : 'Quay về trang sự kiện'}
              </button>
            </div>
          )}

          {/* STATE 5: EXPIRED */}
          {status === 'EXPIRED' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.25)]">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-[#E6C17A] uppercase">
                {isEnglish ? 'QUEUE SESSION EXPIRED' : 'PHIÊN CHỜ ĐÃ HẾT HẠN'}
              </h3>
              <p className="text-xs text-slate-300 max-w-xs mx-auto">
                {isEnglish
                  ? 'Your waiting session has expired. Please re-enter the queue.'
                  : 'Phiên phòng chờ của bạn đã hết hạn do quá thời gian giữ lượt hoặc thao tác.'}
              </p>
              {/* Gold Button */}
              <button
                onClick={handleRetry}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] hover:brightness-110 font-extrabold text-xs transition-all active:scale-95 shadow-md"
              >
                {isEnglish ? 'Re-enter Queue' : 'Xếp hàng lại'}
              </button>
            </div>
          )}

          {/* Event Poster Section (Bottom of Card like CTicket) */}
          {eventData?.banner_url || eventData?.thumbnail_url ? (
            <div className="mt-6 rounded-2xl overflow-hidden border border-white/10 bg-slate-950 aspect-[16/9] relative shadow-inner">
              <img
                src={eventData.banner_url || eventData.thumbnail_url}
                alt={eventData.title || 'Event poster'}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                <span className="text-[11px] font-bold text-white/90 tracking-wide uppercase truncate">
                  {eventData.title}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Back Button (System Gold Pill Button) ── */}
        <div className="mt-6">
          <button
            onClick={handleLeave}
            className="rounded-full border border-[#C99A47]/70 bg-black/60 text-[#E6C17A] hover:bg-gradient-to-r hover:from-[#C99A47] hover:to-[#E6C17A] hover:text-[#0D1B2A] font-extrabold px-8 py-2.5 transition-all active:scale-95 shadow-[0_0_15px_rgba(201,154,71,0.25)] backdrop-blur-md text-xs"
          >
            {isEnglish ? 'Back to event' : 'Quay về'}
          </button>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full py-4 text-center text-[11px] text-slate-500 z-10">
        © 2026 EventHub Operations Platform. Secure Virtual Waiting Room.
      </footer>
    </div>
  )
}
