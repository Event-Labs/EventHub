import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, Star, Ticket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchMyTickets } from '@/services/tickets.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { cleanAndFormatVenue } from '@/i18n/eventTranslations.js'
import { translatePhrase } from '@/i18n/phraseDictionary.js'

const TICKETS_PER_PAGE = 6

function getTicketFilters(isEnglish) {
  return [
    { value: 'ALL', label: isEnglish ? 'All' : 'Tất cả' },
    { value: 'VALID', label: isEnglish ? 'Valid' : 'Hợp lệ' },
    { value: 'USED', label: isEnglish ? 'Used' : 'Đã dùng' },
    { value: 'REFUND_PENDING', label: isEnglish ? 'Refund Pending' : 'Chờ hoàn tiền' },
    { value: 'REFUNDED', label: isEnglish ? 'Refunded' : 'Đã hoàn' },
    { value: 'EXPIRED', label: isEnglish ? 'Expired' : 'Hết hạn' },
    { value: 'CANCELLED', label: isEnglish ? 'Cancelled' : 'Đã hủy' },
  ]
}

const getAutoIsEnglish = () => (typeof document !== 'undefined' && document.documentElement.lang === 'en') || (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en')

function formatDateTime(value, isEnglish = getAutoIsEnglish()) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusMeta(ticket, isEnglish = getAutoIsEnglish()) {
  if (ticket.status === 'USED') {
    return { label: isEnglish ? 'Used' : 'Đã dùng', className: 'bg-slate-500/15 text-slate-300 border border-slate-500/20' }
  }
  if (ticket.status === 'EXPIRED') {
    return { label: isEnglish ? 'Expired' : 'Hết hạn', className: 'bg-rose-500/15 text-rose-300 border border-rose-500/20' }
  }
  if (ticket.status === 'CANCELLED') {
    return { label: isEnglish ? 'Cancelled' : 'Đã hủy', className: 'bg-slate-500/15 text-slate-400 border border-slate-500/20' }
  }
  if (ticket.status === 'REFUNDED') {
    return { label: isEnglish ? 'Refunded' : 'Đã hoàn', className: 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.25)]' }
  }
  if (ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED' || ticket.event?.status === 'CANCELLED') {
    return { label: isEnglish ? 'Refund Pending' : 'Chờ hoàn tiền', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]' }
  }
  return { label: isEnglish ? 'Valid' : 'Hợp lệ', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]' }
}

const STATUS_RANK = {
  VALID: 1,          // 1. Ưu tiên vé hợp lệ lên đầu
  REFUND_PENDING: 2, // 2. Chờ hoàn tiền
  REFUND_REQUESTED: 2,
  USED: 3,           // 3. Đã dùng
  EXPIRED: 4,        // 4. Hết hạn
  CANCELLED: 5,      // 5. Đã hủy
  REFUNDED: 6,       // 6. Vé đã hoàn đưa xuống dưới
}

function venueLine(ticket) {
  const parts = [
    ticket.venue?.address,
    ticket.venue?.ward,
    ticket.venue?.district,
    ticket.venue?.province,
  ].filter(Boolean)
  return parts.join(', ')
}

export function MyTicketsPage() {
  const { isEnglish, t } = useLanguage()
  const filters = useMemo(() => getTicketFilters(isEnglish), [isEnglish])
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('ALL')
  const [page, setPage] = useState(1)
  const isAuthenticated = hasAuthSession()
  const currentUserKey = getStoredUserKey()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const ticketsQuery = useQuery({
    queryKey: ['my-tickets', status, currentUserKey],
    queryFn: () => fetchMyTickets(status),
    enabled: isAuthenticated,
  })

  const tickets = useMemo(() => {
    const list = [...(ticketsQuery.data || [])]
    return list.sort((a, b) => {
      // 1. Ưu tiên vé còn hợp lệ lên đầu
      const rankA = STATUS_RANK[a.status] ?? 99
      const rankB = STATUS_RANK[b.status] ?? 99
      if (rankA !== rankB) {
        return rankA - rankB
      }

      // 2. Trong cùng nhóm trạng thái: vé mới mua luôn phải hiện ở đầu, rồi giảm dần
      const timeA = new Date(a.order?.created_at || a.created_at || 0).getTime()
      const timeB = new Date(b.order?.created_at || b.created_at || 0).getTime()
      if (timeA !== timeB) {
        return timeB - timeA
      }
      const ticketTimeA = a.created_at ? new Date(a.created_at).getTime() : 0
      const ticketTimeB = b.created_at ? new Date(b.created_at).getTime() : 0
      if (ticketTimeA !== ticketTimeB) {
        return ticketTimeB - ticketTimeA
      }
      return (b.id ?? 0) - (a.id ?? 0) || String(b.ticket_code || '').localeCompare(String(a.ticket_code || ''))
    })
  }, [ticketsQuery.data])

  const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE))
  const paginatedTickets = tickets.slice((page - 1) * TICKETS_PER_PAGE, page * TICKETS_PER_PAGE)

  const handlePageChange = (newPage) => {
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!isAuthenticated) return null

  return (
    <div className="force-dark mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-8 sm:pb-12">
      {/* Header & Filter Bar aligned to the right */}
      <div className="flex flex-col gap-2.5 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader
          title={isEnglish ? 'My Tickets' : 'Thông tin Vé'}
          description={
            isEnglish
              ? 'Manage your purchased tickets, check-in status, and event passes.'
              : 'Quản lý vé đã mua, thông tin check-in và chi tiết vé'
          }
        />

        <div className="flex w-full sm:w-auto overflow-x-auto rounded-2xl sm:rounded-full glass-panel p-1.5 border-white/10 shadow-inner self-start lg:self-end scrollbar-hide no-scrollbar gap-1.5">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setStatus(item.value)
                setPage(1)
              }}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold transition-all ${status === item.value
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-md shadow-[#C99A47]/30'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {ticketsQuery.isLoading && (
        <div className="flex items-center justify-center py-20 text-sm gap-2.5" style={{ color: '#94a3b8' }}>
          <div className="size-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <span>{isEnglish ? 'Loading tickets...' : 'Đang tải danh sách vé...'}</span>
        </div>
      )}

      {ticketsQuery.isError && (
        <div className="flex items-center justify-center py-20 text-sm text-rose-400 gap-2">
          <span>{isEnglish ? 'Failed to load tickets. Please try again later.' : 'Không thể tải danh sách vé. Vui lòng thử lại sau.'}</span>
        </div>
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && tickets.length === 0 && (
        <div className="empty-tickets-view flex flex-col items-center justify-center py-10 sm:py-12 text-center w-full">
          <h3
            className="text-base sm:text-lg font-semibold tracking-tight text-white mb-1.5 drop-shadow-md italic"
            style={{ color: '#ffffff', display: 'block', opacity: 1, visibility: 'visible', fontStyle: 'italic' }}
          >
            {status === 'ALL'
              ? (isEnglish ? 'No event tickets yet' : 'Chưa có vé sự kiện nào')
              : (isEnglish ? 'No tickets found' : 'Hiện chưa có vé')}
          </h3>
          <div
            className="italic"
            style={{
              color: 'rgb(203, 213, 225)',
              fontSize: '14px',
              lineHeight: '22px',
              fontWeight: 400,
              fontStyle: 'italic',
              display: 'block',
              opacity: 1,
              visibility: 'visible',
              padding: '0',
              margin: '6px auto 0',
              maxWidth: '32rem',
              textAlign: 'center',
              WebkitTextFillColor: 'rgb(203, 213, 225)',
              position: 'relative',
              zIndex: 10,
            }}
          >
            {status === 'ALL'
              ? (isEnglish ? 'You do not have any event tickets in your ticket list yet.' : 'Bạn chưa có vé sự kiện nào trong danh sách vé của mình.')
              : (isEnglish
                ? `No event tickets found under "${filters.find((f) => f.value === status)?.label || status}".`
                : `Hiện không có vé sự kiện nào thuộc mục "${filters.find((f) => f.value === status)?.label || status}".`)}
          </div>
        </div>
      )}

      {paginatedTickets.length > 0 && (
        <div className="mt-4 sm:mt-8 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
          {paginatedTickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && totalPages > 1 && (
        <nav className="mt-10 flex flex-col items-center gap-3" aria-label={isEnglish ? 'My tickets pagination' : 'Phân trang vé của tôi'}>
          <div className="flex items-center gap-2 p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="grid size-10 place-items-center rounded-full border border-white/20 bg-slate-800 text-white transition-all hover:border-[#E6C17A] hover:bg-[#C99A47]/20 hover:text-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.35)] disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-white/20 disabled:hover:bg-slate-800 disabled:hover:text-white disabled:hover:shadow-none"
              aria-label={isEnglish ? 'Previous page' : 'Trang trước'}
            >
              <ChevronLeft className="size-5" />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => handlePageChange(pageNumber)}
                className={`size-10 rounded-full text-sm font-extrabold transition-all ${page === pageNumber
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-[0_0_18px_rgba(201,154,71,0.6)] scale-105'
                  : 'border border-white/20 bg-slate-800 text-white hover:border-[#E6C17A] hover:bg-[#C99A47]/20 hover:text-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.35)]'
                  }`}
                aria-current={page === pageNumber ? 'page' : undefined}
                aria-label={isEnglish ? `Page ${pageNumber}` : `Trang ${pageNumber}`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="grid size-10 place-items-center rounded-full border border-white/20 bg-slate-800 text-white transition-all hover:border-[#E6C17A] hover:bg-[#C99A47]/20 hover:text-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.35)] disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-white/20 disabled:hover:bg-slate-800 disabled:hover:text-white disabled:hover:shadow-none"
              aria-label={isEnglish ? 'Next page' : 'Trang sau'}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <p className="text-xs font-medium text-slate-400">
            {isEnglish ? 'Page ' : 'Trang '}
            <span className="font-extrabold text-white">{page}</span>
            {isEnglish ? ' of ' : ' / '}
            <span className="font-extrabold text-white">{totalPages}</span>
            &nbsp;·&nbsp;
            <span className="text-slate-300 font-semibold">{tickets.length} {isEnglish ? 'tickets' : 'vé'}</span>
          </p>
        </nav>
      )}
    </div>
  )
}


function TicketCard({ ticket }) {
  const { isEnglish, t } = useLanguage()
  const navigate = useNavigate()
  const meta = statusMeta(ticket, isEnglish)
  const venue = venueLine(ticket)
  const venueText = cleanAndFormatVenue(ticket.venue || venue, isEnglish) || (isEnglish ? 'N/A' : 'Chưa có địa điểm')
  const eventTitle = isEnglish ? (translatePhrase(ticket.event?.title, 'en') || ticket.event?.title) : ticket.event?.title
  const ticketTypeName = isEnglish ? (translatePhrase(ticket.ticket_type?.name, 'en') || ticket.ticket_type?.name) : ticket.ticket_type?.name
  const seat = ticket.seat?.label

  // Các vé hợp lệ hoặc chờ hoàn tiền thì hiện màu sẵn, vé hết hạn/hủy thì không còn màu
  const isValid = ticket.status === 'VALID'
  const isRefundPending = ticket.status === 'REFUND_PENDING'
  const isRefunded = ticket.status === 'REFUNDED'
  const isVibrant = isValid || isRefundPending
  const isExpired = ticket.status === 'EXPIRED' || ticket.status === 'CANCELLED'

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className={`glass-panel group relative flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_36%] min-h-full overflow-hidden rounded-[20px] sm:rounded-[24px] transition-all duration-300 ${isValid
        ? 'border-primary/40 shadow-[0_8px_32px_0_rgba(6,182,212,0.18)] hover:border-primary/70 hover:shadow-[0_8px_32px_0_rgba(6,182,212,0.35)] hover:-translate-y-1'
        : isRefundPending
          ? 'border-amber-500/40 shadow-[0_8px_32px_0_rgba(245,158,11,0.18)] hover:border-amber-500/70 hover:shadow-[0_8px_32px_0_rgba(245,158,11,0.35)] hover:-translate-y-1'
          : isRefunded
            ? 'border-purple-500/30 opacity-80 hover:opacity-100 hover:border-purple-400/60 hover:shadow-[0_8px_32px_0_rgba(168,85,247,0.25)]'
            : isExpired
              ? 'border-white/5 opacity-55 grayscale hover:opacity-85 hover:grayscale-0 hover:border-white/20'
              : 'border-white/10 opacity-75 hover:opacity-100 hover:border-[#E6C17A]/30'
        }`}
    >
      {/* Nền radial glow */}
      <div
        className={`absolute inset-0 -z-10 transition-opacity duration-300 ${isValid
          ? 'bg-[radial-gradient(circle_at_50%_100%,_rgba(201,154,71,0.25)_0%,_transparent_65%)] opacity-20 group-hover:opacity-35'
          : isRefundPending
            ? 'bg-[radial-gradient(circle_at_50%_100%,_rgba(245,158,11,0.3)_0%,_transparent_65%)] opacity-25 group-hover:opacity-40'
            : isRefunded
              ? 'bg-[radial-gradient(circle_at_50%_100%,_rgba(168,85,247,0.25)_0%,_transparent_65%)] opacity-20 group-hover:opacity-35'
              : 'opacity-0'
          }`}
      />

      <section className="ticket-card-main flex flex-1 flex-col justify-between p-4 sm:p-6 min-h-0 sm:min-h-56">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={`rounded-full px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] font-bold tracking-wider ${meta.className}`}>
              {meta.label}
            </span>
            <span className={`font-mono text-[10px] sm:text-[11px] font-bold ${isVibrant ? 'text-slate-300' : 'text-slate-500'}`}>{ticket.ticket_code}</span>
          </div>
          <h2 className={`mt-3 sm:mt-4 line-clamp-2 font-display text-lg sm:text-xl font-black leading-tight transition-colors ${isVibrant ? 'text-white group-hover:text-[#E6C17A]' : 'text-slate-300 group-hover:text-white'
            }`}>
            {eventTitle}
          </h2>
        </div>

        <div className={`mt-4 sm:mt-6 grid gap-2.5 sm:gap-3 text-xs sm:text-sm ${isVibrant ? 'text-slate-200' : 'text-slate-400'}`}>
          <InfoLine icon={CalendarDays} value={formatDateTime(ticket.session?.start_time, isEnglish)} iconActive={isVibrant} />
          <InfoLine icon={Ticket} value={seat ? `${ticketTypeName} · ${isEnglish ? 'Seat' : 'Ghế'} ${seat}` : `${ticketTypeName} · ${isEnglish ? 'Standing Area' : 'Khu vực đứng'}`} iconActive={isVibrant} />
          <InfoLine icon={MapPin} value={venueText} wrap iconActive={isVibrant} />
          <InfoLine
            icon={CheckCircle2}
            value={ticket.status === 'EXPIRED' ? (isEnglish ? 'Check-in Expired' : 'Đã hết hạn check-in') : ticket.check_in_status === 'CHECKED_IN' ? (isEnglish ? 'Checked In' : 'Đã check-in') : (isEnglish ? 'Not Checked In' : 'Chưa check-in')}
            iconActive={isVibrant}
          />
        </div>

        {((Boolean(ticket.checked_in_at) || ticket.status === 'USED' || ticket.check_in_status === 'CHECKED_IN' || (ticket.session?.end_time && new Date(ticket.session.end_time) <= new Date()) || ticket.event?.status === 'COMPLETED') && ticket.status !== 'CANCELLED' && ticket.status !== 'REFUNDED' && ticket.status !== 'REFUND_PENDING') && (
          <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#E6C17A]">{isEnglish ? 'Attended' : 'Đã tham gia'}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                navigate(`/feedback?eventId=${ticket.event?.id}`)
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-[#0D1B2A] bg-gradient-to-r from-[#C99A47] to-[#E6C17A] hover:brightness-110 shadow-md shadow-[#C99A47]/20 transition-all cursor-pointer active:scale-95"
            >
              <Star className="size-3.5 fill-[#0D1B2A]" />
              {isEnglish ? 'Review Event' : 'Đánh giá sự kiện'}
            </button>
          </div>
        )}
      </section>

      <section className={`relative h-44 sm:h-auto sm:min-h-56 overflow-hidden border-t-2 sm:border-t-0 sm:border-l-2 border-dashed ${isVibrant ? 'bg-slate-900/40 border-primary/25 sm:border-primary/20' : 'bg-slate-950/60 border-white/10 sm:border-white/5'
        }`}>
        {ticket.event.thumbnail_url ? (
          <img
            src={ticket.event.thumbnail_url}
            alt=""
            className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${isVibrant
              ? 'opacity-90 mix-blend-normal group-hover:opacity-100'
              : 'opacity-40 mix-blend-luminosity grayscale group-hover:opacity-75 group-hover:mix-blend-normal group-hover:grayscale-0'
              }`}
          />
        ) : (
          <div className="grid h-full min-h-56 place-items-center bg-white/5">
            <Ticket className={`size-12 ${isVibrant ? 'text-primary opacity-70 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'text-slate-600 opacity-40'}`} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/30 to-transparent" />
        <div className={`absolute bottom-4 left-4 right-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-bold tracking-wider backdrop-blur-md ${isValid
          ? 'border border-primary/30 bg-primary/15 text-primary shadow-[0_0_15px_rgba(6,182,212,0.25)]'
          : isRefundPending
            ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
            : isRefunded
              ? 'border border-purple-500/30 bg-purple-500/15 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.25)]'
              : 'border border-white/5 bg-white/5 text-slate-400 shadow-none'
          }`}>
          <Clock3 className="size-4 shrink-0" />
          <span className="truncate">{isEnglish ? 'Purchased at ' : 'Mua lúc '}{formatDateTime(ticket.order?.created_at, isEnglish)}</span>
        </div>
      </section>
    </Link>
  )
}

function InfoLine({ icon: Icon, value, wrap = false, iconActive = true }) {
  return (
    <span className={`inline-flex min-w-0 gap-2 ${wrap ? 'items-start' : 'items-center'}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconActive ? 'text-primary' : 'text-slate-500'}`} />
      <span className={wrap ? 'whitespace-normal break-words leading-relaxed' : 'truncate'}>{value}</span>
    </span>
  )
}
