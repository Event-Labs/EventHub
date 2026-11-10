import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar,
  Check,
  ChevronDown,
  Layers,
  Search,
  X,
} from 'lucide-react'
import { getEventOperationalStatus } from './eventStatusUtil.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { getCategoryName } from '@/i18n/categoryNames.js'
import { VI_TO_EN, translatePhrase } from '@/i18n/phraseDictionary.js'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function fmtEventDate(iso) {
  const isEn = getAutoLocale() === 'en-US'
  if (!iso) return isEn ? 'Date TBD' : 'Chưa định ngày'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return isEn ? 'Date TBD' : 'Chưa định ngày'
    return d.toLocaleDateString(getAutoLocale(), {
      day: '2-digit',
      month: isEn ? 'short' : '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OrganizerEventPicker({
  events = [],
  selectedEventId = '',
  onSelectEvent,
  loading = false,
  className = '',
  label = 'Phạm vi sự kiện',
  allowAll = true,
  placeholder = 'Chọn sự kiện...',
  showCalendarIcon = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('ALL')
  const [popupStyle, setPopupStyle] = useState(null)

  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const inputRef = useRef(null)

  const calculatePopupPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return null

    const width = Math.min(520, Math.max(rect.width, 360), window.innerWidth - 32)
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 100)

    return { left, top, width }
  }, [])

  // Position calculation and outside click handler
  useLayoutEffect(() => {
    if (!isOpen) return undefined

    const updatePopupPosition = () => {
      const pos = calculatePopupPosition()
      if (pos) setPopupStyle(pos)
    }

    updatePopupPosition()

    const handlePointerDown = (event) => {
      const target = event.target
      if (
        !containerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePopupPosition)
    window.addEventListener('scroll', updatePopupPosition, true)

    setTimeout(() => inputRef.current?.focus(), 60)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePopupPosition)
      window.removeEventListener('scroll', updatePopupPosition, true)
    }
  }, [calculatePopupPosition, isOpen])

  const handleToggle = () => {
    if (loading) return
    if (!isOpen) {
      const pos = calculatePopupPosition()
      if (pos) setPopupStyle(pos)
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }

  // Augment events with computed operational status
  const enrichedEvents = useMemo(() => {
    return events.map((ev) => ({
      ...ev,
      _opStatus: getEventOperationalStatus(ev),
    }))
  }, [events])

  // Counts by tab
  const counts = useMemo(() => {
    const res = { ALL: enrichedEvents.length, RUNNING: 0, UPCOMING: 0, ENDED: 0, DRAFT: 0 }
    enrichedEvents.forEach((ev) => {
      const g = ev._opStatus.group || 'UPCOMING'
      if (res[g] !== undefined) res[g] += 1
    })
    return res
  }, [enrichedEvents])

  // Filtered list based on search and active tab
  const filteredEvents = useMemo(() => {
    return enrichedEvents.filter((ev) => {
      // Tab filter
      if (activeTab !== 'ALL') {
        if (ev._opStatus.group !== activeTab) return false
      }
      // Search filter
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const title = (ev.title || '').toLowerCase()
      const enTitle = (translatePhrase(ev.title, 'en') || '').toLowerCase()
      const cat = (ev.category_name || '').toLowerCase()
      return title.includes(q) || enTitle.includes(q) || cat.includes(q)
    })
  }, [enrichedEvents, activeTab, searchQuery])

  // Currently selected event object
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null
    return enrichedEvents.find((e) => e.id === selectedEventId) || null
  }, [enrichedEvents, selectedEventId])

  const selectedStatus = selectedEvent ? selectedEvent._opStatus : null

  const handleSelect = (id) => {
    onSelectEvent(id)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onSelectEvent('')
    setSearchQuery('')
  }

  const { isEnglish, t } = useLanguage()

  const tabs = useMemo(() => {
    const list = [
      { key: 'ALL', label: isEnglish ? 'All' : 'Tất cả', count: counts.ALL },
      { key: 'RUNNING', label: isEnglish ? 'Happening Now' : 'Đang diễn ra', count: counts.RUNNING, isLive: true },
      { key: 'UPCOMING', label: isEnglish ? 'Upcoming' : 'Sắp tới', count: counts.UPCOMING },
      { key: 'ENDED', label: isEnglish ? 'Ended' : 'Đã kết thúc', count: counts.ENDED },
    ]
    if (counts.DRAFT > 0) {
      list.push({ key: 'DRAFT', label: isEnglish ? 'Draft & Pending' : 'Bản nháp & Chờ duyệt', count: counts.DRAFT })
    }
    return list
  }, [counts, isEnglish])

  const displayLabel = label === 'Phạm vi sự kiện' ? (isEnglish ? 'Event Scope' : 'Phạm vi sự kiện') : (isEnglish && VI_TO_EN[label] ? VI_TO_EN[label] : label)
  const displayPlaceholder = placeholder === 'Chọn sự kiện...' ? (isEnglish ? 'Select event...' : 'Chọn sự kiện...') : placeholder

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {displayLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="block text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">{displayLabel}</span>
        </div>
      )}

      {/* Trigger Button - Height 10 to match DateRangeFilter */}
      <button
        ref={triggerRef}
        type="button"
        disabled={loading}
        onClick={handleToggle}
        className={`mt-1 flex h-10 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left text-sm font-semibold text-white shadow-sm transition outline-none ${
          isOpen
            ? 'border-primary/60 bg-[#0d172e] ring-2 ring-primary/20 [html.light_&]:bg-white [html.light_&]:border-[#C99A47] [html.light_&]:text-[#0D1B2A] [html.light_&]:ring-[#C99A47]/20'
            : 'border-white/15 bg-[#0d172e] hover:border-white/30 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47]'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {selectedEvent ? (
            <>
              {showCalendarIcon ? (
                <Calendar className="size-4 shrink-0 text-cyan-400" />
              ) : null}
              <span className="truncate font-bold text-white [html.light_&]:text-[#0D1B2A]">
                {isEnglish ? (translatePhrase(selectedEvent.title, 'en') || selectedEvent.title) : selectedEvent.title}
              </span>
              <span
                className={`hidden shrink-0 whitespace-nowrap items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold sm:inline-flex ${selectedStatus?.badgeClass}`}
              >
                <span className={`size-1.5 rounded-full ${selectedStatus?.dotClass}`} />
                {isEnglish ? (VI_TO_EN[selectedStatus?.label] || selectedStatus?.label) : selectedStatus?.label}
              </span>
            </>
          ) : allowAll ? (
            <>
              <div className="grid size-5 shrink-0 place-items-center rounded-md bg-cyan-500/10 text-cyan-400">
                <Layers className="size-3.5" />
              </div>
              <span className="truncate font-bold text-white [html.light_&]:text-[#0D1B2A]">
                {isEnglish ? 'All Events' : 'Tất cả sự kiện'} <span className="text-xs font-normal text-slate-400 [html.light_&]:text-[#536b88]">({events.length})</span>
              </span>
              <span className="hidden shrink-0 whitespace-nowrap items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-300 [html.light_&]:bg-cyan-50 [html.light_&]:text-cyan-800 [html.light_&]:border-cyan-300 sm:inline-flex">
                <span className="size-1.5 rounded-full bg-cyan-400 [html.light_&]:bg-cyan-600" />
                {isEnglish ? 'Overview' : 'Tổng quan'}
              </span>
            </>
          ) : (
            <>
              <Calendar className="size-4 shrink-0 text-slate-400 [html.light_&]:text-slate-500" />
              <span className="truncate font-semibold text-slate-400 [html.light_&]:text-slate-500">
                {displayPlaceholder}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ChevronDown
            className={`size-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-primary' : 'group-hover:text-slate-200'
            }`}
          />
        </div>
      </button>

      {/* Floating Dropdown Popover using createPortal (immune to z-index clipping) */}
      {isOpen && popupStyle &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              left: popupStyle.left,
              top: popupStyle.top,
              width: popupStyle.width,
            }}
            className="fixed z-[9999] max-h-[min(540px,calc(100vh-2rem))] overflow-hidden rounded-2xl border border-white/20 bg-[#0b1329] p-3 text-white shadow-2xl shadow-black/95 backdrop-blur-2xl [html.light_&]:bg-white/98 [html.light_&]:border-[#C99A47]/35 [html.light_&]:text-[#0D1B2A] [html.light_&]:shadow-xl"
          >
            {/* Search Box */}
            <div className="relative mb-2.5">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEnglish ? 'Search events by name or category...' : 'Tìm kiếm sự kiện theo tên hoặc thể loại...'}
                className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 pl-9 pr-8 text-xs font-medium text-white placeholder-slate-500 outline-none transition focus:border-[#E6C17A] focus:ring-1 focus:ring-[#C99A47]/40 [html.light_&]:bg-[#F8F3EA] [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-[#0D1B2A] [html.light_&]:placeholder-[#536b88]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Segmented Status Tabs */}
            <div className="mb-2.5 flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold no-scrollbar">
              {tabs.map((tab) => {
                const active = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition-all ${
                      active
                        ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-extrabold shadow-sm ring-1 ring-[#E6C17A]/60'
                        : 'bg-white/5 text-slate-300 hover:bg-[#C99A47]/15 hover:text-[#E6C17A] [html.light_&]:bg-[#FAF4EB] [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F5EBDD] [html.light_&]:hover:text-[#0D1B2A]'
                    }`}
                  >
                    {tab.isLive && (
                      <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                      <span>{tab.label}</span>
                      <span className={`text-[11px] ${active ? 'text-[#0D1B2A]/85 font-bold' : 'text-slate-400 [html.light_&]:text-[#536b88] font-normal'}`}>
                        ({tab.count})
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* List Container */}
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {/* Status Header / Reset to All Option */}
              {allowAll &&
                (selectedEventId ? (
                  <button
                    type="button"
                    onClick={() => handleSelect('')}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border border-[#C99A47]/40 bg-gradient-to-r from-[#C99A47]/15 to-[#E6C17A]/10 px-3 py-2 text-left text-xs font-bold text-[#E6C17A] transition hover:from-[#C99A47]/25 hover:to-[#E6C17A]/20 [html.light_&]:bg-[#F8F3EA] [html.light_&]:border-[#C99A47]/45 [html.light_&]:text-[#1B365D]"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="size-3.5 text-[#E6C17A] [html.light_&]:text-[#C99A47]" />
                      <span>{isEnglish ? 'Select all events' : 'Chọn lại tất cả sự kiện'}</span>
                    </span>
                    <span className="text-[11px] font-normal opacity-80">({events.length} {isEnglish ? 'events' : 'sự kiện'})</span>
                  </button>
                ) : (
                  <div className="mb-2 flex items-center justify-between rounded-xl border border-[#C99A47]/40 bg-gradient-to-r from-[#C99A47]/20 via-[#E6C17A]/15 to-[#C99A47]/20 px-3 py-1.5 text-xs font-bold text-[#E6C17A] shadow-sm [html.light_&]:bg-[#FAF4EB] [html.light_&]:border-[#C99A47]/50 [html.light_&]:text-[#0D1B2A]">
                    <span className="flex items-center gap-2">
                      <Check className="size-3.5 text-[#E6C17A] [html.light_&]:text-[#C99A47]" />
                      <span>{isEnglish ? 'Selected: All Events' : 'Đang chọn: Tất cả sự kiện'}</span>
                    </span>
                    <span className="text-[11px] font-normal text-[#FFF6DC] [html.light_&]:text-[#536b88]">({events.length} {isEnglish ? 'events' : 'sự kiện'})</span>
                  </div>
                ))}

              {/* Events List */}
              {filteredEvents.map((ev) => {
                const isSelected = ev.id === selectedEventId
                const op = ev._opStatus

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => handleSelect(ev.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-[#C99A47]/60 bg-[#C99A47]/15 shadow-sm ring-1 ring-[#E6C17A]/40'
                        : 'border-white/5 bg-slate-900/30 hover:border-white/15 hover:bg-slate-800/60 [html.light_&]:bg-[#F8F3EA] [html.light_&]:border-[#C99A47]/20 [html.light_&]:hover:bg-[#F5EBDD]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {ev.thumbnail_url ? (
                        <img
                          src={ev.thumbnail_url}
                          alt={ev.title}
                          className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                        />
                      ) : (
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-400 ring-1 ring-white/10">
                          <Calendar className="size-4" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white">
                          {isEnglish ? (translatePhrase(ev.title, 'en') || ev.title) : ev.title}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span>{fmtEventDate(ev.start_time)}</span>
                          {ev.category_name && (
                            <>
                              <span>·</span>
                              <span className="text-slate-300">{getCategoryName(ev.category_name, isEnglish)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${op.badgeClass}`}
                      >
                        <span className={`size-1.5 rounded-full ${op.dotClass}`} />
                        {op.label}
                      </span>
                      {isSelected && (
                        <div className="grid size-5 place-items-center rounded-full bg-primary text-slate-950">
                          <Check className="size-3 font-bold" />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}

              {filteredEvents.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  <Search className="mx-auto mb-2 size-6 text-slate-600" />
                  <p className="font-semibold text-slate-300">Không tìm thấy sự kiện phù hợp</p>
                  <p className="mt-0.5 text-slate-500">Thử tìm kiếm từ khóa khác hoặc chuyển tab bộ lọc.</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
