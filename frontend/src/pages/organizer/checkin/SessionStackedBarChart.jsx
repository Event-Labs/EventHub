import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Clock, Table2 } from 'lucide-react'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function fmtDate(iso) {
  if (!iso) return '—'
  const isEn = getAutoLocale() === 'en-US'
  return new Date(iso).toLocaleDateString(getAutoLocale(), {
    day: '2-digit',
    month: isEn ? 'short' : '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CustomSessionTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const checked = Number(d.checked_in) || 0
  const notChecked = Number(d.valid) || 0
  const total = Number(d.total_tickets) || 0
  const rate = total > 0 ? Math.round((checked / total) * 100) : 0

  return (
    <div className="rounded-xl border border-white/15 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-xs min-w-[220px]">
      <p className="font-bold text-white mb-2 text-sm border-b border-white/10 pb-1.5">
        {d.session_name}
      </p>
      {d.start_time && (
        <p className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
          <Clock className="size-3 text-slate-400" />
          {fmtDate(d.start_time)}
        </p>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            Đã check-in:
          </span>
          <strong className="text-emerald-400 font-mono font-bold">{checked} vé</strong>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
            Chưa check-in:
          </span>
          <strong className="text-amber-400 font-mono font-bold">{notChecked} vé</strong>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-white/10">
          <span className="text-slate-400">Tổng vé:</span>
          <span className="text-white font-mono font-bold">{total}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Tỷ lệ tham dự:</span>
          <span className="text-cyan-400 font-mono font-bold text-xs">{rate}%</span>
        </div>
      </div>
    </div>
  )
}

export function SessionStackedBarChart({ data = [] }) {
  const [viewMode, setViewMode] = useState('chart')

  // Chronologically sort sessions by start_time ASC
  const sortedSessions = useMemo(() => {
    return [...data].sort((a, b) => {
      const tA = a.start_time ? new Date(a.start_time).getTime() : 0
      const tB = b.start_time ? new Date(b.start_time).getTime() : 0
      return tA - tB
    })
  }, [data])

  if (!sortedSessions || sortedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
        <Clock className="size-8 opacity-40 mb-2" />
        <p className="text-sm">Chưa có dữ liệu phiên cho sự kiện này.</p>
      </div>
    )
  }

  // Dynamic height based on number of sessions (minimum 240px)
  const chartHeight = Math.max(240, sortedSessions.length * 48 + 60)

  return (
    <div>
      {/* Controls header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            Đã check-in
          </span>
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            Chưa check-in
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-900/60 [html.light_&]:bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-bold transition cursor-pointer ${
              viewMode === 'chart'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            <BarChart3 className="size-3.5" />
            Biểu đồ
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-bold transition cursor-pointer ${
              viewMode === 'table'
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                : 'text-slate-400 hover:text-white [html.light_&]:hover:text-[#0D1B2A]'
            }`}
          >
            <Table2 className="size-3.5" />
            Bảng
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="w-full overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
          <div style={{ height: `${chartHeight}px`, minWidth: '420px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedSessions}
                layout="vertical"
                margin={{ top: 10, right: 25, left: 20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#475569' }}
                />
                <YAxis
                  type="category"
                  dataKey="session_name"
                  stroke="#CBD5E1"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#475569' }}
                  width={140}
                  tickFormatter={(val) => (val && val.length > 18 ? `${val.slice(0, 18)}...` : val)}
                />
                <Tooltip content={<CustomSessionTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
                <Legend
                  wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                  formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
                />
                <Bar
                  dataKey="checked_in"
                  name="Đã check-in"
                  fill="#10B981"
                  stackId="sessionStack"
                  radius={[0, 0, 0, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey="valid"
                  name="Chưa check-in"
                  fill="#F59E0B"
                  stackId="sessionStack"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* Table View Fallback */
        <div className="w-full overflow-x-auto rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#0d172e]/60 [html.light_&]:bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 [html.light_&]:border-slate-200 bg-white/[0.02] text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-3.5 py-2.5">Phiên diễn</th>
                <th className="px-3 py-2.5 text-right">Tổng vé</th>
                <th className="px-3 py-2.5 text-right">Đã check-in</th>
                <th className="px-3 py-2.5 text-right">Chưa check-in</th>
                <th className="px-3 py-2.5 text-right">Tỷ lệ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {sortedSessions.map((s) => (
                <tr key={s.session_id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3.5 py-3">
                    <p className="font-bold text-white [html.light_&]:text-[#0D1B2A]">{s.session_name}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(s.start_time)}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300 font-mono">{s.total_tickets}</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-mono font-bold">{s.checked_in}</td>
                  <td className="px-3 py-3 text-right text-amber-400 font-mono font-bold">{s.valid}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-bold text-cyan-300 font-mono">
                      {s.checkin_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

