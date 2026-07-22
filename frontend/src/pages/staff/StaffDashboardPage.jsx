import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, ClipboardCheck, MapPin, QrCode, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchStaffOverview } from '@/services/operations.js'
import { Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'

const numberFormatter = new Intl.NumberFormat('vi-VN')

const taskStatus = {
  TODO: { label: 'Chưa làm', tone: 'gray' },
  IN_PROGRESS: { label: 'Đang làm', tone: 'yellow' },
  DONE: { label: 'Đã hoàn thành', tone: 'green' },
}

export function StaffDashboardPage() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadOverview() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchStaffOverview()
        if (active) setOverview(data)
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Không thể tải tổng quan nhân sự.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadOverview()
    return () => {
      active = false
    }
  }, [])

  const kpis = useMemo(
    () => [
      ['Sự kiện được giao', overview?.assigned_events],
      ['Công việc được giao', overview?.assigned_tasks],
      ['Đã hoàn thành', overview?.completed_tasks],
      ['Đang chờ', overview?.pending_tasks],
      ['Vé đã soát', overview?.checked_in_tickets],
      ['Còn lại', overview?.remaining_tickets],
    ],
    [overview],
  )

  const todayEvents = overview?.today_events || []
  const activeTasks = overview?.active_tasks || []

  return (
    <StaffPage title="Tổng quan nhân sự" description="Theo dõi công việc vận hành hôm nay.">


      <div className="grid gap-4 md:grid-cols-3">
        <Shortcut to="/staff/qr-check-in" icon={QrCode} label="Quét QR" primary />
        <Shortcut to="/staff/manual-check-in" icon={UserPlus} label="Soát vé thủ công" />
        <Shortcut to="/staff/tasks" icon={ClipboardCheck} label="Công việc" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value]) => (
          <StaffPanel key={label}>
            <p className="text-xs font-bold uppercase text-subtle">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-content">
              {loading ? '...' : numberFormatter.format(Number(value || 0))}
            </p>
          </StaffPanel>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
        <StaffPanel>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold text-content">Sự kiện hôm nay</h3>
            <Badge tone={todayEvents.length > 0 ? 'green' : 'gray'}>{todayEvents.length} sự kiện</Badge>
          </div>

          {loading ? (
            <p className="mt-5 text-sm font-semibold text-subtle">Đang tải dữ liệu...</p>
          ) : todayEvents.length === 0 ? (
            <EmptyState message="Hôm nay chưa có sự kiện nào được giao cho bạn." />
          ) : (
            <div className="mt-5 space-y-4">
              {todayEvents.map((event) => (
                <TodayEvent key={event.id} event={event} />
              ))}
            </div>
          )}
        </StaffPanel>

        <StaffPanel>
          <h3 className="font-bold text-content">Công việc đang hoạt động</h3>
          {loading ? (
            <p className="mt-5 text-sm font-semibold text-subtle">Đang tải dữ liệu...</p>
          ) : activeTasks.length === 0 ? (
            <EmptyState message="Không có công việc đang chờ xử lý." compact />
          ) : (
            activeTasks.map((task) => {
              const config = taskStatus[task.status] || taskStatus.TODO
              return (
                <div key={task.id} className="border-b border-border-soft/20 py-4 last:border-b-0 last:pb-0">
                  <Badge tone={config.tone}>{config.label}</Badge>
                  <p className="mt-3 font-bold text-content">{task.title}</p>
                  <p className="mt-1 text-sm text-subtle">{task.event_title}</p>
                </div>
              )
            })
          )}
        </StaffPanel>
      </div>
    </StaffPage>
  )
}

function TodayEvent({ event }) {
  const checkedIn = Number(event.checked_in || 0)
  const remaining = Number(event.remaining || 0)
  const total = Number(event.total_valid || checkedIn + remaining)
  const progress = total > 0 ? Math.min(100, Math.round((checkedIn / total) * 100)) : 0
  const venue = [event.venue_name, event.address_line, event.district, event.city].filter(Boolean).join(', ')
  const imageSrc = event.banner_url || event.thumbnail_url

  return (
    <div className="grid gap-5 border-b border-border-soft/20 pb-5 last:border-b-0 last:pb-0 md:grid-cols-[180px_1fr]">
      <div className="grid h-32 place-items-center overflow-hidden rounded-md bg-tertiary/15 text-primary">
        {imageSrc ? (
          <img src={imageSrc} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <CalendarCheck className="size-12" />
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h4 className="font-extrabold text-primary">{event.title}</h4>
          <Badge tone="green">Hôm nay</Badge>
        </div>
        <p className="mt-2 text-sm text-subtle">{new Date(event.start_time).toLocaleString('vi-VN')}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-subtle">
          <MapPin className="size-4 shrink-0" />
          {venue || 'Chưa cập nhật địa điểm'}
        </p>
        <p className="mt-4 text-sm font-semibold text-content">
          Soát vé <span className="float-right">{numberFormatter.format(checkedIn)} / {numberFormatter.format(total)}</span>
        </p>
        <div className="mt-2 h-2 rounded-full bg-surface">
          <div className="h-full rounded-full bg-tertiary" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/staff/qr-check-in" className="admin-primary">Bắt đầu soát vé</Link>
          <Link to="/staff/events" className="admin-secondary">Xem sự kiện</Link>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message, compact = false }) {
  return (
    <div className={`rounded-md border border-border-soft/30 bg-panel-soft/40 text-sm font-semibold text-subtle ${compact ? 'mt-4 p-4' : 'mt-5 p-5'}`}>
      {message}
    </div>
  )
}

function Shortcut({ to, icon: Icon, label, primary }) {
  return (
    <Link
      to={to}
      className={`rounded-md border p-6 text-center font-bold transition-all hover:scale-[1.02] ${primary
          ? 'border-primary/40 bg-tertiary text-white shadow-[0_4px_20px_rgba(43,92,146,0.3)]'
          : 'border-border-soft/40 bg-surface/80 text-content hover:border-tertiary hover:bg-panel-soft'
        }`}
    >
      <Icon className="mx-auto mb-3 size-7" />
      {label}
    </Link>
  )
}
