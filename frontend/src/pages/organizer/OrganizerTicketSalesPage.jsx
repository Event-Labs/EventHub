import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
  Loader2,
  RefreshCw,
  Ticket,
  TrendingUp,
  CircleDollarSign,
  ShoppingCart,
  Users,
} from 'lucide-react'
import { DateRangeFilter, getDateRange, getDateRangeLabel } from '@/components/DateRangeFilter.jsx'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchTicketSalesAnalytics } from '@/services/organizerOrders.js'
import { OrganizerPage, OrganizerPanel, StatCard } from './OrganizerComponents.jsx'

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

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OccupancyBadge({ rate }) {
  const num = Number(rate) || 0
  if (num >= 80) return <span className="inline-flex rounded-full border border-success/30 px-2 py-0.5 text-xs font-bold bg-success/15 text-success">{num}%</span>
  if (num >= 50) return <span className="inline-flex rounded-full border border-tertiary/30 px-2 py-0.5 text-xs font-bold bg-tertiary/15 text-primary">{num}%</span>
  if (num > 0) return <span className="inline-flex rounded-full border border-warning/30 px-2 py-0.5 text-xs font-bold bg-warning/15 text-warning">{num}%</span>
  return <span className="inline-flex rounded-full border border-border-soft/30 px-2 py-0.5 text-xs font-bold bg-panel-soft text-subtle">0%</span>
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

  if (!data || data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-subtle">
        Không có dữ liệu trong khoảng thời gian này.
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => Number(d.tickets_sold)), 1)
  const gap = Math.max(Math.floor(600 / data.length), 8)
  const barWidth = Math.max(gap - 4, 4)
  const svgWidth = Math.max(data.length * gap + 10, containerWidth || 0)

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg width={svgWidth} height={height + 30} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={0} x2={svgWidth} y1={height - pct * height} y2={height - pct * height} stroke="rgba(43,92,146,0.2)" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const barH = Math.max((Number(d.tickets_sold) / maxVal) * height, 2)
          const x = i * gap + (gap - barWidth) / 2
          const y = height - barH
          const isHighest = Number(d.tickets_sold) === maxVal
          return (
            <g key={`${d.day}-${i}`}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={isHighest ? '#2b5c92' : '#b3cde0'}>
                <title>{`${d.day}: ${Number(d.tickets_sold).toLocaleString('vi-VN')} vé · ${fmtCurrency(d.revenue)}`}</title>
              </rect>
            </g>
          )
        })}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 6))
          if (i % step !== 0) return null
          return (
            <text key={`lbl-${i}`} x={i * gap + gap / 2} y={height + 20} textAnchor="middle" fontSize={10} fill="#b3cde0">
              {d.day ? String(d.day).slice(5) : ''}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function aggregateTicketTypes(data, limit, sortKey = 'revenue') {
  const sorted = [...(data || [])].sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0))
  if (sorted.length <= limit) return sorted

  const visible = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  const other = rest.reduce(
    (acc, item) => ({
      ...acc,
      capacity: acc.capacity + Number(item.capacity || 0),
      sold_quantity: acc.sold_quantity + Number(item.sold_quantity || 0),
      revenue: acc.revenue + Number(item.revenue || 0),
    }),
    {
      ticket_type_id: 'other',
      ticket_type_name: `Khác (${rest.length})`,
      unit_price: 0,
      capacity: 0,
      sold_quantity: 0,
      revenue: 0,
    },
  )
  other.occupancy_rate = other.capacity > 0
    ? Math.round((other.sold_quantity / other.capacity) * 1000) / 10
    : 0

  return [...visible, other]
}

function TicketTypeColumnChart({ data, height = 260 }) {
  if (!data?.length) return null

  const chartData = aggregateTicketTypes(data, 8, 'revenue')
  const maxSold = Math.max(...chartData.map((item) => Number(item.sold_quantity || 0)), 1)
  const maxRevenue = Math.max(...chartData.map((item) => Number(item.revenue || 0)), 1)
  const groupWidth = 82
  const chartWidth = Math.max(chartData.length * groupWidth + 28, 640)
  const topPad = 18
  const plotHeight = height - 58

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-subtle">
          Hiển thị top {Math.min(8, data.length)} loại vé theo doanh thu{data.length > 8 ? ', phần còn lại được gom vào Khác.' : '.'}
        </p>
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />Doanh thu</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Vé bán</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border-soft/25 bg-panel-soft/35 px-3 py-4">
        <svg width={chartWidth} height={height} className="block">
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <g key={pct}>
              <line
                x1={0}
                x2={chartWidth}
                y1={topPad + plotHeight - pct * plotHeight}
                y2={topPad + plotHeight - pct * plotHeight}
                stroke="rgba(179,205,224,0.16)"
                strokeWidth={1}
              />
              <text x={4} y={topPad + plotHeight - pct * plotHeight - 4} fontSize={10} fill="#72787c">
                {fmtShort(maxRevenue * pct)}
              </text>
            </g>
          ))}
          {chartData.map((item) => {
            const sold = Number(item.sold_quantity || 0)
            const revenue = Number(item.revenue || 0)
            const revenueHeight = revenue > 0 ? Math.max(3, (revenue / maxRevenue) * plotHeight) : 0
            const soldHeight = sold > 0 ? Math.max(3, (sold / maxSold) * plotHeight) : 0
            const x = chartData.indexOf(item) * groupWidth + 34
            const baseY = topPad + plotHeight
            const label = item.ticket_type_name.length > 12
              ? `${item.ticket_type_name.slice(0, 11)}...`
              : item.ticket_type_name

            return (
              <g key={item.ticket_type_id}>
                <rect
                  x={x}
                  y={baseY - revenueHeight}
                  width={18}
                  height={revenueHeight}
                  rx={4}
                  fill="#22c55e"
                >
                  <title>{`${item.ticket_type_name}\nDoanh thu: ${fmtCurrency(revenue)}\nVé bán: ${sold.toLocaleString('vi-VN')}\nLấp đầy: ${Number(item.occupancy_rate || 0)}%`}</title>
                </rect>
                <rect
                  x={x + 23}
                  y={baseY - soldHeight}
                  width={18}
                  height={soldHeight}
                  rx={4}
                  fill="#2b5c92"
                >
                  <title>{`${item.ticket_type_name}\nVé bán: ${sold.toLocaleString('vi-VN')}\nDoanh thu: ${fmtCurrency(revenue)}\nLấp đầy: ${Number(item.occupancy_rate || 0)}%`}</title>
                </rect>
                <text x={x + 20} y={height - 24} textAnchor="middle" fontSize={10} fill="#b3cde0">
                  {label}
                </text>
                <text x={x + 20} y={height - 9} textAnchor="middle" fontSize={10} fill="#72787c">
                  {fmtShort(revenue)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function RevenueShareDonut({ data }) {
  const segments = aggregateTicketTypes(data, 5, 'revenue')
    .map((item, index) => ({
      label: item.ticket_type_name,
      value: Number(item.revenue || 0),
      color: ['#2b5c92', '#22c55e', '#eab308', '#8b5cf6', '#ef4444', '#b3cde0'][index % 6],
    }))
    .filter((item) => item.value > 0)
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  const size = 160
  const stroke = 18
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <OrganizerPanel>
      <div className="mb-4 flex items-center gap-2">
        <CircleDollarSign className="size-5 text-success" />
        <h2 className="font-bold text-content">Tỷ trọng doanh thu theo loại vé</h2>
      </div>
      {total <= 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-subtle">Chưa có doanh thu theo loại vé.</div>
      ) : (
        <div className="flex flex-col items-center gap-4 lg:flex-row">
          <div className="relative shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(179,205,224,0.12)" strokeWidth={stroke} />
              {segments.map((item) => {
                const dash = (item.value / total) * circumference
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
                    <title>{`${item.label}: ${fmtCurrency(item.value)}`}</title>
                  </circle>
                )
                offset += dash
                return circle
              })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-lg font-black text-content">{fmtShort(total)}</p>
                <p className="text-[11px] font-bold uppercase text-subtle">Tổng</p>
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
                <span className="shrink-0 text-sm font-black text-content">{fmtShort(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </OrganizerPanel>
  )
}

function EventOccupancyColumnChart({ data, height = 260 }) {
  if (!data?.length) return null

  const chartData = [...data]
    .sort((a, b) => Number(b.occupancy_rate || 0) - Number(a.occupancy_rate || 0))
    .slice(0, 10)
  const groupWidth = 86
  const chartWidth = Math.max(chartData.length * groupWidth + 28, 640)
  const topPad = 18
  const plotHeight = height - 58

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-subtle">
          Hiển thị top {Math.min(10, data.length)} sự kiện theo tỷ lệ lấp đầy{data.length > 10 ? ', các sự kiện còn lại xem trong bộ lọc hoặc báo cáo chi tiết.' : '.'}
        </p>
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />Tốt</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Ổn</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />Thấp</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border-soft/25 bg-panel-soft/35 px-3 py-4">
        <svg width={chartWidth} height={height} className="block">
          {[0, 25, 50, 75, 100].map((pct) => (
            <g key={pct}>
              <line
                x1={0}
                x2={chartWidth}
                y1={topPad + plotHeight - (pct / 100) * plotHeight}
                y2={topPad + plotHeight - (pct / 100) * plotHeight}
                stroke="rgba(179,205,224,0.16)"
                strokeWidth={1}
              />
              <text x={4} y={topPad + plotHeight - (pct / 100) * plotHeight - 4} fontSize={10} fill="#72787c">
                {pct}%
              </text>
            </g>
          ))}
          {chartData.map((event, index) => {
            const occupancy = Math.max(0, Math.min(100, Number(event.occupancy_rate || 0)))
            const sold = Number(event.sold_quantity || 0)
            const capacity = Number(event.total_capacity || 0)
            const revenue = Number(event.revenue || 0)
            const barHeight = occupancy > 0 ? Math.max(3, (occupancy / 100) * plotHeight) : 0
            const x = index * groupWidth + 42
            const baseY = topPad + plotHeight
            const label = event.event_title.length > 13
              ? `${event.event_title.slice(0, 12)}...`
              : event.event_title
            const fill = occupancy >= 80 ? '#22c55e' : occupancy >= 50 ? '#2b5c92' : '#eab308'

            return (
              <g key={event.event_id}>
                <rect
                  x={x}
                  y={baseY - barHeight}
                  width={34}
                  height={barHeight}
                  rx={6}
                  fill={fill}
                >
                  <title>{`${event.event_title}\nLấp đầy: ${occupancy}%\nĐã bán: ${sold.toLocaleString('vi-VN')} / ${capacity.toLocaleString('vi-VN')} vé\nDoanh thu: ${fmtCurrency(revenue)}\nĐơn hàng: ${Number(event.total_orders || 0).toLocaleString('vi-VN')}`}</title>
                </rect>
                <text x={x + 17} y={baseY - barHeight - 7} textAnchor="middle" fontSize={10} fontWeight={700} fill="#b3cde0">
                  {occupancy}%
                </text>
                <text x={x + 17} y={height - 24} textAnchor="middle" fontSize={10} fill="#b3cde0">
                  {label}
                </text>
                <text x={x + 17} y={height - 9} textAnchor="middle" fontSize={10} fill="#72787c">
                  {sold.toLocaleString('vi-VN')} vé
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  // Load event list (only published events)
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => setEvents((data || []).filter((ev) => ev.status === 'PUBLISHED')))
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
        const comparisonRange = getDateRange('custom', {
          from: comparison.from,
          to: comparison.to,
        })
        const comparisonParams = {
          dateFrom: comparisonRange.dateFrom,
          dateTo: comparisonRange.dateTo,
        }
        if (selectedEventId) comparisonParams.eventId = selectedEventId
        const comparisonData = await fetchTicketSalesAnalytics(comparisonParams)
        setComparisonAnalytics(comparisonData)
      } else {
        setComparisonAnalytics(null)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu phân tích bán vé.')
    } finally {
      setLoading(false)
    }
  }, [comparison, selectedEventId, datePreset, customFrom, customTo])

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const overall = analytics?.overall
  const byTicketType = analytics?.by_ticket_type ?? []
  const byEvent = analytics?.by_event ?? []
  const dailySales = analytics?.daily_sales ?? []
  const comparisonDailySales = comparisonAnalytics?.daily_sales ?? []
  const activeRange = getDateRange(datePreset, { from: customFrom, to: customTo })
  const activeRangeLabel = getDateRangeLabel(datePreset, activeRange)

  return (
    <OrganizerPage
      title="Phân tích bán vé"
      description="Theo dõi lượng vé bán theo thời gian, loại vé và tỷ lệ lấp đầy sự kiện."
    >
      {/* ── Filters ── */}
      <OrganizerPanel className="mb-6">
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
                  className="org-input"
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

          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            className="admin-secondary inline-flex h-10 items-center gap-2 self-end disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </OrganizerPanel>



      {loading && !analytics ? (
        <OrganizerPanel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </OrganizerPanel>
      ) : analytics ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Ticket}
              label="Tổng vé đã bán"
              value={Number(overall.total_tickets_sold).toLocaleString('vi-VN')}
              sub={`${Number(overall.total_orders).toLocaleString()} đơn hàng`}
              accentBg="bg-tertiary/15"
              accentColor="text-primary"
            />
            <StatCard
              icon={CircleDollarSign}
              label="Doanh thu từ vé"
              value={fmtShort(overall.total_revenue)}
              sub={fmtCurrency(overall.total_revenue)}
              accentBg="bg-success/15"
              accentColor="text-success"
            />
            <StatCard
              icon={TrendingUp}
              label="Giá vé trung bình"
              value={fmtCurrency(overall.avg_ticket_price)}
              sub="Trung bình mỗi vé"
              accentBg="bg-warning/15"
              accentColor="text-warning"
            />
            <StatCard
              icon={ShoppingCart}
              label="Đơn hàng"
              value={Number(overall.total_orders).toLocaleString('vi-VN')}
              sub={overall.total_orders > 0
                ? `TB ${(Number(overall.total_tickets_sold) / Number(overall.total_orders)).toFixed(1)} vé/đơn`
                : '—'}
              accentBg="bg-ai/15"
              accentColor="text-ai"
            />
          </div>

          {/* ── Daily Sales Chart ── */}
          <OrganizerPanel className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              <h2 className="font-bold text-content">Lượng vé bán theo ngày</h2>
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
                <BarChartSimple data={dailySales} />
                {dailySales.length > 0 && (
                  <p className="mt-2 text-center text-xs text-subtle">
                    Tổng: {dailySales.reduce((s, d) => s + Number(d.tickets_sold), 0).toLocaleString('vi-VN')} vé
                    · {fmtCurrency(dailySales.reduce((s, d) => s + Number(d.revenue), 0))}
                  </p>
                )}
              </div>
              {comparison.enabled && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">
                    {comparison.label || 'Kỳ so sánh'}
                  </p>
                  <BarChartSimple data={comparisonDailySales} />
                  {comparisonDailySales.length > 0 && (
                    <p className="mt-2 text-center text-xs text-subtle">
                      Tổng: {comparisonDailySales.reduce((s, d) => s + Number(d.tickets_sold), 0).toLocaleString('vi-VN')} vé
                      · {fmtCurrency(comparisonDailySales.reduce((s, d) => s + Number(d.revenue), 0))}
                    </p>
                  )}
                </div>
              )}
            </div>
          </OrganizerPanel>

          {byTicketType.length > 0 && (
            <div className="mb-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <OrganizerPanel>
                <div className="mb-4 flex items-center gap-2">
                  <Ticket className="size-5 text-primary" />
                  <h2 className="font-bold text-content">Biểu đồ cột theo loại vé</h2>
                </div>
                <TicketTypeColumnChart data={byTicketType} />
              </OrganizerPanel>
              <RevenueShareDonut data={byTicketType} />
            </div>
          )}

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            {/* ── By Ticket Type ── */}
            {byTicketType.length > 0 && (
              <OrganizerPanel>
                <div className="mb-4 flex items-center gap-2">
                  <Ticket className="size-5 text-primary" />
                  <h2 className="font-bold text-content">Bán hàng theo loại vé</h2>
                </div>
                <div className="max-h-[420px] overflow-auto pr-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr className="border-b border-border-soft/30 text-xs uppercase text-subtle">
                        <th className="pb-3 text-left font-bold">Loại vé</th>
                        <th className="pb-3 text-right font-bold">Sức chứa</th>
                        <th className="pb-3 text-right font-bold">Đã bán</th>
                        <th className="pb-3 text-right font-bold">Doanh thu</th>
                        <th className="pb-3 text-right font-bold">Lấp đầy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byTicketType.map((tt) => (
                        <tr key={tt.ticket_type_id} className="border-b border-border-soft/20 last:border-0 hover:bg-panel-soft/50">
                          <td className="py-3">
                            <p className="font-semibold text-content">{tt.ticket_type_name}</p>
                            <p className="text-xs text-subtle">{fmtCurrency(tt.unit_price)}/vé</p>
                          </td>
                          <td className="py-3 text-right text-subtle">
                            {Number(tt.capacity).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3 text-right font-semibold text-content">
                            {Number(tt.sold_quantity).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3 text-right font-semibold text-success">
                            {fmtShort(tt.revenue)}
                          </td>
                          <td className="py-3 text-right">
                            <OccupancyBadge rate={tt.occupancy_rate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border-soft/40 bg-panel-soft/50">
                        <td className="py-3 font-bold text-content">Tổng cộng</td>
                        <td className="py-3 text-right font-bold text-subtle">
                          {byTicketType.reduce((s, tt) => s + Number(tt.capacity), 0).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 text-right font-bold text-content">
                          {Number(overall.total_tickets_sold).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 text-right font-bold text-success">
                          {fmtCurrency(overall.total_revenue)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </OrganizerPanel>
            )}

            {/* ── By Event Occupancy ── */}
            {byEvent.length > 0 && (
              <OrganizerPanel>
                <div className="mb-4 flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  <h2 className="font-bold text-content">Tỷ lệ lấp đầy theo sự kiện</h2>
                </div>
                <EventOccupancyColumnChart data={byEvent} />
              </OrganizerPanel>
            )}
          </div>

          {overall.total_tickets_sold === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <Ticket className="mx-auto size-10 text-subtle" />
              <p className="mt-3 font-bold text-content">Chưa có vé nào được bán trong khoảng thời gian này.</p>
              <p className="mt-1 text-sm text-subtle">
                Thử mở rộng khoảng thời gian hoặc chọn sự kiện khác.
              </p>
            </OrganizerPanel>
          )}
        </>
      ) : null}
    </OrganizerPage>
  )
}
