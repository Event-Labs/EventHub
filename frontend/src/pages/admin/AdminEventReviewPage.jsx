import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, CheckCircle2, Eye, EyeOff, MapPin, Tag, Ticket, XCircle } from 'lucide-react'
import { useState } from 'react'

import { fetchAdminEvents, hideAdminEvent, reviewAdminEvent, unhideAdminEvent } from '@/services/adminEvents.js'
import { Badge, ImagePlaceholder, Insight, Page, Panel, Table } from './AdminComponents.jsx'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const STATUS_TABS = [
  { label: 'Chờ duyệt', value: 'PENDING_REVIEW' },
  { label: 'Đã duyệt', value: 'PUBLISHED' },
  { label: 'Từ chối', value: 'REJECTED' },
  { label: 'Đã ẩn', value: 'HIDDEN' },
]

/**
 * Both REJECTED and HIDDEN events share status='HIDDEN' in the DB.
 * Distinguish them via approval_status:
 *   HIDDEN + approval_status=REJECTED → event failed admin review ("Từ chối")
 *   HIDDEN + approval_status=APPROVED → event was published then hidden for violations ("Đã ẩn")
 */
function statusBadge(status, approvalStatus) {
  if (status === 'HIDDEN') {
    return approvalStatus === 'REJECTED'
      ? <Badge tone="purple">Từ chối</Badge>
      : <Badge tone="gray">Đã ẩn</Badge>
  }
  const map = {
    PENDING_REVIEW: { tone: 'blue', label: 'Chờ duyệt' },
    PUBLISHED: { tone: 'green', label: 'Đã duyệt' },
    CANCELLED: { tone: 'gray', label: 'Đã huỷ' },
    COMPLETED: { tone: 'green', label: 'Đã kết thúc' },
  }
  const cfg = map[status] ?? { tone: 'gray', label: status }
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export function AdminEventReviewPage() {
  const queryClient = useQueryClient()

  const [activeStatus, setActiveStatus] = useState('PENDING_REVIEW')
  const [page, setPage] = useState(1)

  // Per-row note state: { [eventId]: string }
  const [notes, setNotes] = useState({})

  // Detail modal state
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [modalNote, setModalNote] = useState('')
  const [modalError, setModalError] = useState('')

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  const queryKey = ['admin-events', activeStatus, page]

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchAdminEvents({ status: activeStatus, page, limit: 20 }),
    keepPreviousData: true,
  })

  const items = data?.items ?? []
  const pagination = data?.pagination ?? {}

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-events'] })

  const reviewMutation = useMutation({
    mutationFn: ({ eventId, payload }) => reviewAdminEvent(eventId, payload),
    onSuccess: () => {
      closeModal()
      invalidate()
    },
    onError: (err) => {
      const apiMsg = err.response?.data?.message
      const zodErrors = err.response?.data?.errors
      if (zodErrors?.length) {
        setModalError(zodErrors.map((e) => e.message).join(', '))
      } else {
        setModalError(apiMsg || 'Không thể thực hiện thao tác.')
      }
    },
  })

  const hideMutation = useMutation({
    mutationFn: ({ eventId, payload }) => hideAdminEvent(eventId, payload),
    onSuccess: () => { closeModal(); invalidate() },
    onError: (err) => {
      const apiMsg = err.response?.data?.message
      setModalError(apiMsg || 'Không thể ẩn sự kiện.')
    },
  })

  const unhideMutation = useMutation({
    mutationFn: ({ eventId }) => unhideAdminEvent(eventId),
    onSuccess: () => { closeModal(); invalidate() },
    onError: (err) => {
      const apiMsg = err.response?.data?.message
      setModalError(apiMsg || 'Không thể bỏ ẩn sự kiện.')
    },
  })

  const isMutating = reviewMutation.isPending || hideMutation.isPending || unhideMutation.isPending

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const openModal = (event) => {
    setSelectedEvent(event)
    setModalNote(notes[event.id] ?? '')
    setModalError('')
  }

  const closeModal = () => {
    setSelectedEvent(null)
    setModalNote('')
    setModalError('')
  }

  /** Quick approve/reject directly from table row (note from inline input) */
  const quickReview = (eventId, status) => {
    const note = (notes[eventId] ?? '').trim() || null
    reviewMutation.mutate({ eventId, payload: { status, review_note: note } })
  }

  /** Quick hide directly from table row */
  const quickHide = (eventId) => {
    const note = (notes[eventId] ?? '').trim() || null
    hideMutation.mutate({ eventId, payload: { hide_note: note } })
  }

  /** Quick unhide directly from table row */
  const quickUnhide = (eventId) => {
    unhideMutation.mutate({ eventId })
  }

  /** Modal submit */
  const submitModalReview = (status) => {
    if (!selectedEvent) return
    reviewMutation.mutate({
      eventId: selectedEvent.id,
      payload: { status, review_note: modalNote.trim() || null },
    })
  }

  const submitModalHide = () => {
    if (!selectedEvent) return
    hideMutation.mutate({
      eventId: selectedEvent.id,
      payload: { hide_note: modalNote.trim() || null },
    })
  }

  const submitModalUnhide = () => {
    if (!selectedEvent) return
    unhideMutation.mutate({ eventId: selectedEvent.id })
  }

  const setNote = (eventId, value) =>
    setNotes((prev) => ({ ...prev, [eventId]: value }))

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Page
      title="Duyệt sự kiện"
      description="Kiểm duyệt và phê duyệt các sự kiện được gửi bởi Organizer."
    >
      {/* Status tab filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setActiveStatus(tab.value); setPage(1) }}
            className={`inline-flex min-w-28 items-center justify-center rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 ${
              activeStatus === tab.value
                ? 'bg-tertiary text-white shadow-tertiary/20'
                : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:bg-surface hover:text-content'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI Insight */}
      <Insight
        title="AI Assistant"
        text="Các sự kiện đang ở trạng thái PENDING_REVIEW. Vui lòng ưu tiên duyệt/ẩn theo ghi chú đánh giá. Khi từ chối, hãy điền ghi chú rõ ràng để Organizer biết cần chỉnh sửa gì."
      />

      {/* States */}
      {isLoading && (
        <Panel className="mt-5 text-sm text-subtle">Đang tải danh sách sự kiện...</Panel>
      )}
      {isError && (
        <Panel className="mt-5 text-sm text-error">Không thể tải danh sách sự kiện.</Panel>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <Panel className="mt-5 text-sm text-subtle">
          Không có sự kiện nào ở trạng thái này.
        </Panel>
      )}

      {/* Table */}
      {!isLoading && !isError && items.length > 0 && (
        <>
          <div className="mt-5">
            <Table
              headers={[
                'Ảnh',
                'Tên sự kiện',
                'Organizer',
                'Ngày diễn ra',
                'Ngày gửi',
                'Trạng thái',
                'Thao tác',
              ]}
              rows={items.map((event) => [
                /* Thumbnail */
                event.thumbnail_url ? (
                  <img
                    key="img"
                    src={event.thumbnail_url}
                    alt={event.title}
                    className="h-12 w-20 rounded-xl object-cover border border-border-soft/30"
                  />
                ) : (
                  <ImagePlaceholder key="img" label="Event" />
                ),

                /* Event name */
                <div key="name">
                  <p className="max-w-[200px] truncate font-semibold text-content">
                    {event.title}
                  </p>
                  <p className="text-xs text-subtle">{event.slug}</p>
                </div>,

                /* Organizer */
                <span key="org" className="text-sm text-subtle">
                  {event.organizer_name || '—'}
                </span>,

                /* Event date */
                <span key="date" className="text-sm text-subtle">
                  {formatDate(event.start_time)}
                </span>,

                /* Submitted date */
                <span key="sub" className="text-sm text-subtle">
                  {formatDate(event.created_at)}
                </span>,

                /* Status badge */
                <span key="status">{statusBadge(event.status, event.approval_status)}</span>,

                /* Actions */
                <div key="actions" className="flex flex-col gap-2">
                  <input
                    className="h-9 rounded-xl border border-border-soft/40 bg-panel-soft px-2 text-xs text-content outline-none focus:border-primary"
                    placeholder="Ghi chú (tuỳ chọn)"
                    value={notes[event.id] ?? ''}
                    onChange={(e) => setNote(event.id, e.target.value)}
                  />
                  <div className="flex items-center gap-1.5">
                    {/* Approve — only for PENDING_REVIEW */}
                    {event.status === 'PENDING_REVIEW' && (
                      <ActionButton
                        title="Phê duyệt"
                        color="green"
                        icon={<CheckCircle2 className="size-4" />}
                        onClick={() => quickReview(event.id, 'APPROVED')}
                        disabled={isMutating}
                      />
                    )}
                    {/* Reject — only for PENDING_REVIEW */}
                    {event.status === 'PENDING_REVIEW' && (
                      <ActionButton
                        title="Từ chối"
                        color="red"
                        icon={<XCircle className="size-4" />}
                        onClick={() => quickReview(event.id, 'REJECTED')}
                        disabled={isMutating}
                      />
                    )}
                    {/* Hide — only for PUBLISHED */}
                    {event.status === 'PUBLISHED' && (
                      <ActionButton
                        title="Ẩn sự kiện"
                        color="gray"
                        icon={<EyeOff className="size-4" />}
                        onClick={() => quickHide(event.id)}
                        disabled={isMutating}
                      />
                    )}
                    {/* Unhide — only for HIDDEN+APPROVED (was published, then hidden) */}
                    {event.status === 'HIDDEN' && event.approval_status === 'APPROVED' && (
                      <ActionButton
                        title="Bỏ ẩn"
                        color="green"
                        icon={<Eye className="size-4" />}
                        onClick={() => quickUnhide(event.id)}
                        disabled={isMutating}
                      />
                    )}
                    {/* View detail button */}
                    <button
                      type="button"
                      title="Xem chi tiết"
                      onClick={() => openModal(event)}
                      className="grid size-9 place-items-center rounded-xl border border-border-soft/40 text-subtle transition hover:border-tertiary hover:bg-panel-soft hover:text-tertiary"
                      aria-label={`Xem chi tiết ${event.title}`}
                    >
                      <Eye className="size-4" />
                    </button>
                  </div>
                </div>,
              ])}
            />
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-subtle">
              <span>
                Trang {pagination.page} / {pagination.total_pages} · {pagination.total} sự kiện
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="admin-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="admin-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Tiếp
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail / Review Modal */}
      {selectedEvent && (
        <EventReviewModal
          event={selectedEvent}
          note={modalNote}
          error={modalError}
          isMutating={isMutating}
          onNoteChange={setModalNote}
          onReview={submitModalReview}
          onHide={submitModalHide}
          onUnhide={submitModalUnhide}
          onClose={closeModal}
        />
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({ title, color, icon, onClick, disabled }) {
  const colorMap = {
    green: 'border-success/30 text-success hover:bg-success/10',
    red: 'border-error/30 text-error hover:bg-error/10',
    gray: 'border-border-soft/40 text-subtle hover:border-tertiary hover:bg-panel-soft',
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-9 place-items-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${colorMap[color]}`}
    >
      {icon}
    </button>
  )
}

function EventReviewModal({
  event,
  note,
  error,
  isMutating,
  onNoteChange,
  onReview,
  onHide,
  onUnhide,
  onClose,
}) {
  const isPending  = event.status === 'PENDING_REVIEW'
  const isPublished = event.status === 'PUBLISHED'
  const isHiddenApproved = event.status === 'HIDDEN' && event.approval_status === 'APPROVED'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <Panel className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border-border-soft/60">
        {/* Header */}
        <h3 className="font-display text-2xl font-extrabold text-content leading-tight">
          {event.title}
        </h3>
        <p className="mt-1 text-sm text-subtle">
          Organizer: <span className="font-semibold text-content">{event.organizer_name}</span>
        </p>
        <p className="text-sm text-subtle">
          Ngày diễn ra:{' '}
          <span className="font-semibold text-content">
            {formatDate(event.start_time)}
            {event.end_time && event.end_time !== event.start_time
              ? ` — ${formatDate(event.end_time)}`
              : ''}
          </span>
        </p>
        <div className="mt-2">{statusBadge(event.status, event.approval_status)}</div>

        {/* Event thumbnail */}
        {event.thumbnail_url && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border-soft/40 bg-black/20">
            <img
              src={event.thumbnail_url}
              alt={event.title}
              className="max-h-[420px] w-full object-contain"
            />
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <DetailBlock icon={Tag} label="Danh mục" value={event.category_name || 'Chưa phân loại'} />
          <DetailBlock icon={Calendar} label="Hình thức" value={event.format || 'Chưa cập nhật'} />
          <DetailBlock icon={Ticket} label="Số loại vé" value={`${event.ticket_types?.length || 0} loại vé`} />
          <DetailBlock icon={MapPin} label="Số phiên" value={`${event.sessions?.length || 0} phiên`} />
        </div>

        {(event.short_description || event.description) && (
          <div className="mt-5 rounded-xl border border-border-soft/30 bg-panel-soft/50 p-4">
            <p className="text-xs font-bold uppercase text-muted">Mô tả sự kiện</p>
            {event.short_description && <p className="mt-2 text-sm font-semibold text-content">{event.short_description}</p>}
            {event.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-subtle">
                {stripHtml(event.description)}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-4">
            <p className="text-xs font-bold uppercase text-muted">Lịch diễn và địa điểm</p>
            <div className="mt-3 space-y-3">
              {(event.sessions || []).length === 0 ? (
                <p className="text-sm text-subtle">Chưa có session.</p>
              ) : (
                event.sessions.map((session) => (
                  <div key={session.id} className="rounded-lg border border-border-soft/20 bg-surface/50 p-3 text-sm">
                    <p className="font-bold text-content">{session.session_name || 'Session'}</p>
                    <p className="mt-1 text-subtle">{formatDateTime(session.start_time)} - {formatDateTime(session.end_time)}</p>
                    <p className="mt-1 text-subtle">
                      {[session.venue_name, session.address_line, session.city].filter(Boolean).join(', ') || 'Chưa cập nhật địa điểm'}
                    </p>
                    {session.seat_map_id && <p className="mt-1 text-xs font-bold text-tertiary">Có sơ đồ ghế</p>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-4">
            <p className="text-xs font-bold uppercase text-muted">Loại vé</p>
            <div className="mt-3 space-y-3">
              {(event.ticket_types || []).length === 0 ? (
                <p className="text-sm text-subtle">Chưa có loại vé.</p>
              ) : (
                event.ticket_types.map((ticket) => (
                  <div key={ticket.id} className="flex items-start justify-between gap-3 rounded-lg border border-border-soft/20 bg-surface/50 p-3 text-sm">
                    <div>
                      <p className="font-bold text-content">{ticket.name}</p>
                      <p className="mt-1 text-subtle">{ticket.is_seated ? 'Vé theo ghế' : 'Vé thường'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-content">{formatMoney(ticket.price)}</p>
                      <p className="mt-1 text-xs text-subtle">{ticket.sold_quantity || 0}/{ticket.quantity || 0} đã bán</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {event.review_note && (
          <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            <p className="font-bold">Ghi chú review gần nhất</p>
            <p className="mt-1 whitespace-pre-wrap">{event.review_note}</p>
          </div>
        )}

        {/* Note textarea — shown for PENDING_REVIEW and PUBLISHED (hide reason) */}
        {(isPending || isPublished) && (
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-subtle">
              {isPending ? 'Ghi chú (bắt buộc khi từ chối)' : 'Lý do ẩn (tuỳ chọn)'}
            </span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border-soft/40 bg-panel-soft p-3 text-sm text-content outline-none focus:border-primary placeholder:text-muted"
              placeholder={
                isPending
                  ? 'Nhập lý do duyệt hoặc từ chối...'
                  : 'Nhập lý do ẩn sự kiện...'
              }
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
            />
          </label>
        )}

        {/* Error */}
        {error && <p className="mt-3 text-sm font-semibold text-error">{error}</p>}

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          {isPending && (
            <>
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onReview('APPROVED')}
                className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-extrabold text-slate-950 shadow transition hover:-translate-y-0.5 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <CheckCircle2 className="size-4" />
                Phê duyệt
              </button>
              <button
                type="button"
                disabled={isMutating}
                onClick={() => onReview('REJECTED')}
                className="inline-flex items-center gap-2 rounded-xl border border-error/40 px-5 py-3 text-sm font-bold text-error transition hover:-translate-y-0.5 hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <XCircle className="size-4" />
                Từ chối
              </button>
            </>
          )}

          {isPublished && (
            <button
              type="button"
              disabled={isMutating}
              onClick={onHide}
              className="inline-flex items-center gap-2 rounded-xl bg-panel-soft border border-border-soft/40 px-5 py-3 text-sm font-bold text-content shadow transition hover:-translate-y-0.5 hover:bg-panel-soft/80 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <EyeOff className="size-4" />
              Ẩn sự kiện
            </button>
          )}

          {isHiddenApproved && (
            <button
              type="button"
              disabled={isMutating}
              onClick={onUnhide}
              className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-extrabold text-slate-950 shadow transition hover:-translate-y-0.5 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Eye className="size-4" />
              Bỏ ẩn
            </button>
          )}

          <button
            type="button"
            className="admin-secondary"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </Panel>
    </div>
  )
}

function DetailBlock({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tertiary/10 text-tertiary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase text-muted">{label}</p>
        <p className="text-sm font-bold text-content">{value}</p>
      </div>
    </div>
  )
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN')
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0))
}
