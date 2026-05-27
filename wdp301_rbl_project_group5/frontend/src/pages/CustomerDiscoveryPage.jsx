import { Heart, Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { events } from '@/data/events.js'

export function CustomerDiscoveryPage() {
  const pick = events[0]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-lg border border-border-soft">
        <img
          src={pick.image}
          alt={pick.title}
          className="h-[440px] w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
        <div className="absolute bottom-0 max-w-2xl p-6 md:p-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-sm font-bold text-slate-950">
            <Sparkles className="size-4" />
            Personalized Pick
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold text-white md:text-5xl">
            Techno Horizon 2024
          </h1>
          <p className="mt-4 text-muted">
            Gợi ý dựa trên sở thích live concerts, art exhibits và tech summits.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/booking"
              className="rounded-md bg-tertiary px-5 py-3 font-bold text-white"
            >
              Đặt vé
            </Link>
            <button className="rounded-md border border-border-soft bg-panel/70 px-5 py-3 font-bold text-content">
              Thêm yêu thích
            </button>
          </div>
        </div>
      </section>

      <section className="py-12">
        <SectionHeader
          title="Đã xem gần đây"
          description="Các sự kiện khách hàng đã quan tâm."
        />
        <div className="grid gap-6 md:grid-cols-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} compact />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Sự kiện yêu thích"
          description="Danh sách sự kiện đã lưu để mua vé sau."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {events.slice(1).map((event) => (
            <article
              key={event.id}
              className="glass-panel flex gap-4 rounded-lg p-4"
            >
              <img
                src={event.image}
                alt=""
                className="size-28 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display font-bold text-white">
                    {event.title}
                  </h3>
                  <Heart className="size-5 fill-primary text-primary" />
                </div>
                <p className="mt-1 text-sm text-primary">
                  {event.date} - {event.time}
                </p>
                <p className="text-sm text-muted">{event.location}</p>
                <button className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-tertiary">
                  <Trash2 className="size-4" />
                  Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
