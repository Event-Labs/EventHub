import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, Ticket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchMyTickets } from '@/services/tickets.js'

const FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'VALID', label: 'Hợp lệ' },
  { value: 'USED', label: 'Đã dùng' },
  { value: 'REFUND_PENDING', label: 'Chờ hoàn tiền' },
  { value: 'REFUNDED', label: 'Đã hoàn' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]
const TICKETS_PER_PAGE = 6

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusMeta(ticket) {
  if (ticket.status === 'USED') {
    return { label: 'Đã dùng', className: 'bg-slate-500/15 text-slate-300 border border-slate-500/20' }
  }
  if (ticket.status === 'EXPIRED') {
    return { label: 'Hết hạn', className: 'bg-rose-500/15 text-rose-300 border border-rose-500/20' }
  }
  if (ticket.status === 'CANCELLED') {
    return { label: 'Đã hủy', className: 'bg-slate-500/15 text-slate-400 border border-slate-500/20' }
  }
  if (ticket.status === 'REFUNDED') {
    return { label: 'Đã hoàn', className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' }
  }
  if (ticket.status === 'REFUND_PENDING') {
    return { label: 'Chờ hoàn tiền', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]' }
  }
  return { label: 'Hợp lệ', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]' }
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

  const tickets = useMemo(() => [...(ticketsQuery.data || [])].sort((a, b) => {
    const difference = new Date(b.order?.created_at || b.created_at || 0) - new Date(a.order?.created_at || a.created_at || 0)
    return difference || String(b.id).localeCompare(String(a.id))
  }), [ticketsQuery.data])
  const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE))
  const paginatedTickets = tickets.slice((page - 1) * TICKETS_PER_PAGE, page * TICKETS_PER_PAGE)

  const handlePageChange = (newPage) => {
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!isAuthenticated) return null

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header & Filter Bar aligned to the right */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader
          title="Thông tin Vé"
          description="Quản lý vé đã mua, thông tin check-in và chi tiết vé"
        />

        <div className="flex max-w-full overflow-x-auto rounded-full glass-panel p-1.5 border-white/10 shadow-inner self-start lg:self-end scrollbar-hide">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setStatus(item.value)
                setPage(1)
              }}
              className={`min-w-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === item.value
                ? 'bg-primary/25 text-primary border border-primary/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {ticketsQuery.isLoading && (
        <p className="mt-8 text-sm text-muted">Đang tải vé...</p>
      )}

      {ticketsQuery.isError && (
        <p className="mt-8 text-sm text-error">Không thể tải danh sách vé.</p>
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && tickets.length === 0 && (
        <div className="grid min-h-[360px] place-items-center">
          <p className="text-center text-sm italic text-muted">
            hiện chưa có vé nào......
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {paginatedTickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>

      {!ticketsQuery.isLoading && !ticketsQuery.isError && totalPages > 1 && (
        <nav className="mt-10 flex flex-col items-center gap-3" aria-label="Phân trang vé của tôi">
          <div className="flex items-center gap-2 p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="grid size-10 place-items-center rounded-full border border-white/20 bg-slate-800 text-white transition-all hover:border-primary hover:bg-primary/20 hover:text-primary hover:shadow-[0_0_12px_rgba(6,182,212,0.35)] disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-white/20 disabled:hover:bg-slate-800 disabled:hover:text-white disabled:hover:shadow-none"
              aria-label="Trang trước"
            >
              <ChevronLeft className="size-5" />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => handlePageChange(pageNumber)}
                className={`size-10 rounded-full text-sm font-extrabold transition-all ${page === pageNumber
                  ? 'bg-primary text-slate-950 font-black shadow-[0_0_18px_rgba(6,182,212,0.6)] scale-105'
                  : 'border border-white/20 bg-slate-800 text-white hover:border-primary hover:bg-primary/20 hover:text-primary hover:shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                  }`}
                aria-current={page === pageNumber ? 'page' : undefined}
                aria-label={`Trang ${pageNumber}`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="grid size-10 place-items-center rounded-full border border-white/20 bg-slate-800 text-white transition-all hover:border-primary hover:bg-primary/20 hover:text-primary hover:shadow-[0_0_12px_rgba(6,182,212,0.35)] disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-white/20 disabled:hover:bg-slate-800 disabled:hover:text-white disabled:hover:shadow-none"
              aria-label="Trang sau"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <p className="text-xs font-medium text-slate-400">
            Trang <span className="font-extrabold text-white">{page}</span> / <span className="font-extrabold text-white">{totalPages}</span>
            &nbsp;·&nbsp;
            <span className="text-slate-300 font-semibold">{tickets.length} vé</span>
          </p>
        </nav>
      )}
    </div>
  )
}


function TicketCard({ ticket }) {
  const meta = statusMeta(ticket)
  const venue = venueLine(ticket)
  const venueText = [ticket.venue?.name, venue].filter(Boolean).join(', ') || 'N/A'
  const seat = ticket.seat?.label

  // Các vé hợp lệ hoặc chờ hoàn tiền thì hiện màu sẵn, vé hết hạn/hủy thì không còn màu
  const isValid = ticket.status === 'VALID'
  const isRefundPending = ticket.status === 'REFUND_PENDING'
  const isVibrant = isValid || isRefundPending
  const isExpired = ticket.status === 'EXPIRED' || ticket.status === 'CANCELLED'

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className={`glass-panel group relative grid min-h-full overflow-hidden rounded-[24px] transition-all duration-300 sm:grid-cols-[minmax(0,1fr)_36%] ${isValid
        ? 'border-primary/40 shadow-[0_8px_32px_0_rgba(6,182,212,0.18)] hover:border-primary/70 hover:shadow-[0_8px_32px_0_rgba(6,182,212,0.35)] hover:-translate-y-1'
        : isRefundPending
          ? 'border-amber-500/40 shadow-[0_8px_32px_0_rgba(245,158,11,0.18)] hover:border-amber-500/70 hover:shadow-[0_8px_32px_0_rgba(245,158,11,0.35)] hover:-translate-y-1'
          : isExpired
            ? 'border-white/5 opacity-55 grayscale hover:opacity-85 hover:grayscale-0 hover:border-white/20'
            : 'border-white/10 opacity-75 hover:opacity-100 hover:border-primary/30'
        }`}
    >
      {/* Nền radial glow: Vé hợp lệ hoặc chờ hoàn tiền luôn hiện màu sẵn */}
      <div
        className={`absolute inset-0 -z-10 transition-opacity duration-300 ${isValid
          ? 'bg-[radial-gradient(circle_at_50%_100%,_var(--color-primary)_0%,_transparent_65%)] opacity-20 group-hover:opacity-35'
          : isRefundPending
            ? 'bg-[radial-gradient(circle_at_50%_100%,_rgba(245,158,11,0.3)_0%,_transparent_65%)] opacity-25 group-hover:opacity-40'
            : 'opacity-0'
          }`}
      />

      <section className="ticket-card-main flex min-h-56 flex-col justify-between p-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-wider ${meta.className}`}>
              {meta.label}
            </span>
            <span className={`font-mono text-[11px] font-bold ${isVibrant ? 'text-slate-300' : 'text-slate-500'}`}>{ticket.ticket_code}</span>
          </div>
          <h2 className={`mt-4 line-clamp-2 font-display text-xl font-black leading-tight transition-colors ${isVibrant ? 'text-white group-hover:text-primary' : 'text-slate-300 group-hover:text-white'
            }`}>
            {ticket.event.title}
          </h2>
        </div>

        <div className={`mt-6 grid gap-3 text-sm ${isVibrant ? 'text-slate-200' : 'text-slate-400'}`}>
          <InfoLine icon={CalendarDays} value={formatDateTime(ticket.session?.start_time)} iconActive={isVibrant} />
          <InfoLine icon={Ticket} value={seat ? `${ticket.ticket_type.name} · Ghế ${seat}` : `${ticket.ticket_type.name} · Khu vực đứng`} iconActive={isVibrant} />
          <InfoLine icon={MapPin} value={venueText} wrap iconActive={isVibrant} />
          <InfoLine
            icon={CheckCircle2}
            value={ticket.status === 'EXPIRED' ? 'Đã hết hạn check-in' : ticket.check_in_status === 'CHECKED_IN' ? 'Đã check-in' : 'Chưa check-in'}
            iconActive={isVibrant}
          />
        </div>
      </section>

      <section className={`relative min-h-56 overflow-hidden sm:border-l-2 sm:border-dashed ${isVibrant ? 'bg-slate-900/40 sm:border-primary/20' : 'bg-slate-950/60 sm:border-white/5'
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
            : 'border border-white/5 bg-white/5 text-slate-400 shadow-none'
          }`}>
          <Clock3 className="size-4 shrink-0" />
          <span className="truncate">{'Mua lúc '}{formatDateTime(ticket.order?.created_at)}</span>
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
