import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CalendarClock,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Copy,
  Gauge,
  Hourglass,
  Info,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
  ReceiptText,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { DateRangeFilter, getDateRange, getDateRangeLabel } from '@/components/DateRangeFilter.jsx'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchRevenueStats, generateFinancialSummary } from '@/services/organizerOrders.js'
import { OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
  if (level === 'LOW') return 'border-success/30 bg-success/[0.08] text-success'
  if (level === 'HIGH') return 'border-error/30 bg-error/[0.08] text-error'
  return 'border-warning/30 bg-warning/[0.08] text-warning'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, trend, accentBg = 'bg-primary/20', accentColor = 'text-primary' }) {
  return (
    <div className="glass-panel flex items-start gap-4 rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
      <div className={`glass-panel grid size-12 shrink-0 place-items-center rounded-[18px] border-white/5 shadow-inner ${accentBg}`}>
        <Icon className={`size-6 ${accentColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-black text-white drop-shadow-sm">{value}</p>
        {sub && (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            {trend === 'up' && <ArrowUpRight className="size-3.5 text-success drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" />}
            {trend === 'down' && <ArrowDownRight className="size-3.5 text-error drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" />}
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

function InsightList({ title, items = [] }) {
  if (!items.length) return null

  return (
    <div className="glass-panel rounded-[20px] border-white/5 bg-slate-900/40 p-5 shadow-inner">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <p key={item} className="text-[14px] font-medium leading-relaxed text-slate-300">
            {item}
          </p>
        ))}
      </div>
    </div>
  )
}

function BarChartSimple({ data, height = 160 }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return undefined

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  if (!data || data.length === 0) return (
    <div className="flex h-40 items-center justify-center text-sm text-subtle">
      Không có dữ liệu trong khoảng thời gian này.
    </div>
  )

  const maxVal = Math.max(...data.map((d) => Number(d.net_revenue)), 1)
  const gap = Math.max(Math.floor(600 / data.length), 8)
  const barWidth = Math.max(gap - 4, 4)
  const svgWidth = Math.max(data.length * gap + 10, containerWidth || 0)

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg width={svgWidth} height={height + 30} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={0} x2={svgWidth} y1={height - pct * height} y2={height - pct * height} stroke="rgba(43,92,146,0.25)" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const barH = Math.max(((Number(d.net_revenue) / maxVal) * height), 2)
          const x = i * gap + (gap - barWidth) / 2
          const y = height - barH
          const isHighest = Number(d.net_revenue) === maxVal
          return (
            <g key={d.day}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={isHighest ? '#b3cde0' : 'rgba(43,92,146,0.55)'}>
                <title>{`${fmtChartDay(d.day)}: ${fmtCurrency(d.net_revenue)}`}</title>
              </rect>
            </g>
          )
        })}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 6))
          if (i % step !== 0) return null
          return (
            <text key={`lbl-${d.day}`} x={i * gap + gap / 2} y={height + 20} textAnchor="middle" fontSize={10} fill="#72787c">
              {fmtChartDay(d.day)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function HorizontalRevenueChart({ data, maxValue }) {
  if (!data?.length) return null

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const gross = Number(item.gross_revenue || 0)
        const net = Number(item.net_revenue || 0)
        const discount = Number(item.total_discount || 0)
        const grossPct = maxValue > 0 ? Math.max(3, Math.round((gross / maxValue) * 100)) : 0
        const netPct = gross > 0 ? Math.max(3, Math.round((net / gross) * grossPct)) : 0
        const discountPct = maxValue > 0 && discount > 0
          ? Math.max(3, Math.round((discount / maxValue) * 100))
          : 0

        return (
          <div key={item.event_id} className="rounded-md border border-border-soft/30 bg-panel-soft/50 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-content">{item.event_title}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {fmtDate(item.start_time)} · {Number(item.total_orders || 0).toLocaleString('vi-VN')} đơn
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-content">{fmtCurrency(gross)}</p>
                <p className="text-xs font-semibold text-success">Ròng {fmtCurrency(net)}</p>
                <p className="text-xs font-semibold text-warning">Giảm giá {fmtCurrency(discount)}</p>
              </div>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-border-soft/25">
              <div className="absolute inset-y-0 left-0 rounded-full bg-tertiary/55" style={{ width: `${grossPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${netPct}%` }} />
            </div>
            {discount > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-border-soft/25">
                <div className="h-full rounded-full bg-warning" style={{ width: `${discountPct}%` }} />
              </div>
            )}
            <div className="mt-2 flex items-center gap-4 text-[11px] font-bold uppercase text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Doanh thu ròng
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-tertiary/55" /> Doanh thu gộp
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" /> Giảm giá
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProgressBar({ value, tone = 'bg-success' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="h-2 overflow-hidden rounded-full bg-border-soft/25">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function DonutChart({ segments, size = 150, stroke = 18, centerLabel, centerValue }) {
  const total = segments.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(179,205,224,0.18)" strokeWidth={stroke} />
        </svg>
        <p className="text-sm font-semibold text-subtle">Chưa có dữ liệu</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(179,205,224,0.12)" strokeWidth={stroke} />
          {segments.map((item) => {
            const value = Number(item.value || 0)
            const dash = (value / total) * circumference
            const circle = (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
                strokeDashoffset={-offset}
              >
                <title>{`${item.label}: ${fmtNumber(value)} (${fmtNumber((value / total) * 100, 1)}%)`}</title>
              </circle>
            )
            offset += dash
            return circle
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xl font-black text-content">{centerValue ?? fmtNumber(total)}</p>
            <p className="text-[11px] font-bold uppercase text-subtle">{centerLabel}</p>
          </div>
        </div>
      </div>
      <div className="grid min-w-0 flex-1 gap-2">
        {segments.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-border-soft/25 bg-panel-soft/50 px-3 py-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-content">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="shrink-0 text-sm font-black text-content">{fmtNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TicketOpsChart({ dashboard }) {
  const used = Number(dashboard?.checked_in_tickets || 0)
  const valid = Number(dashboard?.valid_tickets || 0)
  const cancelled = Number(dashboard?.cancelled_tickets || 0)
  const issued = Number(dashboard?.issued_tickets || 0)
  const total = Math.max(issued, used + valid + cancelled, 1)
  const segments = [
    { label: 'Đã check-in', value: used, color: 'bg-success', text: 'text-success' },
    { label: 'Còn hiệu lực', value: valid, color: 'bg-primary', text: 'text-primary' },
    { label: 'Đã hủy', value: cancelled, color: 'bg-error', text: 'text-error' },
  ]

  return (
    <OrganizerPanel className="mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-content">Tình trạng vé vận hành</h2>
          <p className="mt-1 text-xs text-subtle">Theo dõi vé đã check-in, vé còn hiệu lực và vé đã hủy.</p>
        </div>
        <span className="rounded-md border border-border-soft/35 bg-panel-soft px-3 py-1 text-xs font-bold text-subtle">
          {fmtNumber(issued)} vé đã phát hành
        </span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-border-soft/25">
        {segments.map((item) => (
          <div
            key={item.label}
            className={`${item.color} transition-all`}
            style={{ width: `${Math.max(0, (item.value / total) * 100)}%` }}
            title={`${item.label}: ${fmtNumber(item.value)}`}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {segments.map((item) => (
          <div key={item.label} className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-subtle">{item.label}</p>
            <p className={`mt-1 text-xl font-black ${item.text}`}>{fmtNumber(item.value)}</p>
            <p className="mt-1 text-xs text-muted">{fmtNumber((item.value / total) * 100, 1)}% tổng vé</p>
          </div>
        ))}
      </div>
    </OrganizerPanel>
  )
}

function EventStatusCharts({ dashboard }) {
  const statusSegments = [
    { label: 'Đang công khai', value: Number(dashboard?.published_events || 0), color: '#2b5c92' },
    { label: 'Chờ duyệt', value: Number(dashboard?.pending_review_events || 0), color: '#eab308' },
    { label: 'Bản nháp', value: Number(dashboard?.draft_events || 0), color: '#72787c' },
    { label: 'Đã duyệt chưa public', value: Number(dashboard?.completed_events || 0), color: '#22c55e' },
  ]
  const timelineSegments = [
    { label: 'Đang diễn ra', value: Number(dashboard?.running_events || 0), color: '#22c55e' },
    { label: 'Sắp diễn ra', value: Number(dashboard?.upcoming_events || 0), color: '#2b5c92' },
    {
      label: 'Khác',
      value: Math.max(
        Number(dashboard?.total_events || 0) - Number(dashboard?.running_events || 0) - Number(dashboard?.upcoming_events || 0),
        0,
      ),
      color: '#72787c',
    },
  ]

  return (
    <div className="mb-6 grid gap-6 xl:grid-cols-2">
      <OrganizerPanel>
        <div className="mb-4">
          <h2 className="font-bold text-content">Phân bổ trạng thái sự kiện</h2>
          <p className="mt-1 text-xs text-subtle">Nhìn nhanh tỷ trọng sự kiện đã public, chờ duyệt, nháp và đã duyệt.</p>
        </div>
        <DonutChart
          segments={statusSegments}
          centerLabel="Sự kiện"
          centerValue={fmtNumber(dashboard?.total_events)}
        />
      </OrganizerPanel>
      <OrganizerPanel>
        <div className="mb-4">
          <h2 className="font-bold text-content">Lịch vận hành</h2>
          <p className="mt-1 text-xs text-subtle">Tách riêng sự kiện đang diễn ra, sắp diễn ra và nhóm còn lại.</p>
        </div>
        <DonutChart
          segments={timelineSegments}
          centerLabel="Lịch"
          centerValue={fmtNumber(dashboard?.total_events)}
        />
      </OrganizerPanel>
    </div>
  )
}

function DashboardOverview({ dashboard, subscription }) {
  const plan = subscription?.current_plan
  const nextEvent = dashboard?.next_event
  const nextEventOccupancy = Number(nextEvent?.capacity || 0) > 0
    ? (Number(nextEvent?.tickets_sold || 0) / Number(nextEvent.capacity)) * 100
    : 0

  return (
    <div className="mb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <OrganizerPanel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-content">Tổng quan vận hành</h2>
            <p className="mt-1 text-xs text-subtle">Tình trạng sự kiện, sức chứa, bán vé và check-in của organizer.</p>
          </div>
          <span className="rounded-md border border-border-soft/35 bg-panel-soft px-3 py-1 text-xs font-bold text-subtle">
            {fmtNumber(dashboard?.total_events)} sự kiện
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-subtle">Đang công khai</p>
            <p className="mt-1 text-2xl font-black text-content">{fmtNumber(dashboard?.published_events)}</p>
            <p className="mt-1 text-xs text-muted">{fmtNumber(dashboard?.upcoming_events)} sắp diễn ra</p>
          </div>
          <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-subtle">Chờ duyệt</p>
            <p className="mt-1 text-2xl font-black text-warning">{fmtNumber(dashboard?.pending_review_events)}</p>
            <p className="mt-1 text-xs text-muted">{fmtNumber(dashboard?.draft_events)} bản nháp</p>
          </div>
          <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-subtle">Tỷ lệ lấp đầy</p>
            <p className="mt-1 text-2xl font-black text-success">{fmtNumber(dashboard?.occupancy_rate, 1)}%</p>
            <div className="mt-2"><ProgressBar value={dashboard?.occupancy_rate} /></div>
          </div>
          <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-subtle">Check-in</p>
            <p className="mt-1 text-2xl font-black text-ai">{fmtNumber(dashboard?.checkin_rate, 1)}%</p>
            <p className="mt-1 text-xs text-muted">{fmtNumber(dashboard?.checked_in_tickets)} / {fmtNumber(dashboard?.issued_tickets)} vé</p>
          </div>
        </div>
      </OrganizerPanel>

      <OrganizerPanel>
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" />
          <h2 className="font-bold text-content">Sắp tới & gói dịch vụ</h2>
        </div>
        {nextEvent ? (
          <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="truncate font-bold text-content">{nextEvent.title}</p>
            <p className="mt-1 text-xs text-subtle">{fmtDate(nextEvent.start_time)} · {fmtNumber(nextEvent.tickets_sold)} / {fmtNumber(nextEvent.capacity)} vé</p>
            <div className="mt-3"><ProgressBar value={nextEventOccupancy} tone="bg-tertiary" /></div>
          </div>
        ) : (
          <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3 text-sm font-semibold text-subtle">
            Chưa có sự kiện công khai sắp diễn ra.
          </div>
        )}
        <div className="mt-3 rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
          <p className="text-[11px] font-bold uppercase text-subtle">Gói hiện tại</p>
          <p className="mt-1 text-lg font-black text-content">{plan?.name || 'Chưa có gói active'}</p>
          <p className="mt-1 text-xs text-muted">
            {plan ? `Hết hạn ${fmtDate(plan.end_date)} · Giá gói ${fmtCurrency(plan.price)}` : 'Cần kích hoạt gói để mở đầy đủ tính năng.'}
          </p>
        </div>
      </OrganizerPanel>
    </div>
  )
}

function MoneyCompositionChart({ overall }) {
  const gross = Number(overall.gross_revenue || 0)
  const discount = Number(overall.total_discount || 0)
  const subscriptionCost = Number(overall.subscription_cost || 0)
  const net = Number(overall.net_revenue || 0)
  const total = Math.max(gross + discount, 1)
  const segments = [
    { label: 'Thực nhận', value: net, color: 'bg-success', text: 'text-success' },
    { label: 'Phí gói dịch vụ', value: subscriptionCost, color: 'bg-ai', text: 'text-ai' },
    { label: 'Chiết khấu', value: discount, color: 'bg-warning', text: 'text-warning' },
  ].filter((item) => item.value > 0)

  return (
    <OrganizerPanel className="mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-content">Cơ cấu doanh thu</h2>
          <p className="mt-1 text-xs text-subtle">Tỷ trọng thực nhận, phí gói dịch vụ và chiết khấu trong kỳ.</p>
        </div>
        <p className="text-sm font-black text-content">{fmtCurrency(gross)}</p>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-border-soft/25">
        {segments.map((item) => (
          <div
            key={item.label}
            className={`${item.color} min-w-1 transition-all`}
            style={{ width: `${Math.max(2, (item.value / total) * 100)}%` }}
            title={`${item.label}: ${fmtCurrency(item.value)}`}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Ròng cuối cùng', value: net, text: 'text-success' },
          { label: 'Phí gói dịch vụ', value: subscriptionCost, text: 'text-ai' },
          { label: 'Tổng chiết khấu', value: discount, text: 'text-warning' },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-subtle">{item.label}</p>
            <p className={`mt-1 text-lg font-extrabold ${item.text}`}>{fmtCurrency(item.value)}</p>
          </div>
        ))}
      </div>
    </OrganizerPanel>
  )
}

// ─── Executive Financial AI Sub-components ────────────────────────────────────

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
                  <div key={lIdx} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
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

function XaiScoreDrawer({ xai }) {
  if (!xai) return null

  const components = [
    { key: 'occupancy_component', title: 'Tỷ lệ lấp đầy sự kiện', defaultWeight: '30%', max: 30, color: 'bg-primary' },
    { key: 'margin_component', title: 'Biên lợi nhuận ròng (Net Margin)', defaultWeight: '25%', max: 25, color: 'bg-emerald-500' },
    { key: 'velocity_component', title: 'Xung lực bán vé 7 ngày (Sales Momentum)', defaultWeight: '20%', max: 20, color: 'bg-blue-500' },
    { key: 'inventory_pacing_component', title: 'Kiểm soát tồn kho & Thời gian', defaultWeight: '15%', max: 15, color: 'bg-amber-500' },
    { key: 'tier_mix_component', title: 'Cơ cấu danh mục hạng vé (Tier Mix)', defaultWeight: '10%', max: 10, color: 'bg-indigo-500' },
  ]

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-5 shadow-inner">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
            Giải trình thuật toán AI (Explainable AI - XAI)
          </h4>
          <p className="mt-0.5 text-xs text-slate-400">
            Hệ thống tính điểm minh bạch 100 điểm dựa trên 5 chỉ số định lượng trọng số:
          </p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
          Tổng điểm: {xai.total_health_score || xai.total || 0} / 100
        </span>
      </div>

      <div className="space-y-4">
        {components.map((item) => {
          const data = xai[item.key] || {}
          const score = Number(data.score || 0)
          const maxScore = Number(data.max_score || item.max)
          const pct = Math.min(100, Math.max(0, (score / maxScore) * 100))

          return (
            <div key={item.key} className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200">
                  {item.title} <span className="text-slate-400">({data.weight || item.defaultWeight})</span>
                </span>
                <span className="font-bold text-white">
                  {score.toFixed(1)} / {maxScore} điểm ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full ${item.color} transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>Dữ liệu đo lường: <strong className="text-slate-200">{data.metric_value || '—'}</strong></span>
                <span className="italic">{data.formula || ''}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TierBreakdownTable({ tiers = [] }) {
  if (!tiers.length) return null

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-slate-950/50">
      <div className="border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Cơ cấu đóng góp doanh thu & Tỷ lệ lấp đầy theo hạng vé (Pareto)
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 bg-slate-900/50 text-slate-400">
              <th className="px-4 py-2.5 font-bold">Hạng vé</th>
              <th className="px-4 py-2.5 font-bold">Giá niêm yết</th>
              <th className="px-4 py-2.5 font-bold">Đã bán / Sức chứa</th>
              <th className="px-4 py-2.5 font-bold">Lấp đầy</th>
              <th className="px-4 py-2.5 font-bold">Đóng góp DT</th>
              <th className="px-4 py-2.5 font-bold">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            {tiers.map((t) => {
              const statusClass =
                t.status === 'Hết vé (Sold Out)'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : t.status === 'Đang bán tốt'
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : t.status === 'Chậm tiêu thụ'
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'

              return (
                <tr key={t.id || t.name} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-bold text-white">{t.name}</td>
                  <td className="px-4 py-3 font-semibold">{fmtCurrency(t.price)}</td>
                  <td className="px-4 py-3">
                    {t.sold} / {t.capacity} vé
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, t.occupancy_rate)}%` }}
                        />
                      </div>
                      <span className="font-bold">{t.occupancy_rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-400">{t.revenue_contribution_pct}%</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusClass}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExecutivePillarCard({ title, content, index }) {
  const getPillarConfig = () => {
    const t = (title || '').toUpperCase()
    if (t.includes('HIỆU SUẤT') || t.includes('LỢI NHUẬN') || index === 0) {
      return {
        icon: CircleDollarSign,
        badge: 'Trụ cột 1 · Hiệu suất tài chính',
        badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        cardBorder: 'border-emerald-500/20 hover:border-emerald-500/40',
      }
    }
    if (t.includes('VẬN TỐC') || t.includes('TIÊU THỤ') || index === 1) {
      return {
        icon: Zap,
        badge: 'Trụ cột 2 · Vận tốc & Đà tăng trưởng',
        badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        cardBorder: 'border-blue-500/20 hover:border-blue-500/40',
      }
    }
    if (t.includes('ĐIỂM NGHẼN') || t.includes('RỦI RO') || index === 2) {
      return {
        icon: ShieldAlert,
        badge: 'Trụ cột 3 · Rủi ro & Tồn kho',
        badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        cardBorder: 'border-amber-500/20 hover:border-amber-500/40',
      }
    }
    return {
      icon: Sparkles,
      badge: 'Trụ cột 4 · Đề xuất chiến lược',
      badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
      cardBorder: 'border-purple-500/20 hover:border-purple-500/40',
    }
  }

  const { icon: Icon, badge, badgeClass, cardBorder } = getPillarConfig()

  return (
    <div className={`rounded-2xl border bg-slate-900/60 p-5 shadow-sm transition-all ${cardBorder}`}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-lg bg-white/5">
            <Icon className="size-4 text-white" />
          </div>
          <h3 className="text-sm font-bold text-white drop-shadow-sm">{title}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <FormattedMarkdownContent text={content} />
    </div>
  )
}

function formatMarkdownToHtml(text) {
  if (!text) return ''
  const paragraphs = text.split(/\n\s*\n/)
  return paragraphs
    .map((p) => {
      const lines = p.split('\n')
      const formattedLines = lines
        .map((line) => {
          const trimmed = line.trim()
          if (!trimmed) return ''
          const isListItem = /^[0-9]+\.\s+|^\*\s+|-\s+/.test(trimmed)
          const clean = trimmed.replace(/^[0-9]+\.\s+|^\*\s+|-\s+/, '')
          const withBold = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          if (isListItem) {
            return `<div class="pillar-item"><span class="pillar-bullet"></span><span>${withBold}</span></div>`
          }
          return `<p>${withBold}</p>`
        })
        .filter(Boolean)
        .join('')
      return `<div style="margin-bottom: 8px;">${formattedLines}</div>`
    })
    .join('')
}

function printExecutiveYieldReport({ financialSummary, eventTitle, dateRangeLabel }) {
  if (!financialSummary) return

  const intel = financialSummary.intelligence || {}
  const metrics = intel.metrics || {}
  const velocity = intel.velocity || {}
  const pacing = intel.inventory_pacing || {}
  const forecast = intel.forecast || {}
  const xai = intel.xai_breakdown || {}
  const tiers = intel.tier_breakdown || []
  const whatIf = intel.what_if || {}
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

  const xaiRowsHtml = [
    { key: 'occupancy_component', title: 'Tỷ lệ lấp đầy sự kiện', max: 30 },
    { key: 'margin_component', title: 'Biên lợi nhuận ròng (Net Margin)', max: 25 },
    { key: 'velocity_component', title: 'Xung lực bán vé 7 ngày (Sales Momentum)', max: 20 },
    { key: 'inventory_pacing_component', title: 'Kiểm soát tồn kho & Thời gian', max: 15 },
    { key: 'tier_mix_component', title: 'Cơ cấu danh mục hạng vé (Tier Mix)', max: 10 },
  ]
    .map((item) => {
      const d = xai[item.key] || {}
      const sc = Number(d.score || 0)
      const mx = Number(d.max_score || item.max)
      return `
      <tr>
        <td style="font-weight: 600;">${item.title}</td>
        <td>${d.weight || ''}</td>
        <td><strong>${d.metric_value || '—'}</strong></td>
        <td><strong>${sc.toFixed(1)} / ${mx} điểm</strong></td>
        <td style="font-size: 10px; color: #64748b; font-style: italic;">${d.formula || ''}</td>
      </tr>
    `
    })
    .join('')

  const pillarsHtml = pillars
    .map(
      (p) => `
    <div class="pillar-card">
      <div class="pillar-title">${p.title}</div>
      <div class="pillar-content">${formatMarkdownToHtml(p.content)}</div>
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
    @page { size: A4 portrait; margin: 12mm 12mm 12mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.45;
    }
    .header-bar {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #2563eb; margin-bottom: 2px; }
    .header-title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0; text-transform: uppercase; }
    .header-sub { font-size: 10.5px; color: #475569; margin: 0; }
    .header-meta { text-align: right; font-size: 10.5px; color: #475569; }
    .header-meta strong { color: #0f172a; }
    
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      background: #f8fafc;
      page-break-inside: avoid;
    }
    .kpi-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
    .kpi-val { font-size: 15px; font-weight: 800; color: #0f172a; }
    .kpi-desc { font-size: 9.5px; color: #475569; margin-top: 2px; }
    
    .section-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1e293b;
      border-left: 3px solid #2563eb;
      padding-left: 6px;
      margin: 12px 0 6px 0;
    }

    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; page-break-inside: avoid; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 5px 8px; border: 1px solid #cbd5e1; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; color: #1e293b; }
    
    .pillars-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }
    .pillar-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .pillar-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 0 0 6px 0;
    }
    .pillar-content p { margin: 0 0 5px 0; font-size: 10px; line-height: 1.4; color: #334155; }
    .pillar-content strong { color: #0f172a; }
    .pillar-item { display: flex; align-items: flex-start; gap: 5px; margin-bottom: 3px; font-size: 10px; line-height: 1.35; color: #334155; }
    .pillar-bullet { width: 4px; height: 4px; background: #2563eb; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
    
    .whatif-box {
      border: 1px solid #86efac;
      background: #f0fdf4;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .whatif-title { font-weight: 700; color: #166534; font-size: 10.5px; margin-bottom: 2px; }
    .whatif-desc { color: #15803d; font-size: 10px; }

    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 8.5px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <div class="brand">EVENTHUB PLATFORM · FINANCIAL INTELLIGENCE</div>
      <div class="header-title">Báo Cáo Cố Vấn Doanh Thu & Quản Trị Tồn Kho Vé</div>
      <div class="header-sub">Sự kiện: <strong>${eventTitle || 'Tất cả sự kiện'}</strong></div>
    </div>
    <div class="header-meta">
      <div>Kỳ phân tích: <strong>${dateRangeLabel || 'Tất cả thời gian'}</strong></div>
      <div>Thời điểm xuất: <strong>${now}</strong></div>
      <div style="margin-top: 2px; font-size: 9.5px; color: #2563eb; font-weight: 700;">Model: EventHub AI · Qwen 3 (8B)</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Financial Health Score</div>
      <div class="kpi-val">${intel.health_score || 0} <span style="font-size: 10px; color: #64748b;">/ 100</span></div>
      <div class="kpi-desc">Mức độ rủi ro: <strong>${riskLabel(intel.risk_level)}</strong></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">RevPAS (Doanh thu / Chỗ ngồi)</div>
      <div class="kpi-val">${fmtCurrency(metrics.revpas || 0)}</div>
      <div class="kpi-desc">Hiệu suất khai thác: <strong>${metrics.revpas_efficiency || 0}%</strong> giá vé</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Vận tốc bán 7 ngày gần nhất</div>
      <div class="kpi-val">${velocity.daily_tickets || 0} <span style="font-size: 10px; color: #64748b;">vé/ngày</span></div>
      <div class="kpi-desc">Đà bán: <strong>${intel.momentum?.label || 'Ổn định'}</strong></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tồn kho & Tiến độ thời gian</div>
      <div class="kpi-val" style="color: #d97706;">${pacing.remaining_tickets || 0} <span style="font-size: 10px; color: #64748b;">vé tồn</span></div>
      <div class="kpi-desc">${pacing.days_until_event !== null && pacing.days_until_event !== undefined ? `Còn ${pacing.days_until_event} ngày (cần ${pacing.required_daily_tickets || 0} vé/ngày)` : 'Chưa xác định ngày'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Biên lợi nhuận ròng</div>
      <div class="kpi-val" style="color: #16a34a;">${metrics.net_margin_rate || 0}%</div>
      <div class="kpi-desc">Chi phí nền tảng & dịch vụ: ${metrics.fee_rate || 0}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Dự báo 7 ngày tiếp theo</div>
      <div class="kpi-val">${fmtCurrency(forecast.next_7_days_revenue || 0)}</div>
      <div class="kpi-desc">Dự kiến ~${forecast.next_7_days_tickets || 0} vé (Độ tin cậy: ${forecast.confidence || 'MEDIUM'})</div>
    </div>
  </div>

  ${
    tiers.length > 0
      ? `
    <div class="section-title">Cơ cấu đóng góp doanh thu & Tỷ lệ lấp đầy theo hạng vé (Pareto)</div>
    <table>
      <thead>
        <tr>
          <th>Hạng vé</th>
          <th>Giá niêm yết</th>
          <th>Đã bán / Sức chứa</th>
          <th>Lấp đầy</th>
          <th>Đóng góp DT</th>
          <th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        ${tierRowsHtml}
      </tbody>
    </table>
  `
      : ''
  }

  <div class="section-title">Nội dung phân tích chiến lược (Executive Yield Insights)</div>
  <div class="pillars-grid">
    ${pillarsHtml}
  </div>

  ${
    whatIf.estimated_gross_revenue
      ? `
    <div class="whatif-box">
      <div class="whatif-title">Mô phỏng kích cầu doanh thu (What-If Revenue Modeling)</div>
      <div class="whatif-desc">
        Nếu chiến dịch kích cầu bán thêm <strong>${Number(whatIf.additional_tickets || 0).toLocaleString('vi-VN')} vé</strong> ở mức giá trung bình hiện tại (${fmtCurrency(whatIf.avg_ticket_price)}), doanh thu gộp dự kiến gia tăng thêm <strong>${fmtCurrency(whatIf.estimated_gross_revenue)}</strong>.
      </div>
    </div>
  `
      : ''
  }

  ${
    xai.total_health_score
      ? `
    <div class="section-title">Giải trình thuật toán AI (Explainable AI - XAI Scoring Breakdown)</div>
    <table>
      <thead>
        <tr>
          <th>Thành phần đánh giá</th>
          <th>Trọng số</th>
          <th>Dữ liệu đo lường</th>
          <th>Điểm đạt được</th>
          <th>Công thức & Tiêu chí</th>
        </tr>
      </thead>
      <tbody>
        ${xaiRowsHtml}
      </tbody>
    </table>
  `
      : ''
  }

  <div class="footer">
    <div>Báo cáo được khởi tạo tự động bởi Hệ thống Quản trị Doanh thu AI - Nền tảng EventHub.</div>
    <div>Trang 1/1 · Bảo mật nội bộ Organizer</div>
  </div>
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
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }, 2000)
  }, 300)
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [financialSummary, setFinancialSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showXaiBreakdown, setShowXaiBreakdown] = useState(false)

  useEffect(() => {
    fetchOrganizerEvents()
      .then((data) => setEvents((data || []).filter((ev) => ev.status === 'PUBLISHED')))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = getDateRange(datePreset, { from: customFrom, to: customTo })
      const params = { dateFrom: range.dateFrom, dateTo: range.dateTo }
      if (selectedEventId) params.eventId = selectedEventId
      const data = await fetchRevenueStats(params)
      setStats(data)
      if (comparison.enabled) {
        const comparisonRange = getDateRange('custom', {
          from: comparison.from,
          to: comparison.to,
        })
        const comparisonParams = {
          dateFrom: comparisonRange.dateFrom,
          dateTo: comparisonRange.dateTo,
        }
        if (selectedEventId) comparisonParams.eventId = selectedEventId
        const comparisonData = await fetchRevenueStats(comparisonParams)
        setComparisonStats(comparisonData)
      } else {
        setComparisonStats(null)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu doanh thu.')
    } finally {
      setLoading(false)
    }
  }, [comparison, selectedEventId, datePreset, customFrom, customTo])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStats() }, [loadStats])

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
    } catch (err) {
      setSummaryError(err.response?.data?.message || 'Không thể tạo báo cáo tài chính AI.')
    } finally {
      setSummaryLoading(false)
    }
  }, [datePreset, customFrom, customTo, selectedEventId])

  const handleCopySummary = () => {
    if (!financialSummary?.summary) return
    navigator.clipboard.writeText(financialSummary.summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinancialSummary(null)
    setSummaryError('')
  }, [datePreset, customFrom, customTo, selectedEventId])

  const overall = stats?.overall
  const dashboard = stats?.dashboard ?? {}
  const subscription = stats?.subscription ?? {}
  const byEvent = stats?.by_event ?? []
  const dailyRevenue = stats?.daily_revenue ?? []
  const comparisonDailyRevenue = comparisonStats?.daily_revenue ?? []
  const maxEventRevenue = Math.max(...byEvent.map((e) => Number(e.gross_revenue)), 1)
  const activeRange = getDateRange(datePreset, { from: customFrom, to: customTo })
  const activeRangeLabel = getDateRangeLabel(datePreset, activeRange)

  const handlePrintReport = () => {
    const eventObj = events.find((ev) => ev.id === selectedEventId)
    const eventTitle = eventObj ? eventObj.title : (selectedEventId ? 'Sự kiện' : 'Tất cả sự kiện')
    printExecutiveYieldReport({
      financialSummary,
      eventTitle,
      dateRangeLabel: activeRangeLabel,
    })
  }

  return (
    <OrganizerPage
      title="Tổng quan"
      description="Theo dõi tình trạng sự kiện, bán vé, check-in và doanh thu thực nhận của organizer."
    >
      {/* ── Filters ── */}
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-col gap-4 sm:flex-row">
            <label className="flex-1">
              <span className="block text-sm font-semibold text-subtle">Sự kiện</span>
              {eventsLoading ? (
                <div className="mt-2 flex h-10 items-center gap-2 text-sm text-subtle">
                  <Loader2 className="size-4 animate-spin" /> Đang tải...
                </div>
              ) : (
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  <option value="">Tất cả sự kiện</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              )}
            </label>

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
          <div className="flex flex-col gap-2 sm:flex-row sm:self-end">
            <button
              type="button"
              onClick={loadStats}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-soft/40 bg-panel-soft px-4 text-sm font-semibold text-subtle transition hover:border-[#C99A47]/40 hover:text-[#E6C17A] disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={loadFinancialSummary}
              disabled={summaryLoading}
              className="org-btn-primary h-10 px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {summaryLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Tạo báo cáo AI
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-error/30 bg-error/[0.07] px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {summaryError && (
        <div className="mb-5 rounded-lg border border-error/30 bg-error/[0.07] px-4 py-3 text-sm font-semibold text-error">
          {summaryError}
        </div>
      )}

      {loading && !stats ? (
        <OrganizerPanel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </OrganizerPanel>
      ) : stats ? (
        <>
          <DashboardOverview dashboard={dashboard} subscription={subscription} />

          {financialSummary && (
            <OrganizerPanel id="ai-executive-report" className="mb-8 border-ai/40 bg-gradient-to-b from-ai/[0.08] to-transparent p-6 shadow-2xl">
              {/* ── Executive Header ── */}
              <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-tr from-ai to-primary shadow-lg shadow-ai/30">
                      <Sparkles className="size-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white drop-shadow-sm">
                        Báo cáo Cố vấn Doanh thu & Lợi nhuận (Executive Yield Briefing)
                      </h2>
                      <p className="text-xs font-semibold text-slate-400">
                        Phân tích định lượng nâng cao (RevPAS, Velocity, Pacing) kết hợp AI Chiến lược cấp cao
                      </p>
                    </div>
                  </div>
                </div>

                <div className="no-print flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-ai/30 bg-ai/10 px-3 py-1 text-xs font-bold text-[#c99a47]">
                    EventHub AI · Qwen 3 (8B) Yield Advisor
                  </span>
                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                    title="In hoặc xuất báo cáo PDF"
                  >
                    <Printer className="size-3.5" />
                    <span>In / Xuất PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                    title="Sao chép nội dung báo cáo"
                  >
                    {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                    <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
                  </button>
                </div>
              </div>

              {/* ── 6-Metric Executive Quantitative Scorecard ── */}
              {financialSummary.intelligence && (
                <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {/* Card 1: Health Score */}
                  <div className="print-border rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Health Score</p>
                      <button
                        type="button"
                        onClick={() => setShowXaiBreakdown((prev) => !prev)}
                        className="no-print text-[10px] font-bold text-primary hover:underline"
                      >
                        {showXaiBreakdown ? 'Thu gọn XAI' : 'Xem XAI'}
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">{financialSummary.intelligence.health_score}</span>
                      <span className="text-xs font-bold text-slate-400">/100</span>
                    </div>
                    <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskClass(financialSummary.intelligence.risk_level)}`}>
                      {riskLabel(financialSummary.intelligence.risk_level)}
                    </span>
                  </div>

                  {/* Card 2: RevPAS */}
                  <div className="print-border rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">RevPAS (Doanh thu / Chỗ)</p>
                    <p className="mt-1.5 text-lg font-black text-white">
                      {fmtCurrency(financialSummary.intelligence.metrics?.revpas || 0)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      Hiệu suất: <strong className="text-primary">{financialSummary.intelligence.metrics?.revpas_efficiency || 0}%</strong> giá vé
                    </p>
                  </div>

                  {/* Card 3: Velocity */}
                  <div className="print-border rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vận tốc bán 7 ngày</p>
                    <p className="mt-1.5 text-lg font-black text-white">
                      {financialSummary.intelligence.velocity?.daily_tickets || 0} <span className="text-xs font-normal text-slate-400">vé/ngày</span>
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-400">
                      {financialSummary.intelligence.momentum?.label || 'Ổn định'}
                    </p>
                  </div>

                  {/* Card 4: Inventory & Pacing */}
                  <div className="print-border rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tồn kho & Thời gian</p>
                    <p className="mt-1.5 text-lg font-black text-amber-400">
                      {financialSummary.intelligence.inventory_pacing?.remaining_tickets || 0} <span className="text-xs font-normal text-slate-400">vé tồn</span>
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      {financialSummary.intelligence.inventory_pacing?.days_until_event !== null && financialSummary.intelligence.inventory_pacing?.days_until_event !== undefined
                        ? `Còn ${financialSummary.intelligence.inventory_pacing.days_until_event} ngày (cần ${financialSummary.intelligence.inventory_pacing.required_daily_tickets || 0} vé/ngày)`
                        : 'Không giới hạn ngày'}
                    </p>
                  </div>

                  {/* Card 5: Net Margin */}
                  <div className="print-border rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Biên lợi nhuận ròng</p>
                    <p className="mt-1.5 text-lg font-black text-emerald-400">
                      {financialSummary.intelligence.metrics?.net_margin_rate || 0}%
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      Phí DV: {financialSummary.intelligence.metrics?.fee_rate || 0}%
                    </p>
                  </div>

                  {/* Card 6: Forecast 7d */}
                  <div className="print-border rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dự báo 7 ngày tới</p>
                    <p className="mt-1.5 text-lg font-black text-white">
                      {fmtCurrency(financialSummary.intelligence.forecast?.next_7_days_revenue || 0)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      ~{financialSummary.intelligence.forecast?.next_7_days_tickets || 0} vé (Độ tin cậy: {financialSummary.intelligence.forecast?.confidence || 'MEDIUM'})
                    </p>
                  </div>
                </div>
              )}

              {/* ── Collapsible XAI Explainer ── */}
              {showXaiBreakdown && financialSummary.intelligence?.xai_breakdown && (
                <div className="mb-6">
                  <XaiScoreDrawer xai={financialSummary.intelligence.xai_breakdown} />
                </div>
              )}

              {/* ── Tier Breakdown Table (Pareto) ── */}
              {financialSummary.intelligence?.tier_breakdown && financialSummary.intelligence.tier_breakdown.length > 0 && (
                <div className="mb-6">
                  <TierBreakdownTable tiers={financialSummary.intelligence.tier_breakdown} />
                </div>
              )}

              {/* ── 4 Pillars of AI Executive Analysis ── */}
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Nội dung phân tích chiến lược (Executive Insights)
                  </h3>
                </div>

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
                    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-5">
                      <FormattedMarkdownContent text={financialSummary.summary} />
                    </div>
                  )
                })()}
              </div>

              {/* ── What-if Scenario & Recommendations ── */}
              {financialSummary.intelligence?.what_if && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-emerald-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Mô phỏng kích cầu doanh thu (What-If Revenue Scenario)
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    Nếu chiến dịch kích cầu bán thêm{' '}
                    <strong className="text-white">
                      {Number(financialSummary.intelligence.what_if.additional_tickets || 0).toLocaleString('vi-VN')} vé
                    </strong>{' '}
                    ở mức giá vé trung bình hiện tại ({fmtCurrency(financialSummary.intelligence.what_if.avg_ticket_price)}),
                    doanh thu gộp sự kiện dự kiến gia tăng thêm{' '}
                    <strong className="font-black text-emerald-400">
                      {fmtCurrency(financialSummary.intelligence.what_if.estimated_gross_revenue)}
                    </strong>
                    .
                  </p>
                </div>
              )}
            </OrganizerPanel>
          )}

          {/* ── KPI Cards ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              label="Doanh thu gộp"
              value={fmtShort(overall.gross_revenue)}
              sub="Tiền vé đã thanh toán sau khuyến mãi"
              accentBg="bg-tertiary/15"
              accentColor="text-primary"
            />
            <StatCard
              icon={TrendingUp}
              label="Ròng cuối cùng"
              value={fmtShort(overall.net_revenue)}
              sub={`Đã trừ phí: ${fmtCurrency(overall.total_costs)}`}
              accentBg="bg-success/15"
              accentColor="text-success"
            />
            <StatCard
              icon={ReceiptText}
              label="Tổng đơn hàng"
              value={overall.total_orders.toLocaleString('vi-VN')}
              sub="Đơn đã thanh toán"
              accentBg="bg-ai/15"
              accentColor="text-ai"
            />
            <StatCard
              icon={CheckCircle2}
              label="Lấp đầy hệ thống"
              value={`${fmtNumber(dashboard.occupancy_rate, 1)}%`}
              sub={`${fmtNumber(dashboard.issued_tickets)} / ${fmtNumber(dashboard.total_capacity)} vé`}
              accentBg="bg-warning/15"
              accentColor="text-warning"
            />
          </div>

          <EventStatusCharts dashboard={dashboard} />
          <TicketOpsChart dashboard={dashboard} />
          <MoneyCompositionChart overall={overall} />

          {/* ── Daily Revenue Chart ── */}
          <OrganizerPanel className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              <h2 className="font-bold text-content">Doanh thu ròng theo ngày</h2>
              <span className="ml-auto text-xs text-subtle">
                <CalendarRange className="mr-1 inline size-3" />
                {activeRangeLabel}
              </span>
            </div>
            <div className={comparison.enabled ? 'grid gap-4 xl:grid-cols-2' : ''}>
              <div>
                {comparison.enabled && (
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">
                    Kỳ hiện tại
                  </p>
                )}
                <BarChartSimple data={dailyRevenue} />
                {dailyRevenue.length > 0 && (
                  <p className="mt-2 text-center text-xs text-subtle">
                    Tổng: {fmtCurrency(dailyRevenue.reduce((s, d) => s + Number(d.net_revenue), 0))}
                  </p>
                )}
              </div>
              {comparison.enabled && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">
                    {comparison.label || 'Kỳ so sánh'}
                  </p>
                  <BarChartSimple data={comparisonDailyRevenue} />
                  {comparisonDailyRevenue.length > 0 && (
                    <p className="mt-2 text-center text-xs text-subtle">
                      Tổng: {fmtCurrency(comparisonDailyRevenue.reduce((s, d) => s + Number(d.net_revenue), 0))}
                    </p>
                  )}
                </div>
              )}
            </div>
          </OrganizerPanel>

          {/* ── Per-event breakdown ── */}
          {byEvent.length > 0 && (
            <OrganizerPanel>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-content">Doanh thu theo sự kiện</h2>
                  <p className="mt-1 text-xs text-subtle">So sánh doanh thu gộp, doanh thu ròng, giảm giá đã áp dụng và số đơn của từng sự kiện.</p>
                </div>
                <span className="rounded-md border border-border-soft/35 bg-panel-soft px-3 py-1 text-xs font-bold text-subtle">
                  {byEvent.length} sự kiện
                </span>
              </div>
              <HorizontalRevenueChart data={byEvent} maxValue={maxEventRevenue} />
            </OrganizerPanel>
          )}

          {overall.total_orders === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <CircleDollarSign className="mx-auto size-10 text-subtle" />
              <p className="mt-3 font-bold text-subtle">Chưa có doanh thu trong khoảng thời gian này.</p>
              <p className="mt-1 text-sm text-muted">Thử mở rộng khoảng thời gian hoặc chọn sự kiện khác.</p>
            </OrganizerPanel>
          )}
        </>
      ) : null}
    </OrganizerPage>
  )
}
