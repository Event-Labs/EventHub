import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardList,
  Clock,
  Filter,
  Loader2,
  Plus,
  User,
  X,
} from 'lucide-react'
import {
  createStaffTask,
  fetchOrganizerOperationsOverview,
  fetchOrganizerStaffTasks,
} from '@/services/operations.js'
import { AvatarInitials, Badge, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  TODO: {
    label: 'Cần làm',
    icon: CircleDashed,
    color: 'text-muted',
    bg: 'bg-panel-soft/60',
    border: 'border-border-soft/20',
    badge: 'gray',
  },
  IN_PROGRESS: {
    label: 'Đang làm',
    icon: Clock,
    color: 'text-primary',
    bg: 'bg-tertiary/10',
    border: 'border-tertiary/30',
    badge: 'blue',
  },
  DONE: {
    label: 'Hoàn thành',
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'bg-success/15',
    border: 'border-success/30',
    badge: 'green',
  },
}

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']

// ─── Main Page ───────────────────────────────────────────────────────────────

export function OrganizerTasksPage() {
  const [overview, setOverview] = useState(null)
  const [tasks, setTasks] = useState([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [filterStaffId, setFilterStaffId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Load overview (for events & staff list) + tasks
  const loadAll = async (eventId) => {
    setLoading(true)
    setError('')
    try {
      const [ov, taskList] = await Promise.all([
        fetchOrganizerOperationsOverview(),
        fetchOrganizerStaffTasks(eventId ? { event_id: eventId } : {}),
      ])
      setOverview(ov)
      setTasks(taskList)
      if (!selectedEventId && ov.events?.[0]?.id) {
        setSelectedEventId(ov.events[0].id)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll(selectedEventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload tasks when event filter changes
  const handleEventChange = async (eventId) => {
    setSelectedEventId(eventId)
    setFilterStaffId('')
    setLoading(true)
    setError('')
    try {
      const taskList = await fetchOrganizerStaffTasks(eventId ? { event_id: eventId } : {})
      setTasks(taskList)
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải công việc.')
    } finally {
      setLoading(false)
    }
  }

  // Staff list from the selected event's assignments
  const assignedStaff = useMemo(
    () =>
      (overview?.staff_assignments || []).filter(
        (s) => !selectedEventId || s.event_id === selectedEventId,
      ),
    [overview?.staff_assignments, selectedEventId],
  )

  // Derive unique staff from tasks (in case overview is stale)
  const staffFromTasks = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (t.staff_id && !map.has(t.staff_id)) {
        map.set(t.staff_id, { staff_id: t.staff_id, staff_name: t.staff_name, staff_email: t.staff_email })
      }
    }
    return Array.from(map.values())
  }, [tasks])

  const staffOptions = useMemo(() => {
    const map = new Map()
    for (const s of [...assignedStaff, ...staffFromTasks]) {
      const id = s.staff_id
      if (id && !map.has(id)) map.set(id, s)
    }
    return Array.from(map.values())
  }, [assignedStaff, staffFromTasks])

  // Filtered + grouped tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStaffId && t.staff_id !== filterStaffId) return false
      if (filterStatus && t.status !== filterStatus) return false
      return true
    })
  }, [tasks, filterStaffId, filterStatus])

  const tasksByStatus = useMemo(() => {
    const groups = { TODO: [], IN_PROGRESS: [], DONE: [] }
    for (const t of filteredTasks) {
      if (groups[t.status]) groups[t.status].push(t)
    }
    return groups
  }, [filteredTasks])

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter((t) => t.status === 'DONE').length
    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length
    const todo = tasks.filter((t) => t.status === 'TODO').length
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, inProgress, todo, progress }
  }, [tasks])

  const selectedEvent = overview?.events?.find((e) => e.id === selectedEventId)

  return (
    <OrganizerPage
      title="Công việc nhân sự"
      description="Theo dõi tiến độ và giao việc cho từng staff theo sự kiện."
    >
      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          {/* Event selector */}
          <label className="flex flex-col gap-1 text-xs font-bold text-subtle">
            Sự kiện
            <div className="relative">
              <select
                className="h-10 w-56 appearance-none rounded-xl border border-border-soft/40 bg-panel-soft pl-3 pr-8 text-sm font-semibold text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={selectedEventId}
                onChange={(e) => handleEventChange(e.target.value)}
                disabled={loading}
              >
                <option value="" className="bg-surface text-content">Tất cả sự kiện</option>
                {(overview?.events || []).map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-surface text-content">
                    {ev.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
            </div>
          </label>

          {/* Staff filter */}
          <label className="flex flex-col gap-1 text-xs font-bold text-subtle">
            <span className="flex items-center gap-1">
              <Filter className="size-3" /> Lọc theo staff
            </span>
            <div className="relative">
              <select
                className="h-10 w-48 appearance-none rounded-xl border border-border-soft/40 bg-panel-soft pl-3 pr-8 text-sm font-semibold text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={filterStaffId}
                onChange={(e) => setFilterStaffId(e.target.value)}
                disabled={loading}
              >
                <option value="" className="bg-surface text-content">Tất cả staff</option>
                {staffOptions.map((s) => (
                  <option key={s.staff_id} value={s.staff_id} className="bg-surface text-content">
                    {s.staff_name || s.staff_email || 'Staff'}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
            </div>
          </label>

          {/* Status filter */}
          <label className="flex flex-col gap-1 text-xs font-bold text-subtle">
            Trạng thái
            <div className="relative">
              <select
                className="h-10 w-40 appearance-none rounded-xl border border-border-soft/40 bg-panel-soft pl-3 pr-8 text-sm font-semibold text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                disabled={loading}
              >
                <option value="" className="bg-surface text-content">Tất cả</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-surface text-content">
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
            </div>
          </label>

          {/* Clear filters */}
          {(filterStaffId || filterStatus) && (
            <button
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-subtle hover:border-tertiary hover:text-tertiary transition-colors"
              onClick={() => { setFilterStaffId(''); setFilterStatus('') }}
            >
              <X className="size-3.5" /> Xóa lọc
            </button>
          )}
        </div>

        <button
          className="org-btn-primary self-end"
          onClick={() => setShowCreateModal(true)}
          disabled={loading || !selectedEventId}
        >
          <Plus className="size-4" />
          Tạo công việc
        </button>
      </div>

      {/* ── Progress stats ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng công việc" value={stats.total} icon={ClipboardList} />
        <StatCard label="Cần làm" value={stats.todo} icon={CircleDashed} tone="gray" />
        <StatCard label="Đang làm" value={stats.inProgress} icon={Clock} tone="blue" />
        <StatCard label="Hoàn thành" value={stats.done} icon={CheckCircle2} tone="green" />
      </div>

      {/* ── Progress bar ── */}
      {stats.total > 0 && (
        <OrganizerPanel className="mb-5">
          <div className="flex items-center justify-between text-sm font-bold text-content">
            <span>Tiến độ tổng thể{selectedEvent ? ` — ${selectedEvent.title}` : ''}</span>
            <span className="text-primary">{stats.progress}%</span>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-panel-soft">
            <div
              className="h-full rounded-full bg-tertiary transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span>{stats.done} hoàn thành</span>
            <span>{stats.inProgress} đang làm</span>
            <span>{stats.todo} chưa bắt đầu</span>
          </div>
        </OrganizerPanel>
      )}

      {/* ── Loading / Empty ── */}
      {loading ? (
        <OrganizerPanel className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
        </OrganizerPanel>
      ) : !selectedEventId ? (
        <OrganizerPanel className="py-12 text-center text-sm text-muted">
          Chọn một sự kiện để xem công việc.
        </OrganizerPanel>
      ) : filteredTasks.length === 0 ? (
        <OrganizerPanel className="py-12 text-center border-dashed">
          <ClipboardList className="mx-auto mb-3 size-10 text-muted" />
          <p className="text-sm font-semibold text-subtle">Chưa có công việc nào.</p>
          <p className="mt-1 text-xs text-muted">
            Nhấn &ldquo;Tạo công việc&rdquo; để giao việc cho staff.
          </p>
        </OrganizerPanel>
      ) : (
        /* ── Kanban board ── */
        <div className="grid gap-4 lg:grid-cols-3">
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
            />
          ))}
        </div>
      )}

      {/* ── Staff breakdown table ── */}
      {!loading && tasks.length > 0 && (
        <div className="mt-7">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-subtle">
            Tiến độ theo nhân sự
          </h2>
          <StaffProgressTable tasks={tasks} staffOptions={staffOptions} />
        </div>
      )}

      {/* ── Create task modal ── */}
      {showCreateModal && (
        <CreateTaskModal
          events={overview?.events || []}
          selectedEventId={selectedEventId}
          assignedStaff={assignedStaff}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            handleEventChange(selectedEventId)
          }}
        />
      )}
    </OrganizerPage>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ status, tasks }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-4 shadow-sm`}>
      {/* Column header */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className={`flex items-center gap-2 font-extrabold ${cfg.color}`}>
          <Icon className="size-4" />
          {cfg.label}
        </div>
        <span className="rounded-full bg-surface/80 border border-border-soft/20 px-2 py-0.5 text-xs font-bold text-content shadow-sm">
          {tasks.length}
        </span>
      </div>

      {/* Task cards */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border-soft/20 px-3 py-6 text-center text-xs text-muted bg-surface/20">
            Trống
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task }) {
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO
  const createdDate = task.created_at
    ? new Date(task.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    : null

  return (
    <div className="rounded-xl border border-border-soft/20 bg-surface/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.12)] text-content">
      <p className="font-bold leading-snug text-content">{task.title}</p>
      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-subtle">{task.description}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AvatarInitials name={task.staff_name || 'Staff'} className="size-6" />
          <span className="max-w-[100px] truncate text-xs font-semibold text-subtle">
            {task.staff_name || 'Staff'}
          </span>
        </div>
        <Badge tone={cfg.badge}>{cfg.label}</Badge>
      </div>
      {createdDate && (
        <p className="mt-2 text-right text-[10px] text-muted">{createdDate}</p>
      )}
    </div>
  )
}

// ─── Staff Progress Table ─────────────────────────────────────────────────────

function StaffProgressTable({ tasks, staffOptions }) {
  const rows = useMemo(() => {
    return staffOptions
      .map((s) => {
        const staffTasks = tasks.filter((t) => t.staff_id === s.staff_id)
        const done = staffTasks.filter((t) => t.status === 'DONE').length
        const inProgress = staffTasks.filter((t) => t.status === 'IN_PROGRESS').length
        const todo = staffTasks.filter((t) => t.status === 'TODO').length
        const total = staffTasks.length
        const progress = total > 0 ? Math.round((done / total) * 100) : 0
        return { ...s, done, inProgress, todo, total, progress }
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [tasks, staffOptions])

  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft/30 bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border-soft/30 bg-panel-soft/30 text-xs uppercase text-muted">
          <tr>
            <th className="px-5 py-3 font-bold">Nhân sự</th>
            <th className="px-5 py-3 font-bold">Tổng</th>
            <th className="px-5 py-3 font-bold">Cần làm</th>
            <th className="px-5 py-3 font-bold">Đang làm</th>
            <th className="px-5 py-3 font-bold">Hoàn thành</th>
            <th className="px-5 py-3 font-bold">Tiến độ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.staff_id} className="border-t border-border-soft/20 hover:bg-panel-soft/60 transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <AvatarInitials name={row.staff_name || 'Staff'} className="size-8" />
                  <div>
                    <p className="font-bold text-content">{row.staff_name || 'Staff'}</p>
                    {row.staff_email && (
                      <p className="text-xs text-muted">{row.staff_email}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-5 py-3 font-bold text-content">{row.total}</td>
              <td className="px-5 py-3 text-muted">{row.todo}</td>
              <td className="px-5 py-3 text-primary font-semibold">{row.inProgress}</td>
              <td className="px-5 py-3 text-success font-semibold">{row.done}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-panel-soft">
                    <div
                      className="h-full rounded-full bg-tertiary transition-all duration-300"
                      style={{ width: `${row.progress}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs font-bold text-subtle">
                    {row.progress}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({ events, selectedEventId, assignedStaff, onClose, onCreated }) {
  const [form, setForm] = useState({
    event_id: selectedEventId || events[0]?.id || '',
    staff_id: '',
    title: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Staff for current event selection in form
  const staffForEvent = useMemo(
    () => assignedStaff.filter((s) => !form.event_id || s.event_id === form.event_id),
    [assignedStaff, form.event_id],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.event_id || !form.staff_id || !form.title.trim()) return
    setSaving(true)
    setError('')
    try {
      await createStaffTask({
        event_id: form.event_id,
        staff_id: form.staff_id,
        title: form.title.trim(),
        description: form.description.trim(),
      })
      onCreated()
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tạo công việc.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030818]/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-border-soft/30 shadow-2xl text-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft/20 px-6 py-4">
          <div className="flex items-center gap-2 font-extrabold text-content">
            <ClipboardList className="size-5 text-primary" />
            Tạo công việc mới
          </div>
          <button
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel-soft/60 hover:text-content transition-colors"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form className="px-6 py-5" onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-2 text-sm font-semibold text-error">
              {error}
            </div>
          )}

          <div className="grid gap-4">
            {/* Event */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              Sự kiện
              <select
                className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={form.event_id}
                onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value, staff_id: '' }))}
                required
              >
                <option value="" className="bg-surface text-content">Chọn sự kiện...</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-surface text-content">{ev.title}</option>
                ))}
              </select>
            </label>

            {/* Staff */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              <span className="flex items-center gap-1">
                <User className="size-3" /> Staff phụ trách
              </span>
              <select
                className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
                value={form.staff_id}
                onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                disabled={staffForEvent.length === 0}
                required
              >
                <option value="" className="bg-surface text-content">
                  {staffForEvent.length === 0
                    ? 'Không có staff cho sự kiện này'
                    : 'Chọn staff...'}
                </option>
                {staffForEvent.map((s) => (
                  <option key={s.staff_id} value={s.staff_id} className="bg-surface text-content">
                    {s.staff_name || s.staff_email} {s.staff_role ? `— ${s.staff_role}` : ''}
                  </option>
                ))}
              </select>
              {staffForEvent.length === 0 && form.event_id && (
                <p className="text-xs text-muted">
                  Chưa có staff được phân công. Thêm nhân sự tại trang Quản lý nhân sự.
                </p>
              )}
            </label>

            {/* Title */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              Tên công việc
              <input
                className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="VD: Kiểm tra check-in, Hỗ trợ khu A..."
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                maxLength={200}
              />
            </label>

            {/* Description */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              Mô tả
              <textarea
                className="min-h-[88px] rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-2 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="Chi tiết công việc, vị trí, thời gian..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              className="org-btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="org-btn-primary"
              disabled={saving || !form.event_id || !form.staff_id || !form.title.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Tạo công việc
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, tone = 'primary' }) {
  const styles = {
    primary: { bg: 'bg-tertiary/10 border-tertiary/20', text: 'text-primary', val: 'text-content' },
    gray: { bg: 'bg-panel-soft/60 border-border-soft/20', text: 'text-muted', val: 'text-content' },
    blue: { bg: 'bg-tertiary/10 border-tertiary/20', text: 'text-primary', val: 'text-content' },
    green: { bg: 'bg-success/15 border-success/20', text: 'text-success', val: 'text-content' },
  }
  const s = styles[tone] || styles.primary

  return (
    <div className={`rounded-2xl border ${s.bg} px-4 py-3 shadow-sm text-content`}>
      <div className={`flex items-center gap-2 text-xs font-bold uppercase ${s.text}`}>
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className={`mt-1.5 text-2xl font-extrabold ${s.val}`}>{value}</p>
    </div>
  )
}
