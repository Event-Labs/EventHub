import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Crown, Layers, Loader2, Star, Users, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchSubscriptionsForOrganizer } from '@/services/subscriptions.js'
import { subscribeToPlan } from '@/services/billing.js'
import { Badge, Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

export function OrganizerSubscriptionsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: ['organizer-subscriptions'],
    queryFn: fetchSubscriptionsForOrganizer,
  })

  const subscribeMutation = useMutation({
    mutationFn: subscribeToPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer-current-plan'] })
      navigate('/organizer/billing')
    },
    onError: () => {
      alert('Đăng ký gói thất bại. Vui lòng thử lại.')
    }
  })

  const activePlans = plans.filter((plan) => plan.is_active)

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

      {/* Plans grid */}
      {!isLoading && !isError && (
        <>
          {activePlans.length === 0 ? (
            <OrganizerPanel>
              <p className="text-center text-sm font-semibold text-[#737686]">
                Hiện chưa có gói dịch vụ nào đang hoạt động.
              </p>
            </OrganizerPanel>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {activePlans.map((plan, index) => (
                <PlanCard 
                  key={plan.id} 
                  plan={plan} 
                  highlighted={index === 1}
                  onSubscribe={() => subscribeMutation.mutate(plan.id)}
                  isBusy={subscribeMutation.isPending}
                />
              ))}
            </div>
          )}

          {/* Feature comparison table */}
          {activePlans.length > 1 && (
            <div className="mt-8">
              <OrganizerPanel>
                <h2 className="mb-5 text-lg font-extrabold text-[#111827]">So sánh chi tiết tính năng</h2>
                <ComparisonTable plans={activePlans} />
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
    </OrganizerPage>
  )
}

function PlanCard({ plan, highlighted, onSubscribe, isBusy }) {
  const icon = highlighted ? Crown : plan.price === 0 ? Layers : Star

  return (
    <OrganizerPanel
      className={`relative flex flex-col transition duration-200 hover:-translate-y-1 hover:shadow-lg ${
        highlighted ? 'border-primary ring-2 ring-primary/20' : ''
      }`}
    >
      {/* Top accent bar */}
      <div
        className={`absolute inset-x-0 top-0 h-1 rounded-t-md ${highlighted ? 'bg-primary' : 'bg-[#c3c6d7]'}`}
      />

      {/* Header */}
      <div className="mb-4 flex items-start justify-between pt-2">
        <div>
          {highlighted && (
            <Badge tone="blue" className="mb-2">
              Gợi ý
            </Badge>
          )}
          <h2 className="mt-1 text-xl font-extrabold text-[#111827]">{plan.name}</h2>
          {plan.description && (
            <p className="mt-1 text-sm text-[#737686]">{plan.description}</p>
          )}
        </div>
        <PlanIcon icon={icon} highlighted={highlighted} />
      </div>

      {/* Price */}
      <div className="mb-6">
        <p className="text-3xl font-black text-[#111827]">
          {plan.price === 0 ? (
            'Miễn phí'
          ) : (
            <>
              {formatMoney(plan.price)}
              <span className="text-sm font-bold text-[#737686]"> / {plan.duration_days} ngày</span>
            </>
          )}
        </p>
      </div>

      {/* Limits */}
      <div className="mb-5 grid gap-3 rounded-md bg-[#f7f9fb] p-4 text-sm">
        <LimitRow icon={Layers} label="Sự kiện" value={plan.event_limit === 0 ? 'Không giới hạn' : `${plan.event_limit} sự kiện`} />
        <LimitRow icon={Users} label="Nhân sự" value={plan.staff_limit === 0 ? 'Không giới hạn' : `${plan.staff_limit} nhân sự`} />
        <LimitRow icon={Zap} label="Thời hạn" value={`${plan.duration_days} ngày`} />
      </div>

      {/* Features */}
      {(plan.analytics_enabled || plan.priority_support || (plan.features && plan.features.length > 0)) && (
        <div className="mb-6 grid gap-2">
          {plan.analytics_enabled && <FeatureRow label="Phân tích dữ liệu nâng cao" />}
          {plan.priority_support && <FeatureRow label="Hỗ trợ ưu tiên 24/7" />}
          {Array.isArray(plan.features) &&
            plan.features.map((feature) => (
              <FeatureRow key={feature} label={feature} />
            ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto">
        <button
          onClick={onSubscribe}
          disabled={isBusy}
          className={`block w-full rounded-md px-4 py-3 text-center text-sm font-extrabold transition duration-200 disabled:opacity-50 ${
            highlighted
              ? 'bg-primary text-slate-950 hover:brightness-95'
              : 'border border-[#c3c6d7] bg-white text-[#111827] hover:border-primary hover:text-primary'
          }`}
        >
          {isBusy ? 'Đang xử lý...' : (plan.price === 0 ? 'Kích hoạt' : 'Chọn gói này')}
        </button>
      </div>
    </OrganizerPanel>
  )
}

function PlanIcon({ icon: Icon, highlighted }) {
  return (
    <span
      className={`grid size-10 shrink-0 place-items-center rounded-md ${
        highlighted ? 'bg-primary/10 text-primary' : 'bg-[#f2f4f6] text-[#737686]'
      }`}
    >
      <Icon className="size-5" />
    </span>
  )
}

function LimitRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-[#737686]">
        <Icon className="size-4 shrink-0" />
        {label}
      </span>
      <span className="font-extrabold text-[#111827]">{value}</span>
    </div>
  )
}

function FeatureRow({ label }) {
  return (
    <span className="flex items-center gap-2 text-sm text-[#434655]">
      <Check className="size-4 shrink-0 text-green-600" />
      {label}
    </span>
  )
}

function ComparisonTable({ plans }) {
  const rows = [
    { label: 'Giá', getValue: (plan) => plan.price === 0 ? 'Miễn phí' : formatMoney(plan.price) },
    { label: 'Thời hạn', getValue: (plan) => `${plan.duration_days} ngày` },
    { label: 'Sự kiện', getValue: (plan) => `${plan.event_limit} sự kiện` },
    { label: 'Nhân sự', getValue: (plan) => `${plan.staff_limit} nhân sự` },
    {
      label: 'Phân tích dữ liệu',
      getValue: (plan) =>
        plan.analytics_enabled ? <Check className="size-4 text-green-600" /> : <span className="text-[#c3c6d7]">—</span>,
    },
    {
      label: 'Hỗ trợ ưu tiên',
      getValue: (plan) =>
        plan.priority_support ? <Check className="size-4 text-green-600" /> : <span className="text-[#c3c6d7]">—</span>,
    },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e0e3e5]">
            <th className="py-3 pr-6 text-left text-xs font-bold uppercase text-[#737686]">Tính năng</th>
            {plans.map((plan) => (
              <th key={plan.id} className="px-4 py-3 text-center text-xs font-extrabold uppercase text-[#111827]">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, getValue }) => (
            <tr key={label} className="border-b border-[#f2f4f6] last:border-0">
              <td className="py-4 pr-6 font-semibold text-[#434655]">{label}</td>
              {plans.map((plan) => (
                <td key={plan.id} className="px-4 py-4 text-center font-bold text-[#111827]">
                  {getValue(plan)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value || 0))
}
