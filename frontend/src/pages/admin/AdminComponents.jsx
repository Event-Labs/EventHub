import {
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Eye,
  Layers,
  Lock,
  MoreVertical,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'
import { Badge, StatusBadge, resolveStatusConfig } from '@/components/StatusBadge.jsx'
import { TableActionButton } from '@/components/TableActionButton.jsx'

/**
 * Page – layout wrapper for Admin pages
 */
export function Page({
  title,
  description,
  backLink,
  backLabel = 'Quay lại',
  action,
  actionClassName,
  actionIcon: ActionIcon = Plus,
  onAction,
  actions,
  children,
}) {
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {backLink && (
            <Link
              to={backLink}
              className="inline-flex items-center gap-2 text-base font-bold text-white hover:text-white/80 transition-colors w-fit"
            >
              <ArrowLeft className="size-5" />
              <span>{backLabel}</span>
            </Link>
          )}
          {title && (
            <h1 className="font-display text-3xl font-black tracking-tight">
              {renderCosmicTitle(title)}
            </h1>
          )}
        </div>
        {actions}
        {!actions && action && (
          <button
            type="button"
            className={actionClassName || 'admin-primary flex items-center gap-2 px-5 py-2.5 text-sm'}
            onClick={onAction}
          >
            <ActionIcon className="size-4" /> {action}
          </button>
        )}
      </div>
      {children}
    </>
  )
}

/**
 * AttentionSection – "Attention Required" block shown at top of Admin Dashboard
 */
export function AttentionSection({ items }) {
  if (!items?.length) return null
  return (
    <div className="mb-6 rounded-[32px] border border-amber-500/40 bg-[#0f172a] p-6 shadow-xl shadow-amber-500/10 [html.light_&]:border-amber-500/40 [html.light_&]:bg-amber-50/80">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl border border-warning/30 bg-warning/20 shadow-inner">
          <span className="text-sm">⚠️</span>
        </div>
        <p className="text-sm font-black uppercase tracking-widest text-warning">
          Cần xử lý ngay
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, count, severity]) => (
          <div
            key={label}
            className={`flex items-center justify-between rounded-[20px] px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${severity === 'critical'
                ? 'border border-rose-500/40 bg-rose-950/40 hover:border-rose-400'
                : 'border border-amber-500/30 bg-[#16233f] hover:border-amber-400 shadow-md'
              }`}
          >
            <span className="text-sm font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">{label}</span>
            <span
              className={`text-2xl font-black drop-shadow-md ${severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * KpiGrid – KPI metric cards grid (Text và data, không có icon bên)
 */
export function KpiGrid({ items, className = '' }) {
  const gridClass = items.length === 4 ? 'xl:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : 'xl:grid-cols-5'
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${gridClass} ${className}`}>
      {items.map((item) => {
        const [label, value, change, _Icon, _bg, _color, sub] = Array.isArray(item)
          ? item
          : [item.label, item.value, item.change, null, null, null, item.sub]

        const strVal = String(value ?? '')
        const textSize =
          strVal.length > 10
            ? 'text-lg sm:text-xl'
            : strVal.length > 6
            ? 'text-xl sm:text-2xl'
            : 'text-2xl sm:text-3xl'

        return (
          <div
            key={label}
            className="glass-panel flex flex-col justify-between rounded-[24px] border-white/5 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
          >
            <div>
              <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">{label}</p>
              <p className={`mt-2 font-black text-white tracking-tight font-display drop-shadow-sm leading-tight break-words [html.light_&]:text-[#0D1B2A] ${textSize}`}>
                {value}
              </p>
            </div>
            {change ? (
              <div className="mt-3">
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
                    String(change).toLowerCase().includes('urgent')
                      ? 'border-error/30 bg-error/20 text-error'
                      : 'border-success/30 bg-success/20 text-success'
                  }`}
                >
                  {change}
                </span>
              </div>
            ) : sub ? (
              <p className="mt-2 truncate text-[12px] font-medium text-muted">{sub}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Panel – card surface
 */
export function Panel({ children, className = '' }) {
  return (
    <section
      className={`glass-panel rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] ${className}`}
    >
      {children}
    </section>
  )
}

/**
 * Insight – AI callout
 */
export function Insight({ title = 'AI Insight', text }) {
  return (
    <section className="glass-panel rounded-[24px] border-ai/20 bg-ai/10 p-6 shadow-[inset_0_0_20px_rgba(236,72,153,0.15)]">
      <div className="flex gap-5">
        <div className="glass-panel grid size-12 shrink-0 place-items-center rounded-[18px] border-ai/30 bg-ai/20 shadow-inner">
          <Sparkles className="size-6 text-ai drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
        </div>
        <div>
          <h3 className="font-black text-ai text-lg drop-shadow-sm">{title}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-subtle font-medium">{text}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * FilterBar
 */
export function FilterBar({ labels }) {
  return (
    <Panel className="my-5 flex flex-wrap items-center gap-4 py-4 px-6">
      <span className="text-[10px] font-black uppercase tracking-widest text-subtle">
        Lọc theo
      </span>
      {labels.map((label) => (
        <select
          key={label}
          className="h-9 rounded-xl border border-white/10 bg-slate-900/50 px-4 text-[13px] font-medium text-content outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none shadow-inner"
        >
          <option>{label}</option>
        </select>
      ))}
      <button className="ml-auto text-[13px] font-bold text-subtle hover:text-primary transition-colors">
        Xóa bộ lọc
      </button>
    </Panel>
  )
}

/**
 * Table – dark-themed data table
 */
export function Table({ headers, rows, compact = false, tableClassName = 'min-w-[760px]' }) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
      <div className="w-full overflow-x-auto">
        <table className={`w-full text-left text-sm ${tableClassName}`}>
          <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
            <tr>
              {headers.map((header, colIndex) => {
                const isObj = typeof header === 'object' && header !== null
                const label = isObj ? header.label : header
                const isCenter = isObj
                  ? header.align === 'center'
                  : ['Số sự kiện', 'Người đăng ký', 'Thao tác', 'Hành động'].includes(label)

                return (
                  <th
                    key={label || colIndex}
                    className={`px-4 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap last:w-[120px] last:min-w-[120px] ${
                      isCenter ? 'text-center' : ''
                    } ${isObj && header.className ? header.className : ''}`}
                  >
                    {label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-medium text-slate-300">
            {rows.map((row, index) => (
              <tr
                key={index}
                className="transition-colors hover:bg-white/[0.02]"
              >
                {row.map((cell, cellIndex) => {
                  const header = headers[cellIndex]
                  const isObj = typeof header === 'object' && header !== null
                  const label = isObj ? header.label : header
                  const isCenter = isObj
                    ? header.align === 'center'
                    : ['Số sự kiện', 'Người đăng ký', 'Thao tác', 'Hành động'].includes(label)

                  return (
                    <td
                      key={cellIndex}
                      className={`px-4 ${compact ? 'py-2.5' : 'py-3.5'} align-middle text-slate-200 text-sm ${
                        isCenter ? 'text-center' : ''
                      }`}
                    >
                      {isCenter ? (
                        <div className="flex items-center justify-center gap-1.5">{cell}</div>
                      ) : (
                        cell
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * UserCell
 */
export function UserCell({ name, email, image, onClick, className = '' }) {
  return (
    <div
      className={`flex items-center gap-3 ${onClick ? 'cursor-pointer hover:opacity-80 transition' : ''} ${className}`}
      onClick={onClick}
    >
      <ProfileAvatar
        sources={image}
        name={name}
        alt={name || 'Avatar'}
        className="size-10 ring-2 ring-border-soft/40"
        fallbackClassName="text-sm"
      />
      <div className="min-w-0">
        <p className="text-sm font-bold text-content truncate">{name}</p>
        <p className="text-xs text-subtle truncate">{email}</p>
      </div>
    </div>
  )
}

/**
 * AvatarFallback
 */
export function AvatarFallback({ name, className = 'size-10' }) {
  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-full bg-tertiary/15 text-sm font-extrabold text-tertiary ring-2 ring-secondary/20`}
    >
      {getInitials(name)}
    </div>
  )
}

/**
 * ImagePlaceholder
 */
export function ImagePlaceholder({ label, className = 'h-12 w-20' }) {
  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-xl bg-panel-soft text-xs font-bold uppercase text-subtle`}
    >
      {label}
    </div>
  )
}

export { Badge, StatusBadge, resolveStatusConfig }
export { TableActionButton }

/**
 * Status – Unified status badge for Admin portal
 */
export function Status({ value, className = '' }) {
  return <StatusBadge status={value} className={className} />
}

/**
 * Actions
 */
export function Actions({ locked }) {
  return (
    <div className="flex items-center gap-3 text-subtle">
      <Eye className="size-4 cursor-pointer transition hover:text-tertiary" />
      {locked ? (
        <Lock className="size-4 cursor-pointer text-error transition hover:text-error/70" />
      ) : (
        <ShieldCheck className="size-4 cursor-pointer transition hover:text-success" />
      )}
    </div>
  )
}

/**
 * PlanCard
 */
export function PlanCard({ plan, featured }) {
  return (
    <Panel
      className={`relative ${featured ? 'border-primary/50 shadow-[0_0_30px_rgba(6,182,212,0.15)] ring-1 ring-primary/20 bg-slate-900/60' : 'bg-slate-900/40'}`}
    >
      {featured && (
        <span className="absolute right-0 top-0 rounded-bl-[16px] rounded-tr-[24px] bg-primary px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-950 shadow-md">
          Best Seller
        </span>
      )}
      <div className="mb-5 border-b border-white/10 pb-5">
        <div className="flex items-start justify-between">
          <h3 className={`text-2xl font-black ${featured ? 'text-primary drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'text-white'}`}>
            {plan[0]}
          </h3>
          <Badge tone="blue">Active</Badge>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-400">{plan[1]}</p>
      </div>
      <div className="space-y-3 text-sm text-slate-300">
        {[plan[2], plan[3], 'Email Support', '2 Staff Seats'].map((item) => (
          <p key={item} className="flex items-center gap-3">
            <CheckCircle2 className="size-[18px] text-success drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            <span className="font-medium">{item}</span>
          </p>
        ))}
      </div>
      <p className="mt-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Sử dụng</p>
      <p className="mt-1 text-[15px] font-bold text-white">{plan[4]}</p>
      <div className="mt-7 flex items-center gap-2 border-t border-white/10 pt-5">
        <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-bold text-slate-300 transition-all hover:border-primary/50 hover:bg-white/10 hover:text-white">
          Edit
        </button>
        <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-bold text-slate-300 transition-all hover:border-primary/50 hover:bg-white/10 hover:text-white">
          Users
        </button>
        <MoreVertical className="ml-auto size-5 cursor-pointer text-slate-400 hover:text-white transition-colors" />
      </div>
    </Panel>
  )
}

/**
 * Field
 */
export function Field({ label, value, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold text-subtle">{label}</span>
      <input
        className="cosmic-input w-full mt-2"
        defaultValue={value}
      />
    </label>
  )
}

/**
 * Row
 */
export function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between border-b border-border-soft/20 py-2.5 last:border-0">
      <span className="text-sm text-subtle">{label}</span>
      <span className={strong ? 'font-extrabold text-tertiary' : 'font-semibold text-content'}>
        {value}
      </span>
    </div>
  )
}

/**
 * Legend
 */
export function Legend({ rows }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-tertiary" />
            <span className="text-subtle">{label}</span>
          </span>
          <span className="font-semibold text-content">{value}</span>
        </div>
      ))}
    </div>
  )
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'AD'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
