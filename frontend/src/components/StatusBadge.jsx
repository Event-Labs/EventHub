import { memo } from 'react'

/**
 * Standardized status tone definitions across Organizer, Admin, Staff portals.
 * Ensures identical formatting, sizing, typography, borders, and colors.
 */
export const BADGE_TONES = {
  green:
    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
  emerald:
    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
  amber:
    'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
  yellow:
    'bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
  purple:
    'bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
  violet:
    'bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
  cyan:
    'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]',
  sky:
    'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]',
  blue:
    'bg-sky-500/15 text-sky-400 border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.15)]',
  primary:
    'bg-primary/20 text-primary border-primary/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]',
  indigo:
    'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.15)]',
  orange:
    'bg-orange-500/15 text-orange-400 border-orange-500/30 shadow-[0_0_12px_rgba(249,115,22,0.15)]',
  red:
    'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
  rose:
    'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
  error:
    'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
  gray:
    'bg-slate-500/15 text-slate-300 border-slate-500/30',
  slate:
    'bg-slate-500/15 text-slate-300 border-slate-500/30',
  neutral:
    'bg-white/10 text-slate-300 border-white/20',
}

/**
 * Universal status configuration dictionary mapping system codes to Vietnamese labels & tones
 */
export const STATUS_CONFIG_MAP = {
  // ─── Orders ──────────────────────────────────────────────
  PAID: { label: 'Đã thanh toán', tone: 'green' },
  PENDING: { label: 'Chờ thanh toán', tone: 'amber' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray' },
  CANCELED: { label: 'Đã hủy', tone: 'gray' },
  EXPIRED: { label: 'Hết hạn', tone: 'orange' },
  REFUND_REQUESTED: { label: 'Yêu cầu hoàn tiền', tone: 'purple' },
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'cyan' },
  PARTIALLY_REFUNDED: { label: 'Hoàn một phần', tone: 'cyan' },
  FAILED: { label: 'Thất bại', tone: 'red' },
  PROCESSING: { label: 'Đang xử lý', tone: 'amber' },

  // ─── Refunds ─────────────────────────────────────────────
  APPROVED: { label: 'Đã duyệt', tone: 'green' },
  REJECTED: { label: 'Đã từ chối', tone: 'red' },

  // ─── Events & Approval ───────────────────────────────────
  PUBLISHED: { label: 'Đã xuất bản', tone: 'green' },
  DRAFT: { label: 'Bản nháp', tone: 'gray' },
  PENDING_REVIEW: { label: 'Chờ duyệt', tone: 'amber' },
  NEEDS_REVISION: { label: 'Cần sửa đổi', tone: 'amber' },
  HIDDEN: { label: 'Đã ẩn', tone: 'gray' },
  ENDED: { label: 'Đã kết thúc', tone: 'gray' },
  COMPLETED: { label: 'Đã kết thúc', tone: 'green' },
  ONGOING: { label: 'Đang diễn ra', tone: 'green' },
  UPCOMING: { label: 'Sắp diễn ra', tone: 'blue' },

  // ─── Accounts / Users / Organizations ────────────────────
  ACTIVE: { label: 'Hoạt động', tone: 'green' },
  INACTIVE: { label: 'Tạm ẩn', tone: 'gray' },
  LOCKED: { label: 'Đã khóa', tone: 'red' },
  SUSPENDED: { label: 'Tạm ngưng', tone: 'red' },
  UNVERIFIED: { label: 'Chưa xác thực', tone: 'gray' },
  ORGANIZATION: { label: 'Tổ chức', tone: 'green' },
  INDIVIDUAL: { label: 'Cá nhân', tone: 'blue' },
  ADMIN: { label: 'Quản trị viên', tone: 'purple' },
  ORGANIZER: { label: 'Nhà tổ chức', tone: 'blue' },
  STAFF: { label: 'Nhân viên', tone: 'blue' },
  CUSTOMER: { label: 'Khách hàng', tone: 'gray' },

  // ─── Staff Invitations / Assignments ─────────────────────
  ACCEPTED: { label: 'Đã tham gia', tone: 'green' },
  INVITED: { label: 'Đang mời', tone: 'amber' },
  REVOKED: { label: 'Đã thu hồi', tone: 'red' },

  // ─── Check-In / Tickets ──────────────────────────────────
  VALID: { label: 'Hợp lệ', tone: 'green' },
  INVALID: { label: 'Không hợp lệ', tone: 'red' },
  ALREADY: { label: 'Đã soát vé', tone: 'orange' },
  ALREADY_CHECKED_IN: { label: 'Đã check-in trước đó', tone: 'orange' },
  CHECKED_IN: { label: 'Đã check-in', tone: 'green' },
  SUCCESS: { label: 'Thành công', tone: 'green' },
  USED: { label: 'Đã sử dụng', tone: 'gray' },

  // ─── Promos / Subscriptions ──────────────────────────────
  DISABLED: { label: 'Đã tắt', tone: 'gray' },
  TRIAL: { label: 'Dùng thử', tone: 'blue' },
}

/**
 * Resolves status configuration with safe fallback
 */
export function resolveStatusConfig(status, fallbackLabel = null) {
  if (!status) {
    return {
      label: fallbackLabel || '—',
      tone: 'gray',
    }
  }

  const normalized = String(status).trim().toUpperCase()
  const found = STATUS_CONFIG_MAP[normalized]

  if (found) {
    return found
  }

  // If status is already in Vietnamese or custom text, make a sensible tone deduction
  const lower = String(status).toLowerCase()
  let tone = 'gray'

  if (
    lower.includes('thành công') ||
    lower.includes('hoàn tất') ||
    lower.includes('hoạt động') ||
    lower.includes('đã thanh toán') ||
    lower.includes('đã duyệt') ||
    lower.includes('hợp lệ') ||
    lower.includes('xuất bản') ||
    lower.includes('mở bán')
  ) {
    tone = 'green'
  } else if (
    lower.includes('chờ') ||
    lower.includes('đang duyệt') ||
    lower.includes('đang xử lý') ||
    lower.includes('cần')
  ) {
    tone = 'amber'
  } else if (
    lower.includes('hoàn tiền') ||
    lower.includes('yêu cầu hoàn')
  ) {
    tone = lower.includes('yêu cầu') ? 'purple' : 'cyan'
  } else if (
    lower.includes('hết hạn') ||
    lower.includes('sắp') ||
    lower.includes('trước đó')
  ) {
    tone = 'orange'
  } else if (
    lower.includes('hủy') ||
    lower.includes('thất bại') ||
    lower.includes('từ chối') ||
    lower.includes('khóa') ||
    lower.includes('đình chỉ') ||
    lower.includes('không hợp lệ')
  ) {
    tone = 'red'
  }

  return {
    label: fallbackLabel || status,
    tone,
  }
}

/**
 * Unified Badge Component
 * Uniform size, padding, typography, border radius, and colors across the portal
 */
export const Badge = memo(function Badge({
  children,
  tone = 'blue',
  className = '',
  dot = false,
}) {
  const toneClasses = BADGE_TONES[tone] || BADGE_TONES.gray

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap ${toneClasses} ${className}`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  )
})

/**
 * Standard StatusBadge Component
 * Automatically maps any backend status code to Vietnamese and appropriate tone
 */
export const StatusBadge = memo(function StatusBadge({
  status,
  label,
  tone,
  className = '',
  dot = false,
}) {
  const config = resolveStatusConfig(status, label)
  const finalTone = tone || config.tone
  const finalLabel = label || config.label

  return (
    <Badge tone={finalTone} className={className} dot={dot}>
      {finalLabel}
    </Badge>
  )
})
