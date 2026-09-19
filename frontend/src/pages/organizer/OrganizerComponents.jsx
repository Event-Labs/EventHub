import { isValidElement, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Sparkles } from 'lucide-react'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'

/**
 * OrganizerPage – page-level layout wrapper
 */
export function OrganizerPage({ title, description, action, actionTo, onAction, children }) {
  const actionIsElement = isValidElement(action)

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-black text-white drop-shadow-sm tracking-tight">
            {renderCosmicTitle(title)}
          </h1>
          {description && <p className="mt-1.5 text-[15px] text-slate-400">{description}</p>}
        </div>
        {actionIsElement && action}
        {!actionIsElement && action && actionTo && (
          <Link to={actionTo} className="org-btn-primary">
            <Plus className="size-4" />
            {action}
          </Link>
        )}
        {!actionIsElement && action && !actionTo && (
          <button type="button" className="org-btn-primary" onClick={onAction}>
            <Plus className="size-4" />
            {action}
          </button>
        )}
      </div>
      {children}
    </>
  )
}

/**
 * OrganizerPanel – floating card surface
 */
export function OrganizerPanel({ children, className = '' }) {
  return (
    <section
      className={`glass-panel rounded-[24px] border-white/5 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.2)] ${className}`}
    >
      {children}
    </section>
  )
}

/**
 * OrganizerTable
 */
export function OrganizerTable({ headers, rows }) {
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
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="transition-colors hover:bg-white/[0.02]"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-6 py-4 align-middle text-[14px] text-slate-200">
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
 * SearchBar
 */
export function SearchBar({ placeholder = 'Search...' }) {
  return (
    <div className="glass-panel relative flex h-[44px] flex-1 items-center rounded-full border-white/10 px-4 shadow-inner">
      <Search className="size-5 shrink-0 text-slate-400" />
      <input
        className="ml-3 w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-slate-500"
        placeholder={placeholder}
      />
    </div>
  )
}

/**
 * Badge
 */
export function Badge({ children, tone = 'blue' }) {
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
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${tones[tone] || tones.gray}`}
    >
      {children}
    </span>
  )
}

/**
 * Insight – AI callout block
 */
export function Insight({ children, title = 'AI Insights' }) {
  return (
    <section className="glass-panel rounded-[24px] border-ai/20 bg-ai/10 p-6 shadow-[inset_0_0_20px_rgba(236,72,153,0.15)]">
      <div className="flex gap-5">
        <div className="glass-panel grid size-12 shrink-0 place-items-center rounded-[18px] border-ai/30 bg-ai/20 shadow-inner">
          <Sparkles className="size-6 text-ai drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
        </div>
        <div>
          <p className="font-black text-ai text-lg drop-shadow-sm">{title}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-300 font-medium">{children}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * AvatarInitials – renders a real avatar image when `src` is provided,
 * falls back to coloured initials when the image is absent or broken.
 */
export function AvatarInitials({ name, src, className = 'size-9' }) {
  const [imgError, setImgError] = useState(false)

  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className={`${className} shrink-0 rounded-full object-cover`}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full bg-tertiary text-sm font-extrabold text-white`}
    >
      {initials || 'EH'}
    </span>
  )
}

/**
 * StatCard – dark-themed KPI metric card
 */
export function StatCard({ icon: Icon, label, value, sub, trend, accentColor = 'text-tertiary', accentBg = 'bg-tertiary/15' }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border-soft/40 bg-surface/80 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.18)]">
      <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${accentBg}`}>
        <Icon className={`size-5 ${accentColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
        <p className="mt-1 text-xl font-extrabold text-content tracking-tight">{value}</p>
        {sub && (
          <p className="mt-0.5 text-xs text-muted truncate">{sub}</p>
        )}
      </div>
      {trend !== undefined && (
        <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${trend >= 0 ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </div>
      )}
    </div>
  )
}

/**
 * ConfirmModal – custom modal pop-up for confirmation (replaces browser native window.confirm)
 */
export function ConfirmModal({ open, title = 'Xác nhận hành động', message, confirmText = 'Xác nhận', cancelText = 'Hủy', tone = 'danger', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/40 bg-surface p-6 shadow-2xl transition-all">
        <h3 className="text-lg font-bold text-content">{title}</h3>
        <p className="mt-2 text-sm text-subtle leading-relaxed">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border-soft/40 px-4 py-2 text-sm font-semibold text-content hover:bg-panel-soft transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              tone === 'danger'
                ? 'bg-error text-white hover:bg-error/90 shadow-sm'
                : 'bg-primary text-white hover:bg-primary/90 shadow-sm'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
