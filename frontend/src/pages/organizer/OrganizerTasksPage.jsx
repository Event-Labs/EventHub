import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Search, Trash2, UserPlus } from 'lucide-react'
import {
  createStaffTask,
  fetchOrganizerOperationsOverview,
  fetchStaffCandidates,
  inviteStaffToEvent,
  removeStaffFromEvent,
} from '@/services/operations.js'
import { AvatarInitials, Badge, OrganizerPage, OrganizerPanel, OrganizerTable } from './OrganizerComponents.jsx'

const taskColumns = [
  ['TODO', 'Cần làm'],
  ['IN_PROGRESS', 'Đang làm'],
  ['DONE', 'Hoàn thành'],
]

export function OrganizerTasksPage() {
  const [data, setData] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [assignForm, setAssignForm] = useState({ email: '', staff_role: 'Check-in' })
  const [taskForm, setTaskForm] = useState({ staff_id: '', title: '', description: '' })
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const overview = await fetchOrganizerOperationsOverview()
      setData(overview)
      setSelectedEventId((current) => current || overview.events?.[0]?.id || '')
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu vận hành.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    let active = true

    const loadCandidates = async () => {
      if (!candidateSearch.trim()) {
        setCandidates([])
        return
      }

      try {
        const rows = await fetchStaffCandidates({ search: candidateSearch.trim() })
        if (active) setCandidates(rows)
      } catch {
        if (active) setCandidates([])
      }
    }

    const timer = setTimeout(loadCandidates, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [candidateSearch])

  const selectedEvent = useMemo(
    () => data?.events?.find((event) => event.id === selectedEventId),
    [data?.events, selectedEventId],
  )

  const assignedStaff = useMemo(
    () => (data?.staff_assignments || []).filter((item) => item.event_id === selectedEventId),
    [data?.staff_assignments, selectedEventId],
  )

  const invitations = useMemo(
    () => (data?.invitations || []).filter((item) => item.event_id === selectedEventId),
    [data?.invitations, selectedEventId],
  )

  const pendingInvitationCount = useMemo(
    () => invitations.filter((item) => item.status === 'PENDING').length,
    [invitations],
  )

  const perEventLimit = Number(
    data?.subscription?.max_staff_per_event || data?.subscription?.staff_limit || 0,
  )
  const reservedStaffSlots = assignedStaff.length + pendingInvitationCount
  const staffLimitReached = perEventLimit > 0 && reservedStaffSlots >= perEventLimit
  const subscriptionActive = Boolean(data?.subscription?.active)
  const selectedTasks = (data?.tasks || []).filter((task) => task.event_id === selectedEventId)

  const submitAssign = async (event) => {
    event.preventDefault()
    if (!selectedEventId || !assignForm.email.trim()) return

    setSaving(true)
    setError('')
    try {
      await inviteStaffToEvent({
        event_id: selectedEventId,
        email: assignForm.email.trim(),
        staff_role: assignForm.staff_role,
      })
      setAssignForm({ email: '', staff_role: 'Check-in' })
      setCandidateSearch('')
      setCandidates([])
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi lời mời nhân sự.')
    } finally {
      setSaving(false)
    }
  }

  const submitTask = async (event) => {
    event.preventDefault()
    if (!selectedEventId || !taskForm.staff_id || !taskForm.title.trim()) return

    setSaving(true)
    setError('')
    try {
      await createStaffTask({
        event_id: selectedEventId,
        staff_id: taskForm.staff_id,
        title: taskForm.title,
        description: taskForm.description,
      })
      setTaskForm({ staff_id: '', title: '', description: '' })
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tạo công việc.')
    } finally {
      setSaving(false)
    }
  }

  const removeAssignment = async (staffId) => {
    if (!selectedEventId || !staffId) return

    setSaving(true)
    setError('')
    try {
      await removeStaffFromEvent(selectedEventId, staffId)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gỡ nhân sự khỏi sự kiện.')
    } finally {
      setSaving(false)
    }
  }

  const pickCandidate = (candidate) => {
    setAssignForm((form) => ({ ...form, email: candidate.email }))
    setCandidateSearch(candidate.email)
    setCandidates([])
  }

  return (
    <OrganizerPage
      title="Quản lý nhân sự"
      description="Phân công staff theo sự kiện, kiểm soát giới hạn gói dịch vụ và giao việc vận hành."
    >
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

      <OrganizerPanel className="mb-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <label className="text-sm font-bold text-[#434655]">
            Sự kiện
            <select
              className="mt-2 h-10 w-full rounded-md border border-[#c3c6d7] bg-white px-3 text-sm font-semibold text-[#191c1e]"
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              disabled={loading}
            >
              {(data?.events || []).map((event) => (
                <option key={event.id} value={event.id}>{event.title}</option>
              ))}
            </select>
          </label>
          <LimitCard label="Gói hiện tại" value={data?.subscription?.name || 'Chưa có'} />
          <LimitCard
            label="Staff đã phân công"
            value={`${assignedStaff.length}/${perEventLimit || 0}`}
          />
          <LimitCard
            label="Slot còn lại"
            value={subscriptionActive ? `${Math.max(0, perEventLimit - reservedStaffSlots)}` : '—'}
            warning={staffLimitReached}
            hint={pendingInvitationCount > 0 ? `+${pendingInvitationCount} lời mời chờ` : null}
          />
        </div>
      </OrganizerPanel>

      {loading ? (
        <OrganizerPanel>Đang tải dữ liệu...</OrganizerPanel>
      ) : !selectedEvent ? (
        <OrganizerPanel>Chưa có sự kiện để phân công nhân sự.</OrganizerPanel>
      ) : !subscriptionActive ? (
        <OrganizerPanel className="text-sm font-semibold text-red-700">
          Cần gói subscription đang hoạt động trước khi mời staff cho sự kiện.
        </OrganizerPanel>
      ) : (
        <>
          <div className="mb-6 grid gap-5 xl:grid-cols-2">
            <OrganizerPanel>
              <h2 className="mb-4 flex items-center gap-2 font-extrabold text-[#111827]">
                <UserPlus className="size-5 text-primary" />
                Phân công staff
              </h2>
              <form className="grid gap-3" onSubmit={submitAssign}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
                  <input
                    type="search"
                    className="h-10 w-full rounded-md border border-[#c3c6d7] pl-9 pr-3 text-sm"
                    placeholder="Tìm customer theo tên hoặc email"
                    value={candidateSearch}
                    onChange={(event) => {
                      setCandidateSearch(event.target.value)
                      setAssignForm((form) => ({ ...form, email: event.target.value }))
                    }}
                    disabled={staffLimitReached || saving}
                  />
                  {candidates.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-[#c3c6d7] bg-white shadow">
                      {candidates.map((candidate) => (
                        <li key={candidate.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-[#f7f9fb]"
                            onClick={() => pickCandidate(candidate)}
                          >
                            <span className="font-bold text-[#191c1e]">{candidate.full_name}</span>
                            <span className="text-[#565e74]">{candidate.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input
                  type="email"
                  className="h-10 rounded-md border border-[#c3c6d7] px-3 text-sm"
                  placeholder="Email tài khoản customer"
                  value={assignForm.email}
                  onChange={(event) => setAssignForm((form) => ({ ...form, email: event.target.value }))}
                  disabled={staffLimitReached || saving}
                  required
                />
                <input
                  className="h-10 rounded-md border border-[#c3c6d7] px-3 text-sm"
                  placeholder="Vai trò: Check-in, Hỗ trợ khách, Bán vé tại chỗ..."
                  value={assignForm.staff_role}
                  onChange={(event) => setAssignForm((form) => ({ ...form, staff_role: event.target.value }))}
                  disabled={saving}
                />
                <button className="admin-primary w-fit" disabled={staffLimitReached || saving || !assignForm.email.trim()}>
                  <UserPlus className="size-4" />
                  Gửi lời mời
                </button>
                {staffLimitReached && (
                  <p className="text-sm font-semibold text-red-700">
                    Gói {data?.subscription?.name || 'hiện tại'} chỉ cho phép {perEventLimit} staff cho mỗi sự kiện (đã tính cả lời mời đang chờ).
                  </p>
                )}
                <p className="text-sm leading-6 text-[#565e74]">
                  Customer nhận thông báo, đồng ý lời mời thì được gán role STAFF và thêm vào sự kiện.
                </p>
              </form>
            </OrganizerPanel>

            <OrganizerPanel>
              <h2 className="mb-4 flex items-center gap-2 font-extrabold text-[#111827]">
                <ClipboardList className="size-5 text-primary" />
                Tạo công việc
              </h2>
              <form className="grid gap-3" onSubmit={submitTask}>
                <select
                  className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm"
                  value={taskForm.staff_id}
                  onChange={(event) => setTaskForm((form) => ({ ...form, staff_id: event.target.value }))}
                  disabled={saving || assignedStaff.length === 0}
                >
                  <option value="">Chọn staff đã được phân công</option>
                  {assignedStaff.map((staff) => (
                    <option key={staff.staff_id} value={staff.staff_id}>{staff.staff_name} - {staff.staff_role || 'Staff'}</option>
                  ))}
                </select>
                <input
                  className="h-10 rounded-md border border-[#c3c6d7] px-3 text-sm"
                  placeholder="Tên công việc"
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))}
                  disabled={saving}
                />
                <textarea
                  className="min-h-20 rounded-md border border-[#c3c6d7] px-3 py-2 text-sm"
                  placeholder="Mô tả chi tiết"
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((form) => ({ ...form, description: event.target.value }))}
                  disabled={saving}
                />
                <button className="admin-primary w-fit" disabled={saving || !taskForm.staff_id || !taskForm.title.trim()}>
                  <ClipboardList className="size-4" />
                  Tạo công việc
                </button>
                {assignedStaff.length === 0 && (
                  <p className="text-sm text-[#565e74]">Chỉ giao việc cho staff đã chấp nhận lời mời.</p>
                )}
              </form>
            </OrganizerPanel>
          </div>

          <OrganizerTable
            headers={['Staff', 'Vai trò', 'Email', 'Ngày phân công', 'Hành động']}
            rows={assignedStaff.map((staff) => [
              <span key="staff" className="flex items-center gap-3 font-bold">
                <AvatarInitials name={staff.staff_name || 'Staff'} className="size-8" />
                {staff.staff_name}
              </span>,
              staff.staff_role || 'Staff',
              staff.staff_email,
              new Date(staff.assigned_at).toLocaleDateString('vi-VN'),
              <button key="remove" className="admin-secondary text-red-700" onClick={() => removeAssignment(staff.staff_id)} disabled={saving}>
                <Trash2 className="size-4" />
                Gỡ
              </button>,
            ])}
          />

          <div className="mt-7">
            <h2 className="mb-3 font-extrabold text-[#111827]">Lời mời staff</h2>
            <OrganizerTable
              headers={['Email', 'Người nhận', 'Vai trò', 'Trạng thái', 'Hết hạn']}
              rows={invitations.map((invitation) => [
                invitation.invited_email,
                invitation.invited_user_name || 'Customer',
                invitation.staff_role || 'Staff',
                <Badge key="status" tone={invitation.status === 'ACCEPTED' ? 'green' : invitation.status === 'DECLINED' ? 'red' : 'blue'}>
                  {invitation.status}
                </Badge>,
                new Date(invitation.expires_at).toLocaleDateString('vi-VN'),
              ])}
            />
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-3">
            {taskColumns.map(([status, label]) => {
              const tasks = selectedTasks.filter((task) => task.status === status)
              return (
                <div key={status}>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="font-bold text-[#191c1e]">{label}</h3>
                    <span className="rounded bg-[#e0e3e5] px-2 py-0.5 text-xs font-bold text-[#434655]">{tasks.length}</span>
                  </div>
                  <div className="space-y-4">
                    {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
                    {tasks.length === 0 && <OrganizerPanel className="text-sm text-[#737686]">Chưa có công việc.</OrganizerPanel>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </OrganizerPage>
  )
}

function LimitCard({ label, value, warning = false, hint = null }) {
  return (
    <div className={`rounded-md border px-4 py-3 ${warning ? 'border-red-200 bg-red-50' : 'border-[#c3c6d7] bg-[#f7f9fb]'}`}>
      <p className="text-xs font-bold uppercase text-[#737686]">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${warning ? 'text-red-700' : 'text-[#111827]'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-[#565e74]">{hint}</p>}
    </div>
  )
}

function TaskCard({ task }) {
  const done = task.status === 'DONE'
  const tone = done ? 'green' : task.status === 'IN_PROGRESS' ? 'blue' : 'gray'

  return (
    <OrganizerPanel className="min-h-32">
      <div className="flex items-start justify-between">
        <Badge tone={tone}>{task.status}</Badge>
        {done && <CheckCircle2 className="size-4 text-primary" />}
      </div>
      <p className="mt-4 font-bold text-[#191c1e]">{task.title}</p>
      {task.description && <p className="mt-2 text-sm leading-6 text-[#565e74]">{task.description}</p>}
      <div className="mt-5 flex items-center gap-2 text-xs text-[#565e74]">
        <AvatarInitials name={task.staff_name || 'Staff'} className="size-6" />
        {task.staff_name}
      </div>
    </OrganizerPanel>
  )
}
