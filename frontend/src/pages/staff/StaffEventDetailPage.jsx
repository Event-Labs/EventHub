import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Armchair, Calendar, Loader2, MapPin, RefreshCw, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { fetchSessionSeats } from '@/services/events.js'
import { fetchStaffCheckInReport } from '@/services/operations.js'
import { Avatar, Badge, StaffPage, StaffPanel, StaffTable } from './StaffComponents.jsx'
import { SeatMapCanvas } from './StaffDirectBookingPage.jsx'

const numberFormatter = new Intl.NumberFormat('vi-VN')

const EVENT_STATUS_LABELS = {
  PUBLISHED: 'Đã xuất bản',
  COMPLETED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Date(value).toLocaleString('vi-VN')
}

function checkInMethodLabel(method) {
  return method === 'QR' ? 'Quét mã QR' : 'Thủ công'
}

export function StaffEventDetailPage() {
  const { eventId } = useParams()
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const reportQuery = useQuery({
    queryKey: ['staff-check-in-report', eventId],
    queryFn: () => fetchStaffCheckInReport(eventId),
    enabled: Boolean(eventId),
  })
  const eventSessions = reportQuery.data?.event?.sessions || []
  const seatedSessions = eventSessions.filter((session) => session.seat_map_id)
  const effectiveSessionId = seatedSessions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : seatedSessions[0]?.id || ''

  const seatsQuery = useQuery({
    queryKey: ['staff-event-seat-map', effectiveSessionId],
    queryFn: () => fetchSessionSeats(effectiveSessionId),
    enabled: Boolean(effectiveSessionId),
  })

  if (reportQuery.isLoading) {
    return <StaffPanel>Đang tải dữ liệu sự kiện...</StaffPanel>
  }

  if (reportQuery.isError || !reportQuery.data?.event) {
    return (
      <StaffPage title="Không thể tải sự kiện" description="Dữ liệu sự kiện không khả dụng hoặc bạn không có quyền truy cập.">
        <StaffPanel>
          <p className="text-sm font-semibold text-error">
            {reportQuery.error?.response?.data?.message || 'Không tìm thấy dữ liệu sự kiện.'}
          </p>
          <Link to="/staff/events" className="admin-secondary mt-5 inline-flex">Quay lại danh sách sự kiện</Link>
        </StaffPanel>
      </StaffPage>
    )
  }

  const report = reportQuery.data
  const event = report.event
  const summary = report.summary || {}
  const totalValid = Number(summary.total_valid || 0)
  const checkedIn = Number(summary.checked_in || 0)
  const remaining = Number(summary.remaining || 0)
  const cancelled = Number(summary.cancelled || 0)
  const progress = totalValid > 0 ? Math.round((checkedIn / totalValid) * 100) : 0
  const venue = [event.venue_name, event.address_line, event.ward, event.district, event.city].filter(Boolean).join(', ')

  return (
    <StaffPage
      title={event.title}
      description="Chi tiết vận hành sự kiện được giao."
      action={(
        <button className="admin-primary" onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}>
          <RefreshCw className={`size-4 ${reportQuery.isFetching ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      )}
    >
      <StaffPanel className="mb-5">
        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
          <div className="grid h-36 place-items-center overflow-hidden rounded-lg bg-panel-soft text-primary">
            {event.banner_url || event.thumbnail_url ? (
              <img src={event.banner_url || event.thumbnail_url} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <Calendar className="size-12" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Badge tone="green">{EVENT_STATUS_LABELS[event.status] || 'Chưa xác định'}</Badge>
              <Badge tone="blue">Vai trò: {event.staff_role || 'Nhân sự'}</Badge>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-subtle">
              <Calendar className="size-4" />
              {formatDateTime(event.start_time)} - {formatDateTime(event.end_time)}
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm text-subtle">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {venue || 'Chưa cập nhật địa điểm'}
            </p>
            {event.short_description && <p className="mt-4 text-sm leading-6 text-content">{event.short_description}</p>}
          </div>
        </div>
      </StaffPanel>

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        {[
          ['Tổng vé hợp lệ', totalValid],
          ['Đã soát vé', checkedIn],
          ['Chưa soát', remaining],
          ['Vé đã hủy', cancelled],
        ].map(([label, value]) => (
          <StaffPanel key={label}>
            <p className="text-xs font-bold uppercase text-muted">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-content">{numberFormatter.format(value)}</p>
          </StaffPanel>
        ))}
      </div>

      <StaffPanel>
        <div className="mb-3 flex justify-between text-sm font-bold text-content">
          <span>Tiến độ soát vé</span>
          <span>{progress}%</span>
        </div>
        <div className="h-3 rounded bg-panel-soft">
          <div className="h-full rounded bg-success transition-all" style={{ width: `${progress}%` }} />
        </div>
      </StaffPanel>

      <StaffPanel className="mt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-content">
              <Armchair className="size-5 text-primary" />
              Sơ đồ sự kiện
            </h3>
            <p className="mt-1 text-sm text-subtle">Sơ đồ ghế và trạng thái chỗ ngồi theo dữ liệu hiện tại.</p>
          </div>
          {seatedSessions.length > 1 && (
            <select
              value={effectiveSessionId}
              onChange={(changeEvent) => setSelectedSessionId(changeEvent.target.value)}
              className="h-10 min-w-64 rounded-md border border-border-soft/40 bg-panel-soft px-3 text-sm font-bold text-content outline-none focus:border-primary"
            >
              {seatedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name || formatDateTime(session.start_time)}
                </option>
              ))}
            </select>
          )}
        </div>

        {seatedSessions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-border-soft/40 bg-panel-soft/40 px-5 py-8 text-center">
            <Armchair className="mx-auto size-10 text-muted" />
            <p className="mt-3 text-sm font-semibold text-subtle">Sự kiện này không sử dụng sơ đồ ghế.</p>
          </div>
        ) : seatsQuery.isLoading ? (
          <div className="mt-5 flex items-center justify-center gap-2 py-10 text-sm text-subtle">
            <Loader2 className="size-5 animate-spin" />
            Đang tải sơ đồ sự kiện...
          </div>
        ) : seatsQuery.isError ? (
          <p className="mt-5 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
            {seatsQuery.error?.response?.data?.message || 'Không thể tải sơ đồ sự kiện.'}
          </p>
        ) : (
          <EventSeatMap data={seatsQuery.data} />
        )}
      </StaffPanel>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <StaffPanel>
          <h3 className="font-bold text-content">Thống kê theo loại vé</h3>
          {(report.ticket_types || []).length === 0 ? (
            <p className="mt-4 text-sm text-muted">Chưa có dữ liệu loại vé.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {report.ticket_types.map((type) => (
                <div key={type.id} className="rounded-lg border border-border-soft/30 bg-panel-soft p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-content">{type.name}</span>
                    <span className="text-muted">{type.checked_in}/{type.total_valid} vé</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StaffPanel>

        <StaffPanel>
          <h3 className="flex items-center gap-2 font-bold text-content"><Users className="size-4" />Nhân sự sự kiện</h3>
          {(report.assigned_staff || []).length === 0 ? (
            <p className="mt-4 text-sm text-muted">Chưa có nhân sự được phân công.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {report.assigned_staff.map((staff) => (
                <div key={staff.id} className="flex items-center gap-3">
                  <Avatar name={staff.full_name || staff.email} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-content">{staff.full_name || staff.email}</p>
                    <p className="truncate text-xs text-muted">{staff.staff_role || 'Nhân sự'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </StaffPanel>
      </div>

      <div className="mt-5">
        <StaffTable
          headers={['Thời gian', 'Người tham dự', 'Loại vé', 'Phương thức', 'Nhân sự thực hiện']}
          rows={(report.recent_checkins || []).map((item) => [
            formatDateTime(item.checked_in_at),
            item.attendee_name,
            item.ticket_type_name,
            checkInMethodLabel(item.method),
            item.checked_in_by_name || 'Chưa xác định',
          ])}
        />
      </div>
    </StaffPage>
  )
}

function EventSeatMap({ data }) {
  const seats = data?.seats || []

  if (seats.length === 0) {
    return <p className="mt-5 rounded-lg bg-panel-soft px-5 py-6 text-center text-sm text-muted">Sơ đồ chưa có dữ liệu ghế.</p>
  }

  return (
    <div className="mt-5">
      <SeatMapCanvas
        seats={seats}
        ticketTypes={data?.ticket_types || []}
        selectedSeatIds={[]}
        seatMap={data?.seat_map}
        readOnly
        centered
      />
    </div>
  )
}
