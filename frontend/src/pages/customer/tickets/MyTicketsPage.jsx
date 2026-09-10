import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, Ticket, RotateCcw, AlertCircle, Hourglass, CheckCircle, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchMyTickets } from '@/services/tickets.js'
import { fetchMyRefundRequests } from '@/services/refunds.js'

const FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'VALID', label: 'Hợp lệ' },
  { value: 'USED', label: 'Đã dùng' },
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

  if (ticket.status === 'REFUNDED') {
    return { label: 'Đã hoàn tiền', className: 'bg-amber-500/15 text-amber-300' }
  }

  if (ticket.status === 'CANCELLED') {
    return { label: 'Đã hủy', className: 'bg-error/15 text-error' }
  }

  if (ticket.status === 'EXPIRED') {
    return { label: 'Hết hạn', className: 'bg-error/15 text-error' }
  }

  if (ticket.checked_in_at) {
    return { label: 'Đã check-in', className: 'bg-warning/15 text-warning' }
  }

  return { label: 'Hợp lệ', className: 'bg-success/15 text-success' }
}

function venueLine(ticket) {
  return [
    ticket.venue?.address_line,
    ticket.venue?.ward,
    ticket.venue?.district,
    ticket.venue?.city,
  ].filter(Boolean).join(', ')
}

export function MyTicketsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('tickets') // 'tickets' | 'refunds'
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
    enabled: isAuthenticated && activeTab === 'tickets',
  })

  const refundsQuery = useQuery({
    queryKey: ['my-refund-requests', currentUserKey],
    queryFn: () => fetchMyRefundRequests(),
    enabled: isAuthenticated && activeTab === 'refunds',
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
          title="Vé & Hoàn tiền"
          description="Quản lý vé đã mua, thông tin check-in và các yêu cầu hoàn tiền"
        />
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#151d34] p-1.5 shadow-md">
          <button
            type="button"
            onClick={() => { setActiveTab('tickets'); setPage(1); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
              activeTab === 'tickets'
                ? 'bg-primary text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Ticket className="size-4" />
            Vé của tôi
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('refunds'); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
              activeTab === 'refunds'
                ? 'bg-primary text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <RotateCcw className="size-4" />
            Yêu cầu hoàn tiền
          </button>
        </div>
      </div>

      {activeTab === 'tickets' ? (
        <>
          <div className="mt-6 flex overflow-x-auto rounded-full border border-white/10 bg-[#151d34] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:w-fit">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setStatus(item.value)
                  setPage(1)
                }}
                className={`min-w-0 rounded-full px-4 py-2 text-xs font-extrabold tracking-wide transition ${
                  status === item.value
                    ? 'bg-[#101848] text-slate-100 shadow-sm'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
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
        </>
      ) : (
        <CustomerRefundsSection query={refundsQuery} />
      )}
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

  const list = query.data?.data || []

  if (list.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-white/10 bg-[#151d34] p-12 text-center">
        <RotateCcw className="mx-auto size-12 text-slate-500" />
        <p className="mt-4 text-base font-bold text-white">Chưa có yêu cầu hoàn tiền nào</p>
        <p className="mt-1 text-xs text-slate-400">Khi bạn gửi yêu cầu hoàn tiền cho vé hoặc đơn hàng, tiến trình xử lý sẽ hiển thị tại đây.</p>
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
    <div className="mt-6 space-y-4">
      {list.map((item) => (
        <div key={item.id} className="rounded-xl border border-white/10 bg-[#151d34] p-5 transition hover:border-white/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div>
              <span className="font-mono text-xs font-bold text-primary">REQ #{item.id.slice(0, 8)}</span>
              <span className="ml-2 text-xs text-slate-400">· Ngày tạo: {formatDateTime(item.created_at)}</span>
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
      className="ticket-card group grid min-h-full overflow-hidden rounded-lg bg-panel transition sm:grid-cols-[minmax(0,1fr)_36%]"
    >
      <section className="ticket-card-main flex min-h-56 flex-col justify-between p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ${meta.className}`}>
              {meta.label}
            </span>
            <span className="font-mono text-[11px] font-bold text-subtle">{ticket.ticket_code}</span>
          </div>
          <h2 className="mt-3 line-clamp-2 font-display text-xl font-black leading-tight text-white">
            {ticket.event.title}
          </h2>
        </div>

        <div className="mt-5 grid gap-3 text-xs text-muted">
          <InfoLine icon={CalendarDays} value={formatDateTime(ticket.session?.start_time)} />
          <InfoLine icon={Ticket} value={seat ? `${ticket.ticket_type.name} · Ghế ${seat}` : `${ticket.ticket_type.name} · Khu vực đứng`} />
          <InfoLine icon={MapPin} value={venueText} wrap />
          <InfoLine icon={CheckCircle2} value={ticket.status === 'EXPIRED' ? 'Đã hết hạn check-in' : ticket.check_in_status === 'CHECKED_IN' ? '\u0110\u00e3 check-in' : 'Ch\u01b0a check-in'} />
        </div>
      </section>

      <section className="relative min-h-56 overflow-hidden bg-slate-950">
        {ticket.event.thumbnail_url ? (
          <img
            src={ticket.event.thumbnail_url}
            alt=""
            className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full min-h-56 place-items-center bg-panel-soft">
            <Ticket className="size-10 text-primary" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/20" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-md bg-slate-950/70 px-2.5 py-2 text-xs font-bold text-white backdrop-blur">
          <Clock3 className="size-3.5 shrink-0 text-primary" />
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
