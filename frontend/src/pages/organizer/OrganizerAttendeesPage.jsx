import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchOrganizerAttendees } from '@/services/organizerOrders.js'
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
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')

  // Attendees state
  const [attendees, setAttendees] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(false)
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

  // Load events once
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => {
        setEvents(data || [])
        if (data?.length > 0) setSelectedEventId(data[0].id)
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

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
      const params = { page, limit: 50 }
      if (selectedSessionId) params.sessionId = selectedSessionId
      if (selectedTicketTypeId) params.ticketTypeId = selectedTicketTypeId
      if (selectedStatus) params.status = selectedStatus
      if (search) params.search = search

      const data = await fetchOrganizerAttendees(selectedEventId, params)
      setAttendees(data.items || [])
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, total_pages: 1 })
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách người tham dự.')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, page, selectedSessionId, selectedTicketTypeId, selectedStatus, search])

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

  // Stats from current page data
  const checkedInCount = attendees.filter((a) => a.status === 'USED').length
  const validCount = attendees.filter((a) => a.status === 'VALID').length

  return (
    <OrganizerPage
      title="Người tham dự"
      eyebrow="Vận hành / Người tham dự"
      description="Xem danh sách người tham dự từ vé đã bán cho sự kiện của bạn."
    >
      {/* ── Event selector ── */}
      <OrganizerPanel className="mb-5">
        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-[#737686]">
            <Loader2 className="size-4 animate-spin" />
            Đang tải sự kiện...
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-[#737686]">Bạn chưa có sự kiện nào.</p>
        ) : (
          <label className="block max-w-xl">
            <span className="text-sm font-semibold text-[#434655]">Chọn sự kiện</span>
            <select
              className="mt-2 h-10 w-full rounded-md border border-[#c3c6d7] bg-white px-3 text-sm"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </OrganizerPanel>

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
          <OrganizerPanel className="mb-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              {/* Search */}
              <form className="relative flex-1" onSubmit={handleSearch}>
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
                <input
                  className="h-10 w-full rounded-md border border-[#c3c6d7] bg-[#f7f9fb] pl-10 pr-8 text-sm text-[#191c1e] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Tìm tên, email hoặc mã vé..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737686] hover:text-[#191c1e]"
                    onClick={clearSearch}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </form>

              {/* Session filter */}
              {sessions.length > 0 && (
                <select
                  className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm lg:w-52"
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                >
                  <option value="">Tất cả phiên</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.session_name || new Date(s.start_time).toLocaleDateString('vi-VN')}
                    </option>
                  ))}
                </select>
              )}

              {/* Ticket type filter */}
              {ticketTypes.length > 0 && (
                <select
                  className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm lg:w-44"
                  value={selectedTicketTypeId}
                  onChange={(e) => setSelectedTicketTypeId(e.target.value)}
                >
                  <option value="">Tất cả loại vé</option>
                  {ticketTypes.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Status filter */}
              <select
                className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm lg:w-44"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="admin-secondary flex items-center gap-2"
                onClick={loadAttendees}
                disabled={loading}
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </OrganizerPanel>

          {/* ── Error ── */}
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
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
              <p className="font-bold text-[#565e74]">Không tìm thấy người tham dự nào.</p>
              <p className="mt-1 text-sm text-[#737686]">
                Thử thay đổi bộ lọc hoặc sự kiện khác.
              </p>
            </OrganizerPanel>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#c3c6d7] bg-white">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-[#f2f4f6] text-xs uppercase text-[#5c647a]">
                  <tr>
                    <th className="px-5 py-4 font-bold">Người đặt vé</th>
                    <th className="px-5 py-4 font-bold">Loại vé</th>
                    <th className="px-5 py-4 font-bold">Phiên</th>
                    <th className="px-5 py-4 font-bold">Ghế / Khu vực</th>
                    <th className="px-5 py-4 font-bold">Mã vé</th>
                    <th className="px-5 py-4 font-bold">Trạng thái</th>
                    <th className="px-5 py-4 font-bold">Check-in lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((att) => (
                    <tr
                      key={att.id}
                      className="border-t border-[#e0e3e5] hover:bg-[#f7f9fb]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <AvatarInitials
                            name={att.attendee_name || att.attendee_email || 'A'}
                            className="size-8"
                          />
                          <div>
                            <p className="font-semibold text-[#191c1e]">{att.attendee_name}</p>
                            <p className="text-xs text-[#737686]">{att.attendee_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="blue">{att.ticket_type_name}</Badge>
                      </td>
                      <td className="px-5 py-4 text-[#565e74]">
                        <p className="font-medium">{att.session_name || '—'}</p>
                        <p className="text-xs">{att.venue_name}</p>
                      </td>
                      <td className="px-5 py-4 text-[#565e74]">
                        {att.row_label && att.seat_number
                          ? `${att.row_label}${att.seat_number}`
                          : 'Không có ghế'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs font-bold text-[#191c1e]">
                          {att.ticket_code}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={TICKET_STATUS_TONE[att.status] || 'gray'}
                        >
                          {TICKET_STATUS_LABEL[att.status] || att.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-[#737686]">
                        {formatDateTime(att.checked_in_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ── */}
          {!loading && pagination.total > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-[#434655]">
              <span>
                Hiển thị {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} trong{' '}
                {pagination.total} người tham dự
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="grid size-8 place-items-center rounded-md border border-[#c3c6d7] disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="font-bold">
                  {pagination.page} / {pagination.total_pages}
                </span>
                <button
                  className="grid size-8 place-items-center rounded-md border border-[#c3c6d7] disabled:opacity-40"
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
      ? 'text-green-700'
      : tone === 'blue'
        ? 'text-primary'
        : 'text-[#111827]'

  return (
    <div className="rounded-lg border border-[#e0e3e5] bg-[#f7f9fb] px-4 py-3">
      <p className="text-xs font-bold uppercase text-[#737686]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${valueClass}`}>{value}</p>
    </div>
  )
}
