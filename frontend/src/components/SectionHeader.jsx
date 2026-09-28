import { renderCosmicTitle } from '@/lib/formatTitle.jsx'

export function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-3xl font-black tracking-tight">
          {renderCosmicTitle(title)}
        </h2>
        {description && <p className="mt-2 text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}
