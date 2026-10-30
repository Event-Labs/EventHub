// ─── Operational Status Classifier for Events ────────────────────────────────

export function getEventOperationalStatus(ev) {
  if (!ev) return { key: 'ALL', label: 'Tất cả', badgeClass: 'bg-slate-700 text-slate-300', dotClass: 'bg-slate-400' }

  if (ev.status === 'DRAFT') {
    return {
      key: 'DRAFT',
      label: 'Bản nháp',
      badgeClass: 'border-slate-500/40 bg-slate-800/80 text-slate-300 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700 [html.light_&]:border-slate-300',
      dotClass: 'bg-slate-400',
      group: 'DRAFT',
    }
  }

  if (ev.status === 'CANCELLED') {
    return {
      key: 'CANCELLED',
      label: 'Đã hủy',
      badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      dotClass: 'bg-rose-400',
      group: 'ENDED',
    }
  }

  if (isEventEnded(ev)) {
    return {
      key: 'ENDED',
      label: 'Đã kết thúc',
      badgeClass: 'border-purple-500/40 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)] [html.light_&]:bg-[#f3e8ff] [html.light_&]:text-[#6b21a8] [html.light_&]:border-[#a855f7]',
      dotClass: 'bg-purple-400',
      group: 'ENDED',
    }
  }

  if (ev.status === 'DRAFT') {
    return {
      key: 'DRAFT',
      label: 'Bản nháp',
      badgeClass: 'border-slate-500/40 bg-slate-800/80 text-slate-300 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700 [html.light_&]:border-slate-300',
      dotClass: 'bg-slate-400',
      group: 'DRAFT',
    }
  }

  if (ev.display_state === 'SUSPENDED_BY_ADMIN') {
    return {
      key: 'SUSPENDED',
      label: 'Bị đình chỉ (Admin)',
      badgeClass: 'border-rose-600/40 bg-rose-900/30 text-rose-300',
      dotClass: 'bg-rose-500',
      group: 'ENDED',
    }
  }

  if (ev.display_state === 'HIDDEN_BY_ORGANIZER') {
    return {
      key: 'HIDDEN',
      label: 'Đang ẩn',
      badgeClass: 'border-zinc-500/30 bg-zinc-800/60 text-zinc-400 [html.light_&]:bg-zinc-100 [html.light_&]:text-zinc-600 [html.light_&]:border-zinc-300',
      dotClass: 'bg-zinc-400',
      group: 'DRAFT',
    }
  }

  if (ev.status === 'PENDING_REVIEW') {
    return {
      key: 'PENDING',
      label: ev.pending_revision ? 'Bản sửa đổi chờ duyệt' : 'Chờ duyệt',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      dotClass: 'bg-amber-400',
      group: 'DRAFT',
    }
  }

  const now = new Date()
  const start = ev.start_time ? new Date(ev.start_time) : null
  const end = ev.end_time ? new Date(ev.end_time) : (start ? new Date(start.getTime() + 4 * 3600000) : null)

  // Approved by Admin and waiting for organizer to publish
  if (ev.status === 'COMPLETED' && ev.approval_status === 'APPROVED' && (!end || now <= end)) {
    return {
      key: 'APPROVED',
      label: 'Đã duyệt (Chờ xuất bản)',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      dotClass: 'bg-emerald-400',
      group: 'UPCOMING',
    }
  }

  if (start && end && now >= start && now <= end) {
    return {
      key: 'RUNNING',
      label: 'Đang diễn ra',
      badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      dotClass: 'bg-emerald-400 animate-pulse',
      isLive: true,
      group: 'RUNNING',
    }
  }

  if (start && now < start) {
    return {
      key: 'UPCOMING',
      label: 'Sắp diễn ra',
      badgeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
      dotClass: 'bg-cyan-400',
      group: 'UPCOMING',
    }
  }

  if (end && now > end) {
    return {
      key: 'ENDED',
      label: 'Đã kết thúc',
      badgeClass: 'border-purple-500/40 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)] [html.light_&]:bg-[#f3e8ff] [html.light_&]:text-[#6b21a8] [html.light_&]:border-[#a855f7]',
      dotClass: 'bg-purple-400',
      group: 'ENDED',
    }
  }

  if (ev.status === 'COMPLETED') {
    return {
      key: 'ENDED',
      label: 'Đã kết thúc',
      badgeClass: 'border-purple-500/40 bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)] [html.light_&]:bg-[#f3e8ff] [html.light_&]:text-[#6b21a8] [html.light_&]:border-[#a855f7]',
      dotClass: 'bg-purple-400',
      group: 'ENDED',
    }
  }

  return {
    key: 'PUBLISHED',
    label: 'Đang công khai',
    badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    dotClass: 'bg-blue-400',
    group: 'UPCOMING',
  }
}

export function isEventEnded(ev) {
  if (!ev) return false
  const now = new Date()
  const start = ev.start_time ? new Date(ev.start_time) : null
  const end = ev.end_time ? new Date(ev.end_time) : (start ? new Date(start.getTime() + 4 * 3600000) : null)

  // Approved by Admin awaiting publish and event time has not passed: NOT ended
  if (ev.status === 'COMPLETED' && ev.approval_status === 'APPROVED') {
    return Boolean(end && now > end)
  }

  // Events that have physically passed their end time
  if (end && now > end) return true

  // Other completed/ended events
  if (ev.status === 'COMPLETED' || ev.status === 'ENDED' || ev.sales_status === 'ENDED') {
    return Boolean(end ? now > end : true)
  }

  return false
}

export function getDisplayStateInfo(state) {
  switch (state) {
    case 'PUBLIC':
      return { label: 'Công khai', badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
    case 'HIDDEN_BY_ORGANIZER':
      return { label: 'Đã ẩn (BTC)', badgeClass: 'border-slate-500/30 bg-slate-500/10 text-slate-300' }
    case 'SUSPENDED_BY_ADMIN':
      return { label: 'Đình chỉ (Admin)', badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300' }
    default:
      return { label: 'Mặc định', badgeClass: 'border-slate-500/30 bg-slate-500/10 text-slate-300' }
  }
}

export function getSalesStatusInfo(status, ev = null) {
  if (isEventEnded(ev)) {
    return { label: 'Đã đóng bán', badgeClass: 'border-slate-600/30 bg-slate-800/60 text-slate-400', isEnded: true }
  }
  switch (status) {
    case 'ON_SALE':
      return { label: 'Đang bán vé', badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
    case 'PAUSED':
      return { label: 'Tạm dừng bán', badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300' }
    case 'SOLD_OUT':
      return { label: 'Hết vé', badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300' }
    case 'ENDED':
    case 'CLOSED':
      return { label: 'Đã đóng bán', badgeClass: 'border-slate-500/30 bg-slate-500/10 text-slate-400', isEnded: true }
    default:
      return { label: 'Chưa mở bán', badgeClass: 'border-slate-500/30 bg-slate-500/10 text-slate-400' }
  }
}

