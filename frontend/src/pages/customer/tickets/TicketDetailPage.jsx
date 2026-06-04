import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  Mail,
  MapPin,
  ReceiptText,
  Ticket,
  User,
} from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { downloadTicket, fetchTicketDetail } from '@/services/tickets.js'

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value) {
  if (value === undefined || value === null) return 'N/A'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

function venueLine(ticket) {
  return [
    ticket?.venue?.address_line,
    ticket?.venue?.ward,
    ticket?.venue?.district,
    ticket?.venue?.city,
  ].filter(Boolean).join(', ')
}

function statusText(ticket) {
  if (ticket?.status === 'USED') return 'Đã dùng'
  if (ticket?.status === 'CANCELLED') return 'Đã hủy'
  if (ticket?.checked_in_at) return 'Đã check-in'
  return 'Hợp lệ'
}

function buildQrCells(code) {
  const safeCode = code || 'EVENTHUB'
  return Array.from({ length: 21 * 21 }, (_, index) => {
    const row = Math.floor(index / 21)
    const col = index % 21
    const marker = (row < 7 && col < 7) || (row < 7 && col > 13) || (row > 13 && col < 7)
    const hash = safeCode.charCodeAt(index % safeCode.length) + row * 17 + col * 31
    return marker || hash % 3 === 0
  })
}

export function TicketDetailPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = Boolean(localStorage.getItem('eventhub-token'))

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const ticketQuery = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn: () => fetchTicketDetail(ticketId),
    enabled: isAuthenticated && Boolean(ticketId),
  })

  async function handleDownload() {
    const blob = await downloadTicket(ticketId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${ticketQuery.data?.ticket_code || 'ticket'}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) return null

  if (ticketQuery.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-muted">Đang tải vé...</div>
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="size-4" />
          Vé của tôi
        </Link>
        <p className="mt-8 text-error">Không thể tải thông tin vé hoặc vé không thuộc tài khoản của bạn.</p>
      </div>
    )
  }

  const ticket = ticketQuery.data
  const cells = buildQrCells(ticket.ticket_code)
  const venue = venueLine(ticket)
  const seat = ticket.seat?.label || 'Free seating'
  const isEntryEligible = ticket.status === 'VALID'

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
        <ArrowLeft className="size-4" />
        Vé của tôi
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-lg border border-border-soft bg-panel">
          <div className="relative min-h-72 overflow-hidden">
            {ticket.event.banner_url ? (
              <img src={ticket.event.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            ) : (
              <div className="absolute inset-0 bg-panel-soft" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/50 to-transparent" />
            <div className="relative flex min-h-72 flex-col justify-end p-6 md:p-8">
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-extrabold uppercase ${isEntryEligible ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                {statusText(ticket)}
              </span>
              <h1 className="mt-4 max-w-3xl font-display text-3xl font-black leading-tight text-white md:text-4xl">
                {ticket.event.title}
              </h1>
              <p className="mt-2 text-muted">{ticket.ticket_type.name}</p>
            </div>
          </div>

          <div className="grid gap-8 p-6 md:grid-cols-[260px_minmax(0,1fr)] md:p-8">
            <div className="rounded-lg bg-white p-5 shadow-2xl shadow-primary/10">
              <div className="grid gap-0 overflow-hidden" style={{ gridTemplateColumns: 'repeat(21, minmax(0, 1fr))' }}>
                {cells.map((filled, index) => (
                  <span
                    key={index}
                    className={`aspect-square ${filled ? 'bg-slate-950' : 'bg-white'}`}
                  />
                ))}
              </div>
              <p className="mt-4 text-center font-mono text-sm font-black text-slate-950">{ticket.ticket_code}</p>
            </div>

            <div className="grid content-start gap-5 sm:grid-cols-2">
              <Detail icon={User} label="Người tham dự" value={ticket.attendee_name} />
              <Detail icon={Mail} label="Email" value={ticket.attendee_email} />
              <Detail icon={CalendarDays} label="Session" value={formatDateTime(ticket.session.start_time)} />
              <Detail icon={Ticket} label="Loại vé / Ghế" value={`${ticket.ticket_type.name} - ${seat}`} />
              <Detail icon={MapPin} label="Địa điểm" value={ticket.venue.name} wide />
              {venue && <Detail icon={MapPin} label="Địa chỉ" value={venue} wide />}
              <Detail icon={CheckCircle2} label="Check-in" value={ticket.checked_in_at ? formatDateTime(ticket.checked_in_at) : 'Chưa check-in'} />
              <Detail icon={ReceiptText} label="Đơn hàng" value={ticket.order.order_code} />
            </div>
          </div>

          <div className="border-t border-dashed border-border-soft bg-surface/60 p-6">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-4 font-extrabold text-slate-950 transition hover:bg-sky-300 sm:w-auto"
            >
              <Download className="size-5" />
              Tải vé
            </button>
            {!isEntryEligible && (
              <p className="mt-3 text-sm text-warning">
                Vé không còn hợp lệ để vào cổng. File tải xuống sẽ có watermark trạng thái.
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <Panel title="Thanh toán" icon={ReceiptText}>
            <Info label="Mã giao dịch" value={ticket.payment?.transaction_code || 'N/A'} />
            <Info label="Phương thức" value={ticket.payment?.provider || ticket.payment?.method || 'N/A'} />
            <Info label="Tổng thanh toán" value={formatCurrency(ticket.order.total_amount)} />
            <Info label="Thanh toán lúc" value={formatDateTime(ticket.payment?.paid_at)} />
          </Panel>
          <Panel title="Thông tin check-in" icon={CheckCircle2}>
            <Info label="Trạng thái" value={statusText(ticket)} />
            <Info label="Check-in lúc" value={ticket.checked_in_at ? formatDateTime(ticket.checked_in_at) : 'Chưa check-in'} />
            <Info label="Mở check-in" value={formatDateTime(ticket.session.checkin_start_time)} />
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Detail({ icon: Icon, label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <Icon className="size-4 text-primary" />
        {label}
      </p>
      <p className="mt-1 break-words font-display text-xl font-bold text-white">{value || 'N/A'}</p>
    </div>
  )
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-border-soft bg-panel p-5">
      <div className="mb-4 flex items-center gap-2 text-primary">
        <Icon className="size-5" />
        <h2 className="font-bold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 break-words font-semibold text-white">{value}</p>
    </div>
  )
}
