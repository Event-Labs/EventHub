import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, Clock } from 'lucide-react'

function CustomTrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  const cumulativeVal = payload.find((p) => p.dataKey === 'cumulative')?.value ?? 0
  const countVal = payload.find((p) => p.dataKey === 'count')?.value ?? 0

  return (
    <div className="rounded-xl border border-white/15 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-xs min-w-[200px]">
      <p className="font-bold text-white mb-2 text-sm border-b border-white/10 pb-1 flex items-center gap-1.5">
        <Clock className="size-3 text-cyan-400" />
        Thời điểm: {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
            Tổng tích lũy:
          </span>
          <strong className="text-cyan-400 font-mono font-bold text-sm">{cumulativeVal} vé</strong>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
            Check-in trong 5p:
          </span>
          <strong className="text-purple-300 font-mono font-bold">{countVal} vé</strong>
        </div>
      </div>
    </div>
  )
}

export function CheckinTrendLineChart({ timeline = [] }) {
  const [timeRange, setTimeRange] = useState('ALL') // '30m' | '60m' | 'ALL'

  // Process timeline timestamps into 5-minute interval buckets
  const chartData = useMemo(() => {
    if (!timeline || timeline.length === 0) return []

    // Parse all valid timestamps and sort
    const validTimestamps = timeline
      .map((t) => new Date(t).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b)

    if (validTimestamps.length === 0) return []

    const now = Date.now()
    let filtered = validTimestamps

    if (timeRange === '30m') {
      const windowStart = now - 30 * 60 * 1000
      filtered = validTimestamps.filter((t) => t >= windowStart)
    } else if (timeRange === '60m') {
      const windowStart = now - 60 * 60 * 1000
      filtered = validTimestamps.filter((t) => t >= windowStart)
    }

    if (filtered.length === 0) return []

    // Bucket into 5-minute intervals (300,000 ms)
    const BUCKET_MS = 5 * 60 * 1000
    const firstTime = filtered[0]
    const lastTime = Math.max(filtered[filtered.length - 1], firstTime + BUCKET_MS)

    const startBucket = Math.floor(firstTime / BUCKET_MS) * BUCKET_MS
    const endBucket = Math.ceil(lastTime / BUCKET_MS) * BUCKET_MS

    // Count checkins in each bucket
    const bucketCounts = new Map()
    for (let b = startBucket; b <= endBucket; b += BUCKET_MS) {
      bucketCounts.set(b, 0)
    }

    filtered.forEach((t) => {
      const b = Math.floor(t / BUCKET_MS) * BUCKET_MS
      bucketCounts.set(b, (bucketCounts.get(b) || 0) + 1)
    })

    // Compute cumulative sum
    let cumulative = 0
    // If filtered is subset of all, find cumulative before window
    if (timeRange !== 'ALL') {
      const windowStart = timeRange === '30m' ? now - 30 * 60 * 1000 : now - 60 * 60 * 1000
      cumulative = validTimestamps.filter((t) => t < windowStart).length
    }

    const points = []
    bucketCounts.forEach((count, bTime) => {
      cumulative += count
      const date = new Date(bTime)
      const label = date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
      points.push({
        time: label,
        rawTime: bTime,
        count,
        cumulative,
      })
    })

    return points
  }, [timeline, timeRange])

  return (
    <div>
      {/* Filter and Legend header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#06B6D4] shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
            Tổng check-in tích lũy
          </span>
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#A855F7] shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            Lượt check-in trong khoảng (5p)
          </span>
        </div>

        {/* Time range filter buttons */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900/60 [html.light_&]:bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTimeRange('30m')}
            className={`rounded-md px-2.5 py-1 font-bold transition cursor-pointer ${
              timeRange === '30m'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            30 phút gần nhất
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('60m')}
            className={`rounded-md px-2.5 py-1 font-bold transition cursor-pointer ${
              timeRange === '60m'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            60 phút gần nhất
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('ALL')}
            className={`rounded-md px-2.5 py-1 font-bold transition cursor-pointer ${
              timeRange === 'ALL'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            Toàn bộ sự kiện
          </button>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
          <Activity className="size-8 opacity-40 mb-2 text-cyan-400" />
          <p className="text-sm font-medium">
            {timeline && timeline.length > 0
              ? 'Không có lượt check-in nào trong khoảng thời gian đã chọn.'
              : 'Chưa có lượt check-in nào được ghi nhận để hiển thị biểu đồ xu hướng.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Dữ liệu sẽ tự động xuất hiện khi các cổng soát vé ghi nhận check-in thành công.
          </p>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 15, right: 25, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
              <XAxis
                dataKey="time"
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#475569' }}
              />
              <YAxis
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#475569' }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTrendTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Tổng check-in tích lũy"
                stroke="#06B6D4"
                strokeWidth={3}
                dot={{ r: 3, fill: '#06B6D4' }}
                activeDot={{ r: 6, stroke: '#FFFFFF', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Lượt check-in trong khoảng"
                stroke="#A855F7"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 2.5, fill: '#A855F7' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

