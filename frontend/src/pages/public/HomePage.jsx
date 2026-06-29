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
  Sparkles,
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

function uniqueEvents(...groups) {
  const unique = new Map()
  groups.flat().forEach((event) => {
    if (event?.id && !unique.has(event.id)) unique.set(event.id, event)
  })
  return Array.from(unique.values())
}

export function HomePage() {
  const [keyword, setKeyword] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)
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
    queryFn: () => fetchEvents({ limit: 4, sort_by: 'updated_at', sort_order: 'desc' }),
  })

  const timelineQuery = useQuery({
    queryKey: ['home-events', 'timeline'],
    queryFn: () => fetchEvents({ limit: 24, sort_by: 'start_time', sort_order: 'asc' }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['event-categories'],
    queryFn: fetchEventCategories,
  })

  const favoriteMutation = useMutation({
    mutationFn: (event) => toggleFavorite(event.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-events'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['favorite-events'] })
    },
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
    const now = Date.now()
    return uniqueEvents(featuredEvents, upcomingEvents, timelineEvents)
      .filter((event) => getEventTimeState(event, now) !== 'expired')
      .slice(0, 10)
  }, [featuredEvents, timelineEvents, upcomingEvents])

  const homeTimeline = useMemo(() => {
    const now = Date.now()
    const events = uniqueEvents(timelineEvents, upcomingEvents, featuredEvents)
    return {
      ongoing: events
        .filter((event) => getEventTimeState(event, now) === 'ongoing')
        .sort((a, b) => new Date(a.end_time || a.start_time || 0) - new Date(b.end_time || b.start_time || 0))
        .slice(0, 4),
      upcoming: events
        .filter((event) => getEventTimeState(event, now) === 'upcoming')
        .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0))
        .slice(0, 4),
      expired: events
        .filter((event) => getEventTimeState(event, now) === 'expired')
        .sort((a, b) => new Date(b.end_time || b.start_time || 0) - new Date(a.end_time || a.start_time || 0))
        .slice(0, 4),
    }
  }, [featuredEvents, timelineEvents, upcomingEvents])

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
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    favoriteMutation.mutate(event)
  }

  const safeActiveSlide = heroEvents.length ? activeSlide % heroEvents.length : 0

  return (
    <div className="overflow-hidden bg-background text-content">
      <section className="relative min-h-[790px] overflow-hidden bg-[#081126] py-8 sm:py-10">
        <div className="hero-star-field absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(179,205,224,0.18),transparent_30%),radial-gradient(circle_at_18%_34%,rgba(43,92,146,0.18),transparent_28%),linear-gradient(180deg,#081126_0%,#0c1446_52%,#081126_100%)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.09),transparent_62%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div>
            {featuredQuery.isLoading ? (
              <StatePanel message="Đang tải sự kiện nổi bật..." />
            ) : featuredQuery.isError ? (
              <StatePanel message="Không thể tải sự kiện nổi bật." tone="error" />
            ) : heroEvents.length ? (
              <CinematicCarousel
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

      <section className="relative -mt-1 bg-[linear-gradient(180deg,#081126_0%,#0a1538_46%,#081126_100%)] pb-28 pt-12">
        <ScrollReveal>
        <form
          onSubmit={handleSearch}
          className="relative z-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm kiếm sự kiện theo tên, danh mục, địa điểm..."
                className="w-full rounded-full border border-primary/20 bg-white/8 py-3 pl-11 pr-3 text-content outline-none transition focus:border-primary"
              />
            </div>
            <button className="rounded-full bg-tertiary px-6 py-3 font-bold text-white shadow-lg shadow-tertiary/20 transition hover:bg-orange-600">
              Tìm kiếm
            </button>
          </div>
        </form>
        </ScrollReveal>

        <section className="hidden">
          <SectionTitle title="Sự kiện nổi bật gần bạn" />
          <div className="flex gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featuredEvents.slice(0, 8).map((event) => (
              <div key={event.id} className="min-w-[320px] max-w-[320px]">
                <EventCard
                  event={event}
                  compact
                  onFavoriteToggle={handleFavorite}
                  favoriteBusy={favoriteMutation.isPending}
                />
              </div>
            ))}
          </div>
        </section>

        <ScrollReveal as="section" className="bg-transparent pt-12">
          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionTitle
              title="Xu hướng tuần này"
              action="Xem tất cả"
            />
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {(trendingEvents.length ? trendingEvents : featuredEvents).slice(0, 4).map((event, index) => (
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
          </div>
        </ScrollReveal>
      </section>

      <section className="relative -mt-32 bg-[linear-gradient(180deg,rgba(8,17,38,0)_0%,#081126_18%,#081126_72%,#071022_100%)] pb-12 pt-40">
        <div className="category-light-ribbon" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,rgba(7,16,34,0)_0%,#071022_100%)]" />
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

        <div className="relative z-10 py-12">
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
              title="Sự kiện đã hết hạn"
              emptyMessage="Chưa có sự kiện hết hạn"
              events={homeTimeline.expired}
              favoriteBusy={favoriteMutation.isPending}
              onFavoriteToggle={handleFavorite}
              expired
            />
          </div>
        </div>
      </section>

      <section className="hidden bg-[#081126] py-12">
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

      <Link
        to="/ai-faq"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-[#0c1446]/90 px-5 py-3 text-sm font-bold text-white shadow-[0_18px_45px_rgba(3,8,24,0.45)] backdrop-blur transition hover:bg-[#2b5c92]"
      >
        Hỏi EventHub AI
        <Sparkles className="size-4" />
      </Link>
    </div>
  )
}

function CinematicCarousel({ activeIndex, events, onSelect }) {
  const navigate = useNavigate()
  const safeEvents = (events || []).filter((event) => event?.id)
  if (!safeEvents.length) return null

  const visibleEvents = [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const index = ((activeIndex + offset) % safeEvents.length + safeEvents.length) % safeEvents.length
    return { event: safeEvents[index], offset, index }
  })

  const spotlightShift = ((activeIndex % safeEvents.length) - Math.floor(safeEvents.length / 2)) * 2

  return (
    <div className="relative mx-auto min-h-[700px] max-w-7xl pt-2 [perspective:1500px]">
      <div className="relative z-20 mx-auto max-w-3xl text-center">
        <p className="text-xs font-extrabold uppercase tracking-[0.32em] text-primary/85">
          Sự kiện nổi bật
        </p>
        <h1 className="mt-3 font-display text-4xl font-black leading-tight text-white sm:text-4xl">
          Tìm trải nghiệm tiếp theo của bạn
        </h1>
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-[130px] z-0 h-[410px] w-[230px] origin-top bg-[linear-gradient(180deg,rgba(179,205,224,0.18),rgba(179,205,224,0.04)_58%,transparent)] opacity-80 transition-transform duration-500 ease-out"
        style={{ transform: `translateX(calc(-78% + ${spotlightShift}px)) skewX(-10deg) rotate(-8deg)` }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[130px] z-0 h-[410px] w-[230px] origin-top bg-[linear-gradient(180deg,rgba(179,205,224,0.16),rgba(43,92,146,0.06)_58%,transparent)] opacity-80 transition-transform duration-500 ease-out"
        style={{ transform: `translateX(calc(-22% + ${spotlightShift}px)) skewX(10deg) rotate(8deg)` }}
      />
      <div className="absolute inset-x-0 top-[205px] z-10 h-[340px] [transform-style:preserve-3d]">
        {visibleEvents.map(({ event, offset, index }) => (
          <HeroCard
            key={`${event.id}-${offset}`}
            event={event}
            active={offset === 0}
            offset={offset}
            onClick={() => navigate(eventPath(event))}
          />
        ))}
      </div>
      <div className="stage-platform absolute bottom-8 left-1/2 z-0 h-64 w-[min(1160px,96vw)] -translate-x-1/2 rounded-[50%]" />
      <div className="absolute bottom-5 left-0 right-0 z-30 flex justify-center gap-2">
        {safeEvents.map((event, index) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`h-2 rounded-full transition duration-500 ease-out ${index === activeIndex ? 'w-8 bg-primary' : 'w-2 bg-white/25'
              }`}
            aria-label={`Chuyển đến sự kiện ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

function HeroCard({ event, active, offset, onClick }) {
  const depth = Math.abs(offset)
  const positions = {
    '-3': { x: '-760px', y: '94px', z: '-310px', scale: 0.56, rotate: '36deg', opacity: 0.3, blur: '0.8px' },
    '-2': { x: '-560px', y: '62px', z: '-210px', scale: 0.67, rotate: '26deg', opacity: 0.48, blur: '0.45px' },
    '-1': { x: '-340px', y: '26px', z: '-92px', scale: 0.8, rotate: '15deg', opacity: 0.74, blur: '0px' },
    0: { x: '-50%', y: '-14px', z: '90px', scale: 1, rotate: '0deg', opacity: 1, blur: '0px' },
    1: { x: '150px', y: '26px', z: '-92px', scale: 0.8, rotate: '-15deg', opacity: 0.74, blur: '0px' },
    2: { x: '350px', y: '62px', z: '-210px', scale: 0.67, rotate: '-26deg', opacity: 0.48, blur: '0.45px' },
    3: { x: '535px', y: '94px', z: '-310px', scale: 0.56, rotate: '-36deg', opacity: 0.3, blur: '0.8px' },
  }
  const position = positions[offset]
  const hiddenOnMobile = depth > 1 ? 'hidden lg:block' : depth > 0 ? 'hidden sm:block' : ''

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault()
          onClick()
        }
      }}
      className={`event-card-stage stage-orbit-card group absolute left-1/2 top-0 w-[min(330px,76vw)] cursor-pointer overflow-hidden rounded-[26px] border bg-panel text-left [transform-style:preserve-3d] ${active
          ? 'h-[370px] border-primary/70 shadow-[0_34px_110px_rgba(179,205,224,0.28)]'
          : 'h-[260px] border-primary/20'
        } ${hiddenOnMobile}`}
      style={{
        '--stage-x': position.x,
        '--stage-y': position.y,
        '--stage-z': position.z,
        '--stage-scale': position.scale,
        '--stage-rotate': position.rotate,
        '--stage-opacity': position.opacity,
        '--stage-blur': position.blur,
        '--stage-border-opacity': active ? 0.95 : 0.46,
        zIndex: 20 - depth,
      }}
    >
      <div className={active ? 'relative h-48 overflow-hidden' : 'relative h-full overflow-hidden'}>
        <img
          src={eventImage(event)}
          alt={event.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="event-card-gradient absolute inset-0" />
      </div>
      {active && (
        <div className="flex h-[178px] flex-col justify-center bg-[linear-gradient(180deg,rgba(12,20,70,0.96),rgba(8,17,38,0.98))] p-5">
          <div>
            <span className="rounded-full border border-tertiary/50 bg-tertiary/20 px-3 py-1 text-xs font-extrabold uppercase text-white">
              {event.category?.name || 'Sự kiện'}
            </span>
            <h2 className="mt-3 line-clamp-2 font-display text-lg font-extrabold leading-snug text-white">
              {event.title}
            </h2>
            <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                {formatDateTime(event.start_time)}
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <span className="line-clamp-1">{eventLocation(event)}</span>
              </span>
            </div>
            <p className="mt-2 font-display text-base font-bold text-primary">
              {formatPrice(event)}
            </p>
          </div>
          <div className="hidden">
            <Link
              to={eventPath(event)}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-center text-sm font-bold text-[#081126] transition duration-500 ease-out hover:bg-white"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              Xem chi tiết
            </Link>
          </div>
        </div>
      )}
    </article>
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
                  Hết hạn
                </span>
              )}
              <EventCard
                event={event}
                compact
                onFavoriteToggle={onFavoriteToggle}
                favoriteBusy={favoriteBusy}
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
