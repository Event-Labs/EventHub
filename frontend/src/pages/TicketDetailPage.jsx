import {
  Download,
  Info,
  MapPin,
  RotateCcw,
  Share2,
  ShieldCheck,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { events, qrImage, tickets } from '@/data/events.js'

export function TicketDetailPage() {
  const { ticketId } = useParams()
  const ticket = tickets.find((item) => item.id === ticketId) ?? tickets[0]
  const event = events.find((item) => item.id === ticket.eventId) ?? events[0]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        to="/my-tickets"
        className="text-sm font-bold text-primary hover:underline"
      >
        Quay lại vé của tôi
      </Link>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="ticket-mesh overflow-hidden rounded-lg border border-border-soft bg-panel">
          <div className="relative h-56">
            <img
              src={event.image}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-bold uppercase text-primary">
                Official Entry Pass
              </span>
              <h1 className="mt-3 font-display text-3xl font-bold text-white">
                {event.title}
              </h1>
              <p className="text-muted">{ticket.type}</p>
            </div>
          </div>
          <div className="flex flex-col items-center p-8">
            <div className="relative overflow-hidden rounded-lg bg-white p-6 shadow-2xl shadow-primary/10">
              <div className="scanner-line" />
              <img src={qrImage} alt="Entry QR Code" className="size-56" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-widest text-muted">
              Mã định danh vé
            </p>
            <h2 className="font-display text-2xl font-bold text-primary">
              {ticket.id}
            </h2>
            <div className="mt-8 grid w-full gap-6 border-t border-border-soft pt-8 md:grid-cols-2">
              <Detail label="Người tham dự" value={ticket.attendee} />
              <Detail
                label="Date & Time"
                value={`${event.date} - ${event.time}`}
              />
              <Detail
                label="Địa điểm"
                value={`${event.venue} - ${ticket.gate}`}
                wide
              />
            </div>
          </div>
          <div className="grid gap-3 border-t border-dashed border-border-soft bg-surface/50 p-6 sm:grid-cols-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-secondary px-5 py-4 font-bold text-white">
              <Download className="size-5" />
              Tải PDF
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border-soft px-5 py-4 font-bold text-content">
              <Share2 className="size-5" />
              Chuyển vé
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <Panel title="Thông tin sự kiện" icon={MapPin}>
            <p className="font-semibold text-white">{event.venue}</p>
            <p className="mt-1 text-sm text-muted">
              123 Industrial Way, San Francisco, CA
            </p>
            <a href="#" className="mt-2 block text-sm font-bold text-primary">
              Xem bản đồ
            </a>
          </Panel>
          <Panel title="Giao dịch đã xác thực" icon={ShieldCheck}>
            <p className="text-sm text-muted">
              Được bảo vệ bởi EventHub Shield.
            </p>
          </Panel>
          <Panel title="Chính sách hoàn vé" icon={Info}>
            <p className="text-sm text-muted">
              Refunds are available until 7 days before event. A 5% processing
              fee applies.
            </p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-md border border-tertiary/40 px-4 py-2 text-sm font-bold text-tertiary">
              <RotateCcw className="size-4" />
              Yêu cầu hoàn vé
            </button>
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Detail({ label, value, wide }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-white">{value}</p>
    </div>
  )
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <Icon className="size-5" />
        <h2 className="font-bold uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </section>
  )
}
