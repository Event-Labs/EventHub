import { useQuery } from '@tanstack/react-query'
import { Calendar, MapPin, Ticket } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchMyTickets } from '@/services/orders.js'

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusLabel(status) {
  if (status === 'USED') return 'Đã dùng'
  if (status === 'CANCELLED') return 'Đã hủy'
  return 'Hợp lệ'
}

export function MyTicketsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = Boolean(localStorage.getItem('eventhub-token'))

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const ticketsQuery = useQuery({
    queryKey: ['my-tickets'],
    queryFn: fetchMyTickets,
    enabled: isAuthenticated,
  })

  const tickets = ticketsQuery.data || []

  if (!isAuthenticated) return null

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Vé của tôi"
        description="Danh sách vé đã mua (dữ liệu từ database)"
      />

      {ticketsQuery.isLoading && (
        <p className="text-sm text-muted">Đang tải vé...</p>
      )}

      {ticketsQuery.isError && (
        <p className="text-sm text-error">Không thể tải danh sách vé.</p>
      )}

      {!ticketsQuery.isLoading && !ticketsQuery.isError && tickets.length === 0 && (
        <div className="glass-panel rounded-lg p-8 text-center">
          <Ticket className="mx-auto size-10 text-primary" />
          <p className="mt-4 text-muted">Bạn chưa có vé nào.</p>
          <Link to="/events" className="mt-4 inline-block font-bold text-primary">
            Khám phá sự kiện
          </Link>
        </div>
      )}

      <div className="space-y-5">
        {tickets.map((ticket) => (
          <Link
            key={ticket.id}
            to={`/tickets/${ticket.id}`}
            className="glass-panel flex flex-col overflow-hidden rounded-lg transition hover:border-primary/50 md:flex-row"
          >
            {ticket.event.thumbnail_url ? (
              <img
                src={ticket.event.thumbnail_url}
                alt=""
                className="h-48 object-cover md:h-auto md:w-52"
              />
            ) : (
              <div className="grid h-48 place-items-center bg-panel-soft md:h-auto md:w-52">
                <Ticket className="size-10 text-primary" />
              </div>
            )}
            <div className="flex flex-1 flex-col justify-between p-5">
              <div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {ticket.ticket_type.name}
                </span>
                <h2 className="mt-3 font-display text-2xl font-bold text-white">
                  {ticket.event.title}
                </h2>
                <p className="mt-1 font-mono text-sm text-subtle">{ticket.ticket_code}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                <span className="inline-flex items-center gap-2">
                  <Calendar className="size-4 text-primary" />
                  {formatDateTime(ticket.event.start_time)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  {statusLabel(ticket.status)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
