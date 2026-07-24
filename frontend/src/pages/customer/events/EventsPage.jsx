import { getAuthToken } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Filter, RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchEventCategories, fetchEvents, toggleFavorite } from '@/services/events.js'
import { getApiMessage } from '@/lib/messages.js'
import { optimisticallySetFavorite, refreshFavoriteQueries, restoreFavoriteSnapshots } from '@/lib/favoriteCache.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const SORT_OPTIONS = [
  ['start_time', 'Sắp diễn ra'],
  ['created_at', 'Mới nhất'],
  ['price', 'Giá thấp nhất'],
]

const LOCATION_OPTIONS = [
  ['', 'Tất cả địa điểm'],
  ['Thành phố Hồ Chí Minh', 'TP. Hồ Chí Minh'],
  ['Hà Nội', 'Hà Nội'],
  ['Đà Nẵng', 'Đà Nẵng'],
  ['Đà Lạt', 'Đà Lạt'],
]

function readFilters(searchParams) {
  return {
    keyword: searchParams.get('keyword') || '',
    location: searchParams.get('location') || '',
    category_slug: searchParams.get('category_slug') || '',
    start_date: searchParams.get('start_date') || '',
    end_date: searchParams.get('end_date') || '',
    min_price: searchParams.get('min_price') || '',
    max_price: searchParams.get('max_price') || '',
    sort_by: searchParams.get('sort_by') || 'start_time',
    sort_order: searchParams.get('sort_order') || 'asc',
    page: searchParams.get('page') || '1',
  }
}

function buildQuery(filters) {
  return Object.fromEntries(
    Object.entries({
      ...filters,
      upcoming_only: true,
      limit: 9,
    }).filter(([, value]) => value),
  )
}


export function EventsPage() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const [draft, setDraft] = useState(filters)

  const queryParams = useMemo(() => buildQuery(filters), [filters])
  const eventsQuery = useQuery({
    queryKey: ['events', queryParams],
    queryFn: () => fetchEvents(queryParams),
    refetchInterval: 30_000,
  })

  const categoriesQuery = useQuery({
    queryKey: ['event-categories'],
    queryFn: fetchEventCategories,
  })

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

  const submitFilters = (event) => {
    event.preventDefault()
    setSearchParams(buildQuery({ ...draft, page: '1' }))
  }

  const clearFilters = () => {
    const reset = {
      keyword: '',
      location: '',
      category_slug: '',
      start_date: '',
      end_date: '',
      min_price: '',
      max_price: '',
      sort_by: 'start_time',
      sort_order: 'asc',
      page: '1',
    }
    setDraft(reset)
    setSearchParams(buildQuery(reset))
  }

  const handleFavorite = (event) => {
    if (!getAuthToken()) {
      toast.error('Vui lòng đăng nhập để lưu sự kiện yêu thích.')
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    favoriteMutation.mutate(event)
  }

  const events = eventsQuery.data?.items || []
  const pagination = eventsQuery.data?.pagination
  const categories = categoriesQuery.data || []

  const changePage = (page) => {
    if (!pagination || page < 1 || page > pagination.total_pages || page === pagination.page) return
    setSearchParams(buildQuery({ ...filters, page: String(page) }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <form
        className="glass-panel mb-8 rounded-lg border-primary/15 p-5 shadow-[0_18px_60px_rgba(56,189,248,0.08)]"
        onSubmit={submitFilters}
      >
        <div className="grid items-end gap-4 lg:grid-cols-[minmax(220px,1.35fr)_minmax(150px,0.72fr)_minmax(180px,0.85fr)_minmax(330px,1.35fr)]">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-muted">Từ khóa</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
              <input
                value={draft.keyword}
                onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
                placeholder="Tìm sự kiện..."
                className="h-12 w-full rounded-md border border-border-soft bg-surface py-3 pl-10 pr-3 text-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </label>

          <Select
            label="Địa điểm"
            value={draft.location}
            onChange={(value) => setDraft({ ...draft, location: value })}
            options={LOCATION_OPTIONS}
          />

          <Select
            label="Danh mục"
            value={draft.category_slug}
            onChange={(value) => setDraft({ ...draft, category_slug: value })}
            options={[
              ['', categoriesQuery.isLoading ? 'Đang tải danh mục...' : 'Tất cả danh mục'],
              ...categories.map((category) => [category.slug, category.name]),
            ]}
            disabled={categoriesQuery.isLoading}
          />

          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-muted">
              Thời gian
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="date"
                value={draft.start_date}
                onChange={(value) => setDraft({ ...draft, start_date: value })}
                aria-label="Từ ngày"
              />
              <Input
                type="date"
                value={draft.end_date}
                onChange={(value) => setDraft({ ...draft, end_date: value })}
                aria-label="Đến ngày"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid items-end gap-4 lg:grid-cols-[minmax(170px,0.9fr)_minmax(170px,0.9fr)_minmax(190px,0.95fr)_auto]">
          <Input
            label="Giá từ"
            type="number"
            min="0"
            value={draft.min_price}
            onChange={(value) => setDraft({ ...draft, min_price: value })}
          />
          <Input
            label="Giá đến"
            type="number"
            min="0"
            value={draft.max_price}
            onChange={(value) => setDraft({ ...draft, max_price: value })}
          />
          <label className="space-y-2">
            <span className="text-sm font-semibold text-muted">Sắp xếp</span>
            <select
              value={draft.sort_by}
              onChange={(event) => setDraft({ ...draft, sort_by: event.target.value, sort_order: event.target.value === 'created_at' ? 'desc' : 'asc' })}
              className="h-12 w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-md bg-primary px-5 font-bold text-slate-950 transition hover:bg-sky-300">
              <Filter className="size-4" />
              Tìm sự kiện
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-md border border-primary/40 px-4 font-bold text-primary transition hover:bg-primary/10"
            >
              <RotateCcw className="size-4" />
              Xóa bộ lọc
            </button>
          </div>
        </div>
      </form>

      <section>
        <SectionHeader
          title="Danh sách sự kiện"
          description={pagination ? `${pagination.total} sự kiện phù hợp` : 'Đang tải sự kiện'}
        />

        {eventsQuery.isLoading && (
          <StatePanel message="Đang tải danh sách sự kiện..." />
        )}
        {eventsQuery.isError && (
          <StatePanel message="Không thể tải sự kiện. Vui lòng thử lại." tone="error" />
        )}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
          <StatePanel message="Không có sự kiện phù hợp với bộ lọc hiện tại." />
        )}

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onFavoriteToggle={handleFavorite}
              favoriteBusy={favoriteMutation.isPending}
            />
          ))}
        </div>

        {!eventsQuery.isLoading && !eventsQuery.isError && pagination?.total_pages > 1 && (
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang sự kiện">
            <button type="button" onClick={() => changePage(pagination.page - 1)} disabled={pagination.page === 1} className="grid size-10 place-items-center rounded-full border border-border-soft bg-panel text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang trước">
              <ChevronLeft className="size-5" />
            </button>
            {Array.from({ length: pagination.total_pages }, (_, index) => index + 1).map((pageNumber) => (
              <button key={pageNumber} type="button" onClick={() => changePage(pageNumber)} className={`size-10 rounded-full text-sm font-bold transition ${pagination.page === pageNumber ? 'bg-primary text-slate-950' : 'border border-border-soft bg-panel text-white hover:border-primary hover:text-primary'}`} aria-current={pagination.page === pageNumber ? 'page' : undefined} aria-label={`Trang ${pageNumber}`}>
                {pageNumber}
              </button>
            ))}
            <button type="button" onClick={() => changePage(pagination.page + 1)} disabled={pagination.page === pagination.total_pages} className="grid size-10 place-items-center rounded-full border border-border-soft bg-panel text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang sau">
              <ChevronRight className="size-5" />
            </button>
          </nav>
        )}
      </section>
    </div>
  )
}

function Input({ label, value, onChange, className = '', ...props }) {
  const control = (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-12 w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
    />
  )

  if (!label) return control

  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      {control}
    </label>
  )
}

function Select({ label, value, onChange, options, icon: Icon, disabled = false }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={`h-12 w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70 ${Icon ? 'pl-10' : ''}`}
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue || optionLabel} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}

function StatePanel({ message, tone = 'default' }) {
  return (
    <div className={`mb-6 rounded-lg border p-6 text-center ${tone === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-border-soft bg-panel text-muted'}`}>
      {message}
    </div>
  )
}

