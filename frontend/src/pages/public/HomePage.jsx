import { getAuthToken } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  MapPin,
  Martini,
  Music,
  Palette,
  Search,
  Trophy,
  Utensils,
  Waves,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import {
  fetchEventCategories,
  fetchEvents,
  toggleFavorite,
} from '@/services/events.js'
import { getApiMessage } from '@/lib/messages.js'
import { optimisticallySetFavorite, refreshFavoriteQueries, restoreFavoriteSnapshots } from '@/lib/favoriteCache.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const RECENT_EXPIRED_WINDOW_MS = 15 * 24 * 60 * 60 * 1000

const categoryIcons = [
  Music,
  Trophy,
  Palette,
  Utensils,
  BriefcaseBusiness,
  Martini,
  Waves,
]

function formatDateTime(value) {
  if (!value) return 'Sắp cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

function formatPrice(event) {
  const min = event.min_price ?? event.price_range?.min
  const max = event.max_price ?? event.price_range?.max

  if (min === null || min === undefined) return 'Liên hệ'
  if (Number(min) === 0 && Number(max || 0) === 0) return 'Miễn phí'
  if (max && Number(max) !== Number(min)) {
    return `${Number(min).toLocaleString('vi-VN')} - ${Number(max).toLocaleString('vi-VN')} đ`
  }
  return `${Number(min).toLocaleString('vi-VN')} đ`
}

function eventImage(event) {
  return event.banner_url || event.thumbnail_url || event.image
}

function eventPath(event) {
  return `/events/${event.slug || event.id}`
}

function eventLocation(event) {
  return event.venue?.summary || event.location || 'Địa điểm cập nhật sau'
}

function getEventTimeState(event, now = Date.now()) {
  const start = event.start_time ? new Date(event.start_time).getTime() : null
  const end = event.end_time ? new Date(event.end_time).getTime() : start

  if (end && end < now) return 'expired'
  if (start && start <= now && (!end || end >= now)) return 'ongoing'
  return 'upcoming'
}

function getWeekRange(now = Date.now()) {
  const date = new Date(now)
  const day = date.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = new Date(date)
  start.setDate(date.getDate() + diffToMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return { start: start.getTime(), end: end.getTime() }
}

function isActiveEventInWeek(event, now = Date.now()) {
  const start = event.start_time ? new Date(event.start_time).getTime() : null
  const end = event.end_time ? new Date(event.end_time).getTime() : start

  if (end && end < now) return false
  if (!start && !end) return false

  const week = getWeekRange(now)
  const effectiveStart = start || end
  const effectiveEnd = end || start

  return effectiveStart <= week.end && effectiveEnd >= week.start
}

function isRecentlyExpiredEvent(event, now = Date.now()) {
  const endedAt = event.end_time || event.start_time
  if (!endedAt) return false
  const endedTime = new Date(endedAt).getTime()
  return Number.isFinite(endedTime) && endedTime < now && endedTime >= now - RECENT_EXPIRED_WINDOW_MS
}

function uniqueEvents(...groups) {
  const unique = new Map()
  groups.flat().forEach((event) => {
    if (event?.id && !unique.has(event.id)) unique.set(event.id, event)
  })
  return Array.from(unique.values())
}

export function HomePage() {
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)
  const [timelineNow, setTimelineNow] = useState(() => Date.now())
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const featuredQuery = useQuery({
    queryKey: ['home-events', 'featured'],
    queryFn: () => fetchEvents({ limit: 10, sort_by: 'created_at', sort_order: 'desc' }),
  })

  const upcomingQuery = useQuery({
    queryKey: ['home-events', 'upcoming'],
    queryFn: () => fetchEvents({ limit: 8, sort_by: 'start_time', sort_order: 'asc' }),
  })

  const trendingQuery = useQuery({
    queryKey: ['home-events', 'trending'],
    queryFn: () => fetchEvents({ limit: 24, sort_by: 'updated_at', sort_order: 'desc' }),
  })

  const timelineQuery = useQuery({
    queryKey: ['home-events', 'timeline'],
    queryFn: () => fetchEvents({ limit: 24, sort_by: 'start_time', sort_order: 'asc' }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['event-categories'],
    queryFn: fetchEventCategories,
  })

  useEffect(() => {
    const timer = window.setInterval(() => setTimelineNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const favoriteMutation = useMutation({
    mutationFn: (event) => toggleFavorite(event.id),
    onMutate: (event) => {
      const isFavorited = !event.is_favorited
      const snapshots = optimisticallySetFavorite(queryClient, event, isFavorited)
      toast.success(isFavorited ? '\u0110\u00e3 l\u01b0u s\u1ef1 ki\u1ec7n v\u00e0o y\u00eau th\u00edch.' : '\u0110\u00e3 b\u1ecf s\u1ef1 ki\u1ec7n kh\u1ecfi y\u00eau th\u00edch.')
      return { snapshots }
    },
    onError: (err, _event, context) => {
      restoreFavoriteSnapshots(queryClient, context?.snapshots)
      toast.error(getApiMessage(err, 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt y\u00eau th\u00edch. Vui l\u00f2ng th\u1eed l\u1ea1i.'))
    },
    onSettled: () => refreshFavoriteQueries(queryClient),
  })

  const featuredEvents = useMemo(
    () => featuredQuery.data?.items || [],
    [featuredQuery.data?.items],
  )
  const upcomingEvents = useMemo(
    () => upcomingQuery.data?.items || [],
    [upcomingQuery.data?.items],
  )
  const trendingEvents = useMemo(
    () => trendingQuery.data?.items || [],
    [trendingQuery.data?.items],
  )
  const timelineEvents = useMemo(
    () => timelineQuery.data?.items || [],
    [timelineQuery.data?.items],
  )
  const categories = categoriesQuery.data || []
  const heroEvents = useMemo(() => {
    return uniqueEvents(featuredEvents, upcomingEvents, timelineEvents)
      .filter((event) => getEventTimeState(event, timelineNow) !== 'expired')
      .slice(0, 10)
  }, [featuredEvents, timelineEvents, timelineNow, upcomingEvents])

  const trendingThisWeekEvents = useMemo(() => {
    return uniqueEvents(trendingEvents, timelineEvents, upcomingEvents, featuredEvents)
      .filter((event) => isActiveEventInWeek(event, timelineNow))
      .slice(0, 4)
  }, [featuredEvents, timelineEvents, timelineNow, trendingEvents, upcomingEvents])

  const homeTimeline = useMemo(() => {
    const events = uniqueEvents(timelineEvents, upcomingEvents, featuredEvents)
    return {
      ongoing: events
        .filter((event) => getEventTimeState(event, timelineNow) === 'ongoing')
        .sort((a, b) => new Date(a.end_time || a.start_time || 0) - new Date(b.end_time || b.start_time || 0))
        .slice(0, 4),
      upcoming: events
        .filter((event) => getEventTimeState(event, timelineNow) === 'upcoming')
        .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0))
        .slice(0, 4),
      expired: events
        .filter((event) => getEventTimeState(event, timelineNow) === 'expired' && isRecentlyExpiredEvent(event, timelineNow))
        .sort((a, b) => new Date(b.end_time || b.start_time || 0) - new Date(a.end_time || a.start_time || 0))
        .slice(0, 4),
    }
  }, [featuredEvents, timelineEvents, timelineNow, upcomingEvents])

  useEffect(() => {
    if (heroEvents.length < 2) return undefined
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroEvents.length)
    }, 3600)
    return () => window.clearInterval(timer)
  }, [heroEvents.length])

  const handleSearch = (event) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (keyword.trim()) params.set('keyword', keyword.trim())
    navigate(`/events${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const handleCategorySearch = (slug) => {
    const params = new URLSearchParams()
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (slug) params.set('category_slug', slug)
    navigate(`/events${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const handleFavorite = (event) => {
    if (!getAuthToken()) {
      toast.error('Vui lòng đăng nhập để lưu sự kiện yêu thích.')
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    favoriteMutation.mutate(event)
  }

  const safeActiveSlide = heroEvents.length ? activeSlide % heroEvents.length : 0

  return (
    <div className="overflow-hidden text-content bg-transparent">
      <section className="relative h-[100dvh] w-full flex flex-col justify-center overflow-hidden pt-24 pb-4 snap-start shrink-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(6,182,212,0.15),transparent_30%),radial-gradient(circle_at_18%_34%,rgba(59,130,246,0.15),transparent_28%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex-1 flex flex-col justify-center">
          <div className="w-full flex-1 flex flex-col justify-center min-h-0">
            {featuredQuery.isLoading ? (
              <StatePanel message="Đang tải sự kiện nổi bật..." />
            ) : featuredQuery.isError ? (
              <StatePanel message="Không thể tải sự kiện nổi bật." tone="error" />
            ) : heroEvents.length ? (
              <BentoHero
                activeIndex={safeActiveSlide}
                events={heroEvents}
                onSelect={setActiveSlide}
              />
            ) : (
              <StatePanel message="Chưa có sự kiện nổi bật." />
            )}
          </div>
        </div>
      </section>

      <section className="relative min-h-[100dvh] w-full flex flex-col justify-center pb-12 pt-8 snap-start">
        <ScrollReveal>
        <form
          onSubmit={handleSearch}
          className="relative z-20 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mb-8"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-primary" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm kiếm sự kiện, danh mục, địa điểm..."
                className="w-full rounded-full border border-primary/30 bg-panel-soft/60 py-4 pl-12 pr-4 text-content outline-none backdrop-blur-md transition focus:border-primary focus:bg-panel shadow-[0_0_20px_rgba(6,182,212,0.15)]"
              />
            </div>
            <button className="admin-primary text-base px-8 py-4">
              Khám phá
            </button>
          </div>
        </form>
        </ScrollReveal>

        <ScrollReveal as="section" className="bg-transparent pt-4">
          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle
              title="Xu hướng tuần này"
              action="Xem tất cả"
            />
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {trendingThisWeekEvents.map((event, index) => (
                <ScrollReveal key={event.id} delay={index * 90}>
                  <EventCard
                    event={event}
                    compact
                    onFavoriteToggle={handleFavorite}
                    favoriteBusy={favoriteMutation.isPending}
                  />
                </ScrollReveal>
              ))}
            </div>
            {!trendingThisWeekEvents.length && (
              <div className="mt-6 rounded-[24px] border border-primary/15 bg-white/5 p-6 text-sm font-semibold text-muted">
                Chưa có sự kiện đang diễn ra trong tuần này
              </div>
            )}
          </div>
        </ScrollReveal>
      </section>

      <section className="relative -mt-32 bg-transparent pb-4 pt-40">
        <div className="category-light-ribbon" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <SectionTitle title="Khám phá thể loại" />
          </ScrollReveal>
          <div className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((category, index) => {
              const Icon = categoryIcons[index % categoryIcons.length]
              return (
                <ScrollReveal key={category.id} className="h-full" delay={index * 70}>
                <button
                  type="button"
                  onClick={() => handleCategorySearch(category.slug)}
                  className="glass-panel group flex h-full min-h-[196px] w-full flex-col items-center justify-center rounded-[24px] p-5 text-center transition duration-500 ease-out hover:border-primary/60 hover:bg-primary/10 sm:min-h-[208px] lg:min-h-[196px]"
                >
                  <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary transition group-hover:scale-110">
                    <Icon className="size-6" />
                  </span>
                  <span className="mt-4 block font-bold text-white">{category.name}</span>
                  <span className="mt-1 block text-xs text-muted">{category.event_count || 0} sự kiện</span>
                </button>
                </ScrollReveal>
              )
            })}
          </div>
        </div>

        <div className="relative z-10 pt-12 pb-4">
          <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
            <TimelineEventSection
              title="Sự kiện đang diễn ra"
              emptyMessage="Hiện chưa có sự kiện nào đang diễn ra"
              events={homeTimeline.ongoing}
              favoriteBusy={favoriteMutation.isPending}
              onFavoriteToggle={handleFavorite}
            />
            <TimelineEventSection
              title="Sự kiện sắp diễn ra"
              emptyMessage="Chưa có sự kiện sắp diễn ra phù hợp"
              events={homeTimeline.upcoming}
              favoriteBusy={favoriteMutation.isPending}
              onFavoriteToggle={handleFavorite}
            />
            <TimelineEventSection
              title="Sự kiện đã kết thúc"
              emptyMessage="Chưa có sự kiện đã kết thúc"
              events={homeTimeline.expired}
              favoriteBusy={favoriteMutation.isPending}
              onFavoriteToggle={handleFavorite}
              expired
            />
          </div>
        </div>
      </section>

      <section className="hidden bg-transparent py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle title="Sự kiện sắp diễn ra" tight />
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {['Hôm nay', 'Tuần này', 'Gần bạn', 'Miễn phí'].map((label, index) => (
                <Link
                  key={label}
                  to="/events"
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${index === 0
                      ? 'bg-primary text-[#081126]'
                      : 'bg-panel-soft text-subtle hover:text-primary'
                    }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {upcomingEvents[0] && <SpotlightEvent event={upcomingEvents[0]} />}

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {upcomingEvents.slice(1, 4).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                compact
                onFavoriteToggle={handleFavorite}
                favoriteBusy={favoriteMutation.isPending}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function BentoHero({ activeIndex, events, onSelect }) {
  const navigate = useNavigate()
  const safeEvents = (events || []).filter((event) => event?.id)
  if (!safeEvents.length) return null

  const mainEvent = safeEvents[activeIndex]
  const secondEvent = safeEvents.length > 1 ? safeEvents[(activeIndex + 1) % safeEvents.length] : null
  const thirdEvent = safeEvents.length > 2 ? safeEvents[(activeIndex + 2) % safeEvents.length] : null

  if (!mainEvent) return null

  return (
    <div className="relative mx-auto max-w-7xl pt-0 pb-4 w-full h-full flex flex-col justify-center min-h-0">
      <div className="mb-4 lg:mb-8 text-center shrink-0">
        <h1 className="font-display text-4xl font-black leading-tight text-white md:text-5xl drop-shadow-lg">
          Khám phá vũ trụ <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Sự Kiện</span>
        </h1>
        <p className="mt-2 text-base text-subtle">Trải nghiệm những khoảnh khắc đáng nhớ nhất cùng EventHub</p>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 flex-1 min-h-[40vh] lg:min-h-[55vh]`}>
        {/* Main Event Card */}
        <div 
          onClick={() => navigate(eventPath(mainEvent))}
          className={`glass-panel group relative overflow-hidden cursor-pointer p-0 ${!secondEvent && !thirdEvent ? 'lg:col-span-3 lg:row-span-2' : 'lg:col-span-2 lg:row-span-2'}`}
        >
          <img src={eventImage(mainEvent)} alt={mainEvent.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-90" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-inherit pointer-events-none" />
          
          <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col justify-end">
            <span className="w-fit rounded-full border border-primary/50 bg-primary/20 px-3 py-1 text-xs font-bold uppercase text-primary backdrop-blur-md mb-4 shadow-[0_0_15px_rgba(6,182,212,0.5)]">
              {mainEvent.category?.name || 'Sự kiện nổi bật'}
            </span>
            <h2 className="font-display text-3xl font-bold text-white mb-3 line-clamp-2 transition-colors">
              {mainEvent.title}
            </h2>
            <div className="flex items-center gap-6 text-sm text-subtle mb-6">
              <span className="flex items-center gap-2"><CalendarDays className="size-4 text-secondary"/> {formatDateTime(mainEvent.start_time)}</span>
              <span className="flex items-center gap-2"><MapPin className="size-4 text-secondary"/> {eventLocation(mainEvent)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-white drop-shadow-md">{formatPrice(mainEvent)}</span>
              <button className="admin-primary" onClick={(e) => { e.stopPropagation(); navigate(eventPath(mainEvent)); }}>Mua vé ngay</button>
            </div>
          </div>
        </div>

        {/* Secondary Events */}
        {[secondEvent, thirdEvent].map((evt, idx) => evt && (
          <div 
            key={evt.id + '-' + idx}
            onClick={() => navigate(eventPath(evt))}
            className="glass-panel group relative overflow-hidden cursor-pointer p-0"
          >
            <img src={eventImage(evt)} alt={evt.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent opacity-90" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-inherit pointer-events-none" />
            
            <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end h-full">
              <span className="w-fit rounded-full border border-secondary/50 bg-secondary/20 px-2 py-0.5 text-[10px] font-bold uppercase text-secondary backdrop-blur-md mb-2">
                {evt.category?.name || 'Sự kiện'}
              </span>
              <h3 className="font-display text-lg font-bold text-white mb-2 line-clamp-2 transition-colors">
                {evt.title}
              </h3>
              <p className="text-xs text-subtle mb-3 line-clamp-1">{eventLocation(evt)}</p>
              <span className="text-sm font-bold text-primary mt-auto">{formatPrice(evt)}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 flex justify-center gap-2">
        {safeEvents.map((_, index) => (
          <button
            key={index}
            onClick={() => onSelect(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${index === activeIndex ? 'w-8 bg-primary shadow-[0_0_10px_rgba(6,182,212,0.8)]' : 'w-2 bg-white/20 hover:bg-white/40'}`}
            aria-label={`Chuyển đến sự kiện ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

function ScrollReveal({ as: Component = 'div', children, className = '', delay = 0 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        observer.unobserve(entry.target)
      },
      {
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.12,
      },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Component
      ref={ref}
      className={`${className} transform-gpu transition-all duration-700 ease-out ${
        visible ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-8 opacity-0 blur-sm'
      }`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Component>
  )
}

function TimelineEventSection({
  title,
  events,
  emptyMessage,
  favoriteBusy,
  onFavoriteToggle,
  expired = false,
}) {
  return (
    <ScrollReveal as="section">
      <SectionTitle title={title} tight />
      {events.length ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {events.map((event, index) => (
            <ScrollReveal
              key={event.id}
              className={expired ? 'relative grayscale-[0.25]' : 'relative'}
              delay={index * 90}
            >
              {expired && (
                <span className="absolute left-4 top-4 z-30 rounded-full border border-white/20 bg-slate-950/75 px-3 py-1 text-xs font-extrabold uppercase text-white backdrop-blur">
                  Đã kết thúc
                </span>
              )}
              <EventCard
                event={event}
                compact
                onFavoriteToggle={onFavoriteToggle}
                favoriteBusy={favoriteBusy}
                showCategoryBadge={!expired}
              />
            </ScrollReveal>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-[24px] border border-primary/15 bg-white/5 p-6 text-sm font-semibold text-muted">
          {emptyMessage}
        </div>
      )}
    </ScrollReveal>
  )
}

function SpotlightEvent({ event }) {
  return (
    <article className="glass-panel overflow-hidden rounded-[26px] lg:grid lg:grid-cols-[1fr_1.45fr]">
      <Link to={eventPath(event)} className="block min-h-72 overflow-hidden">
        <img
          src={eventImage(event)}
          alt={event.title}
          className="h-full w-full object-cover transition duration-700 hover:scale-105"
        />
      </Link>
      <div className="flex flex-col justify-center p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">
            {event.category?.name || 'Sự kiện'}
          </span>
          <span className="text-xs font-bold uppercase text-muted">
            {formatDateTime(event.start_time)}
          </span>
        </div>
        <h3 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight text-white">
          {event.title}
        </h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-subtle">
          {event.short_description || event.description || 'Thông tin chi tiết sẽ được cập nhật sớm.'}
        </p>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="font-display text-2xl font-extrabold text-white">
            {formatPrice(event)}
          </span>
          <Link
            to={eventPath(event)}
            className="inline-flex w-fit rounded-full bg-tertiary px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-tertiary/20 transition duration-500 ease-out hover:bg-orange-600"
          >
            Xem chi tiết
          </Link>
        </div>
      </div>
    </article>
  )
}

function SectionTitle({ title, description, action, tight = false }) {
  return (
    <div className={`${tight ? '' : 'mb-6'} flex items-end justify-between gap-4`}>
      <div>
        <h2 className="font-display text-2xl font-extrabold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && (
        <Link
          to="/events"
          className="hidden items-center gap-1 text-sm font-bold text-primary hover:text-sky-300 sm:inline-flex"
        >
          {action}
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  )
}

function StatePanel({ message, tone = 'default' }) {
  return (
    <div className={`rounded-[24px] border p-8 text-center ${tone === 'error'
        ? 'border-error/40 bg-error/10 text-error'
        : 'border-border-soft bg-panel text-muted'
      }`}>
      <CalendarDays className="mx-auto mb-3 size-6 text-primary" />
      {message}
    </div>
  )
}

