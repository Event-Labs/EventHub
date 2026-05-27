import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Music,
  Star,
  Theater,
  Trophy,
  Users,
  Waves,
  BriefcaseBusiness,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { events } from '@/data/events.js'

const categories = [
  ['Âm nhạc', Music],
  ['Workshop', Users],
  ['Hội nghị', BriefcaseBusiness],
  ['Sân khấu', Theater],
  ['Thể thao', Trophy],
  ['Lễ hội', Waves],
]

const chips = [
  'Hôm nay',
  'Tuần này',
  'Tháng này',
  'Miễn phí',
  'Online',
  'Gần bạn',
]

const organizers = [
  ['Global Events Co.', '154 sự kiện', '4.9'],
  ['Sonic Productions', '89 sự kiện', '4.8'],
  ['Tech Frontiers', '42 sự kiện', '4.7'],
]

export function HomePage() {
  return (
    <div className="pb-16">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-3xl font-extrabold text-white">
            Sự kiện nổi bật
          </h1>
          <div className="flex gap-2">
            <button className="grid size-10 place-items-center rounded-full border border-border-soft text-subtle">
              <ChevronLeft className="size-5" />
            </button>
            <button className="grid size-10 place-items-center rounded-full border border-border-soft text-subtle">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {events.slice(0, 2).map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="group relative h-[360px] overflow-hidden rounded-lg border border-border-soft shadow-2xl"
            >
              <img
                src={event.image}
                alt={event.title}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-slate-950">
                  {event.category}
                </span>
                <h2 className="mt-4 font-display text-3xl font-extrabold text-white">
                  {event.title}
                </h2>
                <p className="mt-2 text-subtle">
                  {event.date} - {event.location}
                </p>
                <span className="mt-5 inline-flex rounded-md bg-tertiary px-4 py-2 font-bold text-white">
                  Xem chi tiết
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={`h-2 rounded-full ${dot === 0 ? 'w-8 bg-primary' : 'w-2 bg-border-soft'}`}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionHeader
          title="Sự kiện đề xuất"
          description="Các chương trình đang bán vé và được quan tâm nhiều nhất."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {events.map((event) => (
            <div key={event.id} className="relative">
              <button className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
                <Heart className="size-5" />
              </button>
              <EventCard event={event} compact />
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap gap-3">
          {chips.map((chip, index) => (
            <button
              key={chip}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                index === 0
                  ? 'bg-primary text-slate-950'
                  : 'border border-border-soft text-subtle hover:border-primary hover:text-primary'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
        <SectionHeader title="Sắp diễn ra" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.concat(events.slice(0, 2)).map((event, index) => (
            <article
              key={`${event.id}-${index}`}
              className="overflow-hidden rounded-lg border border-border-soft bg-panel shadow-lg"
            >
              <img
                src={event.image}
                alt=""
                className="h-52 w-full object-cover"
              />
              <div className="p-5">
                <p className="text-sm font-bold text-primary">{event.date}</p>
                <h3 className="mt-2 font-display text-xl font-bold text-white">
                  {event.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{event.venue}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-display text-lg font-bold text-white">
                    {event.priceLabel}
                  </span>
                  <Link
                    to="/booking"
                    className="rounded-md bg-tertiary px-4 py-2 font-bold text-white"
                  >
                    Mua vé
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div>
          <SectionHeader title="Danh mục phổ biến" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {categories.map(([name, Icon]) => (
              <Link
                key={name}
                to="/events"
                className="rounded-lg border border-border-soft bg-panel p-5 transition hover:border-primary hover:bg-panel-soft"
              >
                <Icon className="size-8 text-primary" />
                <p className="mt-4 font-display text-lg font-bold text-white">
                  {name}
                </p>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <SectionHeader title="Ban tổ chức nổi bật" />
          <div className="space-y-4">
            {organizers.map(([name, count, rating], index) => (
              <article
                key={name}
                className="glass-panel flex items-center gap-4 rounded-lg p-4"
              >
                <div className="grid size-14 place-items-center rounded-full bg-secondary/20 font-display text-xl font-bold text-secondary">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-white">{name}</h3>
                  <p className="text-sm text-muted">{count}</p>
                </div>
                <div className="flex items-center gap-1 text-warning">
                  <Star className="size-4 fill-warning" />
                  {rating}
                </div>
                <Link
                  to="/events"
                  className="rounded-md border border-border-soft px-3 py-2 text-sm font-bold text-subtle"
                >
                  Xem
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
