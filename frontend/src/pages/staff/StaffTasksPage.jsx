import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDashed, Clock, Loader2, MoreVertical } from 'lucide-react'
import { Modal } from '@/components/Modal.jsx'
import { fetchAssignedStaffTasks, updateAssignedStaffTaskStatus } from '@/services/operations.js'
import { Avatar, Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

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

const STATUS_ORDER = ['TODO', 'IN_PROGRESS', 'DONE']
const statuses = STATUS_ORDER.map((status) => [status, STATUS_CONFIG[status]])

function taskDisplayId(taskId) {
  const value = String(taskId || '').replace(/-/g, '')
  return value ? `TASK-${value.slice(-4).toUpperCase()}` : 'TASK'
}

export function StaffTasksPage() {
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingTaskId, setUpdatingTaskId] = useState('')
  const [draggedTaskId, setDraggedTaskId] = useState('')
  const [dragOverStatus, setDragOverStatus] = useState('')
  const [detailTask, setDetailTask] = useState(null)

  useEffect(() => {
    let active = true

    async function loadTasks() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchAssignedStaffTasks()
        if (active) setTasks(data)
      } catch (err) {
        if (active) {
          const message = getApiMessage(err, 'Không thể tải công việc được giao.')
          setError(message)
          toast.error(message)
        }
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
    const currentTask = tasks.find((task) => task.id === taskId)
    if (!currentTask || currentTask.status === status || updatingTaskId) return

    setUpdatingTaskId(taskId)
    setError('')
    try {
      const updatedTask = await updateAssignedStaffTaskStatus(taskId, status)
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? { ...task, ...updatedTask } : task)),
      )
      toast.success('Đã cập nhật trạng thái công việc.')
    } catch (err) {
      const message = getApiMessage(err, 'Không thể cập nhật trạng thái công việc.')
      setError(message)
      toast.error(message)
    } finally {
      setUpdatingTaskId('')
    }
  }

  const handleDragStart = (event, taskId) => {
    setDraggedTaskId(taskId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', taskId)
    const rect = event.currentTarget.getBoundingClientRect()
    event.dataTransfer.setDragImage(event.currentTarget, event.clientX - rect.left, event.clientY - rect.top)
  }

  const handleDragEnd = () => {
    setDraggedTaskId('')
    setDragOverStatus('')
  }

  const handleColumnDragOver = (event, status) => {
    if (!draggedTaskId || updatingTaskId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }

  const handleColumnDrop = async (event, status) => {
    event.preventDefault()
    const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId
    setDraggedTaskId('')
    setDragOverStatus('')
    await handleStatusChange(taskId, status)
  }

  return (
    <StaffPage
      title="Công việc được giao"
      description="Theo dõi checklist và công việc vận hành từ ban tổ chức."
    >


      {loading ? (
        <StaffPanel>Đang tải dữ liệu...</StaffPanel>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {statuses.map(([status, config]) => {
            const Icon = config.icon
            const tasksInStatus = groupedTasks[status] || []

            return (
              <section
                key={status}
                onDragOver={(event) => handleColumnDragOver(event, status)}
                onDragLeave={() => setDragOverStatus((current) => (current === status ? '' : current))}
                onDrop={(event) => handleColumnDrop(event, status)}
                className={`rounded-md border border-border-soft/20 bg-panel-soft/35 p-3 transition ${dragOverStatus === status ? 'border-tertiary/60 bg-tertiary/10' : ''
                  }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase text-subtle">
                    <Icon className="size-4 text-muted" />
                    {config.label}
                  </h3>
                  <span className="rounded bg-surface px-2 py-0.5 text-xs font-bold text-subtle">
                    {tasksInStatus.length}
                  </span>
                </div>

                <div className="min-h-[360px] space-y-3">
                  {tasksInStatus.map((task) => (
                    <TaskPanel
                      key={task.id}
                      task={task}
                      updating={updatingTaskId === task.id}
                      dragging={draggedTaskId === task.id}
                      disabled={Boolean(updatingTaskId)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onOpenDetail={setDetailTask}
                    />
                  ))}
                  {tasksInStatus.length === 0 && (
                    <div className="rounded-md border border-dashed border-border-soft/40 px-4 py-6 text-center text-sm text-muted">
                      Chưa có công việc.
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />
    </StaffPage>
  )
}

function TaskPanel({ task, updating, dragging, disabled, onDragStart, onDragEnd, onOpenDetail }) {
  const currentStatus = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO
  const displayId = taskDisplayId(task.id)

  return (
    <article
      draggable={!disabled}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpenDetail(task)}
      className={`h-40 cursor-pointer rounded-md border border-border-soft/30 bg-surface p-4 shadow-[0_3px_12px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:border-tertiary/50 hover:shadow-[0_10px_24px_rgba(0,0,0,0.22)] active:cursor-grabbing ${dragging ? 'scale-[0.99] ring-2 ring-tertiary/40' : ''
        } ${disabled && !updating ? 'opacity-70' : ''}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <h4 className="line-clamp-2 min-h-12 flex-1 text-[15px] font-extrabold leading-6 text-content">
            {task.title}
          </h4>
          <div className="flex shrink-0 items-start gap-1">
            {updating && <Loader2 className="mt-1 size-4 animate-spin text-muted" />}
            <button
              type="button"
              draggable={false}
              className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-panel-soft hover:text-tertiary"
              title="Xem chi tiết"
              aria-label="Xem chi tiết công việc"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onOpenDetail(task)
              }}
            >
              <MoreVertical className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 min-w-0">
          <span className="inline-block max-w-full truncate rounded bg-tertiary/15 px-2 py-0.5 text-xs font-extrabold uppercase text-tertiary">
            {task.event_title}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-subtle">
            <CheckCircle2 className={`size-4 shrink-0 ${task.status === 'DONE' ? 'text-success' : 'text-tertiary'}`} />
            <span className={`truncate ${task.status === 'DONE' ? 'line-through' : ''}`}>{displayId}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge tone={currentStatus.tone}>{currentStatus.label}</Badge>
            <Avatar name={task.event_title || 'EventHub'} className="size-7" />
          </span>
        </div>
      </div>
    </article>
  )
}

function TaskDetailModal({ task, onClose }) {
  const statusConfig = task ? STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO : STATUS_CONFIG.TODO

  return (
    <Modal open={Boolean(task)} title="Chi tiết công việc" onClose={onClose} maxWidth="max-w-2xl">
      {task && (
        <div className="space-y-4">
          <div className="rounded-md border border-border-soft/30 bg-panel-soft/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone={statusConfig.tone}>{statusConfig.label}</Badge>
              <span className="text-sm font-semibold text-subtle">
                {new Date(task.created_at).toLocaleDateString('vi-VN')}
              </span>
            </div>
            <h3 className="mt-4 text-xl font-extrabold text-content">{task.title}</h3>
            <p className="mt-2 text-sm font-semibold text-subtle">{task.event_title}</p>
          </div>

          <div className="rounded-md border border-border-soft/30 bg-surface p-4">
            <p className="text-xs font-bold uppercase text-muted">Mô tả</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-content">
              {task.description || 'Chưa có mô tả.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Ngày tạo" value={new Date(task.created_at).toLocaleString('vi-VN')} />
            <DetailItem label="Cập nhật gần nhất" value={new Date(task.updated_at || task.created_at).toLocaleString('vi-VN')} />
          </div>
        </div>
      )}
    </Modal>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-md border border-border-soft/30 bg-panel-soft/40 p-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-content">{value}</p>
    </div>
  )
}
