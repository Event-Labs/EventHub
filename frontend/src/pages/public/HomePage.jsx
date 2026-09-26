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
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return 'Sắp cập nhật'
  }
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

function eventThumbnail(event) {
  return event.thumbnail_url || event.thumbnail || event.poster_url || event.banner_url || event.image || ''
}

function eventPath(event) {
  return `/events/${event.slug || event.id}`
}

function eventLocation(event) {
  return event.location_name || event.location || event.venue_name || 'Đang cập nhật địa điểm'
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

  return (
    <div className="overflow-hidden text-content bg-transparent relative">
      <section className="relative min-h-[100dvh] w-full flex flex-col justify-start items-center overflow-hidden pt-24 sm:pt-28 pb-12 snap-start shrink-0 bg-transparent">
        <SeamlessVideoBackground />

        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: `
              radial-gradient(140% 60% at 50% 40%, rgba(6,10,18,0.25) 0%, rgba(6,10,18,0.08) 50%, transparent 100%)
            `,
            WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 88%)',
            maskImage: 'linear-gradient(to bottom, black 40%, transparent 88%)',
          }}
        />

        <div
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(6,182,212,0.14),transparent_60%),radial-gradient(ellipse_60%_40%_at_50%_40%,rgba(59,130,246,0.10),transparent_70%)]"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 88%)',
            maskImage: 'linear-gradient(to bottom, black 40%, transparent 88%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(25,127,255,0)_38%,rgba(25,127,255,0.03)_54%,rgba(25,127,255,0.04)_68%,rgba(25,127,255,0)_88%)]"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 88%)',
            maskImage: 'linear-gradient(to bottom, black 40%, transparent 88%)',
          }}
        />

        <div className="relative z-30 mx-auto w-full max-w-5xl px-4 sm:px-6 flex flex-col items-center text-center">
          <h1 className="font-['Plus_Jakarta_Sans',var(--font-display)] font-extrabold text-3xl sm:text-5xl lg:text-6xl text-white tracking-tight leading-[1.12] drop-shadow-[0_0_34px_rgba(6,182,212,0.25)]">
            Khám phá vũ trụ
            <span className="block mt-1 text-transparent bg-clip-text bg-gradient-to-r from-primary via-cyan-200 to-blue-400">
              Sự kiện đỉnh cao
            </span>
          </h1>

          <p className="mt-4 max-w-2xl text-sm sm:text-base font-normal text-slate-300 leading-relaxed">
            Hệ sinh thái đặt vé trực tuyến, quản lý vận hành & soát vé QR thông minh hàng đầu
          </p>
        </div>

        {/* 3D True Perspective Carousel Ring Section with generous breathing room */}
        <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center mt-8 sm:mt-12 lg:mt-14 mb-4 sm:mb-6">
          {featuredQuery.isLoading ? (
            <StatePanel message="Đang tải sự kiện nổi bật..." />
          ) : featuredQuery.isError ? (
            <StatePanel message="Không thể tải sự kiện nổi bật." tone="error" />
          ) : heroEvents.length ? (
            <div className="w-full flex flex-col items-center">
              <VertexCarouselRing
                events={heroEvents}
                onSelectEvent={(evt) => navigate(eventPath(evt))}
              />
            </div>
          ) : (
            <StatePanel message="Chưa có sự kiện nổi bật." />
          )}
        </div>
      </section>

      <section id="explore-section" className="relative w-full flex flex-col justify-start pt-2 sm:pt-4 pb-12 -mt-16 sm:-mt-20 lg:-mt-24">
        <ScrollReveal>
          <form
            onSubmit={handleSearch}
            className="relative z-20 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mb-8"
          >
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-cyan-400" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="Tìm kiếm sự kiện, danh mục, địa điểm..."
                  className="w-full rounded-full border border-cyan-500/25 bg-slate-900/60 py-4 pl-12 pr-4 text-content outline-none backdrop-blur-xl transition duration-300 focus:border-cyan-400 focus:bg-slate-900/90 shadow-[0_0_20px_rgba(6,182,212,0.12)] focus:shadow-[0_0_30px_rgba(6,182,212,0.3)]"
                />
              </div>
              <button
                type="submit"
                className="rounded-full px-8 py-4 text-base font-bold transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(201,154,71,0.6)] active:scale-95 cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
              >
                <span>Tìm kiếm</span>
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
                    className="group relative flex h-full min-h-[196px] w-full flex-col items-center justify-center rounded-[24px] p-5 text-center bg-slate-950/60 border border-white/10 backdrop-blur-xl transition-all duration-400 ease-out hover:border-cyan-400/50 hover:bg-cyan-950/20 hover:shadow-[0_0_25px_rgba(6,182,212,0.25)] sm:min-h-[208px] lg:min-h-[196px] cursor-pointer"
                  >
                    <div className="vertex-card-edge absolute inset-0 pointer-events-none rounded-[24px]" />
                    <span className="mx-auto grid size-14 place-items-center rounded-full bg-cyan-500/10 text-cyan-400 transition-all duration-400 group-hover:scale-110 group-hover:bg-cyan-500/20 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                      <Icon className="size-6" />
                    </span>
                    <span className="mt-4 block font-bold text-white group-hover:text-cyan-300 transition-colors">{category.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{category.event_count || 0} sự kiện</span>
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

function SeamlessVideoBackground() {
  const v1Ref = useRef(null)
  const v2Ref = useRef(null)
  const [activeVid, setActiveVid] = useState(1)
  const videoSrc = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4'
  const posterSrc = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg'

  useEffect(() => {
    const v1 = v1Ref.current
    const v2 = v2Ref.current
    if (!v1 || !v2) return

    v1.play().catch(() => { })

    let switched = false
    const interval = setInterval(() => {
      if (activeVid === 1) {
        if (v1.currentTime >= 8.2 && !switched) {
          switched = true
          v2.currentTime = 0
          v2.play().then(() => {
            setActiveVid(2)
            setTimeout(() => {
              v1.pause()
              v1.currentTime = 0
              switched = false
            }, 1800)
          }).catch(() => { })
        }
      } else {
        if (v2.currentTime >= 8.2 && !switched) {
          switched = true
          v1.currentTime = 0
          v1.play().then(() => {
            setActiveVid(1)
            setTimeout(() => {
              v2.pause()
              v2.currentTime = 0
              switched = false
            }, 1800)
          }).catch(() => { })
        }
      }
    }, 150)

    return () => clearInterval(interval)
  }, [activeVid])

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0"
      style={{
        WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)',
        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 85%)',
      }}
    >
      <video
        ref={v1Ref}
        className={`absolute inset-0 h-full w-full object-cover object-center mix-blend-screen transition-opacity duration-1500 ease-in-out ${activeVid === 1 ? 'opacity-70' : 'opacity-0'
          }`}
        muted
        playsInline
        preload="auto"
        poster={posterSrc}
        src={videoSrc}
      />
      <video
        ref={v2Ref}
        className={`absolute inset-0 h-full w-full object-cover object-center mix-blend-screen transition-opacity duration-1500 ease-in-out ${activeVid === 2 ? 'opacity-70' : 'opacity-0'
          }`}
        muted
        playsInline
        preload="auto"
        src={videoSrc}
      />
    </div>
  )
}

function VertexCarouselRing({ events, onSelectEvent }) {
  const containerRef = useRef(null)
  const [isHovered, setIsHovered] = useState(false)
  const phaseRef = useRef(-2)
  const lastTimeRef = useRef(performance.now())

  const totalCards = 24
  const step = 360 / totalCards
  const R = 980
  const cullAngle = 50

  useEffect(() => {
    let animId
    const tick = (now) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = now

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!isHovered && !prefersReducedMotion) {
        phaseRef.current -= 1.6 * dt
      }

      if (containerRef.current) {
        const cardElements = containerRef.current.children
        for (let i = 0; i < cardElements.length; i++) {
          const el = cardElements[i]
          let a = ((i * step + phaseRef.current) % 360 + 540) % 360 - 180

          const r = (a * Math.PI) / 180
          const c = Math.cos(r)
          const x = R * Math.sin(r)
          const z = R * (1 - c)
          const rotY = -a
          const brightness = Math.max(0.5, Math.min(1.0, 1.0 - Math.abs(a) / 85))

          el.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${rotY}deg)`
          el.style.filter = `brightness(${brightness.toFixed(3)})`
          el.style.zIndex = ''
          el.style.opacity = ''

          if (Math.abs(a) > cullAngle) {
            el.style.visibility = 'hidden'
          } else {
            el.style.visibility = 'visible'
          }
        }
      }

      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [isHovered, step])

  if (!events || !events.length) return null

  const displayCards = Array.from({ length: totalCards }, (_, i) => events[i % events.length])

  return (
    <div
      className="relative w-full h-[360px] sm:h-[390px] lg:h-[420px] overflow-visible"
      style={{
        perspective: '1000px',
        perspectiveOrigin: '50% 50%',
        transformStyle: 'preserve-3d',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {displayCards.map((event, idx) => (
          <div
            key={idx}
            onClick={() => onSelectEvent(event)}
            className="absolute w-[225px] h-[335px] rounded-[16px] overflow-hidden bg-slate-900 shadow-[0_24px_46px_rgba(0,0,0,0.7),0_3px_8px_rgba(0,0,0,0.5)] cursor-pointer pointer-events-auto transition-shadow duration-300 hover:shadow-[0_0_35px_rgba(6,182,212,0.75)] group will-change-transform"
            style={{
              backfaceVisibility: 'hidden',
              margin: '-167px 0 0 -112px',
              visibility: 'hidden',
            }}
          >
            <img
              src={eventThumbnail(event)}
              alt={event.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              onError={(e) => {
                if (event.banner_url && e.target.src !== event.banner_url) {
                  e.target.src = event.banner_url
                } else {
                  e.target.style.display = 'none'
                }
              }}
            />
            {/* Dark gradient overlay behind text, leaving top thumbnail crisp & clear */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 via-42% to-transparent opacity-95 pointer-events-none" />
            {/* Edge reflection */}
            <div className="vertex-card-edge absolute inset-0 pointer-events-none rounded-[16px]" />

            {/* Content overlay */}
            <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col justify-end space-y-1.5 z-10">
              <h4 className="font-['Plus_Jakarta_Sans',var(--font-display)] text-sm sm:text-[15px] font-bold text-white line-clamp-2 leading-snug drop-shadow-md group-hover:text-primary transition-colors">
                {event.title}
              </h4>
              <div className="pt-0.5">
                <p className="text-[11px] sm:text-xs text-cyan-300 font-semibold truncate flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 shrink-0 text-primary" />
                  <span>{formatDateTime(event.start_time)}</span>
                </p>
              </div>
            </div>
          </div>
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
      className={`${className} transform-gpu transition-all duration-700 ease-out ${visible ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-8 opacity-0 blur-sm'
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

