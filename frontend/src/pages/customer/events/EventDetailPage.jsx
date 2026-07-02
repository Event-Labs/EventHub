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
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchEventDetail, toggleFavorite } from '@/services/events.js'
import { cn } from '@/lib/utils.js'
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

function isSaleOpen(ticketType) {
  const now = Date.now()
  const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null
  const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null
  return (!saleStart || saleStart <= now) && (!saleEnd || saleEnd >= now)
}

function isPastTime(value) {
  return value ? new Date(value).getTime() < Date.now() : false
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

function createHoldExpiresAt() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString()
}

export function EventDetailPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [bookingError, setBookingError] = useState('')

  const eventQuery = useQuery({
    queryKey: ['event-detail', eventId],
    queryFn: () => fetchEventDetail(eventId),
  })

  const favoriteMutation = useMutation({
    mutationFn: () => toggleFavorite(eventQuery.data.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-detail', eventId] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['favorite-events'] })
    },
  })

  const requireLogin = () => {
    if (getAuthToken()) return false
    navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
    return true
  }

  const handleFavorite = () => {
    if (requireLogin()) return
    favoriteMutation.mutate()
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
    if (isPastTime(event?.end_time) || isPastTime(session?.end_time)) {
      setBookingError('Sự kiện hoặc suất diễn đã hết hạn, không thể mua vé.')
      return
    }
    setBookingError('')
    setSelectedSessionId((current) => (String(current) === String(sessionId) ? null : sessionId))
  }

  const handleBook = () => {
    if (requireLogin()) return
    if (!selectedSession) return
    if (isPastTime(event.end_time) || isPastTime(selectedSession?.end_time)) {
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
          holdExpiresAt: createHoldExpiresAt(),
          selectedSession,
          availableTicketTypes: selectedSessionTickets,
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
  const eventExpired = isPastTime(event.end_time)

  return (
    <>
      <section className="relative h-[560px] overflow-hidden">
        {heroImage && (
          <img
            src={heroImage}
            alt={event.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-surface" />
        <div className="relative mx-auto flex h-full max-w-7xl items-end px-4 pb-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            {event.category?.name && (
              <span className="rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
                {event.category.name}
              </span>
            )}
            <h1 className="mt-5 font-display text-4xl font-extrabold text-white md:text-6xl">
              {event.title}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-subtle">
              {event.short_description}
            </p>
            <div className="mt-6 flex flex-wrap gap-5 text-muted">
              <Info icon={UserCircle} text={`Ban tổ chức: ${event.organizer?.full_name || 'EventHub'}`} />
              <Info icon={Calendar} text={`${formatDateTime(event.start_time)} - ${formatDateTime(event.end_time)}`} />
              <Info icon={MapPin} text={event.venue?.summary || venueSummary(firstVenue)} />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
        <section className="space-y-10">
          <article className="rounded-lg border border-border-soft bg-panel p-6">
            <div>
              <h2 className="font-display text-3xl font-bold text-white">
                Tổng quan
              </h2>
            </div>
            <div
              className="mt-5 block w-full text-left ql-bubble"
            >
              <div
                className={cn(
                  'block text-lg leading-8 text-muted ql-editor ql-content description-html p-0',
                  !overviewOpen && 'line-clamp-5',
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

          <section className="overflow-hidden rounded-lg border border-border-soft bg-[#333945]">
            <div className="flex items-center justify-between border-b border-border-soft bg-panel px-5 py-4">
              <h2 className="font-display text-xl font-bold text-primary">
                Lịch diễn
              </h2>
            </div>

            <div className="space-y-3 p-5">
              {event.sessions?.length ? (
                event.sessions.map((session) => {
                  const tickets = ticketsBySession.get(String(session.id)) || []
                  const sessionExpired = eventExpired || isPastTime(session.end_time)
                  const selected = String(selectedSessionId) === String(session.id)
                  const expanded = expandedSessionId === session.id

                  return (
                    <div
                      key={session.id}
                      className={cn(
                        'rounded-lg bg-[#333945]',
                        selected && 'ring-2 ring-tertiary/70',
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
                          <p className="mt-1 text-sm text-muted">
                            {session.session_name || venueSummary(session.venue)}
                          </p>
                        </div>

                        {/* Nút Chọn — chỉ chọn suất diễn cho booking */}
                        <button
                          type="button"
                          onClick={() => selectSession(session.id)}
                          disabled={sessionExpired}
                          className={cn(
                            'shrink-0 rounded-md px-5 py-2 text-sm font-bold transition',
                            sessionExpired && 'cursor-not-allowed bg-slate-300 text-slate-950',
                            !sessionExpired && selected && 'bg-primary text-slate-950',
                            !sessionExpired && !selected && 'bg-tertiary text-white hover:bg-orange-600',
                          )}
                        >
                          {sessionExpired ? 'Đã hết hạn' : selected ? 'Đã chọn' : 'Chọn'}
                        </button>
                      </div>

                      {/* Danh sách vé (chỉ hiện khi expanded) */}
                      {expanded && (
                        <div className="pb-4 pt-1 px-4">
                          <h3 className="mb-3 font-bold text-white">Thông tin vé</h3>
                          <div className="space-y-3">
                            {tickets.length ? (
                              tickets.map((ticketType) => {
                                const soldOut = isSoldOut(ticketType)
                                const saleOpen = !sessionExpired && isSaleOpen(ticketType) && !soldOut
                                const totalQuantity = ticketTotal(ticketType)
                                const availableQuantity = ticketAvailable(ticketType)
                                return (
                                  <div
                                    key={ticketType.id}
                                    className={cn(
                                      'grid min-h-20 w-full gap-4 rounded-lg border px-5 py-4 text-left md:grid-cols-[minmax(0,1fr)_170px]',
                                      saleOpen && 'border-slate-500 bg-[#414856] text-white',
                                      !saleOpen && !soldOut && 'border-slate-400 bg-slate-300 text-slate-950',
                                      soldOut && 'border-rose-400 bg-rose-100 text-rose-950',
                                    )}
                                  >
                                    <div className="max-w-3xl min-w-0">
                                      <p className={cn('font-bold', saleOpen ? 'text-white' : 'text-slate-950')}>{ticketType.name}</p>
                                      {ticketType.description && (
                                        <p className={cn('mt-1 max-w-2xl whitespace-pre-line text-sm leading-6', saleOpen ? 'text-muted' : 'text-slate-800')}>
                                          {ticketType.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="self-start text-right">
                                      <p className={cn('font-display text-lg font-bold', saleOpen ? 'text-primary' : soldOut ? 'text-rose-950' : 'text-slate-950')}>
                                        {formatPrice(ticketType.price)}
                                      </p>
                                      <span className={cn('mt-2 inline-flex rounded-full px-3 py-1 text-xs font-extrabold', saleOpen ? 'bg-tertiary/20 text-orange-100 ring-1 ring-tertiary/40' : soldOut ? 'bg-rose-300 text-rose-950' : 'bg-slate-100 text-slate-950')}>
                                        Còn {availableQuantity}/{totalQuantity}
                                      </span>
                                      {!saleOpen && (
                                        <span className={cn('mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold', soldOut ? 'bg-rose-300 text-rose-950' : 'bg-slate-100 text-slate-950')}>
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
            <h2 className="mb-5 font-display text-2xl font-bold text-white">
              Địa điểm
            </h2>
            <div className="space-y-5">
              {event.venues?.length ? (
                event.venues.map((venue) => {
                  const mapUrl = getGoogleMapUrl(venue)

                  return (
                    <div key={venue.id} className="overflow-hidden rounded-lg border border-border-soft bg-panel">
                      {mapUrl ? (
                        <iframe
                          title={`Bản đồ ${venue.name}`}
                          src={mapUrl}
                          className="h-80 w-full border-0 md:h-[420px]"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          allowFullScreen
                        />
                      ) : (
                        <div className="grid h-64 place-items-center border-b border-border-soft bg-surface text-muted">
                          Chưa có tọa độ bản đồ cho địa điểm này.
                        </div>
                      )}
                      <div className="p-5">
                        <h3 className="font-display text-xl font-bold text-white">{venue.name}</h3>
                        <p className="mt-2 text-sm text-muted">{venueSummary(venue)}</p>
                        {venue.description && <p className="mt-3 text-sm text-subtle">{venue.description}</p>}
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

        <aside className="glass-panel h-fit rounded-lg p-6 lg:sticky lg:top-28">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                Vé sự kiện
              </h2>
            </div>
            <ShieldCheck className="size-6 shrink-0 text-primary" />
          </div>

          <button
            type="button"
            onClick={handleFavorite}
            disabled={favoriteMutation.isPending}
            className={cn(
              'mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 py-3 font-bold text-primary transition hover:bg-primary hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-70',
              event.is_favorited && 'bg-primary text-slate-950',
            )}
          >
            <Heart className={cn('size-5', event.is_favorited && 'fill-current')} />
            {event.is_favorited ? 'Đã yêu thích' : 'Yêu thích'}
          </button>

          <div className="mt-6 space-y-3">
            {selectedSession ? (
              <>
                <div className="rounded-md border border-tertiary/50 bg-panel-soft p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-tertiary">
                    Suất diễn đã chọn
                  </p>
                  <h3 className="mt-2 font-bold text-white">
                    {formatShortDate(selectedSession.start_time)}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {formatTime(selectedSession.start_time)} - {formatTime(selectedSession.end_time)}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {selectedSession.session_name || venueSummary(selectedSession.venue)}
                  </p>
                </div>
                <p className="mt-3 text-sm italic text-white">
                  Số lượng &amp; chỗ ngồi sẽ chọn ở bước kế tiếp
                </p>
              </>
            ) : (
              <StatePanel message="Chọn suất diễn để tiếp tục" compact />
            )}
          </div>

          <div className="mt-6 border-t border-border-soft pt-5">
            {bookingError && (
              <p className="mt-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                {bookingError}
              </p>
            )}
            <button
              type="button"
              onClick={handleBook}
              disabled={eventExpired || !selectedSession}
              className="mt-6 flex w-full items-center justify-center rounded-md bg-tertiary py-4 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {eventExpired ? 'Đã hết hạn' : selectedSession ? 'Đặt vé ngay' : 'Đặt vé'}
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}

function Info({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5 text-primary" />
      <span>{text}</span>
    </div>
  )
}

function StatePanel({ message, tone = 'default', compact = false }) {
  return (
    <div className={`${compact ? 'p-5' : 'mx-auto my-16 max-w-3xl p-8'} rounded-lg border text-center ${tone === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-border-soft bg-panel text-muted'}`}>
      {message}
    </div>
  )
}
