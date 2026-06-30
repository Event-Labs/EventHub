import { CheckCircle2, ClipboardCheck, X } from 'lucide-react'

export function Modal({ open, title, children, footer, onClose, maxWidth = 'max-w-lg' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <section className={`w-full ${maxWidth} max-h-[92vh] overflow-hidden rounded-xl border border-border-soft/40 bg-surface text-content shadow-2xl shadow-black/30`}>
        <header className="flex items-center justify-between gap-4 border-b border-border-soft/40 bg-panel px-5 py-4">
          <h3 className="min-w-0 truncate font-display text-lg font-extrabold text-content">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-transparent text-muted transition hover:border-border-soft/50 hover:bg-panel-soft hover:text-content"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="max-h-[calc(92vh-8rem)] overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-3 border-t border-border-soft/40 bg-panel px-5 py-4 sm:flex-row sm:justify-end">
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
      <div className="mt-4 rounded-md border border-[#c3c6d7] bg-[#f7f9fb] p-4">
        <p className="text-xs font-bold uppercase text-[#737686]">Sự kiện</p>
        <p className="mt-1 font-bold text-[#191c1e]">TechNexus Summit 2024</p>
        <p className="text-sm text-[#434655]">Oct 24, 09:00 AM - Convention Center</p>
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
    <div className="rounded-md bg-[#f2f4f6] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-[#737686]">{title}</p>
        {status && <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{status}</span>}
      </div>
      {lines.map((line) => (
        <p key={line} className="mt-1 text-sm font-semibold text-[#191c1e]">{line}</p>
      ))}
      <ClipboardCheck className="mt-3 size-4 text-primary" />
    </div>
  )
}
