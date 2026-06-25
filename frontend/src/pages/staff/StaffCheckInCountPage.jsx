import { Plus } from 'lucide-react'
import { Badge, Insight, StaffPage, StaffPanel, StaffTable } from './StaffComponents.jsx'

export function StaffCheckInCountPage() {
  return (
    <StaffPage
      title="Thống kê check-in"
      description="Tổng quan vận hành thời gian thực cho phiên hiện tại."
      action={<button className="admin-primary">Làm mới</button>}
    >
      <div className="grid gap-4 md:grid-cols-5">
        {[
          ['Tổng vé hợp lệ', '300'],
          ['Đã check-in', '145'],
          ['Chưa quét', '155'],
          ['Lỗi', '12'],
          ['Tỷ lệ vào cổng', '48.3%'],
        ].map(([label, value]) => (
          <StaffPanel key={label}>
            <p className="text-xs font-bold uppercase text-muted">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-content">{value}</p>
          </StaffPanel>
        ))}
      </div>
      <StaffPanel className="mt-5">
        <div className="mb-3 flex justify-between text-sm font-bold text-content">
          <span>Tiến độ vào cổng</span>
          <span>145 / 300 scanned</span>
        </div>
        <div className="h-4 rounded bg-panel-soft">
          <div className="h-full w-[48%] rounded bg-success" />
        </div>
      </StaffPanel>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <StaffPanel>
          <h3 className="font-bold text-content">Check-in theo thời gian</h3>
          <div className="mt-6 flex h-64 items-end gap-4">
            {[30, 42, 64, 82, 58, 90, 45].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-primary/60 hover:bg-primary transition-colors" style={{ height: `${h}%` }} />
            ))}
          </div>
        </StaffPanel>
        <StaffPanel>
          <h3 className="font-bold text-content">Theo loại vé</h3>
          {['VIP Platinum', 'General Entry', 'Speaker Pass', 'Staff Crew'].map((type, i) => (
            <div key={type} className="mt-5">
              <div className="mb-1 flex justify-between text-sm text-content">
                <span>{type}</span>
                <span className="text-muted">{[42, 88, 15, 0][i]}/50</span>
              </div>
              <div className="h-2 rounded bg-panel-soft">
                <div className="h-full rounded bg-primary" style={{ width: `${[84, 80, 70, 0][i]}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-6">
            <Insight>Dự đoán cần thêm 15 phút để hoàn tất check-in nếu tốc độ hiện tại không đổi.</Insight>
          </div>
        </StaffPanel>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <StaffTable
          headers={['Thời gian', 'Người tham dự', 'Loại', 'Phương thức']}
          rows={[
            ['14:22:10', 'Sarah Jenkins', <Badge key="vip" tone="purple">VIP</Badge>, 'QR Scan'],
            ['14:21:45', 'Michael Chen', <Badge key="gen">General</Badge>, 'Manual']
          ]}
        />
        <StaffTable
          headers={['Thời gian', 'Mã vé', 'Lý do', 'Hành động']}
          rows={[
            ['14:15:22', '#QRE-4921', <Badge key="bad" tone="red">Invalid Event</Badge>, 'Details'],
            ['13:58:10', '#QRE-1104', <Badge key="used" tone="red">Already Used</Badge>, 'Details']
          ]}
        />
      </div>
      <button className="fixed bottom-6 right-6 grid size-12 place-items-center rounded-xl bg-primary text-slate-950 shadow-lg hover:opacity-90 transition">
        <Plus className="size-5" />
      </button>
    </StaffPage>
  )
}
