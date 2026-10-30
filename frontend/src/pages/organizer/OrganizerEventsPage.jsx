import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  Edit,
  Eye,
  Globe,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
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

export function getPrimaryEventStatus(event) {
  if (!event) return { key: 'UNKNOWN', label: 'Không xác định', tone: 'slate' }

  // 1. Đã hủy (Cao nhất)
  if (event.status === 'CANCELLED') {
    return { key: 'CANCELLED', label: 'Đã hủy', tone: 'red' }
  }

  // 2. Chờ duyệt hủy
  if (event.cancel_request?.status === 'PENDING') {
    return { key: 'CANCEL_REQUESTED', label: 'Chờ duyệt hủy', tone: 'red' }
  }

  // 3. Bị đình chỉ bởi Admin
  if (event.display_state === 'SUSPENDED_BY_ADMIN') {
    return { key: 'SUSPENDED', label: 'Bị đình chỉ', tone: 'red' }
  }

  // 4. Đã kết thúc (quá thời gian sự kiện hoặc trạng thái COMPLETED)
  const ended = isEventEnded(event)
  if (ended || (event.status === 'COMPLETED' && event.approval_status !== 'APPROVED')) {
    return { key: 'COMPLETED', label: 'Đã kết thúc', tone: 'purple' }
  }

  // 5. Đã ẩn (BTC chủ động ẩn sự kiện)
  if (event.display_state === 'HIDDEN_BY_ORGANIZER' || event.status === 'HIDDEN') {
    return { key: 'HIDDEN', label: 'Đã ẩn', tone: 'neutral' }
  }

  // 6. Tạm dừng bán vé
  if (event.sales_status === 'PAUSED') {
    return { key: 'PAUSED', label: 'Tạm dừng bán', tone: 'orange' }
  }

  // 7. Sửa đổi chờ duyệt
  if (event.pending_revision && event.pending_revision.status === 'SUBMITTED') {
    return { key: 'REVISION_PENDING', label: 'Sửa đổi chờ duyệt', tone: 'amber' }
  }

  // 8. Đã duyệt (Chờ BTC bấm xuất bản)
  const isApprovedAwaitingPublish = !ended && (
    (event.status === 'COMPLETED' && event.approval_status === 'APPROVED') ||
    event.status === 'APPROVED'
  )
  if (isApprovedAwaitingPublish) {
    return { key: 'APPROVED', label: 'Chờ xuất bản', tone: 'cyan' }
  }

  // 9. Đang bán vé (Sự kiện công khai, mở bán vé bình thường)
  if (event.status === 'PUBLISHED') {
    return { key: 'ON_SALE', label: 'Đang bán vé', tone: 'green' }
  }

  // 10. Chờ duyệt (Sự kiện mới gửi Admin xét duyệt)
  if (event.status === 'PENDING_REVIEW') {
    return { key: 'PENDING_REVIEW', label: 'Chờ duyệt', tone: 'amber' }
  }

  // 11. Bản nháp
  if (event.status === 'DRAFT') {
    return { key: 'DRAFT', label: 'Bản nháp', tone: 'slate' }
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
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
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
// Cancel / Request Cancel Modal
// ---------------------------------------------------------------------------
function CancelOrRequestCancelModal({ event, onConfirm, onClose, loading, error }) {
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
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white my-8">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${hasPaidOrders ? 'bg-amber-500/15 text-amber-400' : 'bg-error/15 text-error'}`}>
            {hasPaidOrders ? <ShieldAlert className="size-6" /> : <AlertTriangle className="size-6" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {hasPaidOrders ? 'Gửi yêu cầu hủy sự kiện' : 'Xác nhận hủy sự kiện'}
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              {hasPaidOrders
                ? 'Sự kiện đã phát sinh đơn hàng. Cần gửi yêu cầu và cam kết hoàn tiền để Admin phê duyệt.'
                : 'Sự kiện chưa bán được vé nào. Bạn có thể hủy trực tiếp ngay lập tức.'}
            </p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span>Ngày diễn ra: {formatEventDate(event.start_time)}</span>
            <span>•</span>
            <span>Đơn đã thanh toán: <strong className={hasPaidOrders ? 'text-amber-400 font-bold' : 'text-slate-400'}>{event.paid_orders_count || 0} đơn</strong></span>
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
                  Nhóm lý do hủy <span className="text-rose-400">*</span>
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#121c38] px-3 py-2 text-sm text-white outline-none focus:border-primary"
                >
                  <option value="ORGANIZER_REASON">Lý do từ Ban tổ chức (Kế hoạch, lịch trình, tài chính)</option>
                  <option value="FORCE_MAJEURE">Lý do bất khả kháng (Thiên tai, dịch bệnh, pháp lý)</option>
                </select>
              </div>

              {/* Reason Note */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Giải trình chi tiết lý do hủy <span className="text-rose-400">*</span>
                  </label>
                  <span className={`text-[11px] ${reasonNote.trim().length >= 20 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {reasonNote.trim().length}/20 ký tự
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Nêu rõ lý do hủy và phương án giải quyết để Admin xem xét phê duyệt (tối thiểu 20 ký tự)..."
                  className="w-full rounded-xl border border-white/15 bg-[#121c38] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Refund Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Phương thức hoàn tiền cho người mua vé <span className="text-rose-400">*</span>
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
                      <p className="font-bold">Chuyển khoản VietQR</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">BTC tự chuyển tiền theo danh sách đối soát hoàn tiền.</p>
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
                      <p className="font-bold">Tự động qua payOS</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Yêu cầu đã kích hoạt Payout API trong cài đặt thanh toán.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Commitment Checkbox */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs leading-relaxed text-amber-200">
                  <input
                    type="checkbox"
                    checked={commitmentAccepted}
                    onChange={(e) => setCommitmentAccepted(e.target.checked)}
                    className="mt-1 size-4 rounded border-amber-500 text-primary focus:ring-primary shrink-0"
                  />
                  <span>
                    <strong>Cam kết nghĩa vụ hoàn tiền (Bắt buộc):</strong> Tôi cam kết sẽ thực hiện hoàn trả 100% tiền vé cho người mua trong vòng tối đa 7 ngày làm việc. Tôi hiểu rõ EventHub là nền tảng trung gian không giữ tiền vé, và toàn bộ nghĩa vụ tài chính hoàn tiền thuộc về Ban tổ chức.
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Lý do hủy (Tùy chọn)
              </label>
              <textarea
                rows={2}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Nhập lý do hủy sự kiện..."
                className="w-full rounded-xl border border-white/15 bg-[#121c38] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary resize-none"
              />
              <div className="mt-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-xs text-warning">
                <p className="font-semibold">⚠️ Lưu ý:</p>
                <p className="mt-0.5">Sự kiện sẽ bị hủy ngay lập tức và chuyển sang trạng thái đã hủy. Hành động này không thể hoàn tác.</p>
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
              Giữ lại
            </button>
            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                  Đang xử lý...
                </span>
              ) : hasPaidOrders ? (
                'Gửi yêu cầu hủy'
              ) : (
                'Xác nhận hủy ngay'
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
              {isCurrentlyHidden ? 'Xác nhận hiện lại sự kiện' : 'Xác nhận tạm ẩn sự kiện'}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isCurrentlyHidden
                ? 'Sự kiện sẽ được hiển thị công khai trở lại trên trang chủ và tìm kiếm.'
                : 'Sự kiện sẽ bị ẩn khỏi trang chủ và kết quả tìm kiếm của khách hàng.'}
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

        {!isCurrentlyHidden && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Lý do tạm ẩn (Tùy chọn)
            </label>
            <input
              type="text"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Nhập lý do tạm ẩn sự kiện..."
              className="w-full rounded-xl border border-white/15 bg-[#121c38] p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Warning / Note */}
        <div className={`mt-4 rounded-xl border p-3 text-xs ${isCurrentlyHidden ? 'border-primary/30 bg-primary/10 text-primary-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {isCurrentlyHidden ? (
            <p>💡 Người dùng có thể tìm thấy sự kiện và tiếp tục xem thông tin bình thường sau khi mở lại.</p>
          ) : (
            <p>⚠️ Khi tạm ẩn, khách hàng đang có link trực tiếp vẫn có thể xem được vé đã mua, nhưng sự kiện sẽ không xuất hiện tại trang khám phá.</p>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                Đang xử lý...
              </span>
            ) : isCurrentlyHidden ? (
              'Hiện lại ngay'
            ) : (
              'Tạm ẩn sự kiện'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle Sales Confirm Modal
// ---------------------------------------------------------------------------
function ToggleSalesConfirmModal({ event, onConfirm, onClose, loading }) {
  const isCurrentlyPaused = event?.sales_status === 'PAUSED'
  const [reasonNote, setReasonNote] = useState('')

  const handleConfirm = () => {
    onConfirm({ reason: isCurrentlyPaused ? '' : reasonNote.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isCurrentlyPaused ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {isCurrentlyPaused ? <PlayCircle className="size-5" /> : <PauseCircle className="size-5" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {isCurrentlyPaused ? 'Xác nhận mở bán lại vé' : 'Xác nhận tạm dừng bán vé'}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isCurrentlyPaused
                ? 'Khách hàng có thể tiếp tục mua vé sau khi mở bán lại.'
                : 'Khách hàng sẽ tạm thời không thể đặt mua vé mới cho sự kiện này.'}
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

        {!isCurrentlyPaused && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Lý do tạm dừng bán (Tùy chọn)
            </label>
            <input
              type="text"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Ví dụ: Kiểm tra số lượng vé, bảo trì thông tin..."
              className="w-full rounded-xl border border-white/15 bg-[#121c38] p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Warning / Note */}
        <div className={`mt-4 rounded-xl border p-3 text-xs ${isCurrentlyPaused ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {isCurrentlyPaused ? (
            <p>💡 Các loại vé còn số lượng sẽ ngay lập tức mở cho khách hàng đặt mua.</p>
          ) : (
            <p>⚠️ Các giao dịch thanh toán hoặc giữ chỗ đang diễn ra sẽ không bị ảnh hưởng. Người mua mới sẽ thấy trạng thái "Tạm dừng bán".</p>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                Đang xử lý...
              </span>
            ) : isCurrentlyPaused ? (
              'Mở bán lại ngay'
            ) : (
              'Tạm dừng bán'
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
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/50 bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/15">
            <Trash2 className="size-5 text-error" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-content">Xác nhận xóa bản nháp</h3>
            <p className="mt-1 text-sm text-subtle">Hành động này sẽ xóa vĩnh viễn và không thể hoàn tác.</p>
          </div>
        </div>

        {/* Event info */}
        <div className="mt-4 rounded-xl border border-border-soft/40 bg-panel-soft p-4">
          <p className="text-sm font-semibold text-content">{event.title}</p>
          <p className="mt-1 text-xs text-subtle">
            Ngày diễn ra: {formatEventDate(event.start_time)}
          </p>
          <div className="mt-2">
            <Badge tone="gray">Bản nháp</Badge>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-4 rounded-xl border border-error/30 bg-error/[0.07] p-3 text-sm text-error">
          <p className="font-semibold">⚠️ Cảnh báo:</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
            <li>Bản nháp sự kiện sẽ bị xóa vĩnh viễn khỏi danh sách.</li>
            <li>Tất cả thông tin cấu hình, suất diễn và vé tạm thời sẽ không thể khôi phục.</li>
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
            Hủy bỏ
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
                Đang xóa...
              </span>
            ) : (
              'Xóa vĩnh viễn'
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
      toast.success(`Đã rút lại yêu cầu hủy sự kiện "${withdrawTarget.title}". Sự kiện đã mở bán lại bình thường.`)
      setWithdrawTarget(null)
      await loadEvents()
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể rút lại yêu cầu hủy sự kiện.'))
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
  const openSalesModal = (event) => setSalesTarget(event)
  const closeSalesModal = () => {
    if (salesLoading) return
    setSalesTarget(null)
  }

  const confirmToggleSales = async (payload = {}) => {
    if (!salesTarget || salesLoading) return
    setSalesLoading(true)
    try {
      if (salesTarget.sales_status === 'PAUSED') {
        await resumeSalesOrganizerEvent(salesTarget.id)
        toast.success(`Đã mở bán lại vé cho "${salesTarget.title}".`)
      } else {
        await pauseSalesOrganizerEvent(salesTarget.id, payload.reason || '')
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

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.category_name?.toLowerCase().includes(q)
      const primaryStatus = getPrimaryEventStatus(event)
      const matchStatus = !statusFilter || primaryStatus.key === statusFilter
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
            {EVENT_STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value} className="bg-[#0b1329] text-white">
                {f.label}
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

            (() => {
              const statusInfo = getPrimaryEventStatus(event)
              return (
                <div key="status" className="flex items-center">
                  <Badge tone={statusInfo.tone}>
                    {statusInfo.label}
                  </Badge>
                </div>
              )
            })(),

            <span key="cat" className="whitespace-nowrap">{event.category_name || '—'}</span>,

            <span key="updated" className="whitespace-nowrap">{formatEventDate(event.updated_at)}</span>,

            /* Actions */
            (() => {
              const ended = isEventEnded(event)
              return (
                <div key="actions" className="flex items-center justify-center gap-1.5 whitespace-nowrap">
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
                  {!ended && (event.status === 'PUBLISHED' || event.status === 'HIDDEN' || event.display_state === 'HIDDEN_BY_ORGANIZER') && (
                    <>
                      {/* Toggle Hide/Unhide */}
                      {event.display_state !== 'SUSPENDED_BY_ADMIN' && (
                        <TableActionButton
                          onClick={() => openHideModal(event)}
                          title={event.display_state === 'HIDDEN_BY_ORGANIZER' ? 'Hiện lại sự kiện' : 'Tạm ẩn sự kiện'}
                          icon={event.display_state === 'HIDDEN_BY_ORGANIZER' ? ArchiveRestore : Archive}
                          tone={event.display_state === 'HIDDEN_BY_ORGANIZER' ? 'primary' : 'default'}
                        />
                      )}

                      {/* Toggle Pause/Resume Sales */}
                      {event.display_state !== 'SUSPENDED_BY_ADMIN' && (
                        <TableActionButton
                          onClick={() => openSalesModal(event)}
                          title={event.sales_status === 'PAUSED' ? 'Mở bán lại vé' : 'Tạm dừng bán vé'}
                          icon={event.sales_status === 'PAUSED' ? PlayCircle : PauseCircle}
                          tone={event.sales_status === 'PAUSED' ? 'success' : 'warning'}
                        />
                      )}

                      {/* Cancel / Request Cancel / Withdraw Cancel */}
                      {event.cancel_request?.status === 'PENDING' ? (
                        <TableActionButton
                          onClick={() => openWithdrawModal(event)}
                          title="Rút lại yêu cầu hủy sự kiện"
                          icon={RotateCcw}
                          tone="warning"
                        />
                      ) : (
                        <TableActionButton
                          onClick={() => openCancelModal(event)}
                          title={Number(event.paid_orders_count || 0) > 0 ? 'Yêu cầu hủy sự kiện' : 'Hủy sự kiện'}
                          icon={AlertTriangle}
                          tone="danger"
                        />
                      )}
                    </>
                  )}
                  {!ended && event.status === 'COMPLETED' && event.approval_status === 'APPROVED' && (
                    <TableActionButton
                      onClick={() => openPublishModal(event)}
                      title="Xuất bản sự kiện"
                      icon={Globe}
                      tone="success"
                    />
                  )}
                  {event.status === 'DRAFT' && (
                    <TableActionButton
                      onClick={() => openDeleteModal(event)}
                      title="Xóa bản nháp"
                      icon={Trash2}
                      tone="danger"
                    />
                  )}
                </div>
              )
            })(),
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
                <h3 className="text-lg font-black text-white">Rút lại yêu cầu hủy sự kiện</h3>
                <p className="mt-1 text-xs text-slate-300">
                  Bạn có chắc chắn muốn hủy yêu cầu này? Yêu cầu gửi Admin sẽ bị hủy bỏ và trạng thái bán vé của sự kiện sẽ được khôi phục.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs text-slate-300">
              Sự kiện: <strong className="text-white">{withdrawTarget.title}</strong>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={withdrawLoading}
                onClick={closeWithdrawModal}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={withdrawLoading}
                onClick={confirmWithdrawCancellationRequest}
                className="rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2 text-xs font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {withdrawLoading && <span className="size-3 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />}
                Xác nhận rút lại
              </button>
            </div>
          </div>
        </div>
      )}
    </OrganizerPage>
  )
}
