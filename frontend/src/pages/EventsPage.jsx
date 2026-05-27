import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Filter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchEvents, toggleFavorite } from '@/services/events.js'

const SORT_OPTIONS = [
  ['start_time', 'Sắp diễn ra'],
  ['created_at', 'Mới nhất'],
  ['price', 'Giá thấp nhất'],
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
    Object.entries({ ...filters, limit: 12 }).filter(([, value]) => value),
  )
}

export function EventsPage() {
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
  })

  const favoriteMutation = useMutation({
    mutationFn: (event) => toggleFavorite(event.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['favorite-events'] })
    },
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
    if (!localStorage.getItem('eventhub-token')) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    favoriteMutation.mutate(event)
  }

  const events = eventsQuery.data?.items || []
  const pagination = eventsQuery.data?.pagination

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <form className="glass-panel mb-8 rounded-lg p-5" onSubmit={submitFilters}>
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr_1fr_auto]">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-muted">Từ khóa</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral" />
              <input
                value={draft.keyword}
                onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
                placeholder="Tìm sự kiện..."
                className="w-full rounded-md border border-border-soft bg-surface py-3 pl-10 pr-3 text-content outline-none focus:border-primary"
              />
            </div>
          </label>
          <Input
            label="Địa điểm"
            value={draft.location}
            onChange={(value) => setDraft({ ...draft, location: value })}
            placeholder="TP.HCM, Hà Nội..."
          />
          <Input
            label="Từ ngày"
            type="date"
            value={draft.start_date}
            onChange={(value) => setDraft({ ...draft, start_date: value })}
          />
          <button className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 font-bold text-slate-950">
            <Filter className="size-4" />
            Tìm sự kiện
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <Input
            label="Danh mục"
            value={draft.category_slug}
            onChange={(value) => setDraft({ ...draft, category_slug: value })}
            placeholder="music, workshop..."
          />
          <Input
            label="Đến ngày"
            type="date"
            value={draft.end_date}
            onChange={(value) => setDraft({ ...draft, end_date: value })}
          />
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
              onChange={(event) => setDraft({ ...draft, sort_by: event.target.value })}
              className="w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none focus:border-primary"
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={clearFilters}
          className="mt-4 rounded-md border border-border-soft px-4 py-2 text-sm font-bold text-subtle hover:border-primary hover:text-primary"
        >
          Xóa bộ lọc
        </button>
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
      </section>
    </div>
  )
}

function Input({ label, value, onChange, ...props }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none focus:border-primary"
      />
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
