import { Badge, Insight, StaffPage, StaffPanel } from './StaffComponents.jsx'

export function StaffEventDetailPage() {
  return (
    <StaffPage title="Global Tech Summit 2024" description="Chi tiết vận hành sự kiện được giao.">
      <div className="mb-5 grid gap-4 md:grid-cols-5">
        {[
          ['Tổng vé', '2,500'],
          ['Đã check-in', '1,402'],
          ['Chưa quét', '1,098'],
          ['Lỗi', '14'],
          ['Tỷ lệ', '56%'],
        ].map(([label, value]) => (
          <StaffPanel key={label}>
            <p className="text-xs font-bold uppercase text-muted">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-content">{value}</p>
          </StaffPanel>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Insight>Phát hiện lưu lượng cao. Đề xuất mở thêm 2 làn check-in từ 10:00 đến 11:30.</Insight>
          <div className="grid gap-5 md:grid-cols-2">
            <StaffPanel>
              <h3 className="font-bold text-content">Sơ đồ khu vực</h3>
              <div className="mt-4 grid h-44 place-items-center rounded-xl bg-tertiary/15 text-tertiary font-extrabold border border-border-soft/20">Gate B-2</div>
            </StaffPanel>
            <StaffPanel>
              <h3 className="font-bold text-content">Nhân sự cùng ca</h3>
              {['Sarah Harrison', 'Michael Rodriguez', 'Elena Stone'].map((name) => (
                <p key={name} className="mt-4 text-sm font-semibold text-content">{name}</p>
              ))}
            </StaffPanel>
          </div>
        </div>
        <StaffPanel>
          <h3 className="font-bold text-error">Cảnh báo trực tiếp</h3>
          <div className="mt-4 space-y-3 text-sm text-subtle">
            <p><Badge tone="red">Khẩn cấp</Badge></p>
            <p>Lối vào B đang có mật độ cao.</p>
            <p>09:45 AM - Supervisor kiểm tra làn VIP.</p>
          </div>
        </StaffPanel>
      </div>
    </StaffPage>
  )
}
