import { memo } from 'react'

/**
 * Standardized status tone definitions across Organizer, Admin, Staff portals.
 * Ensures identical formatting, sizing, typography, borders, and colors.
 */
export const BADGE_TONES = {
  green:
    'bg-emerald-500/25 text-emerald-300 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-extrabold [html.light_&]:bg-[#dcfce7] [html.light_&]:text-[#065f46] [html.light_&]:border-[#10b981] [html.light_&]:shadow-sm [html.light_&]:font-black',
  emerald:
    'bg-emerald-500/25 text-emerald-300 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] font-extrabold [html.light_&]:bg-[#dcfce7] [html.light_&]:text-[#065f46] [html.light_&]:border-[#10b981] [html.light_&]:shadow-sm [html.light_&]:font-black',
  amber:
    'bg-amber-500/25 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-extrabold [html.light_&]:bg-[#fef3c7] [html.light_&]:text-[#92400e] [html.light_&]:border-[#f59e0b] [html.light_&]:shadow-sm [html.light_&]:font-black',
  yellow:
    'bg-amber-500/25 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-extrabold [html.light_&]:bg-[#fef3c7] [html.light_&]:text-[#92400e] [html.light_&]:border-[#f59e0b] [html.light_&]:shadow-sm [html.light_&]:font-black',
  purple:
    'bg-purple-500/25 text-purple-300 border-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)] font-extrabold [html.light_&]:bg-[#f3e8ff] [html.light_&]:text-[#6b21a8] [html.light_&]:border-[#a855f7] [html.light_&]:shadow-sm [html.light_&]:font-black',
  violet:
    'bg-purple-500/25 text-purple-300 border-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.25)] font-extrabold [html.light_&]:bg-[#f3e8ff] [html.light_&]:text-[#6b21a8] [html.light_&]:border-[#a855f7] [html.light_&]:shadow-sm [html.light_&]:font-black',
  cyan:
    'bg-cyan-500/25 text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.25)] font-extrabold [html.light_&]:bg-[#e0f2fe] [html.light_&]:text-[#0369a1] [html.light_&]:border-[#0284c7] [html.light_&]:shadow-sm [html.light_&]:font-black',
  sky:
    'bg-cyan-500/25 text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.25)] font-extrabold [html.light_&]:bg-[#e0f2fe] [html.light_&]:text-[#0369a1] [html.light_&]:border-[#0284c7] [html.light_&]:shadow-sm [html.light_&]:font-black',
  blue:
    'bg-sky-500/25 text-sky-300 border-sky-400/50 shadow-[0_0_12px_rgba(14,165,233,0.25)] font-extrabold [html.light_&]:bg-[#dbeafe] [html.light_&]:text-[#1e40af] [html.light_&]:border-[#3b82f6] [html.light_&]:shadow-sm [html.light_&]:font-black',
  primary:
    'bg-primary/25 text-primary border-primary/50 shadow-[0_0_12px_rgba(6,182,212,0.25)] font-extrabold [html.light_&]:bg-[#fef9c3] [html.light_&]:text-[#854d0e] [html.light_&]:border-[#C99A47] [html.light_&]:shadow-sm [html.light_&]:font-black',
  indigo:
    'bg-indigo-500/25 text-indigo-300 border-indigo-400/50 shadow-[0_0_12px_rgba(99,102,241,0.25)] font-extrabold [html.light_&]:bg-[#e0e7ff] [html.light_&]:text-[#3730a3] [html.light_&]:border-[#6366f1] [html.light_&]:shadow-sm [html.light_&]:font-black',
  orange:
    'bg-orange-500/25 text-orange-300 border-orange-400/50 shadow-[0_0_12px_rgba(249,115,22,0.25)] font-extrabold [html.light_&]:bg-[#ffedd5] [html.light_&]:text-[#9a3412] [html.light_&]:border-[#f97316] [html.light_&]:shadow-sm [html.light_&]:font-black',
  red:
    'bg-rose-500/25 text-rose-300 border-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.25)] font-extrabold [html.light_&]:bg-[#ffe4e6] [html.light_&]:text-[#9f1239] [html.light_&]:border-[#f43f5e] [html.light_&]:shadow-sm [html.light_&]:font-black',
  rose:
    'bg-rose-500/25 text-rose-300 border-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.25)] font-extrabold [html.light_&]:bg-[#ffe4e6] [html.light_&]:text-[#9f1239] [html.light_&]:border-[#f43f5e] [html.light_&]:shadow-sm [html.light_&]:font-black',
  error:
    'bg-rose-500/25 text-rose-300 border-rose-400/50 shadow-[0_0_12px_rgba(244,63,94,0.25)] font-extrabold [html.light_&]:bg-[#fee2e2] [html.light_&]:text-[#991b1b] [html.light_&]:border-[#ef4444] [html.light_&]:shadow-sm [html.light_&]:font-black',
  gray:
    'bg-slate-500/25 text-slate-200 border-slate-400/40 font-extrabold [html.light_&]:bg-[#e2e8f0] [html.light_&]:text-[#1e293b] [html.light_&]:border-[#94a3b8] [html.light_&]:shadow-sm [html.light_&]:font-black',
  slate:
    'bg-slate-500/25 text-slate-200 border-slate-400/40 font-extrabold [html.light_&]:bg-[#e2e8f0] [html.light_&]:text-[#1e293b] [html.light_&]:border-[#94a3b8] [html.light_&]:shadow-sm [html.light_&]:font-black',
  neutral:
    'bg-white/20 text-slate-200 border-white/40 font-extrabold [html.light_&]:bg-[#f1f5f9] [html.light_&]:text-[#0f172a] [html.light_&]:border-[#cbd5e1] [html.light_&]:shadow-sm [html.light_&]:font-black',
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
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'green' },
  PARTIALLY_REFUNDED: { label: 'Hoàn một phần', tone: 'green' },
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
    tone = lower.includes('yêu cầu') ? 'purple' : 'green'
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black tracking-wider uppercase whitespace-nowrap shadow-sm backdrop-blur-sm ${toneClasses} ${className}`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-90" />}
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
