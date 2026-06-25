import { AlertTriangle, CheckCircle2, RefreshCcw, Search, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Insight, StaffPanel } from './StaffComponents.jsx'

export function TicketResultPage({ state = 'valid' }) {
  if (state === 'invalid') return <InvalidTicket />
  if (state === 'already') return <AlreadyCheckedIn />
  if (state === 'success') return <CheckInSuccess />
  return <ValidTicket />
}

function ValidTicket() {
  return (
    <ResultShell tone="green" icon={CheckCircle2} title="Vé hợp lệ" subtitle="Xác minh thành công. Có thể tiếp tục check-in.">
      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <TicketInfo />
        <StaffPanel>
          <h3 className="mb-4 text-sm font-bold uppercase text-muted">Kiểm tra toàn vẹn</h3>
          {['Thuộc sự kiện này', 'Chưa sử dụng', 'Không hoàn tiền', 'Đang hoạt động'].map((item) => (
            <p key={item} className="mt-3 flex items-center justify-between text-sm text-content">{item}<CheckCircle2 className="size-4 text-success" /></p>
          ))}
        </StaffPanel>
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/staff/qr-check-in/success" className="admin-primary min-w-72">Xác nhận check-in</Link>
        <Link to="/staff/qr-check-in" className="admin-secondary">Quét lại</Link>
      </div>
    </ResultShell>
  )
}

function InvalidTicket() {
  return (
    <ResultShell tone="red" icon={XCircle} title="Vé không hợp lệ" subtitle="Vé đã được quét tại Gate B lúc 09:42 AM.">
      <TicketInfo />
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/staff/qr-check-in" className="admin-primary bg-error text-white hover:bg-red-700">Quét lại</Link>
        <Link to="/staff/manual-check-in" className="admin-secondary"><Search className="size-4" />Tìm thủ công</Link>
      </div>
    </ResultShell>
  )
}

function AlreadyCheckedIn() {
  return (
    <ResultShell tone="yellow" icon={AlertTriangle} title="Đã check-in" subtitle="Vé này đã được dùng.">
      <TicketInfo />
      <StaffPanel className="mt-5">
        <h3 className="font-bold text-content">Thông tin check-in trước đó</h3>
        <p className="mt-3 text-sm text-subtle">09:42 AM hôm nay - Nhân sự Sarah J. - QR Scan</p>
      </StaffPanel>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/staff/qr-check-in" className="admin-primary"><RefreshCcw className="size-4" />Quét lại</Link>
        <Link to="/staff/manual-check-in" className="admin-secondary">Tìm thủ công</Link>
      </div>
    </ResultShell>
  )
}

function CheckInSuccess() {
  return (
    <ResultShell tone="green" icon={CheckCircle2} title="Check-in thành công" subtitle="Attendee entry has been recorded.">
      <div className="mx-auto max-w-lg">
        <TicketInfo />
        <div className="mt-5">
          <Insight>Marcus là khách VIP đã từng đến 4 sự kiện. Hướng dẫn tới Sapphire Lounge ở Level 2.</Insight>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/staff/qr-check-in" className="admin-primary">Quét vé tiếp theo</Link>
          <Link to="/staff/check-in-count" className="admin-secondary">Xem thống kê</Link>
        </div>
      </div>
    </ResultShell>
  )
}

function ResultShell({ tone, icon: Icon, title, subtitle, children }) {
  const colors = {
    green: 'bg-success text-white',
    red: 'bg-error text-white',
    yellow: 'bg-warning text-slate-950',
  }
  return (
    <div className="mx-auto max-w-5xl">
      <div className={`rounded-t-2xl p-8 text-center ${colors[tone]}`}>
        <Icon className="mx-auto size-14" />
        <h1 className="mt-4 text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm opacity-90">{subtitle}</p>
      </div>
      <div className="rounded-b-2xl border border-t-0 border-border-soft/30 bg-surface/80 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm text-content">
        {children}
      </div>
    </div>
  )
}

function TicketInfo() {
  return (
    <StaffPanel>
      <div className="grid gap-5 md:grid-cols-2">
        <Info label="Mã vé" value="EH-9821-XP" />
        <Info label="Trạng thái" value={<Badge tone="green">Hợp lệ</Badge>} />
        <Info label="Sự kiện" value="TechNexus Summit 2024" />
        <Info label="Người tham dự" value="Marcus Richardson" />
        <Info label="Loại vé" value="VIP Pass" />
        <Info label="Ghế / Khu vực" value="Zone A, Row 4" />
      </div>
    </StaffPanel>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 font-bold text-content">{value}</p>
    </div>
  )
}
