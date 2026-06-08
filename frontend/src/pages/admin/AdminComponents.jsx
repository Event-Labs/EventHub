import {
  CheckCircle2,
  Eye,
  Lock,
  MoreVertical,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export function Page({
  title,
  description,
  action,
  actionClassName = 'admin-primary',
  actionIcon: ActionIcon = Plus,
  onAction,
  actions,
  children,
}) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold text-primary">
            {description?.includes('/') ? description : 'Admin Portal'}
          </p>
          <h2 className="mt-1 font-display text-3xl font-extrabold tracking-normal text-[#111827]">
            {title}
          </h2>
          {!description?.includes('/') && (
            <p className="mt-1 text-sm text-[#434655]">{description}</p>
          )}
        </div>
        {actions}
        {!actions && action && (
          <button type="button" className={actionClassName} onClick={onAction}>
            <ActionIcon className="size-4" /> {action}
          </button>
        )}
      </div>
      {children}
    </>
  )
}

export function KpiGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map(([label, value, change]) => (
        <Panel key={label} className="min-h-24 border-l-4 border-l-primary">
          <p className="text-xs font-black uppercase tracking-wider text-[#434655]">{label}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-[#111827]">{value}</p>
            {change && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                  change.toLowerCase().includes('urgent')
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {change}
              </span>
            )}
          </div>
        </Panel>
      ))}
    </div>
  )
}

export function Panel({ children, className = '' }) {
  return (
    <section
      className={`rounded-md border border-[#c3c6d7] bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </section>
  )
}

export function Insight({ title = 'AI Insight', text }) {
  return (
    <section className="mt-6 rounded-md border border-[#8343f4] bg-white p-5">
      <div className="flex gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#eaddff] text-[#6a1edb]">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#434655]">{text}</p>
        </div>
      </div>
    </section>
  )
}

export function FilterBar({ labels }) {
  return (
    <Panel className="my-5 flex flex-wrap items-center gap-3">
      <span className="text-xs font-bold uppercase text-[#737686]">
        Filter by role
      </span>
      {labels.map((label) => (
        <select
          key={label}
          className="h-9 rounded border border-[#c3c6d7] bg-white px-3 text-sm text-[#191c1e]"
        >
          <option>{label}</option>
        </select>
      ))}
      <button className="ml-auto text-sm font-semibold text-[#434655] hover:text-primary">
        Reset Filters
      </button>
    </Panel>
  )
}

export function Table({ headers, rows, compact = false }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#c3c6d7] bg-white shadow-sm">
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
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-t border-[#e0e3e5] transition-colors hover:bg-[#f7f9fb]"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-5 ${compact ? 'py-3' : 'py-4'} align-middle text-[#191c1e]`}
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

export function UserCell({ name, email, image, onClick, className = '' }) {
  return (
    <div 
      className={`flex items-center gap-3 ${onClick ? 'cursor-pointer hover:opacity-80 transition' : ''} ${className}`}
      onClick={onClick}
    >
      {image ? (
        <img src={image} alt={name} className="size-10 rounded-full object-cover border border-[#e0e3e5]" />
      ) : (
        <AvatarFallback name={name} />
      )}
      <div className="min-w-0">
        <p className="font-bold text-[#191c1e] truncate">{name}</p>
        <p className="text-xs text-[#737686] truncate">{email}</p>
      </div>
    </div>
  )
}

export function AvatarFallback({ name, className = 'size-10' }) {
  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-full bg-[#dbe1ff] text-sm font-extrabold text-[#003ea8] border border-[#dbe1ff]`}
    >
      {getInitials(name)}
    </div>
  )
}

export function ImagePlaceholder({ label, className = 'h-12 w-20' }) {
  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-full bg-[#e0e3e5] text-xs font-bold uppercase text-[#5c647a]`}
    >
      {label}
    </div>
  )
}

export function Badge({ children, tone = 'blue', className = '' }) {
  const tones = {
    blue: 'bg-[#dbe1ff] text-[#003ea8]',
    purple: 'bg-[#eaddff] text-[#5a00c6]',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-[#f2f4f6] text-[#737686]',
  }

  return (
    <span
      className={`inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Status({ value }) {
  const normalized = String(value).toUpperCase();
  const configs = {
    LOCKED: { color: 'text-[#ba1a1a]', label: 'Locked' },
    PENDING: { color: 'text-[#6a1edb]', label: 'Pending' },
    ACTIVE: { color: 'text-[#008a3d]', label: 'Active' },
  }

  const config = configs[normalized] || { color: 'text-[#737686]', label: normalized };

  return (
    <span className={`inline-flex items-center gap-2 text-sm font-bold ${config.color}`}>
      <span className="size-2 rounded-full bg-current" />
      {config.label}
    </span>
  )
}

export function Actions({ locked }) {
  return (
    <div className="flex items-center gap-3 text-[#434655]">
      <Eye className="size-4" />
      {locked ? (
        <Lock className="size-4 text-[#ba1a1a]" />
      ) : (
        <ShieldCheck className="size-4" />
      )}
    </div>
  )
}

export function PlanCard({ plan, featured }) {
  return (
    <Panel
      className={`relative ${
        featured ? 'border-primary shadow-[0_12px_30px_rgba(56,189,248,0.18)]' : ''
      }`}
    >
      {featured && (
        <span className="absolute right-0 top-0 rounded-bl bg-primary px-3 py-1 text-xs font-bold uppercase text-slate-950">
          Best Seller
        </span>
      )}
      <div className="mb-5 border-b border-[#e0e3e5] pb-5">
        <div className="flex items-start justify-between">
          <h3 className={`text-xl font-extrabold ${featured ? 'text-primary' : 'text-[#191c1e]'}`}>
            {plan[0]}
          </h3>
          <Badge tone="blue">Active</Badge>
        </div>
        <p className="mt-1 text-sm font-semibold text-[#434655]">{plan[1]}</p>
      </div>
      <div className="space-y-3 text-sm text-[#434655]">
        {[plan[2], plan[3], 'Email Support', '2 Staff Seats'].map((item) => (
          <p key={item} className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            {item}
          </p>
        ))}
      </div>
      <p className="mt-6 text-xs font-bold uppercase text-[#737686]">Usage</p>
      <p className="mt-1 text-sm font-bold">{plan[4]}</p>
      <div className="mt-7 flex items-center gap-2 border-t border-[#e0e3e5] pt-4">
        <button className="admin-secondary py-2 text-xs">Edit</button>
        <button className="admin-secondary py-2 text-xs">Users</button>
        <MoreVertical className="ml-auto size-4 text-[#737686]" />
      </div>
    </Panel>
  )
}

export function Field({ label, value, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 text-sm font-semibold text-[#191c1e] outline-none focus:border-primary"
        defaultValue={value}
      />
    </label>
  )
}

export function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between border-b border-white/60 py-2 last:border-0">
      <span className="text-[#5c647a]">{label}</span>
      <span className={strong ? 'font-extrabold text-primary' : 'font-semibold'}>
        {value}
      </span>
    </div>
  )
}

export function Legend({ rows }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" />
            {label}
          </span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
    </div>
  )
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'AD'

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
