import { useEffect, useMemo, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { fetchAssignedStaffTasks } from '@/services/operations.js'
import { Avatar, Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'

const statuses = [
  ['TODO', 'Chưa bắt đầu'],
  ['IN_PROGRESS', 'Đang thực hiện'],
  ['DONE', 'Hoàn thành'],
]

export function StaffTasksPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadTasks() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchAssignedStaffTasks()
        if (active) setTasks(data)
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Không thể tải công việc được giao.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTasks()
    return () => {
      active = false
    }
  }, [])

  const groupedTasks = useMemo(
    () => Object.fromEntries(statuses.map(([status]) => [status, tasks.filter((task) => task.status === status)])),
    [tasks],
  )

  return (
    <StaffPage
      title="Công việc được giao"
      description="Theo dõi checklist và công việc vận hành từ ban tổ chức."
    >
      {error && <div className="mb-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {loading ? (
        <StaffPanel>Đang tải dữ liệu...</StaffPanel>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {statuses.map(([status, label]) => (
            <div key={status}>
              <h3 className="mb-3 font-bold">{label}</h3>
              <div className="space-y-4">
                {(groupedTasks[status] || []).map((task) => (
                  <TaskPanel key={task.id} task={task} />
                ))}
                {(groupedTasks[status] || []).length === 0 && (
                  <StaffPanel className="text-sm text-muted">Chưa có công việc.</StaffPanel>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </StaffPage>
  )
}

function TaskPanel({ task }) {
  const tone = task.status === 'DONE' ? 'green' : task.status === 'IN_PROGRESS' ? 'yellow' : 'gray'

  return (
    <StaffPanel>
      <div className="flex items-start justify-between">
        <Badge tone={tone}>{task.status}</Badge>
        <MoreVertical className="size-4 text-muted" />
      </div>
      <h4 className="mt-4 font-extrabold">{task.title}</h4>
      <p className="mt-2 text-sm font-semibold text-subtle">{task.event_title}</p>
      {task.description && <p className="mt-3 text-sm leading-6 text-subtle">{task.description}</p>}
      <div className="mt-5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          <Avatar name={task.event_title || 'EventHub'} className="size-7" />
          {new Date(task.created_at).toLocaleDateString('vi-VN')}
        </span>
      </div>
    </StaffPanel>
  )
}
