import { Calendar, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils.js'

const badgeClasses = {
  primary: 'border-primary/40 bg-primary/15 text-primary',
  secondary: 'border-secondary/40 bg-secondary/15 text-secondary',
  tertiary: 'border-tertiary/40 bg-tertiary/15 text-tertiary',
}

export function EventCard({ event, compact = false }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-border-soft bg-panel shadow-lg transition hover:-translate-y-1 hover:border-primary/60">
      <div
        className={cn(
          'relative overflow-hidden',
          compact ? 'h-48' : 'aspect-[3/4]',
        )}
      >
        <img
          src={event.image}
          alt={event.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="event-card-gradient absolute inset-0" />
        <span
          className={cn(
            'absolute left-4 top-4 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide',
            badgeClasses[event.badgeColor],
          )}
        >
          {event.category}
        </span>
      </div>
      <div className={cn('space-y-4 p-5', !compact && '-mt-28 relative z-10')}>
        <div>
          <h3 className="font-display text-xl font-bold text-white">
            {event.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{event.subtitle}</p>
        </div>
        <div className="space-y-2 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            {event.date} - {event.time}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            {event.location}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-neutral">Giá từ</p>
            <p className="font-display text-lg font-bold text-primary">
              {event.priceLabel}
            </p>
          </div>
          <Link
            to={`/events/${event.id}`}
            className="rounded-md bg-tertiary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-tertiary/20 transition hover:bg-orange-600"
          >
            Xem chi tiết
          </Link>
        </div>
      </div>
    </article>
  )
}
