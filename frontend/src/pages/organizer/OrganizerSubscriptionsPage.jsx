import { useQuery } from '@tanstack/react-query'
import { Check, Clock, Crown, Layers, Loader2, Shield, Star, Users, Zap, X, CalendarDays } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSubscriptionsForOrganizer, fetchCurrentPlan, subscribeToPlan } from '@/services/subscriptions.js'
import { Badge, Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function OrganizerSubscriptionsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: ['organizer-subscriptions'],
    queryFn: fetchSubscriptionsForOrganizer,
  })

  const { data: currentPlanData, refetch: refetchCurrentPlan } = useQuery({
    queryKey: ['organizer-current-plan'],
    queryFn: fetchCurrentPlan,
  })

  const handlePayment = async () => {
    setIsProcessing(true)
    setError('')
    try {
      const result = await subscribeToPlan(selectedPlan.id)
      setSelectedPlan(null)

      if (result.requires_payment) {
        toast.success('Đã tạo yêu cầu thanh toán gói dịch vụ.')
        // PayOS flow — redirect to payment page
        navigate(`/organizer/subscriptions/payment-result?paymentId=${result.payment_id}`)
      } else {
        // Free plan / direct activation
        toast.success('Đã kích hoạt gói dịch vụ.')
        refetchCurrentPlan()
      }
    } catch (err) {
      const message = getApiMessage(err, 'Có lỗi xảy ra khi xử lý gói dịch vụ.')
      setError(message)
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const activePlans = plans.filter((plan) => plan.is_active)
  const currentPlan = currentPlanData?.active ? currentPlanData.plan : null
  const daysRemaining = currentPlanData?.days_remaining ?? null

  return (
    <OrganizerPage
      title="Gói Dịch vụ"
      description="Xem các gói Organizer hiện có. Nâng cấp để mở khoá thêm tính năng và tăng giới hạn sử dụng."
    >
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="ml-3 text-sm font-semibold text-subtle">Đang tải danh sách gói...</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <OrganizerPanel className="border-error/30 bg-error/10">
          <p className="text-sm font-semibold text-error">
            Không thể tải danh sách gói dịch vụ. Vui lòng thử lại sau.
          </p>
        </OrganizerPanel>
      )}

      {!isLoading && !isError && (
        <>
          {/* All plans in one row / grid */}
          {activePlans.length === 0 ? (
            <div className="rounded-2xl border border-[#1B365D] bg-[#0D1B2A] p-8 text-center shadow-xl">
              <p className="text-center text-sm font-semibold text-[#F5EBDD]/70">
                Hiện chưa có gói dịch vụ nào đang hoạt động.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-2">
              {activePlans.map((plan, index) => {
                const isCurrentPlan = currentPlan?.subscription_id === plan.id
                return (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    highlighted={isRecommendedPlan(plan, index)}
                    isCurrentPlan={isCurrentPlan}
                    onSubscribe={() => setSelectedPlan(plan)}
                  />
                )
              })}
            </div>
          )}

          {/* Current plan detail panel */}
          {currentPlan ? (
            <div className="mt-8">
              <CurrentPlanDetail plan={currentPlan} daysRemaining={daysRemaining} />
            </div>
          ) : (
            <div className="mt-8">
              <div className="rounded-2xl border border-dashed border-[#1B365D] bg-[#0D1B2A] p-8 text-center">
                <p className="text-center text-sm font-semibold text-[#F5EBDD]/70">
                  Bạn chưa đăng ký gói dịch vụ nào. Hãy chọn một gói phù hợp bên trên.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Payment Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#0D1B2A] border border-[#1B365D] p-6 shadow-2xl shadow-black/90 text-[#F5EBDD]">
            <button
              onClick={() => !isProcessing && setSelectedPlan(null)}
              className="absolute right-4 top-4 text-[#F5EBDD]/60 transition hover:text-[#F5EBDD]"
            >
              <X className="size-5" />
            </button>
            <h3 className="mb-1 text-2xl font-black text-[#F5EBDD]">Xác nhận đăng ký</h3>
            <p className="mb-5 text-sm text-[#F5EBDD]/70">
              Bạn đang chọn gói <strong className="text-[#E6C17A] font-bold">{selectedPlan.name}</strong>
            </p>

            {currentPlan && selectedPlan.id !== currentPlan.subscription_id && (
              <SubscriptionChangeWarning currentPlan={currentPlan} selectedPlan={selectedPlan} />
            )}
            {currentPlan && selectedPlan.id === currentPlan.subscription_id && (
              <div className="mb-4 rounded-xl border border-[#C99A47]/40 bg-[#1B365D]/60 px-3 py-2 text-sm font-semibold text-[#E6C17A]">
                Gia hạn cùng gói sẽ thay thế thời gian còn lại. Ngày hết hạn mới được tính từ thời điểm thanh toán mới.
              </div>
            )}

            <div className="mb-6 space-y-2 rounded-xl bg-[#1B365D]/30 border border-[#1B365D] p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[#F5EBDD]/70 font-medium">Thời hạn</span>
                <span className="font-bold text-[#F5EBDD]">{selectedPlan.duration_days} ngày</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#F5EBDD]/70 font-medium">Giới hạn sự kiện</span>
                <span className="font-bold text-[#F5EBDD]">
                  {selectedPlan.event_limit === 0 ? 'Không giới hạn' : `${selectedPlan.event_limit} sự kiện`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#F5EBDD]/70 font-medium">Giới hạn nhân sự</span>
                <span className="font-bold text-[#F5EBDD]">
                  {selectedPlan.staff_limit === 0 ? 'Không giới hạn' : `${selectedPlan.staff_limit} người`}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#1B365D] pt-2">
                <span className="font-bold text-[#F5EBDD]">Tổng thanh toán</span>
                <span className="text-xl font-black text-[#E6C17A]">
                  {selectedPlan.price === 0 ? 'Miễn phí' : formatMoney(selectedPlan.price)}
                </span>
              </div>
            </div>

            <button
              onClick={handlePayment}
              disabled={isProcessing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C99A47] via-[#E6C17A] to-[#C99A47] hover:brightness-110 text-[#0D1B2A] py-3 text-sm font-black shadow-lg shadow-[#C99A47]/30 transition-all hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isProcessing && <Loader2 className="size-4 animate-spin text-[#0D1B2A]" />}
              {isProcessing
                ? 'Đang xử lý...'
                : selectedPlan.price === 0
                  ? 'Kích hoạt ngay'
                  : 'Tiến hành thanh toán PayOS'}
            </button>
          </div>
        </div>
      )}
    </OrganizerPage>
  )
}

// ─── Plan Card Components ───────────────────────────────────────────────────
function StatLine({ icon: Icon, iconColor = 'text-[#F5EBDD]/60', label, value }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="flex items-center gap-2 text-[#F5EBDD]/70 font-medium">
        <Icon className={`size-3.5 shrink-0 ${iconColor}`} />
        {label}
      </span>
      <span className="font-extrabold text-[#F5EBDD]">{value}</span>
    </div>
  )
}

function Pill({ label, isGold = false }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-bold border shadow-sm ${
        isGold
          ? 'bg-[#C99A47]/15 border-[#C99A47]/40 text-[#E6C17A]'
          : 'bg-[#1B365D]/50 border-[#1B365D] text-[#F5EBDD]/90'
      }`}
    >
      {label}
    </span>
  )
}

function PlanCardInner({ plan, highlighted, isCurrentPlan, onSubscribe }) {
  const Icon = isCurrentPlan ? Crown : highlighted ? Star : Layers

  return (
    <div className="flex h-full flex-col">
      {/* Badge */}
      <div className="mb-4 min-h-[26px]">
        {isCurrentPlan ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B365D] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#E6C17A] border border-[#C99A47]/40 shadow-sm">
            <Crown className="size-3.5" />
            Đang sử dụng
          </span>
        ) : highlighted ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#0D1B2A] shadow-md shadow-[#C99A47]/30">
            <Star className="size-3.5 fill-[#0D1B2A]" />
            Phổ biến
          </span>
        ) : (
          <span className="inline-block h-6" />
        )}
      </div>

      {/* Icon + Name */}
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl shadow-inner ${
            highlighted
              ? 'bg-[#C99A47]/20 text-[#E6C17A] border border-[#C99A47]/40'
              : 'bg-[#1B365D] text-[#E6C17A] border border-[#1B365D]'
          }`}
        >
          <Icon className="size-5" />
        </span>
        <h2 className="text-xl font-black text-[#F5EBDD] tracking-tight">{plan.name}</h2>
      </div>

      {/* Price */}
      <div className="mb-5">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-3xl font-black tracking-tight ${
              highlighted ? 'text-[#E6C17A]' : 'text-[#F5EBDD]'
            }`}
          >
            {plan.price === 0 ? 'Miễn phí' : formatMoney(plan.price)}
          </span>
          {plan.price > 0 && (
            <span className="text-xs font-semibold text-[#F5EBDD]/60">/{plan.duration_days} ngày</span>
          )}
        </div>
      </div>

      {/* Key stats */}
      <div className="mb-5 space-y-2 border-t border-[#1B365D] pt-4">
        <StatLine
          icon={Layers}
          iconColor={highlighted ? 'text-[#C99A47]' : 'text-[#F5EBDD]/60'}
          label="Sự kiện / kỳ"
          value={plan.event_limit === 0 ? 'Không giới hạn' : `${plan.event_limit} sự kiện`}
        />
        <StatLine
          icon={Users}
          iconColor={highlighted ? 'text-[#C99A47]' : 'text-[#F5EBDD]/60'}
          label="Nhân sự / sự kiện"
          value={plan.max_staff_per_event === 0 ? 'Không giới hạn' : `${plan.max_staff_per_event} người`}
        />
        <StatLine
          icon={Zap}
          iconColor={highlighted ? 'text-[#C99A47]' : 'text-[#F5EBDD]/60'}
          label="Thời hạn"
          value={`${plan.duration_days} ngày`}
        />
      </div>

      {/* Feature pills */}
      <div className="mb-6 flex flex-wrap gap-1.5 min-h-[58px]">
        {plan.promo_code_enabled && <Pill label="Mã KM" isGold={highlighted} />}
        {plan.seat_map_enabled && <Pill label="Sơ đồ ghế" isGold={highlighted} />}
        {plan.ai_report_enabled && <Pill label="Báo cáo AI" isGold={highlighted} />}
        {plan.advanced_analytics_enabled && <Pill label="Analytics" isGold={highlighted} />}
        {plan.attendee_export_enabled && <Pill label="Xuất DS" isGold={highlighted} />}
      </div>

      {/* CTA Button */}
      <div className="mt-auto">
        <button
          onClick={onSubscribe}
          disabled={isCurrentPlan}
          style={{ fontWeight: 800 }}
          className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-center text-xs font-extrabold font-display uppercase tracking-wide transition-all duration-200 disabled:cursor-default ${
            isCurrentPlan
              ? 'bg-[#1B365D] text-[#E6C17A] border border-[#C99A47]/40 shadow-sm opacity-95'
              : highlighted
                ? 'bg-gradient-to-r from-[#C99A47] via-[#E6C17A] to-[#C99A47] hover:brightness-110 text-[#0D1B2A] shadow-xl shadow-[#C99A47]/30 hover:scale-[1.02] cursor-pointer'
                : 'bg-[#1B365D] hover:bg-[#1B365D]/80 hover:border-[#C99A47]/50 text-[#F5EBDD] border border-[#1B365D] shadow-md hover:scale-[1.02] cursor-pointer'
          }`}
        >
          {isCurrentPlan ? (
            <>
              <Check className="size-3.5 stroke-[3.5]" />
              <span className="font-extrabold">Đang sử dụng</span>
            </>
          ) : plan.price === 0 ? (
            <span className="font-extrabold">Kích hoạt ngay</span>
          ) : (
            <span className="font-extrabold">Chọn gói này</span>
          )}
        </button>
      </div>
    </div>
  )
}

function PlanCard({ plan, highlighted, isCurrentPlan, onSubscribe }) {
  if (isCurrentPlan) {
    return (
      <div className="plan-card-led-wrapper flex min-w-[260px] flex-1 flex-col transition-all duration-300 hover:-translate-y-1.5">
        {/* Animated LED beam running around the border */}
        <div className="plan-card-led-beam" />

        {/* Inner solid card content */}
        <div className="relative z-10 flex h-full w-full flex-col rounded-[14px] bg-[#0D1B2A] p-6 text-[#F5EBDD]">
          <PlanCardInner
            plan={plan}
            highlighted={highlighted}
            isCurrentPlan={isCurrentPlan}
            onSubscribe={onSubscribe}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative flex min-w-[260px] flex-1 flex-col rounded-2xl p-6 shadow-2xl transition-all duration-300 hover:-translate-y-1.5 ${
        highlighted
          ? 'border-2 border-[#C99A47] bg-[#0D1B2A] shadow-[0_12px_40px_rgba(201,154,71,0.25)] ring-1 ring-[#E6C17A]/50 text-[#F5EBDD]'
          : 'border border-[#1B365D] bg-[#0D1B2A] shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-[#F5EBDD] hover:border-[#1B365D]/90'
      }`}
    >
      <PlanCardInner
        plan={plan}
        highlighted={highlighted}
        isCurrentPlan={isCurrentPlan}
        onSubscribe={onSubscribe}
      />
    </div>
  )
}

function SubscriptionChangeWarning({ currentPlan, selectedPlan }) {
  const currentPrice = Number(currentPlan.price || 0)
  const selectedPrice = Number(selectedPlan.price || 0)

  if (selectedPrice > currentPrice) {
    return (
      <div className="mb-4 rounded-xl border border-[#C99A47]/40 bg-[#1B365D]/60 px-3 py-2 text-sm font-semibold text-[#E6C17A]">
        Nâng cấp sẽ áp dụng ngay sau khi thanh toán. Thời gian còn lại của gói hiện tại không được hoàn tiền hoặc quy đổi.
      </div>
    )
  }

  if (selectedPrice < currentPrice) {
    return (
      <div className="mb-4 rounded-xl border border-[#C99A47]/40 bg-[#1B365D]/60 px-3 py-2 text-sm font-semibold text-[#E6C17A]">
        Hạ cấp cần kiểm tra quota và áp dụng ở chu kỳ tiếp theo. Nếu chưa được mở tự động, vui lòng liên hệ quản trị viên để lên lịch chuyển gói.
      </div>
    )
  }

  return null
}

// ─── Current Plan Detail with Countdown ────────────────────────────────────
function CurrentPlanDetail({ plan, daysRemaining }) {
  const [countdown, setCountdown] = useState(() => computeCountdown(plan.end_date))

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(computeCountdown(plan.end_date))
    }, 1000)
    return () => clearInterval(timer)
  }, [plan.end_date])

  const pct = plan.duration_days > 0
    ? Math.min(100, Math.max(0, Math.round(((daysRemaining ?? 0) / plan.duration_days) * 100)))
    : 100

  const urgency = (daysRemaining ?? 99) <= 3 ? 'red' : (daysRemaining ?? 99) <= 7 ? 'amber' : 'green'
  const barColor = urgency === 'red' ? 'bg-rose-500' : 'bg-[#C99A47]'
  const textColor = urgency === 'red' ? 'text-rose-400' : 'text-[#E6C17A]'

  // Feature flags to display
  const features = [
    { label: 'Mã khuyến mãi', value: plan.promo_code_enabled },
    { label: 'Sơ đồ chỗ ngồi', value: plan.seat_map_enabled },
    { label: 'Check-in thủ công', value: plan.manual_checkin_enabled },
    { label: 'Xuất danh sách', value: plan.attendee_export_enabled },
    { label: 'Phân tích nâng cao', value: plan.advanced_analytics_enabled },
    { label: 'Báo cáo AI', value: plan.ai_report_enabled },
    { label: 'Thương hiệu riêng', value: plan.custom_branding_enabled },
    { label: 'Hỗ trợ ưu tiên', value: plan.priority_support },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1B365D] bg-[#0D1B2A] shadow-2xl text-[#F5EBDD]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1B365D] px-6 py-4.5 bg-[#1B365D]/20">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#1B365D] text-[#E6C17A] border border-[#1B365D]">
            <Shield className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#F5EBDD]/70">Gói hiện tại</p>
            <p className="text-lg font-black text-[#F5EBDD]">{plan.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-base font-black text-[#E6C17A]">{formatMoney(plan.price)}</p>
          <span className="rounded-full bg-[#1B365D] px-3 py-1 text-xs font-black uppercase text-[#E6C17A] border border-[#C99A47]/40">
            Đang hoạt động
          </span>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1B365D]">
        {/* Col 1: Limits */}
        <div className="space-y-3 px-6 py-5">
          <h3 className="text-sm font-extrabold text-[#F5EBDD]">Giới hạn sử dụng</h3>
          <StatRow icon={Layers} label="Sự kiện / kỳ" value={plan.event_limit === 0 ? 'Không giới hạn' : plan.event_limit} />
          <StatRow icon={Zap} label="Sự kiện active cùng lúc" value={plan.max_active_events === 0 ? 'Không giới hạn' : plan.max_active_events} />
          <StatRow icon={Users} label="Nhân sự / sự kiện" value={plan.max_staff_per_event === 0 ? 'Không giới hạn' : plan.max_staff_per_event} />
          <StatRow icon={Layers} label="Loại vé / sự kiện" value={plan.max_ticket_types_per_event === 0 ? 'Không giới hạn' : plan.max_ticket_types_per_event} />
          <StatRow icon={Layers} label="Mã KM / sự kiện" value={plan.max_promo_codes_per_event === 0 ? 'Không giới hạn' : plan.max_promo_codes_per_event} />
          <StatRow icon={CalendarDays} label="Thời hạn gói" value={`${plan.duration_days} ngày`} />
        </div>

        {/* Col 2: Feature flags */}
        <div className="px-6 py-5">
          <h3 className="mb-3 text-sm font-extrabold text-[#F5EBDD]">Tính năng</h3>
          <div className="space-y-2.5">
            {features.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-[#F5EBDD]/80 font-medium">{label}</span>
                {value
                  ? <span className="flex items-center gap-1 font-bold text-[#E6C17A]"><Check className="size-4 stroke-[3]" /> Có</span>
                  : <span className="flex items-center gap-1 text-[#F5EBDD]/40"><X className="size-4" /> Không</span>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Col 3: Countdown */}
        <div className="flex flex-col justify-center px-6 py-5">
          <h3 className="mb-4 text-sm font-extrabold text-[#F5EBDD]">Thời gian còn lại</h3>

          <div className="mb-5 flex items-end gap-2">
            <CountdownUnit value={countdown.days} label="Ngày" urgent={urgency === 'red'} />
            <span className="mb-2 text-2xl font-extrabold text-[#F5EBDD]/30">:</span>
            <CountdownUnit value={countdown.hours} label="Giờ" urgent={urgency === 'red'} />
            <span className="mb-2 text-2xl font-extrabold text-[#F5EBDD]/30">:</span>
            <CountdownUnit value={countdown.minutes} label="Phút" urgent={urgency === 'red'} />
            <span className="mb-2 text-2xl font-extrabold text-[#F5EBDD]/30">:</span>
            <CountdownUnit value={countdown.seconds} label="Giây" urgent={urgency === 'red'} />
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="font-semibold text-[#F5EBDD]/70">Thời gian còn lại</span>
              <span className={`font-black ${textColor}`}>{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#1B365D]">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {plan.end_date && (
              <p className="mt-2 text-xs text-[#F5EBDD]/70">
                Hết hạn: <span className="font-semibold text-[#F5EBDD]">{formatDate(plan.end_date)}</span>
              </p>
            )}
          </div>

          {urgency === 'red' && (
            <p className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300">
              ⚠️ Gói sắp hết hạn! Hãy gia hạn để không bị gián đoạn.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function CountdownUnit({ value, label, urgent }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black tabular-nums border ${
          urgent
            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            : 'bg-[#1B365D]/40 text-[#F5EBDD] border border-[#1B365D]'
        }`}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#F5EBDD]/60">{label}</span>
    </div>
  )
}

function StatRow({ icon: Icon, label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-[#F5EBDD]/70 font-medium">
        <Icon className="size-4 shrink-0 text-[#E6C17A]" />
        {label}
      </span>
      <span className={`font-extrabold ${highlight ? 'text-[#E6C17A]' : 'text-[#F5EBDD]'}`}>{value}</span>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function computeCountdown(endDateStr) {
  if (!endDateStr) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  const diff = Math.max(0, new Date(endDateStr) - new Date())
  const totalSeconds = Math.floor(diff / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

function formatDate(dateStr) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value || 0))
}

function isRecommendedPlan(plan, index) {
  const name = String(plan.name || '').toLowerCase()
  return name.includes('chuyên nghiệp') || name.includes('professional') || index === 1
}
