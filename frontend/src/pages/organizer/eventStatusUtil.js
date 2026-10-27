// ─── Operational Status Classifier for Events ────────────────────────────────

export function getEventOperationalStatus(ev) {
  if (!ev) return { key: 'ALL', label: 'Tất cả', badgeClass: 'bg-slate-700 text-slate-300', dotClass: 'bg-slate-400' }

  if (ev.status === 'DRAFT') {
    return {
      key: 'DRAFT',
      label: 'Bản nháp',
      badgeClass: 'border-slate-600/40 bg-slate-800/80 text-slate-300',
      dotClass: 'bg-slate-400',
      group: 'DRAFT',
    }
  }

  if (ev.status === 'PENDING_REVIEW') {
    return {
      key: 'PENDING',
      label: 'Chờ duyệt',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      dotClass: 'bg-amber-400',
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

  const now = new Date()
  const start = ev.start_time ? new Date(ev.start_time) : null
  const end = ev.end_time ? new Date(ev.end_time) : (start ? new Date(start.getTime() + 4 * 3600000) : null)

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
      badgeClass: 'border-slate-600/30 bg-slate-800/60 text-slate-400',
      dotClass: 'bg-slate-500',
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
