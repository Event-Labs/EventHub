import {
  CheckCircle2,
  Eye,
  Lock,
  MoreVertical,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

/**
 * Page – page-level layout wrapper for Admin
 */
export function Page({
  title,
  description,
  action,
  actionClassName,
  actionIcon: ActionIcon = Plus,
  onAction,
  actions,
  children,
}) {
  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-content">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-subtle">{description}</p>
          )}
        </div>
        {actions}
        {!actions && action && (
          <button
            type="button"
            className={actionClassName || 'admin-primary'}
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
    <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/[0.06] p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-lg bg-warning/20">
          <span className="text-sm">⚠️</span>
        </div>
        <p className="text-sm font-extrabold uppercase tracking-wider text-warning">
          Cần xử lý ngay
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, count, severity]) => (
          <div
            key={label}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              severity === 'critical'
                ? 'border-error/30 bg-error/[0.07]'
                : 'border-warning/30 bg-warning/[0.05]'
            }`}
          >
            <span className="text-sm font-semibold text-subtle">{label}</span>
            <span
              className={`text-xl font-extrabold ${severity === 'critical' ? 'text-error' : 'text-warning'}`}
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
 * KpiGrid – KPI metric cards grid
 */
export function KpiGrid({ items }) {
  const gridClass = items.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-5'
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${gridClass}`}>
      {items.map(([label, value, change]) => (
        <Panel key={label} className="flex flex-col gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-subtle">
            {label}
          </p>
          <p className="text-xl font-extrabold text-content tracking-tight">{value}</p>
          {change && (
            <span
              className={`self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                change.toLowerCase().includes('urgent')
                  ? 'bg-error/15 text-error'
                  : 'bg-success/15 text-success'
              }`}
            >
              {change}
            </span>
          )}
        </Panel>
      ))}
    </div>
  )
}

/**
 * Panel – dark-themed card surface
 */
export function Panel({ children, className = '' }) {
  return (
    <section
      className={`rounded-2xl border border-border-soft/40 bg-surface/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm ${className}`}
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
    <section className="rounded-2xl border border-ai/30 bg-ai/[0.07] p-5">
      <div className="flex gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai/15">
          <Sparkles className="size-5 text-ai" />
        </div>
        <div>
          <h3 className="font-bold text-content">{title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-subtle">{text}</p>
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
    <Panel className="my-5 flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">
        Lọc theo
      </span>
      {labels.map((label) => (
        <select
          key={label}
          className="h-9 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
        >
          <option>{label}</option>
        </select>
      ))}
      <button className="ml-auto text-sm font-semibold text-subtle hover:text-tertiary transition">
        Xóa bộ lọc
      </button>
    </Panel>
  )
}

/**
 * Table – dark-themed data table
 */
export function Table({ headers, rows, compact = false }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-soft/30 bg-surface shadow-[0_2px_16px_rgba(0,0,0,0.15)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-border-soft/30">
            {headers.map((header) => (
              <th
                key={header}
                className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-subtle"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-border-soft/20 transition-colors last:border-0 hover:bg-panel-soft/60"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-5 ${compact ? 'py-3' : 'py-4'} align-middle text-content`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
      {image ? (
        <img src={image} alt={name} className="size-10 rounded-full object-cover ring-2 ring-border-soft/40" />
      ) : (
        <AvatarFallback name={name} />
      )}
      <div className="min-w-0">
        <p className="font-bold text-content truncate">{name}</p>
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

/**
 * Badge
 */
export function Badge({ children, tone = 'blue', className = '' }) {
  const tones = {
    blue: 'bg-tertiary/15 text-tertiary border-tertiary/30',
    purple: 'bg-ai/15 text-ai border-ai/30',
    green: 'bg-success/15 text-success border-success/30',
    red: 'bg-error/15 text-error border-error/30',
    amber: 'bg-warning/15 text-warning border-warning/30',
    gray: 'bg-panel-soft text-subtle border-border-soft/30',
    orange: 'bg-tertiary/15 text-tertiary border-tertiary/30',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone] || tones.gray} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Status
 */
export function Status({ value }) {
  const normalized = String(value).toUpperCase()
  const configs = {
    LOCKED: { color: 'text-error', dot: 'bg-error', label: 'Đã khóa' },
    PENDING: { color: 'text-warning', dot: 'bg-warning', label: 'Chờ xử lý' },
    ACTIVE: { color: 'text-success', dot: 'bg-success', label: 'Hoạt động' },
  }

  const config = configs[normalized] || { color: 'text-subtle', dot: 'bg-subtle', label: normalized }

  return (
    <span className={`inline-flex items-center gap-2 text-sm font-bold ${config.color}`}>
      <span className={`size-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
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
      className={`relative ${featured ? 'border-primary/50 shadow-[0_0_30px_rgba(179,205,224,0.12)]' : ''}`}
    >
      {featured && (
        <span className="absolute right-0 top-0 rounded-bl-xl rounded-tr-2xl bg-primary px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-950">
          Best Seller
        </span>
      )}
      <div className="mb-5 border-b border-border-soft/30 pb-5">
        <div className="flex items-start justify-between">
          <h3 className={`text-xl font-extrabold ${featured ? 'text-tertiary' : 'text-content'}`}>
            {plan[0]}
          </h3>
          <Badge tone="blue">Active</Badge>
        </div>
        <p className="mt-1 text-sm font-semibold text-subtle">{plan[1]}</p>
      </div>
      <div className="space-y-3 text-sm text-subtle">
        {[plan[2], plan[3], 'Email Support', '2 Staff Seats'].map((item) => (
          <p key={item} className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            {item}
          </p>
        ))}
      </div>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-wider text-subtle">Sử dụng</p>
      <p className="mt-1 text-sm font-bold text-content">{plan[4]}</p>
      <div className="mt-7 flex items-center gap-2 border-t border-border-soft/30 pt-4">
        <button className="rounded-xl border border-border-soft/40 px-3 py-1.5 text-xs font-bold text-subtle transition hover:border-tertiary hover:text-tertiary">
          Edit
        </button>
        <button className="rounded-xl border border-border-soft/40 px-3 py-1.5 text-xs font-bold text-subtle transition hover:border-tertiary hover:text-tertiary">
          Users
        </button>
        <MoreVertical className="ml-auto size-4 text-subtle" />
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
        className="mt-2 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
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
