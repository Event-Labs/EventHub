import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarCheck, Clock, DoorOpen, Layers, MapPin, QrCode, Ticket, UserCheck, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchStaffOverview } from '@/services/operations.js'
import { Badge, StaffPage, StaffPanel } from './StaffComponents.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { VI_TO_EN, translatePhrase } from '@/i18n/phraseDictionary.js'
import { cleanAndFormatVenue } from '@/i18n/eventTranslations.js'

const numberFormatter = new Intl.NumberFormat('vi-VN')

export function StaffDashboardPage() {
  const { isEnglish, t } = useLanguage()
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
        if (active) setError(err.response?.data?.message || (isEnglish ? 'Failed to load staff overview.' : 'Không thể tải tổng quan nhân sự.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadOverview()
    return () => {
      active = false
    }
  }, [isEnglish])

  const kpis = useMemo(
    () => [
      [isEnglish ? 'Assigned Events' : 'Sự kiện được giao', overview?.assigned_events, CalendarCheck],
      [isEnglish ? 'Checked-in Tickets' : 'Vé đã soát', overview?.checked_in_tickets, UserCheck],
      [isEnglish ? 'Remaining Tickets' : 'Vé chưa soát', overview?.remaining_tickets, Ticket],
    ],
    [overview, isEnglish],
  )

  const todayEvents = overview?.today_events || []

  return (
    <StaffPage
      title={isEnglish ? 'Staff Operations Overview' : 'Tổng quan Nhân sự'}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      )}

      {/* Quick shortcuts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Shortcut to="/staff/qr-check-in" icon={QrCode} label={isEnglish ? 'Scan QR Code' : 'Quét mã QR'} primary />
        <Shortcut to="/staff/manual-check-in" icon={UserPlus} label={isEnglish ? 'Manual Check-in' : 'Soát vé thủ công'} />
        <Shortcut to="/staff/direct-booking" icon={Ticket} label={isEnglish ? 'Direct Booking' : 'Đặt vé trực tiếp'} />
        <Shortcut to="/staff/check-in-count" icon={BarChart3} label={isEnglish ? 'Check-in Statistics' : 'Thống kê soát vé'} />
      </div>

      {/* KPI Cards (Chỉ có text và data) */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {kpis.map(([label, value]) => (
          <div
            key={label}
            className="glass-panel flex flex-col justify-between rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
          >
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wider text-subtle">{label}</p>
              <p className="mt-2 text-3xl font-black text-content tracking-tight font-display drop-shadow-sm">
                {loading ? '...' : numberFormatter.format(Number(value || 0))}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        <StaffPanel className="flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-content">
                {isEnglish ? "Today's Events" : 'Sự kiện hôm nay'}
              </h3>
              <p className="text-xs text-subtle">
                {isEnglish ? 'List of events scheduled today assigned to you' : 'Danh sách sự kiện đang diễn ra trong ngày có phân công cho bạn'}
              </p>
            </div>
            <Badge tone={todayEvents.length > 0 ? 'green' : 'gray'}>
              {todayEvents.length} {isEnglish ? 'events' : 'sự kiện'}
            </Badge>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center py-12 text-center text-sm font-semibold text-subtle italic">
              {isEnglish ? 'Loading data...' : 'Đang tải dữ liệu...'}
            </div>
          ) : todayEvents.length === 0 ? (
            <EmptyState message={isEnglish ? 'No assigned events scheduled for you today.' : 'Hôm nay chưa có sự kiện nào được giao cho bạn.'} />
          ) : (
            <div className="mt-5 space-y-4">
              {todayEvents.map((event) => (
                <TodayEvent key={event.id} event={event} isEnglish={isEnglish} />
              ))}
            </div>
          )}
        </StaffPanel>

        <StaffPanel>
          <h3 className="text-base font-extrabold text-content">
            {isEnglish ? 'Check-in Instructions' : 'Hướng dẫn soát vé'}
          </h3>
          <div className="mt-4 space-y-3.5 text-xs text-subtle">
            <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-3.5">
              <p className="font-bold text-content">
                {isEnglish ? '1. Check assigned gate & zone' : '1. Kiểm tra cổng & khu vực phân công'}
              </p>
              <p className="mt-1 leading-5">
                {isEnglish
                  ? 'Take your assigned gate and zone position allocated by the organizer before starting check-in.'
                  : 'Đứng đúng vị trí cổng (Gate) và khu vực (Zone) đã được ban tổ chức phân bổ trước khi bắt đầu soát vé.'}
              </p>
            </div>
            <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-3.5">
              <p className="font-bold text-content">
                {isEnglish ? '2. Scan attendee QR code' : '2. Quét mã QR khán giả'}
              </p>
              <p className="mt-1 leading-5">
                {isEnglish
                  ? 'Use device camera or barcode scanner to scan the ticket QR code on mobile or printed pass.'
                  : 'Dùng camera thiết bị hoặc máy quét để quét mã vé QR trên điện thoại hoặc vé in của khách.'}
              </p>
            </div>
            <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-3.5">
              <p className="font-bold text-content">
                {isEnglish ? '3. Manual Check-in' : '3. Soát vé thủ công'}
              </p>
              <p className="mt-1 leading-5">
                {isEnglish
                  ? 'If the QR code is blurred or unreadable, enter the 8-character ticket code or buyer email.'
                  : 'Nếu mã QR mờ hoặc hỏng, nhập trực tiếp mã vé 8 ký tự hoặc email người mua.'}
              </p>
            </div>
          </div>
        </StaffPanel>
      </div>
    </StaffPage>
  )
}

function TodayEvent({ event, isEnglish = false }) {
  const checkedIn = Number(event.checked_in || 0)
  const remaining = Number(event.remaining || 0)
  const total = Number(event.total_valid || checkedIn + remaining)
  const progress = total > 0 ? Math.min(100, Math.round((checkedIn / total) * 100)) : 0
  const eventTitle = isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title
  const venue = cleanAndFormatVenue(event, isEnglish)
  const imageSrc = event.banner_url || event.thumbnail_url

  return (
    <div className="grid gap-5 border-b border-border-soft/20 pb-5 last:border-b-0 last:pb-0 md:grid-cols-[180px_1fr]">
      <div className="grid h-32 place-items-center overflow-hidden rounded-xl bg-tertiary/15 text-primary">
        {imageSrc ? (
          <img src={imageSrc} alt={eventTitle} className="h-full w-full object-cover" />
        ) : (
          <CalendarCheck className="size-12" />
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="font-extrabold text-primary">{eventTitle}</h4>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="green">{isEnglish ? 'Today' : 'Hôm nay'}</Badge>
            {(event.session_name || (event.assigned_sessions && event.assigned_sessions.length > 0)) && (
              <Badge tone="cyan">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {event.session_name || event.assigned_sessions.map((s) => s.session_name || (isEnglish ? 'Work Shift' : 'Phiên làm việc')).join(', ')}
                </span>
              </Badge>
            )}
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
          {new Date(event.start_time).toLocaleString(isEnglish ? 'en-US' : 'vi-VN')}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
          <MapPin className="size-3.5 shrink-0" />
          {venue || (isEnglish ? 'Venue not updated' : 'Chưa cập nhật địa điểm')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-subtle">
          <span>{isEnglish ? 'Role: ' : 'Vai trò: '}<strong className="text-content">{isEnglish ? (VI_TO_EN[event.staff_role] || event.staff_role || 'Staff') : (event.staff_role || 'Nhân sự')}</strong></span>
          {event.session_name || (event.assigned_sessions && event.assigned_sessions.length > 0) ? (
            <span>• {isEnglish ? 'Shift: ' : 'Phiên: '}<strong className="text-cyan-400">{event.session_name || event.assigned_sessions.map((s) => s.session_name || (isEnglish ? 'Shift' : 'Phiên làm việc')).join(', ')}</strong></span>
          ) : (
            <span>• {isEnglish ? 'Shift: ' : 'Phiên: '}<strong className="text-content">{isEnglish ? 'Entire event' : 'Toàn bộ sự kiện'}</strong></span>
          )}
          {event.gate && (
            <span>• {isEnglish ? 'Gate: ' : 'Cổng: '}<strong className="text-primary">{event.gate}</strong></span>
          )}
          {event.zone && (
            <span>• {isEnglish ? 'Zone: ' : 'Khu vực: '}<strong className="text-amber-500">{event.zone}</strong></span>
          )}
        </div>
        <p className="mt-3 text-xs font-semibold text-content">
          {isEnglish ? 'Check-in Progress ' : 'Tiến độ soát vé '}<span className="float-right">{numberFormatter.format(checkedIn)} / {numberFormatter.format(total)}</span>
        </p>
        <div className="mt-1.5 h-2 rounded-full bg-surface">
          <div className="h-full rounded-full bg-tertiary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/staff/qr-check-in" className="admin-primary text-xs py-2">{isEnglish ? 'Start Check-in' : 'Bắt đầu soát vé'}</Link>
          <Link to={`/staff/events/${event.id}`} className="admin-secondary text-xs py-2">{isEnglish ? 'Details' : 'Chi tiết'}</Link>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message, compact = false }) {
  return (
    <div className={`flex flex-1 items-center justify-center text-center italic text-sm text-subtle ${compact ? 'py-8' : 'min-h-[220px] py-12'}`}>
      {message}
    </div>
  )
}

function Shortcut({ to, icon: Icon, label, primary }) {
  return (
    <Link
      to={to}
      className={`rounded-2xl border p-5 text-center transition-all hover:scale-[1.02] ${
        primary
          ? 'border-[#E6C17A]/40 bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-[0_4px_20px_rgba(201,154,71,0.35)]'
          : 'border-border-soft/40 bg-surface/80 text-content hover:border-[#C99A47]/40 hover:bg-panel-soft'
      }`}
    >
      <Icon className="mx-auto mb-2.5 size-6" />
      <span className="text-base font-extrabold tracking-wide">{label}</span>
    </Link>
  )
}
