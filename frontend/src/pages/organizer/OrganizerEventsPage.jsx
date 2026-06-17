import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Edit, Globe, RefreshCw, XCircle } from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerTable,
} from './OrganizerComponents.jsx'
import {
  cancelOrganizerEvent,
  fetchOrganizerEvents,
  publishOrganizerEvent,
} from '@/services/organizerEvents.js'

const STATUS_LABELS = {
  DRAFT: 'Bản nháp',
  PENDING_REVIEW: 'Đang duyệt',
  PUBLISHED: 'Đã xuất bản',
  HIDDEN: 'Ẩn',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Đã duyệt',
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

// ---------------------------------------------------------------------------
// Publish Confirm Modal
// ---------------------------------------------------------------------------
function PublishConfirmModal({ event, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-green-100">
            <Globe className="size-5 text-green-600" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-[#111827]">Xác nhận xuất bản</h3>
            <p className="mt-1 text-sm text-[#737686]">
              Sự kiện sẽ hiển thị công khai ngay sau khi xuất bản.
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <p className="text-sm font-semibold text-[#111827]">{event.title}</p>
          <p className="mt-1 text-xs text-[#737686]">
            Ngày diễn ra: {formatEventDate(event.start_time)}
          </p>
        </div>

        {/* Info note */}
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <ul className="list-inside list-disc space-y-1">
            <li>Sự kiện sẽ xuất hiện trong danh sách tìm kiếm và trang chủ.</li>
            <li>Người dùng có thể mua vé ngay sau khi xuất bản.</li>
            <li>Bạn vẫn có thể chỉnh sửa thông tin sau khi xuất bản.</li>
          </ul>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-[#c3c6d7] px-4 py-2.5 text-sm font-semibold text-[#434655] transition hover:bg-[#f2f4f6] disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Đang xuất bản...
              </span>
            ) : (
              'Xuất bản ngay'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cancel Confirm Modal
// ---------------------------------------------------------------------------
function CancelConfirmModal({ event, onConfirm, onClose, loading, error }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-100">
            <AlertTriangle className="size-5 text-red-600" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-[#111827]">Xác nhận hủy sự kiện</h3>
            <p className="mt-1 text-sm text-[#737686]">Hành động này không thể hoàn tác.</p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <p className="text-sm font-semibold text-[#111827]">{event.title}</p>
          <p className="mt-1 text-xs text-[#737686]">
            Ngày diễn ra: {formatEventDate(event.start_time)}
          </p>
          <div className="mt-2">
            <Badge tone={STATUS_TONES[event.status] || 'gray'}>
              {STATUS_LABELS[event.status] || event.status}
            </Badge>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">⚠️ Lưu ý trước khi hủy:</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
            <li>Sự kiện sẽ bị hủy và không thể khôi phục lại trạng thái xuất bản.</li>
            <li>Nếu đã có đơn hàng thanh toán, hệ thống sẽ từ chối yêu cầu hủy.</li>
            <li>Người tham dự đã đăng ký sẽ không nhận được vé.</li>
          </ul>
        </div>

        {/* API error — hiện trong modal */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-semibold">Không thể hủy sự kiện:</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-[#c3c6d7] px-4 py-2.5 text-sm font-semibold text-[#434655] transition hover:bg-[#f2f4f6] disabled:opacity-50"
          >
            Giữ lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Đang hủy...
              </span>
            ) : (
              'Xác nhận hủy'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export function OrganizerEventsPage() {
  const location = useLocation()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [message, setMessage] = useState(location.state?.message || '')

  // Publish modal state
  const [publishTarget, setPublishTarget] = useState(null)
  const [publishLoading, setPublishLoading] = useState(false)

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')

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

  // ---- Publish handlers ----
  const openPublishModal = (event) => setPublishTarget(event)

  const closePublishModal = () => {
    if (publishLoading) return
    setPublishTarget(null)
  }

  const confirmPublish = async () => {
    if (!publishTarget || publishLoading) return
    setPublishLoading(true)
    try {
      await publishOrganizerEvent(publishTarget.id)
      setPublishTarget(null)
      setMessage(`Sự kiện "${publishTarget.title}" đã được xuất bản thành công!`)
      await loadEvents()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Không thể xuất bản sự kiện.')
      setPublishTarget(null)
    } finally {
      setPublishLoading(false)
    }
  }

  // ---- Cancel handlers ----
  const openCancelModal = (event) => {
    setCancelTarget(event)
    setCancelError('')
  }

  const closeCancelModal = () => {
    if (cancelLoading) return
    setCancelTarget(null)
    setCancelError('')
  }

  const confirmCancel = async () => {
    if (!cancelTarget || cancelLoading) return
    setCancelLoading(true)
    setCancelError('')
    try {
      await cancelOrganizerEvent(cancelTarget.id)
      setCancelTarget(null)
      setMessage(`Sự kiện "${cancelTarget.title}" đã được hủy.`)
      await loadEvents()
    } catch (err) {
      console.error(err)
      setCancelError(err.response?.data?.message || 'Không thể hủy sự kiện. Vui lòng thử lại.')
    } finally {
      setCancelLoading(false)
    }
  }

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
          {events.length
            ? 'Không có sự kiện phù hợp bộ lọc.'
            : 'Chưa có sự kiện nào. Nhấn "Tạo sự kiện" để bắt đầu.'}
        </div>
      ) : (
        <OrganizerTable
          headers={['Sự kiện', 'Ngày diễn ra', 'Trạng thái', 'Danh mục', 'Cập nhật', 'Hành động']}
          rows={filtered.map((event) => [
            /* Thumbnail + title */
            <div key="event" className="flex items-center gap-3">
              {event.thumbnail_url ? (
                <img src={event.thumbnail_url} alt="" className="size-10 rounded-md object-cover" />
              ) : (
                <span className="grid size-10 place-items-center rounded-md bg-[#dbe1ff] text-primary">
                  <CalendarDays className="size-5" />
                </span>
              )}
              <div>
                <span className="font-bold">{event.title}</span>
                {event.format && <p className="text-xs text-[#737686]">{event.format}</p>}
              </div>
            </div>,

            formatEventDate(event.start_time),

            <Badge key="status" tone={STATUS_TONES[event.status] || 'gray'}>
              {STATUS_LABELS[event.status] || event.status}
            </Badge>,

            event.category_name || '—',

            formatEventDate(event.updated_at),

            /* Actions */
            <div key="actions" className="flex items-center gap-2">
              {/* Slot cố định cho action chính — luôn chiếm w-20 để các row thẳng hàng */}
              <span className="inline-flex w-20">
                {event.status === 'COMPLETED' && event.approval_status === 'APPROVED' ? (
                  <button
                    type="button"
                    onClick={() => openPublishModal(event)}
                    title="Xuất bản sự kiện"
                    className="h-8 w-full rounded-md bg-green-600 text-xs font-semibold text-white shadow-sm transition hover:bg-green-700"
                  >
                    Xuất bản
                  </button>
                ) : event.status === 'PUBLISHED' ? (
                  <button
                    type="button"
                    onClick={() => openCancelModal(event)}
                    title="Hủy sự kiện"
                    className="h-8 w-full rounded-md border border-red-300 bg-white text-xs font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    Hủy
                  </button>
                ) : null}
              </span>

              {/* Edit */}
              <Link
                to={`/organizer/events/${event.id}/edit`}
                title="Chỉnh sửa"
                className="inline-flex h-8 w-16 items-center justify-center gap-1.5 rounded-md border border-[#c3c6d7] bg-white text-xs font-semibold text-primary transition hover:border-primary hover:bg-[#f1fbff]"
              >
                <Edit className="size-3.5 shrink-0" />
                Sửa
              </Link>
            </div>,
          ])}
        />
      )}

      {/* Publish confirm modal */}
      {publishTarget && (
        <PublishConfirmModal
          event={publishTarget}
          onConfirm={confirmPublish}
          onClose={closePublishModal}
          loading={publishLoading}
        />
      )}

      {/* Cancel confirm modal */}
      {cancelTarget && (
        <CancelConfirmModal
          event={cancelTarget}
          onConfirm={confirmCancel}
          onClose={closeCancelModal}
          loading={cancelLoading}
          error={cancelError}
        />
      )}
    </OrganizerPage>
  )
}
