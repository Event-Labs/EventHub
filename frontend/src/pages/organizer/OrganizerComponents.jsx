import { isValidElement } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Search, Sparkles } from 'lucide-react'

export function OrganizerPage({ title, eyebrow, description, action, actionTo, onAction, children }) {
  const actionIsElement = isValidElement(action)

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#737686]">
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
          <h1 className="font-display text-3xl font-extrabold text-[#111827]">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-[#434655]">{description}</p>}
        </div>
        {actionIsElement && action}
        {!actionIsElement && action && actionTo && (
          <Link to={actionTo} className="admin-primary">
            <Plus className="size-4" />
            {action}
          </Link>
        )}
        {!actionIsElement && action && !actionTo && (
          <button type="button" className="admin-primary" onClick={onAction}>
            <Plus className="size-4" />
            {action}
          </button>
        )}
      </div>
      {children}
    </>
  )
}

export function OrganizerPanel({ children, className = '' }) {
  return (
    <section
      className={`rounded-md border border-[#c3c6d7] bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </section>
  )
}

export function OrganizerTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#c3c6d7] bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#f2f4f6] text-xs uppercase text-[#5c647a]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-5 py-4 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-[#e0e3e5]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-5 py-4 align-middle text-[#191c1e]">
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

export function SearchBar({ placeholder = 'Search...' }) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
      <input
        className="h-10 w-full rounded-md border border-[#c3c6d7] bg-[#f7f9fb] pl-10 pr-3 text-sm text-[#191c1e] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder={placeholder}
      />
    </div>
  )
}

export function Badge({ children, tone = 'blue' }) {
  const tones = {
    blue: 'bg-[#dbe1ff] text-[#003ea8]',
    purple: 'bg-[#eaddff] text-[#5a00c6]',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-[#eceef0] text-[#565e74]',
  }

  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Insight({ children, title = 'AI Insights' }) {
  return (
    <section className="rounded-md border-l-4 border-ai bg-ai/10 p-5">
      <div className="flex gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-ai" />
        <div>
          <p className="text-xs font-extrabold uppercase text-ai">{title}</p>
          <p className="mt-2 text-sm leading-6 text-[#434655]">{children}</p>
        </div>
      </div>
    </section>
  )
}

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
      className={`${className} grid shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-slate-950`}
    >
      {initials || 'EH'}
    </span>
  )
}
