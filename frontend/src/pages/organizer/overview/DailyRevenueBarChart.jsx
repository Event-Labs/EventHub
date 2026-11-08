import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Calendar, CheckCircle2, DollarSign, Layers, Receipt, Ticket, TrendingUp } from 'lucide-react'

function fmtCurrency(n) {
  return `${Number(n || 0).toLocaleString('vi-VN')} đ`
}

function fmtShort(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('vi-VN')
}

function fmtDateVi(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Custom Tooltip for Daily Chart
function CustomDailyTooltip({ active, payload, activeMetric }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const isPeak = d.isPeak
  const isZero = d.isZero

  return (
    <div className="rounded-2xl border border-white/15 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl text-xs min-w-[240px]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5 font-bold text-white">
          <Calendar className="size-3.5 text-[#E6C17A]" />
          <span>{d.dateLabel || d.dayFormatted || d.day}</span>
        </div>
        {isPeak ? (
          <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-300">
            ⭐ Đỉnh cao nhất
          </span>
        ) : isZero ? (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            0 giao dịch
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-amber-400" />
            Doanh thu:
          </span>
          <strong className={`font-mono font-bold ${activeMetric === 'gross_revenue' ? 'text-amber-300 text-sm' : 'text-white'}`}>
            {fmtCurrency(d.gross_revenue)}
          </strong>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-emerald-400" />
            Vé bán ra:
          </span>
          <strong className={`font-mono font-bold ${activeMetric === 'tickets_sold' ? 'text-emerald-400 text-sm' : 'text-slate-200'}`}>
            {fmtNumber(d.tickets_sold)} vé
          </strong>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-cyan-400" />
            Số đơn hàng:
          </span>
          <strong className={`font-mono font-bold ${activeMetric === 'orders' ? 'text-cyan-300 text-sm' : 'text-slate-200'}`}>
            {fmtNumber(d.orders)} đơn
          </strong>
        </div>
      </div>
    </div>
  )
}

export function DailyRevenueBarChart({
  dailyRevenue = [],
  dateFrom = null,
  dateTo = null,
  activeRangeLabel = '',
}) {
  const [activeMetric, setActiveMetric] = useState('gross_revenue') // 'gross_revenue' | 'tickets_sold' | 'orders'
  const [granularity, setGranularity] = useState('auto') // 'auto' | 'daily' | 'weekly'

  // 1. Fill continuous timeline for all dates in range
  const continuousDailySeries = useMemo(() => {
    if (!dateFrom || !dateTo) {
      return (dailyRevenue || []).map((item) => ({
        ...item,
        gross_revenue: Number(item.gross_revenue || 0),
        tickets_sold: Number(item.tickets_sold || 0),
        orders: Number(item.orders || 0),
        dayFormatted: typeof item.day === 'string' ? item.day.slice(5).replace('-', '/') : '',
      }))
    }

    const map = new Map()
    for (const item of dailyRevenue || []) {
      if (!item.day) continue
      const key = typeof item.day === 'string' ? item.day.slice(0, 10) : new Date(item.day).toISOString().slice(0, 10)
      map.set(key, item)
    }

    const start = new Date(dateFrom)
    const end = new Date(dateTo)
    const s = new Date(Math.min(start.getTime(), end.getTime()))
    const e = new Date(Math.max(start.getTime(), end.getTime()))
    s.setHours(0, 0, 0, 0)
    e.setHours(0, 0, 0, 0)

    const list = []
    const curr = new Date(s)
    let count = 0

    while (curr <= e && count < 366) {
      const yyyy = curr.getFullYear()
      const mm = String(curr.getMonth() + 1).padStart(2, '0')
      const dd = String(curr.getDate()).padStart(2, '0')
      const key = `${yyyy}-${mm}-${dd}`
      const existing = map.get(key)

      const gross = Number(existing?.gross_revenue || 0)
      const tickets = Number(existing?.tickets_sold || 0)
      const orders = Number(existing?.orders || 0)

      list.push({
        day: key,
        dayFormatted: `${dd}/${mm}`,
        dateLabel: fmtDateVi(key),
        gross_revenue: gross,
        tickets_sold: tickets,
        orders: orders,
        isZero: gross === 0 && tickets === 0 && orders === 0,
      })

      curr.setDate(curr.getDate() + 1)
      count++
    }

    return list
  }, [dailyRevenue, dateFrom, dateTo])

  const totalDays = continuousDailySeries.length

  // Determine effective granularity:
  const isRangeLarge = totalDays > 45
  const effectiveGranularity = granularity === 'auto'
    ? (isRangeLarge ? 'weekly' : 'daily')
    : granularity

  // 2. Prepare aggregated series if weekly
  const chartData = useMemo(() => {
    if (effectiveGranularity === 'daily' || totalDays <= 14) {
      return continuousDailySeries
    }

    // Weekly aggregation: group consecutive 7 days
    const weekly = []
    for (let i = 0; i < continuousDailySeries.length; i += 7) {
      const slice = continuousDailySeries.slice(i, i + 7)
      const first = slice[0]
      const last = slice[slice.length - 1]
      const weekGross = slice.reduce((acc, d) => acc + d.gross_revenue, 0)
      const weekTickets = slice.reduce((acc, d) => acc + d.tickets_sold, 0)
      const weekOrders = slice.reduce((acc, d) => acc + d.orders, 0)

      weekly.push({
        day: first.day,
        dayFormatted: `${first.dayFormatted} - ${last.dayFormatted}`,
        dateLabel: `Tuần: ${first.dayFormatted} - ${last.dayFormatted}`,
        gross_revenue: weekGross,
        tickets_sold: weekTickets,
        orders: weekOrders,
        isZero: weekGross === 0 && weekTickets === 0,
      })
    }
    return weekly
  }, [continuousDailySeries, effectiveGranularity, totalDays])

  // 3. Peak & Average Calculations for active metric
  const { maxVal, avgVal, totalVal, peakItem } = useMemo(() => {
    let max = 0
    let total = 0
    let peak = null

    for (const d of chartData) {
      const v = Number(d[activeMetric] || 0)
      total += v
      if (v > max) {
        max = v
        peak = d
      }
    }

    const avg = chartData.length > 0 ? total / chartData.length : 0
    return { maxVal: max, avgVal: avg, totalVal: total, peakItem: peak }
  }, [chartData, activeMetric])

  // Tag peak on items
  const finalSeries = useMemo(() => {
    return chartData.map((d) => ({
      ...d,
      isPeak: maxVal > 0 && Number(d[activeMetric]) === maxVal,
    }))
  }, [chartData, maxVal, activeMetric])

  // Dynamic X-axis interval
  const tickInterval = useMemo(() => {
    if (effectiveGranularity === 'weekly') return 0
    if (chartData.length <= 10) return 0
    if (chartData.length <= 20) return 1
    if (chartData.length <= 35) return 2
    return Math.ceil(chartData.length / 10)
  }, [chartData.length, effectiveGranularity])

  const metricMeta = {
    gross_revenue: {
      label: 'Doanh thu',
      icon: DollarSign,
      formatVal: (v) => fmtCurrency(v),
      formatShort: (v) => fmtShort(v),
      unit: 'đ',
    },
    tickets_sold: {
      label: 'Vé đã bán',
      icon: Ticket,
      formatVal: (v) => `${fmtNumber(v)} vé`,
      formatShort: (v) => fmtNumber(v),
      unit: 'vé',
    },
    orders: {
      label: 'Đơn hàng',
      icon: Receipt,
      formatVal: (v) => `${fmtNumber(v)} đơn`,
      formatShort: (v) => fmtNumber(v),
      unit: 'đơn',
    },
  }[activeMetric]

  return (
    <div className="w-full">
      {/* ── Top Controls: Title, Metric Selector, Granularity ── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-3">
        {/* Metric Selector Buttons */}
        <div className="inline-flex rounded-xl bg-slate-900/90 p-1 border border-white/10 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveMetric('gross_revenue')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeMetric === 'gross_revenue'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-[0_2px_10px_rgba(201,154,71,0.35)] border border-[#E6C17A]/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            Doanh thu
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('tickets_sold')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeMetric === 'tickets_sold'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-[0_2px_10px_rgba(201,154,71,0.35)] border border-[#E6C17A]/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            Vé đã bán
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('orders')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeMetric === 'orders'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-bold shadow-[0_2px_10px_rgba(201,154,71,0.35)] border border-[#E6C17A]/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            Đơn hàng
          </button>
        </div>

        {/* Metric Summary Quick Stats */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-400">
            Tổng: <strong className="text-white font-mono">{metricMeta.formatVal(totalVal)}</strong>
          </span>
          {peakItem && maxVal > 0 && (
            <span className="text-amber-400">
              Đỉnh: <strong className="font-mono">{metricMeta.formatVal(maxVal)}</strong>{' '}
              <span className="text-[11px] text-amber-300/80">({peakItem.dayFormatted})</span>
            </span>
          )}
          {avgVal > 0 && (
            <span className="text-cyan-400">
              TB:{' '}
              <strong className="font-mono">
                {activeMetric === 'gross_revenue'
                  ? fmtShort(avgVal) + ' đ'
                  : avgVal.toFixed(1) + ' ' + metricMeta.unit}
              </strong>
              /{effectiveGranularity === 'weekly' ? 'tuần' : 'ngày'}
            </span>
          )}

          {/* Granularity switch if > 30 days */}
          {totalDays > 30 && (
            <button
              type="button"
              onClick={() => setGranularity(effectiveGranularity === 'daily' ? 'weekly' : 'daily')}
              className="ml-auto rounded-lg border border-white/10 bg-slate-800/80 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              title="Chuyển đổi chu kỳ xem Theo ngày hoặc Theo tuần"
            >
              {effectiveGranularity === 'daily' ? 'Gom tuần' : 'Tách ngày'}
            </button>
          )}
        </div>
      </div>

      {/* ── Vertical Bar Chart Container ── */}
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={finalSeries} margin={{ top: 18, right: 12, left: -10, bottom: 0 }}>
            <defs>
              {/* Normal warm amber/yellow gradient */}
              <linearGradient id="normalBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#B45309" stopOpacity={0.8} />
              </linearGradient>

              {/* Peak glowing yellow gradient */}
              <linearGradient id="peakBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FEF08A" stopOpacity={1} />
                <stop offset="50%" stopColor="#FACC15" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#CA8A04" stopOpacity={0.85} />
              </linearGradient>

              {/* Zero day placeholder */}
              <linearGradient id="zeroBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#334155" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#1E293B" stopOpacity={0.2} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />

            <XAxis
              dataKey="dayFormatted"
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              interval={tickInterval}
              minTickGap={16}
            />

            <YAxis
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (activeMetric === 'gross_revenue' ? fmtShort(v) : fmtNumber(v))}
            />

            <Tooltip
              content={<CustomDailyTooltip activeMetric={activeMetric} />}
              cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
            />

            {/* Average reference line when meaningful */}
            {avgVal > 0 && maxVal > 0 && (
              <ReferenceLine
                y={avgVal}
                stroke="#38BDF8"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `TB: ${
                    activeMetric === 'gross_revenue'
                      ? fmtShort(avgVal)
                      : avgVal.toFixed(1)
                  }`,
                  fill: '#38BDF8',
                  position: 'top',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            )}

            <Bar
              dataKey={activeMetric}
              radius={[4, 4, 0, 0]}
              maxBarSize={finalSeries.length <= 14 ? 38 : finalSeries.length <= 31 ? 22 : 14}
            >
              {finalSeries.map((entry, index) => {
                const isPeak = entry.isPeak
                const isZero = Number(entry[activeMetric] || 0) === 0
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={isPeak ? 'url(#peakBarGradient)' : isZero ? 'url(#zeroBarGradient)' : 'url(#normalBarGradient)'}
                    stroke={isPeak ? '#FEF08A' : 'none'}
                    strokeWidth={isPeak ? 1.5 : 0}
                  />
                )
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

