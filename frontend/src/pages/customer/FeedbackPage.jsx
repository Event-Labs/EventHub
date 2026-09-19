import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, ChevronDown, Check } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <h1 className="font-display text-3xl font-black text-white md:text-4xl drop-shadow-lg">
          Phản hồi <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Sự kiện</span>
        </h1>
        <p className="mt-3 text-base font-medium text-slate-300">
          Chia sẻ trải nghiệm và cảm nhận của bạn để giúp ban tổ chức làm tốt hơn trong tương lai.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
        <section className="glass-panel relative overflow-hidden rounded-[24px] border-primary/20 p-8 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)]">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)_0%,_transparent_70%)] opacity-10" />
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
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="relative block" ref={dropdownRef}>
                <span className="mb-2 inline-block text-sm font-bold text-white">Sự kiện tham dự</span>
                <div 
                  className={`relative flex h-12 w-full cursor-pointer items-center justify-between rounded-xl border bg-panel/50 px-4 text-white backdrop-blur-md transition-all hover:border-primary/50 ${isDropdownOpen ? 'border-primary ring-2 ring-primary/20' : 'border-primary/20'}`}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span className="truncate pr-4">
                    {events.find(e => e.id === eventId) 
                      ? `${events.find(e => e.id === eventId).title} — ${new Date(events.find(e => e.id === eventId).end_time).toLocaleDateString('vi-VN')}`
                      : 'Chọn sự kiện...'}
                  </span>
                  <ChevronDown className={`size-5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {isDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-primary/20 bg-[#0f172a] shadow-[0_12px_40px_0_rgba(0,0,0,0.8)] backdrop-blur-xl">
                    <ul className="p-1.5">
                      {events.map((item) => {
                        const isSelected = item.id === eventId
                        return (
                          <li
                            key={item.id}
                            className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all ${
                              isSelected
                                ? 'bg-primary/20 font-bold text-primary'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                            onClick={() => {
                              setEventId(item.id)
                              setIsDropdownOpen(false)
                            }}
                          >
                            <span className="truncate">
                              {item.title} — {new Date(item.end_time).toLocaleDateString('vi-VN')}
                            </span>
                            {isSelected && <Check className="ml-2 size-4 shrink-0" />}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <span className="mb-2 inline-block text-sm font-bold text-white">Đánh giá của bạn</span>
                <div className="flex gap-2 rounded-xl border border-primary/10 bg-panel/30 p-4">
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
                        className={`size-10 transition-all duration-300 ${
                          value <= (hoverRating || rating)
                            ? 'fill-warning text-warning drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                            : 'text-border-soft hover:text-warning/30'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 inline-block text-sm font-bold text-white">Nội dung chi tiết</span>
                <textarea
                  className="min-h-40 w-full rounded-xl border border-primary/20 bg-panel/50 p-4 text-white outline-none backdrop-blur-md transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Chia sẻ trải nghiệm của bạn về chương trình, địa điểm, BTC..."
                  required
                  minLength={10}
                />
              </label>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="admin-primary flex w-full items-center justify-center rounded-full px-8 py-4 text-base font-bold shadow-[0_0_20px_rgba(6,182,212,0.2)] disabled:opacity-60 sm:w-auto sm:min-w-48"
                >
                  {submitMutation.isPending ? 'Đang gửi...' : 'Gửi phản hồi'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="glass-panel h-fit rounded-[24px] border-secondary/20 bg-secondary/5 p-6 shadow-[0_8px_32px_0_rgba(59,130,246,0.05)]">
          <h3 className="font-display text-xl font-bold text-secondary">Lưu ý quan trọng</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <li className="flex gap-2"><span className="text-secondary shrink-0">•</span> <span>Bạn có thể gửi phản hồi sau khi sự kiện kết thúc.</span></li>
            <li className="flex gap-2"><span className="text-secondary shrink-0">•</span> <span>Mỗi sự kiện chỉ gửi phản hồi một lần duy nhất.</span></li>
            <li className="flex gap-2"><span className="text-secondary shrink-0">•</span> <span>Hệ thống chỉ cho phép đánh giá khi bạn có vé hợp lệ hoặc đã check-in.</span></li>
            <li className="flex gap-2"><span className="text-secondary shrink-0">•</span> <span>Nội dung phản hồi sẽ được gửi trực tiếp đến ban tổ chức để cải thiện chất lượng chương trình.</span></li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
