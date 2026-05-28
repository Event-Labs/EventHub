import { Calendar, Heart, MapPin } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils.js'

const badgeClasses = {
  primary: 'border-primary/40 bg-primary/15 text-primary',
  secondary: 'border-secondary/40 bg-secondary/15 text-secondary',
  tertiary: 'border-tertiary/40 bg-tertiary/15 text-tertiary',
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatPrice(event) {
  if (event.priceLabel) return event.priceLabel
  const min = event.min_price ?? event.price_range?.min
  const max = event.max_price ?? event.price_range?.max

  if (min === null || min === undefined) return 'Liên hệ'
  if (Number(min) === 0 && Number(max || 0) === 0) return 'Miễn phí'
  if (max && Number(max) !== Number(min)) {
    return `${Number(min).toLocaleString('vi-VN')} - ${Number(max).toLocaleString('vi-VN')} đ`
  }
  return `${Number(min).toLocaleString('vi-VN')} đ`
}

function normalizeEvent(event) {
  return {
    id: event.slug || event.id,
    title: event.title,
    subtitle: event.subtitle || event.short_description,
    image: event.thumbnail_url || event.banner_url || event.image,
    category: event.category?.name || event.category || 'Sự kiện',
    badgeColor: event.badgeColor || 'primary',
    date: event.date || formatDateTime(event.start_time),
    time: event.time || '',
    location: event.location || event.venue?.summary || event.venue || 'Địa điểm cập nhật sau',
    priceLabel: formatPrice(event),
    isFavorited: Boolean(event.is_favorited),
  }
}

export function EventCard({
  event,
  compact = false,
  onFavoriteToggle,
  favoriteBusy = false,
}) {
  const item = normalizeEvent(event)
  const navigate = useNavigate()
  const detailPath = `/events/${item.id}`

  const openDetail = (clickEvent) => {
    if (clickEvent?.target?.closest?.('[data-card-action]')) return
    navigate(detailPath)
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault()
          openDetail()
        }
      }}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-border-soft bg-panel shadow-lg transition hover:-translate-y-1 hover:border-primary/60"
    >
      <div
        className={cn(
          'relative overflow-hidden',
          compact ? 'h-48' : 'aspect-[3/4]',
        )}
      >
        <img
          src={item.image}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="event-card-gradient absolute inset-0" />
        {onFavoriteToggle && (
          <button
            type="button"
            data-card-action
            disabled={favoriteBusy}
            onClick={(clickEvent) => {
              clickEvent.preventDefault()
              clickEvent.stopPropagation()
              onFavoriteToggle(event)
            }}
            className={cn(
              'absolute right-4 top-4 z-20 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-primary hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-70',
              item.isFavorited && 'bg-primary text-slate-950',
            )}
            aria-label={item.isFavorited ? 'Bỏ yêu thích' : 'Yêu thích'}
          >
            <Heart
              className={cn('size-5', item.isFavorited && 'fill-current')}
            />
          </button>
        )}
        <span
          className={cn(
            'absolute left-4 top-4 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide',
            badgeClasses[item.badgeColor],
          )}
        >
          {item.category}
        </span>
      </div>
      <div className={cn('flex flex-1 flex-col space-y-4 p-5', !compact && '-mt-28 relative z-10')}>
        <div className="min-h-[92px]">
          <h3 className="line-clamp-3 font-display text-xl font-bold leading-snug text-white">
            {item.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {item.subtitle}
          </p>
        </div>
        <div className="min-h-[84px] space-y-2 text-sm leading-6 text-muted">
          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
            <Calendar className="mt-1 size-4 shrink-0 text-primary" />
            <span>
              {item.date}
              {item.time ? ` - ${item.time}` : ''}
            </span>
          </div>
          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
            <MapPin className="mt-1 size-4 shrink-0 text-primary" />
            <span className="line-clamp-3">{item.location}</span>
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-4 pt-2">
          <div>
            <p className="text-xs text-neutral">Giá từ</p>
            <p className="font-display text-lg font-bold text-primary">
              {item.priceLabel}
            </p>
          </div>
          {!compact && (
            <Link
              to={detailPath}
              data-card-action
              onClick={(clickEvent) => clickEvent.stopPropagation()}
              className="shrink-0 rounded-md bg-tertiary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-tertiary/20 transition hover:bg-orange-600"
            >
              Xem chi tiết
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
