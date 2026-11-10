import { getAuthToken } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Filter, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchEventCategories, fetchEvents, toggleFavorite } from '@/services/events.js'
import { getApiMessage } from '@/lib/messages.js'
import { optimisticallySetFavorite, refreshFavoriteQueries, restoreFavoriteSnapshots } from '@/lib/favoriteCache.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { getCategoryName } from '@/i18n/categoryNames.js'

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
  const { isEnglish, t } = useLanguage()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const [draft, setDraft] = useState(filters)

  const sortOptions = useMemo(() => [
    ['start_time', isEnglish ? 'Upcoming' : 'Sắp diễn ra'],
    ['created_at', isEnglish ? 'Newest' : 'Mới nhất'],
    ['price', isEnglish ? 'Lowest Price' : 'Giá thấp nhất'],
  ], [isEnglish])

  const locationOptions = useMemo(() => [
    ['', isEnglish ? 'All Locations' : 'Tất cả địa điểm'],
    ['Thành phố Hồ Chí Minh', isEnglish ? 'Ho Chi Minh City' : 'TP. Hồ Chí Minh'],
    ['Hà Nội', isEnglish ? 'Hanoi' : 'Hà Nội'],
    ['Đà Nẵng', isEnglish ? 'Da Nang' : 'Đà Nẵng'],
    ['Đà Lạt', isEnglish ? 'Da Lat' : 'Đà Lạt'],
  ], [isEnglish])

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
    onSuccess: (data, event) => {
      if (data && typeof data.is_favorited === 'boolean') {
        optimisticallySetFavorite(queryClient, event, data.is_favorited)
      }
    },
    onError: (err, _event, context) => {
      restoreFavoriteSnapshots(queryClient, context?.snapshots)
      toast.error(getApiMessage(err, 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt y\u00eau th\u00edch. Vui l\u00f2ng th\u1eed l\u1ea1i.'))
    },
    onSettled: () => refreshFavoriteQueries(queryClient),
  })

  const [showFilters, setShowFilters] = useState(false)

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (draft.location) count++
    if (draft.category_slug) count++
    if (draft.start_date || draft.end_date) count++
    if (draft.min_price || draft.max_price) count++
    if (draft.sort_by && draft.sort_by !== 'start_time') count++
    return count
  }, [draft])

  // Automatically expand filters if user landed with specific filter parameters
  useEffect(() => {
    if (activeFilterCount > 0) {
      setShowFilters(true)
    }
  }, []) // only on mount

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
      toast.error(isEnglish ? 'Please sign in to save favorite events.' : 'Vui lòng đăng nhập để lưu sự kiện yêu thích.')
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
    <div className="mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-8 sm:pb-12">
      <form
        className="relative z-10 mb-6 sm:mb-8 transition-all"
        onSubmit={(e) => {
          submitFilters(e)
        }}
      >
        {/* Always-visible Search Bar with Filter Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-white/50" />
            <input
              value={draft.keyword}
              onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
              placeholder={isEnglish ? 'Search events, categories, venues...' : 'Tìm kiếm sự kiện, danh mục, địa điểm...'}
              className="h-11 sm:h-12 w-full rounded-full border border-white/15 bg-[#0d172e] py-2.5 pl-12 pr-5 text-sm font-normal text-white placeholder:text-white/40 outline-none transition focus:border-[#C99A47] focus:ring-2 focus:ring-[#C99A47]/20 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              className="btn-gold-primary inline-flex h-11 sm:h-12 flex-1 sm:flex-none items-center justify-center gap-2 rounded-full px-6 sm:px-8 text-xs sm:text-sm font-extrabold shadow-lg shadow-[#C99A47]/30 transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
              style={{
                backgroundColor: '#C99A47',
                backgroundImage: 'linear-gradient(135deg, #C99A47, #E6C17A)',
                color: '#0D1B2A',
                opacity: 1,
                visibility: 'visible',
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
              }}
            >
              <Search className="size-4 shrink-0 stroke-[2.5] text-[#0D1B2A]" />
              <span className="font-extrabold text-[#0D1B2A]">{isEnglish ? 'Search' : 'Tìm kiếm'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`grid size-11 sm:size-12 place-items-center rounded-full border transition-all cursor-pointer relative shrink-0 ${showFilters || activeFilterCount > 0
                ? 'border-[#E6C17A] bg-[#C99A47]/20 text-[#E6C17A] shadow-[0_0_15px_rgba(201,154,71,0.25)]'
                : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10'
                }`}
              title={isEnglish ? 'Filter' : 'Bộ lọc'}
              aria-label={isEnglish ? 'Filter' : 'Bộ lọc'}
            >
              <Filter className="size-4.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-[#E6C17A] text-[10px] font-black text-[#0D1B2A] shadow">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="grid size-11 sm:size-12 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:border-white/20 transition-all cursor-pointer shrink-0"
                title={isEnglish ? 'Clear Filter' : 'Xóa bộ lọc'}
              >
                <RotateCcw className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Detailed Filter Panel */}
        {showFilters && (
          <div className="glass-panel mt-4 rounded-2xl border border-white/15 p-4 sm:p-6 shadow-[0_18px_60px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid items-end gap-3.5 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label={isEnglish ? 'Location' : 'Địa điểm'}
                value={draft.location}
                onChange={(value) => setDraft({ ...draft, location: value })}
                options={locationOptions}
              />

              <Select
                label={isEnglish ? 'Category' : 'Danh mục'}
                value={draft.category_slug}
                onChange={(value) => setDraft({ ...draft, category_slug: value })}
                options={[
                  ['', categoriesQuery.isLoading ? (isEnglish ? 'Loading categories...' : 'Đang tải danh mục...') : (isEnglish ? 'All Categories' : 'Tất cả danh mục')],
                  ...categories.map((category) => [category.slug, getCategoryName(category, isEnglish)]),
                ]}
                disabled={categoriesQuery.isLoading}
              />

              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-white">
                  {isEnglish ? 'Event Date Range' : 'Khoảng ngày diễn ra'}
                </span>
                <div className="grid gap-2 grid-cols-2">
                  <Input
                    type="date"
                    value={draft.start_date}
                    onChange={(value) => setDraft({ ...draft, start_date: value })}
                    placeholder="dd/mm/yyyy"
                    aria-label={isEnglish ? 'From date' : 'Từ ngày'}
                  />
                  <Input
                    type="date"
                    value={draft.end_date}
                    onChange={(value) => setDraft({ ...draft, end_date: value })}
                    placeholder="dd/mm/yyyy"
                    aria-label={isEnglish ? 'To date' : 'Đến ngày'}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs sm:text-sm font-semibold text-white">{isEnglish ? 'Price Range (VND)' : 'Khoảng giá (VNĐ)'}</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder={isEnglish ? 'Min price...' : 'Giá từ...'}
                    value={draft.min_price}
                    onChange={(value) => setDraft({ ...draft, min_price: value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder={isEnglish ? 'Max price...' : 'Đến giá...'}
                    value={draft.max_price}
                    onChange={(value) => setDraft({ ...draft, max_price: value })}
                  />
                </div>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-xs sm:text-sm font-semibold text-white">{isEnglish ? 'Sort By' : 'Sắp xếp theo'}</span>
                <select
                  value={draft.sort_by}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      sort_by: event.target.value,
                      sort_order: event.target.value === 'created_at' ? 'desc' : 'asc',
                    })
                  }
                  className="h-11 sm:h-12 w-full rounded-md border border-white/15 bg-[#0d172e] p-2.5 text-sm text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {sortOptions.map(([value, label]) => (
                    <option key={value} value={value} className="bg-[#0d172e] text-white">
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Action Buttons inside Expanded Panel */}
              <div className="grid grid-cols-2 items-center gap-2 sm:gap-3 pt-2 sm:pt-0">
                <button
                  type="submit"
                  className="inline-flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl px-3 sm:px-4 text-xs sm:text-sm font-bold transition-all hover:brightness-110 active:scale-95 cursor-pointer shadow-md shadow-[#C99A47]/20"
                  style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
                >
                  {isEnglish ? 'Apply Filters' : 'Áp dụng bộ lọc'}
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-11 sm:h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 sm:px-4 text-xs sm:text-sm font-bold text-slate-300 hover:text-white hover:border-white/30 transition-all cursor-pointer"
                >
                  {isEnglish ? 'Clear' : 'Xóa lọc'}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>

      <section>
        <SectionHeader
          title={isEnglish ? 'Events List' : 'Danh sách Sự kiện'}
          description={pagination ? (isEnglish ? `${pagination.total} matching events` : `${pagination.total} sự kiện phù hợp`) : (isEnglish ? 'Loading events...' : 'Đang tải sự kiện')}
        />

        {eventsQuery.isLoading && (
          <StatePanel message={isEnglish ? 'Loading event list...' : 'Đang tải danh sách sự kiện...'} />
        )}
        {eventsQuery.isError && (
          <StatePanel message={isEnglish ? 'Failed to load events. Please try again.' : 'Không thể tải sự kiện. Vui lòng thử lại.'} tone="error" />
        )}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
          <StatePanel message={isEnglish ? 'No events match the current filters.' : 'Không có sự kiện phù hợp với bộ lọc hiện tại.'} />
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
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label={isEnglish ? 'Event pagination' : 'Phân trang sự kiện'}>
            <button type="button" onClick={() => changePage(pagination.page - 1)} disabled={pagination.page === 1} className="grid size-10 place-items-center rounded-full border border-border-soft bg-panel text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label={isEnglish ? 'Previous page' : 'Trang trước'}>
              <ChevronLeft className="size-5" />
            </button>
            {Array.from({ length: pagination.total_pages }, (_, index) => index + 1).map((pageNumber) => (
              <button key={pageNumber} type="button" onClick={() => changePage(pageNumber)} className={`size-10 rounded-full text-sm font-bold transition ${pagination.page === pageNumber ? 'bg-primary text-slate-950' : 'border border-border-soft bg-panel text-white hover:border-primary hover:text-primary'}`} aria-current={pagination.page === pageNumber ? 'page' : undefined} aria-label={isEnglish ? `Page ${pageNumber}` : `Trang ${pageNumber}`}>
                {pageNumber}
              </button>
            ))}
            <button type="button" onClick={() => changePage(pagination.page + 1)} disabled={pagination.page === pagination.total_pages} className="grid size-10 place-items-center rounded-full border border-border-soft bg-panel text-white transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40" aria-label={isEnglish ? 'Next page' : 'Trang sau'}>
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
      className={`h-12 w-full rounded-md border border-border-soft bg-surface p-3 text-content [color-scheme:dark] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
    />
  )

  if (!label) return control

  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-base font-semibold text-white">{label}</span>
      {control}
    </label>
  )
}

function Select({ label, value, onChange, options, icon: Icon, disabled = false }) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-base font-semibold text-white">{label}</span>
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

