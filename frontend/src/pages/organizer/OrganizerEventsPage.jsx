import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Edit, Globe, RefreshCw, Eye } from 'lucide-react'
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
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/50 bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15">
            <Globe className="size-5 text-success" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-content">Xác nhận xuất bản</h3>
            <p className="mt-1 text-sm text-subtle">
              Sự kiện sẽ hiển thị công khai ngay sau khi xuất bản.
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-border-soft/40 bg-panel-soft p-4">
          <p className="text-sm font-semibold text-content">{event.title}</p>
          <p className="mt-1 text-xs text-subtle">
            Ngày diễn ra: {formatEventDate(event.start_time)}
          </p>
        </div>

        {/* Info note */}
        <div className="mt-4 rounded-xl border border-tertiary/30 bg-tertiary/[0.08] p-3 text-xs text-primary">
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
            className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/50 bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/15">
            <AlertTriangle className="size-5 text-error" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-content">Xác nhận hủy sự kiện</h3>
            <p className="mt-1 text-sm text-subtle">Hành động này không thể hoàn tác.</p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-border-soft/40 bg-panel-soft p-4">
          <p className="text-sm font-semibold text-content">{event.title}</p>
          <p className="mt-1 text-xs text-subtle">
            Ngày diễn ra: {formatEventDate(event.start_time)}
          </p>
          <div className="mt-2">
            <Badge tone={STATUS_TONES[event.status] || 'gray'}>
              {STATUS_LABELS[event.status] || event.status}
            </Badge>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-sm text-warning">
          <p className="font-semibold">⚠️ Lưu ý trước khi hủy:</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
            <li>Sự kiện sẽ bị hủy và không thể khôi phục lại trạng thái xuất bản.</li>
            <li>Nếu đã có đơn hàng thanh toán, hệ thống sẽ từ chối yêu cầu hủy.</li>
            <li>Người tham dự đã đăng ký sẽ không nhận được vé.</li>
          </ul>
        </div>

        {/* API error — hiện trong modal */}
        {error && (
          <div className="mt-4 rounded-xl border border-error/30 bg-error/[0.07] p-3 text-sm text-error">
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
            className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            Giữ lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-error px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-error/80 disabled:cursor-not-allowed disabled:opacity-60"
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
  const toast = useToast()
  const location = useLocation()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Publish modal state
  const [publishTarget, setPublishTarget] = useState(null)
  const [publishLoading, setPublishLoading] = useState(false)

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')

  useEffect(() => {
    if (location.state?.message) {
      toast.success(location.state.message)
      window.history.replaceState({}, document.title)
    }
  }, [location.state, toast])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchOrganizerEvents()
      setEvents(data)
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể tải danh sách sự kiện.'))
    } finally {
      setLoading(false)
    }
  }, [toast])

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
      toast.success(`Sự kiện "${publishTarget.title}" đã được xuất bản thành công.`)
      await loadEvents()
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể xuất bản sự kiện.'))
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
      toast.success(`Sự kiện "${cancelTarget.title}" đã được hủy.`)
      await loadEvents()
    } catch (err) {
      console.error(err)
      const message = getApiMessage(err, 'Không thể hủy sự kiện. Vui lòng thử lại.')
      setCancelError(message)
      toast.error(message)
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
            className="h-10 flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15"
            placeholder="Tìm theo tên sự kiện..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
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

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed border-border-soft/40 py-16 text-center text-sm text-subtle">
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
                <span className="grid size-10 place-items-center rounded-xl bg-tertiary/15 text-primary">
                  <CalendarDays className="size-5" />
                </span>
              )}
              <div>
                <span className="font-bold">{event.title}</span>
                {event.format && <p className="text-xs text-subtle">{event.format}</p>}
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
              {/* Detail */}
              <Link
                to={`/organizer/events/${event.id}`}
                title="Chi tiết"
                className="grid size-8 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:bg-panel-soft/80 hover:text-primary"
              >
                <Eye className="size-4" />
              </Link>
              {/* Edit */}
              <Link
                to={`/organizer/events/${event.id}/edit`}
                title="Chỉnh sửa"
                className="grid size-8 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:bg-panel-soft/80 hover:text-tertiary"
              >
                <Edit className="size-4" />
              </Link>
              {/* Slot cố định cho action chính — luôn chiếm w-20 để các row thẳng hàng */}
              <span className="inline-flex w-20">
                {event.status === 'COMPLETED' && event.approval_status === 'APPROVED' ? (
                  <button
                    type="button"
                    onClick={() => openPublishModal(event)}
                    title="Xuất bản sự kiện"
                    className="h-8 w-full rounded-xl bg-success text-xs font-semibold text-white shadow-sm transition hover:bg-success/80"
                  >
                    Xuất bản
                  </button>
                ) : event.status === 'PUBLISHED' ? (
                  <button
                    type="button"
                    onClick={() => openCancelModal(event)}
                    title="Hủy sự kiện"
                    className="h-8 w-full rounded-xl border border-error/40 bg-error/10 text-xs font-semibold text-error transition hover:bg-error/20"
                  >
                    Hủy
                  </button>
                ) : <span className="h-8 w-full block"></span>}
              </span>
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
