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
import { useEffect, useMemo, useState } from 'react'
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
  const categories = categoriesQuery.data || []
  const heroEvents = useMemo(() => {
    const unique = new Map()
    featuredEvents.concat(upcomingEvents).forEach((event) => {
      if (event?.id && !unique.has(event.id)) unique.set(event.id, event)
    })
    return Array.from(unique.values()).slice(0, 6)
  }, [featuredEvents, upcomingEvents])

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
    if (!localStorage.getItem('eventhub-token')) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    favoriteMutation.mutate(event)
  }

  const safeActiveSlide = heroEvents.length ? activeSlide % heroEvents.length : 0

  return (
    <div className="overflow-hidden bg-background text-content">
      <section className="relative min-h-[720px] overflow-hidden bg-[#080f1e] py-10 sm:py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_75%_40%,rgba(249,115,22,0.14),transparent_30%)]" />
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

      <form
        onSubmit={handleSearch}
        className="relative z-20 mx-auto mt-14 max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className=" flex flex-col gap-3 p-4 shadow-2xl md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm kiếm sự kiện theo tên, danh mục, địa điểm..."
              className="w-full rounded-md border border-border-soft bg-surface py-3 pl-11 pr-3 text-content outline-none focus:border-primary"
            />
          </div>
          <button className="rounded-md bg-primary px-6 py-3 font-bold text-slate-950 transition hover:bg-sky-300">
            Tìm kiếm
          </button>
        </div>
      </form>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
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

      <section className="bg-[#050b18] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionTitle
            title="Xu hướng tuần này"
            description="Những sự kiện đang được quan tâm nhiều nhất."
            action="Xem tất cả"
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {(trendingEvents.length ? trendingEvents : featuredEvents).slice(0, 4).map((event) => (
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

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <SectionTitle title="Khám phá thể loại" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.slice(0, 6).map((category, index) => {
            const Icon = categoryIcons[index % categoryIcons.length]
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategorySearch(category.slug)}
                className="glass-panel group min-h-36 rounded-lg p-5 text-center transition hover:border-primary/60 hover:bg-primary/10"
              >
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary transition group-hover:scale-110">
                  <Icon className="size-6" />
                </span>
                <span className="mt-4 block font-bold text-white">{category.name}</span>
                <span className="mt-1 block text-xs text-muted">{category.event_count || 0} sự kiện</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="bg-[#081122] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle title="Sự kiện sắp diễn ra" tight />
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {['Hôm nay', 'Tuần này', 'Gần bạn', 'Miễn phí'].map((label, index) => (
                <Link
                  key={label}
                  to="/events"
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${
                    index === 0
                      ? 'bg-primary text-slate-950'
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
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-ai px-5 py-3 text-sm font-bold text-white shadow-[0_0_28px_rgba(168,85,247,0.38)] transition hover:bg-purple-500"
      >
        Hỏi EventHub AI
        <Sparkles className="size-4" />
      </Link>
    </div>
  )
}

function CinematicCarousel({ activeIndex, events, onSelect }) {
  const visibleEvents = [-1, 0, 1].map((offset) => {
    const index = (activeIndex + offset + events.length) % events.length
    return { event: events[index], offset, index }
  })

  return (
    <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-start justify-center pt-8 [perspective:1400px]">
      <div className="flex w-full items-center justify-center">
        {visibleEvents.map(({ event, offset, index }) => (
          <HeroCard
            key={`${event.id}-${offset}`}
            event={event}
            active={offset === 0}
            side={offset}
            onClick={() => onSelect(index)}
          />
        ))}
      </div>
      <div className="absolute bottom-5 flex justify-center gap-2">
        {events.map((event, index) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`h-2 rounded-full transition ${
              index === activeIndex ? 'w-8 bg-primary' : 'w-2 bg-white/25'
            }`}
            aria-label={`Chuyển đến sự kiện ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

function HeroCard({ event, active, side, onClick }) {
  const transform = active
    ? 'z-20 mx-[-20px] w-[min(430px,92vw)] scale-100 opacity-100 blur-0'
    : side < 0
      ? 'z-10 hidden w-72 -translate-x-6 scale-[0.85] opacity-40 blur-[1px] md:block'
      : 'z-10 hidden w-72 translate-x-6 scale-[0.85] opacity-40 blur-[1px] md:block'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group h-[540px] overflow-hidden rounded-lg border border-white/10 bg-panel text-left shadow-2xl transition duration-700 [transform-style:preserve-3d] ${
        side < 0 ? '[transform:rotateY(22deg)]' : side > 0 ? '[transform:rotateY(-22deg)]' : ''
      } ${transform}`}
    >
      <div className={active ? 'h-72 overflow-hidden' : 'h-full overflow-hidden'}>
        <img
          src={eventImage(event)}
          alt={event.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      </div>
      {active && (
        <div className="flex h-[252px] flex-col justify-between p-5">
          <div>
            <span className="rounded-full bg-tertiary px-3 py-1 text-xs font-extrabold uppercase text-white">
              {event.category?.name || 'Sự kiện'}
            </span>
            <h2 className="mt-3 line-clamp-2 font-display text-xl font-extrabold text-white">
              {event.title}
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                {formatDateTime(event.start_time)}
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <span className="line-clamp-1">{eventLocation(event)}</span>
              </span>
            </div>
            <p className="mt-3 font-display text-lg font-bold text-primary">
              {formatPrice(event)}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to={eventPath(event)}
              className="w-full rounded-md bg-tertiary px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-orange-600"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              Xem chi tiết
            </Link>
          </div>
        </div>
      )}
    </button>
  )
}

function SpotlightEvent({ event }) {
  return (
    <article className="glass-panel overflow-hidden rounded-lg lg:grid lg:grid-cols-[1fr_1.45fr]">
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
            className="inline-flex w-fit rounded-md bg-tertiary px-6 py-3 text-sm font-extrabold text-white transition hover:bg-orange-600"
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
    <div className={`rounded-lg border p-8 text-center ${
      tone === 'error'
        ? 'border-error/40 bg-error/10 text-error'
        : 'border-border-soft bg-panel text-muted'
    }`}>
      <CalendarDays className="mx-auto mb-3 size-6 text-primary" />
      {message}
    </div>
  )
}
