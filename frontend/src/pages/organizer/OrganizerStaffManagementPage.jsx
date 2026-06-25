import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MailCheck,
  MailX,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  fetchOrganizerOperationsOverview,
  fetchStaffCandidates,
  inviteStaffToEvent,
  removeStaffFromEvent,
} from '@/services/operations.js'
import { AvatarInitials, Badge, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerStaffManagementPage() {
  const [data, setData] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(null) // { staffId, staffName }

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const ov = await fetchOrganizerOperationsOverview()
      setData(ov)
      setSelectedEventId((cur) => cur || ov.events?.[0]?.id || '')
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu.')
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
    () => (data?.invitations || []).filter((i) => i.event_id === selectedEventId),
    [data?.invitations, selectedEventId],
  )

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
      setRemoveConfirm(null)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gỡ nhân sự.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <OrganizerPage
      title="Quản lý nhân sự"
      description="Phân công, mời và quản lý nhân sự cho từng sự kiện."
    >
      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error animate-in fade-in duration-200">
          {error}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1 text-xs font-bold text-subtle">
          Sự kiện
          <div className="relative">
            <select
              className="h-10 w-64 appearance-none rounded-xl border border-border-soft/40 bg-panel-soft pl-3 pr-8 text-sm font-semibold text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              disabled={loading}
            >
              {(data?.events || []).map((ev) => (
                <option key={ev.id} value={ev.id} className="bg-surface text-content">{ev.title}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
          </div>
        </label>

        <button
          className="org-btn-primary self-end disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setShowInviteModal(true)}
          disabled={loading || !subscriptionActive || limitReached || !selectedEventId}
        >
          <UserPlus className="size-4" />
          Mời nhân sự
        </button>
      </div>

      {/* ── Quota cards ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuotaCard label="Gói dịch vụ" value={plan?.name || 'Chưa có'} />
        <QuotaCard
          label="Giới hạn / sự kiện"
          value={perEventLimit > 0 ? perEventLimit : '—'}
        />
        <QuotaCard
          label="Đã phân công"
          value={assignedStaff.length}
          sub={pendingCount > 0 ? `+${pendingCount} đang chờ` : null}
        />
        <QuotaCard
          label="Slot còn lại"
          value={subscriptionActive && perEventLimit > 0 ? slotsRemaining : '—'}
          warn={limitReached}
        />
      </div>

      {loading ? (
        <OrganizerPanel className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
        </OrganizerPanel>
      ) : !subscriptionActive ? (
        <OrganizerPanel className="py-10 text-center">
          <p className="font-bold text-error">Cần gói subscription đang hoạt động để mời staff.</p>
          <p className="mt-1 text-sm text-subtle">Vui lòng nâng cấp gói dịch vụ tại mục Gói dịch vụ.</p>
        </OrganizerPanel>
      ) : (
        <>
          {/* ── Staff list ── */}
          <section className="mb-7">
            <h2 className="mb-3 flex items-center gap-2 font-extrabold text-content">
              <UserCheck className="size-5 text-primary" />
              Nhân sự đã phân công
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {assignedStaff.length}
              </span>
            </h2>

            {assignedStaff.length === 0 ? (
              <OrganizerPanel className="py-10 text-center border-dashed">
                <Users className="mx-auto mb-3 size-10 text-muted" />
                <p className="text-sm text-subtle">Chưa có staff nào được phân công.</p>
              </OrganizerPanel>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border-soft/30 bg-surface">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border-soft/30 bg-panel-soft/30 text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3 font-bold">Nhân sự</th>
                      <th className="px-5 py-3 font-bold">Email</th>
                      <th className="px-5 py-3 font-bold">Vai trò</th>
                      <th className="px-5 py-3 font-bold">Ngày phân công</th>
                      <th className="px-5 py-3 font-bold">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedStaff.map((staff) => (
                      <tr key={staff.id} className="border-t border-border-soft/20 hover:bg-panel-soft/60 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <AvatarInitials name={staff.staff_name || 'Staff'} className="size-9" />
                            <span className="font-bold text-content">{staff.staff_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-subtle">{staff.staff_email}</td>
                        <td className="px-5 py-3">
                          <Badge tone="blue">{staff.staff_role || 'Staff'}</Badge>
                        </td>
                        <td className="px-5 py-3 text-subtle">
                          {new Date(staff.assigned_at).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            className="flex items-center gap-1.5 rounded-xl border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-bold text-error hover:bg-error/20 disabled:opacity-50 transition-colors"
                            onClick={() =>
                              setRemoveConfirm({ staffId: staff.staff_id, staffName: staff.staff_name })
                            }
                            disabled={saving}
                          >
                            <Trash2 className="size-3.5" />
                            Gỡ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Invitations list ── */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-extrabold text-content">
              <MailCheck className="size-5 text-primary" />
              Lời mời nhân sự
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {invitations.length}
              </span>
            </h2>

            {invitations.length === 0 ? (
              <OrganizerPanel className="py-8 text-center border-dashed">
                <p className="text-sm text-subtle">Chưa có lời mời nào.</p>
              </OrganizerPanel>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border-soft/30 bg-surface">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border-soft/30 bg-panel-soft/30 text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3 font-bold">Email</th>
                      <th className="px-5 py-3 font-bold">Người nhận</th>
                      <th className="px-5 py-3 font-bold">Vai trò</th>
                      <th className="px-5 py-3 font-bold">Trạng thái</th>
                      <th className="px-5 py-3 font-bold">Hết hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="border-t border-border-soft/20 hover:bg-panel-soft/60 transition-colors">
                        <td className="px-5 py-3 font-semibold text-content">{inv.invited_email}</td>
                        <td className="px-5 py-3 text-subtle">{inv.invited_user_name || '—'}</td>
                        <td className="px-5 py-3 text-content">{inv.staff_role || 'Staff'}</td>
                        <td className="px-5 py-3">
                          <InvitationStatusBadge status={inv.status} />
                        </td>
                        <td className="px-5 py-3 text-muted">
                          {inv.expires_at
                            ? new Date(inv.expires_at).toLocaleDateString('vi-VN')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Invite modal ── */}
      {showInviteModal && (
        <InviteStaffModal
          selectedEventId={selectedEventId}
          events={data?.events || []}
          limitReached={limitReached}
          subscriptionName={plan?.name}
          perEventLimit={perEventLimit}
          onClose={() => setShowInviteModal(false)}
          onInvited={() => {
            setShowInviteModal(false)
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
    </OrganizerPage>
  )
}

// ─── Invite Staff Modal ───────────────────────────────────────────────────────

function InviteStaffModal({
  selectedEventId,
  events,
  limitReached,
  subscriptionName,
  perEventLimit,
  onClose,
  onInvited,
}) {
  const [form, setForm] = useState({ event_id: selectedEventId || '', email: '', staff_role: 'Check-in' })
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidates, setCandidates] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    setError('')
    try {
      await inviteStaffToEvent({ event_id: form.event_id, email: form.email.trim(), staff_role: form.staff_role })
      onInvited()
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi lời mời.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030818]/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border-soft/30 shadow-2xl text-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft/20 px-6 py-4">
          <div className="flex items-center gap-2 font-extrabold text-content">
            <UserPlus className="size-5 text-primary" />
            Mời nhân sự
          </div>
          <button
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel-soft/60 transition-colors"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <form className="px-6 py-5" onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-2 text-sm font-semibold text-error animate-in fade-in">
              {error}
            </div>
          )}

          {limitReached && (
            <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning">
              Gói {subscriptionName} đã đạt giới hạn {perEventLimit} staff/sự kiện.
            </div>
          )}

          <div className="grid gap-4">
            {/* Event */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              Sự kiện
              <select
                className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-content outline-none focus:border-primary"
                value={form.event_id}
                onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value }))}
                required
              >
                <option value="" className="bg-surface text-content">Chọn sự kiện...</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-surface text-content">{ev.title}</option>
                ))}
              </select>
            </label>

            {/* Email with autocomplete */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              Email tài khoản customer
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  className="h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft pl-9 pr-3 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted"
                  placeholder="Tìm tên hoặc email..."
                  value={candidateSearch}
                  onChange={(e) => {
                    setCandidateSearch(e.target.value)
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }}
                  disabled={limitReached || saving}
                />
                {candidates.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-border-soft/30 bg-surface shadow-xl">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col px-3 py-2 text-left text-sm text-content hover:bg-panel-soft/60 transition-colors"
                          onClick={() => pickCandidate(c)}
                        >
                          <span className="font-bold text-content">{c.full_name}</span>
                          <span className="text-xs text-muted">{c.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </label>

            {/* Role */}
            <label className="grid gap-1.5 text-xs font-bold text-subtle">
              Vai trò
              <input
                className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
                placeholder="VD: Check-in, Hỗ trợ khách, Bán vé tại chỗ..."
                value={form.staff_role}
                onChange={(e) => setForm((f) => ({ ...f, staff_role: e.target.value }))}
                disabled={saving}
              />
            </label>
          </div>

          <p className="mt-3 text-xs leading-5 text-muted">
            Customer sẽ nhận thông báo. Sau khi chấp nhận, họ được gán role STAFF cho sự kiện này.
          </p>

          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="org-btn-secondary" onClick={onClose} disabled={saving}>
              Hủy
            </button>
            <button
              type="submit"
              className="org-btn-primary"
              disabled={saving || limitReached || !form.email.trim() || !form.event_id}
            >
              {saving ? (
                <><Loader2 className="size-4 animate-spin" /> Đang gửi...</>
              ) : (
                <><UserPlus className="size-4" /> Gửi lời mời</>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030818]/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border-soft/30 p-6 shadow-2xl text-content">
        <h3 className="font-extrabold text-content">{title}</h3>
        <p className="mt-2 text-sm text-subtle">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button className="org-btn-secondary" onClick={onCancel} disabled={loading}>
            Hủy
          </button>
          <button
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              danger
                ? 'bg-error text-white hover:opacity-90 disabled:opacity-50'
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
      className={`rounded-2xl border px-4 py-3 shadow-sm ${
        warn ? 'border-error/30 bg-error/10 text-error' : 'border-border-soft/30 bg-panel-soft text-content'
      }`}
    >
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${warn ? 'text-error' : 'text-content'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs font-semibold text-subtle">{sub}</p>}
    </div>
  )
}

// ─── Invitation Status Badge ──────────────────────────────────────────────────

function InvitationStatusBadge({ status }) {
  const map = {
    PENDING: { tone: 'blue', label: 'Đang chờ', icon: Clock },
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
