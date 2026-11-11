import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock3, DoorOpen, Layers, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchAssignedStaffEvents } from '@/services/operations.js'
import { Badge, StaffPage, StaffPanel, StaffSearch } from './StaffComponents.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { cleanAndFormatVenue } from '@/i18n/eventTranslations.js'
import { translatePhrase } from '@/i18n/phraseDictionary.js'

const STAFF_ROLE_LABELS = {
  staff: { vi: 'Nhân sự', en: 'Staff' },
  checkin: { vi: 'Nhân sự soát vé', en: 'Check-in Staff' },
  check_in: { vi: 'Nhân sự soát vé', en: 'Check-in Staff' },
  supervisor: { vi: 'Giám sát viên', en: 'Supervisor' },
  security: { vi: 'Nhân viên an ninh', en: 'Security' },
}

function staffRoleLabel(role, isEnglish) {
  if (!role) return isEnglish ? 'Staff' : 'Nhân sự'
  const mapping = STAFF_ROLE_LABELS[String(role).toLowerCase()]
  if (!mapping) return role
  return isEnglish ? mapping.en : mapping.vi
}

export function StaffEventsPage({ empty = false }) {
  const { isEnglish } = useLanguage()
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
        if (active) setError(err.response?.data?.message || (isEnglish ? 'Failed to load assigned events.' : 'Không thể tải sự kiện được giao.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadEvents()
    return () => {
      active = false
    }
  }, [isEnglish])

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(timerId)
  }, [])

  const filteredEvents = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return events
    return events.filter((event) => {
      const title = String(event.title || '').toLowerCase()
      const enTitle = String(translatePhrase(event.title, 'en') || '').toLowerCase()
      const venue = String(event.venue_name || '').toLowerCase()
      return title.includes(normalized) || enTitle.includes(normalized) || venue.includes(normalized)
    })
  }, [events, keyword])

  if (empty) {
    return <NoAssignedEventsPage isEnglish={isEnglish} />
  }

  return (
    <StaffPage
      title={isEnglish ? 'Assigned Events' : 'Sự kiện được giao'}
      action={
        <div className="w-full sm:w-72">
          <StaffSearch
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={isEnglish ? 'Search events, venues...' : 'Tìm kiếm sự kiện, địa điểm...'}
          />
        </div>
      }
    >
      {error && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/10 p-4 text-sm font-semibold text-error">
          {error}
        </div>
      )}

      {loading ? (
        <StaffPanel>{isEnglish ? 'Loading data...' : 'Đang tải dữ liệu...'}</StaffPanel>
      ) : filteredEvents.length === 0 ? (
        <NoAssignedEventsPage isEnglish={isEnglish} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <AssignedEventCard key={event.id} event={event} currentTime={currentTime} isEnglish={isEnglish} />
          ))}
        </div>
      )}
    </StaffPage>
  )
}

function AssignedEventCard({ event, currentTime, isEnglish }) {
  const checkedIn = Number(event.checked_in || 0)
  const totalValid = Number(event.total_valid || 0)
  const progress = totalValid > 0 ? Math.min(100, Math.round((checkedIn / totalValid) * 100)) : 0
  const checkinStart = new Date(event.checkin_start_time || event.start_time).getTime()
  const isCheckInOpen = Number.isFinite(checkinStart) && currentTime >= checkinStart
  const statusTone = isCheckInOpen ? 'green' : 'yellow'
  const eventTitle = isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title
  const venue = cleanAndFormatVenue(event, isEnglish)
  const imageSrc = event.banner_url || event.thumbnail_url

  return (
    <StaffPanel className="flex h-full flex-col">
      <div className="mb-4 grid h-36 shrink-0 place-items-center overflow-hidden rounded-md bg-tertiary/15 text-tertiary">
        {imageSrc ? (
          <img src={imageSrc} alt={eventTitle} className="h-full w-full object-cover" />
        ) : (
          <Calendar className="size-12" />
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-h-12 min-w-0 break-words font-extrabold leading-6">{eventTitle}</h3>
          <span className="shrink-0">
            <Badge tone={statusTone}>
              {isCheckInOpen
                ? (isEnglish ? 'Check-in Open' : 'Đã mở check-in')
                : (isEnglish ? 'Check-in Not Started' : 'Chưa đến giờ check-in')}
            </Badge>
          </span>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-subtle">
          <Calendar className="mt-0.5 size-4 shrink-0" />
          <span>{new Date(event.start_time).toLocaleString(isEnglish ? 'en-US' : 'vi-VN')}</span>
        </p>
        <p className="mt-2 flex items-start gap-2 text-sm leading-5 text-subtle">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{venue || (isEnglish ? 'Venue TBD' : 'Chưa cập nhật địa điểm')}</span>
        </p>
        
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="blue">
            {isEnglish ? 'Role: ' : 'Vai trò: '}{staffRoleLabel(event.staff_role, isEnglish)}
          </Badge>
          {event.session_name || (event.assigned_sessions && event.assigned_sessions.length > 0) ? (
            <Badge tone="cyan">
              <span className="flex items-center gap-1">
                <Clock3 className="size-3" />
                {event.session_name || event.assigned_sessions.map((s) => s.session_name || (isEnglish ? 'Session' : 'Phiên làm việc')).join(', ')}
              </span>
            </Badge>
          ) : (
            <Badge tone="slate">{isEnglish ? 'Full Event' : 'Toàn bộ sự kiện'}</Badge>
          )}
          {event.gate ? (
            <Badge tone="purple">
              <span className="flex items-center gap-1">
                <DoorOpen className="size-3" />
                {event.gate}
              </span>
            </Badge>
          ) : (
            <Badge tone="gray">{isEnglish ? 'All Gates' : 'Tất cả cổng'}</Badge>
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

        <CheckInAvailability
          checkinStartTime={event.checkin_start_time || event.start_time}
          currentTime={currentTime}
          isOpen={isCheckInOpen}
          isEnglish={isEnglish}
        />

        <div className="mt-auto pt-5">
          <p className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>{isEnglish ? 'Check-in Progress' : 'Tiến độ soát vé'}</span>
            <span className="shrink-0">{checkedIn} / {totalValid}</span>
          </p>
          <div className="mt-2 h-2 rounded bg-panel-soft">
            <div className="h-full rounded bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 flex gap-3">
            {isCheckInOpen ? (
              <Link to="/staff/qr-check-in" className="admin-primary flex-1">{isEnglish ? 'Check-in' : 'Check-in'}</Link>
            ) : (
              <button
                type="button"
                className="admin-primary flex-1 cursor-not-allowed opacity-50"
                disabled
                title={isEnglish ? 'Check-in window not yet opened by organizer' : 'Chưa đến giờ check-in do ban tổ chức thiết lập'}
              >
                Check-in
              </button>
            )}
            <Link to={`/staff/events/${event.id}`} className="admin-secondary flex-1">
              {isEnglish ? 'Details' : 'Chi tiết'}
            </Link>
          </div>
        </div>
      </div>
    </StaffPanel>
  )
}

function CheckInAvailability({ checkinStartTime, currentTime, isOpen, isEnglish }) {
  const targetTime = new Date(checkinStartTime).getTime()

  if (!Number.isFinite(targetTime)) {
    return (
      <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm font-semibold text-warning">
        {isEnglish ? 'Check-in time not specified.' : 'Chưa xác định giờ check-in.'}
      </div>
    )
  }

  const formattedStart = new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(targetTime))

  if (isOpen) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
        <Clock3 className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-extrabold">{isEnglish ? 'Check-in is Open' : 'Đã đến giờ check-in'}</p>
          <p className="mt-0.5 text-xs font-semibold">{isEnglish ? `Opened since ${formattedStart}` : `Mở từ ${formattedStart}`}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <Clock3 className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-extrabold">{isEnglish ? 'Check-in Not Started' : 'Chưa đến giờ check-in'}</p>
        <p className="mt-0.5 text-xs font-semibold">{isEnglish ? `Opens at ${formattedStart}` : `Mở lúc ${formattedStart}`}</p>
        <p className="mt-1 font-mono text-sm font-extrabold tabular-nums">
          {isEnglish ? 'Opens in ' : 'Còn '}{formatCheckInCountdown(targetTime - currentTime, isEnglish)}
        </p>
      </div>
    </div>
  )
}

function formatCheckInCountdown(remainingMs, isEnglish) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (totalSeconds <= 86400) {
    const totalHours = Math.floor(totalSeconds / 3600)
    return `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  if (isEnglish) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
  }
  return `${days} ngày ${String(hours).padStart(2, '0')} giờ ${String(minutes).padStart(2, '0')} phút`
}

export function NoAssignedEventsPage({ isEnglish }) {
  return (
    <div className="grid min-h-[calc(100vh-140px)] place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-32 place-items-center rounded-md bg-panel-soft text-muted">
          <Calendar className="size-16" />
        </div>
        <h1 className="mt-6 text-xl font-extrabold text-content">
          {isEnglish ? 'No Assigned Events' : 'Chưa có sự kiện được giao'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-subtle">
          {isEnglish
            ? 'You have not been assigned to any events. Please contact the organizer if this is a mistake.'
            : 'Bạn chưa được phân công vào sự kiện nào. Vui lòng liên hệ ban tổ chức nếu có nhầm lẫn.'}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/" className="admin-primary">
            {isEnglish ? 'Back to Customer Site' : 'Về trang khách hàng'}
          </Link>
        </div>
      </div>
    </div>
  )
}
