import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import {
  exportOrganizerAttendees,
  fetchOrganizerAttendees,
} from '@/services/organizerOrders.js'
import {
  AvatarInitials,
  Badge,
  OrganizerPage,
  OrganizerPanel,
} from './OrganizerComponents.jsx'

// ─── Constants ───────────────────────────────────────────────────────────────

const TICKET_STATUSES = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'VALID', label: 'Hợp lệ' },
  { value: 'USED', label: 'Đã check-in' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const TICKET_STATUS_TONE = { VALID: 'blue', USED: 'green', CANCELLED: 'red' }
const TICKET_STATUS_LABEL = { VALID: 'Hợp lệ', USED: 'Đã check-in', CANCELLED: 'Đã hủy' }

function safeFilenamePart(value) {
  return String(value || 'event')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ') || 'event'
}

function getExportFilename(contentDisposition, eventTitle) {
  const fallback = `${safeFilenamePart(eventTitle)}-attendee-list-${new Date().toISOString().slice(0, 10)}.csv`
  if (!contentDisposition) return fallback
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])
  const quotedMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
  return quotedMatch?.[1] || fallback
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerAttendeesPage() {
  const [searchParams] = useSearchParams()
  const initialEventId = searchParams.get('eventId') || ''

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState(initialEventId)

  // Attendees state
  const [attendees, setAttendees] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  // Filters
  const [sessions, setSessions] = useState([])
  const [ticketTypes, setTicketTypes] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const buildAttendeeParams = useCallback((includePagination = true) => {
    const params = includePagination ? { page, limit: 50 } : {}
    if (selectedSessionId) params.sessionId = selectedSessionId
    if (selectedTicketTypeId) params.ticketTypeId = selectedTicketTypeId
    if (selectedStatus) params.status = selectedStatus
    if (search) params.search = search
    return params
  }, [page, selectedSessionId, selectedTicketTypeId, selectedStatus, search])

  // Load events once (only published events)
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => {
        const publishedEvents = (data || []).filter((ev) => ev.status === 'PUBLISHED')
        setEvents(publishedEvents)
        if (!initialEventId && publishedEvents.length > 0) setSelectedEventId(publishedEvents[0].id)
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [initialEventId])

  // Populate session & ticketType dropdowns from selected event
  useEffect(() => {
    if (!selectedEventId) {
      setSessions([])
      setTicketTypes([])
      return
    }
    const ev = events.find((e) => e.id === selectedEventId)
    if (!ev) return

    const allSessions = ev.sessions || []
    setSessions(allSessions)

    const allTicketTypes = ev.ticket_types || []
    setTicketTypes(allTicketTypes)

    // Reset dependent filters
    setSelectedSessionId('')
    setSelectedTicketTypeId('')
    setSearch('')
    setSearchInput('')
    setPage(1)
  }, [selectedEventId, events])

  // Load attendees
  const loadAttendees = useCallback(async () => {
    if (!selectedEventId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrganizerAttendees(selectedEventId, buildAttendeeParams())
      setAttendees(data.items || [])
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, total_pages: 1 })
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách người tham dự.')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, buildAttendeeParams])

  useEffect(() => {
    if (selectedEventId) loadAttendees()
  }, [loadAttendees, selectedEventId])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [selectedSessionId, selectedTicketTypeId, selectedStatus, search])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
  }

  const handleExport = async () => {
    if (!selectedEventId || exporting) return
    setExporting(true)
    setError('')
    try {
      const response = await exportOrganizerAttendees(selectedEventId, buildAttendeeParams(false))
      const selectedEvent = events.find((event) => event.id === selectedEventId)
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = getExportFilename(
        response.headers?.['content-disposition'],
        selectedEvent?.title,
      )
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể xuất danh sách người tham dự.')
    } finally {
      setExporting(false)
    }
  }

  // Stats from current page data
  const checkedInCount = attendees.filter((a) => a.status === 'USED').length
  const validCount = attendees.filter((a) => a.status === 'VALID').length

  return (
    <OrganizerPage
      title="Người tham dự"
      description="Xem danh sách người tham dự từ vé đã bán cho sự kiện của bạn."
    >
      {/* ── Event selector ── */}
      <div className="mb-5">
        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="size-4 animate-spin text-primary" />
            Đang tải sự kiện...
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-subtle">Bạn chưa có sự kiện nào.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="shrink-0 text-base font-bold text-white">Chọn sự kiện</span>
            <div className="relative w-full sm:w-[420px]">
              <select
                className="h-10 w-full appearance-none rounded-xl border border-white/15 bg-[#0d172e] pl-3 pr-9 text-sm font-medium text-white shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#0b1329] text-white">
                    {ev.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
            </div>
          </div>
        )}
      </div>

      {selectedEventId && (
        <>
          {/* ── KPI row ── */}
          {!loading && pagination.total > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Tổng người tham dự" value={pagination.total} />
              <KpiCard label="Trang này: Đã check-in" value={checkedInCount} tone="green" />
              <KpiCard label="Trang này: Chưa check-in" value={validCount} tone="blue" />
              <KpiCard
                label="Tỷ lệ check-in (trang này)"
                value={
                  attendees.length > 0
                    ? `${Math.round((checkedInCount / attendees.length) * 100)}%`
                    : '—'
                }
              />
            </div>
          )}

          {/* ── Filters ── */}
          <div className="mb-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {/* Search */}
              <form className="relative flex-1" onSubmit={handleSearch}>
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white" />
                <input
                  className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] pl-10 pr-8 text-sm font-normal text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-white/50"
                  placeholder="Tìm tên, email hoặc mã vé..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                    onClick={clearSearch}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </form>

              {/* Session filter */}
              {sessions.length > 0 && (
                <select
                  className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white shadow-sm outline-none focus:border-primary lg:w-52"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                >
                  <option value="" className="bg-[#0b1329] text-white">Tất cả phiên</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#0b1329] text-white">
                      {s.session_name || new Date(s.start_time).toLocaleDateString('vi-VN')}
                    </option>
                  ))}
                </select>
              )}

              {/* Ticket type filter */}
              {ticketTypes.length > 0 && (
                <select
                  className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white shadow-sm outline-none focus:border-primary lg:w-44"
                  value={selectedTicketTypeId}
                  onChange={(e) => setSelectedTicketTypeId(e.target.value)}
                >
                  <option value="" className="bg-[#0b1329] text-white">Tất cả loại vé</option>
                  {ticketTypes.map((tt) => (
                    <option key={tt.id} value={tt.id} className="bg-[#0b1329] text-white">
                      {tt.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Status filter */}
              <select
                className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white shadow-sm outline-none focus:border-primary lg:w-44"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#0b1329] text-white">
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="org-btn-primary flex items-center gap-2"
                onClick={handleExport}
                disabled={exporting || loading}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span>Xuất danh sách</span>
              </button>

              <button
                type="button"
                className="org-btn-secondary flex items-center gap-2"
                onClick={loadAttendees}
                disabled={loading}
                title="Làm mới"
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
              {error}
            </div>
          )}

          {/* ── Table ── */}
          {loading ? (
            <OrganizerPanel className="flex items-center justify-center py-16">
              <Loader2 className="size-7 animate-spin text-primary" />
            </OrganizerPanel>
          ) : attendees.length === 0 ? (
            <OrganizerPanel className="py-14 text-center">
              <p className="font-bold text-content">Không tìm thấy người tham dự nào.</p>
              <p className="mt-1 text-sm text-subtle">
                Thử thay đổi bộ lọc hoặc sự kiện khác.
              </p>
            </OrganizerPanel>
          ) : (
            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Người đặt vé</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Loại vé</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Phiên</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Ghế / Khu vực</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Mã vé</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Trạng thái</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Check-in lúc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                    {attendees.map((att) => (
                      <tr
                        key={att.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-3.5 py-3">
                          <div className="flex items-center gap-3">
                            <AvatarInitials
                              name={att.attendee_name || att.attendee_email || 'A'}
                              src={att.attendee_avatar_url}
                              className="size-8 shrink-0 animate-pulse-slow"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-content">{att.attendee_name}</p>
                              <p className="truncate text-xs text-subtle">{att.attendee_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <Badge tone="blue">{att.ticket_type_name}</Badge>
                        </td>
                        <td className="px-3.5 py-3 text-subtle">
                          <p className="text-sm font-semibold text-content">{att.session_name || '—'}</p>
                          <p className="text-xs mt-0.5">{att.venue_name}</p>
                        </td>
                        <td className="px-3.5 py-3 text-subtle text-sm whitespace-nowrap">
                          {att.row_label && att.seat_number
                            ? `${att.row_label}${att.seat_number}`
                            : 'Không có ghế'}
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <span className="font-mono text-sm font-bold text-content">
                            {att.ticket_code}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <Badge
                            tone={TICKET_STATUS_TONE[att.status] || 'gray'}
                          >
                            {TICKET_STATUS_LABEL[att.status] || att.status}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-3 text-subtle text-sm whitespace-nowrap">
                          {formatDateTime(att.checked_in_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Pagination ── */}
          {!loading && pagination.total > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-subtle">
              <span>
                Hiển thị {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} trong{' '}
                {pagination.total} người tham dự
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="grid size-8 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:text-tertiary disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="font-bold text-content">
                  {pagination.page} / {pagination.total_pages}
                </span>
                <button
                  className="grid size-8 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:text-tertiary disabled:opacity-40"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </OrganizerPage>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, tone }) {
  const valueClass =
    tone === 'green'
      ? 'text-success'
      : tone === 'blue'
        ? 'text-primary'
        : 'text-content'

  return (
    <div className="rounded-xl border border-border-soft/30 bg-panel-soft px-4 py-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-display font-extrabold ${valueClass}`}>{value}</p>
    </div>
  )
}
