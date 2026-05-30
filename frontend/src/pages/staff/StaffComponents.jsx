import { Search, Sparkles } from 'lucide-react'

export function StaffPage({ title, description, action, children }) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-[#111827]">{title}</h1>
          {description && <p className="mt-1 text-sm text-[#434655]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </>
  )
}

export function StaffPanel({ children, className = '' }) {
  return (
    <section className={`rounded-md border border-[#c3c6d7] bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  )
}

export function StaffTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#c3c6d7] bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#f2f4f6] text-xs uppercase text-[#5c647a]">
          <tr>{headers.map((h) => <th key={h} className="px-5 py-4 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[#e0e3e5]">
              {row.map((cell, j) => <td key={j} className="px-5 py-4 align-middle">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StaffSearch({ placeholder = 'Tìm kiếm...' }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
      <input className="h-10 w-full rounded-md border border-[#c3c6d7] bg-[#f7f9fb] pl-10 pr-3 text-sm outline-none focus:border-primary" placeholder={placeholder} />
    </div>
  )
}

export function Badge({ children, tone = 'blue' }) {
  const tones = {
    blue: 'bg-[#dbe1ff] text-[#003ea8]',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-amber-100 text-amber-700',
    gray: 'bg-[#eceef0] text-[#565e74]',
    purple: 'bg-[#eaddff] text-[#5a00c6]',
  }
  return <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${tones[tone]}`}>{children}</span>
}

export function Avatar({ name, className = 'size-9' }) {
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return <span className={`${className} grid place-items-center rounded-full bg-primary text-sm font-extrabold text-slate-950`}>{initials}</span>
}

export function Insight({ children }) {
  return (
    <section className="rounded-md border-l-4 border-ai bg-ai/10 p-5">
      <div className="flex gap-3">
        <Sparkles className="mt-0.5 size-5 text-ai" />
        <p className="text-sm leading-6 text-[#434655]"><span className="font-bold text-ai">AI Insight: </span>{children}</p>
      </div>
    </section>
  )
}
