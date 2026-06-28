import { BarChart3, ClipboardCheck, QrCode, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, StaffPage, StaffPanel, StaffTable } from './StaffComponents.jsx'

const kpis = [
  ['Sự kiện được giao', '3'],
  ['Công việc được giao', '12'],
  ['Đã hoàn thành', '8'],
  ['Đang chờ', '4'],
  ['Vé đã check-in', '1,420'],
  ['Còn lại', '680'],
]

export function StaffDashboardPage() {
  return (
    <StaffPage title="Tổng quan nhân sự" description="Theo dõi công việc vận hành hôm nay.">
      <div className="grid gap-4 md:grid-cols-4">
        <Shortcut to="/staff/qr-check-in" icon={QrCode} label="Quét QR" primary />
        <Shortcut to="/staff/manual-check-in" icon={UserPlus} label="Check-in thủ công" />
        <Shortcut to="/staff/tasks" icon={ClipboardCheck} label="Công việc" />
        <Shortcut to="/staff/check-in-count" icon={BarChart3} label="Thống kê" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value]) => (
          <StaffPanel key={label}>
            <p className="text-xs font-bold uppercase text-subtle">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-content">{value}</p>
          </StaffPanel>
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
        <StaffPanel>
          <div className="flex items-start justify-between">
            <h3 className="font-bold text-content">Sự kiện hôm nay</h3>
            <Badge tone="red">Live now</Badge>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
            <div className="grid h-36 place-items-center rounded-xl bg-tertiary/15 text-primary">
              <QrCode className="size-14" />
            </div>
            <div>
              <h4 className="font-extrabold text-primary">Global Innovation Summit 2024</h4>
              <p className="mt-2 text-sm text-subtle">Grand Convention Center - 09:00 AM</p>
              <p className="mt-4 text-sm font-semibold text-content">Check-in progress</p>
              <div className="mt-2 h-2 rounded-full bg-panel-soft">
                <div className="h-full w-[68%] rounded-full bg-tertiary" />
              </div>
              <div className="mt-5 flex gap-3">
                <Link to="/staff/qr-check-in" className="admin-primary">Bắt đầu check-in</Link>
                <Link to="/staff/events/detail" className="admin-secondary">Chi tiết</Link>
              </div>
            </div>
          </div>
        </StaffPanel>
        <StaffPanel>
          <h3 className="font-bold text-content">Công việc đang hoạt động</h3>
          {['Verify VIP Lounge Credentials', 'East Gate Water Supply'].map((task, index) => (
            <div key={task} className="mt-4 rounded-xl border border-border-soft/30 bg-panel-soft/50 p-4">
              <Badge tone={index === 0 ? 'red' : 'gray'}>{index === 0 ? 'Khẩn cấp' : 'Bình thường'}</Badge>
              <p className="mt-3 font-bold text-content">{task}</p>
              <p className="mt-1 text-sm text-subtle">Cập nhật trạng thái sau khi hoàn tất.</p>
            </div>
          ))}
        </StaffPanel>
      </div>
      <div className="mt-6">
        <StaffTable headers={['Thời gian', 'Người tham dự', 'Loại vé', 'Phương thức', 'Trạng thái']} rows={[['14:22', 'Sarah Jenkins', 'VIP', 'QR Scan', <Badge key="ok" tone="green">Thành công</Badge>]]} />
      </div>
    </StaffPage>
  )
}

function Shortcut({ to, icon: Icon, label, primary }) {
  return (
    <Link
      to={to}
      className={`rounded-2xl border p-6 text-center font-bold transition-all hover:scale-[1.02] ${
        primary
          ? 'border-primary/40 bg-tertiary text-white shadow-[0_4px_20px_rgba(43,92,146,0.3)]'
          : 'border-border-soft/40 bg-surface/80 text-content hover:border-tertiary hover:bg-panel-soft'
      }`}
    >
      <Icon className="mx-auto mb-3 size-7" />
      {label}
    </Link>
  )
}

