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

function formatEventDate(item) {
  if (!item) return ''
  const d = item.start_time || item.end_time
  if (!d) return ''
  return new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function FeedbackPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = hasAuthSession()

  const searchParams = new URLSearchParams(location.search)
  const queryEventId = searchParams.get('event_id') || searchParams.get('eventId') || ''

  const [eventId, setEventId] = useState(queryEventId)
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
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
    }
  }, [isAuthenticated, location.pathname, location.search, navigate])

  const eligibleQuery = useQuery({
    queryKey: ['feedback-eligible-events'],
    queryFn: fetchEligibleFeedbackEvents,
    enabled: isAuthenticated,
  })

  const events = eligibleQuery.data || []

  useEffect(() => {
    const paramId = new URLSearchParams(location.search).get('event_id') || new URLSearchParams(location.search).get('eventId')
    if (paramId && events.some((e) => String(e.id) === String(paramId))) {
      setEventId(paramId)
    } else if (!eventId && events.length > 0) {
      setEventId(paramId || events[0].id)
    }
  }, [location.search, events, eventId])

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
    <div className="mx-auto max-w-5xl px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-8 sm:pb-12">
      <div className="mb-10 text-center">
        <h1 className="font-display text-3xl font-black text-white md:text-4xl drop-shadow-lg">
          Đánh giá <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C99A47] to-[#E6C17A]">Sự kiện</span>
        </h1>
        <p className="mt-3 text-base font-medium text-slate-300">
          Chia sẻ trải nghiệm và cảm nhận của bạn để giúp ban tổ chức làm tốt hơn trong tương lai.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
        {events.length > 0 ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <section className="glass-panel relative overflow-hidden rounded-[24px] border-white/10 p-6 sm:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--color-primary)_0%,_transparent_70%)] opacity-10" />

              <div className="space-y-6">
                <div className="relative block" ref={dropdownRef}>
                  <span className="mb-2 inline-block text-sm font-bold text-white">Sự kiện tham dự</span>
                  <div 
                    className={`relative flex h-12 w-full cursor-pointer items-center justify-between rounded-xl border bg-panel/50 px-4 text-white backdrop-blur-md transition-all hover:border-[#C99A47]/50 ${isDropdownOpen ? 'border-[#C99A47] ring-2 ring-[#C99A47]/20' : 'border-white/15'}`}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <span className="truncate pr-4">
                      {events.find(e => e.id === eventId) 
                        ? `${events.find(e => e.id === eventId).title} — ${formatEventDate(events.find(e => e.id === eventId))}`
                        : 'Chọn sự kiện...'}
                    </span>
                    <ChevronDown className={`size-5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/15 bg-[#0f172a] shadow-[0_12px_40px_0_rgba(0,0,0,0.8)] backdrop-blur-xl">
                      <ul className="p-1.5">
                        {events.map((item) => {
                          const isSelected = item.id === eventId
                          return (
                            <li
                              key={item.id}
                              className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all ${
                                isSelected
                                  ? 'bg-[#C99A47]/20 font-bold text-[#E6C17A]'
                                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
                              }`}
                              onClick={() => {
                                setEventId(item.id)
                                setIsDropdownOpen(false)
                              }}
                            >
                              <span className="truncate">
                                {item.title} — {formatEventDate(item)}
                              </span>
                              {isSelected && <Check className="ml-2 size-4 shrink-0 text-[#E6C17A]" />}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                <div>
                  <span className="mb-2 inline-block text-sm font-bold text-white">Đánh giá của bạn</span>
                  <div className="flex items-center justify-center gap-3 py-2 sm:gap-4">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="rounded-lg p-1 transition hover:scale-115 active:scale-95 cursor-pointer"
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
                    className="min-h-40 w-full rounded-xl border border-white/15 bg-panel/50 p-4 text-white outline-none backdrop-blur-md transition-all focus:border-[#C99A47] focus:ring-2 focus:ring-[#C99A47]/20"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Chia sẻ trải nghiệm của bạn về chương trình, địa điểm, BTC..."
                    required
                    minLength={10}
                  />
                </label>
              </div>
            </section>

            {/* Button Gửi phản hồi đưa ra ngoài khung form đánh giá, căn phải */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="btn-gold-primary flex items-center justify-center rounded-full px-8 py-3.5 text-base font-bold shadow-lg shadow-[#C99A47]/30 transition-all hover:brightness-110 active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-w-48"
                style={{
                  backgroundColor: '#C99A47',
                  backgroundImage: 'linear-gradient(135deg, #C99A47, #E6C17A)',
                  color: '#0D1B2A',
                  transform: 'translateZ(0)',
                  WebkitTransform: 'translateZ(0)',
                }}
              >
                {submitMutation.isPending ? 'Đang gửi...' : 'Gửi phản hồi'}
              </button>
            </div>
          </form>
        ) : (
          <section className="glass-panel relative overflow-hidden rounded-[24px] border-white/10 p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
            {eligibleQuery.isLoading && (
              <p className="text-sm text-muted">Đang tải danh sách sự kiện từ máy chủ...</p>
            )}

            {eligibleQuery.isError && (
              <p className="text-sm text-error">Không thể tải danh sách sự kiện. Thử lại sau.</p>
            )}

            {!eligibleQuery.isLoading && !eligibleQuery.isError && events.length === 0 && (
              <p className="text-sm text-muted">
                Hiện chưa có sự kiện nào có thể gửi phản hồi. Khi sự kiện bạn có vé bắt đầu diễn ra
                hoặc đã kết thúc và bạn chưa từng đánh giá, sự kiện sẽ xuất hiện tại đây.
              </p>
            )}
          </section>
        )}

        <aside className="glass-panel h-fit rounded-[24px] border-white/10 bg-white/[0.02] p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
          <h3 className="font-display text-xl font-bold text-white">Lưu ý quan trọng</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
            <li className="flex gap-2"><span className="text-[#E6C17A] shrink-0">•</span> <span>Bạn có thể gửi phản hồi ngay khi sự kiện bắt đầu diễn ra hoặc sau khi kết thúc.</span></li>
            <li className="flex gap-2"><span className="text-[#E6C17A] shrink-0">•</span> <span>Mỗi sự kiện chỉ gửi phản hồi một lần duy nhất.</span></li>
            <li className="flex gap-2"><span className="text-[#E6C17A] shrink-0">•</span> <span>Hệ thống chỉ cho phép đánh giá khi bạn có vé hợp lệ hoặc đã check-in.</span></li>
            <li className="flex gap-2"><span className="text-[#E6C17A] shrink-0">•</span> <span>Nội dung phản hồi sẽ được gửi trực tiếp đến ban tổ chức để cải thiện chất lượng chương trình.</span></li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
