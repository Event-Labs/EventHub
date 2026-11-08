import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, ChevronRight, Sparkles, Ticket } from 'lucide-react'

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

function CustomEventTooltip({ active, payload, totalRevenue }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const gross = Number(d.gross_revenue || 0)
  const tickets = Number(d.tickets_sold || 0)
  const orders = Number(d.total_orders || 0)
  const pctOfTotal = totalRevenue > 0 ? Math.round((gross / totalRevenue) * 100) : 0

  return (
    <div className="rounded-2xl border border-white/15 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl text-xs min-w-[250px]">
      <p className="font-bold text-white text-sm mb-2 border-b border-white/10 pb-1.5 line-clamp-2">
        {d.event_title}
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-cyan-400" />
            Doanh thu:
          </span>
          <strong className="text-cyan-300 font-mono font-bold text-sm">
            {fmtCurrency(gross)}
          </strong>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-emerald-400" />
            Vé bán ra:
          </span>
          <strong className="text-emerald-400 font-mono font-bold">
            {fmtNumber(tickets)} vé
          </strong>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-purple-400" />
            Đơn hàng:
          </span>
          <strong className="text-purple-300 font-mono font-bold">
            {fmtNumber(orders)} đơn
          </strong>
        </div>

        {totalRevenue > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-white/10">
            <span className="text-slate-400">Đóng góp tổng:</span>
            <span className="text-amber-400 font-mono font-bold">{pctOfTotal}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function EventRevenueBarChart({
  eventsRevenue = [],
  onSelectEvent = null,
}) {
  const [showAll, setShowAll] = useState(false)

  // Sort descending by gross revenue
  const sortedEvents = useMemo(() => {
    return [...(eventsRevenue || [])].sort(
      (a, b) => Number(b.gross_revenue || 0) - Number(a.gross_revenue || 0)
    )
  }, [eventsRevenue])

  const totalRevenue = useMemo(() => {
    return sortedEvents.reduce((acc, ev) => acc + Number(ev.gross_revenue || 0), 0)
  }, [sortedEvents])

  // Filter Top 5 or All
  const displayedEvents = useMemo(() => {
    if (showAll || sortedEvents.length <= 5) return sortedEvents
    return sortedEvents.slice(0, 5)
  }, [sortedEvents, showAll])

  if (!sortedEvents || sortedEvents.length === 0) {
    return null
  }

  // Dynamic height based on number of bars (min 200px)
  const chartHeight = Math.max(200, displayedEvents.length * 44 + 40)

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-[#0d172e]/60 p-4 sm:p-5 backdrop-blur-xl">
      {/* Header controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-cyan-400" />
          <h4 className="text-sm font-bold text-white">So sánh doanh thu theo sự kiện</h4>
          <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
            {sortedEvents.length} sự kiện
          </span>
        </div>

        {sortedEvents.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="rounded-lg border border-white/10 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            {showAll ? 'Chỉ xem Top 5' : `Xem tất cả (${sortedEvents.length})`}
          </button>
        )}
      </div>

      {/* Horizontal Bar Chart */}
      <div style={{ height: `${chartHeight}px` }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayedEvents}
            layout="vertical"
            margin={{ top: 8, right: 28, left: 10, bottom: 8 }}
          >
            <defs>
              <linearGradient id="eventBarGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0891B2" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#06B6D4" stopOpacity={1} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.06)" />

            <XAxis
              type="number"
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickFormatter={(v) => fmtShort(v)}
            />

            <YAxis
              type="category"
              dataKey="event_title"
              stroke="#CBD5E1"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={160}
              tickFormatter={(title) => {
                if (!title) return ''
                return title.length > 22 ? `${title.slice(0, 20)}...` : title
              }}
            />

            <Tooltip
              content={<CustomEventTooltip totalRevenue={totalRevenue} />}
              cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
            />

            <Bar
              dataKey="gross_revenue"
              fill="url(#eventBarGradient)"
              radius={[0, 6, 6, 0]}
              barSize={20}
              onClick={(entry) => {
                if (onSelectEvent && entry?.event_id) {
                  onSelectEvent(entry.event_id)
                }
              }}
              className="cursor-pointer"
            >
              {displayedEvents.map((entry, index) => (
                <Cell key={`cell-${index}`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

