import {
  CheckCircle2,
  Eye,
  Lock,
  MoreVertical,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'

/**
 * Page – layout wrapper for Admin pages
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
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-black text-white drop-shadow-sm tracking-tight">
            {renderCosmicTitle(title)}
          </h1>
          {description && (
            <p className="mt-1.5 text-[15px] text-slate-400">{description}</p>
          )}
        </div>
        {actions}
        {!actions && action && (
          <button
            type="button"
            className={actionClassName || 'cosmic-btn-primary flex items-center gap-2 px-5 py-2.5 text-sm'}
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
    <div className="glass-panel mb-6 rounded-[32px] border-warning/20 bg-warning/5 p-6 shadow-[0_8px_32px_rgba(245,158,11,0.1)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="glass-panel grid size-9 place-items-center rounded-xl border-warning/30 bg-warning/20 shadow-inner">
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
            className={`glass-panel flex items-center justify-between rounded-[20px] px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
              severity === 'critical'
                ? 'border-error/20 bg-error/10 shadow-[inset_0_0_15px_rgba(239,68,68,0.15)] hover:border-error/40'
                : 'border-warning/20 bg-warning/10 shadow-[inset_0_0_15px_rgba(245,158,11,0.15)] hover:border-warning/40'
            }`}
          >
            <span className="text-sm font-bold uppercase tracking-wider text-slate-300">{label}</span>
            <span
              className={`text-2xl font-black drop-shadow-md ${severity === 'critical' ? 'text-error' : 'text-warning'}`}
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
        <Panel key={label} className="flex flex-col gap-3 group transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(6,182,212,0.15)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-primary transition-colors">
            {label}
          </p>
          <p className="text-3xl font-black text-white drop-shadow-sm">{value}</p>
          {change && (
            <span
              className={`self-start rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                change.toLowerCase().includes('urgent')
                  ? 'border-error/30 bg-error/20 text-error shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                  : 'border-success/30 bg-success/20 text-success shadow-[0_0_10px_rgba(16,185,129,0.2)]'
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
          <p className="mt-1 text-[15px] leading-relaxed text-slate-300 font-medium">{text}</p>
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
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        Lọc theo
      </span>
      {labels.map((label) => (
        <select
          key={label}
          className="h-9 rounded-xl border border-white/10 bg-slate-900/50 px-4 text-[13px] font-medium text-white outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none shadow-inner"
        >
          <option>{label}</option>
        </select>
      ))}
      <button className="ml-auto text-[13px] font-bold text-slate-400 hover:text-primary transition-colors">
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
    <div className="overflow-x-auto glass-panel rounded-[24px] border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-900/40">
          <tr className="border-b border-white/10">
            {headers.map((header) => (
              <th
                key={header}
                className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, index) => (
            <tr
              key={index}
              className="transition-colors hover:bg-white/[0.02]"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-6 ${compact ? 'py-3' : 'py-4'} align-middle text-[14px] text-slate-200`}
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
      <ProfileAvatar
        sources={image}
        name={name}
        alt={name || 'Avatar'}
        className="size-10 ring-2 ring-border-soft/40"
        fallbackClassName="text-sm"
      />
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
    blue: 'bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]',
    purple: 'bg-ai/20 text-ai border-ai/30 shadow-[0_0_10px_rgba(236,72,153,0.15)]',
    green: 'bg-success/20 text-success border-success/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
    red: 'bg-error/20 text-error border-error/30 shadow-[0_0_10px_rgba(239,68,68,0.15)]',
    amber: 'bg-warning/20 text-warning border-warning/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
    gray: 'bg-white/10 text-slate-300 border-white/20',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.15)]',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${tones[tone] || tones.gray} ${className}`}
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
    SUSPENDED: { color: 'text-error', dot: 'bg-error', label: 'Tạm ngưng' },
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
