import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Globe,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerTable,
  TableActionButton,
} from './OrganizerComponents.jsx'
import { EventActionsDropdown } from './EventActionsDropdown.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { getCategoryName } from '@/i18n/categoryNames.js'
import { translatePhrase } from '@/i18n/phraseDictionary.js'
import { CosmicSelect } from '@/components/CosmicSelect.jsx'
import { ToggleSalesConfirmModal } from './OrganizerEventModals.jsx'
import {
  cancelOrganizerEvent,
  deleteOrganizerDraftEvent,
  fetchOrganizerEvents,
  hideOrganizerEvent,
  pauseSalesOrganizerEvent,
  publishOrganizerEvent,
  resumeSalesOrganizerEvent,
  submitCancellationRequest,
  unhideOrganizerEvent,
  withdrawCancellationRequest,
} from '@/services/organizerEvents.js'
import { getDisplayStateInfo, getSalesStatusInfo, isEventEnded } from './eventStatusUtil.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { fetchCurrentPlan } from '@/services/subscriptions.js'

export function getPrimaryEventStatus(event, organizerPlan = null, isEnglish = false) {
  if (!event) return { key: 'UNKNOWN', label: isEnglish ? 'Unknown' : 'Không xác định', tone: 'slate' }

  // 1. Đã hủy (Cao nhất)
  if (event.status === 'CANCELLED') {
    return { key: 'CANCELLED', label: isEnglish ? 'Cancelled' : 'Đã hủy', tone: 'red' }
  }

  // 2. Chờ duyệt hủy
  if (event.cancel_request?.status === 'PENDING') {
    return { key: 'CANCEL_REQUESTED', label: isEnglish ? 'Pending Cancellation' : 'Chờ duyệt hủy', tone: 'red' }
  }

  // 3. Bị đình chỉ bởi Admin
  if (event.display_state === 'SUSPENDED_BY_ADMIN') {
    return { key: 'SUSPENDED', label: isEnglish ? 'Suspended' : 'Bị đình chỉ', tone: 'red' }
  }

  // 4. Đã kết thúc (quá thời gian sự kiện hoặc trạng thái COMPLETED)
  const ended = isEventEnded(event)
  if (ended || (event.status === 'COMPLETED' && event.approval_status !== 'APPROVED')) {
    return { key: 'COMPLETED', label: isEnglish ? 'Ended' : 'Đã kết thúc', tone: 'purple' }
  }

  // 5. Đã ẩn (BTC chủ động ẩn sự kiện)
  if (event.display_state === 'HIDDEN_BY_ORGANIZER' || event.status === 'HIDDEN') {
    return { key: 'HIDDEN', label: isEnglish ? 'Hidden' : 'Đã ẩn', tone: 'neutral' }
  }

  // 6. Tạm dừng bán vé
  if (event.sales_status === 'PAUSED') {
    return { key: 'PAUSED', label: isEnglish ? 'Paused Sales' : 'Tạm dừng bán', tone: 'orange' }
  }

  // 7. Sửa đổi chờ duyệt
  if (event.pending_revision && event.pending_revision.status === 'SUBMITTED') {
    return { key: 'REVISION_PENDING', label: isEnglish ? 'Pending Revision' : 'Sửa đổi chờ duyệt', tone: 'amber' }
  }

  // 8. Đã duyệt (Chờ BTC bấm xuất bản)
  const isApprovedAwaitingPublish = !ended && (
    (event.status === 'COMPLETED' && event.approval_status === 'APPROVED') ||
    event.status === 'APPROVED'
  )
  if (isApprovedAwaitingPublish) {
    return { key: 'APPROVED', label: isEnglish ? 'Awaiting Publish' : 'Chờ xuất bản', tone: 'cyan' }
  }

  // 9. Đang bán vé (Sự kiện công khai, mở bán vé bình thường)
  if (event.status === 'PUBLISHED') {
    return { key: 'ON_SALE', label: isEnglish ? 'Selling Tickets' : 'Đang bán vé', tone: 'green' }
  }

  // 10. Chờ duyệt (Sự kiện mới gửi Admin xét duyệt)
  if (event.status === 'PENDING_REVIEW') {
    if (organizerPlan?.priority_support) {
      return {
        key: 'PENDING_REVIEW',
        label: isEnglish ? 'Pending Review (Priority)' : 'Chờ duyệt (Ưu tiên)',
        tone: 'amber',
        isPriority: true,
      }
    }
    return {
      key: 'PENDING_REVIEW',
      label: isEnglish ? 'Pending Review' : 'Chờ duyệt',
      tone: 'amber',
    }
  }

  // 11. Bản nháp
  if (event.status === 'DRAFT') {
    return { key: 'DRAFT', label: isEnglish ? 'Draft' : 'Bản nháp', tone: 'slate' }
  }

  return { key: event.status, label: event.status, tone: 'slate' }
}

const EVENT_STATUS_FILTERS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ON_SALE', label: 'Đang bán vé' },
  { value: 'PAUSED', label: 'Tạm dừng bán' },
  { value: 'HIDDEN', label: 'Đã ẩn' },
  { value: 'APPROVED', label: 'Chờ xuất bản' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'REVISION_PENDING', label: 'Sửa đổi chờ duyệt' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'COMPLETED', label: 'Đã kết thúc' },
  { value: 'CANCEL_REQUESTED', label: 'Chờ duyệt hủy' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function formatEventDate(iso) {
  if (!iso) return '—'
  const isEn = getAutoLocale() === 'en-US'
  return new Date(iso).toLocaleDateString(getAutoLocale(), {
    day: '2-digit',
    month: isEn ? 'short' : '2-digit',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Publish Confirm Modal
// ---------------------------------------------------------------------------
function PublishConfirmModal({ event, onConfirm, onClose, loading }) {
  const { isEnglish } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15">
            <Globe className="size-5 text-success" />
          </span>
          <div>
            <h3 className="text-xl font-black text-white">{isEnglish ? 'Confirm Publication' : 'Xác nhận xuất bản'}</h3>
            <p className="mt-1 text-sm text-slate-300">
              {isEnglish ? 'The event will be publicly visible immediately after publishing.' : 'Sự kiện sẽ hiển thị công khai ngay sau khi xuất bản.'}
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
            {isEnglish ? 'Event Date: ' : 'Ngày diễn ra: '}{formatEventDate(event.start_time)}
          </p>
        </div>

        {/* Info note */}
        <div className="mt-4 rounded-xl border border-tertiary/30 bg-tertiary/[0.08] p-3 text-xs text-primary">
          <ul className="list-inside list-disc space-y-1">
            <li>{isEnglish ? 'The event will appear in search results and homepage.' : 'Sự kiện sẽ xuất hiện trong danh sách tìm kiếm và trang chủ.'}</li>
            <li>{isEnglish ? 'Attendees can purchase tickets immediately after publishing.' : 'Người dùng có thể mua vé ngay sau khi xuất bản.'}</li>
            <li>{isEnglish ? 'You can still edit event details after publishing.' : 'Bạn vẫn có thể chỉnh sửa thông tin sau khi xuất bản.'}</li>
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
            {isEnglish ? 'Later' : 'Để sau'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                {isEnglish ? 'Publishing...' : 'Đang xuất bản...'}
              </span>
            ) : (
              isEnglish ? 'Publish Now' : 'Xuất bản ngay'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cancel / Request Cancel Modal
// ---------------------------------------------------------------------------
function CancelOrRequestCancelModal({ event, onConfirm, onClose, loading, error }) {
  const { isEnglish } = useLanguage()
  const hasPaidOrders = Number(event.paid_orders_count || 0) > 0
  const [reasonCode, setReasonCode] = useState('ORGANIZER_REASON')
  const [reasonNote, setReasonNote] = useState('')
  const [refundMode, setRefundMode] = useState('MODE_B')
  const [commitmentAccepted, setCommitmentAccepted] = useState(false)

  const isFormValid = !hasPaidOrders || (reasonNote.trim().length >= 20 && commitmentAccepted)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!isFormValid || loading) return

    if (hasPaidOrders) {
      onConfirm({
        is_request: true,
        reason_code: reasonCode,
        reason_note: reasonNote.trim(),
        refund_mode: refundMode,
        commitment_accepted: commitmentAccepted,
      })
    } else {
      onConfirm({
        is_request: false,
        reason: reasonNote.trim() || 'Hủy sự kiện theo yêu cầu của ban tổ chức',
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b1329] p-6 sm:p-7 shadow-2xl shadow-black/90 text-white my-8">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${hasPaidOrders ? 'bg-amber-500/15 text-amber-400' : 'bg-error/15 text-error'}`}>
            {hasPaidOrders ? <ShieldAlert className="size-6" /> : <AlertTriangle className="size-6" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {hasPaidOrders
                ? (isEnglish ? 'Request Event Cancellation' : 'Gửi yêu cầu hủy sự kiện')
                : (isEnglish ? 'Confirm Event Cancellation' : 'Xác nhận hủy sự kiện')}
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              {hasPaidOrders
                ? (isEnglish
                    ? 'Orders have been placed for this event. You must submit a request and refund commitment for Admin approval.'
                    : 'Sự kiện đã phát sinh đơn hàng. Cần gửi yêu cầu và cam kết hoàn tiền để Admin phê duyệt.')
                : (isEnglish
                    ? 'No tickets sold yet. You can cancel immediately.'
                    : 'Sự kiện chưa bán được vé nào. Bạn có thể hủy trực tiếp ngay lập tức.')}
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span>{isEnglish ? 'Event Date: ' : 'Ngày diễn ra: '}{formatEventDate(event.start_time)}</span>
            <span>•</span>
            <span>{isEnglish ? 'Paid orders: ' : 'Đơn đã thanh toán: '}<strong className={hasPaidOrders ? 'text-amber-400 font-bold' : 'text-slate-400'}>{event.paid_orders_count || 0} {isEnglish ? 'orders' : 'đơn'}</strong></span>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {hasPaidOrders ? (
            <>
              {/* Reason Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEnglish ? 'Cancellation Reason Category' : 'Nhóm lý do hủy'} <span className="text-rose-400">*</span>
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#121c38] px-3 py-2 text-sm text-white outline-none focus:border-primary"
                >
                  <option value="ORGANIZER_REASON">
                    {isEnglish ? 'Organizer Reason (Schedule, planning, financial)' : 'Lý do từ Ban tổ chức (Kế hoạch, lịch trình, tài chính)'}
                  </option>
                  <option value="FORCE_MAJEURE">
                    {isEnglish ? 'Force Majeure (Natural disaster, pandemic, legal)' : 'Lý do bất khả kháng (Thiên tai, dịch bệnh, pháp lý)'}
                  </option>
                </select>
              </div>

              {/* Reason Note */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    {isEnglish ? 'Detailed explanation of cancellation reason' : 'Giải trình chi tiết lý do hủy'} <span className="text-rose-400">*</span>
                  </label>
                  <span className={`text-[11px] ${reasonNote.trim().length >= 20 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {reasonNote.trim().length}/20 {isEnglish ? 'chars' : 'ký tự'}
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder={
                    isEnglish
                      ? 'State clearly the cancellation reason and solution plan for Admin review (min 20 characters)...'
                      : 'Nêu rõ lý do hủy và phương án giải quyết để Admin xem xét phê duyệt (tối thiểu 20 ký tự)...'
                  }
                  className="w-full rounded-xl border border-white/15 bg-[#121c38] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Refund Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEnglish ? 'Refund method for ticket buyers' : 'Phương thức hoàn tiền cho người mua vé'} <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${refundMode === 'MODE_B' ? 'border-primary bg-primary/10 text-white' : 'border-white/10 bg-[#121c38] text-slate-300'}`}>
                    <input
                      type="radio"
                      name="refundMode"
                      value="MODE_B"
                      checked={refundMode === 'MODE_B'}
                      onChange={() => setRefundMode('MODE_B')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-bold">{isEnglish ? 'VietQR Bank Transfer' : 'Chuyển khoản VietQR'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEnglish ? 'Organizer transfers directly according to refund audit list.' : 'BTC tự chuyển tiền theo danh sách đối soát hoàn tiền.'}
                      </p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${refundMode === 'MODE_A' ? 'border-primary bg-primary/10 text-white' : 'border-white/10 bg-[#121c38] text-slate-300'}`}>
                    <input
                      type="radio"
                      name="refundMode"
                      value="MODE_A"
                      checked={refundMode === 'MODE_A'}
                      onChange={() => setRefundMode('MODE_A')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-bold">{isEnglish ? 'Automatic via payOS' : 'Tự động qua payOS'}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEnglish ? 'Requires Payout API activated in payment settings.' : 'Yêu cầu đã kích hoạt Payout API trong cài đặt thanh toán.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Commitment Checkbox */}
              <div className="pt-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs leading-relaxed text-white select-none">
                  <input
                    type="checkbox"
                    checked={commitmentAccepted}
                    onChange={(e) => setCommitmentAccepted(e.target.checked)}
                    className="mt-0.5 size-4 rounded border border-white/20 bg-slate-900/60 accent-[#C99A47] cursor-pointer focus:ring-1 focus:ring-[#C99A47] shrink-0"
                  />
                  <span>
                    <strong className="font-semibold text-white">
                      {isEnglish ? 'Refund Obligation Commitment (Required): ' : 'Cam kết nghĩa vụ hoàn tiền (Bắt buộc): '}
                    </strong>
                    {isEnglish
                      ? 'I commit to refunding 100% of ticket amounts to buyers within a maximum of 7 business days. I understand that EventHub is an intermediary platform that does not hold ticket proceeds, and all financial refund obligations belong to the Organizer.'
                      : 'Tôi cam kết sẽ thực hiện hoàn trả 100% tiền vé cho người mua trong vòng tối đa 7 ngày làm việc. Tôi hiểu rõ EventHub là nền tảng trung gian không giữ tiền vé, và toàn bộ nghĩa vụ tài chính hoàn tiền thuộc về Ban tổ chức.'}
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isEnglish ? 'Cancellation Reason (Optional)' : 'Lý do hủy (Tùy chọn)'}
              </label>
              <textarea
                rows={2}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder={isEnglish ? 'Enter event cancellation reason...' : 'Nhập lý do hủy sự kiện...'}
                className="w-full rounded-xl border border-white/15 bg-[#121c38] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary resize-none"
              />
              <div className="mt-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-xs text-warning">
                <p className="font-semibold">⚠️ {isEnglish ? 'Note:' : 'Lưu ý:'}</p>
                <p className="mt-0.5">
                  {isEnglish
                    ? 'The event will be cancelled immediately and moved to cancelled status. This action cannot be undone.'
                    : 'Sự kiện sẽ bị hủy ngay lập tức và chuyển sang trạng thái đã hủy. Hành động này không thể hoàn tác.'}
                </p>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
            >
              {isEnglish ? 'Cancel' : 'Hủy bỏ'}
            </button>
            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                  {isEnglish ? 'Processing...' : 'Đang xử lý...'}
                </span>
              ) : hasPaidOrders ? (
                isEnglish ? 'Submit Cancellation Request' : 'Gửi yêu cầu hủy'
              ) : (
                isEnglish ? 'Confirm Cancellation' : 'Xác nhận hủy ngay'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle Hide Confirm Modal
// ---------------------------------------------------------------------------
function ToggleHideConfirmModal({ event, onConfirm, onClose, loading }) {
  const { isEnglish } = useLanguage()
  const isCurrentlyHidden = event?.display_state === 'HIDDEN_BY_ORGANIZER'
  const [reasonNote, setReasonNote] = useState('')

  const handleConfirm = () => {
    onConfirm({ reason: isCurrentlyHidden ? '' : (reasonNote.trim() || 'Tạm ẩn theo yêu cầu của ban tổ chức') })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isCurrentlyHidden ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-400'}`}>
            {isCurrentlyHidden ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {isCurrentlyHidden
                ? (isEnglish ? 'Confirm Unhiding Event' : 'Xác nhận hiện lại sự kiện')
                : (isEnglish ? 'Confirm Hiding Event' : 'Xác nhận tạm ẩn sự kiện')}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isCurrentlyHidden
                ? (isEnglish
                    ? 'The event will be publicly visible again on homepage and search.'
                    : 'Sự kiện sẽ được hiển thị công khai trở lại trên trang chủ và tìm kiếm.')
                : (isEnglish
                    ? 'The event will be hidden from homepage and customer search results.'
                    : 'Sự kiện sẽ bị ẩn khỏi trang chủ và kết quả tìm kiếm của khách hàng.')}
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
            {isEnglish ? 'Event Date: ' : 'Ngày diễn ra: '}{formatEventDate(event.start_time)}
          </p>
        </div>

        {!isCurrentlyHidden && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {isEnglish ? 'Reason for hiding (Optional)' : 'Lý do tạm ẩn (Tùy chọn)'}
            </label>
            <input
              type="text"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder={isEnglish ? 'Enter reason for hiding event...' : 'Nhập lý do tạm ẩn sự kiện...'}
              className="w-full rounded-xl border border-white/15 bg-[#121c38] p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Warning / Note */}
        <div className={`mt-4 rounded-xl border p-3 text-xs ${isCurrentlyHidden ? 'border-primary/30 bg-primary/10 text-primary-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {isCurrentlyHidden ? (
            <p>💡 {isEnglish ? 'Users can search and view event details normally after unhiding.' : 'Người dùng có thể tìm thấy sự kiện và tiếp tục xem thông tin bình thường sau khi mở lại.'}</p>
          ) : (
            <div className="space-y-1">
              <p>⚠️ <strong>{isEnglish ? 'Note:' : 'Lưu ý:'}</strong> {isEnglish ? 'When hiding the event, ticket sales will be automatically paused.' : 'Khi tạm ẩn sự kiện, tính năng bán vé sẽ tự động tạm dừng.'}</p>
              <p className="text-amber-300/80">
                {isEnglish
                  ? 'You will need to unhide the event first before reopening ticket sales.'
                  : 'Bạn cần hiện lại sự kiện trước nếu muốn tiếp tục mở bán vé cho khách hàng.'}
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-full border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            {isEnglish ? 'Cancel' : 'Hủy bỏ'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                {isEnglish ? 'Processing...' : 'Đang xử lý...'}
              </span>
            ) : isCurrentlyHidden ? (
              isEnglish ? 'Unhide Now' : 'Hiện lại ngay'
            ) : (
              isEnglish ? 'Hide Event' : 'Tạm ẩn sự kiện'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Delete Draft Confirm Modal
// ---------------------------------------------------------------------------
function DeleteDraftConfirmModal({ event, onConfirm, onClose, loading }) {
  const { isEnglish } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/50 bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/15">
            <Trash2 className="size-5 text-error" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-content">
              {isEnglish ? 'Confirm Deleting Draft' : 'Xác nhận xóa bản nháp'}
            </h3>
            <p className="mt-1 text-sm text-subtle">
              {isEnglish ? 'This action is permanent and cannot be undone.' : 'Hành động này sẽ xóa vĩnh viễn và không thể hoàn tác.'}
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-border-soft/40 bg-panel-soft p-4">
          <p className="text-sm font-semibold text-content">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</p>
          <p className="mt-1 text-xs text-subtle">
            {isEnglish ? 'Event Date: ' : 'Ngày diễn ra: '}{formatEventDate(event.start_time)}
          </p>
          <div className="mt-2">
            <Badge tone="gray">{isEnglish ? 'Draft' : 'Bản nháp'}</Badge>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-4 rounded-xl border border-error/30 bg-error/[0.07] p-3 text-sm text-error">
          <p className="font-semibold">⚠️ {isEnglish ? 'Warning:' : 'Cảnh báo:'}</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
            <li>{isEnglish ? 'The draft event will be permanently deleted from the list.' : 'Bản nháp sự kiện sẽ bị xóa vĩnh viễn khỏi danh sách.'}</li>
            <li>{isEnglish ? 'All configuration data, sessions and draft tickets will not be recoverable.' : 'Tất cả thông tin cấu hình, suất diễn và vé tạm thời sẽ không thể khôi phục.'}</li>
          </ul>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-full border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            {isEnglish ? 'Cancel' : 'Hủy bỏ'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-full bg-error px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-error/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {isEnglish ? 'Deleting...' : 'Đang xóa...'}
              </span>
            ) : (
              isEnglish ? 'Delete Permanently' : 'Xóa vĩnh viễn'
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
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const handledToastLocations = useRef(new Set())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [organizerPlan, setOrganizerPlan] = useState(null)

  useEffect(() => {
    fetchCurrentPlan()
      .then((res) => {
        if (res?.active && res?.plan) {
          setOrganizerPlan(res.plan)
        }
      })
      .catch(() => setOrganizerPlan(null))
  }, [])

  // Publish modal state
  const [publishTarget, setPublishTarget] = useState(null)
  const [publishLoading, setPublishLoading] = useState(false)

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Delete draft modal state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Hide / Unhide modal state
  const [hideTarget, setHideTarget] = useState(null)
  const [hideLoading, setHideLoading] = useState(false)

  // Pause / Resume Sales modal state
  const [salesTarget, setSalesTarget] = useState(null)
  const [salesLoading, setSalesLoading] = useState(false)

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

  const confirmCancel = async (payload = {}) => {
    if (!cancelTarget || cancelLoading) return
    setCancelLoading(true)
    setCancelError('')
    try {
      if (payload.is_request) {
        await submitCancellationRequest(cancelTarget.id, {
          reason_code: payload.reason_code,
          reason_note: payload.reason_note,
          note: payload.reason_note,
          refund_mode: payload.refund_mode,
          commitment_accepted: payload.commitment_accepted,
        })
        toast.success(`Đã gửi yêu cầu hủy sự kiện "${cancelTarget.title}" lên Admin phê duyệt.`)
      } else {
        await cancelOrganizerEvent(cancelTarget.id, { reason: payload.reason })
        toast.success(`Sự kiện "${cancelTarget.title}" đã được hủy thành công.`)
      }
      setCancelTarget(null)
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

  // ---- Withdraw cancellation request handlers ----
  const [withdrawTarget, setWithdrawTarget] = useState(null)
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const openWithdrawModal = (event) => setWithdrawTarget(event)
  const closeWithdrawModal = () => {
    if (withdrawLoading) return
    setWithdrawTarget(null)
  }

  const confirmWithdrawCancellationRequest = async () => {
    if (!withdrawTarget || withdrawLoading) return
    setWithdrawLoading(true)
    try {
      await withdrawCancellationRequest(withdrawTarget.id)
      toast.success(`Đã hoàn tác yêu cầu hủy sự kiện "${withdrawTarget.title}". Sự kiện đã mở bán lại bình thường.`)
      setWithdrawTarget(null)
      await loadEvents()
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể hoàn tác yêu cầu hủy sự kiện.'))
    } finally {
      setWithdrawLoading(false)
    }
  }

  // ---- Hide / Unhide modal handlers ----
  const openHideModal = (event) => setHideTarget(event)
  const closeHideModal = () => {
    if (hideLoading) return
    setHideTarget(null)
  }

  const confirmToggleHide = async (payload = {}) => {
    if (!hideTarget || hideLoading) return
    setHideLoading(true)
    try {
      if (hideTarget.display_state === 'HIDDEN_BY_ORGANIZER') {
        await unhideOrganizerEvent(hideTarget.id)
        toast.success(`Đã mở hiển thị lại sự kiện "${hideTarget.title}".`)
      } else if (hideTarget.display_state === 'SUSPENDED_BY_ADMIN') {
        toast.error('Sự kiện đang bị Quản trị viên đình chỉ, Ban tổ chức không thể tự mở lại.')
        setHideTarget(null)
        return
      } else {
        await hideOrganizerEvent(hideTarget.id, payload.reason || 'Tạm ẩn theo yêu cầu của ban tổ chức')
        toast.info(`Đã ẩn sự kiện "${hideTarget.title}" khỏi tìm kiếm và trang chủ.`)
      }
      setHideTarget(null)
      await loadEvents()
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể thay đổi trạng thái hiển thị.'))
    } finally {
      setHideLoading(false)
    }
  }

  // ---- Pause / Resume Sales modal handlers ----
  const openSalesModal = (event) => {
    if (event?.sales_status === 'PAUSED' && (event?.display_state === 'HIDDEN_BY_ORGANIZER' || event?.status === 'HIDDEN')) {
      toast.warning('Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
      return
    }
    setSalesTarget(event)
  }
  const closeSalesModal = () => {
    if (salesLoading) return
    setSalesTarget(null)
  }

  const confirmToggleSales = async (payload = {}) => {
    if (!salesTarget || salesLoading) return

    if (salesTarget.sales_status === 'PAUSED' && (salesTarget.display_state === 'HIDDEN_BY_ORGANIZER' || salesTarget.status === 'HIDDEN')) {
      toast.warning('Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
      setSalesTarget(null)
      return
    }

    setSalesLoading(true)
    try {
      if (payload.action === 'RESUME_TICKET_TYPE' && payload.ticketTypeId) {
        await resumeSalesOrganizerEvent(salesTarget.id, { ticketTypeId: payload.ticketTypeId })
        toast.success(isEnglish ? `Ticket sales resumed for tier "${payload.ticketTypeName || 'selected'}".` : `Đã mở bán lại cho hạng vé "${payload.ticketTypeName || 'đã chọn'}".`)
      } else if (payload.action === 'RESUME_ALL_TICKETS') {
        const ticketTypeIds = Array.isArray(payload.ticketTypeIds) && payload.ticketTypeIds.length > 0
          ? payload.ticketTypeIds
          : undefined
        await resumeSalesOrganizerEvent(salesTarget.id, ticketTypeIds ? { ticketTypeIds } : {})
        toast.success(isEnglish ? 'Ticket sales resumed for all selected tiers.' : 'Đã mở bán lại cho tất cả các hạng vé đã chọn.')
      } else if (payload.scope === 'SPECIFIC' && (payload.ticketTypeIds?.length || payload.ticketTypeId)) {
        const ticketTypeIds = payload.ticketTypeIds || [payload.ticketTypeId]
        await pauseSalesOrganizerEvent(salesTarget.id, {
          scope: 'SPECIFIC',
          ticketTypeIds,
          ticketTypes: payload.ticketTypes,
          ticketTypeName: payload.ticketTypeName,
          reason: payload.reason,
        })
        const count = ticketTypeIds.length
        toast.info(count > 1
          ? (isEnglish ? `Paused sales for ${count} selected ticket tiers.` : `Đã tạm dừng bán vé cho ${count} loại vé đã chọn.`)
          : (isEnglish ? `Paused sales for tier "${payload.ticketTypeName || 'selected'}".` : `Đã tạm dừng bán vé cho hạng vé "${payload.ticketTypeName || 'đã chọn'}".`))
      } else if (payload.scope === 'SEATS') {
        if (payload.action === 'RESUME_SEATS') {
          await resumeSalesOrganizerEvent(salesTarget.id, {
            scope: 'SEATS',
            sessionId: payload.sessionId,
            seatIds: payload.seatIds,
          })
          toast.success(`Đã mở bán lại cho ${payload.seatIds?.length || 0} vị trí ghế đã chọn.`)
        } else {
          await pauseSalesOrganizerEvent(salesTarget.id, {
            scope: 'SEATS',
            sessionId: payload.sessionId,
            seatIds: payload.seatIds,
            seatLabels: payload.seatLabels,
            reason: payload.reason,
          })
          toast.info(`Đã tạm dừng bán vé cho ${payload.seatIds?.length || 0} vị trí ghế đã chọn.`)
        }
      } else if (salesTarget.sales_status === 'PAUSED' || payload.action === 'RESUME_ALL') {
        const res = await resumeSalesOrganizerEvent(salesTarget.id)
        if (res?.event?.sales_status === 'PAUSED' || (res?.remainingBlocks && res.remainingBlocks.length > 0)) {
          toast.warning(res?.message || 'Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
        } else {
          toast.success(`Đã mở bán lại vé cho "${salesTarget.title}".`)
        }
      } else {
        await pauseSalesOrganizerEvent(salesTarget.id, {
          scope: 'ALL',
          reason: payload.reason || '',
        })
        toast.info(`Đã tạm dừng bán vé cho "${salesTarget.title}".`)
      }
      setSalesTarget(null)
      await loadEvents()
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể thay đổi trạng thái bán vé.'))
    } finally {
      setSalesLoading(false)
    }
  }


  // ---- Delete draft handlers ----
  const openDeleteModal = (event) => setDeleteTarget(event)

  const closeDeleteModal = () => {
    if (deleteLoading) return
    setDeleteTarget(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return
    setDeleteLoading(true)
    try {
      await deleteOrganizerDraftEvent(deleteTarget.id)
      setDeleteTarget(null)
      toast.success(`Đã xóa vĩnh viễn bản nháp "${deleteTarget.title}".`)
      await loadEvents()
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể xóa bản nháp sự kiện.'))
    } finally {
      setDeleteLoading(false)
    }
  }

  const PAGE_SIZE = 8
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.category_name?.toLowerCase().includes(q)
      const primaryStatus = getPrimaryEventStatus(event, organizerPlan)
      const matchStatus = !statusFilter || primaryStatus.key === statusFilter
      return matchSearch && matchStatus
    })
  }, [events, search, statusFilter, organizerPlan])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => {
    if (page > totalPages) {
      setPage(1)
    }
  }, [totalPages, page])

  const statusFilterOptions = useMemo(() => [
    { value: '', label: isEnglish ? 'All Statuses' : 'Tất cả trạng thái' },
    { value: 'ON_SALE', label: isEnglish ? 'Selling Tickets' : 'Đang bán vé' },
    { value: 'PAUSED', label: isEnglish ? 'Paused Sales' : 'Tạm dừng bán' },
    { value: 'HIDDEN', label: isEnglish ? 'Hidden' : 'Đã ẩn' },
    { value: 'APPROVED', label: isEnglish ? 'Awaiting Publish' : 'Chờ xuất bản' },
    { value: 'PENDING_REVIEW', label: isEnglish ? 'Pending Review' : 'Chờ duyệt' },
    { value: 'REVISION_PENDING', label: isEnglish ? 'Pending Revision' : 'Sửa đổi chờ duyệt' },
    { value: 'DRAFT', label: isEnglish ? 'Draft' : 'Bản nháp' },
    { value: 'COMPLETED', label: isEnglish ? 'Ended' : 'Đã kết thúc' },
    { value: 'CANCEL_REQUESTED', label: isEnglish ? 'Pending Cancellation' : 'Chờ duyệt hủy' },
    { value: 'CANCELLED', label: isEnglish ? 'Cancelled' : 'Đã hủy' },
  ], [isEnglish])

  return (
    <OrganizerPage
      title={isEnglish ? 'Event Management' : 'Quản lý Sự kiện'}
      action={isEnglish ? 'Create Event' : 'Tạo sự kiện'}
      actionTo="/organizer/events/create"
    >
      <div className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white" />
            <input
              className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] pl-10 pr-8 text-sm font-normal text-white outline-none placeholder:text-white/50 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={isEnglish ? 'Search by event name...' : 'Tìm theo tên sự kiện...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            {search && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white cursor-pointer"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
                title={isEnglish ? 'Clear search' : 'Xóa tìm kiếm'}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <CosmicSelect
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val)
              setPage(1)
            }}
            options={statusFilterOptions}
            minWidth="min-w-[170px]"
          />
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
              ? (isEnglish ? 'No events matching filter.' : 'Không có sự kiện phù hợp bộ lọc.')
              : (isEnglish ? 'No events yet. Click "Create Event" to get started.' : 'Chưa có sự kiện nào. Nhấn "Tạo sự kiện" để bắt đầu.')}
          </p>
          {!events.length && (
            <Link to="/organizer/events/create" className="org-btn-primary">
              <Plus className="size-4" />
              {isEnglish ? 'Create Event' : 'Tạo sự kiện'}
            </Link>
          )}
        </div>
      ) : (
        <>
          <OrganizerTable
            headers={['Sự kiện', 'Ngày diễn ra', 'Trạng thái', 'Danh mục', 'Cập nhật', 'Thao tác']}
            rows={paginatedEvents.map((event) => [
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
                  <span className="font-bold text-[13px] text-white block hover:text-primary transition leading-snug">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</span>
                </div>
              </div>,

              <span key="date" className="whitespace-nowrap">{formatEventDate(event.start_time)}</span>,

              (() => {
                const statusInfo = getPrimaryEventStatus(event, organizerPlan, isEnglish)
                return (
                  <div key="status" className="flex items-center justify-center">
                    <Badge tone={statusInfo.tone}>
                      {statusInfo.label}
                    </Badge>
                  </div>
                )
              })(),

              <span key="cat" className="whitespace-nowrap">{getCategoryName(event.category_name, isEnglish) || '—'}</span>,

              <span key="updated" className="whitespace-nowrap">{formatEventDate(event.updated_at)}</span>,

              /* Actions */
              <div key="actions" className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                <TableActionButton
                  to={`/organizer/events/${event.id}`}
                  title={isEnglish ? 'View details' : 'Xem chi tiết'}
                  icon={Eye}
                  tone="default"
                />
                <EventActionsDropdown
                  event={event}
                  onToggleHide={openHideModal}
                  onToggleSales={openSalesModal}
                  onWithdrawCancel={openWithdrawModal}
                  onCancel={openCancelModal}
                  onPublish={openPublishModal}
                  onDelete={openDeleteModal}
                />
              </div>,
            ])}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3 border-t border-white/5">
              <span className="text-xs text-subtle font-medium">
                {isEnglish
                  ? `Showing ${(page - 1) * PAGE_SIZE + 1} - ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} events`
                  : `Hiển thị ${(page - 1) * PAGE_SIZE + 1} - ${Math.min(page * PAGE_SIZE, filtered.length)} trong tổng số ${filtered.length} sự kiện`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl border border-border-soft/40 text-subtle bg-panel-soft hover:border-tertiary hover:text-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title={isEnglish ? 'Previous page' : 'Trang trước'}
                >
                  <ChevronLeft className="size-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`size-8 rounded-xl text-xs font-bold transition cursor-pointer ${page === pNum
                        ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-md shadow-[#C99A47]/30'
                        : 'border border-border-soft/40 text-subtle bg-panel-soft hover:border-tertiary hover:text-tertiary'
                      }`}
                  >
                    {pNum}
                  </button>
                ))}
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl border border-border-soft/40 text-subtle bg-panel-soft hover:border-tertiary hover:text-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title={isEnglish ? 'Next page' : 'Trang kế tiếp'}
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
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

      {/* Hide / Unhide confirm modal */}
      {hideTarget && (
        <ToggleHideConfirmModal
          event={hideTarget}
          onConfirm={confirmToggleHide}
          onClose={closeHideModal}
          loading={hideLoading}
        />
      )}

      {/* Pause / Resume sales confirm modal */}
      {salesTarget && (
        <ToggleSalesConfirmModal
          event={salesTarget}
          onConfirm={confirmToggleSales}
          onClose={closeSalesModal}
          loading={salesLoading}
        />
      )}

      {/* Cancel confirm modal */}
      {cancelTarget && (
        <CancelOrRequestCancelModal
          event={cancelTarget}
          onConfirm={confirmCancel}
          onClose={closeCancelModal}
          loading={cancelLoading}
          error={cancelError}
        />
      )}

      {/* Delete draft confirm modal */}
      {deleteTarget && (
        <DeleteDraftConfirmModal
          event={deleteTarget}
          onConfirm={confirmDelete}
          onClose={closeDeleteModal}
          loading={deleteLoading}
        />
      )}

      {/* Withdraw Cancellation Request Modal */}
      {withdrawTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl text-white">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
                <RotateCcw className="size-6" />
              </span>
              <div>
                <h3 className="text-lg font-black text-white">
                  {isEnglish ? 'Withdraw Event Cancellation Request' : 'Hoàn tác yêu cầu hủy sự kiện'}
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  {isEnglish
                    ? 'Are you sure you want to withdraw this request? The request sent to Admin will be revoked and event sales status will be restored.'
                    : 'Bạn có chắc chắn muốn hoàn tác yêu cầu này? Yêu cầu gửi Quản trị viên sẽ được hủy bỏ và trạng thái bán vé của sự kiện sẽ được khôi phục.'}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs text-slate-300">
              {isEnglish ? 'Event: ' : 'Sự kiện: '}
              <strong className="text-white">{isEnglish ? (translatePhrase(withdrawTarget.title, 'en') || withdrawTarget.title) : withdrawTarget.title}</strong>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={withdrawLoading}
                onClick={closeWithdrawModal}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                {isEnglish ? 'Cancel' : 'Hủy bỏ'}
              </button>
              <button
                type="button"
                disabled={withdrawLoading}
                onClick={confirmWithdrawCancellationRequest}
                className="rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2 text-xs font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {withdrawLoading && <span className="size-3 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />}
                {isEnglish ? 'Confirm Withdrawal' : 'Xác nhận hoàn tác'}
              </button>
            </div>
          </div>
        </div>
      )}
    </OrganizerPage>
  )
}
