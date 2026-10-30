import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Layers,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TicketCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { DateRangeFilter, getDateRange, getDateRangeLabel } from '@/components/DateRangeFilter.jsx'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import {
  fetchCheckinStats,
  fetchRevenueStats,
  fetchTicketSalesAnalytics,
  generateFinancialSummary,
} from '@/services/organizerOrders.js'
import { OrganizerPage, OrganizerPanel, TableActionButton } from './OrganizerComponents.jsx'
import { getEventOperationalStatus } from './eventStatusUtil.js'
import { OrganizerEventPicker } from './OrganizerEventPicker.jsx'
import { getStoredUser } from '@/lib/auth.js'
import { exportOrganizerRevenueToExcel } from '@/utils/exportRevenueExcel.js'

// ─── Formatters & Utilities ──────────────────────────────────────────────────

function fmtCurrency(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n) || 0)
}

function fmtShort(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString('vi-VN')
}

function fmtNumber(n, digits = 0) {
  return Number(n || 0).toLocaleString('vi-VN', {
    maximumFractionDigits: digits,
  })
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function fmtChartDay(value) {
  if (!value) return ''
  const [datePart] = String(value).split('T')
  const [year, month, day] = datePart.split('-')
  return year && month && day ? `${day}/${month}` : datePart
}

function riskLabel(level) {
  const labels = {
    LOW: 'Rủi ro thấp',
    MEDIUM: 'Rủi ro vừa',
    HIGH: 'Rủi ro cao',
  }
  return labels[level] || level || '—'
}

function riskClass(level) {
  if (level === 'LOW') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  if (level === 'HIGH') return 'border-rose-500/30 bg-rose-500/10 text-rose-400'
  return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
}

// ─── Sub-components: KPIs & Metrics ──────────────────────────────────────────

function HeroKpiCard({ label, value, sub, icon: Icon, trend, trendValue, tone = 'cyan', progressBar }) {
  const toneStyles = {
    cyan: {
      border: 'hover:border-cyan-500/40',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      badge: 'text-cyan-400',
    },
    emerald: {
      border: 'hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      badge: 'text-emerald-400',
    },
    purple: {
      border: 'hover:border-purple-500/40',
      iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      badge: 'text-purple-400',
    },
    amber: {
      border: 'hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      badge: 'text-amber-400',
    },
  }[tone] || {
    border: 'hover:border-cyan-500/40',
    iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    badge: 'text-cyan-400',
  }

  return (
    <div
      className={`glass-panel flex flex-col justify-between rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-300 hover:-translate-y-1 ${toneStyles.border} [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md`}
    >
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">{label}</p>
          {Icon && (
            <div className={`grid size-8 place-items-center rounded-xl border ${toneStyles.iconBg}`}>
              <Icon className="size-4" />
            </div>
          )}
        </div>
        <p className="mt-2.5 truncate font-display text-2xl font-black text-white [html.light_&]:text-[#0D1B2A] drop-shadow-sm sm:text-3xl">
          {value}
        </p>
      </div>

      <div className="mt-4">
        {progressBar !== undefined && (
          <div className="mb-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800 [html.light_&]:bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, Number(progressBar) || 0))}%` }}
              />
            </div>
          </div>
        )}

        {sub && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300 [html.light_&]:text-[#536b88]">
            {trend === 'up' && (
              <span className="inline-flex items-center gap-0.5 font-bold text-emerald-400 [html.light_&]:text-emerald-600">
                <ArrowUpRight className="size-3.5" />
                {trendValue}
              </span>
            )}
            {trend === 'down' && (
              <span className="inline-flex items-center gap-0.5 font-bold text-rose-400 [html.light_&]:text-rose-600">
                <ArrowDownRight className="size-3.5" />
                {trendValue}
              </span>
            )}
            <span className="truncate text-slate-400 [html.light_&]:text-[#536b88]">{sub}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components: Interactive Charts ──────────────────────────────────────

function InteractiveRevenueChart({ data = [], comparisonData = [], comparisonEnabled = false, comparisonLabel = '' }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState(null)

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-slate-950/40 text-center text-sm text-slate-400">
        <BarChart3 className="size-8 text-slate-600" />
        <p className="font-semibold text-slate-300">Chưa có giao dịch trong khoảng thời gian này</p>
        <p className="text-xs text-slate-500">Dữ liệu doanh thu sẽ tự động xuất hiện khi có đơn hàng thanh toán thành công.</p>
      </div>
    )
  }

  const height = 180
  const maxVal = Math.max(...data.map((d) => Number(d.net_revenue)), 1)
  const totalNet = data.reduce((s, d) => s + Number(d.net_revenue || 0), 0)
  const totalOrders = data.reduce((s, d) => s + Number(d.orders || 0), 0)
  const totalComparisonNet = comparisonEnabled && comparisonData?.length
    ? comparisonData.reduce((s, d) => s + Number(d.net_revenue || 0), 0)
    : 0
  const peakDay = [...data].sort((a, b) => Number(b.net_revenue) - Number(a.net_revenue))[0]

  const count = data.length
  const w = containerWidth || 600
  const padLeft = 48
  const padRight = 16
  const usableWidth = Math.max(w - padLeft - padRight, 80)
  const slotW = count > 0 ? usableWidth / count : 40
  const barWidth = Math.min(Math.max(slotW * 0.55, 12), 48)

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null

  return (
    <div>
      {/* Top Chart Stats Summary */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <div>
            <span className="text-slate-400">Tổng doanh thu kỳ: </span>
            <strong className="text-[#E6C17A] font-black">{fmtCurrency(totalNet)}</strong>
          </div>
          <div>
            <span className="text-slate-400">Số đơn: </span>
            <strong className="text-white font-bold">{totalOrders}</strong>
          </div>
          {peakDay && Number(peakDay.net_revenue) > 0 && (
            <div>
              <span className="text-slate-400">Đỉnh doanh thu: </span>
              <strong className="text-[#FBBF24] font-black">
                {fmtCurrency(peakDay.net_revenue)} ({fmtChartDay(peakDay.day)})
              </strong>
            </div>
          )}
          {comparisonEnabled && totalComparisonNet > 0 && (
            <div>
              <span className="text-slate-400">{comparisonLabel || 'Kỳ so sánh'}: </span>
              <strong className="text-amber-400 font-bold">{fmtCurrency(totalComparisonNet)}</strong>
            </div>
          )}
        </div>

        {hoveredItem && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/80 px-2.5 py-1 text-xs font-bold text-amber-200 shadow-md">
            {fmtChartDay(hoveredItem.day)}: {fmtCurrency(hoveredItem.net_revenue)} · {hoveredItem.orders} đơn
          </div>
        )}
      </div>

      {/* SVG Canvas - Fits 100% width, ZERO horizontal scroll */}
      <div ref={containerRef} className="w-full overflow-hidden">
        <svg
          width="100%"
          height={height + 35}
          viewBox={`0 0 ${w} ${height + 35}`}
          className="block"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            {/* Luminous Gold Gradient for normal revenue bars */}
            <linearGradient id="barGradientGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" stopOpacity="1" />
              <stop offset="100%" stopColor="#D97706" stopOpacity="0.85" />
            </linearGradient>
            {/* Radiant Gold / Amber Gradient for peak revenue day */}
            <linearGradient id="barGradientPeakGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FEF08A" stopOpacity="1" />
              <stop offset="45%" stopColor="#F59E0B" stopOpacity="1" />
              <stop offset="100%" stopColor="#B45309" stopOpacity="0.95" />
            </linearGradient>
            {/* Hover Gradient */}
            <linearGradient id="barGradientHoverGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFBEB" stopOpacity="1" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="1" />
            </linearGradient>
            {/* Subtle glow filter */}
            <filter id="goldBarGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#F59E0B" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Grid lines and Y-axis values */}
          {[0, 0.5, 1].map((pct) => {
            const yPos = height - pct * (height - 20)
            return (
              <g key={pct}>
                <line
                  x1={padLeft}
                  x2={w - padRight}
                  y1={yPos}
                  y2={yPos}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray={pct > 0 && pct < 1 ? "4 4" : "none"}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  fontSize={10}
                  fontWeight={700}
                  fill="#E6C17A"
                >
                  {pct === 0 ? '0' : fmtShort(pct * maxVal)}
                </text>
              </g>
            )
          })}

          {/* Trục hoành (X-Axis line) */}
          <line
            x1={padLeft}
            x2={w - padRight}
            y1={height}
            y2={height}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={1.5}
          />

          {/* Trục tung (Y-Axis line) */}
          <line
            x1={padLeft}
            x2={padLeft}
            y1={10}
            y2={height}
            stroke="rgba(201, 154, 71, 0.45)"
            strokeWidth={1.5}
          />

          {/* Bars */}
          {data.map((d, i) => {
            const barH = Math.max((Number(d.net_revenue) / maxVal) * (height - 20), 4)
            const x = padLeft + i * slotW + (slotW - barWidth) / 2
            const y = height - barH
            const isHighest = Number(d.net_revenue) === maxVal && maxVal > 0
            const isHovered = hoveredIndex === i

            const fill = isHovered
              ? 'url(#barGradientHoverGold)'
              : isHighest
                ? 'url(#barGradientPeakGold)'
                : 'url(#barGradientGold)'

            return (
              <g
                key={d.day}
                onMouseEnter={() => setHoveredIndex(i)}
                className="cursor-pointer transition-all duration-150"
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={5}
                  fill={fill}
                  stroke="rgba(251, 191, 36, 0.4)"
                  strokeWidth={1}
                  filter={isHighest || isHovered ? "url(#goldBarGlow)" : undefined}
                  className="transition-all duration-200"
                >
                  <title>{`${fmtChartDay(d.day)}: ${fmtCurrency(d.net_revenue)} (${d.orders} đơn)`}</title>
                </rect>
                {isHighest && (
                  <circle
                    cx={x + barWidth / 2}
                    cy={y - 5}
                    r={3}
                    fill="#FEF08A"
                    filter="url(#goldBarGlow)"
                  />
                )}
              </g>
            )
          })}

          {/* X Axis labels */}
          {data.map((d, i) => {
            const step = Math.max(1, Math.ceil(count / Math.max(Math.floor(w / 70), 2)))
            if (i % step !== 0 && i !== count - 1) return null
            const x = padLeft + i * slotW + slotW / 2
            return (
              <g key={`lbl-${d.day}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={height}
                  y2={height + 5}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={height + 20}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="#cbd5e1"
                >
                  {fmtChartDay(d.day)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Sub-components: Events Performance Table (Portfolio Mode) ────────────────

function EventsPerformanceTable({ eventsRevenue = [], onDrillDownEvent }) {
  if (!eventsRevenue.length) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        Chưa có số liệu doanh thu của từng sự kiện trong khoảng thời gian này.
      </div>
    )
  }

  const maxGross = Math.max(...eventsRevenue.map((e) => Number(e.gross_revenue || 0)), 1)

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d172e]/60">
      <table className="w-full text-left text-sm table-fixed">
        <thead>
          <tr className="border-b border-white/10 bg-[#121c38] text-[11px] font-bold uppercase tracking-wider text-slate-300">
            <th className="px-3.5 py-3 w-[40%]">Sự kiện</th>
            <th className="px-3 py-3 text-right w-[24%]">Doanh thu</th>
            <th className="px-2 py-3 text-center w-[12%]">Đơn</th>
            <th className="px-2 py-3 text-center w-[13%]">Đóng góp</th>
            <th className="px-3 py-3 text-right w-[11%]">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-300">
          {eventsRevenue.map((item) => {
            const gross = Number(item.gross_revenue || 0)
            const discount = Number(item.total_discount || 0)
            const pct = maxGross > 0 ? Math.min(100, Math.round((gross / maxGross) * 100)) : 0

            return (
              <tr
                key={item.event_id}
                className="transition-colors hover:bg-white/[0.03]"
              >
                <td className="px-3.5 py-3">
                  <p className="truncate font-bold text-white text-sm" title={item.event_title}>
                    {item.event_title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmtDate(item.start_time)}
                  </p>
                </td>

                <td className="px-3 py-3 text-right">
                  <p className="font-bold text-white whitespace-nowrap text-sm">
                    {fmtCurrency(gross)}
                  </p>
                  {discount > 0 ? (
                    <p className="text-[11px] font-semibold text-amber-400 whitespace-nowrap">
                      Chiết khấu: -{fmtCurrency(discount)}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 whitespace-nowrap">
                      Doanh thu vé
                    </p>
                  )}
                </td>

                <td className="px-2 py-3 text-center">
                  <span className="font-semibold text-cyan-300">
                    {Number(item.total_orders || 0).toLocaleString('vi-VN')}
                  </span>
                </td>

                <td className="px-2 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="hidden sm:block h-1.5 w-10 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-300">{pct}%</span>
                  </div>
                </td>

                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end">
                    <TableActionButton
                      onClick={() => onDrillDownEvent(item.event_id)}
                      title={`Xem phân tích cho ${item.event_title}`}
                      icon={Eye}
                      tone="default"
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Sub-components: Single Event Header Banner ──────────────────────────────

function SingleEventBanner({ event, onBackToAll }) {
  if (!event) return null
  const op = getEventOperationalStatus(event)

  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-r from-[#0d172e] via-[#101b38] to-[#0d172e] p-5 shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {event.thumbnail_url ? (
            <img
              src={event.thumbnail_url}
              alt={event.title}
              className="size-16 shrink-0 rounded-xl object-cover ring-2 ring-white/10"
            />
          ) : (
            <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-400 ring-2 ring-cyan-500/20">
              <Calendar className="size-7" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${op.badgeClass}`}>
                <span className={`size-1.5 rounded-full ${op.dotClass}`} />
                {op.label}
              </span>
              {event.category_name && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                  {event.category_name}
                </span>
              )}
            </div>

            <h2 className="mt-1.5 truncate font-display text-xl font-black text-white sm:text-2xl">
              {event.title}
            </h2>

            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5 text-cyan-400" />
                {fmtDateTime(event.start_time)}
              </span>
              {event.end_time && (
                <span>— {fmtDateTime(event.end_time)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToAll}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <Layers className="size-3.5 text-cyan-400" />
            <span>Xem tất cả sự kiện</span>
          </button>

          <Link
            to={`/organizer/events/${event.id}`}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <span>Chi tiết sự kiện</span>
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components: Ticket Operations & Check-in ─────────────────────────────

function TicketOperationsPanel({ dashboard = {}, isSingleEvent = false, checkinStats = null }) {
  const used = Number(checkinStats?.overall?.checked_in ?? dashboard?.checked_in_tickets ?? 0)
  const valid = Number(checkinStats?.overall?.valid ?? dashboard?.valid_tickets ?? 0)
  const cancelled = Number(checkinStats?.overall?.cancelled ?? dashboard?.cancelled_tickets ?? 0)
  const issued = Number(checkinStats?.overall?.total_tickets ?? dashboard?.issued_tickets ?? (used + valid + cancelled))
  const total = Math.max(issued, used + valid + cancelled, 1)

  const checkinRate = total > 0 ? ((used / total) * 100).toFixed(1) : '0'

  const cards = [
    {
      id: 'used',
      label: 'Đã check-in',
      value: used,
      pct: ((used / total) * 100).toFixed(0),
      barClass: 'bg-gradient-to-r from-emerald-500 to-teal-400',
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-400 [html.light_&]:text-emerald-600',
      labelClass: 'text-emerald-300 [html.light_&]:text-emerald-700',
      subClass: 'text-emerald-400/80 [html.light_&]:text-emerald-600',
      boxClass: 'border-emerald-500/30 bg-emerald-500/10 [html.light_&]:bg-emerald-50/80 [html.light_&]:border-emerald-300',
    },
    {
      id: 'valid',
      label: 'Còn hiệu lực',
      value: valid,
      pct: ((valid / total) * 100).toFixed(0),
      barClass: 'bg-gradient-to-r from-blue-500 to-indigo-500',
      dotClass: 'bg-blue-400',
      textClass: 'text-blue-400 [html.light_&]:text-blue-600',
      labelClass: 'text-blue-300 [html.light_&]:text-blue-700',
      subClass: 'text-blue-400/80 [html.light_&]:text-blue-600',
      boxClass: 'border-blue-500/30 bg-blue-500/10 [html.light_&]:bg-blue-50/80 [html.light_&]:border-blue-300',
    },
    {
      id: 'cancelled',
      label: 'Đã hủy',
      value: cancelled,
      pct: ((cancelled / total) * 100).toFixed(0),
      barClass: 'bg-gradient-to-r from-rose-500 to-red-600',
      dotClass: 'bg-rose-400',
      textClass: 'text-rose-400 [html.light_&]:text-rose-600',
      labelClass: 'text-rose-300 [html.light_&]:text-rose-700',
      subClass: 'text-rose-400/80 [html.light_&]:text-rose-600',
      boxClass: 'border-rose-500/30 bg-rose-500/10 [html.light_&]:bg-rose-50/80 [html.light_&]:border-rose-300',
    },
  ]

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TicketCheck className="size-5 text-[#E6C17A]" />
          <h3 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">Tình trạng vé & Check-in</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-300 [html.light_&]:bg-emerald-50 [html.light_&]:border-emerald-300 [html.light_&]:text-emerald-700">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          {checkinRate}% check-in
        </span>
      </div>

      {/* Segmented Progress Bar */}
      <div className="flex h-3.5 overflow-hidden rounded-full bg-slate-900/90 p-0.5 border border-white/10 [html.light_&]:bg-[#E8DCCB] [html.light_&]:border-[#C99A47]/20 shadow-inner">
        {cards.map((item) => {
          const widthPct = Math.max(0, (item.value / total) * 100)
          if (widthPct === 0) return null
          return (
            <div
              key={item.id}
              className={`h-full ${item.barClass} first:rounded-l-full last:rounded-r-full transition-all duration-500`}
              style={{ width: `${widthPct}%` }}
              title={`${item.label}: ${fmtNumber(item.value)} vé (${item.pct}%)`}
            />
          )
        })}
      </div>

      {/* Metric Tiles */}
      <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
        {cards.map((item) => (
          <div
            key={item.id}
            className={`rounded-xl border p-2.5 transition-all hover:scale-[1.02] ${item.boxClass}`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className={`size-1.5 rounded-full ${item.dotClass}`} />
              <p className={`text-[10px] font-bold uppercase tracking-wider ${item.labelClass}`}>
                {item.label}
              </p>
            </div>
            <p className={`mt-1 font-display text-xl sm:text-2xl font-black ${item.textClass}`}>
              {fmtNumber(item.value)}
            </p>
            <p className={`text-[11px] font-bold ${item.subClass}`}>
              {item.pct}%
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-sm [html.light_&]:border-slate-200">
        <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A]">Tổng vé đã phát hành:</span>
        <strong className="text-base font-black text-white [html.light_&]:text-[#0D1B2A]">{fmtNumber(issued)} vé</strong>
      </div>
    </div>
  )
}

// ─── Sub-components: Portfolio Overview / Upcoming Card ───────────────────────

function PortfolioOverviewCard({ dashboard = {}, subscription = {} }) {
  const plan = subscription?.current_plan
  const nextEvent = dashboard?.next_event

  return (
    <div className="space-y-4">
      {/* Portfolio Health Pills */}
      <div className="rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
        <h3 className="mb-3 font-bold text-white [html.light_&]:text-[#0D1B2A]">Trạng thái sự kiện</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-center [html.light_&]:bg-cyan-50/70 [html.light_&]:border-cyan-200">
            <p className="text-[10px] font-bold uppercase text-slate-400 [html.light_&]:text-[#536b88]">Đang mở bán</p>
            <p className="mt-1 font-display text-xl font-black text-cyan-400 [html.light_&]:text-cyan-700">
              {fmtNumber(dashboard.published_events)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center [html.light_&]:bg-amber-50/70 [html.light_&]:border-amber-200">
            <p className="text-[10px] font-bold uppercase text-slate-400 [html.light_&]:text-[#536b88]">Chờ duyệt</p>
            <p className="mt-1 font-display text-xl font-black text-amber-400 [html.light_&]:text-amber-700">
              {fmtNumber(dashboard.pending_review_events)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 text-center [html.light_&]:bg-slate-100/70 [html.light_&]:border-slate-300">
            <p className="text-[10px] font-bold uppercase text-slate-400 [html.light_&]:text-[#536b88]">Bản nháp</p>
            <p className="mt-1 font-display text-xl font-black text-slate-300 [html.light_&]:text-slate-800">
              {fmtNumber(dashboard.draft_events)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center [html.light_&]:bg-emerald-50/70 [html.light_&]:border-emerald-200">
            <p className="text-[10px] font-bold uppercase text-slate-400 [html.light_&]:text-[#536b88]">Đã kết thúc</p>
            <p className="mt-1 font-display text-xl font-black text-emerald-400 [html.light_&]:text-emerald-700">
              {fmtNumber(dashboard.completed_events)}
            </p>
          </div>
        </div>
      </div>

      {/* Next Upcoming Event */}
      <div className="rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">Sự kiện sắp diễn ra gần nhất</h3>
          <Calendar className="size-4 text-cyan-400 [html.light_&]:text-cyan-600" />
        </div>

        {nextEvent ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
            <p className="truncate font-bold text-white [html.light_&]:text-[#0D1B2A]">{nextEvent.title}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400 [html.light_&]:text-[#536b88]">
              <span>{fmtDate(nextEvent.start_time)}</span>
              <span className="font-semibold text-cyan-400 [html.light_&]:text-cyan-700">
                {fmtNumber(nextEvent.tickets_sold)} / {fmtNumber(nextEvent.capacity)} vé
              </span>
            </div>
            {Number(nextEvent.capacity) > 0 && (
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800 [html.light_&]:bg-slate-200">
                <div
                  className="h-full rounded-full bg-cyan-400"
                  style={{
                    width: `${Math.min(100, (Number(nextEvent.tickets_sold || 0) / Number(nextEvent.capacity)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-400 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-slate-500">
            Chưa có sự kiện nào sắp diễn ra.
          </div>
        )}

        {/* Current Plan Card */}
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/40 p-3.5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">Gói dịch vụ</p>
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-300 [html.light_&]:bg-purple-100 [html.light_&]:border-purple-300 [html.light_&]:text-purple-700">
              {plan?.name || 'Gói cơ bản'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-300 [html.light_&]:text-[#536b88]">
            {plan ? `Hết hạn ${fmtDate(plan.end_date)}` : 'Nâng cấp gói để mở khóa toàn bộ tính năng và giới hạn.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components: Single Event Ticket Tiers (Pareto) ───────────────────────

function SingleEventTicketTiersTable({ tiers = [] }) {
  if (!tiers.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 text-center text-sm text-slate-400 [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:text-slate-500">
        Chưa có cấu hình hạng vé cho sự kiện này.
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
      <h3 className="mb-3 font-bold text-white [html.light_&]:text-[#0D1B2A]">Hiệu suất phân bổ theo hạng vé (Tier Mix)</h3>
      <table className="w-full text-left text-sm table-fixed">
        <thead>
          <tr className="border-b border-white/10 bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:bg-[#FAF5ED] [html.light_&]:border-[#C99A47]/20 [html.light_&]:text-[#536b88]">
            <th className="px-3 py-2.5 w-[30%]">Hạng vé</th>
            <th className="px-3 py-2.5 text-right w-[22%]">Giá vé</th>
            <th className="px-2 py-2.5 text-center w-[20%]">Đã bán</th>
            <th className="px-2 py-2.5 text-center w-[13%]">Lấp đầy</th>
            <th className="px-3 py-2.5 text-right w-[15%]">Doanh thu</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-300 [html.light_&]:divide-[#C99A47]/15 [html.light_&]:text-[#0D1B2A]">
          {tiers.map((t) => {
            const occupancy = Number(t.occupancy_rate || 0)
            const sold = Number(t.sold_quantity ?? t.sold ?? 0)
            const capacity = Number(t.capacity || 0)
            const price = Number(t.unit_price ?? t.price ?? 0)
            const revenue = Number(t.revenue || sold * price)

            return (
              <tr key={t.ticket_type_id || t.id || t.name} className="hover:bg-white/[0.02] [html.light_&]:hover:bg-amber-50/40">
                <td className="px-3 py-3 truncate font-bold text-white [html.light_&]:text-[#0D1B2A] text-sm" title={t.ticket_type_name || t.name}>
                  {t.ticket_type_name || t.name}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-slate-300 [html.light_&]:text-[#536b88] whitespace-nowrap">
                  {fmtCurrency(price)}
                </td>
                <td className="px-2 py-3 text-center text-xs text-slate-300 [html.light_&]:text-[#536b88] whitespace-nowrap">
                  {sold} / {capacity}
                </td>
                <td className="px-2 py-3 text-center">
                  <span className="text-xs font-bold text-cyan-300 [html.light_&]:text-cyan-700">{occupancy}%</span>
                </td>
                <td className="px-3 py-3 text-right font-bold text-emerald-400 [html.light_&]:text-[#065f46] whitespace-nowrap">
                  {fmtCurrency(revenue)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Executive Financial AI Helpers & Report ─────────────────────────────────

function parseFinancialReport(summaryText) {
  if (!summaryText) return []
  const rawSections = summaryText.split(/(?=###\s+)/g)
  return rawSections
    .map((sec) => {
      const trimmed = sec.trim()
      if (!trimmed) return null
      const firstLineEnd = trimmed.indexOf('\n')
      if (firstLineEnd === -1) {
        return { title: trimmed.replace(/^###\s+/, ''), content: '' }
      }
      const title = trimmed.slice(0, firstLineEnd).replace(/^###\s+/, '').trim()
      const content = trimmed.slice(firstLineEnd).trim()
      return { title, content }
    })
    .filter(Boolean)
}

function FormattedMarkdownContent({ text }) {
  if (!text) return null
  const paragraphs = text.split(/\n\s*\n/)
  return (
    <div className="space-y-3">
      {paragraphs.map((p, pIdx) => {
        const lines = p.split('\n')
        return (
          <div key={pIdx} className="space-y-2">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim()
              if (!trimmed) return null
              const isListItem = /^[0-9]+\.\s+|^\*\s+|-\s+/.test(trimmed)
              const cleanText = trimmed.replace(/^[0-9]+\.\s+|^\*\s+|-\s+/, '')
              const parts = cleanText.split(/(\*\*.*?\*\*)/g)
              const renderedLine = parts.map((part, pIndex) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={pIndex} className="font-bold text-white drop-shadow-sm">
                      {part.slice(2, -2)}
                    </strong>
                  )
                }
                return part
              })

              if (isListItem) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan-400" />
                    <span className="leading-relaxed">{renderedLine}</span>
                  </div>
                )
              }

              return (
                <p key={lIdx} className="text-sm leading-relaxed text-slate-300">
                  {renderedLine}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function ExecutivePillarCard({ title, content, index }) {
  const getPillarConfig = () => {
    const t = (title || '').toUpperCase()
    if (t.includes('HIỆU SUẤT') || t.includes('LỢI NHUẬN') || index === 0) {
      return {
        icon: CircleDollarSign,
        badge: 'Hiệu suất tài chính',
        badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        cardBorder: 'border-emerald-500/20 hover:border-emerald-500/40',
      }
    }
    if (t.includes('VẬN TỐC') || t.includes('TIÊU THỤ') || index === 1) {
      return {
        icon: Zap,
        badge: 'Vận tốc & Đà tăng trưởng',
        badgeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
        cardBorder: 'border-cyan-500/20 hover:border-cyan-500/40',
      }
    }
    if (t.includes('ĐIỂM NGHẼN') || t.includes('RỦI RO') || index === 2) {
      return {
        icon: ShieldAlert,
        badge: 'Rủi ro & Tồn kho',
        badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        cardBorder: 'border-amber-500/20 hover:border-amber-500/40',
      }
    }
    return {
      icon: Sparkles,
      badge: 'Đề xuất chiến lược',
      badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
      cardBorder: 'border-purple-500/20 hover:border-purple-500/40',
    }
  }

  const { icon: Icon, badge, badgeClass, cardBorder } = getPillarConfig()

  return (
    <div className={`rounded-2xl border bg-slate-900/70 p-5 shadow-sm transition-all ${cardBorder}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-white/5">
            <Icon className="size-4 text-white" />
          </div>
          <h4 className="text-sm font-bold text-white drop-shadow-sm">{title}</h4>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <FormattedMarkdownContent text={content} />
    </div>
  )
}

function printExecutiveYieldReport({ financialSummary, eventTitle, dateRangeLabel }) {
  if (!financialSummary) return
  const intel = financialSummary.intelligence || {}
  const metrics = intel.metrics || {}
  const velocity = intel.velocity || {}
  const tiers = intel.tier_breakdown || []
  const pillars = parseFinancialReport(financialSummary.summary)
  const now = new Date().toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const tierRowsHtml = tiers
    .map(
      (t) => `
    <tr>
      <td style="font-weight: 700;">${t.name}</td>
      <td>${fmtCurrency(t.price)}</td>
      <td>${t.sold} / ${t.capacity} vé</td>
      <td><strong>${t.occupancy_rate}%</strong></td>
      <td style="font-weight: 700; color: #166534;">${t.revenue_contribution_pct}%</td>
      <td><span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; border: 1px solid #cbd5e1;">${t.status}</span></td>
    </tr>
  `,
    )
    .join('')

  const pillarsHtml = pillars
    .map(
      (p) => `
    <div class="pillar-card">
      <div class="pillar-title">${p.title}</div>
      <div class="pillar-content">${p.content.replace(/\n/g, '<br/>')}</div>
    </div>
  `,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bao_Cao_Tai_Chinh_${(eventTitle || 'EventHub').replace(/[^a-zA-Z0-9_-]/g, '_')}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 0; font-size: 11px; line-height: 1.45; }
    .header-bar { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #2563eb; }
    .header-title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 2px 0; text-transform: uppercase; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .kpi-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b; }
    .kpi-val { font-size: 15px; font-weight: 800; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 5px 8px; border: 1px solid #cbd5e1; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; color: #1e293b; }
    .pillars-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
    .pillar-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fff; }
    .pillar-title { font-size: 10.5px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <div class="brand">EVENTHUB · FINANCIAL INTELLIGENCE</div>
      <div class="header-title">Báo Cáo Cố Vấn Doanh Thu & Quản Trị Tồn Kho</div>
      <div>Sự kiện: <strong>${eventTitle || 'Tất cả sự kiện'}</strong></div>
    </div>
    <div style="text-align: right;">
      <div>Kỳ phân tích: <strong>${dateRangeLabel || 'Tất cả thời gian'}</strong></div>
      <div>Thời điểm: <strong>${now}</strong></div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Financial Health Score</div>
      <div class="kpi-val">${intel.health_score || 0} / 100</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">RevPAS (Doanh thu / Chỗ)</div>
      <div class="kpi-val">${fmtCurrency(metrics.revpas || 0)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Vận tốc bán 7 ngày</div>
      <div class="kpi-val">${velocity.daily_tickets || 0} vé/ngày</div>
    </div>
  </div>

  ${tiers.length > 0 ? `<table><thead><tr><th>Hạng vé</th><th>Giá</th><th>Đã bán</th><th>Lấp đầy</th><th>Đóng góp DT</th><th>Trạng thái</th></tr></thead><tbody>${tierRowsHtml}</tbody></table>` : ''}

  <div class="pillars-grid">${pillarsHtml}</div>
</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 2000)
  }, 300)
}

// ─── Main Organizer Dashboard Component ──────────────────────────────────────

export function OrganizerDashboardPage() {
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [datePreset, setDatePreset] = useState('last30')
  const defaultRange = getDateRange('last30')
  const [customFrom, setCustomFrom] = useState(defaultRange.fromInput)
  const [customTo, setCustomTo] = useState(defaultRange.toInput)
  const [comparison, setComparison] = useState({
    enabled: false,
    mode: 'previousPeriod',
    from: '',
    to: '',
    label: '',
    rangeLabel: '',
  })

  const [stats, setStats] = useState(null)
  const [comparisonStats, setComparisonStats] = useState(null)
  const [ticketSales, setTicketSales] = useState(null)
  const [singleEventCheckin, setSingleEventCheckin] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // AI Executive Advisor State
  const [financialSummary, setFinancialSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [isAiReportExpanded, setIsAiReportExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  // 1. Fetch all organizer events for the smart picker
  useEffect(() => {
    fetchOrganizerEvents()
      .then((data) => setEvents(data || []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

  // 2. Load stats, ticket analytics, and checkin data
  const loadStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = getDateRange(datePreset, { from: customFrom, to: customTo })
      const params = { dateFrom: range.dateFrom, dateTo: range.dateTo }
      if (selectedEventId) params.eventId = selectedEventId

      const promises = [fetchRevenueStats(params)]

      // If single event is chosen, fetch detailed ticket analytics & checkin stats
      if (selectedEventId) {
        promises.push(fetchTicketSalesAnalytics(params).catch(() => null))
        promises.push(fetchCheckinStats(selectedEventId).catch(() => null))
      } else {
        promises.push(Promise.resolve(null))
        promises.push(Promise.resolve(null))
      }

      const [data, salesData, checkinData] = await Promise.all(promises)
      setStats(data)
      setTicketSales(salesData)
      setSingleEventCheckin(checkinData)

      // Comparison stats if enabled
      if (comparison.enabled) {
        const compRange = getDateRange('custom', { from: comparison.from, to: comparison.to })
        const compParams = { dateFrom: compRange.dateFrom, dateTo: compRange.dateTo }
        if (selectedEventId) compParams.eventId = selectedEventId
        const compData = await fetchRevenueStats(compParams)
        setComparisonStats(compData)
      } else {
        setComparisonStats(null)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu doanh thu.')
    } finally {
      setLoading(false)
    }
  }, [comparison, selectedEventId, datePreset, customFrom, customTo])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats()
  }, [loadStats])

  // 3. AI Financial Advisor Generator
  const loadFinancialSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const range = getDateRange(datePreset, { from: customFrom, to: customTo })
      const data = await generateFinancialSummary({
        eventId: selectedEventId || undefined,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      })
      setFinancialSummary(data)
      setIsAiReportExpanded(true)
    } catch (err) {
      setSummaryError(err.response?.data?.message || 'Không thể tạo báo cáo tài chính AI.')
    } finally {
      setSummaryLoading(false)
    }
  }, [datePreset, customFrom, customTo, selectedEventId])

  // Reset summary when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinancialSummary(null)
    setSummaryError('')
  }, [datePreset, customFrom, customTo, selectedEventId])

  const handleCopySummary = () => {
    if (!financialSummary?.summary) return
    navigator.clipboard.writeText(financialSummary.summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Active event object
  const activeEvent = useMemo(() => {
    if (!selectedEventId) return null
    return events.find((e) => e.id === selectedEventId) || null
  }, [events, selectedEventId])

  const overall = stats?.overall ?? {}
  const dashboard = stats?.dashboard ?? {}
  const subscription = stats?.subscription ?? {}
  const byEvent = stats?.by_event ?? []
  const dailyRevenue = stats?.daily_revenue ?? []
  const activeRange = getDateRange(datePreset, { from: customFrom, to: customTo })
  const activeRangeLabel = getDateRangeLabel(datePreset, activeRange)

  const handlePrintReport = () => {
    printExecutiveYieldReport({
      financialSummary,
      eventTitle: activeEvent ? activeEvent.title : 'Tất cả sự kiện',
      dateRangeLabel: activeRangeLabel,
    })
  }

  // Comparison metrics for Gross Revenue
  const comparisonGross = Number(comparisonStats?.overall?.gross_revenue || 0)
  const currentGross = Number(overall?.gross_revenue || 0)
  let grossTrend = null
  let grossTrendVal = null
  if (comparison.enabled && comparisonGross > 0) {
    const diffPct = ((currentGross - comparisonGross) / comparisonGross) * 100
    grossTrend = diffPct >= 0 ? 'up' : 'down'
    grossTrendVal = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`
  }

  // Tiers for single event view
  const singleEventTiers = useMemo(() => {
    if (!selectedEventId) return []
    if (ticketSales?.by_ticket_type?.length) return ticketSales.by_ticket_type
    if (financialSummary?.intelligence?.tier_breakdown?.length) return financialSummary.intelligence.tier_breakdown
    return []
  }, [selectedEventId, ticketSales, financialSummary])

  const avgOrderValue = Number(overall.total_orders || 0) > 0
    ? Math.round(Number(overall.gross_revenue || 0) / Number(overall.total_orders))
    : 0

  const [isExportingExcel, setIsExportingExcel] = useState(false)

  const handleExportExcel = async () => {
    setIsExportingExcel(true)
    try {
      await exportOrganizerRevenueToExcel({
        overall,
        dashboard,
        dailyRevenue,
        byEvent,
        tiers: singleEventTiers,
        activeEvent,
        activeRangeLabel,
        organizerUser: getStoredUser(),
      })
    } catch (err) {
      console.error('Lỗi khi xuất báo cáo doanh thu Excel:', err)
    } finally {
      setIsExportingExcel(false)
    }
  }

  return (
    <OrganizerPage
      title="Tổng quan"
      description="Trung tâm điều hành doanh thu, tốc độ bán vé, tình trạng check-in và cố vấn chiến lược AI."
    >
      {/* ── Master Filter & Context Controls ── */}
      <div className="relative z-20 mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          {/* Smart Event Picker */}
          <OrganizerEventPicker
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            loading={eventsLoading}
          />

          {/* Date Range Filter */}
          <DateRangeFilter
            value={datePreset}
            customFrom={customFrom}
            customTo={customTo}
            comparisonEnabled={comparison.enabled}
            comparisonMode={comparison.mode}
            comparisonFrom={comparison.from}
            comparisonTo={comparison.to}
            onPresetChange={setDatePreset}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            onComparisonChange={setComparison}
            compact
          />
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 self-end">
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            title="Làm mới dữ liệu"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0d172e] px-4 text-xs font-bold text-slate-200 shadow-sm transition hover:border-[#C99A47]/60 hover:text-[#E6C17A] disabled:opacity-50 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA] [html.light_&]:hover:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47]"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-[#E6C17A]' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            type="button"
            onClick={loadFinancialSummary}
            disabled={summaryLoading}
            className="btn-led-gold-sm h-10 shrink-0 active:scale-95"
            title="Đánh giá doanh thu"
          >
            <span className="btn-led-gold-sm-inner px-4 !text-sm font-black">
              {summaryLoading ? (
                <Loader2 className="size-4 animate-spin text-[#0D1B2A]" />
              ) : (
                <Sparkles className="size-4 text-[#0D1B2A]" />
              )}
              <span>{summaryLoading ? 'Đang phân tích...' : 'Đánh giá doanh thu'}</span>
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">
          {error}
        </div>
      )}

      {summaryError && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-300">
          {summaryError}
        </div>
      )}

      {/* ── Single Event Context Header (When Drilldown is Active) ── */}
      {selectedEventId && activeEvent && (
        <SingleEventBanner
          event={activeEvent}
          onBackToAll={() => setSelectedEventId('')}
        />
      )}

      {loading && !stats ? (
        <OrganizerPanel className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-cyan-400" />
            <p className="text-sm font-semibold text-slate-300">Đang tổng hợp số liệu vận hành...</p>
          </div>
        </OrganizerPanel>
      ) : stats ? (
        <>
          {/* ── SECTION 1: HERO FINANCIAL & OPERATIONS KPIS ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeroKpiCard
              label="Tổng doanh thu"
              value={fmtShort(overall.gross_revenue || overall.net_revenue)}
              sub={
                Number(overall.total_discount || 0) > 0
                  ? `Đã gồm chiết khấu ${fmtShort(overall.total_discount)}`
                  : 'Doanh thu bán vé trực tiếp'
              }
              trend={grossTrend}
              trendValue={grossTrendVal}
              icon={CircleDollarSign}
              tone="cyan"
            />

            <HeroKpiCard
              label="Vé đã bán"
              value={`${fmtNumber(dashboard.issued_tickets)} vé`}
              sub={`Trên tổng ${fmtNumber(dashboard.total_capacity)} vé khả dụng`}
              icon={TicketCheck}
              tone="emerald"
            />

            <HeroKpiCard
              label="Tỷ lệ lấp đầy"
              value={`${fmtNumber(dashboard.occupancy_rate, 1)}%`}
              sub="Hiệu suất tiêu thụ chỗ ngồi"
              progressBar={dashboard.occupancy_rate}
              icon={TrendingUp}
              tone="amber"
            />

            <HeroKpiCard
              label="Tổng đơn hàng"
              value={`${Number(overall.total_orders || 0).toLocaleString('vi-VN')} đơn`}
              sub={`Giá trị TB: ${fmtCurrency(avgOrderValue)} / đơn`}
              icon={ReceiptText}
              tone="purple"
            />
          </div>

          {/* ── SECTION 2: AI EXECUTIVE FINANCIAL BRIEFING (Collapsible) ── */}
          {summaryLoading && (
            <div className="mb-6 rounded-3xl border border-purple-500/40 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900/50 p-6 shadow-xl backdrop-blur-xl animate-pulse">
              <div className="flex items-center gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-purple-600/30 border border-purple-500/40 text-purple-300">
                  <Loader2 className="size-6 animate-spin" />
                </div>
                <div>
                  <h4 className="font-display text-sm font-black text-white">
                    Đang khởi tạo Cố vấn Doanh thu AI...
                  </h4>
                  <p className="mt-1 text-xs text-slate-300">
                    Phân tích toàn diện chỉ số RevPAS, gia tốc bán vé, rủi ro tồn kho và xây dựng kịch bản định giá What-If tối ưu...
                  </p>
                </div>
              </div>
            </div>
          )}

          {financialSummary && (
            <div className="mb-6 rounded-3xl border border-purple-500/30 bg-gradient-to-b from-purple-950/20 via-slate-900/60 to-slate-900/40 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 shadow-lg shadow-purple-500/25">
                    <Sparkles className="size-5 text-amber-200" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-black text-white">
                        Báo cáo Cố vấn Doanh thu AI (Executive Yield Intelligence)
                      </h3>
                      {financialSummary.source === 'RULE_BASED_FALLBACK' || financialSummary.model === 'financial-rule-fallback' ? (
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                          Chuẩn McKinsey Engine
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          AI Model ({financialSummary.model || 'eve-agent'})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {financialSummary.source === 'RULE_BASED_FALLBACK' || financialSummary.model === 'financial-rule-fallback'
                        ? 'Động cơ Quản trị Doanh thu chuẩn mực McKinsey · Phân tích định lượng RevPAS, Vận tốc, Pacing & Kịch bản'
                        : `Mô hình AI Yield Advisor (${financialSummary.model || 'eve-agent'}) · RevPAS, Sales Velocity, Pacing & Kịch bản What-If`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                  >
                    <Printer className="size-3.5" />
                    <span>In / Xuất PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAiReportExpanded((prev) => !prev)}
                    className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                  >
                    <span>{isAiReportExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
                    {isAiReportExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                </div>
              </div>

              {isAiReportExpanded && (
                <div className="mt-5 space-y-6">
                  {/* 6-Scorecard Bar */}
                  {financialSummary.intelligence && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Health Score</p>
                        <p className="mt-1 font-display text-2xl font-black text-white">
                          {financialSummary.intelligence.health_score}{' '}
                          <span className="text-xs font-normal text-slate-400">/100</span>
                        </p>
                        <span className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskClass(financialSummary.intelligence.risk_level)}`}>
                          {riskLabel(financialSummary.intelligence.risk_level)}
                        </span>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400">RevPAS (Doanh thu / Chỗ)</p>
                        <p className="mt-1 font-display text-lg font-black text-white">
                          {fmtCurrency(financialSummary.intelligence.metrics?.revpas || 0)}
                        </p>
                        <p className="mt-1 text-[11px] text-cyan-400 font-semibold">
                          Hiệu suất: {financialSummary.intelligence.metrics?.revpas_efficiency || 0}% giá vé
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Vận tốc bán 7 ngày</p>
                        <p className="mt-1 font-display text-lg font-black text-white">
                          {financialSummary.intelligence.velocity?.daily_tickets || 0}{' '}
                          <span className="text-xs font-normal text-slate-400">vé/ngày</span>
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-400 font-semibold">
                          {financialSummary.intelligence.momentum?.label || 'Ổn định'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Tồn kho & Pacing</p>
                        <p className="mt-1 font-display text-lg font-black text-amber-400">
                          {financialSummary.intelligence.inventory_pacing?.remaining_tickets || 0}{' '}
                          <span className="text-xs font-normal text-slate-400">vé tồn</span>
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {financialSummary.intelligence.inventory_pacing?.days_until_event !== null &&
                            financialSummary.intelligence.inventory_pacing?.days_until_event !== undefined
                            ? `Còn ${financialSummary.intelligence.inventory_pacing.days_until_event} ngày`
                            : 'Không giới hạn'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Giá vé TB & AOV</p>
                        <p className="mt-1 font-display text-lg font-black text-emerald-400">
                          {fmtCurrency(financialSummary.intelligence.metrics?.avg_ticket_price || 0)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          AOV: {fmtCurrency(financialSummary.intelligence.metrics?.avg_order_value || 0)}/đơn
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Dự báo 7 ngày tới</p>
                        <p className="mt-1 font-display text-lg font-black text-white">
                          {fmtCurrency(financialSummary.intelligence.forecast?.next_7_days_revenue || 0)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          ~{financialSummary.intelligence.forecast?.next_7_days_tickets || 0} vé
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 4 Strategic Pillars */}
                  {(() => {
                    const pillars = parseFinancialReport(financialSummary.summary)
                    if (pillars.length > 0) {
                      return (
                        <div className="grid gap-4 md:grid-cols-2">
                          {pillars.map((pillar, idx) => (
                            <ExecutivePillarCard
                              key={idx}
                              index={idx}
                              title={pillar.title}
                              content={pillar.content}
                            />
                          ))}
                        </div>
                      )
                    }
                    return (
                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                        <FormattedMarkdownContent text={financialSummary.summary} />
                      </div>
                    )
                  })()}

                  {/* What-If Revenue Scenario */}
                  {financialSummary.intelligence?.what_if && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-4 text-emerald-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                          Mô phỏng kích cầu doanh thu (What-If Revenue Modeling)
                        </h4>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                        Nếu kích cầu bán thêm{' '}
                        <strong className="text-white">
                          {Number(financialSummary.intelligence.what_if.additional_tickets || 0).toLocaleString('vi-VN')} vé
                        </strong>{' '}
                        với giá trung bình hiện tại ({fmtCurrency(financialSummary.intelligence.what_if.avg_ticket_price)}),
                        doanh thu dự kiến tăng thêm{' '}
                        <strong className="font-black text-emerald-400">
                          {fmtCurrency(financialSummary.intelligence.what_if.estimated_gross_revenue)}
                        </strong>
                        .
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 3: MAIN DUAL-VIEW ANALYTICS GRID ── */}
          <div className="grid gap-6 xl:grid-cols-12">
            {/* ── Left Column (Main Trends & Tables - 8 cols) ── */}
            <div className="space-y-6 xl:col-span-8 min-w-0">
              {/* Daily Revenue Chart Panel */}
              <OrganizerPanel>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-5 text-[#E6C17A]" />
                    <div>
                      <h3 className="font-bold text-white">
                        {selectedEventId ? 'Doanh thu sự kiện theo ngày' : 'Doanh thu bán vé theo ngày'}
                      </h3>
                      <p className="text-xs text-slate-400">{activeRangeLabel}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={isExportingExcel || !stats}
                    title="Xuất bảng số liệu và biểu đồ ra file Excel (.xlsx)"
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-xs font-bold text-emerald-300 shadow-sm transition hover:bg-emerald-500/20 hover:border-emerald-500/60 disabled:opacity-50 [html.light_&]:bg-emerald-50 [html.light_&]:border-emerald-400 [html.light_&]:text-emerald-700"
                  >
                    {isExportingExcel ? (
                      <Loader2 className="size-4 animate-spin text-emerald-400" />
                    ) : (
                      <FileSpreadsheet className="size-4 text-emerald-400" />
                    )}
                    <span>{isExportingExcel ? 'Đang xuất Excel...' : 'Xuất Excel'}</span>
                  </button>
                </div>

                <InteractiveRevenueChart
                  data={dailyRevenue}
                  comparisonData={comparisonStats?.daily_revenue}
                  comparisonEnabled={comparison.enabled}
                  comparisonLabel={comparison.label}
                />
              </OrganizerPanel>

              {/* Conditional: Portfolio Events Breakdown OR Single Event Ticket Tiers */}
              {selectedEventId ? (
                <SingleEventTicketTiersTable tiers={singleEventTiers} />
              ) : (
                <OrganizerPanel>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white">Hiệu suất doanh thu theo sự kiện</h3>
                    </div>
                    <span className="rounded-full border border-white/10 bg-slate-800/80 px-2.5 py-0.5 text-xs font-bold text-slate-300">
                      {byEvent.length} sự kiện
                    </span>
                  </div>

                  <EventsPerformanceTable
                    eventsRevenue={byEvent}
                    onDrillDownEvent={(id) => setSelectedEventId(id)}
                  />
                </OrganizerPanel>
              )}
            </div>

            {/* ── Right Column (Operations & Portfolio Health - 4 cols) ── */}
            <div className="space-y-6 xl:col-span-4 min-w-0">
              {/* Ticket Operations Widget */}
              <TicketOperationsPanel
                dashboard={dashboard}
                isSingleEvent={Boolean(selectedEventId)}
                checkinStats={singleEventCheckin}
              />

              {/* In Portfolio Mode: Show Portfolio Health & Next Event */}
              {!selectedEventId && (
                <PortfolioOverviewCard
                  dashboard={dashboard}
                  subscription={subscription}
                />
              )}

              {/* In Single Event Mode: Show Quick Operations Actions */}
              {selectedEventId && (
                <div className="rounded-2xl border border-white/5 bg-[#0e172e]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
                  <h3 className="mb-3 font-bold text-white [html.light_&]:text-[#0D1B2A]">Quản trị sự kiện nhanh</h3>
                  <div className="space-y-2 text-xs font-semibold">
                    <Link
                      to={`/organizer/checkin-dashboard?eventId=${selectedEventId}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 p-3 text-slate-200 transition hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-cyan-50/80 [html.light_&]:hover:text-cyan-800"
                    >
                      <span className="flex items-center gap-2">
                        <TicketCheck className="size-4 text-cyan-400 [html.light_&]:text-cyan-600" />
                        <span>Mở màn hình Check-in soát vé</span>
                      </span>
                      <ArrowRight className="size-3.5" />
                    </Link>

                    <Link
                      to={`/organizer/attendees?eventId=${selectedEventId}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 p-3 text-slate-200 transition hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-cyan-50/80 [html.light_&]:hover:text-cyan-800"
                    >
                      <span className="flex items-center gap-2">
                        <Users className="size-4 text-purple-400 [html.light_&]:text-purple-600" />
                        <span>Danh sách người tham dự & Xuất CSV</span>
                      </span>
                      <ArrowRight className="size-3.5" />
                    </Link>

                    <Link
                      to={`/organizer/events/${selectedEventId}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 p-3 text-slate-200 transition hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 [html.light_&]:text-[#0D1B2A] [html.light_&]:hover:bg-cyan-50/80 [html.light_&]:hover:text-cyan-800"
                    >
                      <span className="flex items-center gap-2">
                        <ExternalLink className="size-4 text-emerald-400 [html.light_&]:text-emerald-600" />
                        <span>Cài đặt thông tin sự kiện & Vé</span>
                      </span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </OrganizerPage>
  )
}
