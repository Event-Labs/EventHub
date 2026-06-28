import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchOrganizerFeedbackEvents,
  fetchOrganizerFeedbackReport,
} from '@/services/feedbacks.js'
import {
  OrganizerPage,
  OrganizerPanel,
  OrganizerTable,
} from './OrganizerComponents.jsx'

function RatingStars({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`size-4 ${
            star <= value ? 'fill-amber-400 text-amber-400' : 'text-border-soft/40'
          }`}
        />
      ))}
    </div>
  )
}

export function OrganizerFeedbackReportPage() {
  const [eventId, setEventId] = useState('')

  const eventsQuery = useQuery({
    queryKey: ['organizer-feedback-events'],
    queryFn: fetchOrganizerFeedbackEvents,
  })

  const events = eventsQuery.data || []

  useEffect(() => {
    if (!eventId && events.length > 0) {
      setEventId(events[0].id)
    }
  }, [events, eventId])

  const reportQuery = useQuery({
    queryKey: ['organizer-feedback-report', eventId],
    queryFn: () => fetchOrganizerFeedbackReport(eventId),
    enabled: Boolean(eventId),
  })

  const report = reportQuery.data
  const summary = report?.summary
  const distribution = summary?.distribution || {}

  return (
    <OrganizerPage
      title="Báo cáo phản hồi"
      description="Theo dõi đánh giá và nhận xét từ khách tham dự (dữ liệu từ database)"
    >
      <OrganizerPanel className="mb-5">
        {eventsQuery.isLoading && (
          <p className="text-sm text-muted animate-pulse">Đang tải sự kiện...</p>
        )}
        {eventsQuery.isError && (
          <p className="text-sm text-error">Không thể tải danh sách sự kiện.</p>
        )}
        {!eventsQuery.isLoading && events.length === 0 && (
          <p className="text-sm text-muted">
            Bạn chưa có sự kiện nào trong hệ thống.
          </p>
        )}
        {events.length > 0 && (
          <label className="block max-w-xl">
            <span className="text-sm font-semibold text-subtle">Chọn sự kiện</span>
            <select
              className="mt-2 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              {events.map((event) => (
                <option key={event.id} value={event.id} className="bg-surface text-content">
                  {event.title}
                  {event.average_rating != null
                    ? ` — ★ ${event.average_rating} (${event.feedback_count})`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </OrganizerPanel>

      {reportQuery.isLoading && eventId && (
        <OrganizerPanel className="animate-pulse">Đang tải báo cáo...</OrganizerPanel>
      )}

      {reportQuery.isError && (
        <OrganizerPanel className="text-error">Không thể tải báo cáo phản hồi.</OrganizerPanel>
      )}

      {report && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Tổng phản hồi" value={summary.total_feedbacks} />
            <Kpi
              label="Điểm trung bình"
              value={summary.average_rating != null ? `${summary.average_rating}/5` : '—'}
            />
            <Kpi
              label="Hài lòng (4–5★)"
              value={
                summary.satisfaction_percent != null
                  ? `${summary.satisfaction_percent}%`
                  : '—'
              }
            />
            <Kpi label="Trạng thái sự kiện" value={report.event.status} />
          </div>

          <OrganizerPanel className="mb-5 text-content">
            <h3 className="font-bold text-content">Phân bố đánh giá</h3>
            <div className="mt-4 space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star] || 0
                const total = summary.total_feedbacks || 1
                const width = summary.total_feedbacks
                  ? `${Math.round((count / total) * 100)}%`
                  : '0%'
                return (
                  <div key={star} className="flex items-center gap-3 text-sm">
                    <span className="w-8 font-semibold">{star}★</span>
                    <div className="h-2 flex-1 rounded-full bg-panel-soft border border-border-soft/10">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width }}
                      />
                    </div>
                    <span className="w-10 text-right text-muted">{count}</span>
                  </div>
                )
              })}
            </div>
          </OrganizerPanel>

          <OrganizerTable
            headers={['Khách hàng', 'Đánh giá', 'Nội dung', 'Thời gian']}
            rows={(report.feedbacks || []).map((item) => [
              <div key="user" className="text-content">
                <p className="font-semibold">{item.user?.full_name || '—'}</p>
                <p className="text-xs text-muted">{item.user?.email}</p>
              </div>,
              <RatingStars key="rating" value={item.rating} />,
              <p key="content" className="max-w-md text-sm text-subtle">
                {item.content}
              </p>,
              <span key="time" className="text-sm text-muted whitespace-nowrap">
                {new Date(item.created_at).toLocaleString('vi-VN')}
              </span>,
            ])}
          />

          {report.feedbacks?.length === 0 && (
            <p className="mt-4 text-sm text-muted text-center py-4 bg-panel-soft/30 rounded-xl border border-border-soft/20">
              Chưa có phản hồi nào cho sự kiện này.
            </p>
          )}
        </>
      )}
    </OrganizerPage>
  )
}

function Kpi({ label, value }) {
  return (
    <OrganizerPanel className="min-h-24 flex flex-col justify-between">
      <p className="text-xs font-bold text-muted uppercase tracking-wider">{label}</p>
      <p className="mt-3 text-2xl font-extrabold text-content">{value}</p>
    </OrganizerPanel>
  )
}
