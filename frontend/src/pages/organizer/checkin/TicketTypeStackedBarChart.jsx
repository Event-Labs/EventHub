import { useState } from 'react'
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
import { BarChart3, Table2, Ticket } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

function fmtCurrency(n, isEnglish = false) {
  if (isEnglish) {
    return `${Number(n || 0).toLocaleString('en-US')} VND`
  }
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n) || 0)
}

function CustomTicketTypeTooltip({ active, payload }) {
  const { isEnglish } = useLanguage()
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const checked = Number(d.checked_in) || 0
  const notChecked = Number(d.valid) || 0
  const total = Number(d.total_tickets) || 0
  const rate = total > 0 ? Math.round((checked / total) * 100) : 0

  return (
    <div className="rounded-xl border border-white/15 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-xs min-w-[220px]">
      <p className="font-bold text-white mb-1.5 text-sm border-b border-white/10 pb-1.5">
        {d.ticket_type_name}
      </p>
      {d.price !== undefined && (
        <p className="text-[11px] text-amber-300 font-semibold mb-2">
          {isEnglish ? 'Ticket Price:' : 'Giá vé:'} {fmtCurrency(d.price, isEnglish)}
        </p>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            {isEnglish ? 'Checked In:' : 'Đã check-in:'}
          </span>
          <strong className="text-emerald-400 font-mono font-bold">{checked} {isEnglish ? 'tickets' : 'vé'}</strong>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="size-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
            {isEnglish ? 'Not Checked In:' : 'Chưa check-in:'}
          </span>
          <strong className="text-amber-400 font-mono font-bold">{notChecked} {isEnglish ? 'tickets' : 'vé'}</strong>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-white/10">
          <span className="text-slate-400">{isEnglish ? 'Total Tickets:' : 'Tổng vé:'}</span>
          <span className="text-white font-mono font-bold">{total}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">{isEnglish ? 'Check-in Rate:' : 'Tỷ lệ check-in:'}</span>
          <span className="text-cyan-400 font-mono font-bold text-xs">{rate}%</span>
        </div>
      </div>
    </div>
  )
}

export function TicketTypeStackedBarChart({ data = [] }) {
  const { isEnglish } = useLanguage()
  const [viewMode, setViewMode] = useState('chart')

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
        <Ticket className="size-8 opacity-40 mb-2" />
        <p className="text-sm">{isEnglish ? 'No ticket tier data for this event.' : 'Chưa có dữ liệu loại vé cho sự kiện này.'}</p>
      </div>
    )
  }

  const chartHeight = Math.max(220, data.length * 48 + 60)

  return (
    <div>
      {/* Controls header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 [html.light_&]:border-slate-200 pb-3">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            {isEnglish ? 'Checked In' : 'Đã check-in'}
          </span>
          <span className="flex items-center gap-1.5 text-slate-300 [html.light_&]:text-[#1B365D]">
            <span className="size-2.5 rounded-full bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            {isEnglish ? 'Not Checked In' : 'Chưa check-in'}
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
            {isEnglish ? 'Chart' : 'Biểu đồ'}
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
            {isEnglish ? 'Table' : 'Bảng'}
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="w-full overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
          <div style={{ height: `${chartHeight}px`, minWidth: '420px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
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
                  dataKey="ticket_type_name"
                  stroke="#CBD5E1"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#475569' }}
                  width={140}
                  tickFormatter={(val) => (val && val.length > 18 ? `${val.slice(0, 18)}...` : val)}
                />
                <Tooltip content={<CustomTicketTypeTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
                <Legend
                  wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
                  formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
                />
                <Bar
                  dataKey="checked_in"
                  name={isEnglish ? 'Checked In' : 'Đã check-in'}
                  fill="#10B981"
                  stackId="ticketStack"
                  radius={[0, 0, 0, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey="valid"
                  name={isEnglish ? 'Not Checked In' : 'Chưa check-in'}
                  fill="#F59E0B"
                  stackId="ticketStack"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="w-full overflow-x-auto rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#0d172e]/60 [html.light_&]:bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 [html.light_&]:border-slate-200 bg-white/[0.02] text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-3.5 py-2.5">{isEnglish ? 'Ticket Tier' : 'Loại vé'}</th>
                <th className="px-3 py-2.5 text-right">{isEnglish ? 'Price' : 'Giá'}</th>
                <th className="px-3 py-2.5 text-right">{isEnglish ? 'Total Tickets' : 'Tổng vé'}</th>
                <th className="px-3 py-2.5 text-right">{isEnglish ? 'Checked In' : 'Đã check-in'}</th>
                <th className="px-3 py-2.5 text-right">{isEnglish ? 'Not Checked In' : 'Chưa check-in'}</th>
                <th className="px-3 py-2.5 text-right">{isEnglish ? 'Rate' : 'Tỷ lệ'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {data.map((tt) => (
                <tr key={tt.ticket_type_id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3.5 py-3">
                    <p className="font-bold text-white [html.light_&]:text-[#0D1B2A]">{tt.ticket_type_name}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300 font-mono">{fmtCurrency(tt.price, isEnglish)}</td>
                  <td className="px-3 py-3 text-right text-slate-300 font-mono">{tt.total_tickets}</td>
                  <td className="px-3 py-3 text-right text-emerald-400 font-mono font-bold">{tt.checked_in}</td>
                  <td className="px-3 py-3 text-right text-amber-400 font-mono font-bold">{tt.valid}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-bold text-cyan-300 font-mono">
                      {tt.checkin_rate}%
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

