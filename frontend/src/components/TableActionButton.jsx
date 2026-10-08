import { isValidElement } from 'react'
import { Link } from 'react-router-dom'

export const ACTION_TONES = {
  default:
    'border-white/10 bg-[#1c2747] text-slate-300 hover:border-primary/50 hover:bg-[#25335c] hover:text-primary hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] [html.light_&]:border-[#C99A47]/35 [html.light_&]:bg-white [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F5EBDD] [html.light_&]:hover:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47] [html.light_&]:shadow-sm',
  primary:
    'border-white/10 bg-[#1c2747] text-slate-300 hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-400 hover:shadow-[0_0_10px_rgba(14,165,233,0.2)] [html.light_&]:border-[#C99A47]/50 [html.light_&]:bg-white [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F5EBDD] [html.light_&]:hover:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47] [html.light_&]:shadow-sm',
  success:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/20 hover:text-emerald-300 hover:shadow-[0_0_10px_rgba(16,185,129,0.2)] [html.light_&]:border-emerald-500/40 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700 [html.light_&]:hover:bg-emerald-100',
  danger:
    'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:border-rose-500/60 hover:bg-rose-500/20 hover:text-rose-300 hover:shadow-[0_0_10px_rgba(244,63,94,0.2)] [html.light_&]:border-rose-500/40 [html.light_&]:bg-rose-50 [html.light_&]:text-rose-700 [html.light_&]:hover:bg-rose-100',
  warning:
    'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/20 hover:text-amber-300 hover:shadow-[0_0_10px_rgba(245,158,11,0.2)] [html.light_&]:border-amber-500/40 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700 [html.light_&]:hover:bg-amber-100',
  gray:
    'border-white/10 bg-[#1c2747] text-slate-400 hover:border-white/30 hover:bg-white/5 hover:text-slate-200 [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white [html.light_&]:text-[#536b88] [html.light_&]:hover:bg-[#F5EBDD] [html.light_&]:hover:text-[#0D1B2A]',
}

/**
 * TableActionButton
 * Standardized action button for table rows across Organizer, Admin, Staff portals.
 * Ensures consistent frame, border, size (size-8), icon sizing, hover states and tooltips.
 */
export function TableActionButton({
  icon: Icon,
  title,
  label,
  onClick,
  to,
  disabled = false,
  tone = 'default',
  className = '',
  children,
  ...props
}) {
  const toneClass = ACTION_TONES[tone] || ACTION_TONES.default
  const isIconButton = !label && !children

  const baseClasses = isIconButton
    ? `inline-flex size-8 items-center justify-center rounded-lg border transition-all duration-200 shrink-0 select-none ${toneClass} ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:-translate-y-0.5'
      } ${className}`
    : `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all duration-200 shrink-0 select-none ${toneClass} ${
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:-translate-y-0.5'
      } ${className}`

  const renderIcon = () => {
    if (!Icon) return null
    if (isValidElement(Icon)) {
      return Icon
    }
    const Component = Icon
    return <Component className="size-4 shrink-0" />
  }

  const content = (
    <>
      {renderIcon()}
      {label && <span>{label}</span>}
      {children}
    </>
  )

  if (to && !disabled) {
    return (
      <Link to={to} title={title || label} aria-label={title || label} className={baseClasses} {...props}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      className={baseClasses}
      {...props}
    >
      {content}
    </button>
  )
}
