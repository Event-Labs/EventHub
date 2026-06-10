import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Calendar, CreditCard, Layers, Loader2, Users } from 'lucide-react'
import { fetchCurrentPlan } from '@/services/billing.js'
import { OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

export function OrganizerBillingPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['organizer-current-plan'],
    queryFn: fetchCurrentPlan,
  })

  return (
    <OrganizerPage
      title="Gói & thanh toán"
      description="Quản lý gói dịch vụ hiện tại và hạn mức sử dụng của bạn"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <OrganizerPanel className="border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">Lỗi tải thông tin gói. Vui lòng thử lại.</p>
        </OrganizerPanel>
      )}

      {!isLoading && !isError && data && (
        <div className="grid gap-6">
          <OrganizerPanel className="border-primary/50 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-[#737686]">Gói hiện tại</p>
                <h2 className="mt-1 text-3xl font-extrabold text-[#111827]">
                  {data.active ? data.plan.name : 'Miễn phí'}
                </h2>
                {data.active && (
                  <p className="mt-2 text-sm text-[#434655]">
                    Hết hạn sau <span className="font-extrabold text-primary">{data.days_remaining} ngày</span>
                  </p>
                )}
              </div>
              <Link
                to="/organizer/subscriptions"
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-extrabold text-slate-950 transition duration-200 hover:brightness-95"
              >
                Nâng cấp gói
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-md bg-[#f7f9fb] p-4">
                <div className="flex items-center gap-2 text-[#737686]">
                  <Layers className="size-4" />
                  <span className="text-sm font-bold">Giới hạn sự kiện</span>
                </div>
                <p className="mt-2 text-xl font-black text-[#111827]">
                  {data.active ? (data.plan.event_limit === 0 ? 'Không giới hạn' : data.plan.event_limit) : 'Mặc định'}
                </p>
              </div>

              <div className="rounded-md bg-[#f7f9fb] p-4">
                <div className="flex items-center gap-2 text-[#737686]">
                  <Users className="size-4" />
                  <span className="text-sm font-bold">Nhân sự tối đa</span>
                </div>
                <p className="mt-2 text-xl font-black text-[#111827]">
                  {data.active ? (data.plan.staff_limit === 0 ? 'Không giới hạn' : data.plan.staff_limit) : 'Mặc định'}
                </p>
              </div>

              <div className="rounded-md bg-[#f7f9fb] p-4">
                <div className="flex items-center gap-2 text-[#737686]">
                  <Calendar className="size-4" />
                  <span className="text-sm font-bold">Phân tích dữ liệu</span>
                </div>
                <p className="mt-2 text-xl font-black text-[#111827]">
                  {data.active && data.plan.analytics_enabled ? 'Bật' : 'Tắt'}
                </p>
              </div>
            </div>
          </OrganizerPanel>

          <OrganizerPanel>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-[#111827]">
              <CreditCard className="size-5 text-[#737686]" />
              Lịch sử thanh toán
            </h3>
            <p className="text-sm text-[#737686]">Hiện chưa có giao dịch nào.</p>
          </OrganizerPanel>
        </div>
      )}
    </OrganizerPage>
  )
}
