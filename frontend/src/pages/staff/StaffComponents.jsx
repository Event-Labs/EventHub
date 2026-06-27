import { Search, Sparkles } from 'lucide-react'

/**
 * StaffPage – page-level layout wrapper
 */
export function StaffPage({ title, description, action, children }) {
  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-content tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-subtle">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </>
  )
}

/**
 * StaffPanel – dark-themed card surface
 */
export function StaffPanel({ children, className = '' }) {
  return (
    <section
      className={`rounded-2xl border border-border-soft/40 bg-surface/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm ${className}`}
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
    <div className="overflow-x-auto rounded-2xl border border-border-soft/30 bg-surface shadow-[0_2px_16px_rgba(0,0,0,0.15)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-border-soft/30">
            {headers.map((h) => (
              <th
                key={h}
                className="px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-wider text-subtle"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border-soft/20 transition-colors last:border-0 hover:bg-panel-soft/60"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-5 py-3.5 align-middle text-content">
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
    <div className="relative">
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
    blue: 'bg-tertiary/15 text-tertiary border-tertiary/30',
    green: 'bg-success/15 text-success border-success/30',
    red: 'bg-error/15 text-error border-error/30',
    yellow: 'bg-warning/15 text-warning border-warning/30',
    gray: 'bg-panel-soft text-subtle border-border-soft/30',
    purple: 'bg-ai/15 text-ai border-ai/30',
    orange: 'bg-tertiary/15 text-tertiary border-tertiary/30',
  }
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${tones[tone] || tones.gray}`}>
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
    <section className="rounded-2xl border border-ai/30 bg-ai/[0.07] p-5">
      <div className="flex gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai/15">
          <Sparkles className="size-4 text-ai" />
        </div>
        <p className="text-sm leading-6 text-subtle">
          <span className="font-bold text-ai">AI Insight: </span>
          {children}
        </p>
      </div>
    </section>
  )
}
