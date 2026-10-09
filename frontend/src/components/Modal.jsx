import { CheckCircle2, ClipboardCheck, X } from 'lucide-react'

export function Modal({ open, title, children, footer, onClose, maxWidth = 'max-w-lg', footerClassName = '' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section className={`flex flex-col w-full ${maxWidth} max-h-[90vh] overflow-hidden rounded-2xl border border-white/15 bg-[#0b1329] text-white shadow-2xl shadow-black/90 [html.light_&]:border-slate-200 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-slate-300/50`}>
        <header className="shrink-0 flex items-center justify-between gap-4 border-b border-white/10 bg-[#111c3a] px-6 py-4 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
          <h3 className="min-w-0 truncate font-display text-xl font-black text-white [html.light_&]:text-[#0D1B2A]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white [html.light_&]:text-slate-500 [html.light_&]:hover:bg-slate-200/60 [html.light_&]:hover:text-slate-800"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 bg-[#0b1329] [html.light_&]:bg-white">{children}</div>
        {footer && (
          <footer className={`shrink-0 flex flex-col-reverse gap-3 border-t border-white/10 bg-[#111c3a] px-6 py-4 sm:flex-row sm:items-center sm:justify-end [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50 ${footerClassName}`}>
            {footer}
          </footer>
        )}
      </section>
    </div>
  )
}

export function ConfirmCheckInModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Xác nhận check-in"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>Hủy</button>
          <button className="admin-primary" onClick={onClose}>Xác nhận check-in</button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <InfoBlock title="Người tham dự" lines={['Marcus Richardson', 'marcus@example.com', '+1 555-0123']} />
        <InfoBlock title="Vé" lines={['EH-021-XP', 'VIP Pass', 'Zone A / Row 4']} status="Hợp lệ" />
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
        <p className="text-sm font-bold uppercase tracking-wider text-white">Sự kiện</p>
        <p className="mt-1 font-bold text-base text-white">TechNexus Summit 2024</p>
        <p className="text-sm text-slate-300">Oct 24, 09:00 AM - Convention Center</p>
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-md bg-[#f2f4f6] p-3 text-sm">
        <input type="checkbox" className="mt-1 accent-primary" />
        <span>Tôi đã xác minh thông tin người tham dự.</span>
      </label>
    </Modal>
  )
}

export function UpdateTaskStatusModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Cập nhật trạng thái công việc"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>Hủy</button>
          <button className="admin-primary" onClick={onClose}>Lưu trạng thái</button>
        </>
      }
    >
      <div className="space-y-4">
        <InfoBlock title="Công việc" lines={['Setup VIP Lounge Signage', 'TechNexus Summit 2024']} />
        <label className="block">
          <span className="text-xs font-bold text-[#434655]">Trạng thái mới</span>
          <select className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm">
            <option>Chưa bắt đầu</option>
            <option>Đang thực hiện</option>
            <option>Hoàn thành</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-[#434655]">Ghi chú</span>
          <textarea className="mt-2 min-h-24 w-full rounded border border-[#c3c6d7] p-3 text-sm" />
        </label>
      </div>
    </Modal>
  )
}

export function ManualTicketModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Check-in thủ công"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>Hủy</button>
          <button className="admin-primary" onClick={onClose}>Xác nhận check-in thủ công</button>
        </>
      }
    >
      <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-[#92400e]">
        Vé đã từng được quét. Vui lòng kiểm tra kỹ trước khi xác nhận.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <InfoBlock title="Mã vé" lines={['EH-8892-XLOP', 'Future Tech Expo 2024']} />
        <InfoBlock title="Người mua" lines={['Marcus Holloway', 'VIP Pass - Floor B, Row 4']} />
      </div>
      <div className="mt-5 space-y-3">
        {[
          'Tên người tham dự khớp giấy tờ',
          'Vé thuộc đúng sự kiện',
          'Vé chưa bị vô hiệu hoặc hoàn tiền',
          'Vé chưa được dùng tại cổng khác',
        ].map((item) => (
          <label key={item} className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="accent-primary" />
            {item}
          </label>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-bold text-[#434655]">Lý do check-in thủ công</span>
        <textarea
          className="mt-2 min-h-20 w-full rounded border border-[#c3c6d7] p-3 text-sm"
          defaultValue="QR bị mờ, attendee device screen broken..."
        />
      </label>
      <div className="mt-5 rounded-md bg-success/10 p-4 text-center">
        <CheckCircle2 className="mx-auto size-8 text-success" />
        <p className="mt-2 font-bold">Sẵn sàng xác nhận</p>
      </div>
    </Modal>
  )
}

function InfoBlock({ title, lines, status }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121c38] p-4 text-white">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold uppercase tracking-wider text-white">{title}</p>
        {status && <span className="rounded bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 text-xs font-bold">{status}</span>}
      </div>
      {lines.map((line) => (
        <p key={line} className="mt-1 text-sm font-semibold text-slate-200">{line}</p>
      ))}
      <ClipboardCheck className="mt-3 size-4 text-primary" />
    </div>
  )
}
