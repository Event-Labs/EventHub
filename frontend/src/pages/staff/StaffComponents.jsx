import { Search, Sparkles } from 'lucide-react'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'

/**
 * StaffPage – page-level layout wrapper
 */
export function StaffPage({ title, description, action, children, className = '' }) {
  return (
    <div className={className}>
      {(title || action) && (
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title && <h1 className="font-display text-3xl font-black tracking-tight">{renderCosmicTitle(title)}</h1>}
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
    <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-medium text-slate-300">
            {rows.map((row, i) => (
              <tr
                key={i}
                className="transition-colors hover:bg-white/[0.02]"
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3.5 align-middle text-slate-200">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * StaffSearch
 */
export function StaffSearch({ placeholder = 'Tìm kiếm...' }) {
  return (
    <div className="glass-panel relative flex h-[44px] items-center rounded-full border-white/10 px-4 shadow-inner">
      <Search className="size-5 shrink-0 text-subtle" />
      <input
        className="ml-3 w-full bg-transparent text-[15px] font-normal text-content outline-none placeholder:text-muted"
        placeholder={placeholder}
      />
    </div>
  )
}

export { Badge, StatusBadge, resolveStatusConfig } from '@/components/StatusBadge.jsx'
export { TableActionButton } from '@/components/TableActionButton.jsx'

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
        <p className="text-[15px] leading-relaxed text-subtle font-medium pt-1">
          <span className="font-black text-ai drop-shadow-sm block text-lg mb-1">Gợi ý AI: </span>
          {children}
        </p>
      </div>
    </section>
  )
}
