import { useCallback, useEffect, useState } from 'react'
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
  if (num > 0)   return <span className="inline-flex rounded-full border border-warning/30 px-2 py-0.5 text-xs font-bold bg-warning/15 text-warning">{num}%</span>
  return <span className="inline-flex rounded-full border border-border-soft/30 px-2 py-0.5 text-xs font-bold bg-panel-soft text-subtle">0%</span>
}

function BarChartSimple({ data, height = 160 }) {
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
  const svgWidth = data.length * gap + 10

  return (
    <div className="overflow-x-auto">
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

// ─── Preset config ────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '7 ngày',  days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerTicketSalesPage() {
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [preset, setPreset] = useState(30)

  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load event list
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => setEvents(data || []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const dateTo   = new Date().toISOString()
      const dateFrom = new Date(Date.now() - preset * 24 * 60 * 60 * 1000).toISOString()
      const params   = { dateFrom, dateTo }
      if (selectedEventId) params.eventId = selectedEventId
      const data = await fetchTicketSalesAnalytics(params)
      setAnalytics(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu phân tích bán vé.')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, preset])

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const overall      = analytics?.overall
  const byTicketType = analytics?.by_ticket_type ?? []
  const byEvent      = analytics?.by_event ?? []
  const dailySales   = analytics?.daily_sales ?? []

  return (
    <OrganizerPage
      title="Phân tích bán vé"
      eyebrow="Tài chính / Phân tích bán vé"
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

            <div>
              <span className="block text-sm font-semibold text-subtle">Khoảng thời gian</span>
              <div className="mt-2 flex gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setPreset(p.days)}
                    className={`h-10 rounded-xl border px-4 text-sm font-semibold transition ${
                      preset === p.days
                        ? 'border-primary bg-tertiary text-white'
                        : 'border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:text-content'
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
            onClick={loadAnalytics}
            disabled={loading}
            className="admin-secondary inline-flex h-10 items-center gap-2 self-end disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </OrganizerPanel>

      {error && (
        <div className="mb-5 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

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
                {PRESETS.find((p) => p.days === preset)?.label}
              </span>
            </div>
            <BarChartSimple data={dailySales} />
            {dailySales.length > 0 && (
              <p className="mt-2 text-center text-xs text-subtle">
                Tổng: {dailySales.reduce((s, d) => s + Number(d.tickets_sold), 0).toLocaleString('vi-VN')} vé
                · {fmtCurrency(dailySales.reduce((s, d) => s + Number(d.revenue), 0))}
              </p>
            )}
          </OrganizerPanel>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            {/* ── By Ticket Type ── */}
            {byTicketType.length > 0 && (
              <OrganizerPanel>
                <div className="mb-4 flex items-center gap-2">
                  <Ticket className="size-5 text-primary" />
                  <h2 className="font-bold text-content">Bán hàng theo loại vé</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
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
                <div className="space-y-4">
                  {byEvent.map((ev) => (
                    <div key={ev.event_id} className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-content">{ev.event_title}</p>
                          <p className="text-xs text-subtle">
                            {fmtDate(ev.start_time)} · {Number(ev.sold_quantity).toLocaleString('vi-VN')}/{Number(ev.total_capacity).toLocaleString('vi-VN')} vé
                          </p>
                        </div>
                        <OccupancyBadge rate={ev.occupancy_rate} />
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-panel-soft">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            ev.occupancy_rate >= 80 ? 'bg-success' : ev.occupancy_rate >= 50 ? 'bg-primary' : 'bg-warning'
                          }`}
                          style={{ width: `${Math.min(ev.occupancy_rate, 100)}%` }}
                        />
                      </div>
                      <p className="mt-2 flex items-center justify-between text-xs text-subtle">
                        <span>Doanh thu: <span className="font-semibold text-success">{fmtShort(ev.revenue)}</span></span>
                        <span>{ev.total_orders} đơn</span>
                      </p>
                    </div>
                  ))}
                </div>
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
