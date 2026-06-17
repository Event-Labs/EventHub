import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
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

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, accent }) {
  return (
    <Panel className="relative overflow-hidden">
      {accent && <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />}
      <div className="flex items-center gap-4 pt-1">
        <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${iconBg}`}>
          <Icon className={`size-6 ${iconColor}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-[#737686]">{label}</p>
          <p className="mt-0.5 truncate text-2xl font-extrabold text-[#111827]">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-[#737686]">{sub}</p>}
        </div>
      </div>
    </Panel>
  )
}

function MiniStatRow({ label, value, tone = 'default' }) {
  const colors = {
    default: 'text-[#111827]',
    green:   'text-green-700',
    red:     'text-red-700',
    blue:    'text-[#0057c2]',
  }
  return (
    <div className="flex items-center justify-between border-b border-[#f2f4f6] py-2 last:border-0 text-sm">
      <span className="text-[#5c647a]">{label}</span>
      <span className={`font-bold ${colors[tone]}`}>{value}</span>
    </div>
  )
}

function BarChartSimple({ data, valueKey = 'gross_revenue', height = 180 }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[#737686]">
        Không có dữ liệu trong khoảng thời gian này.
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey])), 1)
  const gap = Math.max(Math.floor(700 / data.length), 8)
  const barWidth = Math.max(gap - 4, 4)
  const svgWidth = data.length * gap + 10

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={height + 30} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={0} x2={svgWidth} y1={height - pct * height} y2={height - pct * height} stroke="#e5e7eb" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const barH = Math.max((Number(d[valueKey]) / maxVal) * height, 2)
          const x = i * gap + (gap - barWidth) / 2
          const y = height - barH
          const isHighest = Number(d[valueKey]) === maxVal
          return (
            <g key={`${d.period ?? d.day}-${i}`}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3} fill={isHighest ? '#2563eb' : '#93c5fd'}>
                <title>{`${d.period ?? d.day}: ${fmtCurrency(d[valueKey])}`}</title>
              </rect>
            </g>
          )
        })}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 7))
          if (i % step !== 0) return null
          const label = String(d.period ?? d.day ?? '').slice(5)
          return (
            <text key={`lbl-${i}`} x={i * gap + gap / 2} y={height + 20} textAnchor="middle" fontSize={10} fill="#737686">
              {label}
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

export function AdminAnalyticsPage() {
  const [preset, setPreset] = useState(30)
  const [trendGroupBy, setTrendGroupBy] = useState('day')

  const [overview, setOverview] = useState(null)
  const [revenueTrend, setRevenueTrend] = useState([])
  const [topOrganizers, setTopOrganizers] = useState([])
  const [eventsByCategory, setEventsByCategory] = useState([])
  const [subscriptionRevenue, setSubscriptionRevenue] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const dateTo   = new Date().toISOString()
      const dateFrom = new Date(Date.now() - preset * 24 * 60 * 60 * 1000).toISOString()

      const [ov, trend, orgs, cats, subRev] = await Promise.all([
        fetchAdminAnalyticsOverview({ dateFrom, dateTo }),
        fetchAdminRevenueTrend({ dateFrom, dateTo, groupBy: trendGroupBy }),
        fetchAdminTopOrganizers({ limit: 10 }),
        fetchAdminEventsByCategory(),
        fetchAdminSubscriptionRevenue(),
      ])

      setOverview(ov)
      setRevenueTrend(trend)
      setTopOrganizers(orgs)
      setEventsByCategory(cats)
      setSubscriptionRevenue(subRev)
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu phân tích.')
    } finally {
      setLoading(false)
    }
  }, [preset, trendGroupBy])

  useEffect(() => { load() }, [load])

  const users   = overview?.users
  const events  = overview?.events
  const orders  = overview?.orders
  const orgReqs = overview?.organizer_requests

  const maxCatEvents = Math.max(...eventsByCategory.map((c) => Number(c.total_events)), 1)

  return (
    <Page
      title="Tổng quan nền tảng"
      description="Thống kê toàn hệ thống: người dùng, sự kiện, doanh thu và hoạt động giao dịch."
    >
      {/* ── Filters ── */}
      <Panel className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="block text-sm font-semibold text-[#434655]">Khoảng thời gian (xu hướng)</span>
            <div className="mt-2 flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setPreset(p.days)}
                  className={`h-9 rounded-md border px-4 text-sm font-semibold transition ${
                    preset === p.days
                      ? 'border-primary bg-primary text-slate-950'
                      : 'border-[#c3c6d7] bg-white text-[#434655] hover:border-primary hover:bg-[#f1fbff]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div>
              <span className="block text-sm font-semibold text-[#434655]">Nhóm theo</span>
              <div className="mt-2 flex gap-2">
                {[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTrendGroupBy(val)}
                    className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${
                      trendGroupBy === val
                        ? 'border-primary bg-primary text-slate-950'
                        : 'border-[#c3c6d7] bg-white text-[#434655] hover:border-primary hover:bg-[#f1fbff]'
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
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#c3c6d7] bg-white px-4 text-sm font-semibold text-[#434655] transition hover:border-primary hover:bg-[#f1fbff] disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>
      </Panel>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !overview ? (
        <Panel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
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
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              accent="bg-[#0057c2]"
            />
            <StatCard
              icon={Building2}
              label="Nhà tổ chức"
              value={Number(users.total_organizers).toLocaleString('vi-VN')}
              sub={`${Number(users.total_staff).toLocaleString()} nhân viên`}
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
              accent="bg-violet-500"
            />
            <StatCard
              icon={Calendar}
              label="Sự kiện đã đăng"
              value={Number(events.published_events).toLocaleString('vi-VN')}
              sub={`${Number(events.pending_events).toLocaleString()} đang chờ duyệt`}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              accent="bg-amber-400"
            />
            <StatCard
              icon={ClipboardList}
              label="Yêu cầu Organizer"
              value={Number(orgReqs.total_requests).toLocaleString('vi-VN')}
              sub={`${Number(orgReqs.pending_requests).toLocaleString()} đang chờ xử lý`}
              iconBg="bg-orange-50"
              iconColor="text-orange-600"
              accent="bg-orange-400"
            />
          </div>

          {/* ── KPI Cards — Revenue ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              label="Tổng doanh thu"
              value={fmtShort(orders.gross_revenue)}
              sub={fmtCurrency(orders.gross_revenue)}
              iconBg="bg-green-50"
              iconColor="text-green-600"
              accent="bg-green-500"
            />
            <StatCard
              icon={TrendingUp}
              label="Phí nền tảng"
              value={fmtShort(orders.total_platform_fee)}
              sub={fmtCurrency(orders.total_platform_fee)}
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
              accent="bg-teal-500"
            />
            <StatCard
              icon={Ticket}
              label="Đơn đã thanh toán"
              value={Number(orders.paid_orders).toLocaleString('vi-VN')}
              sub={`/${Number(orders.total_orders).toLocaleString()} tổng đơn`}
              iconBg="bg-pink-50"
              iconColor="text-pink-600"
              accent="bg-pink-400"
            />
            <StatCard
              icon={BarChart3}
              label="Sự kiện (toàn hệ thống)"
              value={Number(events.total_events).toLocaleString('vi-VN')}
              sub={`${Number(events.completed_events).toLocaleString()} hoàn thành`}
              iconBg="bg-sky-50"
              iconColor="text-sky-600"
              accent="bg-sky-400"
            />
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_320px]">
            {/* ── Revenue Trend Chart ── */}
            <Panel>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-5 text-primary" />
                  <h2 className="font-bold text-[#111827]">Xu hướng doanh thu</h2>
                </div>
                <span className="flex items-center gap-1 text-xs text-[#737686]">
                  <CalendarRange className="size-3" />
                  {PRESETS.find((p) => p.days === preset)?.label}
                </span>
              </div>
              <BarChartSimple data={revenueTrend} valueKey="gross_revenue" />
              {revenueTrend.length > 0 && (
                <div className="mt-3 flex justify-between text-xs text-[#737686]">
                  <span>Tổng: {fmtCurrency(revenueTrend.reduce((s, d) => s + Number(d.gross_revenue), 0))}</span>
                  <span>{revenueTrend.length} điểm dữ liệu</span>
                </div>
              )}
            </Panel>

            {/* ── Events Status Breakdown ── */}
            <Panel>
              <h2 className="mb-4 font-bold text-[#111827]">Trạng thái sự kiện</h2>
              <MiniStatRow label="Đã đăng (Published)" value={Number(events.published_events).toLocaleString('vi-VN')} tone="green" />
              <MiniStatRow label="Chờ duyệt" value={Number(events.pending_events).toLocaleString('vi-VN')} tone="blue" />
              <MiniStatRow label="Bản nháp" value={Number(events.draft_events).toLocaleString('vi-VN')} />
              <MiniStatRow label="Hoàn thành" value={Number(events.completed_events).toLocaleString('vi-VN')} />
              <MiniStatRow label="Đã hủy" value={Number(events.cancelled_events).toLocaleString('vi-VN')} tone="red" />
              <MiniStatRow label="Đã ẩn" value={Number(events.hidden_events).toLocaleString('vi-VN')} tone="red" />

              <div className="mt-5 border-t border-[#e0e3e5] pt-4">
                <h3 className="mb-3 text-xs font-bold uppercase text-[#737686]">Yêu cầu Organizer</h3>
                <MiniStatRow label="Chờ duyệt" value={Number(orgReqs.pending_requests).toLocaleString('vi-VN')} tone="blue" />
                <MiniStatRow label="Đã duyệt" value={Number(orgReqs.approved_requests).toLocaleString('vi-VN')} tone="green" />
                <MiniStatRow label="Từ chối" value={Number(orgReqs.rejected_requests).toLocaleString('vi-VN')} tone="red" />
              </div>
            </Panel>
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            {/* ── Top Organizers ── */}
            {topOrganizers.length > 0 && (
              <Panel>
                <h2 className="mb-4 font-bold text-[#111827]">Top nhà tổ chức (theo doanh thu)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e5e7eb] text-xs uppercase text-[#737686]">
                        <th className="pb-3 text-left font-bold">#</th>
                        <th className="pb-3 text-left font-bold">Tên tổ chức</th>
                        <th className="pb-3 text-right font-bold">Sự kiện</th>
                        <th className="pb-3 text-right font-bold">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOrganizers.map((org, i) => (
                        <tr key={org.organizer_id} className="border-b border-[#f2f4f6] last:border-0 hover:bg-[#f7f9fb]">
                          <td className="py-2.5 pr-2 text-xs font-bold text-[#737686]">{i + 1}</td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#111827] truncate max-w-[140px]">{org.organizer_name}</p>
                              {org.subscription_name && (
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-[#dbe1ff] text-[#003ea8]">
                                  {org.subscription_name}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#737686] truncate max-w-[200px]">{org.organizer_email}</p>
                          </td>
                          <td className="py-2.5 text-right text-[#434655]">{org.total_events}</td>
                          <td className="py-2.5 text-right font-semibold text-green-700">{fmtShort(org.gross_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {/* ── Events by Category ── */}
            {eventsByCategory.length > 0 && (
              <Panel>
                <h2 className="mb-4 font-bold text-[#111827]">Sự kiện theo danh mục</h2>
                <div className="space-y-3">
                  {eventsByCategory.map((cat) => {
                    const pct = Math.round((Number(cat.total_events) / maxCatEvents) * 100)
                    return (
                      <div key={cat.id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold text-[#111827] truncate max-w-[200px]">{cat.name}</span>
                          <span className="ml-2 shrink-0 text-xs font-bold text-[#737686]">
                            {Number(cat.total_events).toLocaleString()} sự kiện
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#e0e3e5]">
                          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-0.5 text-xs text-[#737686]">
                          {Number(cat.published_events).toLocaleString()} đã đăng · {Number(cat.completed_events).toLocaleString()} hoàn thành
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            )}
          </div>

          {/* ── Order Stats Summary ── */}
          <Panel>
            <h2 className="mb-4 font-bold text-[#111827]">Tóm tắt đơn hàng (toàn thời gian)</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Tổng đơn', Number(orders.total_orders).toLocaleString('vi-VN'), ''],
                ['Đã thanh toán', Number(orders.paid_orders).toLocaleString('vi-VN'), 'text-green-700'],
                ['Đang xử lý', Number(orders.pending_orders).toLocaleString('vi-VN'), 'text-amber-600'],
                ['Đã hủy', Number(orders.cancelled_orders).toLocaleString('vi-VN'), 'text-red-600'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-lg border border-[#e0e3e5] bg-[#f7f9fb] p-4 text-center">
                  <p className="text-xs font-bold uppercase text-[#737686]">{label}</p>
                  <p className={`mt-1 text-xl font-extrabold ${color || 'text-[#111827]'}`}>{value}</p>
                </div>
              ))}
            </div>
          </Panel>

          {/* ── Subscription Revenue ── */}
          {subscriptionRevenue && (
            <Panel className="mt-6">
              <h2 className="mb-4 font-bold text-[#111827]">Doanh thu từ gói dịch vụ</h2>
              <div className="mb-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-[#e0e3e5] bg-[#f7f9fb] p-4 text-center">
                  <p className="text-xs font-bold uppercase text-[#737686]">Tổng lượt đăng ký</p>
                  <p className="mt-1 text-xl font-extrabold text-[#111827]">
                    {Number(subscriptionRevenue.total_subscriptions).toLocaleString('vi-VN')}
                  </p>
                  <p className="mt-0.5 text-xs text-[#737686]">
                    {Number(subscriptionRevenue.active_subscriptions).toLocaleString('vi-VN')} đang active
                  </p>
                </div>
                <div className="rounded-lg border border-[#e0e3e5] bg-[#f7f9fb] p-4 text-center">
                  <p className="text-xs font-bold uppercase text-[#737686]">Số gói đang active</p>
                  <p className="mt-1 text-xl font-extrabold text-green-700">
                    {Number(subscriptionRevenue.active_subscriptions).toLocaleString('vi-VN')}
                  </p>
                </div>
                <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-center">
                  <p className="text-xs font-bold uppercase text-green-700">Tổng doanh thu thu được</p>
                  <p className="mt-1 text-xl font-extrabold text-green-800">
                    {fmtCurrency(subscriptionRevenue.total_revenue)}
                  </p>
                  <p className="mt-0.5 text-xs text-green-600">Bao gồm cả gói đã hủy</p>
                </div>
              </div>

              {/* Per-plan breakdown — mỗi plan 1 dòng */}
              {Array.isArray(subscriptionRevenue.by_plan) && subscriptionRevenue.by_plan.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e5e7eb] text-xs uppercase text-[#737686]">
                        <th className="pb-3 text-left font-bold">Gói dịch vụ</th>
                        <th className="pb-3 text-right font-bold">Giá / lần</th>
                        <th className="pb-3 text-right font-bold">Tổng doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionRevenue.by_plan.map((plan) => (
                        <tr key={plan.plan_id} className="border-b border-[#f2f4f6] last:border-0 hover:bg-[#f7f9fb]">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="rounded px-2 py-1 text-xs font-bold bg-[#dbe1ff] text-[#003ea8]">
                                {plan.plan_name}
                              </span>
                              <span className="text-xs text-[#737686]">
                                {Number(plan.total).toLocaleString('vi-VN')} lượt đăng ký
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right text-[#434655]">{fmtCurrency(plan.price)}</td>
                          <td className="py-3 text-right font-semibold text-green-700">{fmtCurrency(plan.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#e0e3e5] bg-[#f7f9fb]">
                        <td className="py-3 font-bold text-[#111827]">
                          Tổng cộng
                          <span className="ml-2 text-xs font-normal text-[#737686]">
                            ({Number(subscriptionRevenue.total_subscriptions).toLocaleString('vi-VN')} lượt)
                          </span>
                        </td>
                        <td />
                        <td className="py-3 text-right font-bold text-green-700">
                          {fmtCurrency(subscriptionRevenue.total_revenue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </>
      ) : null}
    </Page>
  )
}
