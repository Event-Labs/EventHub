import { Calendar, MapPin, QrCode } from 'lucide-react'
import { Link } from 'react-router-dom'
import { events, qrImage, tickets } from '@/data/events.js'

export function MyTicketsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-5xl font-extrabold text-primary">
            Vé của tôi
          </h1>
          <p className="mt-2 text-muted">
            Manage your event access and digital passes.
          </p>
        </div>
        <div className="flex rounded-lg bg-panel p-1">
          {['Sắp diễn ra', 'Đã dùng', 'Đã hoàn'].map((tab, index) => (
            <button
              key={tab}
              className={`rounded-md px-4 py-2 text-sm font-bold ${index === 0 ? 'bg-primary text-slate-950' : 'text-muted'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-5">
          {tickets.map((ticket) => {
            const event =
              events.find((item) => item.id === ticket.eventId) ?? events[0]
            return (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="glass-panel flex flex-col overflow-hidden rounded-lg transition hover:-translate-y-1 hover:border-primary/60 md:flex-row"
              >
                <img
                  src={event.image}
                  alt=""
                  className="h-48 object-cover md:h-auto md:w-52"
                />
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                      {event.category}
                    </span>
                    <h2 className="mt-3 font-display text-2xl font-bold text-white">
                      {event.title}
                    </h2>
                    <p className="mt-1 text-muted">{event.venue}</p>
                  </div>
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-white p-1">
                        <img src={qrImage} alt="" className="size-10" />
                      </div>
                      <div className="text-sm">
                        <p className="text-muted">Mã vé</p>
                        <p className="font-bold text-white">#{ticket.id}</p>
                      </div>
                    </div>
                    <span className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-slate-950">
                      Xem chi tiết
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>

        <aside className="glass-panel flex min-h-[420px] flex-col items-center justify-center rounded-lg border-dashed p-8 text-center">
          <QrCode className="size-20 text-primary/40" />
          <h2 className="mt-5 font-display text-2xl font-bold text-white">
            Chọn một vé
          </h2>
          <p className="mt-2 max-w-sm text-muted">
            Click any ticket to view scannable QR code, event information,
            refund and transfer actions.
          </p>
        </aside>
      </div>
    </div>
  )
}

export function TicketMeta({ event }) {
  return (
    <div className="space-y-3 text-sm text-muted">
      <div className="flex items-center gap-2">
        <Calendar className="size-4 text-primary" />
        {event.date} - {event.time}
      </div>
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-primary" />
        {event.venue}
      </div>
    </div>
  )
}
