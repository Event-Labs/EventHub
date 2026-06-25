import { isValidElement } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Search, Sparkles } from 'lucide-react'

/**
 * OrganizerPage – page-level layout wrapper
 */
export function OrganizerPage({ title, eyebrow, description, action, actionTo, onAction, children }) {
  const actionIsElement = isValidElement(action)

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-subtle">
              {eyebrow.split('/').map((item, index, items) => (
                <span key={`${item}-${index}`} className="flex items-center gap-2">
                  <span className={index === items.length - 1 ? 'text-primary' : ''}>
                    {item.trim()}
                  </span>
                  {index < items.length - 1 && <ChevronRight className="size-3" />}
                </span>
              ))}
            </div>
          )}
          <h1 className="font-display text-2xl font-extrabold text-content tracking-tight">
            {title}
          </h1>
          {description && <p className="mt-1.5 text-sm text-subtle">{description}</p>}
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
      className={`rounded-2xl border border-border-soft/40 bg-surface/80 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)] backdrop-blur-sm ${className}`}
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
    <div className="overflow-x-auto rounded-xl border border-border-soft/30 bg-surface">
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
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border-soft/20 transition-colors last:border-0 hover:bg-panel-soft/60"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-5 py-3.5 align-middle text-content">
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
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <input
        className="h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft pl-10 pr-3 text-sm text-content outline-none placeholder:text-subtle transition focus:border-primary focus:ring-2 focus:ring-primary/15"
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
    blue: 'bg-secondary/20 text-primary border-secondary/30',
    purple: 'bg-ai/15 text-ai border-ai/30',
    green: 'bg-success/15 text-success border-success/30',
    red: 'bg-error/15 text-error border-error/30',
    amber: 'bg-warning/15 text-warning border-warning/30',
    gray: 'bg-panel-soft text-subtle border-border-soft/30',
    orange: 'bg-tertiary/15 text-tertiary border-tertiary/30',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tones[tone] || tones.gray}`}
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
    <section className="rounded-2xl border border-ai/30 bg-ai/[0.07] p-5">
      <div className="flex gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai/15">
          <Sparkles className="size-4 text-ai" />
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-ai">{title}</p>
          <p className="mt-2 text-sm leading-6 text-subtle">{children}</p>
        </div>
      </div>
    </section>
  )
}

/**
 * AvatarInitials
 */
export function AvatarInitials({ name, className = 'size-9' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full bg-secondary text-sm font-extrabold text-white`}
    >
      {initials || 'EH'}
    </span>
  )
}

/**
 * StatCard – dark-themed KPI metric card
 */
export function StatCard({ icon: Icon, label, value, sub, trend, accentColor = 'text-primary', accentBg = 'bg-secondary/20' }) {
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
