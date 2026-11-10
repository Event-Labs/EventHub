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
  Coins,
  ShieldCheck,
  Calendar,
  AlertOctagon,
  RefreshCw,
  X,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'

import {
  fetchAdminEventDetail,
  approveCancellationRequest,
  rejectCancellationRequest,
} from '@/services/adminEvents.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { translatePhrase } from '@/i18n/phraseDictionary.js'

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

  const isApprove = tone === 'danger'

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                isApprove
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              {isApprove ? <AlertOctagon className="size-5" /> : <AlertTriangle className="size-5" />}
            </span>
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
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
            <span className="text-[11px] font-semibold text-slate-400">Sự kiện áp dụng: </span>
            <span className="font-bold text-white truncate">{eventTitle}</span>
          </div>
        )}

        {/* Description */}
        {description && (
          <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-xs text-slate-300 leading-relaxed">
            {description}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
              isApprove
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
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
  const { isEnglish } = useLanguage()
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
      return rejectCancellationRequest(eventId, {
        rejection_reason: note?.trim() || 'Admin từ chối yêu cầu hủy',
        note: note?.trim() || 'Admin từ chối yêu cầu hủy',
      })
    },
    onSuccess: (_, variables) => {
      setConfirmModalOpen(false)
      if (variables.decision === 'APPROVE') {
        toast.success('Đã phê duyệt hủy sự kiện thành công! Danh sách hoàn tiền 100% đã được tự động tạo.')
      } else {
        toast.info('Đã từ chối yêu cầu hủy sự kiện. Trạng thái sự kiện được chuyển về Tạm dừng bán vé.')
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
      setFormError('Vui lòng nhập rõ lý do từ chối yêu cầu hủy để gửi phản hồi cho Ban tổ chức.')
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
    const dueTime = new Date(cancelRequest.sla_due_at).getTime()
    const now = Date.now()
    const diffHours = Math.round((dueTime - now) / (1000 * 60 * 60))
    if (diffHours <= 0) return { text: 'Quá hạn SLA', isOverdue: true }
    return {
      text: `Còn ~${diffHours} giờ`,
      isUrgent: diffHours <= 6,
      isOverdue: false,
    }
  })()

  if (isLoading) {
    return (
      <div className="py-24 text-center">
        <RefreshCw className="mx-auto mb-3 size-6 animate-spin text-slate-400" />
        <p className="text-sm text-slate-400">Đang tải thông tin yêu cầu hủy...</p>
      </div>
    )
  }

  if (isError || !event) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 size-8 text-amber-400" />
        <h3 className="font-bold text-white text-base">Không tìm thấy thông tin sự kiện</h3>
        <p className="mt-1 text-xs text-slate-400">Sự kiện có thể đã bị xóa hoặc bạn không có quyền truy cập.</p>
        <Link
          to="/admin/events/review"
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#121c38] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
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
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/events/review"
            className="grid size-9 place-items-center rounded-xl border border-white/10 bg-[#0d172e] text-slate-300 hover:bg-white/10 hover:text-white transition"
            title="Quay lại danh sách duyệt sự kiện"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-red-400">{isEnglish ? 'Review Event Cancellation Request' : 'Duyệt yêu cầu hủy sự kiện'}</span>
              <span>•</span>
              <span>{event.slug}</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5">
              {isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}
            </h1>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isPending && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
              <Clock className="size-3.5" />
              Đang chờ duyệt hủy
            </span>
          )}
          {isApproved && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
              <CheckCircle2 className="size-3.5" />
              Đã phê duyệt hủy
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
              <XCircle className="size-3.5" />
              Đã từ chối hủy
            </span>
          )}

          {slaRemaining && isPending && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
                slaRemaining.isOverdue
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : slaRemaining.isUrgent
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-white/10 bg-[#121c38] text-slate-300'
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
            className="grid size-9 place-items-center rounded-xl border border-white/10 bg-[#0d172e] text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Grid: Left Details & Right Decision Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 7 Cols (Information & Stats) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Yêu cầu từ Ban tổ chức */}
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarX className="size-4 text-red-400" />
                  Yêu cầu hủy từ Ban tổ chức
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gửi lúc: {formatDate(cancelRequest?.requested_at || event.updated_at)}
                </p>
              </div>

              {/* Tag phân loại lý do */}
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border border-white/10 bg-[#121c38] text-slate-300">
                {cancelRequest?.reason_code === 'FORCE_MAJEURE'
                  ? 'Trường hợp bất khả kháng'
                  : 'Lý do từ Ban tổ chức'}
              </span>
            </div>

            {/* Chi tiết giải trình */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Giải trình của Ban tổ chức:
                </label>
                <div className="mt-1.5 rounded-xl border border-white/10 bg-[#080f24] p-3.5 text-sm text-slate-200 leading-relaxed">
                  {cancelRequest?.reason_note || cancelRequest?.note || 'Không có giải trình chi tiết.'}
                </div>
              </div>

              {/* Thông số phương thức & cam kết */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs">
                  <span className="text-slate-400 block mb-1">Phương thức hoàn tiền:</span>
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Coins className="size-3.5 text-slate-400" />
                    {cancelRequest?.refund_mode === 'MODE_A'
                      ? 'Tự động qua cổng PayOS'
                      : 'Chuyển khoản thủ công VietQR'}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs">
                  <span className="text-slate-400 block mb-1">Cam kết hoàn tiền:</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-emerald-400" />
                    Đã cam kết trách nhiệm 100%
                  </span>
                </div>
              </div>

              {/* Lịch sử đã duyệt/từ chối */}
              {(isApproved || isRejected) && cancelRequest?.reviewed_at && (
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 text-xs space-y-1">
                  <p className="font-semibold text-white">Lịch sử phản hồi của Quản trị viên:</p>
                  <p className="text-slate-400">
                    Thời gian: {formatDate(cancelRequest.reviewed_at)}
                  </p>
                  {cancelRequest.admin_note && (
                    <p className="text-slate-300">
                      Ghi chú: <span className="text-slate-200">"{cancelRequest.admin_note}"</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Đánh giá Tác động & Thống kê */}
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
              <Coins className="size-4 text-slate-400" />
              Thống kê tác động & nghĩa vụ hoàn tiền
            </h3>

            {/* 3 Thống kê chính */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-white/10 bg-[#121c38] p-4">
                <span className="text-xs text-slate-400 block">
                  Tổng tiền hoàn dự kiến
                </span>
                <p className="mt-1 text-lg font-bold text-white">
                  {formatCurrency(totalRefundAmount)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Hoàn 100% cho người mua</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-4">
                <span className="text-xs text-slate-400 block">
                  Đơn hàng thanh toán
                </span>
                <p className="mt-1 text-lg font-bold text-white">
                  {affectedOrdersCount.toLocaleString()} đơn
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Cần tạo phiếu hoàn tiền</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-4">
                <span className="text-xs text-slate-400 block">
                  Vé đã phát hành
                </span>
                <p className="mt-1 text-lg font-bold text-white">
                  {affectedTicketsCount.toLocaleString()} vé
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Chuyển sang trạng thái hoàn</p>
              </div>
            </div>

            {/* Danh sách Suất diễn / Sessions */}
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-slate-400 mb-2">
                Các phiên sự kiện ({sessions.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {sessions.map((sess, idx) => (
                  <div
                    key={sess.id || idx}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-[#080f24] p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-white">{sess.session_name || `Phiên #${idx + 1}`}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(sess.start_time)} – {formatDate(sess.end_time)}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">
                      {sess.status || 'UPCOMING'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danh sách Loại vé & Đã bán */}
            {ticketTypes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 mb-2">
                  Cơ cấu loại vé ({ticketTypes.length})
                </h4>
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#080f24]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Loại vé</th>
                        <th className="py-2.5 px-3">Giá vé</th>
                        <th className="py-2.5 px-3">Đã bán / Tổng vé</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {ticketTypes.map((tt, idx) => (
                        <tr key={tt.id || idx}>
                          <td className="py-2 px-3 font-medium text-white">{tt.name}</td>
                          <td className="py-2 px-3 text-slate-200">{formatCurrency(tt.price)}</td>
                          <td className="py-2 px-3">
                            <span className="font-semibold text-white">{tt.sold_quantity ?? 0}</span> / {tt.quantity?.toLocaleString() ?? '—'}
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
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
              <Building2 className="size-4 text-slate-400" />
              Thông tin Ban tổ chức
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5">
                <span className="text-slate-400 block">Đơn vị tổ chức</span>
                <span className="font-semibold text-white text-sm block truncate">{event.organizer_name || '—'}</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5">
                <span className="text-slate-400 block">Email liên hệ</span>
                <span className="font-semibold text-white flex items-center gap-1.5 truncate">
                  <Mail className="size-3.5 text-slate-400 shrink-0" />
                  {event.organizer_email || '—'}
                </span>
              </div>

              {event.organizer_phone && (
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5">
                  <span className="text-slate-400 block">Số điện thoại</span>
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Phone className="size-3.5 text-slate-400" />
                    {event.organizer_phone}
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5">
                <span className="text-slate-400 block">Thời gian diễn ra</span>
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-slate-400" />
                  {formatDate(event.start_time)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 5 Cols (Decision Form) */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-white/10 pb-3">
              <ShieldCheck className="size-4 text-slate-400" />
              Quyết định của Quản trị viên
            </h3>

            {isPending ? (
              <form onSubmit={handleOpenConfirm} className="mt-5 space-y-5">
                {/* 1. Decision Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-2">
                    Hành động xử lý:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Approve Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setDecision('APPROVE')
                        setFormError('')
                      }}
                      className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition cursor-pointer ${
                        decision === 'APPROVE'
                          ? 'border-red-500 bg-red-500/10 text-white'
                          : 'border-white/10 bg-[#121c38] text-slate-400 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm text-red-400">
                        <CheckCircle2 className="size-4" />
                        Duyệt hủy sự kiện
                      </div>
                      <p className="mt-1 text-xs text-slate-400 leading-tight">
                        Chấp thuận hủy và khởi tạo hoàn tiền
                      </p>
                    </button>

                    {/* Reject Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setDecision('REJECT')
                        setFormError('')
                      }}
                      className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition cursor-pointer ${
                        decision === 'REJECT'
                          ? 'border-amber-500 bg-amber-500/10 text-white'
                          : 'border-white/10 bg-[#121c38] text-slate-400 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
                        <XCircle className="size-4" />
                        Từ chối yêu cầu
                      </div>
                      <p className="mt-1 text-xs text-slate-400 leading-tight">
                        Bác bỏ yêu cầu & tạm dừng bán vé
                      </p>
                    </button>
                  </div>
                </div>

                {/* 2. Admin Note Input */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 flex items-center justify-between mb-1.5">
                    <span>
                      {decision === 'APPROVE'
                        ? 'Ghi chú cho Ban tổ chức (tùy chọn):'
                        : 'Lý do từ chối yêu cầu (bắt buộc):'}
                    </span>
                    {decision === 'REJECT' && (
                      <span className="text-[11px] font-bold text-red-400">* Bắt buộc</span>
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
                        ? 'Ví dụ: Ban Quản trị EventHub đồng thuận với lý do hủy sự kiện. Tiến trình hoàn tiền sẽ được khởi tạo...'
                        : 'Ví dụ: Lý do hủy chưa rõ ràng hoặc hồ sơ giải trình chưa đầy đủ...'
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#080f24] p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-white/30 transition resize-none"
                  />
                  {formError && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1 font-medium">
                      <AlertTriangle className="size-3.5" />
                      {formError}
                    </p>
                  )}
                </div>

                {/* 3. System Note Callout */}
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 text-xs text-slate-300 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-white">
                    {decision === 'APPROVE'
                      ? 'Lưu ý khi duyệt hủy sự kiện:'
                      : 'Lưu ý khi từ chối yêu cầu:'}
                  </p>
                  {decision === 'APPROVE' ? (
                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                      <li>Sự kiện chuyển sang trạng thái <strong>Đã hủy (CANCELLED)</strong>.</li>
                      <li>Đóng vĩnh viễn cổng bán vé, hủy toàn bộ vé hợp lệ đã xuất.</li>
                      <li>Khởi tạo danh sách hoàn tiền 100% cho các đơn hàng đã thanh toán.</li>
                      <li>Gửi thông báo hủy sự kiện đến người mua vé và Ban tổ chức.</li>
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                      <li>Yêu cầu hủy sự kiện sẽ bị từ chối.</li>
                      <li>Gỡ bỏ lệnh tạm dừng bán vé do yêu cầu hủy, tiếp tục bán vé bình thường.</li>
                      <li>Gửi thông báo kèm lý do từ chối đến tài khoản Ban tổ chức.</li>
                    </ul>
                  )}
                </div>

                {/* 4. Action Submit Button */}
                <button
                  type="submit"
                  disabled={reviewCancellationMutation.isPending}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                    decision === 'APPROVE'
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {decision === 'APPROVE' ? (
                    <>
                      <Check className="size-4" />
                      Phê duyệt hủy sự kiện
                    </>
                  ) : (
                    <>
                      <X className="size-4" />
                      Từ chối yêu cầu hủy
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Already Processed */
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-4 text-center">
                  {isApproved ? (
                    <>
                      <CheckCircle2 className="mx-auto size-7 text-red-400 mb-2" />
                      <h4 className="font-bold text-sm text-white">Yêu cầu đã được phê duyệt</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        Sự kiện đã hủy và danh sách hoàn tiền đã được tạo tự động.
                      </p>
                    </>
                  ) : (
                    <>
                      <XCircle className="mx-auto size-7 text-slate-400 mb-2" />
                      <h4 className="font-bold text-sm text-white">Yêu cầu đã bị từ chối</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        Ban Quản trị đã từ chối yêu cầu hủy. Sự kiện tiếp tục hoạt động.
                      </p>
                    </>
                  )}
                </div>

                <Link
                  to="/admin/events/review"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#121c38] py-2.5 px-4 text-xs font-semibold text-white hover:bg-white/10 transition"
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
            ? 'Chấp thuận hủy sự kiện và khởi tạo tiến trình hoàn tiền cho người mua.'
            : 'Bác bỏ yêu cầu hủy từ Ban tổ chức và giữ trạng thái tạm dừng bán vé.'
        }
        eventTitle={isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}
        description={
          decision === 'APPROVE'
            ? 'Bạn có chắc chắn muốn phê duyệt hủy sự kiện này? Hành động này sẽ đóng bán vé vĩnh viễn, hủy vé đã xuất và tạo phiếu hoàn tiền cho các đơn hàng đã thanh toán.'
            : 'Bạn có chắc chắn muốn từ chối yêu cầu hủy? Trạng thái bán vé sẽ chuyển về Tạm dừng bán vé và lý do từ chối sẽ được gửi ngay đến Ban tổ chức.'
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
