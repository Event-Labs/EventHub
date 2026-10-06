import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Edit, Eye, Globe, Plus, RefreshCw, Search, X } from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerTable,
  TableActionButton,
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
  PENDING_REVIEW: 'Chờ duyệt',
  PUBLISHED: 'Đã xuất bản',
  HIDDEN: 'Đã ẩn',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Đã kết thúc',
}

const STATUS_TONES = {
  DRAFT: 'gray',
  PENDING_REVIEW: 'amber',
  PUBLISHED: 'green',
  HIDDEN: 'gray',
  CANCELLED: 'gray',
  COMPLETED: 'green',
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15">
            <Globe className="size-5 text-success" />
          </span>
          <div>
            <h3 className="text-xl font-black text-white">Xác nhận xuất bản</h3>
            <p className="mt-1 text-sm text-slate-300">
              Sự kiện sẽ hiển thị công khai ngay sau khi xuất bản.
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/15">
            <AlertTriangle className="size-5 text-error" />
          </span>
          <div>
            <h3 className="text-xl font-black text-white">Xác nhận hủy sự kiện</h3>
            <p className="mt-1 text-sm text-slate-300">Hành động này không thể hoàn tác.</p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
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
  const navigate = useNavigate()
  const handledToastLocations = useRef(new Set())
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

  const toastShownRef = useRef('')

  useEffect(() => {
    if (location.state?.message && toastShownRef.current !== location.key) {
      toast.success(location.state.message)
      toastShownRef.current = location.key
      window.history.replaceState({}, document.title)
    }
  }, [location.state, location.key, toast])
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
      title="Quản lý Sự kiện"
      description="Theo dõi, chỉnh sửa và vận hành các sự kiện của ban tổ chức"
      action="Tạo sự kiện"
      actionTo="/organizer/events/create"
    >
      <div className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white" />
            <input
              className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] pl-10 pr-8 text-sm font-normal text-white outline-none placeholder:text-white/50 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Tìm theo tên sự kiện..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                onClick={() => setSearch('')}
                title="Xóa tìm kiếm"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <select
            className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white shadow-sm outline-none focus:border-primary"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="" className="bg-[#0b1329] text-white">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-[#0b1329] text-white">
                {label}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadEvents} className="org-btn-secondary shrink-0">
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed border-border-soft/40 py-16 text-center text-sm text-subtle flex flex-col items-center justify-center gap-4">
          <p>
            {events.length
              ? 'Không có sự kiện phù hợp bộ lọc.'
              : 'Chưa có sự kiện nào. Nhấn "Tạo sự kiện" để bắt đầu.'}
          </p>
          {!events.length && (
            <Link to="/organizer/events/create" className="org-btn-primary">
              <Plus className="size-4" />
              Tạo sự kiện
            </Link>
          )}
        </div>
      ) : (
        <OrganizerTable
          headers={['Sự kiện', 'Ngày diễn ra', 'Trạng thái', 'Danh mục', 'Cập nhật', 'Thao tác']}
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
              <div className="min-w-0">
                <span className="font-bold text-[13px] text-white block hover:text-primary transition leading-snug">{event.title}</span>
                {event.format && <p className="text-[11px] text-subtle mt-0.5">{event.format}</p>}
              </div>
            </div>,

            <span key="date" className="whitespace-nowrap">{formatEventDate(event.start_time)}</span>,

            <Badge key="status" tone={STATUS_TONES[event.status] || 'gray'}>
              {STATUS_LABELS[event.status] || event.status}
            </Badge>,

            <span key="cat" className="whitespace-nowrap">{event.category_name || '—'}</span>,

            <span key="updated" className="whitespace-nowrap">{formatEventDate(event.updated_at)}</span>,

            /* Actions */
            <div key="actions" className="flex items-center gap-2 whitespace-nowrap">
              <TableActionButton
                to={`/organizer/events/${event.id}`}
                title="Xem chi tiết"
                icon={Eye}
                tone="default"
              />
              <TableActionButton
                to={`/organizer/events/${event.id}/edit`}
                title="Chỉnh sửa sự kiện"
                icon={Edit}
                tone="primary"
              />
              {event.status === 'COMPLETED' && event.approval_status === 'APPROVED' ? (
                <TableActionButton
                  onClick={() => openPublishModal(event)}
                  title="Xuất bản sự kiện"
                  icon={Globe}
                  tone="success"
                />
              ) : event.status === 'PUBLISHED' ? (
                <TableActionButton
                  onClick={() => openCancelModal(event)}
                  title="Hủy sự kiện"
                  icon={AlertTriangle}
                  tone="danger"
                />
              ) : (
                <span className="size-8 block" />
              )}
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
