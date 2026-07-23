import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock3, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchAssignedStaffEvents } from '@/services/operations.js'
import { Badge, StaffPage, StaffPanel, StaffSearch } from './StaffComponents.jsx'

const STAFF_ROLE_LABELS = {
  staff: 'Nhân sự',
  checkin: 'Nhân sự soát vé',
  check_in: 'Nhân sự soát vé',
  supervisor: 'Giám sát viên',
  security: 'Nhân viên an ninh',
}

function staffRoleLabel(role) {
  if (!role) return 'Nhân sự'
  return STAFF_ROLE_LABELS[String(role).toLowerCase()] || role
}

export function StaffEventsPage({ empty = false }) {
  const [events, setEvents] = useState([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    let active = true

    async function loadEvents() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchAssignedStaffEvents()
        if (active) {
          setEvents(data)
          setCurrentTime(Date.now())
        }
      } catch (err) {
        if (active) setError(err.response?.data?.message || 'Không thể tải sự kiện được giao.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadEvents()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(timerId)
  }, [])

  const filteredEvents = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return events
    return events.filter((event) => {
      const venue = [event.venue_name, event.address_line, event.district, event.city].filter(Boolean).join(' ')
      return `${event.title} ${venue} ${event.staff_role || ''}`.toLowerCase().includes(normalized)
    })
  }, [events, keyword])

  if (empty) return <NoAssignedEventsPage />

  return (
    <StaffPage title="Sự kiện được giao" description="Quản lý ca soát vé cho các sự kiện sắp tới.">
      {error && <div className="mb-4 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <div onChange={(event) => setKeyword(event.target.value)}>
          <StaffSearch placeholder="Tìm theo tên sự kiện, địa điểm..." />
        </div>
        <select className="h-10 rounded-md border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary">
          <option>Tất cả vai trò</option>
        </select>
      </div>

      {loading ? (
        <StaffPanel>Đang tải dữ liệu...</StaffPanel>
      ) : filteredEvents.length === 0 ? (
        <NoAssignedEventsPage />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <AssignedEventCard key={event.id} event={event} currentTime={currentTime} />
          ))}
        </div>
      )}
    </StaffPage>
  )
}

function AssignedEventCard({ event, currentTime }) {
  const checkedIn = Number(event.checked_in || 0)
  const totalValid = Number(event.total_valid || 0)
  const progress = totalValid > 0 ? Math.min(100, Math.round((checkedIn / totalValid) * 100)) : 0
  const checkinStart = new Date(event.checkin_start_time || event.start_time).getTime()
  const isCheckInOpen = Number.isFinite(checkinStart) && currentTime >= checkinStart
  const statusTone = isCheckInOpen ? 'green' : 'yellow'
  const venue = [event.venue_name, event.address_line, event.district, event.city].filter(Boolean).join(', ')
  const imageSrc = event.banner_url || event.thumbnail_url

  return (
    <StaffPanel className="flex h-full flex-col">
      <div className="mb-4 grid h-36 shrink-0 place-items-center overflow-hidden rounded-md bg-tertiary/15 text-tertiary">
        {imageSrc ? (
          <img src={imageSrc} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <Calendar className="size-12" />
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-h-12 min-w-0 break-words font-extrabold leading-6">{event.title}</h3>
          <span className="shrink-0">
            <Badge tone={statusTone}>{isCheckInOpen ? 'Đã mở check-in' : 'Chưa đến giờ check-in'}</Badge>
          </span>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-subtle">
          <Calendar className="mt-0.5 size-4 shrink-0" />
          <span>{new Date(event.start_time).toLocaleString('vi-VN')}</span>
        </p>
        <p className="mt-2 flex items-start gap-2 text-sm leading-5 text-subtle">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{venue || 'Chưa cập nhật địa điểm'}</span>
        </p>
        <p className="mt-3 break-words text-sm font-semibold text-subtle">Vai trò: {staffRoleLabel(event.staff_role)}</p>
        <CheckInAvailability
          checkinStartTime={event.checkin_start_time || event.start_time}
          currentTime={currentTime}
          isOpen={isCheckInOpen}
        />

        <div className="mt-auto pt-5">
          <p className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>Tiến độ soát vé</span>
            <span className="shrink-0">{checkedIn} / {totalValid}</span>
          </p>
          <div className="mt-2 h-2 rounded bg-panel-soft">
            <div className="h-full rounded bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 flex gap-3">
            {isCheckInOpen ? (
              <Link to="/staff/qr-check-in" className="admin-primary flex-1">Check-in</Link>
            ) : (
              <button
                type="button"
                className="admin-primary flex-1 cursor-not-allowed opacity-50"
                disabled
                title="Chưa đến giờ check-in do ban tổ chức thiết lập"
              >
                Check-in
              </button>
            )}
            <Link to={`/staff/events/${event.id}`} className="admin-secondary flex-1">Chi tiết</Link>
          </div>
        </div>
      </div>
    </StaffPanel>
  )
}

function CheckInAvailability({ checkinStartTime, currentTime, isOpen }) {
  const targetTime = new Date(checkinStartTime).getTime()

  if (!Number.isFinite(targetTime)) {
    return (
      <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm font-semibold text-warning">
        Chưa xác định giờ check-in.
      </div>
    )
  }

  const formattedStart = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(targetTime))

  if (isOpen) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
        <Clock3 className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-extrabold">Đã đến giờ check-in</p>
          <p className="mt-0.5 text-xs font-semibold">Mở từ {formattedStart}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <Clock3 className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-extrabold">Chưa đến giờ check-in</p>
        <p className="mt-0.5 text-xs font-semibold">Mở lúc {formattedStart}</p>
        <p className="mt-1 font-mono text-sm font-extrabold tabular-nums">
          Còn {formatCheckInCountdown(targetTime - currentTime)}
        </p>
      </div>
    </div>
  )
}

function formatCheckInCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (totalSeconds <= 86400) {
    const totalHours = Math.floor(totalSeconds / 3600)
    return `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${days} ngày ${String(hours).padStart(2, '0')} giờ ${String(minutes).padStart(2, '0')} phút`
}

export function NoAssignedEventsPage() {
  return (
    <div className="grid min-h-[calc(100vh-140px)] place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-32 place-items-center rounded-md bg-panel-soft text-muted">
          <Calendar className="size-16" />
        </div>
        <h1 className="mt-6 text-xl font-extrabold text-content">Chưa có sự kiện được giao</h1>
        <p className="mt-3 text-sm leading-6 text-subtle">
          Bạn chưa được phân công vào sự kiện nào. Vui lòng liên hệ ban tổ chức nếu có nhầm lẫn.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link to="/staff/qr-check-in" className="admin-primary opacity-60">Quét QR</Link>
          <button className="admin-secondary" onClick={() => window.location.reload()}>Làm mới</button>
        </div>
      </div>
    </div>
  )
}
