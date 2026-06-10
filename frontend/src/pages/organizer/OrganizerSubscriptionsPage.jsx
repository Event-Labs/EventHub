import { useQuery } from '@tanstack/react-query'
import { Check, Clock, Crown, Layers, Loader2, Shield, Star, Users, Zap, X, CalendarDays, TrendingUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import { fetchSubscriptionsForOrganizer, fetchCurrentPlan, subscribeToPlan } from '@/services/subscriptions.js'
import { Badge, Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

export function OrganizerSubscriptionsPage() {
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false)

  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: ['organizer-subscriptions'],
    queryFn: fetchSubscriptionsForOrganizer,
  })

  const { data: currentPlanData, refetch: refetchCurrentPlan } = useQuery({
    queryKey: ['organizer-current-plan'],
    queryFn: fetchCurrentPlan,
  })

  const handlePayment = async () => {
    setIsSimulatingPayment(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await subscribeToPlan(selectedPlan.id)
      setIsSimulatingPayment(false)
      setSelectedPlan(null)
      refetchCurrentPlan()
    } catch (error) {
      setIsSimulatingPayment(false)
      alert('Có lỗi xảy ra khi cập nhật gói dịch vụ.')
    }
  }

  const activePlans = plans.filter((plan) => plan.is_active)
  const currentPlan = currentPlanData?.active ? currentPlanData.plan : null
  const daysRemaining = currentPlanData?.days_remaining ?? null

  return (
    <OrganizerPage
      title="Gói dịch vụ"
      description="Xem các gói Organizer hiện có. Nâng cấp để mở khoá thêm tính năng và tăng giới hạn sử dụng."
    >
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="ml-3 text-sm font-semibold text-[#434655]">Đang tải danh sách gói...</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <OrganizerPanel className="border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">
            Không thể tải danh sách gói dịch vụ. Vui lòng thử lại sau.
          </p>
        </OrganizerPanel>
      )}

      {!isLoading && !isError && (
        <>
          {/* All plans in one row */}
          {activePlans.length === 0 ? (
            <OrganizerPanel>
              <p className="text-center text-sm font-semibold text-[#737686]">
                Hiện chưa có gói dịch vụ nào đang hoạt động.
              </p>
            </OrganizerPanel>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {activePlans.map((plan, index) => {
                const isCurrentPlan = currentPlan?.subscription_id === plan.id
                return (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    highlighted={index === 1}
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
              <OrganizerPanel className="border-dashed">
                <p className="text-center text-sm font-semibold text-[#737686]">
                  Bạn chưa đăng ký gói dịch vụ nào. Hãy chọn một gói phù hợp bên trên.
                </p>
              </OrganizerPanel>
            </div>
          )}

          {/* AI insight */}
          <div className="mt-6">
            <Insight title="Gợi ý từ AI">
              Chọn gói dựa trên số sự kiện bạn dự kiến tổ chức mỗi tháng. Nếu cần hỗ trợ ưu tiên hoặc phân tích dữ
              liệu nâng cao, hãy chọn các gói có tính năng đó để tối ưu vận hành.
            </Insight>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <button
              onClick={() => !isSimulatingPayment && setSelectedPlan(null)}
              className="absolute right-4 top-4 text-[#737686] transition hover:text-[#111827]"
            >
              <X className="size-5" />
            </button>
            <h3 className="mb-1 text-xl font-extrabold text-[#111827]">Xác nhận đăng ký</h3>
            <p className="mb-5 text-sm text-[#434655]">
              Bạn đang chọn gói <strong className="text-[#111827]">{selectedPlan.name}</strong>
            </p>

            <div className="mb-6 space-y-2 rounded-lg bg-[#f7f9fb] p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[#737686]">Thời hạn</span>
                <span className="font-semibold text-[#111827]">{selectedPlan.duration_days} ngày</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#737686]">Giới hạn sự kiện</span>
                <span className="font-semibold text-[#111827]">
                  {selectedPlan.event_limit === 0 ? 'Không giới hạn' : `${selectedPlan.event_limit} sự kiện`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#737686]">Giới hạn nhân sự</span>
                <span className="font-semibold text-[#111827]">
                  {selectedPlan.staff_limit === 0 ? 'Không giới hạn' : `${selectedPlan.staff_limit} người`}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#e0e3e5] pt-2">
                <span className="font-bold text-[#111827]">Tổng thanh toán</span>
                <span className="text-lg font-extrabold text-primary">
                  {selectedPlan.price === 0 ? 'Miễn phí' : formatMoney(selectedPlan.price)}
                </span>
              </div>
            </div>

            <button
              onClick={handlePayment}
              disabled={isSimulatingPayment}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-extrabold text-slate-950 transition duration-200 hover:brightness-95 disabled:opacity-60"
            >
              {isSimulatingPayment && <Loader2 className="size-4 animate-spin" />}
              {isSimulatingPayment
                ? 'Đang xử lý...'
                : selectedPlan.price === 0
                  ? 'Kích hoạt ngay'
                  : 'Thanh toán ngay'}
            </button>
          </div>
        </div>
      )}
    </OrganizerPage>
  )
}

// ─── Plan Card (compact horizontal layout) ─────────────────────────────────
function PlanCard({ plan, highlighted, isCurrentPlan, onSubscribe }) {
  const Icon = isCurrentPlan ? Crown : highlighted ? Star : Layers

  return (
    <div
      className={`relative flex min-w-[220px] flex-1 flex-col rounded-xl border bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md ${
        isCurrentPlan
          ? 'border-green-500 ring-2 ring-green-500/20'
          : highlighted
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-[#c3c6d7]'
      }`}
    >
      {/* Top accent */}
      <div
        className={`absolute inset-x-0 top-0 h-1 rounded-t-xl ${
          isCurrentPlan ? 'bg-green-500' : highlighted ? 'bg-primary' : 'bg-[#c3c6d7]'
        }`}
      />

      {/* Badge */}
      <div className="mb-3 mt-1">
        {isCurrentPlan ? (
          <Badge tone="green">Đang sử dụng</Badge>
        ) : highlighted ? (
          <Badge tone="blue">Phổ biến</Badge>
        ) : (
          <span className="inline-block h-5" />
        )}
      </div>

      {/* Icon + Name */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            isCurrentPlan
              ? 'bg-green-100 text-green-600'
              : highlighted
                ? 'bg-primary/10 text-primary'
                : 'bg-[#f2f4f6] text-[#737686]'
          }`}
        >
          <Icon className="size-4" />
        </span>
        <h2 className="text-base font-extrabold text-[#111827]">{plan.name}</h2>
      </div>

      {/* Price */}
      <p className="mb-4 text-2xl font-black text-[#111827]">
        {plan.price === 0 ? (
          'Miễn phí'
        ) : (
          <>
            {formatMoney(plan.price)}
            <span className="text-xs font-semibold text-[#737686]"> /{plan.duration_days}ngày</span>
          </>
        )}
      </p>

      {/* Quick stats */}
      <div className="mb-5 space-y-1.5 text-xs text-[#737686]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><Layers className="size-3" /> Sự kiện</span>
          <span className="font-bold text-[#111827]">
            {plan.event_limit === 0 ? '∞' : plan.event_limit}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><Users className="size-3" /> Nhân sự</span>
          <span className="font-bold text-[#111827]">
            {plan.staff_limit === 0 ? '∞' : plan.staff_limit}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><Zap className="size-3" /> Thời hạn</span>
          <span className="font-bold text-[#111827]">{plan.duration_days}d</span>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-auto">
        <button
          onClick={onSubscribe}
          disabled={isCurrentPlan}
          className={`block w-full rounded-lg py-2.5 text-center text-xs font-extrabold transition duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${
            isCurrentPlan
              ? 'bg-green-500 text-white'
              : highlighted
                ? 'bg-primary text-slate-950 hover:brightness-95'
                : 'border border-[#c3c6d7] text-[#111827] hover:border-primary hover:text-primary'
          }`}
        >
          {isCurrentPlan ? 'Đang sử dụng' : plan.price === 0 ? 'Kích hoạt' : 'Chọn gói này'}
        </button>
      </div>
    </div>
  )
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
  const barColor = urgency === 'red' ? 'bg-red-500' : urgency === 'amber' ? 'bg-amber-400' : 'bg-green-500'
  const textColor = urgency === 'red' ? 'text-red-600' : urgency === 'amber' ? 'text-amber-600' : 'text-green-600'

  return (
    <OrganizerPanel className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e0e3e5] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-green-100 text-green-600">
            <Shield className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase text-[#737686]">Gói hiện tại</p>
            <p className="text-lg font-extrabold text-[#111827]">{plan.name}</p>
          </div>
        </div>
        <Badge tone="green">Đang hoạt động</Badge>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Left: stats */}
        <div className="space-y-4 border-r border-[#e0e3e5] px-6 py-5">
          <h3 className="text-sm font-extrabold text-[#111827]">Chi tiết gói</h3>
          <div className="grid gap-3">
            <StatRow icon={Layers} label="Giới hạn sự kiện" value={plan.event_limit === 0 ? 'Không giới hạn' : `${plan.event_limit} sự kiện`} />
            <StatRow icon={Users} label="Giới hạn nhân sự" value={plan.staff_limit === 0 ? 'Không giới hạn' : `${plan.staff_limit} người`} />
            <StatRow icon={CalendarDays} label="Thời hạn gói" value={`${plan.duration_days} ngày`} />
            <StatRow icon={TrendingUp} label="Phân tích nâng cao" value={plan.analytics_enabled ? 'Có' : 'Không'} highlight={plan.analytics_enabled} />
            <StatRow icon={Zap} label="Hỗ trợ ưu tiên" value={plan.priority_support ? 'Có' : 'Không'} highlight={plan.priority_support} />
          </div>
        </div>

        {/* Right: countdown */}
        <div className="flex flex-col justify-center px-6 py-5">
          <h3 className="mb-4 text-sm font-extrabold text-[#111827]">Thời gian còn lại</h3>

          {/* Countdown clock */}
          <div className="mb-5 flex items-end gap-2">
            <CountdownUnit value={countdown.days} label="Ngày" urgent={urgency === 'red'} />
            <span className="mb-2 text-2xl font-extrabold text-[#c3c6d7]">:</span>
            <CountdownUnit value={countdown.hours} label="Giờ" urgent={urgency === 'red'} />
            <span className="mb-2 text-2xl font-extrabold text-[#c3c6d7]">:</span>
            <CountdownUnit value={countdown.minutes} label="Phút" urgent={urgency === 'red'} />
            <span className="mb-2 text-2xl font-extrabold text-[#c3c6d7]">:</span>
            <CountdownUnit value={countdown.seconds} label="Giây" urgent={urgency === 'red'} />
          </div>

          {/* Progress bar */}
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-semibold text-[#737686]">Thời gian sử dụng</span>
              <span className={`font-extrabold ${textColor}`}>{pct}% còn lại</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#e0e3e5]">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {plan.end_date && (
              <p className="mt-2 text-xs text-[#737686]">
                Hết hạn: <span className="font-semibold text-[#434655]">{formatDate(plan.end_date)}</span>
              </p>
            )}
          </div>

          {urgency === 'red' && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              ⚠️ Gói sắp hết hạn! Hãy gia hạn để không bị gián đoạn.
            </p>
          )}
        </div>
      </div>
    </OrganizerPanel>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function CountdownUnit({ value, label, urgent }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-lg text-xl font-extrabold tabular-nums ${
          urgent ? 'bg-red-100 text-red-600' : 'bg-[#f2f4f6] text-[#111827]'
        }`}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase text-[#737686]">{label}</span>
    </div>
  )
}

function StatRow({ icon: Icon, label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-[#737686]">
        <Icon className="size-4 shrink-0" />
        {label}
      </span>
      <span className={`font-extrabold ${highlight ? 'text-green-600' : 'text-[#111827]'}`}>{value}</span>
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
