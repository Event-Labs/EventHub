import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  DoorOpen,
  Edit2,
  Layers,
  Loader2,
  MailCheck,
  MailX,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import {
  createEventGate,
  deleteEventGate,
  deleteStaffInvitation,
  fetchOrganizerOperationsOverview,
  fetchStaffCandidates,
  inviteStaffToEvent,
  removeStaffFromEvent,
  updateEventGate,
  updateEventStaff,
  updateOrganizerEventDeviceGate,
} from '@/services/operations.js'
import { Badge, OrganizerPage, OrganizerPanel, StatCard, TableActionButton } from './OrganizerComponents.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { OrganizerEventPicker } from './OrganizerEventPicker.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

const GATE_PRESETS_VI = ['Cổng A', 'Cổng B', 'Cổng C', 'Cổng VIP', 'Cổng chính', 'Cổng phụ']
const GATE_PRESETS_EN = ['Gate A', 'Gate B', 'Gate C', 'VIP Gate', 'Main Gate', 'Side Gate']

const ZONE_SUGGESTIONS_VI = ['Khu VIP', 'Khán đài A', 'Khán đài B', 'Khu đứng GA', 'Tầng 1', 'Tầng 2', 'Khu sân khấu', 'Toàn bộ sự kiện']
const ZONE_SUGGESTIONS_EN = ['VIP Area', 'Stand A', 'Stand B', 'GA Standing Area', '1st Floor', '2nd Floor', 'Stage Area', 'Entire Event']

function isApprovedOrPublishedEvent(event) {
  if (!event) return false
  const status = (event.status || '').toUpperCase()
  const approvalStatus = (event.approval_status || '').toUpperCase()

  if (['CANCELLED', 'DRAFT', 'HIDDEN', 'UNPUBLISHED'].includes(status)) return false
  if (['PENDING', 'REJECTED'].includes(approvalStatus)) return false

  return status === 'PUBLISHED' || approvalStatus === 'APPROVED'
}

function isStaffManageableEvent(event) {
  if (!isApprovedOrPublishedEvent(event)) return false
  const effectiveEnd = event.end_time || event.start_time
  if (!effectiveEnd) return false
  return new Date(effectiveEnd).getTime() >= Date.now()
}

function formatSessionTime(startTime, endTime, isEn = false) {
  if (!startTime) return ''
  const locale = isEn ? 'en-US' : 'vi-VN'
  const start = new Date(startTime)
  const dateStr = start.toLocaleDateString(locale, { day: '2-digit', month: isEn ? 'short' : '2-digit', year: 'numeric' })
  const timeStart = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (!endTime) return `${timeStart}, ${dateStr}`
  const end = new Date(endTime)
  const timeEnd = end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${timeStart} - ${timeEnd}, ${dateStr}`
}

export function OrganizerStaffManagementPage() {
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null) // staff object for edit modal
  const [removeConfirm, setRemoveConfirm] = useState(null) // { staffId, staffName }
  const [deleteInviteConfirm, setDeleteInviteConfirm] = useState(null) // { invitationId, email }
  const [deleteGateConfirm, setDeleteGateConfirm] = useState(null) // { gateId, gateName }
  const [newGateName, setNewGateName] = useState('')
  const [gateBusy, setGateBusy] = useState(false)
  const [editingGateId, setEditingGateId] = useState(null)
  const [editingGateName, setEditingGateName] = useState('')
  const [updatingDeviceId, setUpdatingDeviceId] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const ov = await fetchOrganizerOperationsOverview()
      setData(ov)
      const approvedEvents = (ov.events || []).filter(isApprovedOrPublishedEvent)
      setSelectedEventId((cur) => {
        if (cur && approvedEvents.some((ev) => ev.id === cur)) return cur
        return approvedEvents[0]?.id || ''
      })
    } catch (err) {
      const message = getApiMessage(err, 'Không thể tải dữ liệu.')
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Derived data for selected event
  const assignedStaff = useMemo(
    () => (data?.staff_assignments || []).filter((s) => s.event_id === selectedEventId),
    [data?.staff_assignments, selectedEventId],
  )

  const invitations = useMemo(
    () =>
      (data?.invitations || []).filter(
        (i) => i.event_id === selectedEventId && String(i.status || '').toUpperCase() !== 'ACCEPTED',
      ),
    [data?.invitations, selectedEventId],
  )

  const staffManageableEvents = useMemo(
    () => (data?.events || []).filter(isStaffManageableEvent),
    [data?.events],
  )

  const selectedEvent = useMemo(
    () => (data?.events || []).find((event) => event.id === selectedEventId),
    [data?.events, selectedEventId],
  )

  const selectedEventGates = useMemo(
    () => (Array.isArray(selectedEvent?.gates) ? selectedEvent.gates : []),
    [selectedEvent],
  )

  const selectedEventDevices = useMemo(
    () => (Array.isArray(selectedEvent?.devices) ? selectedEvent.devices : []),
    [selectedEvent],
  )

  const selectedEventManageable = isStaffManageableEvent(selectedEvent)

  const pendingCount = useMemo(
    () => invitations.filter((i) => i.status === 'PENDING').length,
    [invitations],
  )

  const plan = data?.subscription
  const perEventLimit = Number(plan?.max_staff_per_event || plan?.staff_limit || 0)
  const reservedSlots = assignedStaff.length + pendingCount
  const slotsRemaining = Math.max(0, perEventLimit - reservedSlots)
  const limitReached = perEventLimit > 0 && reservedSlots >= perEventLimit
  const subscriptionActive = Boolean(plan?.active)

  const handleRemoveConfirm = async () => {
    if (!removeConfirm) return
    setSaving(true)
    setError('')
    try {
      await removeStaffFromEvent(selectedEventId, removeConfirm.staffId)
      toast.success('Đã gỡ nhân sự khỏi sự kiện.')
      setRemoveConfirm(null)
      await loadData()
    } catch (err) {
      const message = getApiMessage(err, 'Không thể gỡ nhân sự.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteInviteConfirm = async () => {
    if (!deleteInviteConfirm) return
    setSaving(true)
    setError('')
    try {
      await deleteStaffInvitation(deleteInviteConfirm.invitationId)
      toast.success('Đã xóa lời mời nhân sự.')
      setDeleteInviteConfirm(null)
      await loadData()
    } catch (err) {
      const message = getApiMessage(err, 'Không thể xóa lời mời.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddGate = async (gateNameInput) => {
    const trimmed = String(gateNameInput ?? newGateName).trim()
    if (!trimmed || !selectedEventId || !selectedEventManageable) return
    setGateBusy(true)
    try {
      await createEventGate(selectedEventId, { name: trimmed })
      toast.success(isEnglish ? `Added gate "${trimmed}".` : `Đã lưu cổng "${trimmed}" cho sự kiện.`)
      setNewGateName('')
      await loadData()
    } catch (err) {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to add gate.' : 'Không thể thêm cổng.'))
    } finally {
      setGateBusy(false)
    }
  }

  const handleRenameGate = async (gateId) => {
    const trimmed = editingGateName.trim()
    if (!trimmed || !selectedEventId || !selectedEventManageable) return
    setGateBusy(true)
    try {
      await updateEventGate(selectedEventId, gateId, { name: trimmed })
      toast.success(isEnglish ? 'Gate name updated.' : 'Đã cập nhật tên cổng.')
      setEditingGateId(null)
      setEditingGateName('')
      await loadData()
    } catch (err) {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to update gate.' : 'Không thể cập nhật cổng.'))
    } finally {
      setGateBusy(false)
    }
  }

  const handleDeleteGateConfirm = async () => {
    if (!deleteGateConfirm || !selectedEventId) return
    setSaving(true)
    try {
      await deleteEventGate(selectedEventId, deleteGateConfirm.gateId)
      toast.success(isEnglish ? 'Gate deleted.' : `Đã xóa cổng "${deleteGateConfirm.gateName}".`)
      setDeleteGateConfirm(null)
      await loadData()
    } catch (err) {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to delete gate.' : 'Không thể xóa cổng.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeviceGateChange = async (deviceId, nextGateId) => {
    if (!selectedEventId || !selectedEventManageable) return
    setUpdatingDeviceId(deviceId)
    try {
      await updateOrganizerEventDeviceGate(selectedEventId, deviceId, nextGateId || null)
      toast.success(isEnglish ? 'IoT device gate updated.' : 'Đã cập nhật cổng cho thiết bị IoT.')
      await loadData()
    } catch (err) {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to assign gate to IoT device.' : 'Không thể phân cổng cho thiết bị IoT.'))
    } finally {
      setUpdatingDeviceId(null)
    }
  }

  return (
    <OrganizerPage
      title="Quản lý Nhân sự"
    >
      {/* ── Toolbar ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-xl">
          <OrganizerEventPicker
            events={(data?.events || []).filter(isApprovedOrPublishedEvent)}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            loading={loading}
            label="Chọn sự kiện"
            allowAll={false}
            placeholder="Chọn sự kiện để phân công nhân sự..."
          />
        </div>

        <button
          className="org-btn-primary self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setShowInviteModal(true)}
          disabled={loading || !subscriptionActive || limitReached || !selectedEventId || !selectedEventManageable}
        >
          <UserPlus className="size-4" />
          Mời nhân sự
        </button>
      </div>

      {!loading && selectedEventId && !selectedEventManageable && (
        <OrganizerPanel className="mb-5 border-warning/30 bg-warning/10">
          <p className="text-sm font-semibold text-warning">
            Sự kiện này đã hết hiệu lực, đang ở bản nháp hoặc chưa được duyệt. Bạn chỉ có thể xem nhân sự, lời mời, thông số và báo cáo; không thể mời hoặc chỉnh sửa phân công.
          </p>
        </OrganizerPanel>
      )}

      {/* ── Quota cards ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Layers}
          label="Gói dịch vụ"
          value={plan?.name || 'Chưa có'}
          sub={subscriptionActive ? 'Đang hoạt động' : 'Chưa kích hoạt'}
          accentBg="bg-primary/15"
          accentColor="text-primary"
        />
        <StatCard
          icon={Users}
          label="Giới hạn / sự kiện"
          value={perEventLimit > 0 ? perEventLimit.toLocaleString('vi-VN') : '—'}
          sub="Tối đa mỗi sự kiện"
          accentBg="bg-tertiary/15"
          accentColor="text-tertiary"
        />
        <StatCard
          icon={UserCheck}
          label="Đã phân công"
          value={assignedStaff.length.toLocaleString('vi-VN')}
          sub={pendingCount > 0 ? `+${pendingCount} đang chờ` : 'Nhân sự đã phân công'}
          accentBg="bg-success/15"
          accentColor="text-success"
        />
        <StatCard
          icon={UserPlus}
          label="Slot còn lại"
          value={subscriptionActive && perEventLimit > 0 ? slotsRemaining.toLocaleString('vi-VN') : '—'}
          sub={limitReached ? 'Đã đạt giới hạn tối đa' : 'Có thể mời thêm'}
          accentBg={limitReached ? 'bg-error/15' : 'bg-warning/15'}
          accentColor={limitReached ? 'text-error' : 'text-warning'}
        />
      </div>

      {loading ? (
        <OrganizerPanel className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-[#E6C17A]" />
        </OrganizerPanel>
      ) : error ? (
        <OrganizerPanel className="border-error/30 bg-error/10 py-10 text-center">
          <p className="font-bold text-error">{error}</p>
          <button
            type="button"
            className="org-btn-primary mx-auto mt-4"
            onClick={loadData}
          >
            Thử lại
          </button>
        </OrganizerPanel>
      ) : !subscriptionActive ? (
        <OrganizerPanel className="py-10 text-center">
          <p className="font-bold text-error">Cần gói subscription đang hoạt động để mời staff.</p>
          <p className="mt-1 text-sm text-subtle">Vui lòng nâng cấp gói dịch vụ tại mục Gói dịch vụ.</p>
          <button
            type="button"
            className="org-btn-primary mx-auto mt-5"
            onClick={() => navigate('/organizer/subscriptions')}
          >
            Xem gói dịch vụ
            <ArrowRight className="size-4" />
          </button>
        </OrganizerPanel>
      ) : (
        <>
          {/* ── Event Gates Management ── */}
          {selectedEventId && (
            <section className="mb-7">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-extrabold text-content">
                  <DoorOpen className="size-5 text-[#E6C17A]" />
                  {isEnglish ? 'Event Check-in Gates' : 'Quản lý Cổng check-in sự kiện'}
                  <span className="ml-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-bold text-cyan-300">
                    {selectedEventGates.length}
                  </span>
                </h2>
              </div>

              <OrganizerPanel className="space-y-4">
                {selectedEventManageable && (
                  <div className="space-y-2.5">
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleAddGate()
                      }}
                    >
                      <input
                        type="text"
                        value={newGateName}
                        onChange={(e) => setNewGateName(e.target.value)}
                        placeholder={
                          isEnglish
                            ? 'Enter gate name (e.g. Gate A, VIP Gate, Main Entrance)...'
                            : 'Nhập tên cổng mới (VD: Cổng A, Cổng VIP, Cổng chính)...'
                        }
                        maxLength={100}
                        disabled={gateBusy}
                        className="h-10 flex-1 rounded-xl border border-white/15 bg-[#0d172e] px-3.5 text-sm text-white outline-none focus:border-primary placeholder:text-white/45"
                      />
                      <button
                        type="submit"
                        disabled={gateBusy || !newGateName.trim()}
                        className="org-btn-primary shrink-0 disabled:opacity-50"
                      >
                        {gateBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        {isEnglish ? 'Save Gate' : 'Thêm cổng'}
                      </button>
                    </form>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-white mr-1">
                        {isEnglish ? 'Quick add:' : 'Thêm nhanh:'}
                      </span>
                      {(isEnglish ? GATE_PRESETS_EN : GATE_PRESETS_VI).map((preset) => {
                        const alreadyExists = selectedEventGates.some(
                          (g) => g.name.trim().toLowerCase() === preset.trim().toLowerCase(),
                        )
                        return (
                          <button
                            key={preset}
                            type="button"
                            disabled={gateBusy || alreadyExists}
                            onClick={() => handleAddGate(preset)}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                              alreadyExists
                                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 cursor-default'
                                : 'border-white/15 bg-[#0d172e]/70 text-slate-300 hover:border-purple-400/60 hover:text-white cursor-pointer'
                            }`}
                          >
                            {alreadyExists ? `✓ ${preset}` : `+ ${preset}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {selectedEventGates.length === 0 ? (
                  <div className="py-4 text-center text-sm text-subtle italic">
                    {isEnglish
                      ? 'No gates configured yet. Add gates above so you can select them from a dropdown for Staff and IoT devices.'
                      : 'Sự kiện chưa có cổng nào. Hãy thêm cổng ở trên để chọn nhanh bằng dropdown cho Staff và thiết bị IoT.'}
                  </div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedEventGates.map((gate) => {
                      const isEditing = editingGateId === gate.id
                      return (
                        <div
                          key={gate.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0d172e]/85 px-3.5 py-2.5"
                        >
                          {isEditing ? (
                            <div className="flex flex-1 items-center gap-1.5 min-w-0">
                              <input
                                type="text"
                                value={editingGateName}
                                onChange={(e) => setEditingGateName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleRenameGate(gate.id)
                                  } else if (e.key === 'Escape') {
                                    setEditingGateId(null)
                                    setEditingGateName('')
                                  }
                                }}
                                maxLength={100}
                                autoFocus
                                className="h-8 flex-1 min-w-0 rounded-lg border border-primary/50 bg-[#121b33] px-2.5 text-xs font-semibold text-white outline-none"
                              />
                              <button
                                type="button"
                                disabled={gateBusy || !editingGateName.trim()}
                                onClick={() => handleRenameGate(gate.id)}
                                className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                                title={isEnglish ? 'Save' : 'Lưu'}
                              >
                                <Check className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGateId(null)
                                  setEditingGateName('')
                                }}
                                className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/20"
                                title={isEnglish ? 'Cancel' : 'Hủy'}
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-white">
                                  {gate.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  {Number(gate.staff_count || 0)} {isEnglish ? 'staff' : 'nhân sự'} • {Number(gate.device_count || 0)} {isEnglish ? 'IoT' : 'thiết bị IoT'}
                                </p>
                              </div>
                              {selectedEventManageable && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={gateBusy}
                                    onClick={() => {
                                      setEditingGateId(gate.id)
                                      setEditingGateName(gate.name)
                                    }}
                                    className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:border-primary/50 hover:text-primary transition-colors"
                                    title={isEnglish ? 'Rename gate' : 'Đổi tên cổng'}
                                  >
                                    <Edit2 className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={gateBusy}
                                    onClick={() => setDeleteGateConfirm({ gateId: gate.id, gateName: gate.name })}
                                    className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:border-rose-400/50 hover:text-rose-400 transition-colors"
                                    title={isEnglish ? 'Delete gate' : 'Xóa cổng'}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </OrganizerPanel>
            </section>
          )}

          {/* ── Staff list ── */}
          <section className="mb-7">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold text-content">
              <UserCheck className="size-5 text-[#E6C17A]" />
              Nhân sự đã phân công
              <span className="ml-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-bold text-cyan-300">
                {assignedStaff.length}
              </span>
            </h2>

            {assignedStaff.length === 0 ? (
              <OrganizerPanel className="py-10 text-center border-dashed">
                <Users className="mx-auto mb-3 size-10 text-muted" />
                <p className="text-sm text-subtle italic">Chưa có staff nào được phân công cho sự kiện này.</p>
              </OrganizerPanel>
            ) : (
              <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Nhân sự</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Email</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Vai trò</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Phiên làm việc</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Cổng</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Khu vực làm việc</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Ngày phân công</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium text-white">
                      {assignedStaff.map((staff) => (
                        <tr key={staff.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-3.5 py-3">
                            <span className="font-bold text-white">{staff.staff_name}</span>
                          </td>
                          <td className="px-3.5 py-3 text-white">{staff.staff_email}</td>
                          <td className="px-3.5 py-3">
                            <Badge tone="blue">{staff.staff_role || 'Staff'}</Badge>
                          </td>
                          <td className="px-3.5 py-3">
                            {staff.assigned_sessions && staff.assigned_sessions.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {staff.assigned_sessions.map((sess) => (
                                  <Badge key={sess.id} tone="cyan">
                                    <span className="flex items-center gap-1">
                                      <Clock className="size-3" />
                                      {sess.session_name || 'Phiên làm việc'}
                                    </span>
                                  </Badge>
                                ))}
                              </div>
                            ) : staff.session_ids && staff.session_ids.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {staff.session_ids.map((sId) => {
                                  const sess = selectedEvent?.sessions?.find((s) => s.id === sId)
                                  return (
                                    <Badge key={sId} tone="cyan">
                                      <span className="flex items-center gap-1">
                                        <Clock className="size-3" />
                                        {sess?.session_name || 'Phiên làm việc'}
                                      </span>
                                    </Badge>
                                  )
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-muted">Toàn bộ sự kiện</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            {staff.gate ? (
                              <Badge tone="purple">
                                <span className="flex items-center gap-1">
                                  <DoorOpen className="size-3" />
                                  {staff.gate}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted">Tất cả cổng</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            {staff.zone ? (
                              <Badge tone="yellow">
                                <span className="flex items-center gap-1">
                                  <Layers className="size-3" />
                                  {staff.zone}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-sm text-white">Toàn bộ khu vực</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-white whitespace-nowrap">
                            {new Date(staff.assigned_at).toLocaleDateString(getAutoLocale())}
                          </td>
                          <td className="px-3.5 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <TableActionButton
                                icon={Edit2}
                                tone="primary"
                                onClick={() => setEditingStaff(staff)}
                                disabled={saving || !selectedEventManageable}
                                title="Chỉnh sửa vai trò, cổng hoặc khu vực"
                              />
                              <TableActionButton
                                icon={Trash2}
                                tone="danger"
                                onClick={() =>
                                  setRemoveConfirm({ staffId: staff.staff_id, staffName: staff.staff_name })
                                }
                                disabled={saving || !selectedEventManageable}
                                title="Gỡ nhân sự"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── Invitations list ── */}
          <section className="mb-7">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold text-content">
              <MailCheck className="size-5 text-[#E6C17A]" />
              Lời mời nhân sự
              <span className="ml-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-bold text-cyan-300">
                {invitations.length}
              </span>
            </h2>

            {invitations.length === 0 ? (
              <OrganizerPanel className="py-8 text-center border-dashed">
                <p className="text-sm text-subtle italic">Chưa có lời mời nào.</p>
              </OrganizerPanel>
            ) : (
              <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[940px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Email</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Người nhận</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Vai trò</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Phiên sự kiện</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Cổng</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Khu vực làm việc</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap !text-left" style={{ textAlign: 'left' }}>Trạng thái</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Hết hạn</th>
                        <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium text-white">
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-3.5 py-3 font-semibold text-white">{inv.invited_email}</td>
                          <td className="px-3.5 py-3 text-white">{inv.invited_user_name || '—'}</td>
                          <td className="px-3.5 py-3 text-white">{inv.staff_role || 'Staff'}</td>
                          <td className="px-3.5 py-3">
                            {inv.session_ids && inv.session_ids.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {inv.session_ids.map((sId) => {
                                  const sess = selectedEvent?.sessions?.find((s) => s.id === sId)
                                  return (
                                    <Badge key={sId} tone="cyan">
                                      <span className="flex items-center gap-1">
                                        <Clock className="size-3" />
                                        {sess?.session_name || 'Phiên làm việc'}
                                      </span>
                                    </Badge>
                                  )
                                })}
                              </div>
                            ) : inv.session_name ? (
                              <div className="flex flex-wrap gap-1">
                                {inv.session_name.split(',').map((name, idx) => (
                                  <Badge key={idx} tone="cyan">
                                    <span className="flex items-center gap-1">
                                      <Clock className="size-3" />
                                      {name.trim()}
                                    </span>
                                  </Badge>
                                ))}
                              </div>
                            ) : inv.session_id ? (
                              <Badge tone="cyan">
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3" />
                                  {selectedEvent?.sessions?.find((s) => s.id === inv.session_id)?.session_name || 'Phiên được chọn'}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted">Toàn bộ sự kiện</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            {inv.gate ? (
                              <Badge tone="purple">
                                <span className="flex items-center gap-1">
                                  <DoorOpen className="size-3" />
                                  {inv.gate}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted">Tất cả cổng</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            {inv.zone ? (
                              <Badge tone="yellow">
                                <span className="flex items-center gap-1">
                                  <Layers className="size-3" />
                                  {inv.zone}
                                </span>
                              </Badge>
                            ) : (
                              <span className="text-sm text-white">Toàn bộ khu vực</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 !text-left whitespace-nowrap" style={{ textAlign: 'left' }}>
                            <div className="flex items-center justify-start text-left">
                              <InvitationStatusBadge status={inv.status} />
                            </div>
                          </td>
                          <td className="px-3.5 py-3 text-white whitespace-nowrap">
                            {inv.expires_at
                              ? new Date(inv.expires_at).toLocaleDateString(getAutoLocale())
                              : '—'}
                          </td>
                          <td className="px-3.5 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center">
                              <TableActionButton
                                icon={Trash2}
                                tone="danger"
                                onClick={() =>
                                  setDeleteInviteConfirm({ invitationId: inv.id, email: inv.invited_email })
                                }
                                disabled={saving || !selectedEventManageable}
                                title="Xóa lời mời"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── IoT Devices for Selected Event (Gate Dropdown Assignment) ── */}
          {selectedEventId && (
            <section className="mb-7">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-extrabold text-content">
                  <Cpu className="size-5 text-[#E6C17A]" />
                  {isEnglish ? 'Event IoT Check-in Devices' : 'Thiết bị IoT của sự kiện'}
                  <span className="ml-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-bold text-cyan-300">
                    {selectedEventDevices.length}
                  </span>
                </h2>
              </div>

              {selectedEventDevices.length === 0 ? (
                <OrganizerPanel className="py-7 text-center border-dashed">
                  <Cpu className="mx-auto mb-2 size-8 text-muted" />
                  <p className="text-sm text-subtle italic">
                    {isEnglish
                      ? 'No IoT devices are assigned to this event yet (Admin assigns devices in Check-in Devices).'
                      : 'Chưa có thiết bị IoT nào được gán vào sự kiện này (Admin có thể gán thiết bị trong mục Thiết bị Check-in).'}
                  </p>
                </OrganizerPanel>
              ) : (
                <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                        <tr>
                          <th className="px-3.5 py-3">Thiết bị</th>
                          <th className="px-3.5 py-3">Kết nối</th>
                          <th className="px-3.5 py-3">Chế độ</th>
                          <th className="px-3.5 py-3">Cổng phân công</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium text-white">
                        {selectedEventDevices.map((dev) => {
                          const isBusy = updatingDeviceId === dev.id
                          return (
                            <tr key={dev.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-3.5 py-3">
                                <p className="font-bold text-white">{dev.name || dev.mac_address}</p>
                                <p className="font-mono text-xs text-slate-400">{dev.mac_address}</p>
                              </td>
                              <td className="px-3.5 py-3">
                                {dev.is_online ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                                    <Wifi className="size-3" />
                                    Online
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-0.5 text-xs font-bold text-slate-400">
                                    <WifiOff className="size-3" />
                                    Offline
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-3">
                                {dev.auto_confirm ? (
                                  <Badge tone="cyan">{isEnglish ? 'Auto Check-in' : 'Tự động Check-in'}</Badge>
                                ) : (
                                  <Badge tone="slate">{isEnglish ? 'Verify Only' : 'Chỉ xác thực'}</Badge>
                                )}
                              </td>
                              <td className="px-3.5 py-3">
                                <div className="flex items-center gap-2 max-w-[260px]">
                                  <select
                                    value={dev.assigned_gate_id || ''}
                                    onChange={(e) => handleDeviceGateChange(dev.id, e.target.value)}
                                    disabled={!selectedEventManageable || isBusy || dev.status === 'REVOKED'}
                                    className="h-9 w-full rounded-xl border border-white/15 bg-[#0d172e] px-3 text-xs font-semibold text-white outline-none focus:border-primary disabled:opacity-50"
                                  >
                                    <option value="" className="bg-[#0b1329] text-white">
                                      {isEnglish ? 'All gates (Unassigned)' : 'Tất cả cổng (Chưa phân cổng)'}
                                    </option>
                                    {selectedEventGates.map((g) => (
                                      <option key={g.id} value={g.id} className="bg-[#0b1329] text-white">
                                        {g.name}
                                      </option>
                                    ))}
                                  </select>
                                  {isBusy && <Loader2 className="size-4 shrink-0 animate-spin text-[#E6C17A]" />}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* ── Invite modal ── */}
      {showInviteModal && (
        <InviteStaffModal
          selectedEventId={selectedEventId}
          events={staffManageableEvents}
          limitReached={limitReached}
          subscriptionName={plan?.name}
          perEventLimit={perEventLimit}
          onGateCreated={loadData}
          onClose={() => setShowInviteModal(false)}
          onInvited={(invitation) => {
            if (invitation?.email_sent === false) {
              toast.warning('Đã tạo lời mời trong hệ thống, nhưng email chưa gửi được. Customer vẫn có thể xem trong Thông báo.')
            } else {
              toast.success('Đã gửi lời mời nhân sự qua email và thông báo.')
            }
            setShowInviteModal(false)
            loadData()
          }}
        />
      )}

      {/* ── Edit Staff Modal ── */}
      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          eventId={selectedEventId}
          eventSessions={selectedEvent?.sessions || []}
          eventGates={selectedEventGates}
          onGateCreated={loadData}
          onClose={() => setEditingStaff(null)}
          onUpdated={() => {
            toast.success('Đã cập nhật phân công nhân sự thành công.')
            setEditingStaff(null)
            loadData()
          }}
        />
      )}

      {/* ── Remove confirm dialog ── */}
      {removeConfirm && (
        <ConfirmDialog
          title="Gỡ nhân sự"
          message={`Bạn có chắc muốn gỡ "${removeConfirm.staffName}" khỏi sự kiện này không?`}
          confirmLabel="Gỡ nhân sự"
          danger
          loading={saving}
          onConfirm={handleRemoveConfirm}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}

      {/* ── Delete invitation confirm dialog ── */}
      {deleteInviteConfirm && (
        <ConfirmDialog
          title="Xóa lời mời nhân sự"
          message={`Bạn có chắc muốn xóa lời mời gửi đến "${deleteInviteConfirm.email}" không?`}
          confirmLabel="Xóa lời mời"
          danger
          loading={saving}
          onConfirm={handleDeleteInviteConfirm}
          onCancel={() => setDeleteInviteConfirm(null)}
        />
      )}

      {/* ── Delete gate confirm dialog ── */}
      {deleteGateConfirm && (
        <ConfirmDialog
          title={isEnglish ? 'Delete Check-in Gate' : 'Xóa cổng check-in'}
          message={
            isEnglish
              ? `Are you sure you want to delete gate "${deleteGateConfirm.gateName}"? Staff and IoT devices assigned to this gate will be reset to All gates.`
              : `Bạn có chắc muốn xóa cổng "${deleteGateConfirm.gateName}" không? Nhân sự và thiết bị IoT đang gán vào cổng này sẽ trở về trạng thái Tất cả cổng.`
          }
          confirmLabel={isEnglish ? 'Delete Gate' : 'Xóa cổng'}
          danger
          loading={saving}
          onConfirm={handleDeleteGateConfirm}
          onCancel={() => setDeleteGateConfirm(null)}
        />
      )}
    </OrganizerPage>
  )
}

// ─── Edit Staff Modal ─────────────────────────────────────────────────────────

function EditStaffModal({ staff, eventId, eventSessions = [], eventGates = [], onGateCreated, onClose, onUpdated }) {
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const initialSessionIds = useMemo(() => {
    if (Array.isArray(staff.session_ids) && staff.session_ids.length > 0) {
      return staff.session_ids
    }
    if (Array.isArray(staff.assigned_sessions) && staff.assigned_sessions.length > 0) {
      return staff.assigned_sessions.map((s) => s.id)
    }
    if (staff.session_id) {
      return [staff.session_id]
    }
    return []
  }, [staff])

  const initialGateId = useMemo(() => {
    if (staff.gate_id && eventGates.some((g) => g.id === staff.gate_id)) {
      return staff.gate_id
    }
    if (staff.gate) {
      const matched = eventGates.find(
        (g) => g.name.trim().toLowerCase() === String(staff.gate).trim().toLowerCase(),
      )
      if (matched) return matched.id
    }
    return ''
  }, [staff.gate_id, staff.gate, eventGates])

  const [form, setForm] = useState({
    staff_role: staff.staff_role || 'Check-in',
    session_ids: initialSessionIds,
    gate_id: initialGateId,
    zone: staff.zone || '',
  })
  const [saving, setSaving] = useState(false)
  const [quickGateName, setQuickGateName] = useState('')
  const [addingQuickGate, setAddingQuickGate] = useState(false)
  const [localGates, setLocalGates] = useState(eventGates)

  useEffect(() => {
    setLocalGates(eventGates)
  }, [eventGates])

  const handleQuickAddGate = async () => {
    const trimmed = quickGateName.trim()
    if (!trimmed || !eventId) return
    setAddingQuickGate(true)
    try {
      const created = await createEventGate(eventId, { name: trimmed })
      setLocalGates((prev) => [...prev, created])
      setForm((f) => ({ ...f, gate_id: created.id }))
      setQuickGateName('')
      toast.success(isEnglish ? `Added gate "${created.name}".` : `Đã thêm cổng "${created.name}".`)
      if (onGateCreated) onGateCreated()
    } catch (err) {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to add gate.' : 'Không thể thêm cổng.'))
    } finally {
      setAddingQuickGate(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const selectedGateObj = localGates.find((g) => g.id === form.gate_id)
      await updateEventStaff(eventId, staff.staff_id, {
        staff_role: form.staff_role.trim() || null,
        gate_id: form.gate_id || null,
        gate: selectedGateObj ? selectedGateObj.name : null,
        zone: form.zone.trim() || null,
        session_id: form.session_ids.length === 1 ? form.session_ids[0] : null,
        session_ids: form.session_ids.length > 0 ? form.session_ids : null,
      })
      onUpdated()
    } catch (err) {
      const message = getApiMessage(err, 'Không thể cập nhật phân công nhân sự.')
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full min-w-0 max-w-lg overflow-hidden rounded-2xl bg-[#0b1329] border border-white/15 shadow-2xl shadow-black/90 text-white max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 bg-[#111c3a] px-6 py-4 shrink-0">
          <div className="flex items-center gap-2 font-black text-white text-lg">
            <Edit2 className="size-5 text-primary" />
            {isEnglish ? `Edit Assignment: ${staff.staff_name}` : `Chỉnh sửa phân công: ${staff.staff_name}`}
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
            title={isEnglish ? 'Close' : 'Đóng'}
          >
            <X className="size-5" />
          </button>
        </div>

        <form className="flex flex-1 flex-col overflow-hidden min-h-0" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
            <div className="grid gap-4">
            {/* Role */}
            <label className="grid gap-1.5 text-sm font-bold text-white">
              {isEnglish ? 'Staff Role' : 'Vai trò nhân sự'}
              <input
                className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm text-white outline-none focus:border-primary placeholder:text-white/50"
                placeholder={isEnglish ? 'For example: Check-in, Support, Onsite sales...' : 'VD: Check-in, Hỗ trợ khách, Bán vé tại chỗ...'}
                value={form.staff_role}
                onChange={(e) => setForm((f) => ({ ...f, staff_role: e.target.value }))}
                disabled={saving}
              />
            </label>

            {/* Sessions (Multi-select) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold text-white flex items-center gap-1.5">
                  {isEnglish ? 'Event Session' : 'Phiên sự kiện phân công'}
                  <span className="text-xs font-normal text-slate-400">
                    {isEnglish ? '(select multiple sessions or entire event)' : '(chọn nhiều phiên hoặc toàn bộ sự kiện)'}
                  </span>
                </label>
                {eventSessions.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, session_ids: [] }))}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        form.session_ids.length === 0
                          ? 'border border-cyan-400 bg-cyan-400/20 text-cyan-300 font-bold'
                          : 'border border-white/10 bg-[#0d172e]/60 text-slate-300 hover:border-cyan-400/40 hover:text-white'
                      }`}
                    >
                      {isEnglish ? 'Entire event' : 'Toàn bộ sự kiện'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => {
                          const allSelected = f.session_ids.length === eventSessions.length
                          return {
                            ...f,
                            session_ids: allSelected ? [] : eventSessions.map((s) => s.id),
                          }
                        })
                      }
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        form.session_ids.length === eventSessions.length && eventSessions.length > 0
                          ? 'border border-cyan-400 bg-cyan-400/20 text-cyan-300 font-bold'
                          : 'border border-white/10 bg-[#0d172e]/60 text-slate-300 hover:border-cyan-400/40 hover:text-white'
                      }`}
                    >
                      {form.session_ids.length === eventSessions.length && eventSessions.length > 0
                        ? (isEnglish ? 'Deselect all' : 'Bỏ chọn tất cả')
                        : (isEnglish ? `Select all (${eventSessions.length})` : `Chọn tất cả (${eventSessions.length})`)}
                    </button>
                  </div>
                )}
              </div>

              {eventSessions.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#0d172e] px-3.5 py-2.5 text-xs text-slate-400">
                  {isEnglish
                    ? 'This event does not have working sessions (applies to the entire event by default).'
                    : 'Sự kiện này không chia phiên làm việc (mặc định áp dụng cho toàn bộ sự kiện).'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {eventSessions.map((sess, idx) => {
                    const isSelected = form.session_ids.includes(sess.id)
                    const timeStr = formatSessionTime(sess.start_time, sess.end_time, isEnglish)
                    return (
                      <button
                        key={sess.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => {
                            const exists = f.session_ids.includes(sess.id)
                            const updated = exists
                              ? f.session_ids.filter((id) => id !== sess.id)
                              : [...f.session_ids, sess.id]
                            return { ...f, session_ids: updated }
                          })
                        }}
                        className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-500/15 text-white shadow-sm shadow-cyan-500/20'
                            : 'border-white/10 bg-[#0d172e]/80 text-slate-300 hover:border-white/25 hover:bg-[#0d172e]'
                        }`}
                      >
                        <div
                          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-400 text-black'
                              : 'border-white/30 bg-transparent'
                          }`}
                        >
                          {isSelected && <Check className="size-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-tight text-white truncate">
                            {sess.session_name || (isEnglish ? `Session ${idx + 1}` : `Phiên ${idx + 1}`)}
                          </p>
                          {timeStr && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                              {timeStr}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Gate & Zone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="grid gap-1.5 text-sm font-bold text-white">
                  {isEnglish ? 'Check-in / assignment gate' : 'Cổng check-in / phân công'}
                  <select
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white outline-none focus:border-primary disabled:opacity-50"
                    value={form.gate_id}
                    onChange={(e) => setForm((f) => ({ ...f, gate_id: e.target.value }))}
                    disabled={saving}
                  >
                    <option value="" className="bg-[#0b1329] text-white">
                      {isEnglish ? 'All gates (No restriction)' : 'Tất cả cổng (Không giới hạn)'}
                    </option>
                    {localGates.map((g) => (
                      <option key={g.id} value={g.id} className="bg-[#0b1329] text-white">
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={quickGateName}
                    onChange={(e) => setQuickGateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleQuickAddGate()
                      }
                    }}
                    placeholder={isEnglish ? 'Quick add new gate...' : 'Thêm nhanh cổng mới...'}
                    maxLength={100}
                    disabled={saving || addingQuickGate}
                    className="h-8 flex-1 min-w-0 rounded-lg border border-white/10 bg-[#0d172e]/70 px-2.5 text-xs text-white outline-none focus:border-primary placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddGate}
                    disabled={saving || addingQuickGate || !quickGateName.trim()}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 text-xs font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
                  >
                    {addingQuickGate ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    {isEnglish ? 'Add' : 'Lưu'}
                  </button>
                </div>
                {localGates.length === 0 && (
                  <p className="text-[11px] text-amber-300/90">
                    {isEnglish
                      ? 'No gates saved for this event yet. Add one above to select it.'
                      : 'Sự kiện chưa có cổng nào trong DB. Hãy thêm nhanh ở ô trên.'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="grid gap-1.5 text-sm font-bold text-white">
                  {isEnglish ? 'Working area during the event' : 'Khu vực làm việc trong sự kiện'}
                  <input
                    className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm text-white outline-none focus:border-primary placeholder:text-white/50"
                    placeholder={isEnglish ? 'For example: VIP area, Stand A...' : 'VD: Khu VIP, Khán đài A...'}
                    value={form.zone}
                    onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(isEnglish ? ZONE_SUGGESTIONS_EN : ZONE_SUGGESTIONS_VI).map((suggestion, idx) => {
                    const isAllOption = idx === (isEnglish ? ZONE_SUGGESTIONS_EN : ZONE_SUGGESTIONS_VI).length - 1
                    const isSelected = isAllOption
                      ? !form.zone
                      : form.zone === suggestion || form.zone === ZONE_SUGGESTIONS_VI[idx] || form.zone === ZONE_SUGGESTIONS_EN[idx]
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-amber-500 bg-amber-500/20 text-amber-400 font-bold shadow-sm shadow-amber-500/20'
                            : 'border-white/15 bg-[#0d172e]/60 text-slate-300 hover:border-amber-500/40 hover:text-white'
                        }`}
                        onClick={() => setForm((f) => ({ ...f, zone: isAllOption ? '' : suggestion }))}
                      >
                        {suggestion}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

          <div className="flex justify-end gap-3 border-t border-border-soft/20 px-6 py-4 bg-panel-soft/30 shrink-0">
            <button type="button" className="org-btn-secondary px-5" onClick={onClose} disabled={saving}>
              {isEnglish ? 'Cancel' : 'Hủy'}
            </button>
            <button type="submit" className="org-btn-primary px-5" disabled={saving}>
              {saving ? (
                <><Loader2 className="size-4 animate-spin" /> {isEnglish ? 'Saving...' : 'Đang lưu...'}</>
              ) : (
                isEnglish ? 'Save Changes' : 'Lưu thay đổi'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Invite Staff Modal ───────────────────────────────────────────────────────

function InviteStaffModal({
  selectedEventId,
  events,
  limitReached,
  subscriptionName,
  perEventLimit,
  onGateCreated,
  onClose,
  onInvited,
}) {
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const initialEventId = events.some((event) => event.id === selectedEventId)
    ? selectedEventId
    : events[0]?.id || ''
  const [form, setForm] = useState({
    event_id: initialEventId,
    session_ids: [],
    email: '',
    staff_role: 'Check-in',
    gate_id: '',
    zone: '',
  })
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidates, setCandidates] = useState([])
  const [saving, setSaving] = useState(false)
  const [quickGateName, setQuickGateName] = useState('')
  const [addingQuickGate, setAddingQuickGate] = useState(false)
  const [extraGatesByEvent, setExtraGatesByEvent] = useState({})

  const currentEvent = useMemo(
    () => events.find((ev) => ev.id === form.event_id),
    [events, form.event_id],
  )
  const eventSessions = currentEvent?.sessions || []
  const eventGates = useMemo(() => {
    const base = Array.isArray(currentEvent?.gates) ? currentEvent.gates : []
    const extra = extraGatesByEvent[form.event_id] || []
    const map = new Map()
    for (const g of [...base, ...extra]) {
      if (g?.id) map.set(g.id, g)
    }
    return Array.from(map.values())
  }, [currentEvent?.gates, extraGatesByEvent, form.event_id])

  const handleQuickAddGate = async () => {
    const trimmed = quickGateName.trim()
    if (!trimmed || !form.event_id) return
    setAddingQuickGate(true)
    try {
      const created = await createEventGate(form.event_id, { name: trimmed })
      setExtraGatesByEvent((prev) => ({
        ...prev,
        [form.event_id]: [...(prev[form.event_id] || []), created],
      }))
      setForm((f) => ({ ...f, gate_id: created.id }))
      setQuickGateName('')
      toast.success(isEnglish ? `Added gate "${created.name}".` : `Đã thêm cổng "${created.name}".`)
      if (onGateCreated) onGateCreated()
    } catch (err) {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to add gate.' : 'Không thể thêm cổng.'))
    } finally {
      setAddingQuickGate(false)
    }
  }

  // Debounced candidate search
  useEffect(() => {
    let active = true
    const search = async () => {
      if (!candidateSearch.trim()) { setCandidates([]); return }
      try {
        const rows = await fetchStaffCandidates({ search: candidateSearch.trim() })
        if (active) setCandidates(rows)
      } catch { if (active) setCandidates([]) }
    }
    const t = setTimeout(search, 280)
    return () => { active = false; clearTimeout(t) }
  }, [candidateSearch])

  const pickCandidate = (candidate) => {
    setForm((f) => ({ ...f, email: candidate.email }))
    setCandidateSearch(candidate.email)
    setCandidates([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.event_id || !form.email.trim()) return
    setSaving(true)
    try {
      const selectedGateObj = eventGates.find((g) => g.id === form.gate_id)
      const invitation = await inviteStaffToEvent({
        event_id: form.event_id,
        session_id: form.session_ids.length === 1 ? form.session_ids[0] : null,
        session_ids: form.session_ids.length > 0 ? form.session_ids : null,
        email: form.email.trim(),
        staff_role: form.staff_role.trim() || null,
        gate_id: form.gate_id || null,
        gate: selectedGateObj ? selectedGateObj.name : null,
        zone: form.zone.trim() || null,
      })
      onInvited(invitation)
    } catch (err) {
      const message = getApiMessage(err, 'Không thể gửi lời mời.')
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full min-w-0 max-w-2xl overflow-hidden rounded-2xl bg-[#0b1329] border border-white/15 shadow-2xl shadow-black/90 text-white max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#111c3a] px-6 py-4 shrink-0">
          <div className="flex items-center gap-2 font-black text-white text-lg">
            {isEnglish ? 'Invite Staff' : 'Mời nhân sự'}
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
            title={isEnglish ? 'Close' : 'Đóng'}
          >
            <X className="size-5" />
          </button>
        </div>
        <form className="flex flex-1 flex-col overflow-hidden min-h-0" onSubmit={handleSubmit}>
          <div className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
          {limitReached && (
            <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning">
              Gói {subscriptionName} đã đạt giới hạn {perEventLimit} staff/sự kiện.
            </div>
          )}

          {events.length === 0 && (
            <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning">
              Không có sự kiện đã duyệt và còn hiệu lực để mời nhân sự.
            </div>
          )}

          <div className="grid gap-4">
            {/* Event */}
            <label className="grid min-w-0 gap-1.5 text-sm font-bold text-white">
              {isEnglish ? 'Event' : 'Sự kiện'}
              <select
                className="h-10 min-w-0 w-full truncate rounded-xl border border-white/15 bg-[#0d172e] px-3 pr-9 text-sm font-medium text-white shadow-sm outline-none focus:border-primary"
                title={events.find((ev) => ev.id === form.event_id)?.title || ''}
                value={form.event_id}
                onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value, session_ids: [], gate_id: '' }))}
                required
                disabled={events.length === 0}
              >
                <option value="" className="bg-[#0b1329] text-white">
                  {isEnglish ? 'Select event...' : 'Chọn sự kiện...'}
                </option>
                {events.filter(isApprovedOrPublishedEvent).map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#0b1329] text-white">{ev.title}</option>
                ))}
              </select>
            </label>

            {/* Event Sessions (Multi-select) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold text-white flex items-center gap-1.5">
                  {isEnglish ? 'Event Session' : 'Phiên sự kiện'}
                  <span className="text-xs font-normal text-slate-400">
                    {isEnglish ? '(select multiple sessions or entire event)' : '(chọn nhiều phiên hoặc toàn bộ sự kiện)'}
                  </span>
                </label>
                {eventSessions.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, session_ids: [] }))}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        form.session_ids.length === 0
                          ? 'border border-cyan-400 bg-cyan-400/20 text-cyan-300 font-bold'
                          : 'border border-white/10 bg-[#0d172e]/60 text-slate-300 hover:border-cyan-400/40 hover:text-white'
                      }`}
                    >
                      {isEnglish ? 'Entire event' : 'Toàn bộ sự kiện'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => {
                          const allSelected = f.session_ids.length === eventSessions.length
                          return {
                            ...f,
                            session_ids: allSelected ? [] : eventSessions.map((s) => s.id),
                          }
                        })
                      }
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        form.session_ids.length === eventSessions.length && eventSessions.length > 0
                          ? 'border border-cyan-400 bg-cyan-400/20 text-cyan-300 font-bold'
                          : 'border border-white/10 bg-[#0d172e]/60 text-slate-300 hover:border-cyan-400/40 hover:text-white'
                      }`}
                    >
                      {form.session_ids.length === eventSessions.length && eventSessions.length > 0
                        ? (isEnglish ? 'Deselect all' : 'Bỏ chọn tất cả')
                        : (isEnglish ? `Select all (${eventSessions.length})` : `Chọn tất cả (${eventSessions.length})`)}
                    </button>
                  </div>
                )}
              </div>

              {eventSessions.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#0d172e] px-3.5 py-2.5 text-xs text-slate-400">
                  {isEnglish
                    ? 'This event does not have working sessions (applies to the entire event by default).'
                    : 'Sự kiện này không chia phiên làm việc (mặc định áp dụng cho toàn bộ sự kiện).'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  {eventSessions.map((sess, idx) => {
                    const isSelected = form.session_ids.includes(sess.id)
                    const timeStr = formatSessionTime(sess.start_time, sess.end_time, isEnglish)
                    return (
                      <button
                        key={sess.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => {
                            const exists = f.session_ids.includes(sess.id)
                            const updated = exists
                              ? f.session_ids.filter((id) => id !== sess.id)
                              : [...f.session_ids, sess.id]
                            return { ...f, session_ids: updated }
                          })
                        }}
                        className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-500/15 text-white shadow-sm shadow-cyan-500/20'
                            : 'border-white/10 bg-[#0d172e]/80 text-slate-300 hover:border-white/25 hover:bg-[#0d172e]'
                        }`}
                      >
                        <div
                          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors ${
                            isSelected
                              ? 'border-cyan-400 bg-cyan-400 text-black'
                              : 'border-white/30 bg-transparent'
                          }`}
                        >
                          {isSelected && <Check className="size-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-tight text-white truncate">
                            {sess.session_name || (isEnglish ? `Session ${idx + 1}` : `Phiên ${idx + 1}`)}
                          </p>
                          {timeStr && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                              {timeStr}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Email & Role in 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Email with autocomplete */}
              <label className="grid gap-1.5 text-sm font-bold text-white">
                {isEnglish ? 'Customer account email' : 'Email tài khoản khách hàng'}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
                  <input
                    type="search"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] pl-9 pr-3 text-sm font-normal text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-white/50"
                    placeholder={isEnglish ? 'Find name or email...' : 'Tìm tên hoặc email...'}
                    value={candidateSearch}
                    onChange={(e) => {
                      setCandidateSearch(e.target.value)
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }}
                    disabled={limitReached || saving}
                  />
                  {candidates.length > 0 && (
                    <ul className="absolute left-0 right-0 z-50 mt-1.5 max-h-56 w-full overflow-auto rounded-xl border border-white/20 bg-[#0d162e] shadow-2xl shadow-black/95 divide-y divide-white/10">
                      {candidates.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col px-3.5 py-2.5 text-left text-sm text-slate-100 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                            onClick={() => pickCandidate(c)}
                          >
                            <span className="font-bold text-white text-sm">{c.full_name}</span>
                            <span className="text-xs text-slate-300 mt-0.5">{c.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </label>

              {/* Role */}
              <label className="grid gap-1.5 text-sm font-bold text-white">
                {isEnglish ? 'Role' : 'Vai trò'}
                <input
                  className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm text-white outline-none focus:border-primary placeholder:text-white/50"
                  placeholder={isEnglish ? 'For example: Check-in, Support, Onsite sales...' : 'VD: Check-in, Hỗ trợ khách, Bán vé tại chỗ...'}
                  value={form.staff_role}
                  onChange={(e) => setForm((f) => ({ ...f, staff_role: e.target.value }))}
                  disabled={saving}
                />
              </label>
            </div>

            {/* Gate & Zone in 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Gate column */}
              <div className="space-y-2">
                <label className="grid gap-1.5 text-sm font-bold text-white">
                  {isEnglish ? 'Check-in / assignment gate' : 'Cổng check-in / phân công'}
                  <select
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm font-medium text-white outline-none focus:border-primary disabled:opacity-50"
                    value={form.gate_id}
                    onChange={(e) => setForm((f) => ({ ...f, gate_id: e.target.value }))}
                    disabled={saving || !form.event_id}
                  >
                    <option value="" className="bg-[#0b1329] text-white">
                      {isEnglish ? 'All gates (No restriction)' : 'Tất cả cổng (Không giới hạn)'}
                    </option>
                    {eventGates.map((g) => (
                      <option key={g.id} value={g.id} className="bg-[#0b1329] text-white">
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={quickGateName}
                    onChange={(e) => setQuickGateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleQuickAddGate()
                      }
                    }}
                    placeholder={isEnglish ? 'Quick add new gate...' : 'Thêm nhanh cổng mới...'}
                    maxLength={100}
                    disabled={saving || addingQuickGate || !form.event_id}
                    className="h-8 flex-1 min-w-0 rounded-lg border border-white/10 bg-[#0d172e]/70 px-2.5 text-xs text-white outline-none focus:border-primary placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddGate}
                    disabled={saving || addingQuickGate || !form.event_id || !quickGateName.trim()}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 text-xs font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
                  >
                    {addingQuickGate ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    {isEnglish ? 'Add' : 'Lưu'}
                  </button>
                </div>
                {eventGates.length === 0 && (
                  <p className="text-[11px] text-amber-300/90">
                    {isEnglish
                      ? 'No gates saved for this event yet. Add one above to select it.'
                      : 'Sự kiện chưa có cổng nào trong DB. Hãy thêm nhanh ở ô trên.'}
                  </p>
                )}
              </div>

              {/* Zone column */}
              <div className="space-y-2">
                <label className="grid gap-1.5 text-sm font-bold text-white">
                  {isEnglish ? 'Working area during the event' : 'Khu vực làm việc trong sự kiện'}
                  <input
                    className="h-10 rounded-xl border border-white/15 bg-[#0d172e] px-3 text-sm text-white outline-none focus:border-primary placeholder:text-white/50"
                    placeholder={isEnglish ? 'For example: VIP area, Stand A, GA standing area, 1st floor...' : 'VD: Khu VIP, Khán đài A, Khu đứng GA, Tầng 1...'}
                    value={form.zone}
                    onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                {/* Quick suggestions for zone */}
                <div className="flex flex-wrap gap-1.5">
                  {(isEnglish ? ZONE_SUGGESTIONS_EN : ZONE_SUGGESTIONS_VI).map((suggestion, idx) => {
                    const isAllOption = idx === (isEnglish ? ZONE_SUGGESTIONS_EN : ZONE_SUGGESTIONS_VI).length - 1
                    const isSelected = isAllOption
                      ? !form.zone
                      : form.zone === suggestion || form.zone === ZONE_SUGGESTIONS_VI[idx] || form.zone === ZONE_SUGGESTIONS_EN[idx]
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-amber-500 bg-amber-500/20 text-amber-400 font-bold shadow-sm shadow-amber-500/20'
                            : 'border-white/15 bg-[#0d172e]/60 text-slate-300 hover:border-amber-500/40 hover:text-white'
                        }`}
                        onClick={() => setForm((f) => ({ ...f, zone: isAllOption ? '' : suggestion }))}
                      >
                        {suggestion}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

            <p className="mt-3 text-xs leading-5 text-muted">
              {isEnglish
                ? 'Customer will receive a notification with the assigned gate and area. Once accepted, they are assigned the STAFF role for this event.'
                : 'Khách hàng sẽ nhận thông báo kèm cổng và khu vực phân công. Sau khi chấp nhận, họ sẽ được gán vai trò nhân viên cho sự kiện này.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-border-soft/20 px-6 py-4 bg-panel-soft/30 shrink-0">
            <button type="button" className="org-btn-secondary" onClick={onClose} disabled={saving}>
              {isEnglish ? 'Cancel' : 'Hủy'}
            </button>
            <button
              type="submit"
              className="org-btn-primary"
              disabled={saving || limitReached || events.length === 0 || !form.email.trim() || !form.event_id}
            >
              {saving ? (
                <><Loader2 className="size-4 animate-spin" /> {isEnglish ? 'Sending...' : 'Đang gửi...'}</>
              ) : (
                isEnglish ? 'Send Invitation' : 'Gửi lời mời'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, danger, loading, onConfirm, onCancel }) {
  const { isEnglish } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-[#0b1329] border border-white/15 p-6 shadow-2xl shadow-black/90 text-white">
        <h3 className="font-black text-xl text-white">{title}</h3>
        <p className="mt-2 text-sm text-subtle">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button className="org-btn-secondary px-6" onClick={onCancel} disabled={loading}>
            {isEnglish ? 'Cancel' : 'Hủy'}
          </button>
          <button
            className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-all ${danger
              ? 'bg-error text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'
              : 'org-btn-primary'
              }`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Quota Card ───────────────────────────────────────────────────────────────

function QuotaCard({ label, value, sub, warn }) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 shadow-sm ${warn ? 'border-error/30 bg-error/10 text-error' : 'border-border-soft/30 bg-panel-soft text-content'
        }`}
    >
      <p className="text-base sm:text-lg font-bold uppercase tracking-wider text-white">{label}</p>
      <p className={`mt-1.5 text-[15px] font-normal ${warn ? 'text-error' : 'text-slate-200'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[13px] font-normal text-slate-400">{sub}</p>}
    </div>
  )
}

// ─── Invitation Status Badge ──────────────────────────────────────────────────

function InvitationStatusBadge({ status }) {
  const map = {
    PENDING: { tone: 'amber', label: 'Đang chờ', icon: Clock },
    ACCEPTED: { tone: 'green', label: 'Đã chấp nhận', icon: CheckCircle2 },
    DECLINED: { tone: 'red', label: 'Đã từ chối', icon: MailX },
  }
  const cfg = map[status] || { tone: 'gray', label: status, icon: MailCheck }
  const Icon = cfg.icon
  return (
    <Badge tone={cfg.tone}>
      <span className="flex items-center gap-1">
        <Icon className="size-3" />
        {cfg.label}
      </span>
    </Badge>
  )
}
