import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

function CustomDonutTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0]

  return (
    <div className="rounded-xl border border-white/15 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: data.payload.color }}
        />
        <span className="font-bold text-white">{data.name}</span>
      </div>
      <p className="text-slate-300 font-mono font-bold">
        {data.value} vé ({data.payload.percent}%)
      </p>
    </div>
  )
}

export function OverallDonutChart({ overall }) {
  const total = Number(overall?.total_tickets) || 0
  const checkedIn = Number(overall?.checked_in) || 0
  const notCheckedIn = Number(overall?.valid) || 0
  const rate = total > 0 ? Math.round((checkedIn / total) * 100) : 0

  const chartData = useMemo(() => {
    if (total === 0) {
      return [{ name: 'Chưa có vé', value: 1, color: '#334155', percent: 0 }]
    }
    return [
      {
        name: 'Đã check-in',
        value: checkedIn,
        color: '#10B981',
        percent: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
      },
      {
        name: 'Chưa check-in',
        value: notCheckedIn,
        color: '#F59E0B',
        percent: total > 0 ? Math.round((notCheckedIn / total) * 100) : 0,
      },
    ].filter((d) => d.value > 0)
  }, [total, checkedIn, notCheckedIn])

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Chart container with center stats */}
      <div className="relative flex items-center justify-center w-full max-w-[280px] h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={95}
              paddingAngle={total > 0 && checkedIn > 0 && notCheckedIn > 0 ? 4 : 0}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            {total > 0 && <Tooltip content={<CustomDonutTooltip />} />}
          </PieChart>
        </ResponsiveContainer>

        {/* Center content */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-3xl sm:text-4xl font-black tracking-tight text-white [html.light_&]:text-[#0D1B2A]">
            {rate}%
          </span>
          <span className="mt-0.5 text-xs font-semibold text-slate-300 [html.light_&]:text-[#536b88]">
            {checkedIn.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')} vé
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
            Tỷ lệ tham dự
          </span>
        </div>
      </div>

      {/* Breakdown legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs border-t border-white/10 [html.light_&]:border-slate-200 pt-3.5 w-full">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-slate-300 [html.light_&]:text-[#1B365D]">
            Đã check-in: <strong className="text-emerald-400 font-bold">{checkedIn}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          <span className="text-slate-300 [html.light_&]:text-[#1B365D]">
            Chưa check-in: <strong className="text-amber-400 font-bold">{notCheckedIn}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}

