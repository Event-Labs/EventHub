import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Music,
  Search,
  Sparkles,
  Star,
  Theater,
  Trophy,
  Users,
  Waves,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import {
  fetchEventCategories,
  fetchEvents,
  toggleFavorite,
} from '@/services/events.js'

const categoryIcons = [Music, Users, BriefcaseBusiness, Theater, Trophy, Waves]

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function eventImage(event) {
  return event.banner_url || event.thumbnail_url
}

export function HomePage() {
  const [keyword, setKeyword] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const featuredQuery = useQuery({
    queryKey: ['home-events', 'featured'],
    queryFn: () => fetchEvents({ limit: 6, sort_by: 'created_at', sort_order: 'desc' }),
  })

  const upcomingQuery = useQuery({
    queryKey: ['home-events', 'upcoming'],
    queryFn: () => fetchEvents({ limit: 6, sort_by: 'start_time', sort_order: 'asc' }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['event-categories'],
    queryFn: fetchEventCategories,
  })

  const categoryRows = useQueries({
    queries: (categoriesQuery.data || []).slice(0, 5).map((category) => ({
      queryKey: ['home-events', 'category', category.slug],
      queryFn: () =>
        fetchEvents({
          category_slug: category.slug,
          limit: 4,
          sort_by: 'start_time',
          sort_order: 'asc',
        }),
      enabled: Boolean(category.slug),
    })),
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
  const categories = categoriesQuery.data || []
  const organizers = useMemo(() => {
    const map = new Map()
    featuredEvents.concat(upcomingEvents).forEach((event) => {
      if (!event.organizer?.id) return
      const current = map.get(event.organizer.id) || {
        ...event.organizer,
        count: 0,
      }
      current.count += 1
      map.set(event.organizer.id, current)
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 3)
  }, [featuredEvents, upcomingEvents])

  const handleSearch = (event) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (keyword.trim()) params.set('keyword', keyword.trim())
    navigate(`/events${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const handleFavorite = (event) => {
    if (!localStorage.getItem('eventhub-token')) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    favoriteMutation.mutate(event)
  }

  return (
    <div className="pb-16">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-3xl font-extrabold text-white">
            Sự kiện nổi bật
          </h1>
          <Link
            to="/events"
            className="inline-flex items-center gap-2 rounded-md border border-border-soft px-4 py-2 text-sm font-bold text-subtle hover:border-primary hover:text-primary"
          >
            Xem tất cả
            <ChevronRight className="size-4" />
          </Link>
        </div>

        {featuredQuery.isLoading && <StatePanel message="Đang tải sự kiện nổi bật..." />}
        {featuredQuery.isError && <StatePanel message="Không thể tải sự kiện nổi bật." tone="error" />}

        <div className="grid gap-5 lg:grid-cols-2">
          {featuredEvents.slice(0, 2).map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.slug || event.id}`}
              className="group relative h-[360px] overflow-hidden rounded-lg border border-border-soft shadow-2xl"
            >
              {eventImage(event) && (
                <img
                  src={eventImage(event)}
                  alt={event.title}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-surface" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-slate-950">
                  {event.category?.name || 'Sự kiện'}
                </span>
                <h2 className="mt-4 font-display text-3xl font-extrabold text-white">
                  {event.title}
                </h2>
                <p className="mt-2 text-subtle">
                  {formatDateTime(event.start_time)} - {event.venue?.summary || 'Địa điểm cập nhật sau'}
                </p>
                <span className="mt-5 inline-flex rounded-md bg-tertiary px-4 py-2 font-bold text-white">
                  Xem chi tiết
                </span>
              </div>
            </Link>
          ))}
        </div>

        <form className="glass-panel mt-6 rounded-lg p-4" onSubmit={handleSearch}>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm kiếm sự kiện theo tên, danh mục, địa điểm..."
                className="w-full rounded-md border border-border-soft bg-surface py-3 pl-11 pr-3 text-content outline-none focus:border-primary"
              />
            </div>
            <button className="rounded-md bg-primary px-6 py-3 font-bold text-slate-950">
              Tìm kiếm
            </button>
          </div>
        </form>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionHeader
          title="Sự kiện đề xuất"
          description="Các chương trình công khai đang mở bán hoặc sắp diễn ra."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {featuredEvents.slice(0, 4).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              compact
              onFavoriteToggle={handleFavorite}
              favoriteBusy={favoriteMutation.isPending}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionHeader title="Sắp diễn ra" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {upcomingEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              compact
              onFavoriteToggle={handleFavorite}
              favoriteBusy={favoriteMutation.isPending}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        {categories.slice(0, 5).map((category, index) => {
          const row = categoryRows[index]
          const events = row?.data?.items || []
          if (!row?.isLoading && events.length === 0) return null

          return (
            <div key={category.id}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <SectionHeader
                  title={category.name}
                  description={`${category.event_count} sự kiện thuộc danh mục này`}
                />
                <Link
                  to={`/events?category_slug=${encodeURIComponent(category.slug)}`}
                  className="shrink-0 rounded-md border border-border-soft px-4 py-2 text-sm font-bold text-subtle hover:border-primary hover:text-primary"
                >
                  Xem thêm
                </Link>
              </div>
              {row?.isLoading ? (
                <StatePanel message={`Đang tải ${category.name}...`} compact />
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      compact
                      onFavoriteToggle={handleFavorite}
                      favoriteBusy={favoriteMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div>
          <SectionHeader title="Danh mục phổ biến" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {categories.slice(0, 6).map((category, index) => {
              const Icon = categoryIcons[index % categoryIcons.length]
              return (
                <Link
                  key={category.id}
                  to={`/events?category_slug=${encodeURIComponent(category.slug)}`}
                  className="rounded-lg border border-border-soft bg-panel p-5 transition hover:border-primary hover:bg-panel-soft"
                >
                  <Icon className="size-8 text-primary" />
                  <p className="mt-4 font-display text-lg font-bold text-white">
                    {category.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {category.event_count} sự kiện
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
        <div>
          <SectionHeader title="Ban tổ chức nổi bật" />
          <div className="space-y-4">
            {organizers.length ? (
              organizers.map((organizer, index) => (
                <article
                  key={organizer.id}
                  className="glass-panel flex items-center gap-4 rounded-lg p-4"
                >
                  <div className="grid size-14 place-items-center rounded-full bg-secondary/20 font-display text-xl font-bold text-secondary">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white">{organizer.full_name}</h3>
                    <p className="text-sm text-muted">{organizer.count} sự kiện công khai</p>
                  </div>
                  <div className="flex items-center gap-1 text-warning">
                    <Star className="size-4 fill-warning" />
                    <Sparkles className="size-4" />
                  </div>
                </article>
              ))
            ) : (
              <StatePanel message="Chưa có dữ liệu ban tổ chức." compact />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function StatePanel({ message, tone = 'default', compact = false }) {
  return (
    <div className={`${compact ? 'p-5' : 'p-8'} rounded-lg border text-center ${tone === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-border-soft bg-panel text-muted'}`}>
      <CalendarDays className="mx-auto mb-3 size-6 text-primary" />
      {message}
    </div>
  )
}
