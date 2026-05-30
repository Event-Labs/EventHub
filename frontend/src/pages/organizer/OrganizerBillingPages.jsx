import {
  ArrowLeft,
  Calendar,
  Check,
  CreditCard,
  Download,
  FileText,
  HelpCircle,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Star,
  WalletCards,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Insight, OrganizerPage, OrganizerPanel, OrganizerTable } from './OrganizerComponents.jsx'

const historyRows = [
  ['Pro Plan - Sep 2024', 'Sep 12, 2024', '$49.00', 'Paid'],
  ['Pro Plan - Aug 2024', 'Aug 12, 2024', '$49.00', 'Paid'],
]

const invoices = [
  ['Sep 12, 2024', 'Enterprise Pro', '$499.00', 'Paid'],
  ['Aug 12, 2024', 'Enterprise Pro', '$499.00', 'Paid'],
  ['Jul 12, 2024', 'Enterprise Pro', '$499.00', 'Paid'],
]

export function OrganizerBillingPage() {
  return (
    <OrganizerPage
      title="Gói & thanh toán"
      description="Quản lý gói tổ chức, hạn mức sử dụng và các khoản thanh toán."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <OrganizerPanel>
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <span className="grid size-12 place-items-center rounded-md bg-[#dbeafe] text-primary">
                  <Star className="size-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-[#111827]">Pro Plan</h2>
                    <Badge tone="green">Đang dùng</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[#5c647a]">Thanh toán hàng tháng • Từ Jan 2024</p>
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-2xl font-extrabold text-[#111827]">$49/month</p>
                <p className="text-xs font-semibold text-[#737686]">Gia hạn tiếp theo: Oct 12, 2024</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 border-t border-[#e0e3e5] pt-5 md:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-extrabold text-[#111827]">Quyền lợi gói</p>
                <div className="grid gap-2 text-sm text-[#434655]">
                  {['Tạo sự kiện', 'Quản lý vé', 'AI Insight', 'Hỗ trợ 24/7'].map((item) => (
                    <span key={item} className="flex items-center gap-2">
                      <Check className="size-4 text-green-600" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-3 md:justify-end">
                <button className="admin-secondary">Hủy gói</button>
                <Link className="admin-primary" to="/organizer/billing/plans">
                  Nâng cấp gói
                </Link>
              </div>
            </div>
          </OrganizerPanel>

          <div className="grid gap-4 md:grid-cols-3">
            <UsageCard label="Sự kiện" value="3 / 10" percent={30} />
            <UsageCard label="Nhân sự" value="4 / 20" percent={20} />
            <UsageCard label="AI Summaries" value="12 / 50" percent={24} ai />
          </div>

          <OrganizerPanel>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[#111827]">Lịch sử thanh toán</h3>
              <Link className="text-sm font-extrabold text-primary" to="/organizer/billing/history">
                Xem tất cả
              </Link>
            </div>
            <div className="divide-y divide-[#e0e3e5]">
              {historyRows.map(([title, date, amount, status]) => (
                <Link
                  className="flex items-center justify-between py-4 transition hover:bg-[#f7f9fb]"
                  key={title}
                  to="/organizer/billing/invoice"
                >
                  <span className="flex items-center gap-3">
                    <FileText className="size-5 text-[#737686]" />
                    <span>
                      <span className="block font-bold text-[#111827]">{title}</span>
                      <span className="text-sm text-[#737686]">Đã thanh toán ngày {date}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-bold">{amount}</span>
                    <Badge tone="green">{status}</Badge>
                  </span>
                </Link>
              ))}
            </div>
          </OrganizerPanel>
        </div>

        <div className="space-y-5">
          <OrganizerPanel>
            <h3 className="mb-5 text-lg font-extrabold text-[#111827]">Kỳ thanh toán tới</h3>
            <SummaryLine label="Khoản thu sắp tới" value="$49.00" strong />
            <SummaryLine label="Ngày" value="Oct 12, 2024" />
            <div className="my-5 rounded-md bg-[#f2f4f6] p-4">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-primary" />
                <div>
                  <p className="font-bold text-[#111827]">Visa ending in 4242</p>
                  <p className="text-sm text-[#737686]">Expires 12/26</p>
                </div>
              </div>
            </div>
            <Link className="admin-secondary w-full" to="/organizer/billing/payment">
              Cập nhật phương thức thanh toán
            </Link>
          </OrganizerPanel>

          <OrganizerPanel>
            <div className="mb-4 flex items-center gap-3">
              <WalletCards className="size-5 text-primary" />
              <h3 className="font-extrabold text-[#111827]">Ghi chú chi phí</h3>
            </div>
            <CostTag title="Phí gói" text="Các tính năng cố định theo gói hàng tháng." />
            <CostTag title="Phí xuất bản" text="Khoản phí riêng cho mỗi sự kiện khi publish." accent />
          </OrganizerPanel>

          <section className="rounded-md bg-[#0f172a] p-5 text-white">
            <p className="text-lg font-extrabold">Cần gói Enterprise?</p>
            <p className="mt-2 text-sm text-slate-300">
              Branding riêng, domain tùy chỉnh và SLA vận hành cho sự kiện lớn.
            </p>
            <button className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-extrabold text-[#0f172a]">
              Liên hệ tư vấn
            </button>
          </section>
        </div>
      </div>
    </OrganizerPage>
  )
}

export function OrganizerPlanSelectionPage() {
  const plans = [
    ['Starter', '$0', '1 event/mo', '2 staff members', 'Basic Analytics'],
    ['Pro', '$49', '10 events/mo', '20 staff members', 'AI Insights Included'],
    ['Business', '$149', 'Unlimited events', 'Unlimited staff', 'Priority 24/7 Support'],
  ]

  return (
    <OrganizerPage
      title="Chọn gói Organizer"
      description="Chọn gói phù hợp với quy mô sự kiện. Có thể nâng cấp khi đội ngũ phát triển."
    >
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full border border-[#c3c6d7] bg-white p-1 text-sm font-bold">
          <span className="rounded-full bg-primary px-4 py-2 text-slate-950">Monthly</span>
          <span className="px-4 py-2 text-[#737686]">Yearly - save 20%</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <OrganizerPanel
            key={plan[0]}
            className={plan[0] === 'Pro' ? 'border-primary ring-2 ring-primary/20' : ''}
          >
            {plan[0] === 'Pro' && (
              <Badge tone="blue">
                Gợi ý
              </Badge>
            )}
            <h2 className="mt-3 text-xl font-extrabold text-[#111827]">{plan[0]}</h2>
            <p className="mt-2 text-3xl font-black text-[#111827]">
              {plan[1]} <span className="text-sm font-bold text-[#737686]">/mo</span>
            </p>
            <div className="my-6 grid gap-3 text-sm text-[#434655]">
              {plan.slice(2).map((feature) => (
                <span className="flex items-center gap-2" key={feature}>
                  <Check className="size-4 text-primary" />
                  {feature}
                </span>
              ))}
            </div>
            <Link
              className={plan[0] === 'Pro' ? 'admin-primary w-full' : 'admin-secondary w-full'}
              to="/organizer/billing/payment"
            >
              {plan[0] === 'Starter' ? 'Gói hiện tại' : `Chọn ${plan[0]}`}
            </Link>
          </OrganizerPanel>
        ))}
      </div>

      <OrganizerPanel className="mt-6">
        <h3 className="mb-4 text-lg font-extrabold">So sánh tính năng</h3>
        <OrganizerTable
          headers={['Tính năng', 'Starter', 'Pro', 'Business']}
          rows={[
            ['Sự kiện hàng tháng', '1', '10', 'Unlimited'],
            ['Nhân sự', '2', '20', 'Unlimited'],
            ['AI Insight', '-', 'Advanced', 'Full Suite'],
            ['Branding riêng', '-', <Check key="pro" className="size-4 text-primary" />, <Check key="business" className="size-4 text-primary" />],
          ]}
        />
      </OrganizerPanel>

      <div className="mt-6 flex justify-center">
        <Link className="admin-primary" to="/organizer/billing/payment">
          Tiếp tục thanh toán
        </Link>
      </div>
    </OrganizerPage>
  )
}

export function OrganizerSubscriptionPaymentPage() {
  return (
    <OrganizerPage title="Thanh toán gói" description="Hoàn tất thanh toán Pro Plan bằng PayOS.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <OrganizerPanel>
          <p className="mb-3 text-xs font-extrabold uppercase text-[#737686]">Phương thức thanh toán</p>
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            {[
              ['PayOS QR', QrCode],
              ['Credit Card', CreditCard],
              ['Bank Transfer', WalletCards],
            ].map(([label, Icon], index) => (
              <button
                className={`rounded-md border p-4 text-sm font-extrabold ${
                  index === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-[#c3c6d7]'
                }`}
                key={label}
              >
                <Icon className="mx-auto mb-2 size-5" />
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-5 md:grid-cols-[220px_1fr]">
            <PaymentQr />
            <div>
              <h2 className="text-lg font-extrabold text-[#111827]">Quét để thanh toán với PayOS</h2>
              <p className="mt-2 text-sm leading-6 text-[#434655]">
                Mở app ngân hàng hoặc ví điện tử, quét QR và xác nhận đúng nội dung thanh toán.
              </p>
              <div className="mt-5 grid gap-3 rounded-md bg-[#eef2ff] p-4 text-sm">
                <SummaryLine label="Hết hạn sau" value="13:27" />
                <SummaryLine label="Trạng thái" value="Đang chờ thanh toán" />
              </div>
            </div>
          </div>
        </OrganizerPanel>

        <OrganizerPanel>
          <h2 className="mb-4 text-lg font-extrabold">Tóm tắt đơn hàng</h2>
          <div className="mb-4 rounded-md bg-[#eef2ff] p-4">
            <p className="font-extrabold">Pro Plan - Monthly</p>
            <p className="text-sm text-[#737686]">Full access to organizer tools</p>
          </div>
          <SummaryLine label="Subtotal" value="$49.00" />
          <SummaryLine label="Tax" value="$0.00" />
          <div className="mt-4 border-t border-[#e0e3e5] pt-4">
            <SummaryLine label="Total" value="$49.00" strong />
          </div>
          <div className="mt-4 flex gap-2">
            <input className="h-10 min-w-0 flex-1 rounded-md border border-[#c3c6d7] px-3 text-sm" placeholder="Promo code" />
            <button className="admin-secondary">Apply</button>
          </div>
          <p className="mt-4 flex gap-2 text-xs leading-5 text-[#737686]">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            Thanh toán được mã hóa và xử lý an toàn qua PayOS.
          </p>
        </OrganizerPanel>
      </div>
    </OrganizerPage>
  )
}

export function OrganizerBillingHistoryPage() {
  return (
    <OrganizerPage
      title="Lịch sử thanh toán"
      description="Xem subscription, phí sự kiện và tải hóa đơn."
      action="Export dữ liệu"
    >
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-5">
          <MetricCard label="Tổng thanh toán" value="$12,450.00" />
          <MetricCard label="Gói hiện tại" value="Enterprise Pro" sub="Gia hạn: Oct 12, 2024" />
          <OrganizerPanel className="border-dashed text-center">
            <CreditCard className="mx-auto mb-2 size-6 text-primary" />
            <p className="font-bold">Cập nhật phương thức thanh toán</p>
            <p className="mt-1 text-sm text-[#737686]">Visa ending in 4242</p>
          </OrganizerPanel>
        </div>
        <div className="space-y-6">
          <OrganizerTable
            headers={['Ngày', 'Gói', 'Số tiền', 'Trạng thái', 'Hóa đơn']}
            rows={invoices.map((invoice) => [
              invoice[0],
              <span key="plan" className="font-bold text-primary">{invoice[1]}</span>,
              invoice[2],
              <Badge key="status" tone="green">{invoice[3]}</Badge>,
              <Link key="invoice" to="/organizer/billing/invoice" className="text-primary">
                <ReceiptText className="size-5" />
              </Link>,
            ])}
          />
          <Insight title="AI Spend Analysis">
            Dựa trên tăng trưởng hiện tại, chuyển sang thanh toán năm có thể tiết kiệm khoảng $1,190 trong 12 tháng tới.
          </Insight>
        </div>
      </div>
    </OrganizerPage>
  )
}

export function OrganizerInvoicePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#737686] hover:text-primary" to="/organizer/billing">
          <ArrowLeft className="size-4" />
          Quay lại Billing
        </Link>
        <div className="flex gap-3">
          <button className="admin-secondary">Print</button>
          <button className="admin-primary">
            <Download className="size-4" />
            Download PDF
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-md border border-[#c3c6d7] bg-white p-8 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ai via-primary to-ai" />
        <div className="mb-8 flex flex-col gap-5 border-b border-[#e0e3e5] pb-8 md:flex-row md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-md bg-primary text-slate-950">
                <Calendar className="size-6" />
              </span>
              <span className="text-2xl font-black text-[#111827]">EventHub</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#5c647a]">
              88 Market St, Suite 500<br />San Francisco, CA 94103<br />United States
            </p>
          </div>
          <div className="md:text-right">
            <h1 className="text-2xl font-extrabold">Invoice</h1>
            <p className="mt-1 font-bold text-primary">#INV-2024-001</p>
            <p className="mt-2 text-sm text-[#737686]">Issued: Oct 01, 2024</p>
            <Badge tone="green">Paid</Badge>
          </div>
        </div>

        <div className="mb-8 grid gap-5 md:grid-cols-2">
          <InfoBox title="Billed To" lines={['Alex Rivers', 'TechNexus Solutions Inc.', 'arivers@technexus.io', '+1 (555) 012-3456']} />
          <InfoBox title="Payment Details" lines={['PayOS (Visa •••• 4242)', 'TXN_99210085', 'Oct 01, 2024, 09:42 AM']} />
        </div>

        <OrganizerTable
          headers={['Mô tả', 'Loại', 'SL', 'Đơn giá', 'Tổng']}
          rows={[
            ['Pro Plan Subscription (Monthly)', <Badge key="saas" tone="blue">SaaS</Badge>, '1', '$49.00', '$49.00'],
            ['Event Publishing Fee: TechNexus Summit', <Badge key="event" tone="purple">Event</Badge>, '1', '$100.00', '$100.00'],
          ]}
        />

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-sm space-y-3">
            <SummaryLine label="Subtotal" value="$149.00" />
            <SummaryLine label="Processing Fee (0%)" value="$0.00" />
            <SummaryLine label="Total Amount" value="$149.00" strong />
            <p className="text-right text-xs font-semibold text-[#737686]">Khoảng 3,725,000 VND</p>
          </div>
        </div>
      </section>

      <OrganizerPanel className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-3">
          <HelpCircle className="size-5 text-primary" />
          <span>
            <span className="block font-bold">Cần hỗ trợ hóa đơn?</span>
            <span className="text-sm text-[#737686]">Liên hệ billing nếu có sai lệch.</span>
          </span>
        </span>
        <button className="admin-secondary">Raise Ticket</button>
      </OrganizerPanel>
    </div>
  )
}

export function OrganizerPublishingFeePage() {
  return (
    <OrganizerPage
      title="Tạo sự kiện"
      description="Bước cuối: rà soát và thanh toán phí xuất bản."
      eyebrow="Events / Create Event / Review & Publishing"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <OrganizerPanel>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Review & Publishing Fee</h2>
              <Badge tone="red">Fee pending</Badge>
            </div>
            <FeeLine label="Base Publishing Fee" value="200,000 VND" />
            <FeeLine label="Pro Plan Discount (25%)" value="-50,000 VND" accent />
            <div className="mt-5 rounded-md bg-orange-50 p-4 text-sm text-orange-800">
              Phí này được tính cho mỗi sự kiện. Cần thanh toán trước khi publish.
            </div>
            <div className="mt-5 border-t border-[#e0e3e5] pt-5">
              <SummaryLine label="Final Event Fee" value="150,000 VND" strong />
            </div>
          </OrganizerPanel>
          <Insight title="AI Optimization Insight">
            Bạn có thể tăng tương tác bằng cách tối ưu ảnh bìa và lịch mở bán dựa trên nhóm người xem đang hoạt động.
          </Insight>
        </div>

        <div className="space-y-5">
          <OrganizerPanel>
            <h3 className="mb-4 font-extrabold">Tóm tắt sự kiện</h3>
            <div className="mb-4 h-28 rounded-md bg-[linear-gradient(135deg,#0f172a,#1d4ed8,#38bdf8)]" />
            <p className="font-bold">Global Tech Innovators Summit</p>
            <p className="text-sm text-[#737686]">Dec 15, 2024 • Pro Plan</p>
          </OrganizerPanel>
          <Link className="admin-primary w-full" to="/organizer/events/publishing-payment">
            Pay Event Fee
          </Link>
          <button className="admin-secondary w-full">Save Draft</button>
        </div>
      </div>
    </OrganizerPage>
  )
}

export function OrganizerPublishingPaymentPage() {
  return (
    <OrganizerPage
      title="Thanh toán phí xuất bản"
      description="Hoàn tất giao dịch để đưa sự kiện vào lịch công khai."
    >
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <OrganizerPanel>
            <p className="font-extrabold">TechNexus Summit 2024</p>
            <p className="mt-1 text-sm text-[#737686]">Oct 21, 2024</p>
            <div className="mt-4">
              <Badge tone="red">Pending Payment</Badge>
            </div>
          </OrganizerPanel>
          <OrganizerPanel>
            <h2 className="mb-4 font-extrabold">Fee Breakdown</h2>
            <FeeLine label="Base Fee" value="200,000 VND" />
            <FeeLine label="Plan Discount (Early Bird)" value="-50,000 VND" accent />
            <SummaryLine label="Total" value="150,000 VND" strong />
          </OrganizerPanel>
          <Insight>
            Publish sớm giúp sự kiện có cơ hội xuất hiện trong carousel gợi ý tuần này.
          </Insight>
        </div>
        <OrganizerPanel>
          <h2 className="mb-4 text-center font-extrabold">Quét bằng Banking App</h2>
          <PaymentQr large />
          <p className="mt-4 rounded-md bg-[#eef2ff] p-3 text-sm text-[#434655]">
            Quét QR và thanh toán đúng nội dung. Hệ thống thường xác nhận trong 30 giây.
          </p>
          <button className="admin-primary mt-4 w-full">Tôi đã thanh toán</button>
          <button className="admin-secondary mt-3 w-full">Cancel Payment</button>
        </OrganizerPanel>
      </div>
    </OrganizerPage>
  )
}

export function OrganizerEventBillingDetailPage() {
  return (
    <OrganizerPage
      title="Annual Tech Summit 2024"
      description="Quản lý trạng thái vận hành và tài chính của sự kiện."
      eyebrow="Events / Annual Tech Summit 2024"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="h-72 overflow-hidden rounded-md border border-[#c3c6d7] bg-[radial-gradient(circle_at_center,#38bdf8_0,#1d4ed8_32%,#0f172a_70%)] shadow-sm" />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Registrations" value="1,248 / 1,500" />
            <MetricCard label="Total Revenue" value="320.5M VND" />
            <MetricCard label="Days Remaining" value="14 Days" />
          </div>
          <Insight title="AI Operational Insight">
            Registration đang cao hơn 15% so với sự kiện trước. Trạng thái billing đã hoàn tất và không còn phí chờ xử lý.
          </Insight>
        </div>
        <div className="space-y-5">
          <OrganizerPanel>
            <h2 className="mb-4 text-lg font-extrabold">Billing & Operational Status</h2>
            <SummaryLine label="Event Status" value="Published" />
            <div className="my-5 rounded-md bg-[#f2f4f6] p-4">
              <p className="text-xs font-extrabold uppercase text-[#737686]">Publishing Fee</p>
              <p className="mt-1 text-2xl font-black text-[#111827]">150,000 VND</p>
              <Badge tone="green">Paid</Badge>
            </div>
            <SummaryLine label="Method" value="PayOS QR" />
            <SummaryLine label="Transaction ID" value="TXN-9921-TX" />
            <SummaryLine label="Subscription at Creation" value="Pro Plan" />
            <Link className="admin-primary mt-5 w-full" to="/organizer/billing/invoice">
              View Receipt
            </Link>
            <button className="admin-secondary mt-3 w-full">Download Invoice</button>
          </OrganizerPanel>
          <OrganizerPanel>
            <h3 className="mb-4 font-extrabold">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button className="admin-secondary">Add Staff</button>
              <button className="admin-secondary">Reports</button>
            </div>
          </OrganizerPanel>
        </div>
      </div>
    </OrganizerPage>
  )
}

function UsageCard({ label, value, percent, ai = false }) {
  return (
    <OrganizerPanel className={ai ? 'border-ai' : ''}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-[#737686]">{label}</span>
        <span className="text-xl font-extrabold text-[#111827]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
        <div className={ai ? 'h-full bg-ai' : 'h-full bg-primary'} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-[#737686]">{ai ? 'Smart processing active' : `${percent}% capacity used`}</p>
    </OrganizerPanel>
  )
}

function SummaryLine({ label, value, strong = false }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? 'font-extrabold text-[#111827]' : 'text-sm text-[#434655]'}`}>
      <span>{label}</span>
      <span className={strong ? 'text-primary' : 'font-bold text-[#111827]'}>{value}</span>
    </div>
  )
}

function CostTag({ title, text, accent = false }) {
  return (
    <div className="mb-4 flex gap-3">
      <span className={`mt-1 h-12 w-1 rounded-full ${accent ? 'bg-tertiary' : 'bg-primary'}`} />
      <span>
        <span className="block text-xs font-extrabold uppercase text-primary">{title}</span>
        <span className="text-sm text-[#737686]">{text}</span>
      </span>
    </div>
  )
}

function PaymentQr({ large = false }) {
  return (
    <div className={`grid place-items-center rounded-md border border-[#c3c6d7] bg-[#f2f4f6] ${large ? 'h-72' : 'h-56'}`}>
      <div className="grid size-36 place-items-center rounded-md bg-white shadow-inner">
        <QrCode className="size-24 text-[#111827]" />
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub }) {
  return (
    <OrganizerPanel>
      <p className="text-xs font-extrabold uppercase text-[#737686]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#111827]">{value}</p>
      {sub && <p className="mt-1 text-sm text-[#737686]">{sub}</p>}
    </OrganizerPanel>
  )
}

function InfoBox({ title, lines }) {
  return (
    <div className="rounded-md border border-[#e0e3e5] bg-[#f7f9fb] p-5">
      <h3 className="mb-3 text-xs font-extrabold uppercase text-[#737686]">{title}</h3>
      <div className="space-y-1 text-sm text-[#434655]">
        {lines.map((line, index) => (
          <p className={index === 0 ? 'font-extrabold text-[#111827]' : ''} key={line}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

function FeeLine({ label, value, accent = false }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e0e3e5] py-3 text-sm">
      <span className={accent ? 'font-bold text-primary' : 'text-[#434655]'}>{label}</span>
      <span className="font-extrabold text-[#111827]">{value}</span>
    </div>
  )
}
