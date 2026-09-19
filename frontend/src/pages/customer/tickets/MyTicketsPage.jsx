import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, CheckCircle, ChevronLeft, ChevronRight, Clock3, MapPin, Ticket, RotateCcw, Hourglass, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchMyTickets } from '@/services/tickets.js'
import { fetchMyRefundRequests } from '@/services/refunds.js'

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

function formatCurrency(value) {
  if (value === undefined || value === null) return '0 đ'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

function statusMeta(ticket) {
  if (ticket.status === 'USED') {
    return { label: 'Đã dùng', className: 'bg-slate-500/15 text-slate-200' }
  }
  if (ticket.status === 'EXPIRED') {
    return { label: 'Hết hạn', className: 'bg-rose-500/15 text-rose-300' }
  }
  if (ticket.status === 'CANCELLED') {
    return { label: 'Đã hủy', className: 'bg-slate-500/15 text-slate-300' }
  }
  if (ticket.status === 'REFUNDED') {
    return { label: 'Đã hoàn', className: 'bg-emerald-500/15 text-emerald-300' }
  }
  if (ticket.status === 'REFUND_PENDING') {
    return { label: 'Chờ hoàn tiền', className: 'bg-amber-500/15 text-amber-300' }
  }
  return { label: 'Hợp lệ', className: 'bg-emerald-500/15 text-emerald-300' }
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

  const refundsQuery = useQuery({
    queryKey: ['my-refunds', currentUserKey],
    queryFn: () => fetchMyRefundRequests(),
    enabled: isAuthenticated,
  })

  const tickets = useMemo(() => [...(ticketsQuery.data || [])].sort((a, b) => {
    const difference = new Date(b.order?.created_at || b.created_at || 0) - new Date(a.order?.created_at || a.created_at || 0)
    return difference || String(b.id).localeCompare(String(a.id))
  }), [ticketsQuery.data])
  const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE))
  const paginatedTickets = tickets.slice((page - 1) * TICKETS_PER_PAGE, page * TICKETS_PER_PAGE)

  if (!isAuthenticated) return null

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <SectionHeader
          title="Thông tin Vé"
          description="Quản lý vé đã mua, thông tin check-in và các yêu cầu hoàn tiền"
        />

      </div>

      <div className="mt-6 flex overflow-x-auto rounded-full glass-panel p-1.5 border-white/5 shadow-inner md:w-fit scrollbar-hide">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setStatus(item.value)
              setPage(1)
            }}
            className={`min-w-0 rounded-full px-4 py-2 text-[11px] font-bold tracking-wider uppercase transition-all ${status === item.value
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
          >
            {item.label}
          </button>
        ))}
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
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Phân trang vé của tôi">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="grid size-10 place-items-center rounded-full border border-white/10 bg-[#151d34] text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang trước">
            <ChevronLeft className="size-5" />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`size-10 rounded-full text-sm font-bold transition ${page === pageNumber ? 'bg-primary text-slate-950' : 'border border-white/10 bg-[#151d34] text-white hover:border-primary hover:text-primary'}`} aria-current={page === pageNumber ? 'page' : undefined} aria-label={`Trang ${pageNumber}`}>
              {pageNumber}
            </button>
          ))}
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} className="grid size-10 place-items-center rounded-full border border-white/10 bg-[#151d34] text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang sau">
            <ChevronRight className="size-5" />
          </button>
        </nav>
      )}

      {/* Refunds Section */}
      <div className="mt-16 mb-6">
        <h3 className="font-display text-2xl font-black text-white">Yêu cầu hoàn tiền</h3>
      </div>
      <CustomerRefundsSection query={refundsQuery} />
    </div>
  )
}

function CustomerRefundsSection({ query }) {
  if (query.isLoading) {
    return <p className="mt-8 text-sm text-muted">Đang tải lịch sử yêu cầu hoàn vé...</p>
  }

  if (query.isError) {
    return <p className="mt-8 text-sm text-error">Không thể tải yêu cầu hoàn vé.</p>
  }

  const list = query.data || []

  if (list.length === 0) {
    return (
      <div className="mt-8 glass-panel rounded-[24px] border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] p-12 text-center">
        <RotateCcw className="mx-auto size-14 text-primary opacity-50 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
        <p className="mt-4 font-display text-xl font-bold text-white drop-shadow-md">Chưa có yêu cầu hoàn tiền nào</p>
        <p className="mt-2 text-sm text-slate-400">Khi bạn gửi yêu cầu hoàn tiền cho vé hoặc đơn hàng, tiến trình xử lý sẽ hiển thị tại đây.</p>
      </div>
    )
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400"><Hourglass className="size-3.5" /> Đang chờ duyệt</span>
      case 'APPROVED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-400"><CheckCircle className="size-3.5" /> Đã duyệt (Chờ hoàn tiền)</span>
      case 'REJECTED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-400"><XCircle className="size-3.5" /> Từ chối</span>
      case 'REFUNDED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400"><CheckCircle className="size-3.5" /> Đã hoàn tiền</span>
      default:
        return <span className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-bold text-slate-300">{status}</span>
    }
  }

  return (
    <div className="mt-8 space-y-5">
      {list.map((item) => (
        <div key={item.id} className="glass-panel relative overflow-hidden rounded-[24px] border-primary/20 p-6 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] transition-all hover:border-primary/40 hover:shadow-[0_8px_32px_0_rgba(6,182,212,0.2)]">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--color-primary)_0%,_transparent_50%)] opacity-10" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <span className="font-mono text-sm font-black text-primary drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">REQ #{item.id.slice(0, 8)}</span>
              <span className="ml-3 text-xs text-slate-400">· Ngày tạo: {formatDateTime(item.created_at)}</span>
            </div>
            {getStatusBadge(item.status)}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">Sự kiện</p>
              <p className="mt-0.5 font-bold text-white line-clamp-1">{item.event?.title || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Vé / Đơn hàng</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-200">
                {item.ticket?.ticket_code || item.order?.order_code || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Số tiền hoàn</p>
              <p className="mt-0.5 text-base font-black text-amber-400">{formatCurrency(item.refund_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Lý do</p>
              <p className="mt-0.5 text-sm text-slate-200 line-clamp-2">{item.reason}</p>
            </div>
          </div>

          {item.reject_reason && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
              <span className="font-bold">Lý do từ chối từ BTC: </span> {item.reject_reason}
            </div>
          )}

          {item.organizer_note && (
            <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200">
              <span className="font-bold">Ghi chú từ BTC: </span> {item.organizer_note}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TicketCard({ ticket }) {
  const meta = statusMeta(ticket)
  const venue = venueLine(ticket)
  const venueText = [ticket.venue?.name, venue].filter(Boolean).join(', ') || 'N/A'
  const seat = ticket.seat?.label

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="glass-panel group relative grid min-h-full overflow-hidden rounded-[24px] border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] transition-all duration-300 hover:border-primary/50 hover:shadow-[0_8px_32px_0_rgba(6,182,212,0.3)] hover:-translate-y-1 sm:grid-cols-[minmax(0,1fr)_36%]"
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_100%,_var(--color-primary)_0%,_transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
      <section className="ticket-card-main flex min-h-56 flex-col justify-between p-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[10px] font-black tracking-widest uppercase ${meta.className}`}>
              {meta.label}
            </span>
            <span className="font-mono text-[11px] font-bold text-slate-400">{ticket.ticket_code}</span>
          </div>
          <h2 className="mt-4 line-clamp-2 font-display text-xl font-black leading-tight text-white group-hover:text-primary transition-colors">
            {ticket.event.title}
          </h2>
        </div>

        <div className="mt-6 grid gap-3 text-sm text-slate-300">
          <InfoLine icon={CalendarDays} value={formatDateTime(ticket.session?.start_time)} />
          <InfoLine icon={Ticket} value={seat ? `${ticket.ticket_type.name} · Ghế ${seat}` : `${ticket.ticket_type.name} · Khu vực đứng`} />
          <InfoLine icon={MapPin} value={venueText} wrap />
          <InfoLine icon={CheckCircle2} value={ticket.status === 'EXPIRED' ? 'Đã hết hạn check-in' : ticket.check_in_status === 'CHECKED_IN' ? '\u0110\u00e3 check-in' : 'Ch\u01b0a check-in'} />
        </div>
      </section>

      <section className="relative min-h-56 overflow-hidden bg-slate-900/50 sm:border-l-2 sm:border-dashed sm:border-white/10">
        {ticket.event.thumbnail_url ? (
          <img
            src={ticket.event.thumbnail_url}
            alt=""
            className="h-full w-full object-cover opacity-60 mix-blend-luminosity transition duration-500 group-hover:scale-110 group-hover:opacity-100 group-hover:mix-blend-normal"
          />
        ) : (
          <div className="grid h-full min-h-56 place-items-center bg-white/5">
            <Ticket className="size-12 text-primary opacity-50 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest text-primary shadow-[0_0_15px_rgba(6,182,212,0.2)] backdrop-blur-md">
          <Clock3 className="size-4 shrink-0" />
          <span className="truncate">{'Mua l\u00fac '}{formatDateTime(ticket.order?.created_at)}</span>
        </div>
      </section>
    </Link>
  )
}

function InfoLine({ icon: Icon, value, wrap = false }) {
  return (
    <span className={`inline-flex min-w-0 gap-2 ${wrap ? 'items-start' : 'items-center'}`}>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className={wrap ? 'whitespace-normal break-words leading-relaxed' : 'truncate'}>{value}</span>
    </span>
  )
}
