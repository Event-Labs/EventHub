import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDashed, Clock, Loader2 } from 'lucide-react'
import { fetchAssignedStaffTasks, updateAssignedStaffTaskStatus } from '@/services/operations.js'
import { Avatar, Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'

const STATUS_CONFIG = {
  TODO: {
    label: 'Chưa làm',
    tone: 'gray',
    icon: CircleDashed,
  },
  IN_PROGRESS: {
    label: 'Đang làm',
    tone: 'yellow',
    icon: Clock,
  },
  DONE: {
    label: 'Đã hoàn thành',
    tone: 'green',
    icon: CheckCircle2,
  },
}

const statuses = Object.entries(STATUS_CONFIG)

export function StaffTasksPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingTaskId, setUpdatingTaskId] = useState('')

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

  const handleStatusChange = async (taskId, status) => {
    setUpdatingTaskId(taskId)
    setError('')
    try {
      const updatedTask = await updateAssignedStaffTaskStatus(taskId, status)
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? { ...task, ...updatedTask } : task)),
      )
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể cập nhật trạng thái công việc.')
    } finally {
      setUpdatingTaskId('')
    }
  }

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
          {statuses.map(([status, config]) => {
            const Icon = config.icon

            return (
              <div key={status}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Icon className="size-4 text-muted" />
                    {config.label}
                  </h3>
                  <span className="rounded-full border border-border-soft/30 bg-panel-soft px-2 py-0.5 text-xs font-bold text-subtle">
                    {(groupedTasks[status] || []).length}
                  </span>
                </div>
                <div className="space-y-4">
                  {(groupedTasks[status] || []).map((task) => (
                    <TaskPanel
                      key={task.id}
                      task={task}
                      updating={updatingTaskId === task.id}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                  {(groupedTasks[status] || []).length === 0 && (
                    <StaffPanel className="text-sm text-muted">Chưa có công việc.</StaffPanel>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </StaffPage>
  )
}

function TaskPanel({ task, updating, onStatusChange }) {
  const currentStatus = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO

  return (
    <StaffPanel>
      <div className="flex items-start justify-between">
        <Badge tone={currentStatus.tone}>{currentStatus.label}</Badge>
        {updating && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>
      <h4 className="mt-4 font-extrabold">{task.title}</h4>
      <p className="mt-2 text-sm font-semibold text-subtle">{task.event_title}</p>
      {task.description && <p className="mt-3 text-sm leading-6 text-subtle">{task.description}</p>}
      <div className="mt-5 grid gap-2">
        <p className="text-xs font-bold uppercase text-muted">Cập nhật trạng thái</p>
        <div className="grid grid-cols-3 gap-2">
          {statuses.map(([status, config]) => {
            const Icon = config.icon
            const active = task.status === status

            return (
              <button
                key={status}
                type="button"
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? 'border-tertiary bg-tertiary/15 text-tertiary'
                    : 'border-border-soft/30 bg-panel-soft text-subtle hover:border-tertiary/50 hover:text-tertiary'
                }`}
                onClick={() => onStatusChange(task.id, status)}
                disabled={updating || active}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="leading-tight">{config.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          <Avatar name={task.event_title || 'EventHub'} className="size-7" />
          {new Date(task.created_at).toLocaleDateString('vi-VN')}
        </span>
      </div>
    </StaffPanel>
  )
}
