import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  Clock,
  History,
  Loader2,
  PieChart,
  Ticket,
  TicketCheck,
  TrendingUp,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { fetchOrganizerEvents } from '@/services/organizerEvents.js'
import { fetchCheckinStats } from '@/services/organizerOrders.js'
import { Badge, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import { OrganizerEventPicker } from './OrganizerEventPicker.jsx'
import { CheckinKpiCards } from './checkin/CheckinKpiCards.jsx'
import { SessionStackedBarChart } from './checkin/SessionStackedBarChart.jsx'
import { OverallDonutChart } from './checkin/OverallDonutChart.jsx'
import { TicketTypeStackedBarChart } from './checkin/TicketTypeStackedBarChart.jsx'
import { CheckinTrendLineChart } from './checkin/CheckinTrendLineChart.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function OrganizerCheckinDashboardPage() {
  const { isEnglish } = useLanguage()
  const [searchParams] = useSearchParams()
  const initialEventId = searchParams.get('eventId') || ''

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState(initialEventId)

  const [stats, setStats] = useState(null)
  const [initialLoading, setInitialLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connected') // 'connected' | 'reconnecting' | 'error'
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)

  // 1. Load active events list for organizer
  useEffect(() => {
    setEventsLoading(true)
    fetchOrganizerEvents()
      .then((data) => {
        const active = (data || []).filter(
          (e) =>
            ['PUBLISHED', 'COMPLETED', 'CANCELLED'].includes(e.status) ||
            Number(e.paid_orders_count || 0) > 0 ||
            (e.status !== 'DRAFT' && e.status !== 'PENDING_REVIEW')
        )
        setEvents(active)
        if (initialEventId && active.some((ev) => ev.id === initialEventId)) {
          setSelectedEventId(initialEventId)
        } else if (active.length > 0) {
          setSelectedEventId(active[0].id)
        }
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [initialEventId])

  // 2. Fetch stats function (with background poll support)
  const loadStats = useCallback(
    async (isManual = false) => {
      if (!selectedEventId) return

      if (isManual || !stats) {
        setIsRefreshing(true)
      }

      try {
        const data = await fetchCheckinStats(selectedEventId)
        setStats(data)
        setLastRefresh(new Date())
        setConnectionStatus('connected')
        setError('')
      } catch (err) {
        setConnectionStatus('reconnecting')
        if (!stats) {
          setError(err.response?.data?.message || 'Không thể tải dữ liệu check-in.')
        }
      } finally {
        setIsRefreshing(false)
        setInitialLoading(false)
      }
    },
    [selectedEventId, stats]
  )

  // 3. Reset and load on event change
  useEffect(() => {
    if (!selectedEventId) return
    setStats(null)
    setInitialLoading(true)
    setError('')
    loadStats(true)
  }, [selectedEventId])

  // 4. Polling timer every 5 seconds for Real-time Analytics
  useEffect(() => {
    if (!selectedEventId) return
    const timer = setInterval(() => {
      loadStats(false)
    }, 5_000)

    return () => clearInterval(timer)
  }, [selectedEventId, loadStats])

  const overall = stats?.overall ?? { total_tickets: 0, checked_in: 0, valid: 0, cancelled: 0, checkin_rate: 0 }
  const bySession = stats?.by_session ?? []
  const byTicketType = stats?.by_ticket_type ?? []
  const recentCheckins = stats?.recent_checkins ?? []
  const timeline = stats?.checkin_timeline ?? []

  return (
    <OrganizerPage
      title={isEnglish ? 'Check-in Monitoring' : 'Theo dõi Check-in'}
    >
      {/* ── ROW 1: HEADER CONTROLS & REAL-TIME STATUS ── */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/10 [html.light_&]:border-slate-200 pb-5">
        {/* Left: Event selector */}
        <div className="w-full lg:max-w-xl">
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin text-primary" /> {isEnglish ? 'Loading events list...' : 'Đang tải danh sách sự kiện...'}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-400">{isEnglish ? 'No events found in the system.' : 'Chưa có sự kiện nào trong hệ thống.'}</p>
          ) : (
            <OrganizerEventPicker
              events={events}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              loading={eventsLoading}
              label={isEnglish ? 'Select event to monitor' : 'Chọn sự kiện theo dõi'}
              allowAll={false}
              showCalendarIcon={false}
              placeholder={isEnglish ? 'Select an event to monitor check-in...' : 'Chọn sự kiện để theo dõi check-in...'}
            />
          )}
        </div>

        {/* Right: Real-time Connection Status */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 self-start lg:self-center">
          {connectionStatus === 'connected' ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span>{isEnglish ? 'Live Updates' : 'Cập nhật trực tiếp'}</span>
              <span className="text-emerald-500/40">|</span>
              <span className="text-slate-300 font-normal">
                {lastRefresh ? lastRefresh.toLocaleTimeString(isEnglish ? 'en-US' : 'vi-VN') : '—'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-400">
              <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{isEnglish ? 'Reconnecting...' : 'Đang kết nối lại...'}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {initialLoading && !stats ? (
        <OrganizerPanel className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="size-10 animate-spin text-primary mb-3" />
          <p className="text-sm font-semibold text-white">{isEnglish ? 'Aggregating real-time check-in metrics...' : 'Đang tổng hợp số liệu check-in thời gian thực...'}</p>
        </OrganizerPanel>
      ) : stats ? (
        <div className="space-y-6">
          {/* ── ROW 2: KPI SUMMARY CARDS ── */}
          <CheckinKpiCards overall={overall} />

          {/* ── ROW 3: MAIN CHARTS (SESSION & OVERALL DONUT) ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left: Check-in by Session (7 Cols) */}
            <div className="xl:col-span-7">
              <OrganizerPanel className="h-full">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-5 text-emerald-400" />
                    <h2 className="font-bold text-content text-base">{isEnglish ? 'Check-in by Session' : 'Check-in theo phiên'}</h2>
                  </div>
                  <span className="text-xs text-slate-400">{bySession.length} {isEnglish ? 'sessions' : 'phiên'}</span>
                </div>
                <SessionStackedBarChart data={bySession} />
              </OrganizerPanel>
            </div>

            {/* Right: Overall Check-in Doughnut (5 Cols) */}
            <div className="xl:col-span-5">
              <OrganizerPanel className="h-full flex flex-col justify-between">
                <div className="mb-2 flex items-center gap-2">
                  <PieChart className="size-5 text-cyan-400" />
                  <h2 className="font-bold text-content text-base">{isEnglish ? 'Overall Event Check-in' : 'Tổng thể check-in sự kiện'}</h2>
                </div>
                <div className="my-auto py-2">
                  <OverallDonutChart overall={overall} />
                </div>
              </OrganizerPanel>
            </div>
          </div>

          {/* ── ROW 4: TICKET ANALYTICS (CHECK-IN BY TICKET TYPE) ── */}
          <OrganizerPanel>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="size-5 text-amber-400" />
                <h2 className="font-bold text-content text-base">{isEnglish ? 'Check-in by Ticket Tier' : 'Check-in theo hạng vé'}</h2>
              </div>
              <span className="text-xs text-slate-400">{byTicketType.length} {isEnglish ? 'ticket tiers' : 'hạng vé'}</span>
            </div>
            <TicketTypeStackedBarChart data={byTicketType} />
          </OrganizerPanel>

          {/* ── ROW 5: CHECK-IN TREND (OVER TIME) ── */}
          <OrganizerPanel>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="size-5 text-cyan-400" />
              <h2 className="font-bold text-content text-base">{isEnglish ? 'Check-in Trend Over Time' : 'Xu hướng check-in theo thời gian'}</h2>
            </div>
            <CheckinTrendLineChart timeline={timeline} />
          </OrganizerPanel>

          {/* ── ROW 6: RECENT CHECK-IN LOGS (LAST 20) ── */}
          {recentCheckins.length > 0 && (
            <OrganizerPanel>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="size-5 text-slate-400" />
                  <h2 className="font-bold text-content text-base">{isEnglish ? 'Recent Check-in History (Last 20)' : 'Lịch sử check-in gần nhất (20 lượt)'}</h2>
                </div>
                <span className="text-xs text-slate-400 font-mono">{isEnglish ? 'Auto synced' : 'Đồng bộ tự động'}</span>
              </div>
              <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#121b33] [html.light_&]:bg-white">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[650px] text-xs">
                    <thead className="border-b border-white/10 [html.light_&]:border-slate-200 bg-[#172242] [html.light_&]:bg-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">{isEnglish ? 'Attendee' : 'Người tham dự'}</th>
                        <th className="px-4 py-3 text-left">{isEnglish ? 'Ticket Tier' : 'Hạng vé'}</th>
                        <th className="px-4 py-3 text-left">{isEnglish ? 'Session' : 'Phiên diễn'}</th>
                        <th className="px-4 py-3 text-right">{isEnglish ? 'Check-in Time' : 'Thời gian check-in'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium text-slate-300 [html.light_&]:text-slate-700">
                      {recentCheckins.map((c, i) => (
                        <tr
                          key={`${c.ticket_code}-${i}`}
                          className="hover:bg-white/[0.02] [html.light_&]:hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
                              {c.attendee_name || '—'}
                            </p>
                            <p className="text-[11px] text-slate-400">{c.attendee_email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone="blue">{c.ticket_type_name}</Badge>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{c.session_name || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1.5 text-slate-300 font-mono">
                              <Clock className="size-3 text-slate-400" />
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

          {/* Empty state when 0 total tickets sold */}
          {overall.total_tickets === 0 && (
            <OrganizerPanel className="py-14 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#C99A47]/30 bg-[#C99A47]/10 text-[#E6C17A] shadow-[0_0_20px_rgba(201,154,71,0.15)] mb-3">
                <TicketCheck className="size-6 text-[#E6C17A]" />
              </div>
              <h3 className="text-base font-bold text-content">{isEnglish ? 'No tickets have been sold for this event yet' : 'Sự kiện này chưa có vé nào được bán'}</h3>
              <p className="mt-1 text-sm text-subtle">
                {isEnglish ? 'Check-in data will appear automatically once orders are successfully paid.' : 'Dữ liệu check-in sẽ xuất hiện tự động khi có đơn hàng được thanh toán thành công.'}
              </p>
            </OrganizerPanel>
          )}
        </div>
      ) : null}
    </OrganizerPage>
  )
}
