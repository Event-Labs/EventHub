import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarCheck, DoorOpen, Layers, MapPin, QrCode, Ticket, UserCheck, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchStaffOverview } from '@/services/operations.js'
import { Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'

const numberFormatter = new Intl.NumberFormat('vi-VN')

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
      ['Sự kiện được giao', overview?.assigned_events, CalendarCheck],
      ['Vé đã soát', overview?.checked_in_tickets, UserCheck],
      ['Vé chưa soát', overview?.remaining_tickets, Ticket],
    ],
    [overview],
  )

  const todayEvents = overview?.today_events || []

  return (
    <StaffPage title="Tổng quan nhân sự" description="Theo dõi các sự kiện và ca soát vé hôm nay.">
      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      )}

      {/* Quick shortcuts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Shortcut to="/staff/qr-check-in" icon={QrCode} label="Quét mã QR" primary />
        <Shortcut to="/staff/manual-check-in" icon={UserPlus} label="Soát vé thủ công" />
        <Shortcut to="/staff/direct-booking" icon={Ticket} label="Đặt vé trực tiếp" />
        <Shortcut to="/staff/check-in-count" icon={BarChart3} label="Thống kê soát vé" />
      </div>

      {/* KPI Cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {kpis.map(([label, value, Icon]) => (
          <StaffPanel key={label} className="relative overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase text-subtle">{label}</p>
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-black text-content">
              {loading ? '...' : numberFormatter.format(Number(value || 0))}
            </p>
          </StaffPanel>
        ))}
      </div>

      {/* Main content */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        <StaffPanel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-content">Sự kiện hôm nay</h3>
              <p className="text-xs text-subtle">Danh sách sự kiện đang diễn ra trong ngày có phân công cho bạn</p>
            </div>
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
          <h3 className="text-base font-extrabold text-content">Hướng dẫn soát vé</h3>
          <div className="mt-4 space-y-3.5 text-xs text-subtle">
            <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-3.5">
              <p className="font-bold text-content">1. Kiểm tra cổng & khu vực phân công</p>
              <p className="mt-1 leading-5">Đứng đúng vị trí cổng (Gate) và khu vực (Zone) đã được ban tổ chức phân bổ trước khi bắt đầu soát vé.</p>
            </div>
            <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-3.5">
              <p className="font-bold text-content">2. Quét mã QR khán giả</p>
              <p className="mt-1 leading-5">Dùng camera thiết bị hoặc máy quét để quét mã vé QR trên điện thoại hoặc vé in của khách.</p>
            </div>
            <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-3.5">
              <p className="font-bold text-content">3. Soát vé thủ công</p>
              <p className="mt-1 leading-5">Nếu mã QR mờ hoặc hỏng, nhập trực tiếp mã vé 8 ký tự hoặc email người mua.</p>
            </div>
          </div>
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
      <div className="grid h-32 place-items-center overflow-hidden rounded-xl bg-tertiary/15 text-primary">
        {imageSrc ? (
          <img src={imageSrc} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <CalendarCheck className="size-12" />
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="font-extrabold text-primary">{event.title}</h4>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="green">Hôm nay</Badge>
            {event.gate && (
              <Badge tone="purple">
                <span className="flex items-center gap-1">
                  <DoorOpen className="size-3" />
                  {event.gate}
                </span>
              </Badge>
            )}
            {event.zone && (
              <Badge tone="yellow">
                <span className="flex items-center gap-1">
                  <Layers className="size-3" />
                  {event.zone}
                </span>
              </Badge>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold text-subtle">
          {new Date(event.start_time).toLocaleString('vi-VN')}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
          <MapPin className="size-3.5 shrink-0" />
          {venue || 'Chưa cập nhật địa điểm'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-subtle">
          <span>Vai trò: <strong className="text-content">{event.staff_role || 'Nhân sự'}</strong></span>
          {event.gate && (
            <span>• Cổng: <strong className="text-primary">{event.gate}</strong></span>
          )}
          {event.zone && (
            <span>• Khu vực: <strong className="text-amber-500">{event.zone}</strong></span>
          )}
        </div>
        <p className="mt-3 text-xs font-semibold text-content">
          Tiến độ soát vé <span className="float-right">{numberFormatter.format(checkedIn)} / {numberFormatter.format(total)}</span>
        </p>
        <div className="mt-1.5 h-2 rounded-full bg-surface">
          <div className="h-full rounded-full bg-tertiary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/staff/qr-check-in" className="admin-primary text-xs py-2">Bắt đầu soát vé</Link>
          <Link to={`/staff/events/${event.id}`} className="admin-secondary text-xs py-2">Chi tiết</Link>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message, compact = false }) {
  return (
    <div className={`rounded-xl border border-border-soft/30 bg-panel-soft/40 text-sm font-semibold text-subtle ${compact ? 'mt-4 p-4' : 'mt-5 p-5'}`}>
      {message}
    </div>
  )
}

function Shortcut({ to, icon: Icon, label, primary }) {
  return (
    <Link
      to={to}
      className={`rounded-2xl border p-5 text-center font-bold transition-all hover:scale-[1.02] ${
        primary
          ? 'border-primary/40 bg-tertiary text-white shadow-[0_4px_20px_rgba(43,92,146,0.3)]'
          : 'border-border-soft/40 bg-surface/80 text-content hover:border-tertiary hover:bg-panel-soft'
      }`}
    >
      <Icon className="mx-auto mb-2.5 size-6" />
      <span className="text-sm">{label}</span>
    </Link>
  )
}
