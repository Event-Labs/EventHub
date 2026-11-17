import React, { useState, useRef, useEffect } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { useLanguage } from './LanguageContext.jsx'

export function LanguageSwitcher({ theme = 'dark', className = '' }) {
  const { language, setLanguage, isVietnamese } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const isLight = theme === 'light'

  // Close when clicked outside or on Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelectLanguage = (lang) => {
    setLanguage(lang)
    setIsOpen(false)
  }

  const currentLabel = isVietnamese ? 'VIE' : 'ENG'

  return (
    <div ref={containerRef} className="relative inline-block text-left select-none">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={isVietnamese ? 'Ngôn ngữ: Tiếng Việt (VIE)' : 'Language: English (ENG)'}
        className={`group relative flex items-center justify-between gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-3 text-xs sm:text-sm font-bold tracking-normal transition-all duration-200 cursor-pointer ${
          isLight
            ? 'border-[#C99A47]/45 bg-white/85 text-[#0D1B2A] hover:border-[#C99A47] hover:bg-white hover:shadow-[0_0_12px_rgba(201,154,71,0.25)]'
            : 'border-[#C99A47]/50 bg-[#081126]/85 text-white hover:border-[#E6C17A] hover:bg-[#0c1a3b] hover:text-[#E6C17A] hover:shadow-[0_0_16px_rgba(201,154,71,0.3)]'
        } ${className || 'h-10 min-h-[40px] sm:min-h-[44px]'}`}
      >
        <Globe
          className={`size-4 sm:size-4.5 shrink-0 transition-transform duration-300 group-hover:rotate-45 ${
            isLight ? 'text-[#C99A47]' : 'text-[#E6C17A]'
          }`}
        />
        <span className="whitespace-nowrap font-bold text-xs sm:text-sm tracking-wide leading-tight">
          {currentLabel}
        </span>
        <ChevronDown
          className={`size-3.5 sm:size-4 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          } ${
            isLight
              ? 'text-[#1B365D]/70 group-hover:text-[#0D1B2A]'
              : 'text-slate-400 group-hover:text-[#E6C17A]'
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={isVietnamese ? 'Chọn ngôn ngữ' : 'Select language'}
          className={`absolute right-0 top-full mt-2 w-44 origin-top-right rounded-2xl border p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 ${
            isLight
              ? 'border-[#C99A47]/30 bg-[#FDFBF7]/95 text-[#0D1B2A]'
              : 'border-[#C99A47]/40 bg-[#081126]/95 text-white shadow-[0_10px_30px_rgba(0,0,0,0.6)]'
          }`}
        >
          <button
            type="button"
            role="option"
            aria-selected={isVietnamese}
            onClick={() => handleSelectLanguage('vi')}
            className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              isVietnamese
                ? isLight
                  ? 'bg-[#C99A47]/20 text-[#0D1B2A] font-extrabold'
                  : 'bg-[#C99A47]/25 text-[#E6C17A] font-extrabold'
                : isLight
                ? 'text-[#1B365D] hover:bg-[#C99A47]/10 hover:text-[#0D1B2A]'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>Tiếng Việt</span>
            {isVietnamese && (
              <Check className={`size-4 shrink-0 ${isLight ? 'text-[#C99A47]' : 'text-[#E6C17A]'}`} />
            )}
          </button>

          <button
            type="button"
            role="option"
            aria-selected={!isVietnamese}
            onClick={() => handleSelectLanguage('en')}
            className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              !isVietnamese
                ? isLight
                  ? 'bg-[#C99A47]/20 text-[#0D1B2A] font-extrabold'
                  : 'bg-[#C99A47]/25 text-[#E6C17A] font-extrabold'
                : isLight
                ? 'text-[#1B365D] hover:bg-[#C99A47]/10 hover:text-[#0D1B2A]'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>English</span>
            {!isVietnamese && (
              <Check className={`size-4 shrink-0 ${isLight ? 'text-[#C99A47]' : 'text-[#E6C17A]'}`} />
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
