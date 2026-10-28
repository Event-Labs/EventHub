import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Crown,
  Layers,
  LineChart,
  Loader2,
  PieChart,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { DateRangeFilter, getDateRange, getDateRangeLabel } from '@/components/DateRangeFilter.jsx'
import {
  fetchAdminAnalyticsOverview,
  fetchAdminRevenueTrend,
  fetchAdminTopOrganizers,
  fetchAdminEventsByCategory,
  fetchAdminSubscriptionRevenue,
} from '@/services/adminAnalytics.js'
import { Page, Panel } from './AdminComponents.jsx'

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

const TICKET_PALETTE = [
  { name: 'Emerald', hex: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)' },
  { name: 'Sky Cyan', hex: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' },
  { name: 'Royal Purple', hex: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)' },
  { name: 'Amber Gold', hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' },
  { name: 'Rose Red', hex: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.4)' },
  { name: 'Orange', hex: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' },
  { name: 'Indigo', hex: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.4)' },
  { name: 'Muted Slate', hex: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.4)' },
]

// ─── Component 1: Admin Metric Card (High contrast & ambient colored glow) ────

function AdminMetricCard({
  icon: Icon,
  label,
  value,
  sub,
  theme = 'cyan', // 'cyan' | 'purple' | 'emerald' | 'amber' | 'blue' | 'rose'
  onClick,
}) {
  const themes = {
    cyan: {
      border: 'border-cyan-500/20 hover:border-cyan-500/40',
      gradient: 'from-[#0e172e] via-[#0b1329] to-[#0c1c38]',
      blur: 'bg-cyan-500/10',
      iconBox: 'bg-cyan-500/15 text-cyan-400 [html.light_&]:bg-cyan-50 [html.light_&]:text-cyan-700',
      valColor: 'text-white',
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      gradient: 'from-[#0e172e] via-[#0b1329] to-[#0c2e22]',
      blur: 'bg-emerald-500/10',
      iconBox: 'bg-emerald-500/15 text-emerald-400 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700',
      valColor: 'text-emerald-400',
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      gradient: 'from-[#0e172e] via-[#0b1329] to-[#251a08]',
      blur: 'bg-amber-500/10',
      iconBox: 'bg-amber-500/15 text-amber-300 [html.light_&]:bg-[#C99A47]/15 [html.light_&]:text-[#C99A47]',
      valColor: 'text-[#E6C17A]',
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/40',
      gradient: 'from-[#0e172e] via-[#0b1329] to-[#1e1338]',
      blur: 'bg-purple-500/10',
      iconBox: 'bg-purple-500/15 text-purple-400 [html.light_&]:bg-purple-50 [html.light_&]:text-purple-700',
      valColor: 'text-purple-300',
    },
    blue: {
      border: 'border-sky-500/20 hover:border-sky-500/40',
      gradient: 'from-[#0e172e] via-[#0b1329] to-[#0e2142]',
      blur: 'bg-sky-500/10',
      iconBox: 'bg-sky-500/15 text-sky-400 [html.light_&]:bg-sky-50 [html.light_&]:text-sky-700',
      valColor: 'text-white',
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-400',
      gradient: 'from-[#0e172e] via-[#0b1329] to-[#2b0e1a]',
      blur: 'bg-rose-500/10',
      iconBox: 'bg-rose-500/15 text-rose-400 [html.light_&]:bg-rose-50 [html.light_&]:text-rose-700',
      valColor: 'text-rose-400',
    },
  }

  const t = themes[theme] || themes.cyan

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border ${t.border} bg-gradient-to-br ${t.gradient} p-5 shadow-lg transition-all duration-200 hover:-translate-y-1 [html.light_&]:bg-white/95 [html.light_&]:border-[#C99A47]/30 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className={`pointer-events-none absolute -right-6 -top-6 size-24 rounded-full ${t.blur} blur-xl`} />
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
          {label}
        </p>
        {Icon && (
          <div className={`grid size-9 place-items-center rounded-xl shadow-sm ${t.iconBox}`}>
            <Icon className="size-4.5" />
          </div>
        )}
      </div>
      <p className={`mt-3 text-2xl sm:text-3xl font-black ${t.valColor} [html.light_&]:text-[#0D1B2A] drop-shadow-sm`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-slate-400 truncate [html.light_&]:text-[#536b88]">
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── Component 2: High-Fidelity Revenue Trend Chart (Combo / Bar / Spline) ────

function AdminRevenueTrendChart({ data = [], title = 'Xu hướng giao dịch vé', subtitle = 'Tổng giá trị giao dịch vé (GMV) và số đơn hàng theo thời gian' }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [mode, setMode] = useState('both') // 'both' | 'bars' | 'line'
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
        <p className="font-semibold text-slate-300 [html.light_&]:text-[#0D1B2A]">Chưa có dữ liệu giao dịch trong khoảng thời gian này</p>
        <p className="text-xs text-slate-500 [html.light_&]:text-[#536b88]">Biểu đồ sẽ tự động xuất hiện khi có đơn hàng phát sinh.</p>
      </div>
    )
  }

  const height = 230
  const totalRevenue = data.reduce((s, d) => s + Number(d.gross_revenue || 0), 0)
  const totalOrders = data.reduce((s, d) => s + Number(d.orders || 0), 0)
  const maxRevenue = Math.max(...data.map((d) => Number(d.gross_revenue || 0)), 1)
  const maxOrders = Math.max(...data.map((d) => Number(d.orders || 0)), 1)
  const peakDay = [...data].sort((a, b) => Number(b.gross_revenue || 0) - Number(a.gross_revenue || 0))[0]

  const count = data.length
  const w = containerWidth || 700

  // Margins for dual Y-axes (Left: Revenue, Right: Orders)
  const padLeft = 70
  const padRight = 55
  const usableW = Math.max(w - padLeft - padRight, 100)
  const slotW = count > 0 ? usableW / count : usableW
  // Bar width: minimum 16px, maximum 52px so bars are clear and bold
  const barW = Math.max(12, Math.min(slotW * 0.58, 52))

  // Generate ticks for Left Y-axis (Revenue)
  const leftTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    pct,
    val: fmtShort(Math.round(maxRevenue * pct)),
    yPos: height - pct * (height - 45),
  }))

  // Generate ticks for Right Y-axis (Orders)
  const rightTicks = [0, 0.5, 1].map((pct) => ({
    pct,
    val: `${Math.round(maxOrders * pct)} đơn`,
    yPos: height - pct * (height - 45),
  }))

  // Points for spline curve of Revenue
  const revenuePoints = data.map((d, i) => {
    const rev = Number(d.gross_revenue || 0)
    const y = height - (rev / maxRevenue) * (height - 45)
    const x = padLeft + i * slotW + slotW / 2
    return { x, y }
  })

  const hoveredItem = hoveredIndex !== null && data[hoveredIndex] ? data[hoveredIndex] : null

  return (
    <div ref={containerRef} className="w-full select-none">
      {/* Header with Title and Mode Switcher */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="size-5 text-[#E6C17A]" />
            <h3 className="font-bold text-base text-white [html.light_&]:text-[#0D1B2A]">{title}</h3>
          </div>
          <p className="mt-0.5 text-xs text-subtle font-medium">{subtitle}</p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#080e1e] p-1 text-xs [html.light_&]:bg-slate-100 [html.light_&]:border-slate-200">
          <button
            type="button"
            onClick={() => setMode('both')}
            className={`rounded-lg px-2.5 py-1 font-bold transition ${
              mode === 'both'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600'
            }`}
          >
            Kết hợp
          </button>
          <button
            type="button"
            onClick={() => setMode('bars')}
            className={`rounded-lg px-2.5 py-1 font-bold transition ${
              mode === 'bars'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600'
            }`}
          >
            Cột GMV
          </button>
          <button
            type="button"
            onClick={() => setMode('line')}
            className={`rounded-lg px-2.5 py-1 font-bold transition ${
              mode === 'line'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600'
            }`}
          >
            Đường xu hướng
          </button>
        </div>
      </div>

      {/* Legend & Quick Metrics */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-sm bg-gradient-to-b from-[#38bdf8] to-[#0284c7]" />
            <span>Giao dịch vé: <span className="font-extrabold text-white [html.light_&]:text-[#0D1B2A]">{fmtCurrency(totalRevenue)}</span></span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#E6C17A]" />
            <span>Đơn hàng: <span className="font-extrabold text-[#E6C17A]">{totalOrders} đơn</span></span>
          </span>
        </div>

        {peakDay && Number(peakDay.gross_revenue || 0) > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400 [html.light_&]:bg-emerald-50 [html.light_&]:text-emerald-700">
            <Zap className="size-3.5 text-emerald-400" />
            <span>Đỉnh: {fmtShort(peakDay.gross_revenue)} ({fmtChartDay(peakDay.period)})</span>
          </span>
        )}
      </div>

      {/* SVG Canvas Container */}
      <div className="relative overflow-x-auto rounded-xl border border-white/5 bg-[#091124]/60 p-2 backdrop-blur-sm [html.light_&]:bg-[#FAF4EB]">
        {/* Floating Tooltip */}
        {hoveredItem && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border border-white/20 bg-[#0b1329]/95 px-3 py-2 shadow-2xl backdrop-blur-md transition-all duration-75 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:shadow-lg"
            style={{
              left: `${padLeft + hoveredIndex * slotW + slotW / 2}px`,
              top: '40px',
            }}
          >
            <p className="text-[11px] font-bold text-slate-400 [html.light_&]:text-[#536b88]">
              {fmtFullDate(hoveredItem.period)}
            </p>
            <p className="mt-0.5 text-sm font-black text-[#38bdf8] [html.light_&]:text-[#0284c7]">
              {fmtCurrency(hoveredItem.gross_revenue)}
            </p>
            <p className="text-[11px] font-semibold text-[#E6C17A]">
              {hoveredItem.orders || 0} đơn hàng
            </p>
          </div>
        )}

        <svg width={w} height={height + 36} className="block overflow-visible">
          <defs>
            <linearGradient id={`comboBarGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id={`comboBarHover-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" stopOpacity="1" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={`comboRevArea-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E6C17A" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#E6C17A" stopOpacity="0.0" />
            </linearGradient>
            <filter id={`glowGold-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid lines */}
          {leftTicks.map((item, idx) => (
            <line
              key={`hgrid-${idx}`}
              x1={padLeft}
              x2={w - padRight}
              y1={item.yPos}
              y2={item.yPos}
              stroke="rgba(255, 255, 255, 0.08)"
              strokeDasharray={idx === 0 ? '' : '3 3'}
              strokeWidth={idx === 0 ? 1.5 : 1}
              className="[html.light_&]:stroke-slate-300"
            />
          ))}

          {/* Left Y-axis (Revenue) */}
          <line
            x1={padLeft}
            x2={padLeft}
            y1={16}
            y2={height}
            stroke="rgba(56, 189, 248, 0.5)"
            strokeWidth={1.5}
            className="[html.light_&]:stroke-cyan-700"
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
            (VNĐ)
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

          {/* Right Y-axis (Orders) */}
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
            (Đơn)
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
          {mode !== 'bars' && (
            <path
              d={getAreaPath(revenuePoints, height)}
              fill={`url(#comboRevArea-${chartId})`}
              className="transition-all duration-300"
            />
          )}

          {/* Wide Gradient Bars for Gross Revenue */}
          {mode !== 'line' &&
            data.map((d, i) => {
              const rev = Number(d.gross_revenue || 0)
              const barH = maxRevenue > 0 && rev > 0 ? Math.max((rev / maxRevenue) * (height - 45), 6) : 0
              const x = padLeft + i * slotW + (slotW - barW) / 2
              const y = height - barH
              const isHovered = hoveredIndex === i

              return (
                <g
                  key={`cbar-${d.period}-${i}`}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
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

          {/* Smooth Curved Line for Revenue */}
          {mode !== 'bars' && (
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
          {mode !== 'bars' &&
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
              <g key={`clbl-${d.period}-${i}`}>
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
                  {fmtChartDay(d.period)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Component 3: Modern Donut Chart with glowing ring & clean percentages ─────

function DonutChart({ title, data = [], totalLabel, valueFormatter, bare = false, compact = false }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  let offset = 25
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const formatValue = valueFormatter || ((value) => Number(value || 0).toLocaleString('vi-VN'))
  const centerValueClass = valueFormatter ? 'text-xs' : 'text-xl'
  const chartSize = compact ? 'size-32' : 'size-40'

  const content = (
    <div>
      {title && (
        <h3 className={`font-bold text-white [html.light_&]:text-[#0D1B2A] ${compact ? 'text-sm mb-3' : 'text-base mb-4'}`}>
          {title}
        </h3>
      )}

      <div className={`grid gap-5 items-center ${compact ? 'grid-cols-1 sm:grid-cols-[130px_minmax(0,1fr)]' : 'grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)]'}`}>
        {/* Ring */}
        <div className={`relative mx-auto ${chartSize}`}>
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="13" />
            {data.map((item) => {
              const value = Number(item.value || 0)
              const dash = total > 0 ? (value / total) * circumference : 0
              const circle = (
                <circle
                  key={item.label}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={item.color || '#38bdf8'}
                  strokeWidth="13"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              )
              offset -= dash
              return circle
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center p-2">
            <div>
              <p className={`${centerValueClass} max-w-24 truncate font-black text-white drop-shadow-sm [html.light_&]:text-[#0D1B2A]`}>
                {formatValue(total)}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 [html.light_&]:text-[#536b88]">
                {totalLabel || 'tổng'}
              </p>
            </div>
          </div>
        </div>

        {/* Legend list */}
        <div className="space-y-1.5 min-w-0">
          {data.map((item) => {
            const pct = total > 0 ? Math.round((Number(item.value || 0) / total) * 100) : 0
            return (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-[#091124]/50 px-3 py-2 text-xs transition hover:border-white/15 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full shadow-sm"
                    style={{ backgroundColor: item.color || '#38bdf8' }}
                  />
                  <span className="truncate font-semibold text-slate-300 [html.light_&]:text-[#1B365D]">
                    {item.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300 [html.light_&]:bg-slate-200 [html.light_&]:text-slate-700">
                    {pct}%
                  </span>
                  <span className="font-extrabold text-white [html.light_&]:text-[#0D1B2A]">
                    {formatValue(item.value)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (bare) return content
  return <Panel>{content}</Panel>
}

// ─── Component 4: Top Organizers Progress Bar Ranking ─────────────────────────

function HorizontalValueChart({ title, items = [], valueKey, labelKey, subLabel, valueFormatter = fmtShort, bare = false }) {
  if (!items?.length) return null

  const maxVal = Math.max(...items.map((i) => Number(i[valueKey] || 0)), 1)

  const content = (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-[#E6C17A]" />
          <h3 className="font-bold text-base text-white [html.light_&]:text-[#0D1B2A]">{title}</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
          Top {items.length}
        </span>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const val = Number(item[valueKey] || 0)
          const pct = Math.max(Math.min((val / maxVal) * 100, 100), 2)
          const isTop1 = idx === 0

          return (
            <div
              key={idx}
              className="rounded-xl border border-white/5 bg-[#091124]/40 p-3 transition hover:border-white/15 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-lg text-xs font-black shadow-sm ${
                      isTop1
                        ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A]'
                        : 'border border-white/10 bg-white/5 text-slate-300'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                      {item[labelKey]}
                    </p>
                    {subLabel && (
                      <p className="truncate text-[11px] font-medium text-slate-400 [html.light_&]:text-[#536b88]">
                        {typeof subLabel === 'function' ? subLabel(item) : item[subLabel]}
                      </p>
                    )}
                  </div>
                </div>

                <p className="shrink-0 text-sm font-extrabold text-emerald-400 [html.light_&]:text-[#065f46]">
                  {valueFormatter(val)}
                </p>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    isTop1
                      ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A]'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (bare) return content
  return <Panel>{content}</Panel>
}

// ─── Component 5: Category Distribution Overview ──────────────────────────────

function CategoryDistributionChart({ items = [] }) {
  if (!items?.length) return null

  const palette = ['#38bdf8', '#10b981', '#a855f7', '#f59e0b', '#f43f5e', '#6366f1', '#e6c17a']

  return (
    <Panel className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-cyan-500/5 blur-3xl" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PieChart className="size-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">Sự kiện theo danh mục</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
          {items.length} danh mục
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-3 xl:items-stretch">
        <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
          <DonutChart
            title="Tổng sự kiện"
            totalLabel="tổng"
            bare
            compact
            data={items.map((cat, index) => ({
              label: cat.name,
              value: cat.total_events,
              color: palette[index % palette.length],
            }))}
          />
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
          <DonutChart
            title="Đã đăng"
            totalLabel="đã đăng"
            bare
            compact
            data={items.map((cat, index) => ({
              label: cat.name,
              value: cat.published_events,
              color: palette[index % palette.length],
            }))}
          />
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
          <DonutChart
            title="Đã kết thúc"
            totalLabel="kết thúc"
            bare
            compact
            data={items.map((cat, index) => ({
              label: cat.name,
              value: cat.completed_events,
              color: palette[index % palette.length],
            }))}
          />
        </div>
      </div>
    </Panel>
  )
}

// ─── Main Admin Analytics Page ────────────────────────────────────────────────

export function AdminAnalyticsPage() {
  const navigate = useNavigate()
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
  const [trendGroupBy, setTrendGroupBy] = useState('day')

  const [overview, setOverview] = useState(null)
  const [revenueTrend, setRevenueTrend] = useState([])
  const [comparisonRevenueTrend, setComparisonRevenueTrend] = useState([])
  const [topOrganizers, setTopOrganizers] = useState([])
  const [eventsByCategory, setEventsByCategory] = useState([])
  const [subscriptionRevenue, setSubscriptionRevenue] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = getDateRange(datePreset, { from: customFrom, to: customTo })

      const [ov, trend, orgs, cats, subRev] = await Promise.all([
        fetchAdminAnalyticsOverview({ dateFrom: range.dateFrom, dateTo: range.dateTo }),
        fetchAdminRevenueTrend({ dateFrom: range.dateFrom, dateTo: range.dateTo, groupBy: trendGroupBy }),
        fetchAdminTopOrganizers({ limit: 5 }),
        fetchAdminEventsByCategory(),
        fetchAdminSubscriptionRevenue(),
      ])

      setOverview(ov)
      setRevenueTrend(trend)
      if (comparison.enabled) {
        const comparisonRange = getDateRange('custom', {
          from: comparison.from,
          to: comparison.to,
        })
        const comparisonTrend = await fetchAdminRevenueTrend({
          dateFrom: comparisonRange.dateFrom,
          dateTo: comparisonRange.dateTo,
          groupBy: trendGroupBy,
        })
        setComparisonRevenueTrend(comparisonTrend)
      } else {
        setComparisonRevenueTrend([])
      }
      setTopOrganizers(orgs)
      setEventsByCategory(cats)
      setSubscriptionRevenue(subRev)
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu phân tích.')
    } finally {
      setLoading(false)
    }
  }, [comparison, datePreset, customFrom, customTo, trendGroupBy])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const users = overview?.users
  const events = overview?.events
  const orders = overview?.orders
  const orgReqs = overview?.organizer_requests

  return (
    <Page
      title="Tổng quan Nền tảng"
      description="Thống kê toàn hệ thống: người dùng, sự kiện, giao dịch vé và doanh thu gói dịch vụ."
    >
      {/* ── 1. Attention Required Banner ("CẦN XỬ LÝ NGAY") ── */}
      {overview && (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-[#17140b] via-[#0f172a] to-[#17140b] p-5 shadow-2xl shadow-amber-500/10 [html.light_&]:border-amber-500/40 [html.light_&]:bg-amber-50/80">
          <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-amber-500/10 blur-2xl" />
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-xl bg-amber-500/20 text-amber-400 shadow-sm">
                <AlertTriangle className="size-4.5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Cần xử lý ngay
                </p>
                <p className="text-[11px] text-slate-400 [html.light_&]:text-[#536b88]">
                  Các tác vụ tồn đọng cần hành động từ Quản trị viên
                </p>
              </div>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              Ưu tiên
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Sự kiện chờ duyệt', Number(events?.pending_events || 0), Number(events?.pending_events || 0) > 5 ? 'critical' : 'warn', '/admin/events/review?status=PENDING'],
              ['Yêu cầu Organizer', Number(orgReqs?.pending_requests || 0), Number(orgReqs?.pending_requests || 0) > 3 ? 'critical' : 'warn', '/admin/organizer-requests?status=PENDING'],
              ['Sự kiện đã hủy', Number(events?.cancelled_events || 0), 'warn', '/admin/events/review?status=CANCELLED'],
              ['Đơn hàng đang xử lý', Number(orders?.pending_orders || 0), 'warn', '/admin/platform-fee?status=PENDING'],
            ].map(([label, count, severity, to]) => (
              <button
                type="button"
                key={label}
                onClick={() => navigate(to)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm ${
                  severity === 'critical'
                    ? 'border-rose-500/40 bg-rose-950/40 hover:border-rose-400 [html.light_&]:border-rose-500/40 [html.light_&]:bg-rose-50/80'
                    : 'border-amber-500/30 bg-[#16233f] hover:border-amber-400 hover:bg-[#1b2b4e] [html.light_&]:border-amber-500/30 [html.light_&]:bg-amber-100/60'
                }`}
              >
                <span className="text-xs font-bold text-slate-200 [html.light_&]:text-[#1B365D]">{label}</span>
                <span className={`shrink-0 text-xl font-black ${severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !overview ? (
        <Panel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-tertiary" />
        </Panel>
      ) : overview ? (
        <>
          {/* ── 2. KPI Cards Row 1: Users & System Ops ── */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              icon={Users}
              label="Tổng người dùng"
              value={Number(users.total_users).toLocaleString('vi-VN')}
              sub={`${Number(users.active_users).toLocaleString()} hoạt động · ${Number(users.locked_users).toLocaleString()} bị khóa`}
              theme="cyan"
              onClick={() => navigate('/admin/accounts')}
            />
            <AdminMetricCard
              icon={Building2}
              label="Nhà tổ chức"
              value={Number(users.total_organizers).toLocaleString('vi-VN')}
              sub={`${Number(users.total_staff).toLocaleString()} nhân viên`}
              theme="purple"
              onClick={() => navigate('/admin/organizers')}
            />
            <AdminMetricCard
              icon={Calendar}
              label="Sự kiện đã đăng"
              value={Number(events.published_events).toLocaleString('vi-VN')}
              sub={`${Number(events.pending_events).toLocaleString()} đang chờ duyệt`}
              theme="emerald"
              onClick={() => navigate('/admin/events/review')}
            />
            <AdminMetricCard
              icon={ClipboardList}
              label="Yêu cầu Organizer"
              value={Number(orgReqs.total_requests).toLocaleString('vi-VN')}
              sub={`${Number(orgReqs.pending_requests).toLocaleString()} đang chờ xử lý`}
              theme="amber"
              onClick={() => navigate('/admin/organizer-requests')}
            />
          </div>

          {/* ── 3. KPI Cards Row 2: Ticket GMV & Subscriptions ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              icon={CircleDollarSign}
              label="Tổng giao dịch vé"
              value={fmtShort(orders.gross_revenue)}
              sub="Tiền vé đã thanh toán, không phải doanh thu EventHub"
              theme="emerald"
            />
            <AdminMetricCard
              icon={TrendingUp}
              label="Doanh thu gói dịch vụ"
              value={fmtShort(subscriptionRevenue?.total_revenue)}
              sub={fmtCurrency(subscriptionRevenue?.total_revenue)}
              theme="amber"
              onClick={() => navigate('/admin/plans')}
            />
            <AdminMetricCard
              icon={Ticket}
              label="Đơn đã thanh toán"
              value={Number(orders.paid_orders).toLocaleString('vi-VN')}
              sub={`/${Number(orders.total_orders).toLocaleString()} tổng đơn`}
              theme="blue"
            />
            <AdminMetricCard
              icon={BarChart3}
              label="Sự kiện (toàn hệ thống)"
              value={Number(events.total_events).toLocaleString('vi-VN')}
              sub={`${Number(events.completed_events).toLocaleString()} hoàn thành`}
              theme="purple"
            />
          </div>

          {/* ── 4. Filter & Controls Bar (Consistent without enclosing frames) ── */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
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

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <span className="block text-base font-bold text-white mb-1.5 [html.light_&]:text-[#0D1B2A]">
                  Nhóm theo
                </span>
                <div className="mt-1 flex gap-2">
                  {[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTrendGroupBy(val)}
                      className={`h-10 rounded-xl px-4 text-sm font-bold transition ${
                        trendGroupBy === val
                          ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 border border-[#C99A47]'
                          : 'border border-white/10 bg-[#151d34] text-slate-300 hover:bg-white/5 hover:text-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/85 [html.light_&]:text-[#1B365D]'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-[#151d34] px-4 text-sm font-bold text-white transition hover:border-[#E6C17A]/60 hover:text-[#E6C17A] disabled:opacity-50 [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/85 [html.light_&]:text-[#1B365D]"
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>

          {/* ── 5. Revenue Trend Chart (Rich Dual Axes & Wider Bars) ── */}
          <Panel className="mb-6 relative overflow-hidden">
            <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-cyan-500/5 blur-3xl" />
            <AdminRevenueTrendChart
              data={revenueTrend}
              title="Xu hướng giao dịch vé"
              subtitle="Cột gradient xanh đại diện tổng giá trị giao dịch (trục trái) · Đường uốn lượn vàng thể hiện biến động xu hướng"
            />

            {comparison.enabled && comparisonRevenueTrend.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <AdminRevenueTrendChart
                  data={comparisonRevenueTrend}
                  title={`So sánh: ${comparison.label || 'Kỳ so sánh'}`}
                  subtitle="Dữ liệu giai đoạn đối chiếu để so khớp hiệu suất nền tảng"
                />
              </div>
            )}
          </Panel>

          {/* ── 6. Operational Status (Donut Charts) ── */}
          <Panel className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChart className="size-5 text-[#E6C17A]" />
                <h2 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">Tình trạng vận hành</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
                Tổng quan hệ thống
              </span>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                <DonutChart
                  title="Trạng thái sự kiện"
                  totalLabel="sự kiện"
                  bare
                  compact
                  data={[
                    { label: 'Đã đăng', value: events.published_events, color: '#10b981' },
                    { label: 'Chờ duyệt', value: events.pending_events, color: '#f59e0b' },
                    { label: 'Bản nháp', value: events.draft_events, color: '#64748b' },
                    { label: 'Đã kết thúc', value: events.completed_events, color: '#a855f7' },
                    { label: 'Đã hủy / Ẩn', value: Number(events.cancelled_events || 0) + Number(events.hidden_events || 0), color: '#f43f5e' },
                  ]}
                />
              </div>
              <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                <DonutChart
                  title="Yêu cầu Organizer"
                  totalLabel="yêu cầu"
                  bare
                  compact
                  data={[
                    { label: 'Chờ duyệt', value: orgReqs.pending_requests, color: '#f59e0b' },
                    { label: 'Đã duyệt', value: orgReqs.approved_requests, color: '#10b981' },
                    { label: 'Từ chối', value: orgReqs.rejected_requests, color: '#f43f5e' },
                  ]}
                />
              </div>
            </div>
          </Panel>

          {/* ── 7. Events by Category ── */}
          <div className="mb-6">
            <CategoryDistributionChart items={eventsByCategory} />
          </div>

          {/* ── 8. Subscription Revenue ── */}
          {subscriptionRevenue && (
            <Panel className="mb-6 relative overflow-hidden">
              <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-amber-500/5 blur-3xl" />
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-5 text-[#E6C17A]" />
                    <h2 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">Doanh thu từ gói dịch vụ</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-subtle font-medium">Chi tiết doanh thu và cơ cấu gói dịch vụ của Nhà tổ chức</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[460px]">
                  <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#0c1c38] p-3 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">Tổng lượt mua</p>
                    <p className="mt-1 text-lg font-black text-white [html.light_&]:text-[#0D1B2A]">{Number(subscriptionRevenue.total_subscriptions).toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#0c2e22] p-3 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">Đang hoạt động</p>
                    <p className="mt-1 text-lg font-black text-emerald-400 [html.light_&]:text-[#065f46]">{Number(subscriptionRevenue.active_subscriptions).toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-[#0e172e] via-[#0b1329] to-[#251a08] p-3 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">Tổng doanh thu</p>
                    <p className="mt-1 text-lg font-black text-[#E6C17A] [html.light_&]:text-[#854d0e]">{fmtCurrency(subscriptionRevenue.total_revenue)}</p>
                  </div>
                </div>
              </div>

              {Array.isArray(subscriptionRevenue.by_plan) && subscriptionRevenue.by_plan.length > 0 && (
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <DonutChart
                      title="Doanh thu theo từng gói"
                      totalLabel="doanh thu"
                      valueFormatter={fmtCurrency}
                      bare
                      compact
                      data={subscriptionRevenue.by_plan.map((plan, index) => ({
                        label: `${plan.plan_name} (${Number(plan.total).toLocaleString('vi-VN')} lượt)`,
                        value: plan.revenue,
                        color: ['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#6366f1'][index % 5],
                      }))}
                    />
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-[#091124]/40 p-4 shadow-sm [html.light_&]:bg-white [html.light_&]:border-slate-200">
                    <DonutChart
                      title="Số lượt theo từng gói"
                      totalLabel="lượt"
                      bare
                      compact
                      data={subscriptionRevenue.by_plan.map((plan, index) => ({
                        label: `${plan.plan_name} · ${fmtCurrency(plan.price)}`,
                        value: plan.total,
                        color: ['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#6366f1'][index % 5],
                      }))}
                    />
                  </div>
                </div>
              )}
            </Panel>
          )}

          {/* ── 9. Top Organizers & Order Summary ── */}
          <div className={`grid gap-6 ${topOrganizers?.length ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
            {topOrganizers?.length > 0 && (
              <HorizontalValueChart
                title="Top 5 nhà tổ chức theo giao dịch vé"
                items={topOrganizers}
                valueKey="gross_revenue"
                labelKey="organizer_name"
                valueFormatter={fmtCurrency}
                subLabel={(org) => `${org.total_events} sự kiện · ${org.subscription_name || 'Chưa có gói active'}`}
              />
            )}

            <Panel className="relative overflow-hidden">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="size-5 text-[#E6C17A]" />
                  <h2 className="font-bold text-white [html.light_&]:text-[#0D1B2A]">Tóm tắt đơn hàng</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
                  Toàn hệ thống
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  { label: 'Tổng đơn', val: Number(orders.total_orders).toLocaleString('vi-VN'), color: 'text-white', border: 'border-sky-500/20', bg: 'from-[#0e172e] via-[#0b1329] to-[#0e2142]' },
                  { label: 'Đã thanh toán', val: Number(orders.paid_orders).toLocaleString('vi-VN'), color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'from-[#0e172e] via-[#0b1329] to-[#0c2e22]' },
                  { label: 'Đang xử lý', val: Number(orders.pending_orders).toLocaleString('vi-VN'), color: 'text-amber-300', border: 'border-amber-500/20', bg: 'from-[#0e172e] via-[#0b1329] to-[#251a08]' },
                  { label: 'Đã hủy', val: Number(orders.cancelled_orders).toLocaleString('vi-VN'), color: 'text-rose-400', border: 'border-rose-500/20', bg: 'from-[#0e172e] via-[#0b1329] to-[#2b0e1a]' },
                ].map(({ label, val, color, border, bg }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between rounded-xl border ${border} bg-gradient-to-r ${bg} px-4 py-3 shadow-sm [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">{label}</p>
                    <p className={`text-xl font-black ${color} [html.light_&]:text-[#0D1B2A]`}>{val}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </Page>
  )
}
