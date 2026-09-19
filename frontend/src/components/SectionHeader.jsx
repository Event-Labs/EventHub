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
        <h2 className="font-display text-2xl font-black text-white md:text-3xl drop-shadow-sm">
          {renderCosmicTitle(title)}
        </h2>
        {description && <p className="mt-2 text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}
