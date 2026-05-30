import { Calendar, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, StaffPage, StaffPanel, StaffSearch } from './StaffComponents.jsx'

const events = [
  ['Neon Pulse: City Arena', 'Hôm nay, 18:00 - 02:00', 'Downtown Plaza Center', 'Ongoing', '1,420 / 2,500'],
  ['Global Tech Summit 2024', 'Tomorrow, 08:30 - 17:00', 'Exhibition Hall B', 'Upcoming', '0 / 850'],
  ['Abstract Visions Gala', 'Chủ nhật, 22:00', 'Gallery One', 'Ongoing', '195 / 200'],
]

export function StaffEventsPage({ empty = false }) {
  if (empty) return <NoAssignedEventsPage />

  return (
    <StaffPage title="Sự kiện được giao" description="Quản lý ca check-in cho các sự kiện sắp tới.">
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <StaffSearch placeholder="Tìm theo tên sự kiện, địa điểm..." />
        <select className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm">
          <option>Tất cả vai trò</option>
        </select>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <StaffPanel key={event[0]}>
            <div className="mb-4 grid h-36 place-items-center rounded-md bg-gradient-to-br from-primary/20 to-ai/20 text-primary">
              <Calendar className="size-12" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-extrabold">{event[0]}</h3>
              <Badge tone={event[3] === 'Ongoing' ? 'green' : 'blue'}>{event[3]}</Badge>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-[#434655]"><Calendar className="size-4" />{event[1]}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#434655]"><MapPin className="size-4" />{event[2]}</p>
            <p className="mt-5 text-sm font-semibold">Tiến độ check-in <span className="float-right">{event[4]}</span></p>
            <div className="mt-2 h-2 rounded bg-[#e0e3e5]"><div className="h-full w-2/3 rounded bg-primary" /></div>
            <div className="mt-5 flex gap-3">
              <Link to="/staff/qr-check-in" className="admin-primary flex-1">Bắt đầu</Link>
              <Link to="/staff/events/detail" className="admin-secondary flex-1">Chi tiết</Link>
            </div>
          </StaffPanel>
        ))}
      </div>
    </StaffPage>
  )
}

export function NoAssignedEventsPage() {
  return (
    <div className="grid min-h-[calc(100vh-140px)] place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-32 place-items-center rounded-md bg-[#eceef0] text-[#a0a6b2]">
          <Calendar className="size-16" />
        </div>
        <h1 className="mt-6 text-xl font-extrabold text-[#191c1e]">Chưa có sự kiện được giao</h1>
        <p className="mt-3 text-sm leading-6 text-[#434655]">
          Bạn chưa được phân công vào sự kiện nào. Vui lòng liên hệ ban tổ chức nếu có nhầm lẫn.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button className="admin-primary opacity-60">Quét QR</button>
          <button className="admin-secondary">Làm mới</button>
        </div>
      </div>
    </div>
  )
}
