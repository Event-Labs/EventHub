import { CalendarDays, Edit, Eye, Plus } from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerPanel,
  OrganizerTable,
  SearchBar,
} from './OrganizerComponents.jsx'

const events = [
  ['Neon Horizon Music Festival', 'Oct 24, 2024', 'Published', '12,450', '$184,200'],
  ['Future Builders Summit', 'Nov 08, 2024', 'Draft', '0', '$0'],
  ['Gala for Good', 'Dec 12, 2024', 'Reviewing', '840', '$32,500'],
]

export function OrganizerEventsPage() {
  return (
    <OrganizerPage
      title="Quản lý sự kiện"
      description="Theo dõi, chỉnh sửa và vận hành các sự kiện của ban tổ chức."
      action="Tạo sự kiện"
    >
      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBar placeholder="Tìm theo tên sự kiện..." />
          <select className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm">
            <option>Tất cả trạng thái</option>
            <option>Đã xuất bản</option>
            <option>Bản nháp</option>
          </select>
          <button className="admin-secondary">
            <Plus className="size-4" />
            Bộ lọc
          </button>
        </div>
      </OrganizerPanel>
      <OrganizerTable
        headers={['Sự kiện', 'Ngày diễn ra', 'Trạng thái', 'Vé đã bán', 'Doanh thu', 'Hành động']}
        rows={events.map((event) => [
          <div key="event" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-[#dbe1ff] text-primary">
              <CalendarDays className="size-5" />
            </span>
            <span className="font-bold">{event[0]}</span>
          </div>,
          event[1],
          <Badge
            key="status"
            tone={event[2] === 'Published' ? 'green' : event[2] === 'Draft' ? 'gray' : 'blue'}
          >
            {event[2]}
          </Badge>,
          event[3],
          event[4],
          <div key="actions" className="flex items-center gap-3 text-[#737686]">
            <Eye className="size-4" />
            <Edit className="size-4" />
          </div>,
        ])}
      />
    </OrganizerPage>
  )
}
