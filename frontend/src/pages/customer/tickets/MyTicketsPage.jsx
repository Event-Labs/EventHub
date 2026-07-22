import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock3, MapPin, Ticket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchMyTickets } from '@/services/tickets.js'

const FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'VALID', label: 'Hợp lệ' },
  { value: 'USED', label: 'Đã dùng' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusMeta(ticket) {
  if (ticket.status === 'USED') {
    return { label: 'Đã dùng', className: 'bg-slate-500/15 text-slate-200' }
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
  const [status, setStatus] = useState('ALL')
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

  const tickets = ticketsQuery.data || []

  if (!isAuthenticated) return null

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <SectionHeader
          title="Vé của tôi"
          description="Quản lý vé đã mua, trạng thái sử dụng và thông tin check-in"
        />
        <div className="grid w-full grid-cols-5 rounded-full border border-white/10 bg-[#151d34] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:w-[560px]">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatus(item.value)}
              className={`min-w-0 rounded-full px-3 py-3 text-sm font-extrabold tracking-wide transition ${
                status === item.value
                  ? 'bg-[#101848] text-slate-100 shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
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
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
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
