import { Calendar, Heart, MapPin } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { getCategoryName } from '@/i18n/categoryNames.js'
import { translatePhrase } from '@/i18n/phraseDictionary.js'
import { cleanAndFormatVenue } from '@/i18n/eventTranslations.js'

const getAutoIsEnglish = () => (typeof document !== 'undefined' && document.documentElement.lang === 'en') || (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en')

function formatDateRange(start, end, isEnglish = getAutoIsEnglish()) {
  if (!start) return isEnglish ? 'TBD' : 'Chưa cập nhật'

  const formatter = new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const startStr = formatter.format(new Date(start))

  if (!end) return startStr
  const endDate = new Date(end)
  const startDate = new Date(start)
  
  if (endDate.getTime() <= startDate.getTime()) return startStr
  
  return `${startStr} - ${formatter.format(endDate)}`
}

function formatPrice(event, isEnglish = getAutoIsEnglish()) {
  if (event.priceLabel) return event.priceLabel
  const min = event.min_price ?? event.price_range?.min
  const max = event.max_price ?? event.price_range?.max

  if (min === null || min === undefined) return isEnglish ? 'Contact' : 'Liên hệ'
  if (Number(min) === 0 && Number(max || 0) === 0) return isEnglish ? 'Free' : 'Miễn phí'
  const locale = isEnglish ? 'en-US' : 'vi-VN'
  const currencySymbol = isEnglish ? 'VND' : 'đ'
  if (max && Number(max) !== Number(min)) {
    return `${Number(min).toLocaleString(locale)} - ${Number(max).toLocaleString(locale)} ${currencySymbol}`
  }
  return `${Number(min).toLocaleString(locale)} ${currencySymbol}`
}

function formatCategory(category, isEnglish = false) {
  return getCategoryName(category, isEnglish)
}

function formatLocation(event, isEnglish = false) {
  const fallback = isEnglish ? 'Venue to be announced' : 'Địa điểm cập nhật sau'
  if (!event) return fallback

  if (event.location && typeof event.location === 'object') {
    return cleanAndFormatVenue(event.location, isEnglish)
  }
  if (event.venue && typeof event.venue === 'object') {
    return cleanAndFormatVenue(event.venue, isEnglish)
  }
  const raw = event.location || event.venue || event.venue_name || event.location_name || fallback
  return isEnglish ? translatePhrase(raw, 'en') : raw
}

function formatVenueText(venue, isEnglish = false) {
  if (!venue) return ''
  return cleanAndFormatVenue(venue, isEnglish)
}

function normalizeEvent(event, isEnglish = false) {
  const rawTitle = event.title || ''
  const rawSubtitle = typeof (event.subtitle || event.short_description) === 'string' ? (event.subtitle || event.short_description) : ''
  const rawLocation = formatLocation(event, isEnglish)
  return {
    id: event.slug || event.id,
    title: isEnglish ? translatePhrase(rawTitle, 'en') : rawTitle,
    subtitle: isEnglish ? translatePhrase(rawSubtitle, 'en') : rawSubtitle,
    image: event.thumbnail_url || event.banner_url || event.image,
    category: formatCategory(event.category, isEnglish),
    badgeColor: event.badgeColor || 'primary',
    date: event.date || formatDateRange(event.start_time, event.end_time, isEnglish),
    time: event.time || '',
    location: isEnglish ? translatePhrase(rawLocation, 'en') : rawLocation,
    priceLabel: formatPrice(event, isEnglish),
    isFavorited: Boolean(event.is_favorited),
  }
}

export function EventCard({
  event,
  compact = false,
  showCategoryBadge = true,
  onFavoriteToggle,
  favoriteBusy = false,
}) {
  const { isEnglish, t } = useLanguage()
  const item = normalizeEvent(event, isEnglish)
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
      className="glass-panel group flex h-full cursor-pointer flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 [transform:translateZ(0)] will-change-transform"
    >
      <div
        className={cn(
          'relative overflow-hidden',
          compact ? 'h-64' : 'h-56 sm:h-60',
        )}
      >
        <img
          src={item.image}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="event-card-gradient absolute inset-0" />
        {showCategoryBadge && (
          <span className="absolute left-4 top-4 z-20 max-w-[calc(100%-5.75rem)] truncate rounded-full border border-[#C99A47]/70 bg-black/60 px-3 py-1 text-xs font-bold uppercase backdrop-blur-md shadow-[0_0_12px_rgba(201,154,71,0.5)]" style={{ color: '#E6C17A' }}>
            {item.category}
          </span>
        )}
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
              'absolute right-4 top-4 z-20 grid size-10 place-items-center rounded-full border border-white/15 bg-black/50 backdrop-blur-md transition-all hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-70',
              item.isFavorited
                ? 'border-red-500/60 bg-red-500/20 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                : 'text-white/70',
            )}
            aria-label={item.isFavorited ? (isEnglish ? 'Remove from favorites' : 'Bỏ yêu thích') : (isEnglish ? 'Favorite' : 'Yêu thích')}
          >
            <Heart
              className={cn(
                'size-5 transition-all',
                item.isFavorited && 'fill-current drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]',
              )}
            />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col space-y-4 p-5 [transform:translateZ(0)]">
        <div className="h-[84px]">
          <h3 className="line-clamp-3 font-display text-xl font-bold leading-snug text-white transition-colors group-hover:text-primary">
            {item.title}
          </h3>
        </div>
        <div className="min-h-[132px] space-y-2 text-sm leading-6 text-subtle">
          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
            <Calendar className="mt-1 size-4 shrink-0 text-primary" />
            <span>
              {item.date}
              {item.time ? ` - ${item.time}` : ''}
            </span>
          </div>
          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
            <MapPin className="mt-1 size-4 shrink-0 text-primary" />
            <span>{item.location}</span>
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-4 pt-2 border-t border-border-soft">
          <div className="pt-2">
            <p className="text-xs text-neutral">{isEnglish ? 'From' : 'Giá từ'}</p>
            <p className="font-display text-lg font-bold text-primary drop-shadow-md">
              {item.priceLabel}
            </p>
          </div>
          {!compact && (
            <Link
              to={detailPath}
              data-card-action
              onClick={(clickEvent) => clickEvent.stopPropagation()}
              className="shrink-0 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-bold transition-all hover:brightness-110 hover:shadow-[0_0_20px_rgba(201,154,71,0.6)] active:scale-95"
              style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
            >
              {isEnglish ? 'View Details' : 'Xem chi tiết'}
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
