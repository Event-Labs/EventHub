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
  const isAuthenticated = Boolean(localStorage.getItem('eventhub-token'))

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const ticketsQuery = useQuery({
    queryKey: ['my-tickets', status],
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
        <div className="inline-flex w-full rounded-lg border border-border-soft bg-panel p-1 md:w-auto">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatus(item.value)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-bold transition md:flex-none ${
                status === item.value
                  ? 'bg-primary text-slate-950'
                  : 'text-muted hover:bg-panel-soft hover:text-white'
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

      <div className="mt-8 space-y-6">
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
  const seat = ticket.seat?.label || 'Free seating'

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="ticket-card group grid overflow-hidden rounded-lg border border-border-soft bg-panel transition hover:border-primary/70 md:grid-cols-[minmax(0,1fr)_38%]"
    >
      <section className="ticket-card-main flex min-h-72 flex-col justify-between p-6 md:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${meta.className}`}>
              {meta.label}
            </span>
            <span className="font-mono text-xs font-bold text-subtle">{ticket.ticket_code}</span>
          </div>
          <h2 className="mt-4 max-w-2xl font-display text-2xl font-black leading-tight text-white md:text-3xl">
            {ticket.event.title}
          </h2>
        </div>

        <div className="mt-8 grid gap-4 text-sm text-muted sm:grid-cols-2">
          <InfoLine icon={CalendarDays} value={formatDateTime(ticket.session?.start_time)} />
          <InfoLine icon={Ticket} value={`${ticket.ticket_type.name} - ${seat}`} />
          <InfoLine icon={MapPin} value={ticket.venue?.name || 'N/A'} />
          <InfoLine icon={CheckCircle2} value={ticket.check_in_status === 'CHECKED_IN' ? 'Đã check-in' : 'Chưa check-in'} />
        </div>

        {venue && <p className="mt-4 text-sm text-subtle">{venue}</p>}
      </section>

      <section className="relative min-h-64 overflow-hidden bg-slate-950 md:min-h-full">
        {ticket.event.thumbnail_url ? (
          <img
            src={ticket.event.thumbnail_url}
            alt=""
            className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full min-h-64 place-items-center bg-panel-soft">
            <Ticket className="size-14 text-primary" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/20" />
        <div className="absolute bottom-5 left-5 right-5 flex items-center gap-2 rounded-md bg-slate-950/70 px-3 py-2 text-sm font-bold text-white backdrop-blur">
          <Clock3 className="size-4 text-primary" />
          Mua lúc {formatDateTime(ticket.order?.created_at)}
        </div>
      </section>
    </Link>
  )
}

function InfoLine({ icon: Icon, value }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="truncate">{value}</span>
    </span>
  )
}
