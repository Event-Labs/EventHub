import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  ReceiptText,
  TrendingUp,
  Ticket,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchRevenueStats } from '@/services/organizerOrders.js'
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, trend }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#e0e3e5] bg-white p-5 shadow-sm">
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconBg}`}>
        <Icon className={`size-6 ${iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-[#737686]">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-extrabold text-[#111827]">{value}</p>
        {sub && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[#737686]">
            {trend === 'up' && <ArrowUpRight className="size-3 text-green-500" />}
            {trend === 'down' && <ArrowDownRight className="size-3 text-red-500" />}
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

function BarChartSimple({ data, height = 160 }) {
  if (!data || data.length === 0) return (
    <div className="flex h-40 items-center justify-center text-sm text-[#737686]">
      Không có dữ liệu trong khoảng thời gian này.
    </div>
  )

  const maxVal = Math.max(...data.map((d) => Number(d.net_revenue)), 1)
  const gap = Math.max(Math.floor(600 / data.length), 8)
  const barWidth = Math.max(gap - 4, 4)
  const svgWidth = data.length * gap + 10

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={height + 30} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={0} x2={svgWidth} y1={height - pct * height} y2={height - pct * height} stroke="#e5e7eb" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const barH = Math.max(((Number(d.net_revenue) / maxVal) * height), 2)
          const x = i * gap + (gap - barWidth) / 2
          const y = height - barH
          const isHighest = Number(d.net_revenue) === maxVal
          return (
            <g key={d.day}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={isHighest ? '#2563eb' : '#93c5fd'}>
                <title>{`${d.day}: ${fmtCurrency(d.net_revenue)}`}</title>
              </rect>
            </g>
          )
        })}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 6))
          if (i % step !== 0) return null
          return (
            <text key={`lbl-${d.day}`} x={i * gap + gap / 2} y={height + 20} textAnchor="middle" fontSize={10} fill="#737686">
              {d.day ? d.day.slice(5) : ''}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Preset config ────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerDashboardPage() {
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [preset, setPreset] = useState(30)

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      const dateTo = new Date().toISOString()
      const dateFrom = new Date(Date.now() - preset * 24 * 60 * 60 * 1000).toISOString()
      const params = { dateFrom, dateTo }
      if (selectedEventId) params.eventId = selectedEventId
      const data = await fetchRevenueStats(params)
      setStats(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu doanh thu.')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, preset])

  useEffect(() => { loadStats() }, [loadStats])

  const overall = stats?.overall
  const byEvent = stats?.by_event ?? []
  const dailyRevenue = stats?.daily_revenue ?? []
  const maxEventRevenue = Math.max(...byEvent.map((e) => Number(e.gross_revenue)), 1)

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
              <span className="block text-sm font-semibold text-[#434655]">Sự kiện</span>
              {eventsLoading ? (
                <div className="mt-2 flex h-10 items-center gap-2 text-sm text-[#737686]">
                  <Loader2 className="size-4 animate-spin" /> Đang tải...
                </div>
              ) : (
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[#c3c6d7] bg-white px-3 text-sm"
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

            <div>
              <span className="block text-sm font-semibold text-[#434655]">Khoảng thời gian</span>
              <div className="mt-2 flex gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setPreset(p.days)}
                    className={`h-10 rounded-md border px-4 text-sm font-semibold transition ${
                      preset === p.days
                        ? 'border-primary bg-primary text-white'
                        : 'border-[#c3c6d7] bg-white text-[#434655] hover:border-primary hover:bg-[#f1fbff]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 self-end rounded-md border border-[#c3c6d7] bg-white px-4 text-sm font-semibold text-[#434655] transition hover:border-primary hover:bg-[#f1fbff] disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </OrganizerPanel>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <OrganizerPanel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </OrganizerPanel>
      ) : stats ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              label="Doanh thu gộp"
              value={fmtShort(overall.gross_revenue)}
              sub={fmtCurrency(overall.gross_revenue)}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
            <StatCard
              icon={TrendingUp}
              label="Doanh thu ròng"
              value={fmtShort(overall.net_revenue)}
              sub={`Sau phí nền tảng: ${fmtCurrency(overall.total_platform_fee)}`}
              iconBg="bg-green-50"
              iconColor="text-green-600"
            />
            <StatCard
              icon={ReceiptText}
              label="Tổng đơn hàng"
              value={overall.total_orders.toLocaleString('vi-VN')}
              sub="Đơn đã thanh toán"
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
            />
            <StatCard
              icon={Ticket}
              label="Vé đã bán"
              value={overall.total_tickets_sold.toLocaleString('vi-VN')}
              sub={overall.total_orders > 0 ? `TB ${(overall.total_tickets_sold / overall.total_orders).toFixed(1)} vé/đơn` : '—'}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
          </div>

          {/* ── Revenue breakdown ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[#e0e3e5] bg-[#f7f9fb] p-4 text-center">
              <p className="text-xs font-bold uppercase text-[#737686]">Tổng chiết khấu</p>
              <p className="mt-1 text-lg font-extrabold text-[#111827]">{fmtCurrency(overall.total_discount)}</p>
            </div>
            <div className="rounded-xl border border-[#e0e3e5] bg-[#f7f9fb] p-4 text-center">
              <p className="text-xs font-bold uppercase text-[#737686]">Phí nền tảng</p>
              <p className="mt-1 text-lg font-extrabold text-[#111827]">{fmtCurrency(overall.total_platform_fee)}</p>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-center">
              <p className="text-xs font-bold uppercase text-green-700">Thực nhận (ròng)</p>
              <p className="mt-1 text-lg font-extrabold text-green-800">{fmtCurrency(overall.net_revenue)}</p>
            </div>
          </div>

          {/* ── Daily Revenue Chart ── */}
          <OrganizerPanel className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              <h2 className="font-bold text-[#111827]">Doanh thu ròng theo ngày</h2>
              <span className="ml-auto text-xs text-[#737686]">
                <CalendarRange className="mr-1 inline size-3" />
                {PRESETS.find((p) => p.days === preset)?.label}
              </span>
            </div>
            <BarChartSimple data={dailyRevenue} />
            {dailyRevenue.length > 0 && (
              <p className="mt-2 text-center text-xs text-[#737686]">
                Tổng: {fmtCurrency(dailyRevenue.reduce((s, d) => s + Number(d.net_revenue), 0))}
              </p>
            )}
          </OrganizerPanel>

          {/* ── Per-event breakdown ── */}
          {byEvent.length > 0 && (
            <OrganizerPanel>
              <h2 className="mb-4 font-bold text-[#111827]">Doanh thu theo sự kiện</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] text-xs uppercase text-[#737686]">
                      <th className="pb-3 text-left font-bold">Sự kiện</th>
                      <th className="pb-3 text-right font-bold">Đơn</th>
                      <th className="pb-3 text-right font-bold">Doanh thu gộp</th>
                      <th className="pb-3 text-right font-bold">Doanh thu ròng</th>
                      <th className="pb-3 pl-6 text-left font-bold">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEvent.map((ev) => {
                      const pct = Math.round((Number(ev.gross_revenue) / maxEventRevenue) * 100)
                      return (
                        <tr key={ev.event_id} className="border-b border-[#f2f4f6] last:border-0 hover:bg-[#f7f9fb]">
                          <td className="py-3">
                            <p className="font-semibold text-[#111827]">{ev.event_title}</p>
                            <p className="text-xs text-[#737686]">{fmtDate(ev.start_time)}</p>
                          </td>
                          <td className="py-3 text-right text-[#434655]">{ev.total_orders}</td>
                          <td className="py-3 text-right font-semibold text-[#111827]">
                            {fmtCurrency(ev.gross_revenue)}
                          </td>
                          <td className="py-3 text-right font-semibold text-green-700">
                            {fmtCurrency(ev.net_revenue)}
                          </td>
                          <td className="py-3 pl-6">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-[#e0e3e5]">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-[#737686]">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#e0e3e5] bg-[#f7f9fb]">
                      <td className="py-3 font-bold text-[#111827]">Tổng cộng</td>
                      <td className="py-3 text-right font-bold">{overall.total_orders}</td>
                      <td className="py-3 text-right font-bold text-[#111827]">
                        {fmtCurrency(overall.gross_revenue)}
                      </td>
                      <td className="py-3 text-right font-bold text-green-700">
                        {fmtCurrency(overall.net_revenue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </OrganizerPanel>
          )}

          {overall.total_orders === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <CircleDollarSign className="mx-auto size-10 text-[#c3c6d7]" />
              <p className="mt-3 font-bold text-[#565e74]">Chưa có doanh thu trong khoảng thời gian này.</p>
              <p className="mt-1 text-sm text-[#737686]">Thử mở rộng khoảng thời gian hoặc chọn sự kiện khác.</p>
            </OrganizerPanel>
          )}
        </>
      ) : null}
    </OrganizerPage>
  )
}
