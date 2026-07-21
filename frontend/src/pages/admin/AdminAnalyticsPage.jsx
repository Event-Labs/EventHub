import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Calendar,
  ClipboardList,
  Building2,
  Ticket,
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

function fmtTrendLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  }
  return String(value).slice(0, 10)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accentBg = 'bg-tertiary/15', accentColor = 'text-tertiary', accentBar }) {
  return (
    <Panel className="relative overflow-hidden">
      {accentBar && <div className={`absolute inset-x-0 top-0 h-0.5 rounded-t-2xl ${accentBar}`} />}
      <div className="flex items-start gap-4 pt-1">
        <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${accentBg}`}>
          <Icon className={`size-5 ${accentColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
          <p className="mt-1 truncate text-xl font-extrabold text-content">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted truncate">{sub}</p>}
        </div>
      </div>
    </Panel>
  )
}

function DonutChart({ title, data, totalLabel, valueFormatter, bare = false, compact = false, mini = false }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  let offset = 25
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const formatValue = valueFormatter || ((value) => Number(value || 0).toLocaleString('vi-VN'))
  const centerValueClass = valueFormatter ? 'text-sm' : 'text-2xl'
  const chartSize = mini ? 'size-28' : compact ? 'size-32' : 'size-36'
  const chartGridClass = compact
    ? 'grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-center'
    : 'grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center'

  const content = (
    <>
      {compact ? (
        <h3 className="mb-3 text-sm font-black text-content">{title}</h3>
      ) : (
        <h2 className="mb-4 font-bold text-content">{title}</h2>
      )}
      <div className={chartGridClass}>
        <div className={`relative mx-auto ${chartSize}`}>
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(114,120,124,0.22)" strokeWidth="12" />
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
                  stroke={item.color}
                  strokeWidth="12"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              )
              // eslint-disable-next-line react-hooks/immutability
              offset -= dash
              return circle
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className={`${centerValueClass} max-w-24 truncate font-black text-content`}>{formatValue(total)}</p>
              <p className="text-[10px] font-bold uppercase text-muted">{totalLabel}</p>
            </div>
          </div>
        </div>
        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
          {data.map((item) => (
            <div key={item.label} className={`flex items-center justify-between gap-3 rounded-md border border-border-soft/25 bg-panel-soft/50 ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}>
              <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-subtle">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-black text-content">{formatValue(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  if (bare) return content
  return <Panel>{content}</Panel>
}

function ChartTile({ children }) {
  return (
    <div className="h-full rounded-xl border border-border-soft/30 bg-panel-soft/45 p-4">
      {children}
    </div>
  )
}

function HorizontalValueChart({ title, items, valueKey, labelKey, subLabel, valueFormatter = fmtShort, color = '#ff7112', bare = false }) {
  if (!items?.length) return null

  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1)
  const content = (
    <>
      <h2 className="mb-4 font-bold text-content">{title}</h2>
      <div className="space-y-4">
        {items.map((item, index) => {
          const value = Number(item[valueKey] || 0)
          const pct = Math.max(3, Math.round((value / maxValue) * 100))
          return (
            <div key={item.organizer_id || item.plan_id || item.id || item[labelKey]}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-bold text-content">
                    <span className="mr-2 text-xs text-muted">#{index + 1}</span>
                    {item[labelKey]}
                  </p>
                  {subLabel && <p className="mt-0.5 truncate text-xs text-subtle">{subLabel(item)}</p>}
                </div>
                <span className="shrink-0 font-black text-content">{valueFormatter(value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-border-soft/25">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )

  if (bare) return content
  return <Panel>{content}</Panel>
}

function CategoryDistributionChart({ items }) {
  if (!items?.length) return null

  const palette = ['#ff7112', '#22c55e', '#38bdf8', '#b3cde0', '#a855f7', '#f59e0b', '#ef4444']
  return (
    <Panel>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-content">Sự kiện theo danh mục</h2>
          <p className="mt-1 text-xs text-subtle">Tách theo 3 lớp để admin nhìn rõ tổng, published và completed.</p>
        </div>
        <span className="rounded-md border border-border-soft/35 bg-panel-soft px-3 py-1 text-xs font-bold text-subtle">
          {items.length} danh mục
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-3 xl:items-stretch">
        <ChartTile>
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
        </ChartTile>
        <ChartTile>
          <DonutChart
            title="Đã đăng"
            totalLabel="published"
            bare
            compact
            data={items.map((cat, index) => ({
              label: cat.name,
              value: cat.published_events,
              color: palette[index % palette.length],
            }))}
          />
        </ChartTile>
        <ChartTile>
          <DonutChart
            title="Hoàn thành"
            totalLabel="completed"
            bare
            compact
            data={items.map((cat, index) => ({
              label: cat.name,
              value: cat.completed_events,
              color: palette[index % palette.length],
            }))}
          />
        </ChartTile>
      </div>
    </Panel>
  )
}

function CompactMetric({ label, value, tone = 'text-content' }) {
  return (
    <div className="rounded-md border border-border-soft/30 bg-panel-soft/60 px-3 py-2">
      <p className="text-[10px] font-bold uppercase text-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${tone}`}>{value}</p>
    </div>
  )
}

function BarChartSimple({ data, valueKey = 'gross_revenue', height = 180 }) {
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
      <div
        className="flex w-full items-center justify-center rounded-lg border border-dashed border-border-soft/30 bg-panel-soft/25 text-sm font-semibold text-subtle"
        style={{ height: `${height + 30}px` }}
      >
        Không có dữ liệu trong khoảng thời gian này.
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey])), 1)
  const chartWidth = Math.max(containerWidth || 720, 360)
  const plotWidth = Math.max(chartWidth - 16, 320)
  const slot = plotWidth / data.length
  const barWidth = Math.max(12, Math.min(slot * 0.58, 76))
  const svgWidth = data.length > 16 ? Math.max(data.length * 52, chartWidth) : chartWidth

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg width={svgWidth} height={height + 30} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={0} x2={svgWidth} y1={height - pct * height} y2={height - pct * height} stroke="rgba(43,92,146,0.3)" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const barH = Math.max((Number(d[valueKey]) / maxVal) * height, 2)
          const x = data.length > 16
            ? i * 52 + (52 - barWidth) / 2
            : 8 + i * slot + (slot - barWidth) / 2
          const y = height - barH
          const isHighest = Number(d[valueKey]) === maxVal
          return (
            <g key={`${d.period ?? d.day}-${i}`}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={isHighest ? '#b3cde0' : 'rgba(43,92,146,0.6)'}>
                <title>{`${d.period ?? d.day}: ${fmtCurrency(d[valueKey])}`}</title>
              </rect>
            </g>
          )
        })}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 7))
          if (i % step !== 0) return null
          const label = fmtTrendLabel(d.period ?? d.day)
          const x = data.length > 16 ? i * 52 + 26 : 8 + i * slot + slot / 2
          return (
            <text key={`lbl-${i}`} x={x} y={height + 20} textAnchor="middle" fontSize={10} fill="#72787c">
              {label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const activeRange = getDateRange(datePreset, { from: customFrom, to: customTo })
  const activeRangeLabel = getDateRangeLabel(datePreset, activeRange)

  return (
    <Page
      title="Tổng quan nền tảng"
      description="Thống kê toàn hệ thống: người dùng, sự kiện, giao dịch vé và doanh thu gói dịch vụ."
    >
      {/* ── Attention Required ── */}
      {overview && (
        <div className="mb-5 rounded-2xl border border-warning/30 bg-warning/[0.06] p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-warning/20">
              <AlertTriangle className="size-4 text-warning" />
            </div>
            <p className="text-sm font-extrabold uppercase tracking-wider text-warning">
              Cần xử lý ngay
            </p>
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
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-tertiary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  severity === 'critical'
                    ? 'border-error/30 bg-error/[0.07]'
                    : 'border-warning/30 bg-warning/[0.05]'
                  }`}
              >
                <span className="text-sm font-semibold text-subtle">{label}</span>
                <span className={`shrink-0 text-xl font-extrabold ${severity === 'critical' ? 'text-error' : 'text-warning'}`}>
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
          {/* ── KPI Cards — Users ── */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              label="Tổng người dùng"
              value={Number(users.total_users).toLocaleString('vi-VN')}
              sub={`${Number(users.active_users).toLocaleString()} hoạt động · ${Number(users.locked_users).toLocaleString()} bị khóa`}
              accentBg="bg-tertiary/15"
              accentColor="text-tertiary"
              accentBar="bg-tertiary"
            />
            <StatCard
              icon={Building2}
              label="Nhà tổ chức"
              value={Number(users.total_organizers).toLocaleString('vi-VN')}
              sub={`${Number(users.total_staff).toLocaleString()} nhân viên`}
              accentBg="bg-ai/15"
              accentColor="text-ai"
              accentBar="bg-ai"
            />
            <StatCard
              icon={Calendar}
              label="Sự kiện đã đăng"
              value={Number(events.published_events).toLocaleString('vi-VN')}
              sub={`${Number(events.pending_events).toLocaleString()} đang chờ duyệt`}
              accentBg="bg-warning/15"
              accentColor="text-warning"
              accentBar="bg-warning"
            />
            <StatCard
              icon={ClipboardList}
              label="Yêu cầu Organizer"
              value={Number(orgReqs.total_requests).toLocaleString('vi-VN')}
              sub={`${Number(orgReqs.pending_requests).toLocaleString()} đang chờ xử lý`}
              accentBg="bg-tertiary/15"
              accentColor="text-tertiary"
              accentBar="bg-tertiary"
            />
          </div>

          {/* ── KPI Cards — Ticket GMV & Revenue ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              label="Tổng giao dịch vé"
              value={fmtShort(orders.gross_revenue)}
              sub="Tiền vé đã thanh toán, không phải doanh thu EventHub"
              accentBg="bg-success/15"
              accentColor="text-success"
              accentBar="bg-success"
            />
            <StatCard
              icon={TrendingUp}
              label="Doanh thu gói dịch vụ"
              value={fmtShort(subscriptionRevenue?.total_revenue)}
              sub={fmtCurrency(subscriptionRevenue?.total_revenue)}
              accentBg="bg-primary/20"
              accentColor="text-tertiary"
              accentBar="bg-tertiary"
            />
            <StatCard
              icon={Ticket}
              label="Đơn đã thanh toán"
              value={Number(orders.paid_orders).toLocaleString('vi-VN')}
              sub={`/${Number(orders.total_orders).toLocaleString()} tổng đơn`}
              accentBg="bg-error/15"
              accentColor="text-error"
              accentBar="bg-error"
            />
            <StatCard
              icon={BarChart3}
              label="Sự kiện (toàn hệ thống)"
              value={Number(events.total_events).toLocaleString('vi-VN')}
              sub={`${Number(events.completed_events).toLocaleString()} hoàn thành`}
              accentBg="bg-muted/20"
              accentColor="text-muted"
              accentBar="bg-muted"
            />
          </div>

          {/* ── Chart controls ── */}
          <Panel className="mb-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
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
                  <span className="block text-sm font-semibold text-subtle">Nhóm theo</span>
                  <div className="mt-2 flex gap-2">
                    {[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTrendGroupBy(val)}
                        className={`h-9 rounded-xl border px-3 text-sm font-semibold transition ${
                          trendGroupBy === val
                            ? 'border-primary/60 bg-tertiary/15 text-tertiary'
                            : 'border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary/40 hover:text-tertiary'
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
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border-soft/40 bg-panel-soft px-4 text-sm font-semibold text-subtle transition hover:border-tertiary/40 hover:text-tertiary disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
              </div>
            </div>
          </Panel>

          {/* ── Revenue Trend Chart ── */}
          <Panel className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft/25 bg-panel-soft/45 px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Khoảng thời gian</span>
              <span className="rounded-md border border-border-soft/30 bg-primary/20 px-2.5 py-1 text-xs font-bold text-content">
                {activeRangeLabel}
              </span>
            </div>
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-tertiary" />
              <h2 className="font-bold text-content">Xu hướng giao dịch vé</h2>
            </div>
            <div className={comparison.enabled ? 'grid items-start gap-5 xl:grid-cols-2' : ''}>
              <div>
                {comparison.enabled && (
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">
                    Kỳ hiện tại
                  </p>
                )}
                <BarChartSimple data={revenueTrend} valueKey="gross_revenue" height={170} />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border-soft/25 bg-panel-soft/55 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-muted">Tổng giao dịch vé</p>
                    <p className="mt-0.5 text-sm font-black text-content">
                      {fmtCurrency(revenueTrend.reduce((s, d) => s + Number(d.gross_revenue), 0))}
                    </p>
                  </div>
                  <div className="rounded-md border border-border-soft/25 bg-panel-soft/55 px-3 py-2 text-left sm:text-right">
                    <p className="text-[10px] font-bold uppercase text-muted">Điểm dữ liệu</p>
                    <p className="mt-0.5 text-sm font-black text-content">{revenueTrend.length}</p>
                  </div>
                </div>
              </div>
              {comparison.enabled && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">
                    {comparison.label || 'Kỳ so sánh'}
                  </p>
                  <BarChartSimple data={comparisonRevenueTrend} valueKey="gross_revenue" height={170} />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-border-soft/25 bg-panel-soft/55 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase text-muted">Tổng giao dịch vé</p>
                      <p className="mt-0.5 text-sm font-black text-content">
                        {fmtCurrency(comparisonRevenueTrend.reduce((s, d) => s + Number(d.gross_revenue), 0))}
                      </p>
                    </div>
                    <div className="rounded-md border border-border-soft/25 bg-panel-soft/55 px-3 py-2 text-left sm:text-right">
                      <p className="text-[10px] font-bold uppercase text-muted">Điểm dữ liệu</p>
                      <p className="mt-0.5 text-sm font-black text-content">{comparisonRevenueTrend.length}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-content">Tình trạng vận hành</h2>
              <span className="rounded-md border border-border-soft/30 bg-panel-soft px-2.5 py-1 text-xs font-bold text-subtle">
                Tổng quan
              </span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartTile>
                <DonutChart
                  title="Trạng thái sự kiện"
                  totalLabel="sự kiện"
                  bare
                  compact
                  data={[
                    { label: 'Đã đăng', value: events.published_events, color: '#22c55e' },
                    { label: 'Chờ duyệt', value: events.pending_events, color: '#38bdf8' },
                    { label: 'Bản nháp', value: events.draft_events, color: '#72787c' },
                    { label: 'Hoàn thành', value: events.completed_events, color: '#b3cde0' },
                    { label: 'Đã hủy/ẩn', value: Number(events.cancelled_events || 0) + Number(events.hidden_events || 0), color: '#ef4444' },
                  ]}
                />
              </ChartTile>
              <ChartTile>
                <DonutChart
                  title="Yêu cầu Organizer"
                  totalLabel="yêu cầu"
                  bare
                  compact
                  data={[
                    { label: 'Chờ duyệt', value: orgReqs.pending_requests, color: '#38bdf8' },
                    { label: 'Đã duyệt', value: orgReqs.approved_requests, color: '#22c55e' },
                    { label: 'Từ chối', value: orgReqs.rejected_requests, color: '#ef4444' },
                  ]}
                />
              </ChartTile>
            </div>
          </Panel>

          <div className="mb-6">
            <CategoryDistributionChart items={eventsByCategory} />
          </div>

          {/* ── Subscription Revenue ── */}
          {subscriptionRevenue && (
            <Panel className="mb-6">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="font-bold text-content">Doanh thu từ gói dịch vụ</h2>
                  <p className="mt-1 text-xs text-subtle">So sánh doanh thu từng gói, số lượt đăng ký và số gói active.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[460px]">
                  <CompactMetric
                    label="Tổng lượt"
                    value={Number(subscriptionRevenue.total_subscriptions).toLocaleString('vi-VN')}
                  />
                  <CompactMetric
                    label="Đang active"
                    value={Number(subscriptionRevenue.active_subscriptions).toLocaleString('vi-VN')}
                    tone="text-success"
                  />
                  <CompactMetric
                    label="Tổng doanh thu"
                    value={fmtCurrency(subscriptionRevenue.total_revenue)}
                    tone="text-success"
                  />
                </div>
              </div>

              {Array.isArray(subscriptionRevenue.by_plan) && subscriptionRevenue.by_plan.length > 0 && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <ChartTile>
                    <DonutChart
                      title="Doanh thu theo từng gói"
                      totalLabel="doanh thu"
                      valueFormatter={fmtCurrency}
                      bare
                      compact
                      data={subscriptionRevenue.by_plan.map((plan, index) => ({
                        label: `${plan.plan_name} (${Number(plan.total).toLocaleString('vi-VN')} lượt)`,
                        value: plan.revenue,
                        color: ['#b3cde0', '#22c55e', '#ff7112', '#38bdf8', '#a855f7'][index % 5],
                      }))}
                    />
                  </ChartTile>
                  <ChartTile>
                    <DonutChart
                      title="Số lượt theo từng gói"
                      totalLabel="lượt"
                      bare
                      compact
                      data={subscriptionRevenue.by_plan.map((plan, index) => ({
                        label: `${plan.plan_name} · ${fmtCurrency(plan.price)}`,
                        value: plan.total,
                        color: ['#b3cde0', '#22c55e', '#ff7112', '#38bdf8', '#a855f7'][index % 5],
                      }))}
                    />
                  </ChartTile>
                </div>
              )}
            </Panel>
          )}

          <div className={`grid gap-6 ${topOrganizers?.length ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : ''}`}>
            {topOrganizers?.length > 0 && (
              <HorizontalValueChart
                title="Top 5 nhà tổ chức theo giao dịch vé"
                items={topOrganizers}
                valueKey="gross_revenue"
                labelKey="organizer_name"
                color="#22c55e"
                subLabel={(org) => `${org.total_events} sự kiện · ${org.subscription_name || 'Chưa có gói active'}`}
              />
            )}

            <Panel>
              <h2 className="mb-4 font-bold text-content">Tóm tắt đơn hàng</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  ['Tổng đơn', Number(orders.total_orders).toLocaleString('vi-VN'), 'text-content'],
                  ['Đã thanh toán', Number(orders.paid_orders).toLocaleString('vi-VN'), 'text-success'],
                  ['Đang xử lý', Number(orders.pending_orders).toLocaleString('vi-VN'), 'text-warning'],
                  ['Đã hủy', Number(orders.cancelled_orders).toLocaleString('vi-VN'), 'text-error'],
                ].map(([label, value, color]) => (
                  <div key={label} className="flex items-center justify-between rounded-md border border-border-soft/30 bg-panel-soft/60 px-4 py-3">
                    <p className="text-xs font-bold uppercase text-subtle">{label}</p>
                    <p className={`text-lg font-extrabold ${color}`}>{value}</p>
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
