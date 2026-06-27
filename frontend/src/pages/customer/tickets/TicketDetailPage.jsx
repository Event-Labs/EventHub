import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ReceiptText,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
  if (ticket?.status === 'USED') return '\u0110\u00e3 d\u00f9ng'
  if (ticket?.status === 'CANCELLED') return '\u0110\u00e3 h\u1ee7y'
  if (ticket?.checked_in_at) return '\u0110\u00e3 check-in'
  return 'H\u1ee3p l\u1ec7'
}


function countdownParts(target, now) {
  if (!target) return null
  const diff = Math.max(0, new Date(target).getTime() - now)
  const totalMinutes = Math.floor(diff / 60000)
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    ended: diff === 0,
  }
}

function qrPayload(ticket) {
  return JSON.stringify({
    type: 'EVENTHUB_TICKET',
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    qr_code: ticket.qr_code || ticket.ticket_code,
    event_id: ticket.event?.id,
    session_id: ticket.session?.id,
  })
}

function qrImageSrc(ticket) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=14&data=${encodeURIComponent(qrPayload(ticket))}`
}

export function TicketDetailPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = hasAuthSession()

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
    link.download = `${ticketQuery.data?.ticket_code || 'ticket'}.svg`
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
  const venue = venueLine(ticket)
  const seat = ticket.seat?.label || 'Free seating'
  const venueText = [ticket.venue?.name, venue].filter(Boolean).join(', ')
  const isEntryEligible = ticket.status === 'VALID'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" />
        {'V\u00e9 c\u1ee7a t\u00f4i'}
      </Link>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,620px)_320px] lg:items-start">
        <aside className="order-2 space-y-5 lg:order-2 lg:sticky lg:top-24">
          <Panel title={'Thanh to\u00e1n'} icon={ReceiptText}>
            <Info label={'M\u00e3 giao d\u1ecbch'} value={ticket.payment?.transaction_code || 'N/A'} />
            <Info label={'Ph\u01b0\u01a1ng th\u1ee9c'} value={ticket.payment?.provider || ticket.payment?.method || 'N/A'} />
            <Info label={'T\u1ed5ng thanh to\u00e1n'} value={formatCurrency(ticket.order.total_amount)} />
            <Info label={'Thanh to\u00e1n l\u00fac'} value={formatDateTime(ticket.payment?.paid_at)} />
          </Panel>
          <Panel title={'Th\u00f4ng tin check-in'} icon={CheckCircle2}>
            <Info label={'Tr\u1ea1ng th\u00e1i'} value={statusText(ticket)} />
            {ticket.checked_in_at ? (
              <Info label={'Check-in l\u00fac'} value={formatDateTime(ticket.checked_in_at)} />
            ) : (
              <CheckInCountdown target={ticket.session.checkin_start_time} />
            )}
            <Info label={'M\u1edf check-in'} value={formatDateTime(ticket.session.checkin_start_time)} />
          </Panel>
        </aside>

        <div className="order-1 lg:justify-self-start">
          <section className="mx-auto max-w-[620px] overflow-hidden rounded-xl border border-white/10 bg-[#101a33] shadow-2xl shadow-slate-950/30 lg:mx-0">
            <div className="relative min-h-56 overflow-hidden">
              {ticket.event.banner_url ? (
                <img src={ticket.event.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" />
              ) : (
                <div className="absolute inset-0 bg-panel-soft" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#101a33] via-[#101a33]/60 to-transparent" />
              <div className="relative flex min-h-56 flex-col justify-end p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase ${isEntryEligible ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                    {statusText(ticket)}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase text-slate-200">
                    {ticket.ticket_type.name}
                  </span>
                </div>
                <h1 className="mt-3 font-display text-2xl font-black leading-tight text-white sm:text-3xl">
                  {ticket.event.title}
                </h1>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <CompactDetail label={'Ng\u01b0\u1eddi tham d\u1ef1'} value={ticket.attendee_name} />
                <CompactDetail label="Email" value={ticket.attendee_email} />
                <CompactDetail label={'Th\u1eddi gian'} value={formatDateTime(ticket.session.start_time)} />
                <CompactDetail label={'\u0110\u01a1n h\u00e0ng'} value={ticket.order.order_code} />
                <CompactDetail label={'Lo\u1ea1i v\u00e9 / Gh\u1ebf'} value={`${ticket.ticket_type.name} - ${seat}`} />
                <CompactDetail label="Check-in" value={ticket.checked_in_at ? formatDateTime(ticket.checked_in_at) : 'Ch\u01b0a check-in'} />
                <CompactDetail label={'\u0110\u1ecba \u0111i\u1ec3m'} value={venueText || 'N/A'} wide />
              </div>

              <div className="relative border-t border-dashed border-white/10 pt-6 before:absolute before:-left-8 before:top-0 before:size-6 before:-translate-y-1/2 before:rounded-full before:bg-[#071022] after:absolute after:-right-8 after:top-0 after:size-6 after:-translate-y-1/2 after:rounded-full after:bg-[#071022]">
                <div className="mx-auto w-fit rounded-xl bg-white p-3 shadow-[0_0_38px_rgba(147,197,253,0.35)]">
                  <img src={qrImageSrc(ticket)} alt="QR check-in" className="size-48 rounded-md" />
                </div>
                <p className="mt-4 text-center font-mono text-sm font-black tracking-wide text-white">{ticket.ticket_code}</p>
              </div>
            </div>
          </section>

          <div className="mx-auto mt-5 max-w-[620px] lg:mx-0">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-[#111a31] px-5 py-4 text-sm font-extrabold text-white transition hover:bg-[#17213b]"
            >
              <Download className="size-4" />
              {'T\u1ea3i v\u00e9'}
            </button>
            {!isEntryEligible && (
              <p className="mt-3 text-sm text-warning">
                {'V\u00e9 kh\u00f4ng c\u00f2n h\u1ee3p l\u1ec7 \u0111\u1ec3 v\u00e0o c\u1ed5ng. File t\u1ea3i xu\u1ed1ng s\u1ebd c\u00f3 watermark tr\u1ea1ng th\u00e1i.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CompactDetail({ label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold leading-relaxed text-white">{value || 'N/A'}</p>
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


function CheckInCountdown({ target }) {
  const [now, setNow] = useState(() => Date.now())
  const parts = countdownParts(target, now)

  useEffect(() => {
    if (!target || parts?.ended) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [parts?.ended, target])

  if (!target) return <Info label={'Check-in l\u00fac'} value="N/A" />
  if (parts?.ended) return <Info label={'Check-in l\u00fac'} value={'\u0110\u00e3 m\u1edf'} />

  return (
    <div className="rounded-lg border border-white/10 bg-[#121b3a] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-300">Check-in starts in</p>
        <Clock3 className="size-6 text-slate-500" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-white">
        <CountdownUnit label="Days" value={parts.days} />
        <CountdownUnit label="Hours" value={parts.hours} />
        <CountdownUnit label="Min" value={parts.minutes} />
      </div>
    </div>
  )
}

function CountdownUnit({ label, value }) {
  return (
    <div>
      <p className="font-mono text-2xl font-black leading-none">{String(value).padStart(2, '0')}</p>
      <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p>
    </div>
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
