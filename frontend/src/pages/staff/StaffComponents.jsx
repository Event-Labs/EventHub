import { Search, Sparkles } from 'lucide-react'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'

/**
 * StaffPage – page-level layout wrapper
 */
export function StaffPage({ title, description, action, children, className = '' }) {
  return (
    <div className={className}>
      {(title || description || action) && (
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title && <h1 className="font-display text-2xl font-black text-white drop-shadow-sm tracking-tight">{renderCosmicTitle(title)}</h1>}
            {description && <p className="mt-1.5 text-[15px] text-slate-400">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * StaffPanel – dark-themed card surface
 */
export function StaffPanel({ children, className = '' }) {
  return (
    <section
      className={`glass-panel rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] ${className}`}
    >
      {children}
    </section>
  )
}

/**
 * StaffTable
 */
export function StaffTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto glass-panel rounded-[24px] border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-900/40">
          <tr className="border-b border-white/10">
            {headers.map((h) => (
              <th
                key={h}
                className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, i) => (
            <tr
              key={i}
              className="transition-colors hover:bg-white/[0.02]"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-6 py-4 align-middle text-[14px] text-slate-200">
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
 * StaffSearch
 */
export function StaffSearch({ placeholder = 'Tìm kiếm...' }) {
  return (
    <div className="glass-panel relative flex h-[44px] items-center rounded-full border-white/10 px-4 shadow-inner">
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
    green: 'bg-success/20 text-success border-success/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
    red: 'bg-error/20 text-error border-error/30 shadow-[0_0_10px_rgba(239,68,68,0.15)]',
    yellow: 'bg-warning/20 text-warning border-warning/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
    gray: 'bg-white/10 text-slate-300 border-white/20',
    purple: 'bg-ai/20 text-ai border-ai/30 shadow-[0_0_10px_rgba(236,72,153,0.15)]',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.15)]',
  }
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  )
}

/**
 * Avatar
 */
export function Avatar({ name, className = 'size-9' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className={`${className} grid place-items-center rounded-full bg-tertiary/15 text-sm font-extrabold text-tertiary ring-2 ring-tertiary/20`}
    >
      {initials}
    </span>
  )
}

/**
 * Insight
 */
export function Insight({ children }) {
  return (
    <section className="glass-panel rounded-[24px] border-ai/20 bg-ai/10 p-6 shadow-[inset_0_0_20px_rgba(236,72,153,0.15)]">
      <div className="flex gap-5">
        <div className="glass-panel grid size-12 shrink-0 place-items-center rounded-[18px] border-ai/30 bg-ai/20 shadow-inner">
          <Sparkles className="size-6 text-ai drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
        </div>
        <p className="text-[15px] leading-relaxed text-slate-300 font-medium pt-1">
          <span className="font-black text-ai drop-shadow-sm block text-lg mb-1">Gợi ý AI: </span>
          {children}
        </p>
      </div>
    </section>
  )
}
