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
  Ticket,
  X,
  Check,
} from 'lucide-react'
import { useState, useMemo } from 'react'
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

function formatSessionStatus(status, isEnglish = false) {
  if (!status) return isEnglish ? 'Upcoming' : 'Sắp diễn ra'
  const upper = String(status).trim().toUpperCase()
  if (upper === 'UPCOMING') return isEnglish ? 'Upcoming' : 'Sắp diễn ra'
  if (upper === 'HAPPENING' || upper === 'ONGOING' || upper === 'IN_PROGRESS') return isEnglish ? 'Happening' : 'Đang diễn ra'
  if (upper === 'ENDED' || upper === 'COMPLETED' || upper === 'PAST') return isEnglish ? 'Ended' : 'Đã kết thúc'
  if (upper === 'CANCELLED') return isEnglish ? 'Cancelled' : 'Đã hủy'
  if (upper === 'PAUSED') return isEnglish ? 'Paused' : 'Tạm dừng'
  return isEnglish ? upper : (translatePhrase(upper, 'vi') || upper)
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
  confirmText,
  cancelText,
  isPending = false,
  isEnglish = false,
}) {
  if (!open) return null

  const isApprove = tone === 'danger'
  const resolvedConfirmText = confirmText || (isEnglish ? 'Confirm' : 'Xác nhận')
  const resolvedCancelText = cancelText || (isEnglish ? 'Cancel' : 'Hủy bỏ')

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-2xl text-white [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                isApprove
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 [html.light_&]:bg-red-50 [html.light_&]:text-red-600 [html.light_&]:border-red-200'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-600 [html.light_&]:border-amber-200'
              }`}
            >
              {isApprove ? <AlertOctagon className="size-5" /> : <AlertTriangle className="size-5" />}
            </span>
            <div>
              <h3 className="text-lg font-bold text-white [html.light_&]:text-[#0D1B2A]">{title}</h3>
              <p className="mt-0.5 text-xs text-slate-400 [html.light_&]:text-slate-600">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition [html.light_&]:text-slate-600 [html.light_&]:hover:bg-slate-100 [html.light_&]:hover:text-slate-900"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Event highlight */}
        {eventTitle && (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
            <span className="text-[11px] font-semibold text-slate-400 [html.light_&]:text-slate-600">
              {isEnglish ? 'Affected event: ' : 'Sự kiện áp dụng: '}
            </span>
            <span className="font-bold text-white [html.light_&]:text-[#0D1B2A] truncate">{eventTitle}</span>
          </div>
        )}

        {/* Description */}
        {description && (
          <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-xs text-slate-300 leading-relaxed [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-slate-700">
            {description}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition [html.light_&]:bg-slate-100 [html.light_&]:border-slate-200 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-slate-200"
          >
            {resolvedCancelText}
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
            {resolvedConfirmText}
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
          locale: isEnglish ? 'en' : 'vi',
        })
      }
      return rejectCancellationRequest(eventId, {
        rejection_reason: note?.trim() || (isEnglish ? 'Admin rejected cancellation request' : 'Admin từ chối yêu cầu hủy'),
        note: note?.trim() || (isEnglish ? 'Admin rejected cancellation request' : 'Admin từ chối yêu cầu hủy'),
      })
    },
    onSuccess: (_, variables) => {
      setConfirmModalOpen(false)
      if (variables.decision === 'APPROVE') {
        toast.success(
          isEnglish
            ? 'Event cancellation approved successfully! 100% refund list has been automatically generated.'
            : 'Đã phê duyệt hủy sự kiện thành công! Danh sách hoàn tiền 100% đã được tự động tạo.'
        )
      } else {
        toast.info(
          isEnglish
            ? 'Cancellation request rejected. Event status has been restored to ticket sales paused.'
            : 'Đã từ chối yêu cầu hủy sự kiện. Trạng thái sự kiện được chuyển về Tạm dừng bán vé.'
        )
      }
      queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      queryClient.invalidateQueries({ queryKey: ['admin-cancellations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-detail', eventId] })
      navigate('/admin/events/review')
    },
    onError: (err) => {
      setConfirmModalOpen(false)
      toast.error(getApiMessage(err, isEnglish ? 'Failed to process event cancellation request.' : 'Không thể xử lý yêu cầu hủy sự kiện.'))
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
      setFormError(isEnglish ? 'Please provide a clear rejection reason to notify the organizer.' : 'Vui lòng nhập rõ lý do từ chối yêu cầu hủy để gửi phản hồi cho Ban tổ chức.')
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
    if (diffHours <= 0) return { text: isEnglish ? 'SLA Overdue' : 'Quá hạn SLA', isOverdue: true }
    return {
      text: isEnglish ? `~${diffHours}h left` : `Còn ~${diffHours} giờ`,
      isUrgent: diffHours <= 6,
      isOverdue: false,
    }
  })()

  if (isLoading) {
    return (
      <div className="py-24 text-center">
        <RefreshCw className="mx-auto mb-3 size-6 animate-spin text-slate-400" />
        <p className="text-sm text-slate-400">{isEnglish ? 'Loading cancellation request details...' : 'Đang tải thông tin yêu cầu hủy...'}</p>
      </div>
    )
  }

  if (isError || !event) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 size-8 text-amber-400" />
        <h3 className="font-bold text-white text-base">{isEnglish ? 'Event details not found' : 'Không tìm thấy thông tin sự kiện'}</h3>
        <p className="mt-1 text-xs text-slate-400">{isEnglish ? 'The event may have been deleted or you do not have permission to access it.' : 'Sự kiện có thể đã bị xóa hoặc bạn không có quyền truy cập.'}</p>
        <Link
          to="/admin/events/review"
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#121c38] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
        >
          <ArrowLeft className="size-4" /> {isEnglish ? 'Back to list' : 'Quay lại danh sách'}
        </Link>
      </div>
    )
  }

  const totalRefundAmount =
    (isPending
      ? (event.total_paid_amount ?? cancelRequest?.total_refund_amount)
      : (cancelRequest?.total_refund_amount ?? event.total_paid_amount)) ?? 0
  const affectedOrdersCount =
    (isPending
      ? (event.paid_orders_count ?? cancelRequest?.affected_orders_count)
      : (cancelRequest?.affected_orders_count ?? event.paid_orders_count)) ?? 0
  const affectedTicketsCount =
    (isPending
      ? (event.issued_tickets_count ?? cancelRequest?.affected_tickets_count)
      : (cancelRequest?.affected_tickets_count ?? event.issued_tickets_count)) ?? 0

  const sessions = event.sessions || []
  const ticketTypes = event.ticket_types || []

  const sessionsWithTickets = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      if (!ticketTypes || ticketTypes.length === 0) return []
      return [{
        session: { id: 'default', session_name: isEnglish ? 'Whole Event' : 'Toàn bộ sự kiện' },
        sessionIndex: 1,
        tickets: ticketTypes,
        totalSold: ticketTypes.reduce((acc, t) => acc + Number(t.sold_quantity || 0), 0),
        totalCapacity: ticketTypes.reduce((acc, t) => acc + Number(t.quantity || 0), 0),
      }]
    }

    const matchedTicketIds = new Set()
    const grouped = sessions.map((sess, idx) => {
      const tickets = ticketTypes.filter((tt) => {
        const matches = String(tt.event_session_id) === String(sess.id)
        if (matches) matchedTicketIds.add(tt.id)
        return matches
      })
      const totalSold = tickets.reduce((acc, t) => acc + Number(t.sold_quantity || 0), 0)
      const totalCapacity = tickets.reduce((acc, t) => acc + Number(t.quantity || 0), 0)
      return {
        session: sess,
        sessionIndex: idx + 1,
        tickets,
        totalSold,
        totalCapacity,
      }
    })

    const unmappedTickets = ticketTypes.filter((tt) => !matchedTicketIds.has(tt.id))
    if (unmappedTickets.length > 0) {
      grouped.push({
        session: { id: 'unmapped', session_name: isEnglish ? 'General / Unassigned Session' : 'Vé chung / Chưa phân phiên' },
        sessionIndex: grouped.length + 1,
        tickets: unmappedTickets,
        totalSold: unmappedTickets.reduce((acc, t) => acc + Number(t.sold_quantity || 0), 0),
        totalCapacity: unmappedTickets.reduce((acc, t) => acc + Number(t.quantity || 0), 0),
      })
    }

    return grouped
  }, [sessions, ticketTypes, isEnglish])

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 [html.light_&]:border-slate-200/80 pb-5">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/events/review"
            className="grid size-9 place-items-center rounded-xl border border-white/10 bg-[#0d172e] text-slate-300 hover:bg-white/10 hover:text-white transition [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-100"
            title={isEnglish ? 'Back to event review list' : 'Quay lại danh sách duyệt sự kiện'}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white [html.light_&]:text-[#0D1B2A]">
              {isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}
            </h1>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isPending && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700 [html.light_&]:border-amber-300">
              <Clock className="size-3.5" />
              {isEnglish ? 'Pending Cancellation Review' : 'Đang chờ duyệt hủy'}
            </span>
          )}
          {isApproved && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 [html.light_&]:bg-red-50 [html.light_&]:text-red-700 [html.light_&]:border-red-300">
              <CheckCircle2 className="size-3.5" />
              {isEnglish ? 'Cancellation Approved' : 'Đã phê duyệt hủy'}
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700 [html.light_&]:border-slate-300">
              <XCircle className="size-3.5" />
              {isEnglish ? 'Cancellation Rejected' : 'Đã từ chối hủy'}
            </span>
          )}

          {slaRemaining && isPending && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
                slaRemaining.isOverdue
                  ? 'border-red-500/30 bg-red-500/10 text-red-400 [html.light_&]:bg-red-50 [html.light_&]:text-red-700 [html.light_&]:border-red-300'
                  : slaRemaining.isUrgent
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700 [html.light_&]:border-amber-300'
                  : 'border-white/10 bg-[#121c38] text-slate-300 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-200 [html.light_&]:text-slate-700'
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
            className="grid size-9 place-items-center rounded-xl border border-white/10 bg-[#0d172e] text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50 [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-100"
            title={isEnglish ? 'Refresh data' : 'Làm mới dữ liệu'}
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
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 [html.light_&]:border-slate-200 pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-2">
                  <CalendarX className="size-4 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
                  {isEnglish ? 'Cancellation Request from Organizer' : 'Yêu cầu hủy từ Ban tổ chức'}
                </h2>
                <p className="text-xs text-slate-400 [html.light_&]:text-slate-600 mt-0.5">
                  {isEnglish ? 'Submitted at: ' : 'Gửi lúc: '}{formatDate(cancelRequest?.requested_at || event.updated_at)}
                </p>
              </div>

              {/* Tag phân loại lý do */}
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border border-white/10 bg-[#121c38] text-slate-300 [html.light_&]:bg-amber-50/80 [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A]">
                {cancelRequest?.reason_code === 'FORCE_MAJEURE'
                  ? (isEnglish ? 'Force Majeure' : 'Trường hợp bất khả kháng')
                  : (isEnglish ? 'Organizer Request' : 'Lý do từ Ban tổ chức')}
              </span>
            </div>

            {/* Chi tiết giải trình */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A] block mb-1">
                  {isEnglish ? 'Organizer Explanation:' : 'Giải trình của Ban tổ chức:'}
                </label>
                <div className="mt-1.5 rounded-xl border border-white/10 bg-[#080f24] p-3.5 text-sm text-slate-200 leading-relaxed [html.light_&]:bg-[#FAF5EC] [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A]">
                  {cancelRequest?.reason_note || cancelRequest?.note || (isEnglish ? 'No detailed explanation provided.' : 'Không có giải trình chi tiết.')}
                </div>
              </div>

              {/* Thông số phương thức & cam kết */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {cancelRequest?.refund_mode && (
                  <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                    <span className="text-sm font-semibold text-slate-400 [html.light_&]:text-slate-600 block mb-1">
                      {isEnglish ? 'Refund Method:' : 'Phương thức hoàn tiền:'}
                    </span>
                    <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-1.5">
                      <Coins className="size-3.5 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
                      {cancelRequest?.refund_mode === 'MODE_A'
                        ? (isEnglish ? 'Automatic via PayOS' : 'Tự động qua cổng PayOS')
                        : (isEnglish ? 'Manual VietQR Transfer' : 'Chuyển khoản thủ công VietQR')}
                    </span>
                  </div>
                )}

                <div className={`rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 ${!cancelRequest?.refund_mode ? 'sm:col-span-2' : ''}`}>
                  <span className="text-sm font-semibold text-slate-400 [html.light_&]:text-slate-600 block mb-1">
                    {isEnglish ? 'Refund Commitment:' : 'Cam kết hoàn tiền:'}
                  </span>
                  <span className="font-semibold text-emerald-400 [html.light_&]:text-emerald-700 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-emerald-400 [html.light_&]:text-emerald-600" />
                    {isEnglish ? 'Committed 100% Liability' : 'Đã cam kết trách nhiệm 100%'}
                  </span>
                </div>
              </div>

              {/* Lịch sử đã duyệt/từ chối */}
              {(isApproved || isRejected) && cancelRequest?.reviewed_at && (
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 text-xs space-y-1 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  <p className="font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'Admin Review History:' : 'Lịch sử phản hồi của Quản trị viên:'}
                  </p>
                  <p className="text-slate-400 [html.light_&]:text-slate-600">
                    {isEnglish ? 'Time: ' : 'Thời gian: '}{formatDate(cancelRequest.reviewed_at)}
                  </p>
                  {cancelRequest.admin_note && (
                    <p className="text-slate-300 [html.light_&]:text-slate-700">
                      {isEnglish ? 'Note: ' : 'Ghi chú: '}<span className="text-slate-200 [html.light_&]:text-[#0D1B2A]">"{cancelRequest.admin_note}"</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Đánh giá Tác động & Thống kê */}
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A] mb-4 flex items-center gap-2">
              <Coins className="size-4 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
              {isEnglish ? 'Impact Statistics & Refund Obligations' : 'Thống kê tác động & nghĩa vụ hoàn tiền'}
            </h3>

            {/* 3 Thống kê chính */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-white/10 bg-[#121c38] p-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                <span className="text-xs text-slate-400 [html.light_&]:text-slate-600 block">
                  {isEnglish ? 'Estimated Refund Amount' : 'Tổng tiền hoàn dự kiến'}
                </span>
                <p className="mt-1 text-lg font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {formatCurrency(totalRefundAmount)}
                </p>
                <p className="text-[11px] text-slate-500 [html.light_&]:text-slate-600 mt-0.5">
                  {isEnglish ? '100% refund to buyers' : 'Hoàn 100% cho người mua'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                <span className="text-xs text-slate-400 [html.light_&]:text-slate-600 block">
                  {isEnglish ? 'Paid Orders' : 'Đơn hàng thanh toán'}
                </span>
                <p className="mt-1 text-lg font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {affectedOrdersCount.toLocaleString()} {isEnglish ? 'orders' : 'đơn'}
                </p>
                <p className="text-[11px] text-slate-500 [html.light_&]:text-slate-600 mt-0.5">
                  {isEnglish ? 'Requires refund request' : 'Cần tạo phiếu hoàn tiền'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-4 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                <span className="text-xs text-slate-400 [html.light_&]:text-slate-600 block">
                  {isEnglish ? 'Issued Tickets' : 'Vé đã phát hành'}
                </span>
                <p className="mt-1 text-lg font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {affectedTicketsCount.toLocaleString()} {isEnglish ? 'tickets' : 'vé'}
                </p>
                <p className="text-[11px] text-slate-500 [html.light_&]:text-slate-600 mt-0.5">
                  {isEnglish ? 'Move to refund status' : 'Chuyển sang trạng thái hoàn'}
                </p>
              </div>
            </div>

            {/* Danh sách Suất diễn / Sessions */}
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-white [html.light_&]:text-[#0D1B2A] mb-2">
                {isEnglish ? `Event Sessions (${sessions.length})` : `Các phiên sự kiện (${sessions.length})`}
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {sessions.map((sess, idx) => (
                  <div
                    key={sess.id || idx}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-[#080f24] p-3 text-xs [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200"
                  >
                    <div>
                      <p className="font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                        {sess.session_name || (isEnglish ? `Session #${idx + 1}` : `Phiên #${idx + 1}`)}
                      </p>
                      <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 mt-0.5">
                        {formatDate(sess.start_time)} – {formatDate(sess.end_time)}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 [html.light_&]:text-slate-600 uppercase">
                      {formatSessionStatus(sess.status, isEnglish)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Danh sách Loại vé & Đã bán phân chia theo từng Phiên */}
            {sessionsWithTickets.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A] mb-2.5 flex items-center justify-between">
                  <span>
                    {isEnglish ? `Ticket Tier Structure by Session (${ticketTypes.length} ticket tiers)` : `Cơ cấu loại vé theo phiên (${ticketTypes.length} loại vé)`}
                  </span>
                </h4>
                <div className="space-y-3">
                  {sessionsWithTickets.map((group) => (
                    <div
                      key={group.session.id || group.sessionIndex}
                      className="rounded-xl border border-white/10 bg-[#080f24] overflow-hidden [html.light_&]:bg-white [html.light_&]:border-slate-200"
                    >
                      {/* Tiêu đề phiên */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] p-3 text-xs [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
                        <div>
                          <p className="font-semibold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-1.5">
                            <Calendar className="size-3.5 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
                            {group.session.session_name || (isEnglish ? `Session #${group.sessionIndex}` : `Phiên #${group.sessionIndex}`)}
                          </p>
                          {(group.session.start_time || group.session.end_time) && (
                            <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 mt-0.5">
                              {formatDate(group.session.start_time)} – {formatDate(group.session.end_time)}
                            </p>
                          )}
                        </div>
                        <span
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border ${
                            group.totalSold > 0
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700 [html.light_&]:border-emerald-300'
                              : 'border-white/10 bg-white/5 text-slate-400 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-600 [html.light_&]:border-slate-200'
                          }`}
                        >
                          {isEnglish ? 'Sold: ' : 'Đã bán: '}<span className="font-bold text-white [html.light_&]:text-[#0D1B2A]">{group.totalSold}</span> / {group.totalCapacity?.toLocaleString() ?? 0} {isEnglish ? 'tickets' : 'vé'}
                        </span>
                      </div>

                      {/* Bảng vé thuộc phiên */}
                      {group.tickets.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-white/5 bg-white/[0.01] text-[11px] text-slate-400 [html.light_&]:text-slate-600 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/50 font-semibold">
                              <tr>
                                <th className="py-2 px-3">{isEnglish ? 'Ticket Tier' : 'Loại vé'}</th>
                                <th className="py-2 px-3">{isEnglish ? 'Price' : 'Giá vé'}</th>
                                <th className="py-2 px-3">{isEnglish ? 'Sold / Total' : 'Đã bán / Tổng vé'}</th>
                                <th className="py-2 px-3 text-right">{isEnglish ? 'Total Revenue' : 'Tổng tiền vé đã bán'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 [html.light_&]:divide-slate-200 text-slate-300 [html.light_&]:text-slate-700">
                              {group.tickets.map((tt, tIdx) => {
                                const sold = Number(tt.sold_quantity || 0)
                                const total = Number(tt.quantity || 0)
                                const price = Number(tt.price || 0)
                                const soldRevenue = sold * price
                                return (
                                  <tr key={tt.id || tIdx} className="hover:bg-white/[0.01] [html.light_&]:hover:bg-slate-50 transition-colors">
                                    <td className="py-2.5 px-3">
                                      <p className="font-medium text-white [html.light_&]:text-[#0D1B2A]">
                                        {isEnglish ? (translatePhrase(tt.name, 'en') || tt.name) : tt.name}
                                      </p>
                                      {tt.description && (
                                        <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 line-clamp-1 mt-0.5">{tt.description}</p>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 font-medium text-slate-200 [html.light_&]:text-slate-700">
                                      {formatCurrency(price)}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span
                                        className={`font-bold ${
                                          sold > 0 ? 'text-emerald-400 [html.light_&]:text-emerald-700' : 'text-slate-400 [html.light_&]:text-slate-500'
                                        }`}
                                      >
                                        {sold.toLocaleString()}
                                      </span>
                                      {' / '}
                                      <span className="text-slate-300 [html.light_&]:text-slate-600">{total > 0 ? total.toLocaleString() : '—'}</span>
                                      {total > 0 && (
                                        <span className="ml-2 text-[10px] text-slate-400 [html.light_&]:text-slate-500">
                                          ({Math.round((sold / total) * 100)}%)
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-medium text-slate-200 [html.light_&]:text-slate-700">
                                      {soldRevenue > 0 ? (
                                        <span className="text-emerald-400 [html.light_&]:text-emerald-700 font-semibold">{formatCurrency(soldRevenue)}</span>
                                      ) : (
                                        <span className="text-slate-500">{formatCurrency(0)}</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-500">
                          {isEnglish ? 'No ticket tiers for this session.' : 'Chưa có loại vé nào cho phiên này.'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Thông tin Ban tổ chức */}
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A] mb-4 flex items-center gap-2">
              <Building2 className="size-4 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
              {isEnglish ? 'Organizer Information' : 'Thông tin Ban tổ chức'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                <span className="text-slate-400 [html.light_&]:text-slate-600 block">
                  {isEnglish ? 'Organizer' : 'Đơn vị tổ chức'}
                </span>
                <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A] text-sm block truncate">{event.organizer_name || '—'}</span>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                <span className="text-slate-400 [html.light_&]:text-slate-600 block">
                  {isEnglish ? 'Contact Email' : 'Email liên hệ'}
                </span>
                <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-1.5 truncate">
                  <Mail className="size-3.5 text-[#C99A47] [html.light_&]:text-[#C99A47] shrink-0" />
                  {event.organizer_email || '—'}
                </span>
              </div>

              {event.organizer_phone && (
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  <span className="text-slate-400 [html.light_&]:text-slate-600 block">
                    {isEnglish ? 'Phone Number' : 'Số điện thoại'}
                  </span>
                  <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-1.5">
                    <Phone className="size-3.5 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
                    {event.organizer_phone}
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 space-y-0.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                <span className="text-slate-400 [html.light_&]:text-slate-600 block">
                  {isEnglish ? 'Event Schedule' : 'Thời gian diễn ra'}
                </span>
                <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
                  {formatDate(event.start_time)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 5 Cols (Decision Form) */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-6 shadow-sm [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
            <h3 className="text-base font-bold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-2 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
              <ShieldCheck className="size-4 text-[#C99A47] [html.light_&]:text-[#C99A47]" />
              {isEnglish ? 'Administrator Decision' : 'Quyết định của Quản trị viên'}
            </h3>

            {isPending ? (
              <form onSubmit={handleOpenConfirm} className="mt-5 space-y-5">
                {/* 1. Decision Selection */}
                <div>
                  <label className="text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A] block mb-2">
                    {isEnglish ? 'Action:' : 'Hành động xử lý:'}
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
                          ? 'border-red-500 bg-red-500/10 text-white [html.light_&]:bg-red-50 [html.light_&]:border-red-400'
                          : 'border-white/10 bg-[#121c38] text-slate-400 hover:border-white/20 hover:text-white [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-slate-600 [html.light_&]:hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm text-red-400 [html.light_&]:text-red-600">
                        <CheckCircle2 className="size-4" />
                        {isEnglish ? 'Approve Cancellation' : 'Duyệt hủy sự kiện'}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-slate-500 leading-tight">
                        {isEnglish ? 'Approve cancellation & initiate refunds' : 'Chấp thuận hủy và khởi tạo hoàn tiền'}
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
                          ? 'border-amber-500 bg-amber-500/10 text-white [html.light_&]:bg-amber-50 [html.light_&]:border-amber-400'
                          : 'border-white/10 bg-[#121c38] text-slate-400 hover:border-white/20 hover:text-white [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-slate-600 [html.light_&]:hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm text-amber-400 [html.light_&]:text-amber-600">
                        <XCircle className="size-4" />
                        {isEnglish ? 'Reject Request' : 'Từ chối yêu cầu'}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-slate-500 leading-tight">
                        {isEnglish ? 'Reject request & pause sales' : 'Bác bỏ yêu cầu & tạm dừng bán vé'}
                      </p>
                    </button>
                  </div>
                </div>

                {/* 2. Admin Note Input */}
                <div>
                  <label className="text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A] flex items-center justify-between mb-1.5">
                    <span>
                      {decision === 'APPROVE'
                        ? (isEnglish ? 'Note for Organizer (optional):' : 'Ghi chú cho Ban tổ chức (tùy chọn):')
                        : (isEnglish ? 'Rejection reason (required):' : 'Lý do từ chối yêu cầu (bắt buộc):')}
                    </span>
                    {decision === 'REJECT' && (
                      <span className="text-[11px] font-bold text-red-400 [html.light_&]:text-red-600">
                        {isEnglish ? '* Required' : '* Bắt buộc'}
                      </span>
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
                        ? (isEnglish
                            ? 'e.g. EventHub Admin approves the cancellation reason. Refund process will be initiated...'
                            : 'Ví dụ: Ban Quản trị EventHub đồng thuận với lý do hủy sự kiện. Tiến trình hoàn tiền sẽ được khởi tạo...')
                        : (isEnglish
                            ? 'e.g. Cancellation reason is unclear or supporting documentation is insufficient...'
                            : 'Ví dụ: Lý do hủy chưa rõ ràng hoặc hồ sơ giải trình chưa đầy đủ...')
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#080f24] p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-white/30 transition resize-none [html.light_&]:bg-[#FAF5EC] [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:placeholder-slate-400 [html.light_&]:focus:border-[#C99A47]"
                  />
                  {formError && (
                    <p className="mt-1.5 text-xs text-red-400 [html.light_&]:text-red-600 flex items-center gap-1 font-medium">
                      <AlertTriangle className="size-3.5" />
                      {formError}
                    </p>
                  )}
                </div>

                {/* 3. System Note Callout */}
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 text-xs text-slate-300 leading-relaxed space-y-1.5 [html.light_&]:bg-amber-50/70 [html.light_&]:border-amber-200/80 [html.light_&]:text-slate-700">
                  <p className="text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                    {decision === 'APPROVE'
                      ? (isEnglish ? 'Note when approving cancellation:' : 'Lưu ý khi duyệt hủy sự kiện:')
                      : (isEnglish ? 'Note when rejecting request:' : 'Lưu ý khi từ chối yêu cầu:')}
                  </p>
                  {decision === 'APPROVE' ? (
                    <ul className="list-disc list-inside space-y-1 text-slate-400 [html.light_&]:text-slate-600 text-[11px]">
                      <li>
                        {isEnglish ? 'Event status will change to CANCELLED.' : <>Sự kiện chuyển sang trạng thái <strong>Đã hủy (CANCELLED)</strong>.</>}
                      </li>
                      <li>
                        {isEnglish ? 'Permanently close ticket sales and cancel all issued valid tickets.' : 'Đóng vĩnh viễn cổng bán vé, hủy toàn bộ vé hợp lệ đã xuất.'}
                      </li>
                      <li>
                        {isEnglish ? 'Initiate 100% refund list for all paid orders.' : 'Khởi tạo danh sách hoàn tiền 100% cho các đơn hàng đã thanh toán.'}
                      </li>
                      <li>
                        {isEnglish ? 'Send event cancellation notifications to ticket buyers and the organizer.' : 'Gửi thông báo hủy sự kiện đến người mua vé và Ban tổ chức.'}
                      </li>
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside space-y-1 text-slate-400 [html.light_&]:text-slate-600 text-[11px]">
                      <li>
                        {isEnglish ? 'Event cancellation request will be rejected.' : 'Yêu cầu hủy sự kiện sẽ bị từ chối.'}
                      </li>
                      <li>
                        {isEnglish ? 'Remove cancellation sales pause, resume ticket sales normally.' : 'Gỡ bỏ lệnh tạm dừng bán vé do yêu cầu hủy, tiếp tục bán vé bình thường.'}
                      </li>
                      <li>
                        {isEnglish ? 'Send rejection notice with reason to organizer account.' : 'Gửi thông báo kèm lý do từ chối đến tài khoản Ban tổ chức.'}
                      </li>
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
                      {isEnglish ? 'Approve Event Cancellation' : 'Phê duyệt hủy sự kiện'}
                    </>
                  ) : (
                    <>
                      <X className="size-4" />
                      {isEnglish ? 'Reject Cancellation Request' : 'Từ chối yêu cầu hủy'}
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Already Processed */
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#121c38] p-4 text-center [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
                  {isApproved ? (
                    <>
                      <CheckCircle2 className="mx-auto size-7 text-red-400 [html.light_&]:text-red-600 mb-2" />
                      <h4 className="font-bold text-sm text-white [html.light_&]:text-[#0D1B2A]">
                        {isEnglish ? 'Request has been approved' : 'Yêu cầu đã được phê duyệt'}
                      </h4>
                      <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-slate-600">
                        {isEnglish ? 'Event is cancelled and 100% refund list has been automatically created.' : 'Sự kiện đã hủy và danh sách hoàn tiền đã được tạo tự động.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <XCircle className="mx-auto size-7 text-slate-400 [html.light_&]:text-slate-600 mb-2" />
                      <h4 className="font-bold text-sm text-white [html.light_&]:text-[#0D1B2A]">
                        {isEnglish ? 'Request has been rejected' : 'Yêu cầu đã bị từ chối'}
                      </h4>
                      <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-slate-600">
                        {isEnglish ? 'Administrator has rejected the cancellation request. Event continues operations.' : 'Ban Quản trị đã từ chối yêu cầu hủy. Sự kiện tiếp tục hoạt động.'}
                      </p>
                    </>
                  )}
                </div>

                <Link
                  to="/admin/events/review"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#121c38] py-2.5 px-4 text-xs font-semibold text-white hover:bg-white/10 transition [html.light_&]:bg-white [html.light_&]:border-slate-300 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-slate-100"
                >
                  <ArrowLeft className="size-4" />
                  {isEnglish ? 'Back to event review list' : 'Quay lại danh sách duyệt sự kiện'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2-Step Confirmation Modal */}
      <ConfirmModal
        open={confirmModalOpen}
        title={
          decision === 'APPROVE'
            ? (isEnglish ? 'Confirm Event Cancellation Approval' : 'Xác nhận phê duyệt hủy sự kiện')
            : (isEnglish ? 'Confirm Cancellation Request Rejection' : 'Xác nhận từ chối yêu cầu hủy')
        }
        subtitle={
          decision === 'APPROVE'
            ? (isEnglish
                ? 'Approve cancellation and initiate refund process for ticket buyers.'
                : 'Chấp thuận hủy sự kiện và khởi tạo tiến trình hoàn tiền cho người mua.')
            : (isEnglish
                ? 'Reject cancellation request from organizer and maintain sales paused.'
                : 'Bác bỏ yêu cầu hủy từ Ban tổ chức và giữ trạng thái tạm dừng bán vé.')
        }
        eventTitle={isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}
        description={
          decision === 'APPROVE'
            ? (isEnglish
                ? 'Are you sure you want to approve cancelling this event? This action will permanently close ticket sales, cancel issued tickets, and initiate full refunds for paid orders.'
                : 'Bạn có chắc chắn muốn phê duyệt hủy sự kiện này? Hành động này sẽ đóng bán vé vĩnh viễn, hủy vé đã xuất và tạo phiếu hoàn tiền cho các đơn hàng đã thanh toán.')
            : (isEnglish
                ? 'Are you sure you want to reject this cancellation request? Sales status will revert to paused and the rejection reason will be sent to the organizer.'
                : 'Bạn có chắc chắn muốn từ chối yêu cầu hủy? Trạng thái bán vé sẽ chuyển về Tạm dừng bán vé và lý do từ chối sẽ được gửi ngay đến Ban tổ chức.')
        }
        tone={decision === 'APPROVE' ? 'danger' : 'warning'}
        confirmText={
          decision === 'APPROVE'
            ? (isEnglish ? 'Approve Cancellation' : 'Phê duyệt hủy')
            : (isEnglish ? 'Reject Request' : 'Từ chối yêu cầu')
        }
        cancelText={isEnglish ? 'Cancel' : 'Hủy bỏ'}
        onConfirm={handleExecuteDecision}
        onCancel={() => setConfirmModalOpen(false)}
        isPending={reviewCancellationMutation.isPending}
        isEnglish={isEnglish}
      />
    </div>
  )
}
