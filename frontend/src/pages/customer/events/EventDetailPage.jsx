import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Heart,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchEventDetail, toggleFavorite } from '@/services/events.js'
import { cn } from '@/lib/utils.js'

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

export function EventDetailPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState(null)
  const [selectedTickets, setSelectedTickets] = useState({})

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
    if (localStorage.getItem('eventhub-token')) return false
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
    ;(event?.ticket_types || []).forEach((ticketType) => {
      const key = String(ticketType.event_session_id)
      const items = map.get(key) || []
      items.push(ticketType)
      map.set(key, items)
    })
    return map
  }, [event?.ticket_types])

  const selectedTicketItems = useMemo(() => {
    if (!event) return []
    const byId = new Map((event.ticket_types || []).map((ticketType) => [String(ticketType.id), ticketType]))
    return Object.entries(selectedTickets)
      .map(([id, quantity]) => ({ ticketType: byId.get(id), quantity }))
      .filter((item) => item.ticketType && item.quantity > 0)
  }, [event, selectedTickets])

  const selectSession = (sessionId) => {
    if (requireLogin()) return
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId))
  }

  const selectTicket = (ticketType) => {
    if (requireLogin()) return
    if (!isSaleOpen(ticketType)) return
    setSelectedTickets((current) => {
      const next = { ...current }
      if (next[ticketType.id]) delete next[ticketType.id]
      else next[ticketType.id] = 1
      return next
    })
  }

  const updateQuantity = (ticketType, delta) => {
    if (requireLogin()) return
    setSelectedTickets((current) => {
      const nextQuantity = Math.max(0, (current[ticketType.id] || 0) + delta)
      const next = { ...current }
      if (nextQuantity === 0) delete next[ticketType.id]
      else next[ticketType.id] = Math.min(nextQuantity, ticketType.max_per_order || 10)
      return next
    })
  }

  const handleBook = () => {
    if (requireLogin()) return
    if (selectedTicketItems.length === 0) return
    const sessionMap = new Map((event.sessions || []).map((session) => [String(session.id), session]))
    navigate('/booking/seats', {
      state: {
        cart: {
          eventId: event.id,
          eventTitle: event.title,
          eventSlug: event.slug,
          eventStartTime: event.start_time,
          eventEndTime: event.end_time,
          venueSummary: event.venue?.summary || venueSummary(firstVenue),
          holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          availableTicketTypes: event.ticket_types || [],
          items: selectedTicketItems.map((item) => ({
            ...item,
            session: sessionMap.get(String(item.ticketType.event_session_id)),
          })),
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
  const total = selectedTicketItems.reduce(
    (sum, item) => sum + Number(item.ticketType.price || 0) * item.quantity,
    0,
  )

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
            <button
              type="button"
              onClick={() => setOverviewOpen((value) => !value)}
              className="mt-5 block w-full text-left"
              aria-expanded={overviewOpen}
            >
              <span
                className={cn(
                  'block whitespace-pre-line text-lg leading-8 text-muted',
                  !overviewOpen && 'line-clamp-5',
                )}
              >
                {overview}
              </span>
              <span className="mt-5 grid w-full place-items-center text-white transition hover:text-primary">
                {overviewOpen ? <ChevronUp className="size-6" /> : <ChevronDown className="size-6" />}
              </span>
            </button>
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
                  const expanded = expandedSessionId === session.id

                  return (
                    <div key={session.id} className="rounded-lg bg-[#333945]">
                      <button
                        type="button"
                        onClick={() => selectSession(session.id)}
                        className="flex w-full items-start justify-between gap-4 rounded-md px-1 py-3 text-left"
                      >
                        <div className="flex gap-4">
                          <ChevronDown
                            className={cn(
                              'mt-2 size-5 text-white transition',
                              expanded && 'rotate-180',
                            )}
                          />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {formatTime(session.start_time)} - {formatTime(session.end_time)}
                            </p>
                            <p className="font-bold text-primary">
                              {formatShortDate(session.start_time)}
                            </p>
                            <p className="mt-2 text-sm text-muted">
                              {session.session_name || venueSummary(session.venue)}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-md bg-white px-5 py-2 text-sm font-bold text-muted">
                          {tickets.some(isSaleOpen) ? 'Chọn vé' : 'Vé chưa mở bán'}
                        </span>
                      </button>

                      {expanded && (
                        <div className="pt-4">
                          <h3 className="mb-4 font-bold text-white">Thông tin vé</h3>
                          <div className="space-y-3">
                            {tickets.length ? (
                              tickets.map((ticketType) => {
                                const saleOpen = isSaleOpen(ticketType)
                                return (
                                  <button
                                    key={ticketType.id}
                                    type="button"
                                    onClick={() => selectTicket(ticketType)}
                                    disabled={!saleOpen}
                                    className={cn(
                                      'grid min-h-20 w-full gap-4 rounded-lg border border-slate-500 bg-[#414856] px-5 py-4 text-left transition md:grid-cols-[minmax(0,1fr)_140px]',
                                      saleOpen ? 'hover:border-primary' : 'cursor-not-allowed opacity-85',
                                    )}
                                  >
                                    <div className="max-w-3xl min-w-0">
                                      <p className="font-bold text-white">{ticketType.name}</p>
                                      {ticketType.description && (
                                        <p className="mt-1 max-w-2xl whitespace-pre-line text-sm leading-6 text-muted">
                                          {ticketType.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="self-start text-right">
                                      <p className="font-display text-lg font-bold text-primary">
                                        {formatPrice(ticketType.price)}
                                      </p>
                                      {!saleOpen && (
                                        <span className="mt-2 inline-flex rounded-full bg-orange-200 px-3 py-1 text-xs font-bold text-orange-700">
                                          Vé chưa mở bán
                                        </span>
                                      )}
                                    </div>
                                  </button>
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
              <p className="mt-1 text-sm text-muted">
                Vé đã chọn sẽ hiển thị tại đây
              </p>
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
            {selectedTicketItems.length ? (
              selectedTicketItems.map(({ ticketType, quantity }) => (
                <div key={ticketType.id} className="rounded-md border border-border-soft bg-panel-soft p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-white">{ticketType.name}</h3>
                      <p className="mt-1 text-sm text-muted">{formatPrice(ticketType.price)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateQuantity(ticketType, -1)}
                        className="grid size-8 place-items-center rounded-full border border-border-soft text-subtle hover:border-primary hover:text-primary"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-6 text-center font-display text-xl font-bold text-primary">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(ticketType, 1)}
                        className="grid size-8 place-items-center rounded-full border border-border-soft text-subtle hover:border-primary hover:text-primary"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <StatePanel message="Chọn suất diễn và hạng vé ở phần Lịch diễn" compact />
            )}
          </div>

          <div className="mt-6 border-t border-border-soft pt-5">
            <div className="flex items-center justify-between">
              <span className="text-muted">Tạm tính</span>
              <span className="font-display text-2xl font-bold text-primary">
                {formatPrice(total)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleBook}
              disabled={selectedTicketItems.length === 0}
              className="mt-6 flex w-full items-center justify-center rounded-md bg-tertiary py-4 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Đặt vé
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
