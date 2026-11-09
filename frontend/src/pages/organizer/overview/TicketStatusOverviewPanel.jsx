import { useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, XCircle } from 'lucide-react'

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('vi-VN')
}

function fmtRatePercent(rate) {
  const n = Number(rate) || 0
  if (n === 0) return '0%'
  if (n >= 10) return `${n.toFixed(1)}%`
  if (n >= 1) return `${n.toFixed(1)}%`
  if (n >= 0.1) return `${n.toFixed(2)}%`
  if (n >= 0.01) return `${n.toFixed(2)}%`
  return `${n.toFixed(3)}%`
}

export function TicketStatusOverviewPanel({
  dashboard = {},
  isSingleEvent = false,
  checkinStats = null,
}) {
  const [hoveredSegment, setHoveredSegment] = useState(null)

  const used = Number(checkinStats?.overall?.checked_in ?? dashboard?.checked_in_tickets ?? 0)
  const valid = Number(checkinStats?.overall?.valid ?? dashboard?.valid_tickets ?? 0)
  const cancelled = Number(checkinStats?.overall?.cancelled ?? dashboard?.cancelled_tickets ?? 0)

  // Denominator 1: Valid tickets (strictly excludes cancelled tickets)
  const validTickets = used + valid
  const checkinRateOfValid = validTickets > 0 ? (used / validTickets) * 100 : 0

  // Denominator 2: Total issued tickets (for 100% stacked bar)
  const totalIssued = Math.max(
    Number(dashboard?.issued_tickets || 0),
    used + valid + cancelled,
    validTickets,
    1
  )

  const pctUsed = totalIssued > 0 ? (used / totalIssued) * 100 : 0
  const pctValid = totalIssued > 0 ? (valid / totalIssued) * 100 : 0
  const pctCancelled = totalIssued > 0 ? (cancelled / totalIssued) * 100 : 0

  const cards = [
    {
      id: 'checked_in',
      label: 'Đã check-in',
      value: used,
      pctTotal: pctUsed,
      pctValid: checkinRateOfValid,
      color: '#10B981',
      dotClass: 'bg-[#10B981]',
      textClass: 'text-[#10B981]',
      labelClass: 'text-emerald-300 [html.light_&]:text-emerald-700',
      subText: `${fmtRatePercent(checkinRateOfValid)} vé hợp lệ`,
      boxClass:
        'border-emerald-500/30 bg-emerald-500/10 [html.light_&]:bg-emerald-50/80 [html.light_&]:border-emerald-300',
    },
    {
      id: 'not_checked_in',
      label: 'Chưa check-in',
      value: valid,
      pctTotal: pctValid,
      pctValid: validTickets > 0 ? (valid / validTickets) * 100 : 0,
      color: '#3B82F6',
      dotClass: 'bg-[#3B82F6]',
      textClass: 'text-[#3B82F6]',
      labelClass: 'text-blue-300 [html.light_&]:text-blue-700',
      subText: `${fmtRatePercent(validTickets > 0 ? (valid / validTickets) * 100 : 0)} vé hợp lệ`,
      boxClass:
        'border-blue-500/30 bg-blue-500/10 [html.light_&]:bg-blue-50/80 [html.light_&]:border-blue-300',
    },
    {
      id: 'cancelled',
      label: 'Đã hủy',
      value: cancelled,
      pctTotal: pctCancelled,
      pctValid: null,
      color: '#F43F5E',
      dotClass: 'bg-[#F43F5E]',
      textClass: 'text-[#F43F5E]',
      labelClass: 'text-rose-300 [html.light_&]:text-rose-700',
      subText: `${fmtRatePercent(pctCancelled)} tổng phát hành`,
      boxClass:
        'border-rose-500/30 bg-rose-500/10 [html.light_&]:bg-rose-50/80 [html.light_&]:border-rose-300',
    },
  ]

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-lg">
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
          Tình trạng vé & Check-in
        </h3>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-300 [html.light_&]:bg-emerald-50 [html.light_&]:border-emerald-300 [html.light_&]:text-emerald-700"
          title="Tỷ lệ check-in tính trên tổng số vé hợp lệ (loại trừ vé đã hủy)"
        >
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          {fmtRatePercent(checkinRateOfValid)} check-in
        </span>
      </div>

      {/* ── 100% Stacked Bar ── */}
      <div className="relative mb-2">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-900/90 p-0.5 border border-white/10 [html.light_&]:bg-[#E8DCCB] [html.light_&]:border-[#C99A47]/20 shadow-inner">
          {pctUsed > 0 && (
            <div
              onMouseEnter={() => setHoveredSegment('checked_in')}
              onMouseLeave={() => setHoveredSegment(null)}
              className="h-full bg-[#10B981] first:rounded-l-full last:rounded-r-full transition-all duration-300 cursor-pointer hover:brightness-110"
              style={{ width: `${pctUsed}%` }}
            />
          )}
          {pctValid > 0 && (
            <div
              onMouseEnter={() => setHoveredSegment('not_checked_in')}
              onMouseLeave={() => setHoveredSegment(null)}
              className="h-full bg-[#3B82F6] first:rounded-l-full last:rounded-r-full transition-all duration-300 cursor-pointer hover:brightness-110"
              style={{ width: `${pctValid}%` }}
            />
          )}
          {pctCancelled > 0 && (
            <div
              onMouseEnter={() => setHoveredSegment('cancelled')}
              onMouseLeave={() => setHoveredSegment(null)}
              className="h-full bg-[#F43F5E] first:rounded-l-full last:rounded-r-full transition-all duration-300 cursor-pointer hover:brightness-110"
              style={{ width: `${pctCancelled}%` }}
            />
          )}
        </div>

        {/* Hover Segment Tooltip floating right above */}
        {hoveredSegment && (
          <div className="mt-2 text-center text-xs animate-in fade-in duration-200">
            {hoveredSegment === 'checked_in' && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-slate-900/90 px-3 py-1 font-bold text-emerald-400 shadow-md">
                <span className="size-2 rounded-full bg-[#10B981]" />
                Đã check-in: {fmtNumber(used)} vé ({fmtRatePercent(pctUsed)} tổng vé · {fmtRatePercent(checkinRateOfValid)} vé hợp lệ)
              </span>
            )}
            {hoveredSegment === 'not_checked_in' && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-slate-900/90 px-3 py-1 font-bold text-blue-400 shadow-md">
                <span className="size-2 rounded-full bg-[#3B82F6]" />
                Chưa check-in: {fmtNumber(valid)} vé ({fmtRatePercent(pctValid)} tổng vé · {fmtRatePercent(validTickets > 0 ? (valid / validTickets) * 100 : 0)} vé hợp lệ)
              </span>
            )}
            {hoveredSegment === 'cancelled' && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-slate-900/90 px-3 py-1 font-bold text-rose-400 shadow-md">
                <span className="size-2 rounded-full bg-[#F43F5E]" />
                Đã hủy: {fmtNumber(cancelled)} vé ({fmtRatePercent(pctCancelled)} tổng vé)
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Three Summary Metric Cards ── */}
      <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
        {cards.map((item) => (
          <div
            key={item.id}
            onMouseEnter={() => setHoveredSegment(item.id)}
            onMouseLeave={() => setHoveredSegment(null)}
            className={`flex flex-col justify-between rounded-xl border p-2.5 transition-all cursor-pointer hover:scale-[1.02] ${item.boxClass}`}
          >
            <div className="flex h-8 items-center justify-center gap-1.5 px-0.5">
              <span className={`size-1.5 shrink-0 rounded-full ${item.dotClass}`} />
              <p className={`text-[10px] font-bold uppercase tracking-tight leading-tight ${item.labelClass}`}>
                {item.label}
              </p>
            </div>
            <p className={`my-1 font-display text-xl sm:text-2xl font-black ${item.textClass}`}>
              {fmtNumber(item.value)}
            </p>
            <div className="flex min-h-[26px] items-center justify-center">
              <p className="text-[10px] font-semibold text-slate-400 [html.light_&]:text-slate-600 leading-tight">
                {item.subText}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer Breakdown ── */}
      <div className="mt-4 space-y-1.5 border-t border-white/5 pt-3 text-xs [html.light_&]:border-slate-200">
        <div className="flex items-center justify-between">
          <span className="text-white [html.light_&]:text-[#0D1B2A]">Tổng vé đã phát hành:</span>
          <strong className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
            {fmtNumber(totalIssued)} vé
          </strong>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white [html.light_&]:text-[#0D1B2A]">Vé hợp lệ (loại trừ đã hủy):</span>
          <strong className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
            {fmtNumber(validTickets)} vé
          </strong>
        </div>
      </div>
    </div>
  )
}

