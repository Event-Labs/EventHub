import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import {
  fetchEligibleFeedbackEvents,
  submitEventFeedback,
} from '@/services/feedbacks.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function FeedbackPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = hasAuthSession()

  const [eventId, setEventId] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const eligibleQuery = useQuery({
    queryKey: ['feedback-eligible-events'],
    queryFn: fetchEligibleFeedbackEvents,
    enabled: isAuthenticated,
  })

  const events = eligibleQuery.data || []

  useEffect(() => {
    if (!eventId && events.length > 0) {
      setEventId(events[0].id)
    }
  }, [events, eventId])

  const submitMutation = useMutation({
    mutationFn: submitEventFeedback,
    onSuccess: () => {
      toast.success('Cảm ơn bạn! Phản hồi đã được gửi thành công.')
      setContent('')
      setRating(0)
      queryClient.invalidateQueries({ queryKey: ['feedback-eligible-events'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể gửi phản hồi. Vui lòng thử lại.'))
    },
  })

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!eventId) {
      toast.error('Vui lòng chọn sự kiện.')
      return
    }
    if (rating < 1) {
      toast.error('Vui lòng chọn số sao đánh giá.')
      return
    }

    submitMutation.mutate({
      event_id: eventId,
      rating,
      content: content.trim(),
    })
  }

  if (!isAuthenticated) return null

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Phản hồi sự kiện"
        description="Chia sẻ cảm nhận của bạn sau khi tham dự sự kiện."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="glass-panel rounded-lg p-6">
          {eligibleQuery.isLoading && (
            <p className="text-sm text-muted">Đang tải danh sách sự kiện từ máy chủ...</p>
          )}

          {eligibleQuery.isError && (
            <p className="text-sm text-error">Không thể tải danh sách sự kiện. Thử lại sau.</p>
          )}

          {!eligibleQuery.isLoading && !eligibleQuery.isError && events.length === 0 && (
            <p className="text-sm text-muted">
              Hiện chưa có sự kiện nào có thể gửi phản hồi. Khi bạn đã tham dự một sự kiện kết thúc
              và chưa từng đánh giá sự kiện đó, sự kiện sẽ xuất hiện tại đây.
            </p>
          )}

          {events.length > 0 && (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm font-semibold text-muted">Sự kiện</span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-border-soft bg-surface px-3 outline-none focus:border-primary"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  required
                >
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} —{' '}
                      {new Date(item.end_time).toLocaleDateString('vi-VN')}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="text-sm font-semibold text-muted">Đánh giá</span>
                <div className="mt-2 flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="rounded p-1 transition hover:scale-110"
                      onMouseEnter={() => setHoverRating(value)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(value)}
                      aria-label={`${value} sao`}
                    >
                      <Star
                        className={`size-8 ${
                          value <= (hoverRating || rating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-subtle'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-muted">Nội dung phản hồi</span>
                <textarea
                  className="mt-2 min-h-36 w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Chia sẻ trải nghiệm của bạn về chương trình, địa điểm, BTC..."
                  required
                  minLength={10}
                />
              </label>

              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="rounded-md bg-primary px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-60"
              >
                {submitMutation.isPending ? 'Đang gửi...' : 'Gửi phản hồi'}
              </button>
            </form>
          )}
        </section>

        <aside className="glass-panel h-fit rounded-lg p-5">
          <h3 className="font-display text-lg font-bold text-primary">Lưu ý</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Bạn có thể gửi phản hồi sau khi sự kiện kết thúc.</li>
            <li>• Mỗi sự kiện chỉ gửi phản hồi một lần.</li>
            <li>• Hệ thống chỉ hiển thị sự kiện bạn có vé hợp lệ hoặc đã check-in.</li>
            <li>• Nội dung phản hồi sẽ được gửi đến ban tổ chức để cải thiện trải nghiệm.</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
