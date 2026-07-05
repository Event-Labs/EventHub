import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  ReceiptText,
  Sparkles,
  TrendingUp,
  Ticket,
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

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

function StatCard({ icon: Icon, label, value, sub, trend, accentBg = 'bg-tertiary/15', accentColor = 'text-primary' }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border-soft/40 bg-surface/80 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.18)] backdrop-blur-sm">
      <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${accentBg}`}>
        <Icon className={`size-5 ${accentColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
        <p className="mt-1 truncate text-xl font-extrabold text-content">{value}</p>
        {sub && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            {trend === 'up' && <ArrowUpRight className="size-3 text-success" />}
            {trend === 'down' && <ArrowDownRight className="size-3 text-error" />}
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
    <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
      <p className="text-xs font-bold uppercase text-subtle">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-sm font-semibold leading-6 text-content">
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
                <title>{`${d.day}: ${fmtCurrency(d.net_revenue)}`}</title>
              </rect>
            </g>
          )
        })}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 6))
          if (i % step !== 0) return null
          return (
            <text key={`lbl-${d.day}`} x={i * gap + gap / 2} y={height + 20} textAnchor="middle" fontSize={10} fill="#72787c">
              {d.day ? d.day.slice(5) : ''}
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
        const grossPct = maxValue > 0 ? Math.max(3, Math.round((gross / maxValue) * 100)) : 0
        const netPct = gross > 0 ? Math.max(3, Math.round((net / gross) * grossPct)) : 0

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
              </div>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-border-soft/25">
              <div className="absolute inset-y-0 left-0 rounded-full bg-tertiary/55" style={{ width: `${grossPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${netPct}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[11px] font-bold uppercase text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Doanh thu ròng
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-tertiary/55" /> Doanh thu gộp
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MoneyCompositionChart({ overall }) {
  const gross = Number(overall.gross_revenue || 0)
  const discount = Number(overall.total_discount || 0)
  const fee = Number(overall.total_platform_fee || 0)
  const net = Number(overall.net_revenue || 0)
  const total = Math.max(gross + discount, 1)
  const segments = [
    { label: 'Thực nhận', value: net, color: 'bg-success', text: 'text-success' },
    { label: 'Phí nền tảng', value: fee, color: 'bg-tertiary', text: 'text-tertiary' },
    { label: 'Chiết khấu', value: discount, color: 'bg-warning', text: 'text-warning' },
  ].filter((item) => item.value > 0)

  return (
    <OrganizerPanel className="mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-content">Cơ cấu doanh thu</h2>
          <p className="mt-1 text-xs text-subtle">Tỷ trọng thực nhận, phí nền tảng và chiết khấu trong kỳ.</p>
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
          { label: 'Thực nhận (ròng)', value: net, text: 'text-success' },
          { label: 'Phí nền tảng', value: fee, text: 'text-tertiary' },
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

  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => setEvents(data || []))
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

  useEffect(() => { loadStats() }, [loadStats])

  const loadFinancialSummary = useCallback(async () => {
    if (!selectedEventId) {
      setSummaryError('Vui lòng chọn một sự kiện để tạo báo cáo tài chính.')
      return
    }

    setSummaryLoading(true)
    setSummaryError('')
    try {
      const range = getDateRange(datePreset, { from: customFrom, to: customTo })
      const data = await generateFinancialSummary({
        eventId: selectedEventId,
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

  useEffect(() => {
    setFinancialSummary(null)
    setSummaryError('')
  }, [datePreset, customFrom, customTo, selectedEventId])

  const overall = stats?.overall
  const byEvent = stats?.by_event ?? []
  const dailyRevenue = stats?.daily_revenue ?? []
  const comparisonDailyRevenue = comparisonStats?.daily_revenue ?? []
  const maxEventRevenue = Math.max(...byEvent.map((e) => Number(e.gross_revenue)), 1)
  const activeRange = getDateRange(datePreset, { from: customFrom, to: customTo })
  const activeRangeLabel = getDateRangeLabel(datePreset, activeRange)

  return (
    <OrganizerPage
      title="Tổng quan"
      description="Theo dõi doanh thu và hiệu suất bán vé của bạn."
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-soft/40 bg-panel-soft px-4 text-sm font-semibold text-subtle transition hover:border-tertiary/40 hover:text-tertiary disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={loadFinancialSummary}
              disabled={summaryLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-tertiary px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {summaryLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Tạo báo cáo AI
            </button>
          </div>
        </div>
      </OrganizerPanel>

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
          {financialSummary && (
            <OrganizerPanel className="mb-6 border-ai/30 bg-ai/[0.06]">
              {financialSummary.intelligence && (
                <div className="mb-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
                    <p className="text-xs font-bold uppercase text-subtle">Financial Health Score</p>
                    <p className="mt-1 text-3xl font-black text-content">
                      {financialSummary.intelligence.health_score}
                      <span className="text-base font-bold text-subtle">/100</span>
                    </p>
                  </div>
                  <div className={`rounded-md border px-4 py-3 ${riskClass(financialSummary.intelligence.risk_level)}`}>
                    <p className="text-xs font-bold uppercase opacity-75">Mức rủi ro</p>
                    <p className="mt-1 text-xl font-black">{riskLabel(financialSummary.intelligence.risk_level)}</p>
                  </div>
                  <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
                    <p className="text-xs font-bold uppercase text-subtle">Dự báo 7 ngày</p>
                    <p className="mt-1 text-lg font-black text-content">
                      {fmtCurrency(financialSummary.intelligence.forecast?.next_7_days_revenue)}
                    </p>
                    <p className="text-xs font-semibold text-subtle">
                      ~{Number(financialSummary.intelligence.forecast?.next_7_days_tickets || 0).toLocaleString('vi-VN')} vé
                    </p>
                  </div>
                </div>
              )}
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-ai" />
                  <h2 className="font-bold text-content">Báo cáo tài chính AI</h2>
                </div>
                <span className="w-fit rounded border border-border-soft/30 bg-surface/80 px-2 py-1 text-xs font-bold text-subtle">
                  {financialSummary.source === 'LOCAL_AI_SERVICE' ? 'Local AI' : 'Rule-based'}
                </span>
              </div>
              <p className="text-sm font-semibold leading-7 text-content">
                {financialSummary.summary}
              </p>
              {financialSummary.insights && (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {financialSummary.insights.occupancy && (
                    <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
                      <p className="text-xs font-bold uppercase text-subtle">Tỷ lệ lấp đầy</p>
                      <p className="mt-1 text-sm font-semibold text-content">{financialSummary.insights.occupancy}</p>
                    </div>
                  )}
                  {financialSummary.insights.recommendation && (
                    <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3">
                      <p className="text-xs font-bold uppercase text-subtle">Khuyến nghị</p>
                      <p className="mt-1 text-sm font-semibold text-content">{financialSummary.insights.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
              {financialSummary.intelligence && (
                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  <InsightList title="Insight chính" items={financialSummary.intelligence.key_insights || []} />
                  <InsightList title="Rủi ro" items={financialSummary.intelligence.risks || []} />
                  <InsightList title="Hành động đề xuất" items={financialSummary.intelligence.recommendations || []} />
                  {financialSummary.intelligence.what_if && (
                    <div className="rounded-md border border-border-soft/35 bg-panel-soft/70 px-4 py-3 xl:col-span-3">
                      <p className="text-xs font-bold uppercase text-subtle">What-if</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-content">
                        Nếu bán thêm {Number(financialSummary.intelligence.what_if.additional_tickets || 0).toLocaleString('vi-VN')} vé
                        với giá vé trung bình hiện tại, doanh thu gộp có thể tăng khoảng{' '}
                        <span className="font-black text-success">
                          {fmtCurrency(financialSummary.intelligence.what_if.estimated_gross_revenue)}
                        </span>
                        .
                      </p>
                    </div>
                  )}
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
              sub={fmtCurrency(overall.gross_revenue)}
              accentBg="bg-tertiary/15"
              accentColor="text-primary"
            />
            <StatCard
              icon={TrendingUp}
              label="Doanh thu ròng"
              value={fmtShort(overall.net_revenue)}
              sub={`Sau phí nền tảng: ${fmtCurrency(overall.total_platform_fee)}`}
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
              icon={Ticket}
              label="Vé đã bán"
              value={overall.total_tickets_sold.toLocaleString('vi-VN')}
              sub={overall.total_orders > 0 ? `TB ${(overall.total_tickets_sold / overall.total_orders).toFixed(1)} vé/đơn` : '—'}
              accentBg="bg-warning/15"
              accentColor="text-warning"
            />
          </div>

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
                  <p className="mt-1 text-xs text-subtle">So sánh doanh thu gộp, doanh thu ròng và số đơn của từng sự kiện.</p>
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
