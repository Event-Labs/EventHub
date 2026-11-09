import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Mail,
  Phone,
  Ticket,
  Coins,
  ShieldCheck,
  Calendar,
  MapPin,
  FileText,
  AlertOctagon,
  RefreshCw,
  X,
  Check,
  ExternalLink,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'

import {
  fetchAdminEventDetail,
  approveCancellationRequest,
} from '@/services/adminEvents.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, Page, Panel } from './AdminComponents.jsx'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function formatCurrency(amount) {
  const num = Number(amount || 0)
  const isEn = getAutoLocale() === 'en-US'
  if (isEn) return `${new Intl.NumberFormat('en-US').format(num)} VND`
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num)
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(getAutoLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ConfirmModal({
  open,
  title,
  subtitle,
  eventTitle,
  description,
  tone = 'danger',
  onConfirm,
  onCancel,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  isPending = false,
}) {
  if (!open) return null

  const isApproveTone = tone === 'danger'

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-xl border ${
                isApproveTone
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}
            >
              {isApproveTone ? <AlertOctagon className="size-6" /> : <AlertTriangle className="size-6" />}
            </span>
            <div>
              <h3 className="text-xl font-black text-white">{title}</h3>
              <p className="mt-1 text-xs text-slate-300">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Event highlight */}
        {eventTitle && (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sự kiện áp dụng:</p>
            <p className="font-bold text-white text-sm mt-0.5 truncate">{eventTitle}</p>
          </div>
        )}

        {/* Description */}
        {description && (
          <div className="mt-3.5 rounded-xl border border-white/5 bg-white/5 p-3.5 text-xs text-slate-300 leading-relaxed">
            {description}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/5 transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black shadow-lg transition disabled:opacity-50 ${
              isApproveTone
                ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white hover:from-rose-500 hover:to-red-500 shadow-rose-950/50'
                : 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:from-amber-500 hover:to-yellow-500 shadow-amber-950/50'
            }`}
          >
            {isPending && <RefreshCw className="size-3.5 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminEventCancellationDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Form decision state: 'APPROVE' or 'REJECT'
  const [decision, setDecision] = useState('APPROVE')
  const [adminNote, setAdminNote] = useState('')
  const [formError, setFormError] = useState('')
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)

  // Fetch event details
  const {
    data: event,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-event-detail', eventId],
    queryFn: () => fetchAdminEventDetail(eventId),
    enabled: Boolean(eventId),
  })

  // Mutation for Approve/Reject Cancellation
  const reviewCancellationMutation = useMutation({
    mutationFn: ({ decision, note }) => {
      if (decision === 'APPROVE') {
        return approveCancellationRequest(eventId, {
          decision: 'APPROVE',
          note: note?.trim() || null,
        })
      }
      return approveCancellationRequest(eventId, {
        decision: 'REJECT',
        rejection_reason: note?.trim() || 'Admin từ chối yêu cầu hủy',
      })
    },
    onSuccess: (_, variables) => {
      setConfirmModalOpen(false)
      if (variables.decision === 'APPROVE') {
        toast.success('Đã phê duyệt hủy sự kiện thành công! Danh sách hoàn tiền 100% đã được tự động tạo.')
      } else {
        toast.info('Đã từ chối yêu cầu hủy sự kiện. Sự kiện đã được mở bán lại.')
      }
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      queryClient.invalidateQueries({ queryKey: ['admin-cancellations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
      navigate('/admin/events/review')
    },
    onError: (err) => {
      setConfirmModalOpen(false)
      toast.error(getApiMessage(err, 'Không thể xử lý yêu cầu hủy sự kiện.'))
    },
  })

  const cancelRequest = event?.cancel_request
  const isPending = cancelRequest?.status === 'PENDING'
  const isApproved = cancelRequest?.status === 'APPROVED' || event?.status === 'CANCELLED'
  const isRejected = cancelRequest?.status === 'REJECTED'

  // Validation before triggering confirmation
  const handleOpenConfirm = (e) => {
    e.preventDefault()
    setFormError('')

    if (decision === 'REJECT' && !adminNote.trim()) {
      setFormError('Vui lòng nhập rõ lý do từ chối yêu cầu hủy để phản hồi cho Ban tổ chức.')
      return
    }

    setConfirmModalOpen(true)
  }

  const handleExecuteDecision = () => {
    reviewCancellationMutation.mutate({ decision, note: adminNote })
  }

  // SLA Calculation
  const slaRemaining = (() => {
    if (!cancelRequest?.sla_due_at) return null
    const diff = new Date(cancelRequest.sla_due_at).getTime() - Date.now()
    const hours = Math.round(diff / 3600000)
    if (diff <= 0) return { text: 'Đã quá hạn SLA', isOverdue: true, isUrgent: true }
    if (hours <= 4) return { text: `Còn ~${Math.max(1, hours)} giờ (Gấp)`, isOverdue: false, isUrgent: true }
    return { text: `Còn ~${hours} giờ`, isOverdue: false, isUrgent: false }
  })()

  if (isLoading) {
    return (
      <div className="py-12 text-center text-subtle text-sm">
        <RefreshCw className="mx-auto mb-2 size-6 animate-spin text-amber-400" />
        Đang tải thông tin yêu cầu hủy sự kiện...
      </div>
    )
  }

  if (isError || !event) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto mb-2 size-8 text-rose-400" />
        <h3 className="font-bold text-white text-base">Không tìm thấy thông tin sự kiện</h3>
        <p className="mt-1 text-xs text-subtle">Sự kiện có thể đã bị xóa hoặc bạn không có quyền truy cập.</p>
        <Link
          to="/admin/events/review"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-panel-soft px-4 py-2 text-xs font-bold text-white hover:bg-surface"
        >
          <ArrowLeft className="size-4" /> Quay lại danh sách
        </Link>
      </div>
    )
  }

  const totalRefundAmount =
    cancelRequest?.total_refund_amount ??
    event.total_paid_amount ??
    0
  const affectedOrdersCount =
    cancelRequest?.affected_orders_count ??
    event.paid_orders_count ??
    0
  const affectedTicketsCount =
    cancelRequest?.affected_tickets_count ??
    event.issued_tickets_count ??
    0

  const sessions = event.sessions || []
  const ticketTypes = event.ticket_types || []

  return (
    <div>
      {/* Top Bar Navigation */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-soft/40 pb-5">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/events/review"
            className="grid size-9 place-items-center rounded-xl border border-border-soft/60 bg-panel-soft text-slate-300 hover:bg-surface hover:text-white transition"
            title="Quay lại danh sách duyệt sự kiện"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                Thẩm định yêu cầu hủy sự kiện
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-subtle">{event.slug}</span>
            </div>
            <h1 className="font-display text-2xl font-black text-white tracking-tight mt-0.5">
              {event.title}
            </h1>
          </div>
        </div>

        {/* Right Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {isPending && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-300 animate-pulse">
              <Clock className="size-3.5" />
              Đang chờ duyệt hủy
            </span>
          )}
          {isApproved && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/20 px-3 py-1 text-xs font-black text-rose-400">
              <CheckCircle2 className="size-3.5" />
              Đã phê duyệt hủy
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/40 bg-zinc-500/20 px-3 py-1 text-xs font-semibold text-zinc-300">
              <XCircle className="size-3.5" />
              Đã từ chối hủy
            </span>
          )}

          {slaRemaining && isPending && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border ${
                slaRemaining.isOverdue
                  ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 animate-pulse'
                  : slaRemaining.isUrgent
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 animate-pulse'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              <Clock className="size-3.5" />
              SLA: {slaRemaining.text}
            </span>
          )}

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="grid size-9 place-items-center rounded-xl border border-border-soft/60 bg-panel-soft text-slate-300 hover:bg-surface hover:text-white transition disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Grid: Left Details & Right Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 7 Cols (Information & Impact) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Chi tiết Yêu cầu Hủy từ BTC */}
          <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/30 via-panel-soft/90 to-panel p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-border-soft/40 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-300">
                  <CalendarX className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Yêu Cầu Hủy Từ Ban Tổ Chức</h2>
                  <p className="text-xs text-subtle">
                    Gửi lúc: {formatDate(cancelRequest?.requested_at || event.updated_at)}
                  </p>
                </div>
              </div>

              {/* Tag phân loại lý do */}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black border ${
                  cancelRequest?.reason_code === 'FORCE_MAJEURE'
                    ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                    : 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                }`}
              >
                {cancelRequest?.reason_code === 'FORCE_MAJEURE'
                  ? 'Bất khả kháng (Thiên tai, dịch bệnh, pháp lý)'
                  : 'Lý do từ Ban tổ chức (Kế hoạch, lịch trình, tài chính)'}
              </span>
            </div>

            {/* Giải trình chi tiết */}
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Giải trình chi tiết của Ban tổ chức:
                </label>
                <div className="mt-1.5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 leading-relaxed italic">
                  "{cancelRequest?.reason_note || cancelRequest?.note || 'Không có giải trình chi tiết kèm theo.'}"
                </div>
              </div>

              {/* Thông số cam kết & phương thức hoàn tiền */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-white/5 bg-panel-soft/60 p-3.5">
                  <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
                    Phương thức hoàn tiền:
                  </p>
                  <p className="mt-1 text-sm font-bold text-white flex items-center gap-1.5">
                    <Coins className="size-4 text-emerald-400" />
                    {cancelRequest?.refund_mode === 'MODE_A'
                      ? 'Tự động qua cổng PayOS'
                      : 'Chuyển khoản thủ công VietQR'}
                  </p>
                </div>

                <div className="rounded-xl border border-white/5 bg-panel-soft/60 p-3.5">
                  <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
                    Cam kết hoàn tiền:
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="size-4 text-emerald-400" />
                    Đã cam kết trách nhiệm 100%
                  </p>
                </div>
              </div>

              {/* Nếu đã duyệt hoặc từ chối trước đó */}
              {(isApproved || isRejected) && cancelRequest?.reviewed_at && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs space-y-1">
                  <p className="font-bold text-white">Lịch sử phản hồi của Quản trị viên:</p>
                  <p className="text-slate-300">
                    Thời gian duyệt: {formatDate(cancelRequest.reviewed_at)}
                  </p>
                  {cancelRequest.admin_note && (
                    <p className="text-slate-300">
                      Ghi chú: <span className="text-amber-300 italic">"{cancelRequest.admin_note}"</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Đánh giá Tác động Tài chính & Nghĩa vụ Hoàn tiền */}
          <div className="rounded-2xl border border-border-soft/60 bg-panel p-6 shadow-xl">
            <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
              <Coins className="size-5 text-emerald-400" />
              Đánh Giá Tác Động & Nghĩa Vụ Hoàn Tiền
            </h3>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                  Tổng tiền hoàn khách hàng
                </span>
                <p className="mt-1 text-xl font-black text-rose-400 font-display">
                  {formatCurrency(totalRefundAmount)}
                </p>
                <p className="text-[10px] text-subtle mt-0.5">Hoàn trả 100% cho người mua</p>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Đơn hàng đã thanh toán
                </span>
                <p className="mt-1 text-xl font-black text-amber-300 font-display">
                  {affectedOrdersCount.toLocaleString()} đơn
                </p>
                <p className="text-[10px] text-subtle mt-0.5">Cần tạo phiếu hoàn tiền</p>
              </div>

              <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                  Vé cần thu hồi/hủy
                </span>
                <p className="mt-1 text-xl font-black text-indigo-300 font-display">
                  {affectedTicketsCount.toLocaleString()} vé
                </p>
                <p className="text-[10px] text-subtle mt-0.5">Sẽ chuyển sang REFUND_REQUESTED</p>
              </div>
            </div>

            {/* Danh sách Suất diễn / Sessions */}
            <div className="mb-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Các phiên sự kiện sẽ bị hủy ({sessions.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {sessions.map((sess, idx) => (
                  <div
                    key={sess.id || idx}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-panel-soft/50 p-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">{sess.session_name || `Suất diễn #${idx + 1}`}</p>
                      <p className="text-[11px] text-subtle mt-0.5">
                        {formatDate(sess.start_time)} - {formatDate(sess.end_time)}
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Sẽ chuyển CANCELLED
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danh sách Loại vé & Đã bán */}
            {ticketTypes.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Cơ cấu vé mở bán ({ticketTypes.length})
                </h4>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/5 bg-white/5 text-slate-400 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Loại vé</th>
                        <th className="py-2 px-3">Giá vé</th>
                        <th className="py-2 px-3">Đã bán / Mở bán</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {ticketTypes.map((tt, idx) => (
                        <tr key={tt.id || idx}>
                          <td className="py-2 px-3 font-medium text-white">{tt.name}</td>
                          <td className="py-2 px-3 text-amber-300 font-bold">{formatCurrency(tt.price)}</td>
                          <td className="py-2 px-3">
                            <strong>{tt.sold_quantity ?? '—'}</strong> / {tt.quantity?.toLocaleString() ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Thông tin Ban tổ chức */}
          <div className="rounded-2xl border border-border-soft/60 bg-panel p-6 shadow-xl">
            <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
              <Building2 className="size-5 text-indigo-400" />
              Thông Tin Ban Tổ Chức
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-white/5 bg-panel-soft/60 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-subtle uppercase">Đơn vị tổ chức:</p>
                <p className="font-bold text-white text-sm">{event.organizer_name || '—'}</p>
              </div>

              <div className="rounded-xl border border-white/5 bg-panel-soft/60 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-subtle uppercase">Email liên hệ:</p>
                <p className="font-bold text-white flex items-center gap-1.5 truncate">
                  <Mail className="size-3.5 text-subtle" />
                  {event.organizer_email || '—'}
                </p>
              </div>

              {event.organizer_phone && (
                <div className="rounded-xl border border-white/5 bg-panel-soft/60 p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-subtle uppercase">Số điện thoại:</p>
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <Phone className="size-3.5 text-subtle" />
                    {event.organizer_phone}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-white/5 bg-panel-soft/60 p-3.5 space-y-1">
                <p className="text-[11px] font-semibold text-subtle uppercase">Thời gian diễn ra:</p>
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-subtle" />
                  {formatDate(event.start_time)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 5 Cols (Specialized Review Form) */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="rounded-2xl border border-border-soft/80 bg-gradient-to-b from-panel-soft/95 to-panel p-6 shadow-2xl backdrop-blur-xl">
            <h3 className="text-base font-black text-white flex items-center gap-2 border-b border-border-soft/60 pb-3">
              <ShieldCheck className="size-5 text-amber-400" />
              Quyết Định Của Quản Trị Viên
            </h3>

            {/* If still pending: display interactive review form */}
            {isPending ? (
              <form onSubmit={handleOpenConfirm} className="mt-5 space-y-5">
                {/* 1. Decision Selection */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Chọn hành động xử lý:
                  </label>
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    {/* Approve Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setDecision('APPROVE')
                        setFormError('')
                      }}
                      className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                        decision === 'APPROVE'
                          ? 'border-rose-500 bg-rose-950/40 text-white shadow-lg shadow-rose-950/50'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-black text-sm text-rose-400">
                        <CheckCircle2 className="size-4" />
                        Duyệt Yêu Cầu Hủy
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300 leading-tight">
                        Chấp thuận hủy sự kiện & kích hoạt hoàn tiền
                      </p>
                    </button>

                    {/* Reject Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setDecision('REJECT')
                        setFormError('')
                      }}
                      className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                        decision === 'REJECT'
                          ? 'border-amber-500 bg-amber-950/40 text-white shadow-lg shadow-amber-950/50'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-black text-sm text-amber-400">
                        <XCircle className="size-4" />
                        Từ Chối Hủy
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300 leading-tight">
                        Bác bỏ yêu cầu & mở bán lại sự kiện
                      </p>
                    </button>
                  </div>
                </div>

                {/* 2. Admin Note Input */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>
                      {decision === 'APPROVE'
                        ? 'Ghi chú cho Ban tổ chức (Tùy chọn):'
                        : 'Lý do từ chối yêu cầu hủy (Bắt buộc):'}
                    </span>
                    {decision === 'REJECT' && (
                      <span className="text-[11px] font-bold text-rose-400">* Bắt buộc</span>
                    )}
                  </label>
                  <textarea
                    rows={4}
                    value={adminNote}
                    onChange={(e) => {
                      setAdminNote(e.target.value)
                      if (formError) setFormError('')
                    }}
                    placeholder={
                      decision === 'APPROVE'
                        ? 'Ví dụ: Ban Quản trị EventHub đồng thuận với lý do bất khả kháng. Tiến trình hoàn tiền cho người tham gia sẽ được khởi tạo...'
                        : 'Ví dụ: Lý do hủy không hợp lệ hoặc thông tin giải trình chưa đầy đủ. Yêu cầu BTC liên hệ Ban Quản trị để đối soát...'
                    }
                    className="mt-2 w-full rounded-xl border border-border-soft/80 bg-panel p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:bg-surface transition"
                  />
                  {formError && (
                    <p className="mt-1.5 text-xs font-bold text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="size-3.5" />
                      {formError}
                    </p>
                  )}
                </div>

                {/* 3. System Impact Callout */}
                <div
                  className={`rounded-xl border p-4 text-xs leading-relaxed ${
                    decision === 'APPROVE'
                      ? 'border-rose-500/30 bg-rose-950/30 text-rose-200'
                      : 'border-amber-500/30 bg-amber-950/30 text-amber-200'
                  }`}
                >
                  <p className="font-bold uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
                    {decision === 'APPROVE' ? (
                      <>
                        <AlertOctagon className="size-4 text-rose-400" />
                        Tác động hệ thống khi Phê duyệt hủy:
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-4 text-amber-400" />
                        Tác động hệ thống khi Từ chối hủy:
                      </>
                    )}
                  </p>
                  {decision === 'APPROVE' ? (
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                      <li>Sự kiện chuyển sang trạng thái <strong>ĐÃ HỦY (CANCELLED)</strong>.</li>
                      <li>Đóng vĩnh viễn cổng bán vé, hủy tất cả suất diễn sắp tới.</li>
                      <li>Hủy toàn bộ vé đã xuất và giải phóng sơ đồ chỗ ngồi.</li>
                      <li>Tự động tạo danh sách hoàn tiền 100% cho toàn bộ đơn hàng thanh toán.</li>
                      <li>Phát thông báo hủy sự kiện đến toàn bộ người mua vé và Ban tổ chức.</li>
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                      <li>Yêu cầu hủy sự kiện sẽ bị đánh dấu <strong>TỪ CHỐI (REJECTED)</strong>.</li>
                      <li>Gỡ bỏ lệnh tạm dừng bán vé do yêu cầu hủy (trở lại trạng thái bình thường).</li>
                      <li>Gửi thông báo kèm lý do từ chối chính thức đến tài khoản Ban tổ chức.</li>
                    </ul>
                  )}
                </div>

                {/* 4. Action Submit Button */}
                <button
                  type="submit"
                  disabled={reviewCancellationMutation.isPending}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-xl transition hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${
                    decision === 'APPROVE'
                      ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 text-white shadow-rose-950/60'
                      : 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600 text-white shadow-amber-950/60'
                  }`}
                >
                  {decision === 'APPROVE' ? (
                    <>
                      <CalendarX className="size-4" />
                      Xác Nhận Phê Duyệt Hủy Sự Kiện
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4" />
                      Xác Nhận Từ Chối Yêu Cầu Hủy
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Already Processed Status Card */
              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-xl border p-4 text-center ${
                    isApproved
                      ? 'border-rose-500/40 bg-rose-950/30 text-rose-300'
                      : 'border-zinc-500/40 bg-zinc-900/40 text-zinc-300'
                  }`}
                >
                  {isApproved ? (
                    <>
                      <CheckCircle2 className="mx-auto size-8 text-rose-400 mb-2" />
                      <h4 className="font-black text-sm text-white">Yêu cầu đã được Phê duyệt</h4>
                      <p className="mt-1 text-xs text-slate-300">
                        Sự kiện đã chuyển sang trạng thái ĐÃ HỦY và tiến trình hoàn tiền đã được kích hoạt.
                      </p>
                    </>
                  ) : (
                    <>
                      <XCircle className="mx-auto size-8 text-zinc-400 mb-2" />
                      <h4 className="font-black text-sm text-white">Yêu cầu đã bị Từ chối</h4>
                      <p className="mt-1 text-xs text-slate-300">
                        Ban Quản trị đã từ chối yêu cầu hủy. Sự kiện tiếp tục hoạt động bán vé.
                      </p>
                    </>
                  )}
                </div>

                <Link
                  to="/admin/events/review"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-panel-soft py-2.5 px-4 text-xs font-bold text-white hover:bg-surface transition"
                >
                  <ArrowLeft className="size-4" />
                  Quay lại danh sách duyệt sự kiện
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2-Step Confirmation Modal */}
      <ConfirmModal
        open={confirmModalOpen}
        title={decision === 'APPROVE' ? 'Xác nhận phê duyệt hủy sự kiện' : 'Xác nhận từ chối yêu cầu hủy'}
        subtitle={
          decision === 'APPROVE'
            ? 'Chấp thuận hủy sự kiện và khởi tạo tiến trình hoàn tiền 100% cho người mua.'
            : 'Bác bỏ yêu cầu hủy từ Ban tổ chức và khôi phục hoạt động bán vé.'
        }
        eventTitle={event.title}
        description={
          decision === 'APPROVE'
            ? 'Bạn có chắc chắn muốn phê duyệt hủy sự kiện này? Hành động này sẽ đóng toàn bộ bán vé, hủy các vé đã phát hành và bắt đầu tạo phiếu hoàn tiền cho mọi đơn hàng đã thanh toán.'
            : 'Bạn có chắc chắn muốn từ chối yêu cầu hủy? Sự kiện sẽ được mở bán lại và lý do từ chối sẽ được gửi ngay đến Ban tổ chức.'
        }
        tone={decision === 'APPROVE' ? 'danger' : 'warning'}
        confirmText={decision === 'APPROVE' ? 'Phê duyệt hủy' : 'Từ chối yêu cầu'}
        cancelText="Hủy bỏ"
        onConfirm={handleExecuteDecision}
        onCancel={() => setConfirmModalOpen(false)}
        isPending={reviewCancellationMutation.isPending}
      />
    </div>
  )
}

