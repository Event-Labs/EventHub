import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Award,
  BarChart2,
  BarChart3,
  Calendar,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Filter,
  Flame,
  Layers,
  LineChart,
  Loader2,
  Percent,
  PieChart,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Tag,
  Ticket,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { DateRangeFilter, getDateRange, getDateRangeLabel } from '@/components/DateRangeFilter.jsx'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchTicketSalesAnalytics } from '@/services/organizerOrders.js'
import { OrganizerEventPicker } from './OrganizerEventPicker.jsx'
import { OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

// ─── Formatters & Helpers ────────────────────────────────────────────────────

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

function fmtChartDay(value) {
  if (!value) return ''
  try {
    const raw = String(value)
    const part = raw.split('T')[0] || raw
    const tokens = part.split('-')
    if (tokens.length === 3) {
      return `${tokens[2]}/${tokens[1]}`
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value).slice(5, 10)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  } catch {
    return String(value).slice(5, 10)
  }
}

function fmtFullDate(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

// Spline path generator for smooth curves
function getSplinePath(points) {
  if (!points || points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

function getAreaPath(points, height) {
  if (!points || points.length === 0) return ''
  const linePath = getSplinePath(points)
  const lastPoint = points[points.length - 1]
  const firstPoint = points[0]
  return `${linePath} L ${lastPoint.x.toFixed(1)} ${height} L ${firstPoint.x.toFixed(1)} ${height} Z`
}

// ─── Vibrant Gradients for Highlighted Dashboard Sections ─────────────────────

const TICKET_PALETTE = [
  {
    name: 'Gold / Amber',
    from: '#F59E0B',
    to: '#E6C17A',
    accent: '#FBBF24',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(230, 193, 122, 0.4)',
    text: 'text-amber-300',
  },
  {
    name: 'Electric Cyan',
    from: '#0284c7',
    to: '#38bdf8',
    accent: '#38bdf8',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(56, 189, 248, 0.4)',
    text: 'text-cyan-300',
  },
  {
    name: 'Neon Violet',
    from: '#7c3aed',
    to: '#c084fc',
    accent: '#c084fc',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(192, 132, 252, 0.4)',
    text: 'text-purple-300',
  },
  {
    name: 'Emerald Mint',
    from: '#059669',
    to: '#34d399',
    accent: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(52, 211, 153, 0.4)',
    text: 'text-emerald-300',
  },
  {
    name: 'Coral Orange',
    from: '#ea580c',
    to: '#fdba74',
    accent: '#fb923c',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(251, 146, 60, 0.4)',
    text: 'text-orange-300',
  },
  {
    name: 'Rose Pink',
    from: '#e11d48',
    to: '#fda4af',
    accent: '#fb7185',
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(251, 133, 153, 0.4)',
    text: 'text-rose-300',
  },
  {
    name: 'Royal Blue',
    from: '#2563eb',
    to: '#818cf8',
    accent: '#818cf8',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(129, 140, 248, 0.4)',
    text: 'text-blue-300',
  },
  {
    name: 'Muted Slate',
    from: '#475569',
    to: '#94a3b8',
    accent: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.4)',
    text: 'text-slate-300',
  },
]

// ─── Occupancy Badge ─────────────────────────────────────────────────────────

function OccupancyBadge({ rate }) {
  const num = Number(rate) || 0
  if (num >= 80) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400 [html.light_&]:border-emerald-500/40 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
        {num}%
      </span>
    )
  }
  if (num >= 50) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-300 [html.light_&]:border-cyan-500/40 [html.light_&]:bg-cyan-50 [html.light_&]:text-cyan-700">
        {num}%
      </span>
    )
  }
  if (num > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300 [html.light_&]:border-amber-500/40 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-700">
        {num}%
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-semibold text-slate-400 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-500">
      0%
    </span>
  )
}

// ─── Component 1: Daily Combo Chart with WIDER BARS and FULL X & Y AXES ───────

function SalesRevenueComboChart({ data = [], dateRangeLabel = '' }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [mode, setMode] = useState('both') // 'both' | 'tickets' | 'revenue'
  const chartId = useId()

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
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-slate-950/40 text-center text-sm text-slate-400 [html.light_&]:bg-[#FAF4EB]">
        <BarChart3 className="size-8 text-slate-600 [html.light_&]:text-slate-400" />
        <p className="font-semibold text-slate-300 [html.light_&]:text-[#0D1B2A]">Chưa có dữ liệu bán vé trong khoảng thời gian này</p>
        <p className="text-xs text-slate-500 [html.light_&]:text-[#536b88]">Biểu đồ sẽ tự động xuất hiện khi có giao dịch phát sinh.</p>
      </div>
    )
  }

  const height = 230
  const totalTickets = data.reduce((s, d) => s + Number(d.tickets_sold || 0), 0)
  const totalRevenue = data.reduce((s, d) => s + Number(d.revenue || 0), 0)
  const totalOrders = data.reduce((s, d) => s + Number(d.orders || 0), 0)

  const maxTickets = Math.max(...data.map((d) => Number(d.tickets_sold || 0)), 1)
  const maxRevenue = Math.max(...data.map((d) => Number(d.revenue || 0)), 1)
  const peakDay = [...data].sort((a, b) => Number(b.tickets_sold || 0) - Number(a.tickets_sold || 0))[0]

  const count = data.length
  const w = containerWidth || 700

  // Margins for dual Y-axes (Left: Tickets, Right: Revenue)
  const padLeft = 52
  const padRight = 64
  const usableW = Math.max(w - padLeft - padRight, 80)
  const slotW = count > 0 ? usableW / count : 50

  // Significantly WIDER columns for visual impact!
  let barW = Math.min(Math.max(slotW * 0.55, 16), 72)
  if (count <= 5) barW = Math.min(Math.max(slotW * 0.48, 50), 76)
  else if (count <= 10) barW = Math.min(Math.max(slotW * 0.55, 36), 60)
  else if (count <= 20) barW = Math.min(Math.max(slotW * 0.6, 20), 42)

  const revenuePoints = data.map((d, i) => {
    const rev = Number(d.revenue || 0)
    const yRatio = maxRevenue > 0 ? rev / maxRevenue : 0
    return {
      x: padLeft + i * slotW + slotW / 2,
      y: height - yRatio * (height - 45) - 10,
    }
  })

  // Deduplicated integer ticks for left Y-axis (Tickets)
  const leftTicks = useMemo(() => {
    if (maxTickets <= 4) {
      return Array.from({ length: maxTickets + 1 }, (_, i) => ({
        val: i,
        yPos: height - (i / maxTickets) * (height - 45),
      }))
    }
    const raw = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
      val: Math.round(pct * maxTickets),
      yPos: height - pct * (height - 45),
    }))
    return raw.filter((item, index, self) => index === self.findIndex((t) => t.val === item.val))
  }, [maxTickets, height])

  // Ticks for right Y-axis (Revenue)
  const rightTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
      val: fmtShort(pct * maxRevenue),
      yPos: height - pct * (height - 45),
    }))
  }, [maxRevenue, height])

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : null

  return (
    <div>
      {/* Header with pill controls & quick indicators */}
      <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between [html.light_&]:border-[#C99A47]/20">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-400 shadow-sm [html.light_&]:bg-[#C99A47]/15 [html.light_&]:text-[#C99A47]">
            <BarChart3 className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">
              Biểu đồ kết hợp: Vé bán & Biến động doanh thu
            </h2>
            <p className="text-xs text-slate-400 [html.light_&]:text-[#536b88]">
              Cột gradient xanh đại diện sản lượng vé (trục trái) · Đường uốn lượn vàng thể hiện doanh thu (trục phải)
            </p>
          </div>
        </div>

        {/* View Mode Switcher Pill */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 text-xs font-semibold [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-[#FAF4EB]">
          <button
            type="button"
            onClick={() => setMode('both')}
            className={`rounded-lg px-2.5 py-1 transition ${
              mode === 'both'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88] [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            Kết hợp
          </button>
          <button
            type="button"
            onClick={() => setMode('tickets')}
            className={`rounded-lg px-2.5 py-1 transition ${
              mode === 'tickets'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold [html.light_&]:bg-[#C99A47]/20 [html.light_&]:text-[#0D1B2A]'
                : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88] [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            Vé bán
          </button>
          <button
            type="button"
            onClick={() => setMode('revenue')}
            className={`rounded-lg px-2.5 py-1 transition ${
              mode === 'revenue'
                ? 'bg-amber-500/20 text-amber-300 font-bold [html.light_&]:bg-[#C99A47]/20 [html.light_&]:text-[#0D1B2A]'
                : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88] [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            Doanh thu
          </button>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-sm" />
            <span className="text-slate-400 [html.light_&]:text-[#536b88]">Vé bán:</span>
            <strong className="text-white font-black [html.light_&]:text-[#0D1B2A]">
              {totalTickets.toLocaleString('vi-VN')} vé
            </strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#E6C17A] shadow-[0_0_8px_rgba(230,193,122,0.6)]" />
            <span className="text-slate-400 [html.light_&]:text-[#536b88]">Doanh thu:</span>
            <strong className="text-[#E6C17A] font-black [html.light_&]:text-[#0D1B2A]">
              {fmtCurrency(totalRevenue)}
            </strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 [html.light_&]:text-[#536b88]">Đơn hàng:</span>
            <strong className="text-slate-200 font-bold [html.light_&]:text-[#1B365D]">
              {totalOrders} đơn
            </strong>
          </div>
          {peakDay && Number(peakDay.tickets_sold) > 0 && (
            <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-400 [html.light_&]:border-emerald-500/40 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700">
              <Sparkles className="size-3" />
              <span>Đỉnh:</span>
              <strong>
                {peakDay.tickets_sold} vé ({fmtChartDay(peakDay.day)})
              </strong>
            </div>
          )}
        </div>

        {hoveredItem ? (
          <div className="flex items-center gap-2 rounded-lg border border-[#C99A47]/40 bg-[#C99A47]/10 px-2.5 py-1 text-xs font-bold text-[#E6C17A] shadow-sm [html.light_&]:bg-[#FAF4EB] [html.light_&]:text-[#0D1B2A]">
            <span>{fmtFullDate(hoveredItem.day)}:</span>
            <span>{Number(hoveredItem.tickets_sold || 0).toLocaleString('vi-VN')} vé</span>
            <span>·</span>
            <span>{fmtCurrency(hoveredItem.revenue)}</span>
          </div>
        ) : (
          <span className="text-slate-500 text-[11px] [html.light_&]:text-[#536b88]">
            <CalendarRange className="inline size-3 mr-1" />
            {dateRangeLabel}
          </span>
        )}
      </div>

      {/* SVG Canvas with WIDE BARS + FULL ENLARGED X/Y AXES */}
      <div ref={containerRef} className="w-full overflow-hidden select-none">
        <svg
          width="100%"
          height={height + 38}
          viewBox={`0 0 ${w} ${height + 38}`}
          className="block"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id={`comboBarGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id={`comboBarHover-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" stopOpacity="1" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={`comboRevArea-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E6C17A" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#C99A47" stopOpacity="0.01" />
            </linearGradient>
            <filter id={`glowGold-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#E6C17A" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1={padLeft}
              x2={w - padRight}
              y1={height - pct * (height - 45)}
              y2={height - pct * (height - 45)}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth={1}
              className="[html.light_&]:stroke-slate-200"
            />
          ))}

          {/* ── TRỤC HOÀNH (X-AXIS) ── */}
          <line
            x1={padLeft}
            x2={w - padRight}
            y1={height}
            y2={height}
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth={1.5}
            className="[html.light_&]:stroke-slate-300"
          />

          {/* ── TRỤC TUNG TRÁI: VÉ BÁN (LEFT Y-AXIS - ENLARGED) ── */}
          <line
            x1={padLeft}
            x2={padLeft}
            y1={16}
            y2={height}
            stroke="rgba(56, 189, 248, 0.55)"
            strokeWidth={1.8}
            className="[html.light_&]:stroke-cyan-600"
          />
          <text
            x={padLeft - 8}
            y={12}
            textAnchor="end"
            fontSize={12}
            fontWeight={800}
            fill="#38bdf8"
            className="[html.light_&]:fill-cyan-800"
          >
            (Vé)
          </text>
          {leftTicks.map((item, idx) => (
            <g key={`ly-${idx}`}>
              <line
                x1={padLeft - 5}
                x2={padLeft}
                y1={item.yPos}
                y2={item.yPos}
                stroke="rgba(56, 189, 248, 0.55)"
                strokeWidth={1.5}
              />
              <text
                x={padLeft - 9}
                y={item.yPos + 4}
                textAnchor="end"
                fontSize={11}
                fontWeight={700}
                fill="#7dd3fc"
                className="[html.light_&]:fill-cyan-800"
              >
                {item.val}
              </text>
            </g>
          ))}

          {/* ── TRỤC TUNG PHẢI: DOANH THU (RIGHT Y-AXIS - ENLARGED) ── */}
          <line
            x1={w - padRight}
            x2={w - padRight}
            y1={16}
            y2={height}
            stroke="rgba(230, 193, 122, 0.55)"
            strokeWidth={1.8}
            className="[html.light_&]:stroke-[#C99A47]"
          />
          <text
            x={w - padRight + 8}
            y={12}
            textAnchor="start"
            fontSize={12}
            fontWeight={800}
            fill="#E6C17A"
            className="[html.light_&]:fill-[#C99A47]"
          >
            (VNĐ)
          </text>
          {rightTicks.map((item, idx) => (
            <g key={`ry-${idx}`}>
              <line
                x1={w - padRight}
                x2={w - padRight + 5}
                y1={item.yPos}
                y2={item.yPos}
                stroke="rgba(230, 193, 122, 0.55)"
                strokeWidth={1.5}
              />
              <text
                x={w - padRight + 9}
                y={item.yPos + 4}
                textAnchor="start"
                fontSize={11}
                fontWeight={700}
                fill="#FBBF24"
                className="[html.light_&]:fill-[#C99A47]"
              >
                {item.val}
              </text>
            </g>
          ))}

          {/* Area fill for Revenue line */}
          {mode !== 'tickets' && (
            <path
              d={getAreaPath(revenuePoints, height)}
              fill={`url(#comboRevArea-${chartId})`}
              className="transition-all duration-300"
            />
          )}

          {/* WIDE Bars for Tickets Sold (No distracting overlapping texts on columns) */}
          {mode !== 'revenue' &&
            data.map((d, i) => {
              const tickets = Number(d.tickets_sold || 0)
              const barH = maxTickets > 0 && tickets > 0 ? Math.max((tickets / maxTickets) * (height - 50), 6) : 0
              const x = padLeft + i * slotW + (slotW - barW) / 2
              const y = height - barH
              const isHovered = hoveredIndex === i

              return (
                <g
                  key={`cbar-${d.day}-${i}`}
                  onMouseEnter={() => setHoveredIndex(i)}
                  className="cursor-pointer"
                >
                  {barH > 0 && (
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={8}
                      fill={isHovered ? `url(#comboBarHover-${chartId})` : `url(#comboBarGrad-${chartId})`}
                      className="transition-all duration-150"
                    />
                  )}
                </g>
              )
            })}

          {/* Smooth Curved Line for Revenue with glowing golden shine */}
          {mode !== 'tickets' && (
            <path
              d={getSplinePath(revenuePoints)}
              fill="none"
              stroke="#E6C17A"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#glowGold-${chartId})`}
              className="[html.light_&]:stroke-[#C99A47]"
            />
          )}

          {/* Markers on Revenue Line */}
          {mode !== 'tickets' &&
            revenuePoints.map((pt, i) => {
              const isHovered = hoveredIndex === i
              return (
                <circle
                  key={`cpt-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? '#FFFFFF' : '#E6C17A'}
                  stroke="#0b1329"
                  strokeWidth={2}
                  className="transition-all duration-150 [html.light_&]:stroke-white"
                />
              )
            })}

          {/* Hover Crosshair Column */}
          {hoveredIndex !== null && (
            <line
              x1={padLeft + hoveredIndex * slotW + slotW / 2}
              x2={padLeft + hoveredIndex * slotW + slotW / 2}
              y1={18}
              y2={height}
              stroke="rgba(230, 193, 122, 0.5)"
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
          )}

          {/* X Axis Date Ticks & Labels */}
          {data.map((d, i) => {
            const step = Math.max(1, Math.ceil(count / Math.max(Math.floor(w / 70), 2)))
            if (i % step !== 0 && i !== count - 1) return null
            const x = padLeft + i * slotW + slotW / 2
            return (
              <g key={`clbl-${d.day}-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={height}
                  y2={height + 5}
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth={1}
                  className="[html.light_&]:stroke-slate-300"
                />
                <text
                  x={x}
                  y={height + 20}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="#94a3b8"
                  className="[html.light_&]:fill-[#536b88]"
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

// ─── Component 2: Ticket Type Performance Chart (SMART FILTER + DUAL VIEW) ────

function TicketTypePerformanceChart({ data = [] }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [activeMetric, setActiveMetric] = useState('revenue') // 'revenue' | 'volume' | 'occupancy'
  const [viewType, setViewType] = useState('column') // 'column' | 'horizontal'
  const [filterMode, setFilterMode] = useState('activeOnly') // 'activeOnly' | 'top8' | 'all'
  const [hoveredId, setHoveredId] = useState(null)
  const chartId = useId()

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Calculate items with actual sales vs 0 sales
  const itemsWithSales = useMemo(() => {
    return (data || []).filter((d) => Number(d.sold_quantity || 0) > 0 || Number(d.revenue || 0) > 0)
  }, [data])

  // Smart filtered list based on user selection
  const displayData = useMemo(() => {
    if (!data?.length) return []
    let base = [...data]

    // Sort according to metric
    if (activeMetric === 'revenue') {
      base.sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    } else if (activeMetric === 'volume') {
      base.sort((a, b) => Number(b.sold_quantity || 0) - Number(a.sold_quantity || 0))
    } else {
      base.sort((a, b) => Number(b.occupancy_rate || 0) - Number(a.occupancy_rate || 0))
    }

    if (filterMode === 'activeOnly') {
      const active = base.filter((d) => Number(d.sold_quantity || 0) > 0 || Number(d.revenue || 0) > 0)
      return active.length > 0 ? active : base.slice(0, 6)
    }
    if (filterMode === 'top8') {
      return base.slice(0, 8)
    }
    // If 'all' and in column view, cap at 12 to prevent overlapping
    if (viewType === 'column' && base.length > 12) {
      return base.slice(0, 12)
    }
    return base
  }, [data, activeMetric, filterMode, viewType])

  const topSelling = useMemo(() => {
    if (!data?.length) return null
    return [...data].sort((a, b) => Number(b.sold_quantity || 0) - Number(a.sold_quantity || 0))[0]
  }, [data])

  const topRevenue = useMemo(() => {
    if (!data?.length) return null
    return [...data].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0]
  }, [data])

  if (!data || data.length === 0) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-slate-950/40 text-center text-sm text-slate-400 [html.light_&]:bg-[#FAF4EB]">
        <Layers className="size-8 text-slate-600 [html.light_&]:text-slate-400" />
        <p className="font-semibold text-slate-300 [html.light_&]:text-[#0D1B2A]">Chưa có thông tin loại vé</p>
      </div>
    )
  }

  const height = 260
  const count = displayData.length
  const w = containerWidth || 600
  const padLeft = 50
  const padRight = 32
  const usableW = Math.max(w - padLeft - padRight, 80)
  const slotW = count > 0 ? usableW / count : 80

  // Spacious column width so columns are never squashed
  let barW = Math.min(Math.max(slotW * 0.48, 22), 64)
  if (count <= 4) barW = Math.min(Math.max(slotW * 0.45, 48), 70)
  else if (count <= 8) barW = Math.min(Math.max(slotW * 0.5, 34), 58)

  const maxRevenue = Math.max(...displayData.map((d) => Number(d.revenue || 0)), 1)
  const maxVolume = Math.max(...displayData.map((d) => Math.max(Number(d.capacity || 0), Number(d.sold_quantity || 0))), 1)

  return (
    <div>
      {/* Top Header & Multi-Mode Controls */}
      <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between [html.light_&]:border-[#C99A47]/20">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-[#C99A47]/15 text-[#E6C17A] shadow-sm [html.light_&]:text-[#C99A47]">
            <Layers className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">
                Hiệu suất & Cơ cấu theo Loại vé
              </h2>
              <span className="rounded-full border border-[#C99A47]/30 bg-[#C99A47]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#E6C17A] [html.light_&]:bg-[#FAF4EB] [html.light_&]:text-[#0D1B2A]">
                {itemsWithSales.length > 0 ? `${itemsWithSales.length} vé có doanh số / ${data.length} vé` : `${data.length} hạng vé`}
              </span>
            </div>
            <p className="text-xs text-slate-400 [html.light_&]:text-[#536b88]">
              Biểu đồ trực quan doanh thu, số lượng vé bán so với sức chứa và tỷ lệ lấp đầy
            </p>
          </div>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Smart Filter Pills */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 text-xs font-semibold [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-[#FAF4EB]">
            <button
              type="button"
              onClick={() => setFilterMode('activeOnly')}
              title="Chỉ hiển thị các vé có phát sinh doanh số / vé bán"
              className={`rounded-lg px-2.5 py-1 transition ${
                filterMode === 'activeOnly'
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Có doanh số ({itemsWithSales.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('top8')}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterMode === 'top8'
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Top 8
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('all')
                setViewType('horizontal') // Automatically switch to horizontal view to cleanly show all without squashing!
              }}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterMode === 'all'
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Tất cả ({data.length})
            </button>
          </div>

          {/* Metric Selector */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 text-xs font-semibold [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-[#FAF4EB]">
            <button
              type="button"
              onClick={() => setActiveMetric('revenue')}
              className={`rounded-lg px-2.5 py-1 transition ${
                activeMetric === 'revenue'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold [html.light_&]:bg-[#C99A47]/20 [html.light_&]:text-[#0D1B2A]'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Doanh thu
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('volume')}
              className={`rounded-lg px-2.5 py-1 transition ${
                activeMetric === 'volume'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold [html.light_&]:bg-[#C99A47]/20 [html.light_&]:text-[#0D1B2A]'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Vé bán
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('occupancy')}
              className={`rounded-lg px-2.5 py-1 transition ${
                activeMetric === 'occupancy'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold [html.light_&]:bg-[#C99A47]/20 [html.light_&]:text-[#0D1B2A]'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Lấp đầy
            </button>
          </div>

          {/* Display Style: Columns vs Horizontal Bars */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 text-xs font-semibold [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-[#FAF4EB]">
            <button
              type="button"
              onClick={() => setViewType('column')}
              title="Xem biểu đồ cột đứng"
              className={`rounded-lg px-2 py-1 transition ${
                viewType === 'column'
                  ? 'bg-white/15 text-white font-bold [html.light_&]:bg-[#C99A47]/30 [html.light_&]:text-[#0D1B2A]'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Cột đứng
            </button>
            <button
              type="button"
              onClick={() => setViewType('horizontal')}
              title="Xem biểu đồ thanh ngang xếp hạng"
              className={`rounded-lg px-2 py-1 transition ${
                viewType === 'horizontal'
                  ? 'bg-white/15 text-white font-bold [html.light_&]:bg-[#C99A47]/30 [html.light_&]:text-[#0D1B2A]'
                  : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
              }`}
            >
              Thanh ngang
            </button>
          </div>
        </div>
      </div>

      {/* Main Visual Display: Column View OR Horizontal Ranked Bars */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Side: SVG Graphic (7 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between">
          {viewType === 'column' ? (
            /* ── VIEW 1: SPACIOUS NON-OVERLAPPING VERTICAL COLUMN CHART ── */
            <div ref={containerRef} className="w-full overflow-hidden select-none">
              <svg
                width="100%"
                height={height + 54}
                viewBox={`0 0 ${w} ${height + 54}`}
                className="block"
                onMouseLeave={() => setHoveredId(null)}
              >
                <defs>
                  {TICKET_PALETTE.map((pal, idx) => (
                    <linearGradient key={idx} id={`tgrad-${idx}-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={pal.to} stopOpacity="0.95" />
                      <stop offset="100%" stopColor={pal.from} stopOpacity="0.35" />
                    </linearGradient>
                  ))}
                  {TICKET_PALETTE.map((pal, idx) => (
                    <linearGradient key={`h-${idx}`} id={`tgrad-h-${idx}-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={pal.accent} stopOpacity="1" />
                      <stop offset="100%" stopColor={pal.from} stopOpacity="0.8" />
                    </linearGradient>
                  ))}
                </defs>

                {/* Background Guideline Axis */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                  <g key={pct}>
                    <line
                      x1={padLeft}
                      x2={w - padRight}
                      y1={height - pct * (height - 50)}
                      y2={height - pct * (height - 50)}
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth={1}
                      className="[html.light_&]:stroke-slate-200"
                    />
                    <text
                      x={padLeft - 8}
                      y={height - pct * (height - 50) + 4}
                      textAnchor="end"
                      fontSize={11}
                      fontWeight={700}
                      fill="#94a3b8"
                      className="[html.light_&]:fill-slate-600"
                    >
                      {activeMetric === 'revenue'
                        ? fmtShort(pct * maxRevenue)
                        : activeMetric === 'volume'
                          ? Math.round(pct * maxVolume)
                          : `${Math.round(pct * 100)}%`}
                    </text>
                  </g>
                ))}

                {/* Trục hoành (X-Axis line) */}
                <line
                  x1={padLeft}
                  x2={w - padRight}
                  y1={height}
                  y2={height}
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth={1.5}
                  className="[html.light_&]:stroke-slate-300"
                />

                {/* Trục tung (Y-Axis line) */}
                <line
                  x1={padLeft}
                  x2={padLeft}
                  y1={15}
                  y2={height}
                  stroke="rgba(201, 154, 71, 0.55)"
                  strokeWidth={1.8}
                  className="[html.light_&]:stroke-[#C99A47]"
                />

                {/* Render Multi-color Column Bars */}
                {displayData.map((d, i) => {
                  const pal = TICKET_PALETTE[i % TICKET_PALETTE.length]
                  const isHovered = hoveredId === d.ticket_type_id
                  const x = padLeft + i * slotW + (slotW - barW) / 2

                  const rev = Number(d.revenue || 0)
                  const sold = Number(d.sold_quantity || 0)
                  const cap = Number(d.capacity || 0)
                  const occ = Number(d.occupancy_rate || 0)

                  let barH = 0
                  let valueLabel = ''

                  if (activeMetric === 'revenue') {
                    barH = maxRevenue > 0 && rev > 0 ? (rev / maxRevenue) * (height - 50) : 4
                    valueLabel = fmtShort(rev)
                  } else if (activeMetric === 'volume') {
                    barH = maxVolume > 0 && sold > 0 ? (sold / maxVolume) * (height - 50) : 4
                    valueLabel = `${sold} vé`
                  } else {
                    barH = (occ / 100) * (height - 50)
                    valueLabel = `${occ}%`
                  }

                  const y = height - barH

                  return (
                    <g
                      key={d.ticket_type_id || i}
                      onMouseEnter={() => setHoveredId(d.ticket_type_id)}
                      className="cursor-pointer transition-all duration-200"
                    >
                      {/* Capacity pillar backdrop for Volume mode */}
                      {activeMetric === 'volume' && cap > 0 && (
                        <rect
                          x={x}
                          y={height - (cap / maxVolume) * (height - 50)}
                          width={barW}
                          height={(cap / maxVolume) * (height - 50)}
                          rx={8}
                          fill="rgba(255, 255, 255, 0.04)"
                          stroke="rgba(255, 255, 255, 0.08)"
                          strokeWidth={1}
                          className="[html.light_&]:fill-slate-100 [html.light_&]:stroke-slate-200"
                        />
                      )}

                      {/* Gradient Main Bar */}
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(barH, 4)}
                        rx={8}
                        fill={isHovered ? `url(#tgrad-h-${i % TICKET_PALETTE.length}-${chartId})` : `url(#tgrad-${i % TICKET_PALETTE.length}-${chartId})`}
                        stroke={isHovered ? pal.accent : 'none'}
                        strokeWidth={isHovered ? 2 : 0}
                        className="transition-all duration-200"
                      />

                      {/* Value Badge Floating on top of bar */}
                      <text
                        x={x + barW / 2}
                        y={Math.max(y - 7, 12)}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={isHovered ? pal.accent : '#e2e8f0'}
                        className="[html.light_&]:fill-[#0D1B2A]"
                      >
                        {valueLabel}
                      </text>

                      {/* X-Axis Tick */}
                      <line
                        x1={x + barW / 2}
                        x2={x + barW / 2}
                        y1={height}
                        y2={height + 5}
                        stroke="rgba(255, 255, 255, 0.2)"
                        strokeWidth={1}
                      />

                      {/* X-Axis Ticket Name */}
                      <text
                        x={x + barW / 2}
                        y={height + 20}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill={isHovered ? pal.accent : '#cbd5e1'}
                        className="[html.light_&]:fill-[#1B365D]"
                      >
                        {d.ticket_type_name.length > 12 ? `${d.ticket_type_name.slice(0, 11)}…` : d.ticket_type_name}
                      </text>

                      {/* Sub-label: Unit Price */}
                      <text
                        x={x + barW / 2}
                        y={height + 36}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={500}
                        fill="#64748b"
                        className="[html.light_&]:fill-[#536b88]"
                      >
                        {fmtShort(d.unit_price)} đ
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          ) : (
            /* ── VIEW 2: RANKED HORIZONTAL PROGRESS BARS ── */
            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[300px] pr-2">
              {displayData.map((d, i) => {
                const pal = TICKET_PALETTE[i % TICKET_PALETTE.length]
                const isHovered = hoveredId === d.ticket_type_id
                const rev = Number(d.revenue || 0)
                const sold = Number(d.sold_quantity || 0)
                const cap = Number(d.capacity || 0)
                const occ = Number(d.occupancy_rate || 0)

                const ratio =
                  activeMetric === 'revenue'
                    ? maxRevenue > 0 ? rev / maxRevenue : 0
                    : activeMetric === 'volume'
                      ? maxVolume > 0 ? sold / maxVolume : 0
                      : occ / 100

                return (
                  <div
                    key={d.ticket_type_id || i}
                    onMouseEnter={() => setHoveredId(d.ticket_type_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`rounded-xl border p-2.5 transition ${
                      isHovered
                        ? 'border-[#C99A47] bg-[#C99A47]/15 shadow-sm [html.light_&]:bg-[#FAF4EB]'
                        : 'border-white/5 bg-slate-900/40 hover:border-white/15 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/20'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: pal.accent, boxShadow: `0 0 6px ${pal.accent}` }}
                        />
                        <strong className="text-white [html.light_&]:text-[#0D1B2A]">
                          {d.ticket_type_name}
                        </strong>
                        <span className="text-[11px] text-slate-400 [html.light_&]:text-[#536b88]">
                          ({fmtCurrency(d.unit_price)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-[#E6C17A] [html.light_&]:text-[#0D1B2A]">
                          {activeMetric === 'revenue'
                            ? fmtCurrency(rev)
                            : activeMetric === 'volume'
                              ? `${sold} / ${cap > 0 ? cap : '∞'} vé`
                              : `${occ}% lấp đầy`}
                        </span>
                        <OccupancyBadge rate={occ} />
                      </div>
                    </div>

                    {/* Progress track */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 [html.light_&]:bg-slate-200">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(ratio * 100, 2)}%`,
                          background: `linear-gradient(to right, ${pal.from}, ${pal.to})`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Side: Highlight Cards & Legend (5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between gap-3">
          {/* Top Highlight Badges */}
          <div className="grid grid-cols-2 gap-2.5">
            {topSelling && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 [html.light_&]:bg-amber-50/80 [html.light_&]:border-amber-400/30">
                <div className="flex items-center gap-1.5 text-amber-400 [html.light_&]:text-amber-700">
                  <Crown className="size-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Bán chạy nhất</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {topSelling.ticket_type_name}
                </p>
                <p className="text-[11px] font-black text-amber-300 [html.light_&]:text-amber-700">
                  {Number(topSelling.sold_quantity || 0).toLocaleString()} vé
                </p>
              </div>
            )}

            {topRevenue && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 [html.light_&]:bg-emerald-50/80 [html.light_&]:border-emerald-400/30">
                <div className="flex items-center gap-1.5 text-emerald-400 [html.light_&]:text-emerald-700">
                  <Award className="size-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Doanh thu đỉnh</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {topRevenue.ticket_type_name}
                </p>
                <p className="text-[11px] font-black text-emerald-300 [html.light_&]:text-emerald-700">
                  {fmtShort(topRevenue.revenue)}
                </p>
              </div>
            )}
          </div>

          {/* Structured Ticket Type Rows with Glowing Dots */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[220px] pr-1">
            {displayData.map((tt, idx) => {
              const pal = TICKET_PALETTE[idx % TICKET_PALETTE.length]
              const isHovered = hoveredId === tt.ticket_type_id
              const sold = Number(tt.sold_quantity || 0)
              const cap = Number(tt.capacity || 0)
              const rev = Number(tt.revenue || 0)
              const occ = Number(tt.occupancy_rate || 0)

              return (
                <div
                  key={tt.ticket_type_id}
                  onMouseEnter={() => setHoveredId(tt.ticket_type_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-2 transition ${
                    isHovered
                      ? 'border-[#C99A47] bg-[#C99A47]/15 shadow-sm [html.light_&]:bg-[#FAF4EB] [html.light_&]:border-[#C99A47]'
                      : 'border-white/5 bg-slate-900/40 hover:border-white/15 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/20'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full shadow-sm"
                      style={{ backgroundColor: pal.accent, boxShadow: `0 0 6px ${pal.accent}` }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white [html.light_&]:text-[#0D1B2A]">
                        {tt.ticket_type_name}
                      </p>
                      <p className="text-[10px] text-slate-400 [html.light_&]:text-[#536b88]">
                        {fmtCurrency(tt.unit_price)} · {sold}/{cap > 0 ? cap : '∞'} vé
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <strong className="text-xs font-black text-[#E6C17A] [html.light_&]:text-[#0D1B2A]">
                      {fmtShort(rev)}
                    </strong>
                    <OccupancyBadge rate={occ} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Component 3: Donut Chart (Ticket Revenue & Volume Distribution - NO OVERFLOW) ──

function RevenueShareDonutChart({ data = [] }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [activeMetric, setActiveMetric] = useState('revenue') // 'revenue' | 'quantity'

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => Number(b[activeMetric] || 0) - Number(a[activeMetric] || 0))
  }, [data, activeMetric])

  const topLimit = 5
  const segments = useMemo(() => {
    if (!sorted.length) return []
    const visible = sorted.slice(0, topLimit)
    const rest = sorted.slice(topLimit)
    const result = visible.map((item, idx) => ({
      id: item.ticket_type_id,
      label: item.ticket_type_name,
      value: Number(activeMetric === 'revenue' ? item.revenue : item.sold_quantity) || 0,
      color: TICKET_PALETTE[idx % TICKET_PALETTE.length].accent,
    }))

    if (rest.length > 0) {
      const otherVal = rest.reduce((s, r) => s + (Number(activeMetric === 'revenue' ? r.revenue : r.sold_quantity) || 0), 0)
      if (otherVal > 0) {
        result.push({
          id: 'other',
          label: `Khác (${rest.length})`,
          value: otherVal,
          color: '#94a3b8',
        })
      }
    }
    return result.filter((s) => s.value > 0)
  }, [sorted, activeMetric])

  const total = useMemo(() => segments.reduce((s, seg) => s + seg.value, 0), [segments])

  // Compact size so it never overflows 2-column layout
  const size = 154
  const stroke = 19
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  const activeSegment = hoveredIdx !== null ? segments[hoveredIdx] : null

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/10 pb-3 [html.light_&]:border-[#C99A47]/20">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700">
            <PieChart className="size-4" />
          </div>
          <h2 className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
            Tỷ trọng doanh thu theo hạng vé
          </h2>
        </div>

        {/* Metric Selector */}
        <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px] font-semibold [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-[#FAF4EB]">
          <button
            type="button"
            onClick={() => { setActiveMetric('revenue'); setHoveredIdx(null); }}
            className={`rounded-md px-2 py-0.5 transition ${
              activeMetric === 'revenue'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
            }`}
          >
            Doanh thu
          </button>
          <button
            type="button"
            onClick={() => { setActiveMetric('quantity'); setHoveredIdx(null); }}
            className={`rounded-md px-2 py-0.5 transition ${
              activeMetric === 'quantity'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:text-[#536b88]'
            }`}
          >
            Số lượng
          </button>
        </div>
      </div>

      {total <= 0 ? (
        <div className="flex h-44 items-center justify-center text-xs text-slate-400 [html.light_&]:text-[#536b88]">
          Chưa có phát sinh số liệu theo loại vé.
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row overflow-hidden">
          {/* Donut Graphic */}
          <div className="relative shrink-0 select-none">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth={stroke}
                className="[html.light_&]:stroke-slate-200"
              />
              {segments.map((seg, idx) => {
                const pct = seg.value / total
                const dash = pct * circumference
                const isHovered = hoveredIdx === idx
                const segCircle = (
                  <circle
                    key={seg.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={isHovered ? stroke + 3 : stroke}
                    strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
                    strokeDashoffset={-offset}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                )
                offset += dash
                return segCircle
              })}
            </svg>

            {/* Center Label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-black text-white [html.light_&]:text-[#0D1B2A]">
                {activeSegment
                  ? `${((activeSegment.value / total) * 100).toFixed(1)}%`
                  : activeMetric === 'revenue'
                    ? fmtShort(total)
                    : `${total.toLocaleString()} vé`}
              </p>
              <p className="max-w-[78px] truncate text-[9px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                {activeSegment ? activeSegment.label : 'Tổng'}
              </p>
            </div>
          </div>

          {/* Segment Details & Progress List (Strictly Bounded Width - NO OVERFLOW) */}
          <div className="grid w-full min-w-0 flex-1 gap-1.5 text-xs overflow-hidden">
            {segments.map((seg, idx) => {
              const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
              const isHovered = hoveredIdx === idx
              return (
                <div
                  key={seg.id}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-2 transition min-w-0 overflow-hidden ${
                    isHovered
                      ? 'border-[#C99A47] bg-[#C99A47]/10 [html.light_&]:bg-[#F8F3EA]'
                      : 'border-white/5 bg-slate-900/40 hover:border-white/15 [html.light_&]:bg-[#FAF4EB] [html.light_&]:border-[#C99A47]/20'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span
                      className="truncate font-semibold text-slate-200 [html.light_&]:text-[#0D1B2A] text-xs"
                      title={seg.label}
                    >
                      {seg.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-right">
                    <span className="text-[11px] font-bold text-slate-400 [html.light_&]:text-[#536b88]">
                      {pct}%
                    </span>
                    <strong className="text-white font-bold [html.light_&]:text-[#0D1B2A] text-xs whitespace-nowrap">
                      {activeMetric === 'revenue' ? fmtShort(seg.value) : `${seg.value} vé`}
                    </strong>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Component 4: Cumulative Velocity Line Chart WITH X & Y AXES ─────────────

function CumulativeVelocityLineChart({ data = [] }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const chartId = useId()

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const cumulativeData = useMemo(() => {
    let running = 0
    return data.map((d) => {
      running += Number(d.tickets_sold || 0)
      return { day: d.day, count: running, daily: Number(d.tickets_sold || 0) }
    })
  }, [data])

  const maxCumulative = Math.max(...cumulativeData.map((d) => d.count), 1)

  const height = 185
  const count = cumulativeData.length
  const w = containerWidth || 450
  const padLeft = 48
  const padRight = 24
  const usableW = Math.max(w - padLeft - padRight, 80)
  const slotW = count > 0 ? usableW / count : 30

  const points = cumulativeData.map((d, i) => {
    const yRatio = maxCumulative > 0 ? d.count / maxCumulative : 0
    return {
      x: padLeft + i * slotW + slotW / 2,
      y: height - yRatio * (height - 40) - 10,
    }
  })

  // Clean deduplicated ticks for Y-axis
  const yTicks = useMemo(() => {
    if (maxCumulative <= 4) {
      return Array.from({ length: maxCumulative + 1 }, (_, i) => ({
        val: i,
        yPos: height - (i / maxCumulative) * (height - 40),
      }))
    }
    const raw = [0, 0.33, 0.66, 1].map((pct) => ({
      val: Math.round(pct * maxCumulative),
      yPos: height - pct * (height - 40),
    }))
    return raw.filter((item, index, self) => index === self.findIndex((t) => t.val === item.val))
  }, [maxCumulative, height])

  const totalCumulative = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].count : 0

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      {/* Header with trend pill matching reference image */}
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3 [html.light_&]:border-[#C99A47]/20">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-amber-500/15 text-amber-300 [html.light_&]:bg-[#C99A47]/15 [html.light_&]:text-[#C99A47]">
            <LineChart className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
              Tốc độ tích lũy bán vé (Pacing)
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-300 [html.light_&]:bg-[#FAF4EB] [html.light_&]:text-[#0D1B2A]">
          <TrendingUp className="size-3 text-amber-400" />
          <span>{totalCumulative} vé tích lũy</span>
        </div>
      </div>

      {cumulativeData.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-xs text-slate-400 [html.light_&]:text-[#536b88]">
          Chưa có chuỗi ngày bán vé.
        </div>
      ) : (
        <div ref={containerRef} className="w-full overflow-hidden select-none">
          <svg
            width="100%"
            height={height + 34}
            viewBox={`0 0 ${w} ${height + 34}`}
            className="block"
          >
            <defs>
              <linearGradient id={`cumulArea-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#C99A47" stopOpacity="0.0" />
              </linearGradient>
              <filter id={`glowGoldLine-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#FBBF24" floodOpacity="0.6" />
              </filter>
            </defs>

            {/* Grid lines */}
            {[0, 0.33, 0.66, 1].map((pct) => (
              <line
                key={pct}
                x1={padLeft}
                x2={w - padRight}
                y1={height - pct * (height - 40)}
                y2={height - pct * (height - 40)}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth={1}
                className="[html.light_&]:stroke-slate-200"
              />
            ))}

            {/* ── TRỤC HOÀNH (X-AXIS) ── */}
            <line
              x1={padLeft}
              x2={w - padRight}
              y1={height}
              y2={height}
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth={1.5}
              className="[html.light_&]:stroke-slate-300"
            />

            {/* ── TRỤC TUNG (Y-AXIS - ENLARGED) ── */}
            <line
              x1={padLeft}
              x2={padLeft}
              y1={16}
              y2={height}
              stroke="rgba(251, 191, 36, 0.55)"
              strokeWidth={1.8}
              className="[html.light_&]:stroke-[#C99A47]"
            />
            <text
              x={padLeft - 8}
              y={12}
              textAnchor="end"
              fontSize={12}
              fontWeight={800}
              fill="#FBBF24"
              className="[html.light_&]:fill-[#C99A47]"
            >
              (Vé)
            </text>
            {yTicks.map((item, idx) => (
              <g key={`yval-${idx}`}>
                <line
                  x1={padLeft - 5}
                  x2={padLeft}
                  y1={item.yPos}
                  y2={item.yPos}
                  stroke="rgba(251, 191, 36, 0.55)"
                  strokeWidth={1.5}
                />
                <text
                  x={padLeft - 9}
                  y={item.yPos + 4}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={700}
                  fill="#FBBF24"
                  className="[html.light_&]:fill-[#C99A47]"
                >
                  {item.val}
                </text>
              </g>
            ))}

            {/* Area */}
            <path
              d={getAreaPath(points, height)}
              fill={`url(#cumulArea-${chartId})`}
            />

            {/* Line with golden glow */}
            <path
              d={getSplinePath(points)}
              fill="none"
              stroke="#FBBF24"
              strokeWidth={2.8}
              strokeLinecap="round"
              filter={`url(#glowGoldLine-${chartId})`}
              className="[html.light_&]:stroke-[#C99A47]"
            />

            {/* Data Points */}
            {points.map((pt, i) => (
              <circle
                key={`cp-${i}`}
                cx={pt.x}
                cy={pt.y}
                r={i === points.length - 1 ? 5.5 : 3.5}
                fill={i === points.length - 1 ? '#FBBF24' : '#ffffff'}
                stroke="#F59E0B"
                strokeWidth={1.5}
              />
            ))}

            {/* X Labels */}
            {cumulativeData.map((d, i) => {
              const step = Math.max(1, Math.ceil(count / Math.max(Math.floor(w / 70), 2)))
              if (i % step !== 0 && i !== count - 1) return null
              const x = padLeft + i * slotW + slotW / 2
              return (
                <g key={`clbl-${i}`}>
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
                    fontWeight={600}
                    fill="#94a3b8"
                    className="[html.light_&]:fill-[#536b88]"
                  >
                    {fmtChartDay(d.day)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}

// ─── Component 5: Event Occupancy Column Chart (Inspired by 'Eanculations') ───

function EventOccupancyColumnChart({ data = [], height = 240 }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const chartId = useId()

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  if (!data?.length) return null

  const chartData = [...data]
    .sort((a, b) => Number(b.occupancy_rate || 0) - Number(a.occupancy_rate || 0))
    .slice(0, 8)

  const w = containerWidth || 600
  const count = chartData.length
  const padLeft = 48
  const padRight = 24
  const usableW = Math.max(w - padLeft - padRight, 80)
  const slotW = count > 0 ? usableW / count : 70
  const barW = Math.min(Math.max(slotW * 0.45, 18), 44)
  const plotH = height - 60

  return (
    <div ref={containerRef} className="w-full overflow-hidden select-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-slate-400 [html.light_&]:text-[#536b88]">
          Hiển thị top {chartData.length} sự kiện có tỷ lệ lấp đầy cao nhất
        </p>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span className="flex items-center gap-1.5 text-emerald-400 [html.light_&]:text-emerald-700">
            <span className="size-2 rounded-full bg-emerald-400" /> ≥80% Tốt
          </span>
          <span className="flex items-center gap-1.5 text-cyan-400 [html.light_&]:text-cyan-700">
            <span className="size-2 rounded-full bg-cyan-400" /> ≥50% Ổn
          </span>
          <span className="flex items-center gap-1.5 text-amber-400 [html.light_&]:text-amber-700">
            <span className="size-2 rounded-full bg-amber-400" /> &lt;50% Thấp
          </span>
        </div>
      </div>

      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} className="block">
        <defs>
          <linearGradient id={`occGradEmerald-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={`occGradCyan-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={`occGradAmber-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Y Axis percentage guidelines */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={padLeft}
              x2={w - padRight}
              y1={plotH - (pct / 100) * (plotH - 25) + 15}
              y2={plotH - (pct / 100) * (plotH - 25) + 15}
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth={1}
              className="[html.light_&]:stroke-slate-200"
            />
            <text
              x={padLeft - 8}
              y={plotH - (pct / 100) * (plotH - 25) + 19}
              textAnchor="end"
              fontSize={11}
              fontWeight={700}
              fill="#94a3b8"
            >
              {pct}%
            </text>
          </g>
        ))}

        {/* Trục hoành (X-Axis) */}
        <line
          x1={padLeft}
          x2={w - padRight}
          y1={plotH + 15}
          y2={plotH + 15}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth={1.5}
          className="[html.light_&]:stroke-slate-300"
        />

        {/* Trục tung (Y-Axis) */}
        <line
          x1={padLeft}
          x2={padLeft}
          y1={15}
          y2={plotH + 15}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth={1.5}
          className="[html.light_&]:stroke-slate-300"
        />

        {chartData.map((ev, i) => {
          const occ = Math.max(0, Math.min(100, Number(ev.occupancy_rate || 0)))
          const barH = (occ / 100) * (plotH - 25)
          const x = padLeft + i * slotW + (slotW - barW) / 2
          const y = plotH - barH + 15

          const gradId =
            occ >= 80
              ? `url(#occGradEmerald-${chartId})`
              : occ >= 50
                ? `url(#occGradCyan-${chartId})`
                : `url(#occGradAmber-${chartId})`

          const textColor = occ >= 80 ? '#34d399' : occ >= 50 ? '#38bdf8' : '#fbbf24'
          const label = ev.event_title.length > 14 ? `${ev.event_title.slice(0, 13)}…` : ev.event_title

          return (
            <g key={ev.event_id || i} className="cursor-pointer group">
              {/* Background Capacity Bar Track */}
              <rect
                x={x}
                y={15}
                width={barW}
                height={plotH - 10}
                rx={6}
                fill="rgba(255, 255, 255, 0.03)"
                className="[html.light_&]:fill-slate-100"
              />

              {/* Occupancy Fill Bar */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 3)}
                rx={6}
                fill={gradId}
                className="transition-all duration-300 hover:brightness-110"
              >
                <title>{`${ev.event_title}\nLấp đầy: ${occ}%\nVé bán: ${Number(ev.sold_quantity || 0).toLocaleString()} / ${Number(ev.total_capacity || 0).toLocaleString()} vé\nDoanh thu: ${fmtCurrency(ev.revenue)}`}</title>
              </rect>

              {/* Percentage Label */}
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill={textColor}
              >
                {occ}%
              </text>

              {/* Event Name */}
              <text
                x={x + barW / 2}
                y={height - 18}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="#cbd5e1"
                className="[html.light_&]:fill-[#0D1B2A]"
              >
                {label}
              </text>

              {/* Tickets count */}
              <text
                x={x + barW / 2}
                y={height - 5}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {Number(ev.sold_quantity || 0).toLocaleString()} vé
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export function OrganizerTicketSalesPage() {
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

  const [analytics, setAnalytics] = useState(null)
  const [comparisonAnalytics, setComparisonAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) =>
        setEvents(
          (data || []).filter(
            (ev) =>
              ['PUBLISHED', 'COMPLETED', 'CANCELLED'].includes(ev.status) ||
              Number(ev.paid_orders_count || 0) > 0 ||
              (ev.status !== 'DRAFT' && ev.status !== 'PENDING_REVIEW')
          )
        )
      )
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = getDateRange(datePreset, { from: customFrom, to: customTo })
      const params = { dateFrom: range.dateFrom, dateTo: range.dateTo }
      if (selectedEventId) params.eventId = selectedEventId
      const data = await fetchTicketSalesAnalytics(params)
      setAnalytics(data)

      if (comparison.enabled) {
        const compRange = getDateRange('custom', { from: comparison.from, to: comparison.to })
        const compParams = { dateFrom: compRange.dateFrom, dateTo: compRange.dateTo }
        if (selectedEventId) compParams.eventId = selectedEventId
        const compData = await fetchTicketSalesAnalytics(compParams)
        setComparisonAnalytics(compData)
      } else {
        setComparisonAnalytics(null)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu phân tích bán vé.')
    } finally {
      setLoading(false)
    }
  }, [comparison, selectedEventId, datePreset, customFrom, customTo])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const overall = analytics?.overall || {}
  const byTicketType = analytics?.by_ticket_type ?? []
  const byEvent = analytics?.by_event ?? []
  const dailySales = analytics?.daily_sales ?? []
  const activeRange = getDateRange(datePreset, { from: customFrom, to: customTo })
  const activeRangeLabel = getDateRangeLabel(datePreset, activeRange)

  const avgTicketPrice = Number(overall.avg_ticket_price || 0)
  const totalSold = Number(overall.total_tickets_sold || 0)
  const totalRevenue = Number(overall.total_revenue || 0)
  const totalOrders = Number(overall.total_orders || 0)

  return (
    <OrganizerPage
      title="Phân tích Bán vé"
      description="Trung tâm tổng hợp và phân tích chuyên sâu sản lượng vé, cơ cấu doanh thu theo loại vé và tốc độ lấp đầy."
    >
      {/* ── BỎ KHUNG BỌC PHẠM VI SỰ KIỆN & KHOẢNG THỜI GIAN ── */}
      {/* Placed naturally and cleanly without card border/background */}
      <div className="relative z-20 mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          {/* Unified Smart Event Picker */}
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

        {/* Quick Refresh Action */}
        <div className="flex items-center gap-2 self-end">
          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            title="Làm mới dữ liệu phân tích"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0d172e] px-4 text-xs font-bold text-slate-200 shadow-sm transition hover:border-[#C99A47]/40 hover:text-[#E6C17A] disabled:opacity-50 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA] [html.light_&]:hover:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47]"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-[#E6C17A]' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <OrganizerPanel className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-slate-400 [html.light_&]:text-[#536b88]">
              Đang tổng hợp dữ liệu bán vé...
            </p>
          </div>
        </OrganizerPanel>
      ) : analytics ? (
        <>
          {/* ── KPI Metric Cards (Ambient glow & high contrast) ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* KPI 1: Tổng vé đã bán */}
            <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#0c1c38] p-5 shadow-lg transition-all hover:-translate-y-1 hover:border-cyan-500/40 [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
              <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-cyan-500/10 blur-xl [html.light_&]:hidden" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                  Tổng vé đã bán
                </p>
                <div className="grid size-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-400 shadow-sm [html.light_&]:bg-cyan-50 [html.light_&]:text-cyan-700">
                  <Ticket className="size-4.5" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black text-white [html.light_&]:text-[#0D1B2A]">
                {totalSold.toLocaleString('vi-VN')} <span className="text-2xl font-bold text-white [html.light_&]:text-[#0D1B2A]">vé</span>
              </p>
              <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                Trong {totalOrders} đơn hàng thành công
              </p>
            </div>

            {/* KPI 2: Doanh thu từ vé */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#251a08] p-5 shadow-lg transition-all hover:-translate-y-1 hover:border-amber-500/40 [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
              <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-amber-500/10 blur-xl [html.light_&]:hidden" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                  Doanh thu từ vé
                </p>
                <div className="grid size-9 place-items-center rounded-xl bg-amber-500/15 text-amber-300 shadow-sm [html.light_&]:bg-[#C99A47]/15 [html.light_&]:text-[#C99A47]">
                  <CircleDollarSign className="size-4.5" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black text-[#E6C17A] [html.light_&]:text-[#0D1B2A]">
                {fmtShort(totalRevenue)}
              </p>
              <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                {fmtCurrency(totalRevenue)}
              </p>
            </div>

            {/* KPI 3: Giá vé trung bình */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#0c2e22] p-5 shadow-lg transition-all hover:-translate-y-1 hover:border-emerald-500/40 [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
              <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-emerald-500/10 blur-xl [html.light_&]:hidden" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                  Giá vé trung bình
                </p>
                <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 shadow-sm [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700">
                  <TrendingUp className="size-4.5" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black text-emerald-400 [html.light_&]:text-[#0D1B2A]">
                {fmtCurrency(avgTicketPrice)}
              </p>
              <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                Bình quân trên mỗi vé bán
              </p>
            </div>

            {/* KPI 4: Quy mô đơn hàng */}
            <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#1e1338] p-5 shadow-lg transition-all hover:-translate-y-1 hover:border-purple-500/40 [html.light_&]:bg-none [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-md">
              <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-purple-500/10 blur-xl [html.light_&]:hidden" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                  Quy mô đơn hàng
                </p>
                <div className="grid size-9 place-items-center rounded-xl bg-purple-500/15 text-purple-400 shadow-sm [html.light_&]:bg-purple-50 [html.light_&]:text-purple-700">
                  <ShoppingCart className="size-4.5" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-black text-white [html.light_&]:text-[#0D1B2A]">
                {totalOrders} <span className="text-2xl font-bold text-white [html.light_&]:text-[#0D1B2A]">đơn</span>
              </p>
              <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                {totalOrders > 0 ? `Trung bình ${(totalSold / totalOrders).toFixed(1)} vé/đơn` : '—'}
              </p>
            </div>
          </div>

          {/* ── Section 1: Combo Chart (Wider bars + Dual Axes) ── */}
          <OrganizerPanel className="mb-6 relative overflow-hidden">
            <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-cyan-500/5 blur-3xl" />
            <SalesRevenueComboChart
              data={dailySales}
              dateRangeLabel={activeRangeLabel}
            />
          </OrganizerPanel>

          {/* ── Section 2: Ticket Type Performance Chart (Smart filter & dual view) ── */}
          <OrganizerPanel className="mb-6 relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[#E6C17A]/5 blur-3xl" />
            <TicketTypePerformanceChart data={byTicketType} />
          </OrganizerPanel>

          {/* ── Section 3: Donut Chart & Cumulative Line Chart (2 Columns Grid - NO OVERFLOW) ── */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            {/* Donut Chart: Revenue share by ticket type */}
            <OrganizerPanel className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-10 -bottom-10 size-40 rounded-full bg-emerald-500/5 blur-2xl" />
              <RevenueShareDonutChart data={byTicketType} />
            </OrganizerPanel>

            {/* Line Chart: Cumulative sales pacing (Full X & Y Axes) */}
            <OrganizerPanel className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-amber-500/5 blur-2xl" />
              <CumulativeVelocityLineChart data={dailySales} />
            </OrganizerPanel>
          </div>

          {/* ── Section 4: Column Chart: Event Occupancy (X & Y Axes) ── */}
          {byEvent.length > 0 && (
            <OrganizerPanel className="mb-6 relative overflow-hidden">
              <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-indigo-500/5 blur-3xl" />
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3 [html.light_&]:border-[#C99A47]/20">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-indigo-500/15 text-indigo-400 [html.light_&]:bg-indigo-50 [html.light_&]:text-indigo-700">
                    <Users className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">
                      Tỷ lệ lấp đầy theo Sự kiện
                    </h2>
                    <p className="text-xs text-slate-400 [html.light_&]:text-[#536b88]">
                      Cột gradient phản ánh hiệu suất tiêu thụ chỗ ngồi của từng sự kiện
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300 [html.light_&]:bg-[#FAF4EB] [html.light_&]:text-[#0D1B2A]">
                  <span>{byEvent.length} sự kiện</span>
                </div>
              </div>
              <EventOccupancyColumnChart data={byEvent} />
            </OrganizerPanel>
          )}

          {totalSold === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <Ticket className="mx-auto size-10 text-slate-500 [html.light_&]:text-[#C99A47]" />
              <p className="mt-3 font-bold text-white [html.light_&]:text-[#0D1B2A]">
                Chưa có vé nào được bán trong khoảng thời gian này
              </p>
              <p className="mt-1 text-sm text-slate-400 [html.light_&]:text-[#536b88]">
                Hãy thử mở rộng khoảng thời gian tìm kiếm hoặc chọn sự kiện khác.
              </p>
            </OrganizerPanel>
          )}
        </>
      ) : null}
    </OrganizerPage>
  )
}
