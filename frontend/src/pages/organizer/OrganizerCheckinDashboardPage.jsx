import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
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

  // Load event list
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => {
        const active = (data || []).filter((e) =>
          ['PUBLISHED', 'COMPLETED', 'CANCELLED'].includes(e.status),
        )
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
      title="Theo dõi check-in"
      eyebrow="Vận hành / Theo dõi check-in"
      description="Theo dõi tình trạng check-in theo thời gian thực cho sự kiện của bạn."
    >
      {/* ── Event selector ── */}
      <OrganizerPanel className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-sm text-subtle">
              <Loader2 className="size-4 animate-spin" /> Đang tải sự kiện...
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-subtle">Chưa có sự kiện đã xuất bản nào.</p>
          ) : (
            <label className="flex-1">
              <span className="block text-sm font-semibold text-subtle">Chọn sự kiện</span>
              <select
                className="org-input mt-2"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={loadStats}
              disabled={loading || !selectedEventId}
              className="admin-secondary inline-flex h-10 items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            {lastRefresh && (
              <p className="text-xs text-subtle">
                Cập nhật: {lastRefresh.toLocaleTimeString('vi-VN')}
              </p>
            )}
          </div>
        </div>
      </OrganizerPanel>

      {error && (
        <div className="mb-5 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
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
              icon={Users}
              label="Tổng vé"
              value={overall.total_tickets.toLocaleString('vi-VN')}
              sub="Vé đã bán (đơn PAID)"
              accentBg="bg-secondary/20"
              accentColor="text-primary"
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
              <span className="text-sm font-bold text-primary">{overall.checkin_rate}%</span>
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
                        <span className="shrink-0 text-sm font-bold text-primary">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-soft/30 text-xs uppercase text-subtle">
                        <th className="pb-3 text-left font-bold">Loại vé</th>
                        <th className="pb-3 text-right font-bold">Tổng</th>
                        <th className="pb-3 text-right font-bold">Đã CK</th>
                        <th className="pb-3 text-right font-bold">Tỷ lệ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byTicketType.map((tt) => (
                        <tr key={tt.ticket_type_id} className="border-b border-border-soft/20 last:border-0 hover:bg-panel-soft/50">
                          <td className="py-3">
                            <p className="font-semibold text-content">{tt.ticket_type_name}</p>
                            <p className="text-xs text-subtle">{fmtCurrency(tt.price)}</p>
                          </td>
                          <td className="py-3 text-right text-subtle">{tt.total_tickets}</td>
                          <td className="py-3 text-right font-semibold text-success">{tt.checked_in}</td>
                          <td className="py-3 text-right">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold border ${
                              tt.checkin_rate >= 80 ? 'bg-success/15 text-success border-success/30' :
                              tt.checkin_rate >= 50 ? 'bg-secondary/20 text-primary border-secondary/30' :
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
              </OrganizerPanel>
            )}
          </div>

          {/* ── Recent Check-ins ── */}
          {recentCheckins.length > 0 && (
            <OrganizerPanel>
              <div className="mb-4 flex items-center gap-2">
                <ScanLine className="size-5 text-primary" />
                <h2 className="font-bold text-content">Check-in gần nhất (20 lần)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-border-soft/30 text-xs uppercase text-subtle">
                      <th className="pb-3 text-left font-bold">Người tham dự</th>
                      <th className="pb-3 text-left font-bold">Loại vé</th>
                      <th className="pb-3 text-left font-bold">Phiên</th>
                      <th className="pb-3 text-left font-bold">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCheckins.map((c, i) => (
                      <tr key={`${c.ticket_code}-${i}`} className="border-b border-border-soft/20 last:border-0 hover:bg-panel-soft/50">
                        <td className="py-3">
                          <p className="font-semibold text-content">{c.attendee_name || '—'}</p>
                          <p className="text-xs text-subtle">{c.attendee_email}</p>
                        </td>
                        <td className="py-3">
                          <Badge tone="blue">{c.ticket_type_name}</Badge>
                        </td>
                        <td className="py-3 text-subtle">
                          {c.session_name || '—'}
                        </td>
                        <td className="py-3">
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
