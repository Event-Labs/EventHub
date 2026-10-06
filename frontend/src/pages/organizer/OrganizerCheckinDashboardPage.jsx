import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  RefreshCw,
  ScanLine,
  TicketCheck,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchCheckinStats } from '@/services/organizerOrders.js'
import { Badge, OrganizerPage, OrganizerPanel, StatCard } from './OrganizerComponents.jsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtCurrency(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n) || 0)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'bg-primary' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-panel-soft">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OrganizerCheckinDashboardPage() {
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)

  // Load event list (only published events)
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => {
        const active = (data || []).filter((e) => e.status === 'PUBLISHED')
        setEvents(active)
        if (active.length > 0) setSelectedEventId(active[0].id)
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

  const loadStats = useCallback(async () => {
    if (!selectedEventId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchCheckinStats(selectedEventId)
      setStats(data)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu check-in.')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  useEffect(() => { loadStats() }, [loadStats])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(loadStats, 30_000)
    return () => clearInterval(timer)
  }, [loadStats])

  const overall = stats?.overall
  const bySession = stats?.by_session ?? []
  const byTicketType = stats?.by_ticket_type ?? []
  const recentCheckins = stats?.recent_checkins ?? []

  return (
    <OrganizerPage
      title="Theo dõi Check-in"
      description="Theo dõi tình trạng check-in theo thời gian thực cho sự kiện của bạn."
    >
      {/* ── Event selector ── */}
      <div className="mb-6">
        {eventsLoading ? (
          <div className="flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="size-4 animate-spin" /> Đang tải sự kiện...
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-subtle">Chưa có sự kiện đã xuất bản nào.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="shrink-0 text-base font-bold text-white">Chọn sự kiện</span>
            <div className="relative w-full sm:w-[420px]">
              <select
                className="h-10 w-full appearance-none rounded-xl border border-white/15 bg-[#0d172e] pl-3 pr-9 text-sm font-medium text-white shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#0b1329] text-white">
                    {ev.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
            </div>
            <button
              type="button"
              onClick={loadStats}
              disabled={loading || !selectedEventId}
              className="org-btn-secondary inline-flex h-10 items-center gap-2 disabled:opacity-50"
              title="Làm mới thống kê"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {lastRefresh && (
              <p className="text-xs text-subtle">
                Cập nhật: {lastRefresh.toLocaleTimeString('vi-VN')}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <OrganizerPanel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-tertiary" />
        </OrganizerPanel>
      ) : stats ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              label="Tổng vé"
              value={overall.total_tickets.toLocaleString('vi-VN')}
              sub="Vé đã bán (đơn PAID)"
              accentBg="bg-tertiary/15"
              accentColor="text-tertiary"
            />
            <StatCard
              icon={CheckCircle2}
              label="Đã check-in"
              value={overall.checked_in.toLocaleString('vi-VN')}
              sub={`${overall.checkin_rate}% tổng số vé`}
              accentBg="bg-success/15"
              accentColor="text-success"
            />
            <StatCard
              icon={TicketCheck}
              label="Chưa check-in"
              value={overall.valid.toLocaleString('vi-VN')}
              sub="Vé hợp lệ còn lại"
              accentBg="bg-warning/15"
              accentColor="text-warning"
            />
            <StatCard
              icon={TrendingUp}
              label="Tỷ lệ check-in"
              value={`${overall.checkin_rate}%`}
              sub={`${overall.checked_in} / ${overall.total_tickets}`}
              accentBg="bg-ai/15"
              accentColor="text-ai"
            />
          </div>

          {/* ── Overall progress ── */}
          <OrganizerPanel className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-content">Tiến độ check-in tổng thể</h2>
              <span className="text-sm font-bold text-tertiary">{overall.checkin_rate}%</span>
            </div>
            <ProgressBar
              value={overall.checkin_rate}
              color={overall.checkin_rate >= 80 ? 'bg-success' : overall.checkin_rate >= 50 ? 'bg-primary' : 'bg-warning'}
            />
            <div className="mt-3 flex gap-6 text-xs text-subtle">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Đã check-in: {overall.checked_in}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" /> Chưa check-in: {overall.valid}
              </span>
              {overall.cancelled > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-error" /> Đã hủy: {overall.cancelled}
                </span>
              )}
            </div>
          </OrganizerPanel>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            {/* ── By Session ── */}
            {bySession.length > 0 && (
              <OrganizerPanel>
                <h2 className="mb-4 font-bold text-content">Check-in theo phiên</h2>
                <div className="space-y-4">
                  {bySession.map((s) => (
                    <div key={s.session_id} className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-content">{s.session_name}</p>
                          <p className="text-xs text-subtle">
                            {fmtDate(s.start_time)} · {s.venue_name}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-tertiary">
                          {s.checkin_rate}%
                        </span>
                      </div>
                      <ProgressBar
                        value={s.checkin_rate}
                        color={s.checkin_rate >= 80 ? 'bg-success' : 'bg-primary'}
                      />
                      <p className="mt-2 text-xs text-subtle">
                        {s.checked_in} / {s.total_tickets} đã check-in
                      </p>
                    </div>
                  ))}
                </div>
              </OrganizerPanel>
            )}

            {/* ── By Ticket Type ── */}
            {byTicketType.length > 0 && (
              <OrganizerPanel>
                <h2 className="mb-4 font-bold text-content">Check-in theo loại vé</h2>
                <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[500px] text-xs">
                      <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                        <tr>
                          <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Loại vé</th>
                          <th className="px-3.5 py-3 text-right font-bold uppercase tracking-wider text-white whitespace-nowrap">Tổng</th>
                          <th className="px-3.5 py-3 text-right font-bold uppercase tracking-wider text-white whitespace-nowrap">Đã CK</th>
                          <th className="px-3.5 py-3 text-right font-bold uppercase tracking-wider text-white whitespace-nowrap">Tỷ lệ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                        {byTicketType.map((tt) => (
                          <tr key={tt.ticket_type_id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-content">{tt.ticket_type_name}</p>
                              <p className="text-xs text-subtle">{fmtCurrency(tt.price)}</p>
                            </td>
                            <td className="px-4 py-3.5 text-right text-subtle">{tt.total_tickets}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-success">{tt.checked_in}</td>
                            <td className="px-4 py-3.5 text-right">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold border ${tt.checkin_rate >= 80 ? 'bg-success/15 text-success border-success/30' :
                                  tt.checkin_rate >= 50 ? 'bg-tertiary/15 text-tertiary border-tertiary/30' :
                                    'bg-warning/15 text-warning border-warning/30'
                                }`}>
                                {tt.checkin_rate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </OrganizerPanel>
            )}
          </div>

          {/* ── Recent Check-ins ── */}
          {recentCheckins.length > 0 && (
            <OrganizerPanel>
              <div className="mb-4 flex items-center gap-2">
                <ScanLine className="size-5 text-tertiary" />
                <h2 className="font-bold text-content">Check-in gần nhất (20 lần)</h2>
              </div>
              <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[650px] text-xs">
                    <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Người tham dự</th>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Loại vé</th>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Phiên</th>
                        <th className="px-3.5 py-3 text-left font-bold uppercase tracking-wider text-white whitespace-nowrap">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                      {recentCheckins.map((c, i) => (
                        <tr key={`${c.ticket_code}-${i}`} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-content">{c.attendee_name || '—'}</p>
                            <p className="text-xs text-subtle">{c.attendee_email}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge tone="blue">{c.ticket_type_name}</Badge>
                          </td>
                          <td className="px-4 py-3.5 text-subtle">
                            {c.session_name || '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="flex items-center gap-1 text-xs text-subtle">
                              <Clock className="size-3" />
                              {fmtDateTime(c.checked_in_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </OrganizerPanel>
          )}

          {overall.total_tickets === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <XCircle className="mx-auto size-10 text-subtle" />
              <p className="mt-3 font-bold text-content">Sự kiện này chưa có vé nào được bán.</p>
              <p className="mt-1 text-sm text-subtle">Dữ liệu check-in sẽ xuất hiện khi có đơn hàng được thanh toán.</p>
            </OrganizerPanel>
          )}
        </>
      ) : null}
    </OrganizerPage>
  )
}
