import { getAuthToken } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Heart,
  MapPin,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchEventDetail, toggleFavorite } from '@/services/events.js'
import { cn } from '@/lib/utils.js'
import { getApiMessage } from '@/lib/messages.js'
import { optimisticallySetFavorite, refreshFavoriteQueries, restoreFavoriteSnapshots } from '@/lib/favoriteCache.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import '@/components/RichTextEditor.css'

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatShortDate(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function formatPrice(value) {
  const number = Number(value)
  if (Number.isNaN(number)) return 'Liên hệ'
  if (number === 0) return 'Miễn phí'
  return `${number.toLocaleString('vi-VN')} đ`
}

function venueSummary(venue) {
  if (!venue) return 'Địa điểm cập nhật sau'
  return [venue.name, venue.address_line, venue.district, venue.city]
    .filter(Boolean)
    .join(', ')
}

function getGoogleMapUrl(venue) {
  const latitude = Number(venue?.latitude)
  const longitude = Number(venue?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`
}

function isSaleOpen(ticketType, now) {
  const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null
  const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null
  return (!saleStart || saleStart <= now) && (!saleEnd || saleEnd >= now)
}

function isPastTime(value, now) {
  return value ? new Date(value).getTime() <= now : false
}

function latestSessionEndTime(sessions = []) {
  return sessions.reduce((latest, session) => {
    const end = session?.end_time ? new Date(session.end_time).getTime() : null
    if (!Number.isFinite(end)) return latest
    return !latest || end > latest ? end : latest
  }, null)
}

function getEventEndTime(event) {
  const latestSessionEnd = latestSessionEndTime(event?.sessions || [])
  return latestSessionEnd || (event?.end_time ? new Date(event.end_time).getTime() : null)
}

function ticketTotal(ticketType) {
  return Math.max(0, Number(ticketType.quantity || 0))
}

function ticketAvailable(ticketType) {
  if (ticketType.available_quantity === null || ticketType.available_quantity === undefined) {
    return ticketTotal(ticketType)
  }
  return Math.max(0, Number(ticketType.available_quantity || 0))
}

function isSoldOut(ticketType) {
  return ticketAvailable(ticketType) <= 0
}


export function EventDetailPage() {
  const toast = useToast()
  const { eventId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [bookingError, setBookingError] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const eventQuery = useQuery({
    queryKey: ['event-detail', eventId],
    queryFn: () => fetchEventDetail(eventId),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const favoriteMutation = useMutation({
    mutationFn: (event) => toggleFavorite(event.id),
    onMutate: (event) => {
      const isFavorited = !event.is_favorited
      const snapshots = optimisticallySetFavorite(queryClient, event, isFavorited)
      toast.success(isFavorited ? '\u0110\u00e3 l\u01b0u s\u1ef1 ki\u1ec7n v\u00e0o y\u00eau th\u00edch.' : '\u0110\u00e3 b\u1ecf s\u1ef1 ki\u1ec7n kh\u1ecfi y\u00eau th\u00edch.')
      return { snapshots }
    },
    onError: (err, _event, context) => {
      restoreFavoriteSnapshots(queryClient, context?.snapshots)
      toast.error(getApiMessage(err, 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt y\u00eau th\u00edch. Vui l\u00f2ng th\u1eed l\u1ea1i.'))
    },
    onSettled: () => refreshFavoriteQueries(queryClient),
  })

  const requireLogin = () => {
    if (getAuthToken()) return false
    toast.error('Vui lòng đăng nhập để tiếp tục.')
    navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
    return true
  }

  const handleFavorite = () => {
    if (requireLogin()) return
    favoriteMutation.mutate(eventQuery.data)
  }

  const event = eventQuery.data
  const ticketsBySession = useMemo(() => {
    const map = new Map()
      ; (event?.ticket_types || []).forEach((ticketType) => {
        const key = String(ticketType.event_session_id)
        const items = map.get(key) || []
        items.push(ticketType)
        map.set(key, items)
      })
    return map
  }, [event?.ticket_types])

  const selectedSession = useMemo(() => {
    if (!event || !selectedSessionId) return null
    return (event.sessions || []).find((session) => String(session.id) === String(selectedSessionId)) || null
  }, [event, selectedSessionId])

  const selectedSessionTickets = useMemo(() => {
    if (!selectedSessionId) return []
    return ticketsBySession.get(String(selectedSessionId)) || []
  }, [selectedSessionId, ticketsBySession])

  const selectSession = (sessionId) => {
    if (requireLogin()) return
    const session = event?.sessions?.find((item) => String(item.id) === String(sessionId))
    if (isPastTime(session?.end_time || getEventEndTime(event), currentTime)) {
      setBookingError('Sự kiện hoặc suất diễn đã hết hạn, không thể mua vé.')
      return
    }
    setBookingError('')
    setSelectedSessionId((current) => (String(current) === String(sessionId) ? null : sessionId))
  }

  const handleBook = () => {
    if (requireLogin()) return
    if (!selectedSession) return
    if (isPastTime(selectedSession?.end_time || getEventEndTime(event), currentTime)) {
      setBookingError('Sự kiện hoặc suất diễn đã hết hạn, không thể mua vé.')
      return
    }
    setBookingError('')
    navigate('/booking/seats', {
      state: {
        cart: {
          eventId: event.id,
          eventTitle: event.title,
          eventSlug: event.slug,
          eventStartTime: event.start_time,
          eventEndTime: event.end_time,
          venueSummary: event.venue?.summary || venueSummary(firstVenue),
          selectedSession,
          availableTicketTypes: selectedSessionTickets,
          seatingRules: event.seating_rules || {},
          additionalTerms: event.additional_terms || '',
          requireAttendeeInfo: Boolean(event.require_attendee_info),
          items: [],
        },
      },
    })
  }

  if (eventQuery.isLoading) {
    return <StatePanel message="Đang tải chi tiết sự kiện..." />
  }

  if (eventQuery.isError || !event) {
    return <StatePanel message="Không tìm thấy sự kiện công khai này." tone="error" />
  }

  const heroImage = event.banner_url || event.thumbnail_url
  const firstVenue = event.venues?.[0]
  const overview = event.description || event.short_description || 'Thông tin chi tiết đang được cập nhật.'
  const eventEndTime = getEventEndTime(event)
  const eventExpired = isPastTime(eventEndTime, currentTime)
  const selectedSessionExpired = selectedSession ? isPastTime(selectedSession.end_time || eventEndTime, currentTime) : false

  return (
    <div className="overflow-x-hidden">
      <section className="relative h-[420px] overflow-hidden sm:h-[500px] lg:h-[600px] xl:h-[640px]">
        {heroImage && (
          <img
            src={heroImage}
            alt={event.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--color-primary)_0%,_transparent_60%)] opacity-20 mix-blend-screen" />
        <div className="relative mx-auto flex h-full w-full max-w-7xl items-end px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <div className="min-w-0 max-w-4xl">
            {event.category?.name && (
              <span className="inline-flex rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-primary shadow-[0_0_20px_rgba(6,182,212,0.2)] backdrop-blur-md">
                {event.category.name}
              </span>
            )}
            <h1 className="mt-5 break-words font-display text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl drop-shadow-xl">
              {event.title}
            </h1>
            <p className="mt-5 max-w-3xl break-words text-xl leading-relaxed text-slate-300 drop-shadow-md">
              {event.short_description}
            </p>
            <div className="mt-8 flex max-w-full flex-wrap gap-6 text-slate-200">
              <Info icon={UserCircle} text={`Ban tổ chức: ${event.organizer?.full_name || 'EventHub'}`} />
              <Info icon={Calendar} text={`${formatDateTime(event.start_time)} - ${formatDateTime(event.end_time)}`} />
              <Info icon={MapPin} text={event.venue?.summary || venueSummary(firstVenue)} />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:px-8">
        <section className="min-w-0 space-y-10">
          {/* Tổng quan Bento Card */}
          <article className="glass-panel min-w-0 overflow-hidden rounded-[24px] border-primary/20 p-8 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] relative">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--color-primary)_0%,_transparent_60%)] opacity-10" />
            <div>
              <h2 className="font-display text-3xl font-black text-white">
                Tổng quan
              </h2>
            </div>
            <div
              className="mt-5 block w-full min-w-0 text-left ql-bubble"
            >
              <div
                className={cn(
                  'block max-w-full break-words text-lg leading-8 text-muted ql-editor ql-content description-html p-0 !max-h-none [&_*]:max-w-full [&_a]:break-words [&_table]:block [&_table]:overflow-x-auto',
                  overviewOpen ? '!overflow-visible' : 'line-clamp-5 !overflow-hidden',
                )}
                dangerouslySetInnerHTML={{ __html: overview }}
              />
              <button
                type="button"
                onClick={() => setOverviewOpen((value) => !value)}
                className="mt-5 grid w-full place-items-center text-white transition hover:text-primary outline-none cursor-pointer"
                aria-expanded={overviewOpen}
              >
                {overviewOpen ? <ChevronUp className="size-6" /> : <ChevronDown className="size-6" />}
              </button>
            </div>
          </article>

          {/* Lịch diễn Bento Card */}
          <section className="glass-panel min-w-0 overflow-hidden rounded-[24px] border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] relative">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,_var(--color-primary)_0%,_transparent_60%)] opacity-10" />
            <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-8 py-5">
              <h2 className="font-display text-2xl font-black text-primary drop-shadow-md">
                Lịch diễn
              </h2>
            </div>

            <div className="space-y-4 p-8">
              {event.sessions?.length ? (
                event.sessions.map((session) => {
                  const tickets = ticketsBySession.get(String(session.id)) || []
                  const sessionExpired = isPastTime(session.end_time || eventEndTime, currentTime)
                  const selected = String(selectedSessionId) === String(session.id)
                  const expanded = expandedSessionId === session.id

                  return (
                    <div
                      key={session.id}
                      className={cn(
                        'rounded-[16px] bg-slate-900/50 border border-white/5 transition-all',
                        selected && 'ring-2 ring-primary bg-primary/5',
                      )}
                    >
                      {/* Header row: expand toggle + info + select button */}
                      <div className="flex w-full items-start gap-3 px-1 py-3">
                        {/* Nút mũi tên expand — chỉ xổ/thu thông tin vé */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSessionId((cur) => (cur === session.id ? null : session.id))
                          }
                          className="mt-1 shrink-0 text-white transition hover:text-primary"
                          aria-label={expanded ? 'Thu gọn' : 'Xem thông tin vé'}
                        >
                          <ChevronDown
                            className={cn('size-5 transition', expanded && 'rotate-180')}
                          />
                        </button>

                        {/* Thông tin suất diễn */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">
                            {formatTime(session.start_time)} - {formatTime(session.end_time)}
                          </p>
                          <p className="font-bold text-primary">
                            {formatShortDate(session.start_time)}
                          </p>
                          <p className="mt-1 break-words text-sm text-muted">
                            {session.session_name || venueSummary(session.venue)}
                          </p>
                        </div>

                        {/* Nút Chọn — chỉ chọn suất diễn cho booking */}
                        <button
                          type="button"
                          onClick={() => selectSession(session.id)}
                          disabled={sessionExpired}
                          className={cn(
                            'shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition-all',
                            sessionExpired && 'cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700',
                            !sessionExpired && selected && 'bg-primary text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]',
                            !sessionExpired && !selected && 'bg-white/10 text-white hover:bg-white/20 border border-white/10 hover:border-white/30',
                          )}
                        >
                          {sessionExpired ? 'Đã hết hạn' : selected ? 'Đã chọn' : 'Chọn'}
                        </button>
                      </div>

                      {/* Danh sách vé (chỉ hiện khi expanded) */}
                      {expanded && (
                        <div className="pb-5 pt-2 px-5">
                          <h3 className="mb-4 font-bold text-slate-300">Thông tin vé</h3>
                          <div className="space-y-3">
                            {tickets.length ? (
                              tickets.map((ticketType) => {
                                const soldOut = isSoldOut(ticketType)
                                const saleOpen = !sessionExpired && isSaleOpen(ticketType, currentTime) && !soldOut
                                const totalQuantity = ticketTotal(ticketType)
                                const availableQuantity = ticketAvailable(ticketType)
                                return (
                                  <div
                                    key={ticketType.id}
                                    className={cn(
                                      'grid min-h-20 w-full gap-4 rounded-xl border px-5 py-4 text-left md:grid-cols-[minmax(0,1fr)_170px]',
                                      saleOpen && 'border-primary/30 bg-primary/5 text-white',
                                      !saleOpen && !soldOut && 'border-white/10 bg-white/5 text-slate-400',
                                      soldOut && 'border-rose-500/30 bg-rose-500/5 text-rose-200',
                                    )}
                                  >
                                    <div className="max-w-3xl min-w-0">
                                      <p className={cn('font-bold text-lg', saleOpen ? 'text-primary drop-shadow-sm' : 'text-inherit')}>{ticketType.name}</p>
                                      {ticketType.description && (
                                        <p className={cn('mt-1 max-w-2xl whitespace-pre-line text-sm leading-6', saleOpen ? 'text-slate-300' : 'text-inherit')}>
                                          {ticketType.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="self-start text-right">
                                      <p className={cn('font-display text-xl font-bold', saleOpen ? 'text-white' : 'text-inherit')}>
                                        {formatPrice(ticketType.price)}
                                      </p>
                                      <span className={cn('mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold', saleOpen ? 'bg-primary/20 text-primary border border-primary/30' : soldOut ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-white/10 text-slate-400 border border-white/10')}>
                                        Còn {availableQuantity}/{totalQuantity}
                                      </span>
                                      {!saleOpen && (
                                        <span className={cn('mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ml-2', soldOut ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-white/10 text-slate-400 border border-white/10')}>
                                          {soldOut ? 'Hết vé' : sessionExpired ? 'Đã hết hạn' : 'Vé chưa mở bán'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            ) : (
                              <StatePanel message="Vé đang được cập nhật." compact />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <StatePanel message="Lịch diễn đang được cập nhật." compact />
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-6 font-display text-2xl font-black text-white drop-shadow-md">
              Địa điểm
            </h2>
            <div className="space-y-6">
              {event.venues?.length ? (
                event.venues.map((venue) => {
                  const mapUrl = getGoogleMapUrl(venue)

                  return (
                    <div key={venue.id} className="glass-panel overflow-hidden rounded-[24px] border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] relative">
                      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_right,_var(--color-primary)_0%,_transparent_60%)] opacity-10" />
                      {mapUrl ? (
                        <iframe
                          title={`Bản đồ ${venue.name}`}
                          src={mapUrl}
                          className="h-80 w-full border-0 md:h-[420px] mix-blend-luminosity opacity-80 transition hover:mix-blend-normal hover:opacity-100"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          allowFullScreen
                        />
                      ) : (
                        <div className="grid h-64 place-items-center border-b border-white/5 bg-slate-900/50 text-slate-400">
                          Chưa có tọa độ bản đồ cho địa điểm này.
                        </div>
                      )}
                      <div className="p-8 border-t border-white/5">
                        <h3 className="font-display text-xl font-bold text-white">{venue.name}</h3>
                        <p className="mt-2 text-sm text-slate-300">{venueSummary(venue)}</p>
                        {venue.description && <p className="mt-4 text-sm text-slate-400">{venue.description}</p>}
                      </div>
                    </div>
                  )
                })
              ) : (
                <StatePanel message="Địa điểm đang được cập nhật." compact />
              )}
            </div>
          </section>
        </section>

        <aside className="glass-panel min-w-0 h-fit rounded-[24px] p-8 lg:sticky lg:top-28 border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_60%)] opacity-20" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-black text-white drop-shadow-md">
                Vé sự kiện
              </h2>
            </div>
            <ShieldCheck className="size-7 shrink-0 text-primary drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
          </div>

          <button
            type="button"
            onClick={handleFavorite}
            disabled={favoriteMutation.isPending}
            className={cn(
              'mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-primary/40 py-3.5 font-bold text-primary transition-all hover:bg-primary/10 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] disabled:cursor-not-allowed disabled:opacity-70',
              event.is_favorited && 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(6,182,212,0.2)]',
            )}
          >
            <Heart className={cn('size-5', event.is_favorited && 'fill-current')} />
            {event.is_favorited ? 'Đã yêu thích' : 'Yêu thích'}
          </button>

          <div className="mt-8 space-y-4">
            {selectedSession ? (
              <>
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-inner">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    Suất diễn đã chọn
                  </p>
                  <h3 className="mt-2 font-bold text-white text-lg">
                    {formatShortDate(selectedSession.start_time)}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {selectedSession.session_name || venueSummary(selectedSession.venue)}
                  </p>
                </div>
                <p className="mt-4 text-sm italic text-slate-400 text-center">
                  Số lượng &amp; chỗ ngồi sẽ chọn ở bước kế tiếp
                </p>
              </>
            ) : (
              <StatePanel message="Vui lòng chọn suất diễn ở bên để tiếp tục" compact />
            )}
          </div>

          <div className="mt-8 border-t border-white/10 pt-8">
            {bookingError && (
              <p className="mb-6 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
                {bookingError}
              </p>
            )}
            <button
              type="button"
              onClick={handleBook}
              disabled={selectedSessionExpired || !selectedSession}
              className="cosmic-btn-primary w-full py-4 text-lg"
            >
              {selectedSessionExpired || (!selectedSession && eventExpired) ? 'Đã hết hạn' : selectedSession ? 'Đặt vé ngay' : 'Đặt vé'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Info({ icon: Icon, text }) {
  return (
    <div className="flex min-w-0 max-w-full items-start gap-2">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  )
}

function StatePanel({ message, tone = 'default', compact = false }) {
  return (
    <div className={`${compact ? 'p-5' : 'mx-auto my-16 max-w-3xl p-10'} rounded-[16px] border text-center ${tone === 'error' ? 'border-error/30 bg-error/10 text-error shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-white/5 bg-slate-900/50 text-slate-400 backdrop-blur-sm'}`}>
      {message}
    </div>
  )
}
