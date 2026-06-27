import { useState } from 'react'
import { CameraOff, CheckCircle2, QrCode, RotateCcw, Search, Smartphone } from 'lucide-react'
import { ConfirmCheckInModal, ManualTicketModal } from '@/components/Modal.jsx'
import { Avatar, StaffPage, StaffPanel } from './StaffComponents.jsx'

export function StaffQrCheckInPage() {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <StaffPage title="QR Check-in">
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <StaffPanel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-muted">Sự kiện đang hoạt động</p>
                <h3 className="mt-1 font-extrabold text-content">TechSummit Global 2024</h3>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold text-primary">1,420 / 2,500</p>
                <p className="text-xs font-bold uppercase text-muted">Đã check-in</p>
              </div>
            </div>
          </StaffPanel>
          <div className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-2xl bg-black/90 text-white shadow-sm border border-border-soft/20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_55%)]" />
            <Smartphone className="relative size-40 text-primary" />
            <div className="absolute bottom-6 grid w-full grid-cols-3 gap-3 px-8">
              <button className="rounded-xl bg-white/10 py-4 text-xs font-bold uppercase hover:bg-white/15 transition">Đổi camera</button>
              <button className="rounded-xl bg-white/10 py-4 text-xs font-bold uppercase hover:bg-white/15 transition">Đèn flash</button>
              <button className="rounded-xl bg-tertiary py-4 text-xs font-bold uppercase text-white hover:opacity-90 transition" onClick={() => setConfirmOpen(true)}>Check-in thủ công</button>
            </div>
          </div>
        </div>
        <aside className="space-y-5">
          <StaffPanel className="text-center">
            <QrCode className="mx-auto size-16 text-muted" />
            <h3 className="mt-5 text-xl font-extrabold text-content">Sẵn sàng quét</h3>
            <p className="mt-2 text-sm text-subtle">Đưa QR code vào khung hình để bắt đầu.</p>
            <div className="mt-5 space-y-2 text-left">
              <button className="w-full rounded-xl border border-border-soft/40 bg-panel-soft/40 px-3 py-2 text-sm text-content hover:bg-panel-soft transition">Mô phỏng hợp lệ</button>
              <button className="w-full rounded-xl border border-border-soft/40 bg-panel-soft/40 px-3 py-2 text-sm text-content hover:bg-panel-soft transition">Mô phỏng không hợp lệ</button>
              <button className="w-full rounded-xl border border-border-soft/40 bg-panel-soft/40 px-3 py-2 text-sm text-content hover:bg-panel-soft transition">Mô phỏng đã check-in</button>
            </div>
          </StaffPanel>
          <StaffPanel>
            <h3 className="font-bold text-content">Lượt quét gần đây</h3>
            {['Marcus Richardson', 'Elena Petrov', 'John Smith'].map((name) => (
              <div key={name} className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-content"><Avatar name={name} className="size-8" />{name}</span>
                <CheckCircle2 className="size-4 text-success" />
              </div>
            ))}
          </StaffPanel>
        </aside>
      </div>
      <ConfirmCheckInModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </StaffPage>
  )
}

export function CameraDeniedPage() {
  return (
    <div className="grid min-h-[calc(100vh-140px)] place-items-center">
      <StaffPanel className="max-w-xl text-center">
        <CameraOff className="mx-auto size-14 text-warning" />
        <h1 className="mt-5 text-xl font-extrabold text-content">Cần cấp quyền camera</h1>
        <p className="mt-2 text-sm text-subtle">Vui lòng cho phép truy cập camera để quét vé QR.</p>
        <div className="mt-6 rounded-xl bg-panel-soft border border-border-soft/20 p-4 text-left text-sm text-content">
          <p>1. Nhấn biểu tượng khóa hoặc cài đặt trên thanh địa chỉ.</p>
          <p className="mt-2">2. Chọn Camera và bật Allow.</p>
          <p className="mt-2">3. Nhấn thử lại để khởi tạo máy quét.</p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <button className="admin-primary"><RotateCcw className="size-4" />Thử lại</button>
          <button className="admin-secondary">Dùng check-in thủ công</button>
        </div>
      </StaffPanel>
    </div>
  )
}

export function ManualCheckInPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <StaffPage title="Check-in thủ công" description="Tìm vé khi attendee không thể xuất trình QR có thể quét.">
      <StaffPanel className="mb-5">
        <div className="grid gap-3 md:grid-cols-4">
          {['Mã vé', 'Tên người mua', 'Email', 'Số điện thoại'].map((label) => (
            <input
              key={label}
              className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary placeholder:text-muted"
              placeholder={label}
            />
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="admin-primary"><Search className="size-4" />Tìm vé</button>
        </div>
      </StaffPanel>
      <StaffPanel>
        <h3 className="font-bold text-content">Kết quả tìm kiếm</h3>
        {['Michael Stevenson', 'Sarah Connor'].map((name, index) => (
          <div key={name} className="mt-4 grid gap-3 rounded-xl border border-border-soft/20 bg-panel-soft/30 p-4 md:grid-cols-[1fr_auto]">
            <div>
              <p className="font-bold text-content">{name}</p>
              <p className="text-sm text-subtle">EH-902{index + 1}-X - General Admission</p>
            </div>
            <button className="admin-primary py-2 text-xs" disabled={index === 1} onClick={() => setModalOpen(true)}>Check-in thủ công</button>
          </div>
        ))}
      </StaffPanel>
      <ManualTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </StaffPage>
  )
}
