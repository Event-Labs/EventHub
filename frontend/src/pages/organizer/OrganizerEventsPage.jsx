import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Edit, RefreshCw } from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerTable,
} from './OrganizerComponents.jsx'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'

const STATUS_LABELS = {
  DRAFT: 'Bản nháp',
  PENDING_REVIEW: 'Đang duyệt',
  PUBLISHED: 'Đã xuất bản',
  HIDDEN: 'Ẩn',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Hoàn thành',
}

const STATUS_TONES = {
  DRAFT: 'gray',
  PENDING_REVIEW: 'blue',
  PUBLISHED: 'green',
  HIDDEN: 'gray',
  CANCELLED: 'red',
  COMPLETED: 'purple',
}

function formatEventDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function OrganizerEventsPage() {
  const location = useLocation()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [message, setMessage] = useState(location.state?.message || '')

  useEffect(() => {
    if (location.state?.message) {
      setMessage(location.state.message)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrganizerEvents()
      setEvents(data)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Không thể tải danh sách sự kiện.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.category_name?.toLowerCase().includes(q)
      const matchStatus = !statusFilter || event.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [events, search, statusFilter])

  return (
    <OrganizerPage
      title="Quản lý sự kiện"
      description="Theo dõi, chỉnh sửa và vận hành các sự kiện của ban tổ chức"
      action="Tạo sự kiện"
      actionTo="/organizer/events/create"
    >
      <div className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            className="h-10 flex-1 rounded-md border border-[#c3c6d7] bg-[#f7f9fb] px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Tìm theo tên sự kiện..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadEvents} className="admin-secondary shrink-0">
            <RefreshCw className="size-4" />
            Làm mới
          </button>
        </div>
      </div>

      {message && (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !filtered.length ? (
        <div className="rounded-md border border-dashed border-[#c3c6d7] py-16 text-center text-sm text-[#737686]">
          {events.length ? 'Không có sự kiện phù hợp bộ lọc.' : 'Chưa có sự kiện nào. Nhấn "Tạo sự kiện" để bắt đầu.'}
        </div>
      ) : (
        <OrganizerTable
          headers={['Sự kiện', 'Ngày diễn ra', 'Trạng thái', 'Danh mục', 'Cập nhật', 'Hành động']}
          rows={filtered.map((event) => [
            <div key="event" className="flex items-center gap-3">
              {event.thumbnail_url ? (
                <img
                  src={event.thumbnail_url}
                  alt=""
                  className="size-10 rounded-md object-cover"
                />
              ) : (
                <span className="grid size-10 place-items-center rounded-md bg-[#dbe1ff] text-primary">
                  <CalendarDays className="size-5" />
                </span>
              )}
              <div>
                <span className="font-bold">{event.title}</span>
                {event.format && (
                  <p className="text-xs text-[#737686]">{event.format}</p>
                )}
              </div>
            </div>,
            formatEventDate(event.start_time),
            <Badge key="status" tone={STATUS_TONES[event.status] || 'gray'}>
              {STATUS_LABELS[event.status] || event.status}
            </Badge>,
            event.category_name || '—',
            formatEventDate(event.updated_at),
            <div key="actions" className="flex items-center gap-3 text-[#737686]">
              <Link
                to={`/organizer/events/${event.id}/edit`}
                className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                title="Chỉnh sửa"
              >
                <Edit className="size-4" />
                Sửa
              </Link>
            </div>,
          ])}
        />
      )}
    </OrganizerPage>
  )
}
