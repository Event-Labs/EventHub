import { useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { UpdateTaskStatusModal } from '@/components/Modal.jsx'
import { Avatar, Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'

const columns = [
  ['Chưa bắt đầu', 'Setup VIP Lounge Signage', 'Khẩn cấp', 'Sarah J.'],
  ['Đang thực hiện', 'Check AV equipment in Suite B', 'Trung bình', 'Mike T.'],
  ['Hoàn thành', 'Verify scanner battery levels', 'Done', 'Sarah J.'],
]

export function StaffTasksPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <StaffPage
      title="Công việc được giao"
      description="Quản lý checklist và công việc vận hành."
      action={<button className="admin-primary">+ Công việc mới</button>}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {['Trạng thái: Tất cả', 'Ưu tiên: Cao', 'Hạn: Tuần này'].map((filter) => <button key={filter} className="admin-secondary">{filter}</button>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {columns.map((column) => (
          <div key={column[0]}>
            <h3 className="mb-3 font-bold">{column[0]}</h3>
            <StaffPanel>
              <div className="flex items-start justify-between">
                <Badge tone={column[2] === 'Khẩn cấp' ? 'red' : column[2] === 'Done' ? 'green' : 'yellow'}>{column[2]}</Badge>
                <MoreVertical className="size-4 text-[#737686]" />
              </div>
              <h4 className="mt-4 font-extrabold">{column[1]}</h4>
              <p className="mt-2 text-sm text-[#434655]">TechNexus Summit 2024</p>
              <div className="mt-5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm"><Avatar name={column[3]} className="size-7" />{column[3]}</span>
                <button className="admin-primary py-2 text-xs" onClick={() => setModalOpen(true)}>Cập nhật</button>
              </div>
            </StaffPanel>
          </div>
        ))}
      </div>
      <UpdateTaskStatusModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </StaffPage>
  )
}
