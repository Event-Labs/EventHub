import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/**
 * CosmicSelect – Custom high-fidelity dropdown select synced with Dashboard UI:
 * - Rounded-xl trigger button, rounded-2xl floating popover
 * - Full Dark & Light Mode support (#0D1B2A, #C99A47 gold accents)
 * - Immune to clipping & overflow via createPortal
 * - Keyboard navigation (Escape, Enter) & click-outside handling
 */
export function CosmicSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Chọn...',
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  disabled = false,
  minWidth = 'min-w-[160px]',
  label,
  icon: Icon,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const [popupStyle, setPopupStyle] = useState({ left: 0, top: 0, minWidth: 180, maxWidth: 360 })

  // Normalize options to object format: { value, label }
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return { value: opt, label: String(opt) }
    }
    return {
      value: opt.value,
      label: opt.label || opt.name || String(opt.value),
      tone: opt.tone,
      badge: opt.badge,
    }
  })

  const selectedOption = normalizedOptions.find((opt) => String(opt.value) === String(value))

  useEffect(() => {
    if (!isOpen) return undefined

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      const popWidth = Math.max(rect.width, 180)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const estimatedHeight = Math.min(normalizedOptions.length * 40 + 16, 280)

      let top = rect.bottom + 6
      // If not enough room below but enough room above, flip upward
      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        top = Math.max(12, rect.top - estimatedHeight - 6)
      }

      let left = rect.left
      if (left + popWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - popWidth - 16)
      }

      setPopupStyle({
        left,
        top,
        minWidth: rect.width,
        maxWidth: Math.max(popWidth, 320),
      })
    }

    const handlePointerDown = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !popupRef.current?.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    updatePosition()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, normalizedOptions.length])

  const handleSelect = (val) => {
    onChange?.(val)
    setIsOpen(false)
  }

  return (
    <div className={`relative inline-block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-10 items-center justify-between gap-2.5 rounded-xl border px-3 text-left text-sm font-semibold shadow-sm transition outline-none disabled:opacity-50 disabled:cursor-not-allowed ${minWidth} ${
          isOpen
            ? 'border-primary/60 bg-[#0d172e] ring-2 ring-primary/20 text-white [html.light_&]:bg-white [html.light_&]:border-[#C99A47] [html.light_&]:text-[#0D1B2A] [html.light_&]:ring-[#C99A47]/20'
            : 'border-white/15 bg-[#0d172e] text-white hover:border-white/30 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47]'
        } ${buttonClassName}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {Icon && <Icon className="size-4 shrink-0 text-[#E6C17A] [html.light_&]:text-[#C99A47]" />}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>

        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-primary [html.light_&]:text-[#C99A47]' : ''
          }`}
        />
      </button>

      {/* Floating Popover Dropdown (Portal) */}
      {isOpen &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              left: popupStyle.left,
              top: popupStyle.top,
              minWidth: popupStyle.minWidth,
              maxWidth: popupStyle.maxWidth,
            }}
            className={`fixed z-[9999] overflow-hidden rounded-2xl border border-white/20 bg-[#0b1329] p-1.5 text-white shadow-2xl shadow-black/95 backdrop-blur-2xl [html.light_&]:bg-white/98 [html.light_&]:border-[#C99A47]/35 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-xl animate-in fade-in-0 zoom-in-95 duration-100 ${dropdownClassName}`}
          >
            <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-0.5 no-scrollbar">
              {normalizedOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value)

                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-all ${
                      isSelected
                        ? 'border border-[#C99A47]/45 bg-gradient-to-r from-[#C99A47]/20 via-[#E6C17A]/15 to-[#C99A47]/20 font-bold text-[#E6C17A] shadow-sm [html.light_&]:bg-[#FAF4EB] [html.light_&]:border-[#C99A47]/50 [html.light_&]:text-[#0D1B2A]'
                        : 'border border-transparent font-medium text-slate-300 hover:bg-white/10 hover:text-white [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-amber-50/80 [html.light_&]:hover:text-[#0D1B2A]'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-[#E6C17A] [html.light_&]:text-[#C99A47]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

