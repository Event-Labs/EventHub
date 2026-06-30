import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange, Check, ChevronDown } from 'lucide-react'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'thisWeek', label: 'Tuần này' },
  { value: 'lastWeek', label: 'Tuần trước' },
  { value: 'last7', label: '7 ngày qua' },
  { value: 'last28', label: '28 ngày trước' },
  { value: 'last30', label: '30 ngày qua' },
  { value: 'last90', label: '90 ngày qua' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' },
  { value: 'thisYear', label: 'Năm nay' },
  { value: 'lastYear', label: 'Năm trước' },
  { value: 'custom', label: 'Tùy chỉnh' },
]

const COMPARISON_OPTIONS = [
  { value: 'previousPeriod', label: 'Kỳ trước' },
  { value: 'previousMonth', label: 'Cùng kỳ tháng trước' },
  { value: 'previousYear', label: 'Cùng kỳ năm trước' },
  { value: 'custom', label: 'Tùy chỉnh' },
]

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfWeek(date) {
  const next = startOfDay(date)
  next.setDate(next.getDate() - next.getDay())
  return next
}

function endOfWeek(date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  return endOfDay(next)
}

function toInputDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthStart(year, month) {
  return startOfDay(new Date(year, month, 1))
}

function monthEnd(year, month) {
  return endOfDay(new Date(year, month + 1, 0))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addYears(date, years) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function addMonths(date, months) {
  const next = new Date(date)
  const targetMonth = next.getMonth() + months
  const originalDate = next.getDate()

  next.setDate(1)
  next.setMonth(targetMonth)
  const lastDayOfTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(originalDate, lastDayOfTargetMonth))

  return next
}

function daysBetweenInclusive(from, to) {
  const start = startOfDay(from)
  const end = startOfDay(to)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1)
}

export function getDateRange(option = 'last30', custom = {}) {
  const now = new Date()
  let from
  let to

  switch (option) {
    case 'today':
      from = startOfDay(now)
      to = endOfDay(now)
      break
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - MS_PER_DAY)
      from = startOfDay(yesterday)
      to = endOfDay(yesterday)
      break
    }
    case 'thisWeek':
      from = startOfWeek(now)
      to = endOfDay(now)
      break
    case 'lastWeek': {
      const lastWeek = new Date(now.getTime() - 7 * MS_PER_DAY)
      from = startOfWeek(lastWeek)
      to = endOfWeek(lastWeek)
      break
    }
    case 'last7':
      from = startOfDay(new Date(now.getTime() - 6 * MS_PER_DAY))
      to = endOfDay(now)
      break
    case 'last28':
      from = startOfDay(new Date(now.getTime() - 27 * MS_PER_DAY))
      to = endOfDay(now)
      break
    case 'last90':
      from = startOfDay(new Date(now.getTime() - 89 * MS_PER_DAY))
      to = endOfDay(now)
      break
    case 'thisMonth':
      from = monthStart(now.getFullYear(), now.getMonth())
      to = endOfDay(now)
      break
    case 'lastMonth':
      from = monthStart(now.getFullYear(), now.getMonth() - 1)
      to = monthEnd(now.getFullYear(), now.getMonth() - 1)
      break
    case 'thisYear':
      from = startOfDay(new Date(now.getFullYear(), 0, 1))
      to = endOfDay(now)
      break
    case 'lastYear':
      from = startOfDay(new Date(now.getFullYear() - 1, 0, 1))
      to = endOfDay(new Date(now.getFullYear() - 1, 11, 31))
      break
    case 'custom':
      from = custom.from ? startOfDay(new Date(custom.from)) : startOfDay(new Date(now.getTime() - 29 * MS_PER_DAY))
      to = custom.to ? endOfDay(new Date(custom.to)) : endOfDay(now)
      break
    case 'last30':
    default:
      from = startOfDay(new Date(now.getTime() - 29 * MS_PER_DAY))
      to = endOfDay(now)
      break
  }

  if (from > to) {
    return {
      dateFrom: to.toISOString(),
      dateTo: from.toISOString(),
      fromInput: toInputDate(to),
      toInput: toInputDate(from),
      label: formatDateRangeLabel(to, from),
    }
  }

  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    fromInput: toInputDate(from),
    toInput: toInputDate(to),
    label: formatDateRangeLabel(from, to),
  }
}

export function getComparisonRange(option = 'previousPeriod', baseRange, custom = {}) {
  const from = new Date(baseRange.dateFrom)
  const to = new Date(baseRange.dateTo)
  let compareFrom
  let compareTo

  switch (option) {
    case 'previousMonth':
      compareFrom = startOfDay(addMonths(from, -1))
      compareTo = endOfDay(addMonths(to, -1))
      break
    case 'previousYear':
      compareFrom = startOfDay(addYears(from, -1))
      compareTo = endOfDay(addYears(to, -1))
      break
    case 'custom':
      compareFrom = custom.from ? startOfDay(new Date(custom.from)) : startOfDay(addDays(from, -daysBetweenInclusive(from, to)))
      compareTo = custom.to ? endOfDay(new Date(custom.to)) : endOfDay(addDays(from, -1))
      break
    case 'previousPeriod':
    default: {
      const length = daysBetweenInclusive(from, to)
      compareFrom = startOfDay(addDays(from, -length))
      compareTo = endOfDay(addDays(from, -1))
      break
    }
  }

  return {
    dateFrom: compareFrom.toISOString(),
    dateTo: compareTo.toISOString(),
    fromInput: toInputDate(compareFrom),
    toInput: toInputDate(compareTo),
    label: formatDateRangeLabel(compareFrom, compareTo),
  }
}

export function getDateRangeLabel(option, range) {
  if (option === 'custom') return range.label
  return DATE_RANGE_OPTIONS.find((item) => item.value === option)?.label || range.label
}

function getComparisonLabel(option, range) {
  if (option === 'custom') return range.label
  return COMPARISON_OPTIONS.find((item) => item.value === option)?.label || range.label
}

function formatDateRangeLabel(from, to) {
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${formatter.format(from)} - ${formatter.format(to)}`
}

export function DateRangeFilter({
  value,
  customFrom,
  customTo,
  comparisonEnabled = false,
  comparisonMode = 'previousPeriod',
  comparisonFrom = '',
  comparisonTo = '',
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
  onComparisonChange,
}) {
  const [open, setOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(value)
  const [draftFrom, setDraftFrom] = useState(customFrom)
  const [draftTo, setDraftTo] = useState(customTo)
  const [draftCompareEnabled, setDraftCompareEnabled] = useState(false)
  const [draftCompareMode, setDraftCompareMode] = useState('previousPeriod')
  const [draftCompareFrom, setDraftCompareFrom] = useState('')
  const [draftCompareTo, setDraftCompareTo] = useState('')
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const [popupStyle, setPopupStyle] = useState({ left: 0, top: 0, width: 760 })
  const activeRange = getDateRange(value, { from: customFrom, to: customTo })
  const activeLabel = getDateRangeLabel(value, activeRange)
  const draftRange = getDateRange(draftValue, { from: draftFrom, to: draftTo })
  const draftLabel = getDateRangeLabel(draftValue, draftRange)
  const comparisonRange = comparisonEnabled
    ? getComparisonRange(comparisonMode, activeRange, { from: comparisonFrom, to: comparisonTo })
    : null
  const draftComparisonRange = getComparisonRange(draftCompareMode, draftRange, {
    from: draftCompareFrom,
    to: draftCompareTo,
  })
  const comparisonLabel = comparisonRange
    ? getComparisonLabel(comparisonMode, comparisonRange)
    : ''
  const draftComparisonLabel = getComparisonLabel(draftCompareMode, draftComparisonRange)

  useEffect(() => {
    if (!open) return undefined

    setDraftValue(value)
    setDraftFrom(activeRange.fromInput)
    setDraftTo(activeRange.toInput)
    setDraftCompareEnabled(comparisonEnabled)
    setDraftCompareMode(comparisonMode)
    setDraftCompareFrom(comparisonRange?.fromInput || getComparisonRange(comparisonMode, activeRange).fromInput)
    setDraftCompareTo(comparisonRange?.toInput || getComparisonRange(comparisonMode, activeRange).toInput)

    const updatePopupPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      const width = Math.min(880, window.innerWidth - 32)
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)
      const top = Math.min(rect.bottom + 8, window.innerHeight - 120)

      setPopupStyle({ left, top, width })
    }

    const handlePointerDown = (event) => {
      const target = event.target
      if (
        !containerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    updatePopupPosition()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', updatePopupPosition)
    window.addEventListener('scroll', updatePopupPosition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updatePopupPosition)
      window.removeEventListener('scroll', updatePopupPosition, true)
    }
  }, [
    activeRange.fromInput,
    activeRange.toInput,
    comparisonEnabled,
    comparisonMode,
    comparisonFrom,
    comparisonRange?.fromInput,
    comparisonRange?.toInput,
    comparisonTo,
    open,
    value,
  ])

  const handlePresetClick = (nextValue) => {
    setDraftValue(nextValue)
  }

  const applySelection = () => {
    onPresetChange(draftValue)
    onCustomFromChange(draftRange.fromInput)
    onCustomToChange(draftRange.toInput)
    onComparisonChange?.({
      enabled: draftCompareEnabled,
      mode: draftCompareMode,
      from: draftComparisonRange.fromInput,
      to: draftComparisonRange.toInput,
      dateFrom: draftComparisonRange.dateFrom,
      dateTo: draftComparisonRange.dateTo,
      label: getComparisonLabel(draftCompareMode, draftComparisonRange),
      rangeLabel: draftComparisonRange.label,
    })
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <span className="block text-sm font-semibold text-subtle">Khoảng thời gian</span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 flex h-10 min-w-72 items-center justify-between gap-3 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-left text-sm font-semibold text-content transition hover:border-tertiary/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarRange className="size-4 shrink-0 text-tertiary" />
          <span className="shrink-0 text-tertiary">{activeLabel}</span>
          <span className="min-w-0 truncate text-subtle">{activeRange.label}</span>
          {comparisonRange && (
            <span className="hidden shrink-0 text-subtle lg:inline">
              so với {comparisonLabel}
            </span>
          )}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-subtle transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] max-h-[min(620px,calc(100vh-2rem))] overflow-hidden rounded-xl border border-border-soft/40 bg-surface shadow-2xl shadow-black/40"
          style={{
            left: popupStyle.left,
            top: popupStyle.top,
            width: popupStyle.width,
          }}
        >
          <div className="grid md:grid-cols-[300px_1fr]">
            <div className="date-range-filter-scroll max-h-[540px] overflow-y-auto overscroll-contain border-b border-border-soft/30 py-2 md:border-b-0 md:border-r">
              {DATE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePresetClick(option.value)}
                  className={`flex h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold transition ${
                    draftValue === option.value
                      ? 'bg-tertiary/15 text-tertiary'
                      : 'text-content hover:bg-panel-soft hover:text-tertiary'
                  }`}
                >
                  <span>{option.label}</span>
                  {draftValue === option.value && <Check className="size-4" />}
                </button>
              ))}

              <div className="my-2 border-t border-border-soft/30" />
              <div className="flex h-12 items-center justify-between px-4">
                <span className="text-sm font-bold text-content">So sánh</span>
                <button
                  type="button"
                  onClick={() => setDraftCompareEnabled((current) => !current)}
                  className={`relative h-6 w-11 rounded-full transition ${
                    draftCompareEnabled ? 'bg-tertiary' : 'bg-border-soft/50'
                  }`}
                  aria-pressed={draftCompareEnabled}
                >
                  <span
                    className={`absolute top-1 grid size-4 place-items-center rounded-full bg-white text-[10px] text-tertiary transition ${
                      draftCompareEnabled ? 'left-6' : 'left-1'
                    }`}
                  >
                    {draftCompareEnabled && <Check className="size-3" />}
                  </span>
                </button>
              </div>

              {draftCompareEnabled && COMPARISON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDraftCompareMode(option.value)}
                  className={`flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold transition ${
                    draftCompareMode === option.value
                      ? 'bg-tertiary/15 text-tertiary'
                      : 'text-content hover:bg-panel-soft hover:text-tertiary'
                  }`}
                >
                  <span>{option.label}</span>
                  {draftCompareMode === option.value && <Check className="size-4" />}
                </button>
              ))}
            </div>

            <div className="p-5">
              <div className="mb-4 rounded-xl border border-border-soft/30 bg-panel-soft px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-subtle">Đang chọn</p>
                <p className="mt-1 text-sm font-bold text-content">{draftLabel}</p>
                <p className="mt-0.5 text-sm text-subtle">{draftRange.label}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="block text-xs font-bold uppercase tracking-wider text-subtle">
                    Ngày bắt đầu
                  </span>
                  <input
                    type="date"
                    value={draftRange.fromInput}
                    onChange={(event) => {
                      setDraftValue('custom')
                      setDraftFrom(event.target.value)
                      setDraftTo(draftRange.toInput)
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
                  />
                </label>
                <label>
                  <span className="block text-xs font-bold uppercase tracking-wider text-subtle">
                    Ngày kết thúc
                  </span>
                  <input
                    type="date"
                    value={draftRange.toInput}
                    onChange={(event) => {
                      setDraftValue('custom')
                      setDraftFrom(draftRange.fromInput)
                      setDraftTo(event.target.value)
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
                  />
                </label>
              </div>

              {draftCompareEnabled && (
                <div className="mt-5 border-t border-border-soft/30 pt-4">
                  <p className="mb-3 text-sm font-bold text-content">So sánh</p>
                  <div className="mb-4 rounded-xl border border-border-soft/30 bg-panel-soft px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-subtle">Kỳ so sánh</p>
                    <p className="mt-1 text-sm font-bold text-content">{draftComparisonLabel}</p>
                    <p className="mt-0.5 text-sm text-subtle">{draftComparisonRange.label}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="block text-xs font-bold uppercase tracking-wider text-subtle">
                        Ngày bắt đầu
                      </span>
                      <input
                        type="date"
                        value={draftComparisonRange.fromInput}
                        onChange={(event) => {
                          setDraftCompareMode('custom')
                          setDraftCompareFrom(event.target.value)
                          setDraftCompareTo(draftComparisonRange.toInput)
                        }}
                        className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
                      />
                    </label>
                    <label>
                      <span className="block text-xs font-bold uppercase tracking-wider text-subtle">
                        Ngày kết thúc
                      </span>
                      <input
                        type="date"
                        value={draftComparisonRange.toInput}
                        onChange={(event) => {
                          setDraftCompareMode('custom')
                          setDraftCompareFrom(draftComparisonRange.fromInput)
                          setDraftCompareTo(event.target.value)
                        }}
                        className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2 border-t border-border-soft/30 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-subtle transition hover:bg-panel-soft hover:text-content"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={applySelection}
                  className="rounded-lg bg-tertiary px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
