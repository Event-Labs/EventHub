import { ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'

export const ADMIN_SUSPEND_REASONS = [
  { value: 'POLICY_VIOLATION', label: 'Vi phạm chính sách & điều khoản nền tảng' },
  { value: 'SUSPECTED_FRAUD', label: 'Nghi vấn gian lận vé hoặc tài chính' },
  { value: 'LEGAL_REQUEST', label: 'Yêu cầu từ cơ quan pháp luật' },
  { value: 'CONTENT_ISSUE', label: 'Nội dung hoặc hình ảnh không phù hợp' },
  { value: 'ORGANIZER_ACCOUNT_ISSUE', label: 'Vấn đề xác thực tài khoản ban tổ chức' },
  { value: 'REFUND_OVERDUE', label: 'Quá hạn nghĩa vụ hoàn tiền cho khách hàng' },
]

export function AdminSuspendModal({ event, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('POLICY_VIOLATION')
  const [note, setNote] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm({ reason, note: note.trim() })
  }

  if (!event) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <ShieldAlert className="size-6" />
            </span>
            <div>
              <h3 className="text-xl font-black text-white">Đình chỉ sự kiện</h3>
              <p className="mt-1 text-xs text-slate-300">
                Rule BR-SB-01: Sự kiện sẽ bị dừng bán vé ngay lập tức và Ban tổ chức không thể tự ý mở lại.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sự kiện xử lý:</p>
          <p className="font-bold text-white text-sm mt-0.5">{event.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Mã lý do đình chỉ (Chuẩn nghiệp vụ) <span className="text-rose-400">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-[#121c38] px-3 py-2.5 text-xs text-white outline-none focus:border-rose-400"
            >
              {ADMIN_SUSPEND_REASONS.map((r) => (
                <option key={r.value} value={r.value} className="bg-[#0b1329] text-white">
                  [{r.value}] {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Ghi chú giải trình chi tiết (Tùy chọn)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhập ghi chú hoặc biên bản vi phạm để lưu vào audit trail..."
              className="w-full rounded-xl border border-white/15 bg-[#121c38] p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-rose-400 resize-none"
            />
          </div>

          <div className="mt-5 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-xs font-semibold text-subtle transition hover:border-border-soft hover:text-content disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:bg-rose-500 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Đang xử lý...
                </span>
              ) : (
                'Xác nhận đình chỉ'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
