import {
  BarChart3,
  Bot,
  Camera,
  LayoutDashboard,
  QrCode,
  Search,
  Ticket,
  UserCheck,
} from 'lucide-react'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { events } from '@/data/events.js'

const customerMenu = [
  ['Khám phá sự kiện', '/discover'],
  ['Yêu thích', '/favorites'],
  ['Vé của tôi', '/my-tickets'],
  ['Thông báo', '/notifications'],
  ['AI FAQ Bot', '/ai-faq'],
  ['Yêu cầu làm organizer', '/organizer-request'],
  ['Hồ sơ', '/profile'],
]

const organizerMenu = [
  'Dashboard',
  'Sự kiện của tôi',
  'Hạng vé',
  'Địa điểm',
  'Sơ đồ ghế',
  'Mã khuyến mãi',
  'Đơn hàng',
  'Người tham dự',
  'Nhân sự',
  'Tác vụ',
  'Thông báo',
  'Check-in',
  'Doanh thu',
  'Phân tích bán vé',
  'Báo cáo phản hồi',
  'AI tài chính',
  'Gói dịch vụ',
]

const staffMenu = [
  'Sự kiện được giao',
  'Tác vụ được giao',
  'QR Check-in',
  'Check-in thủ công',
  'Bán vé tại chỗ',
  'Số lượt check-in',
  'Hồ sơ',
]

const adminMenu = [
  'Analytics Dashboard',
  'Tài khoản',
  'Yêu cầu organizer',
  'Duyệt sự kiện',
  'Danh mục',
  'Phí nền tảng',
  'Chính sách',
  'Gói đăng ký',
  'Hồ sơ',
]


export function FavoriteEventsPage() {
  return (
    <CustomerShell title="Sự kiện yêu thích">
      <div className="grid gap-6 md:grid-cols-3">
        {events.slice(0, 3).map((event) => (
          <div key={event.id}>
            <EventCard event={event} compact />
            <button className="mt-3 w-full rounded-md border border-error/40 py-2 text-sm font-bold text-error">
              Xóa khỏi yêu thích
            </button>
          </div>
        ))}
      </div>
    </CustomerShell>
  )
}

export function RequestRefundPage() {
  return (
    <SimplePage
      title="Yêu cầu hoàn vé"
      description="Gửi yêu cầu hoàn tiền và theo dõi trạng thái xử lý."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="glass-panel rounded-lg p-6">
          <Input
            label="Lý do hoàn vé"
            placeholder="Tôi không thể tham dự sự kiện..."
          />
          <textarea className="mt-4 min-h-32 w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary" />
          <button className="mt-5 rounded-md bg-tertiary px-5 py-3 font-bold text-white">
            Gửi yêu cầu
          </button>
        </section>
        <aside className="glass-panel rounded-lg p-6">
          <h3 className="font-display text-xl font-bold text-white">
            Tóm tắt chính sách
          </h3>
          <p className="mt-3 text-sm text-muted">
            Hoàn tiền trước sự kiện 7 ngày, trừ 5% phí xử lý.
          </p>
          <p className="mt-5 text-sm text-muted">Số tiền dự kiến hoàn</p>
          <p className="font-display text-3xl font-bold text-success">
            $160.40
          </p>
          <ol className="mt-6 space-y-3 text-sm text-subtle">
            <li>1. Đã gửi yêu cầu</li>
            <li>2. Đang xét duyệt</li>
            <li>3. Hoàn tiền về phương thức thanh toán</li>
          </ol>
        </aside>
      </div>
    </SimplePage>
  )
}

export function NotificationsPage() {
  const rows = [
    'Nhắc lịch sự kiện Neon Symphony',
    'Thanh toán thành công',
    'Cập nhật hoàn vé',
    'Thông báo từ ban tổ chức',
  ]
  return (
    <CustomerShell title="Thông báo">
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={row}
            className={`rounded-lg border p-4 ${index === 0 ? 'border-primary bg-primary/10' : 'border-border-soft bg-panel'}`}
          >
            <p className="font-bold text-white">{row}</p>
            <p className="mt-1 text-sm text-muted">
              {index === 0 ? 'Chưa đọc' : 'Đã đọc'} - Cập nhật mới từ EventHub.
            </p>
          </div>
        ))}
      </div>
    </CustomerShell>
  )
}

export function AIFaqPage() {
  return (
    <SimplePage
      title="EventHub AI FAQ"
      description="Trợ lý AI hỗ trợ vé, hoàn tiền, địa điểm và lịch trình."
      accent="text-ai"
    >
      <div className="glass-panel mx-auto max-w-4xl rounded-lg p-6">
        <div className="min-h-80 space-y-4">
          <Chat
            who="AI"
            text="Xin chào, tôi có thể hỗ trợ bạn tải vé, kiểm tra địa điểm hoặc chính sách hoàn tiền."
          />
          <Chat who="Bạn" text="Tôi tải vé QR ở đâu?" right />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            'Làm sao tải vé?',
            'Tôi có thể hoàn vé không?',
            'Địa điểm ở đâu?',
            'Sự kiện bắt đầu lúc mấy giờ?',
          ].map((q) => (
            <button
              key={q}
              className="rounded-full border border-ai/40 px-3 py-2 text-sm text-ai"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input
            className="flex-1 rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-ai"
            placeholder="Nhập câu hỏi..."
          />
          <button className="rounded-md bg-ai px-5 py-3 font-bold text-white">
            Gửi
          </button>
        </div>
      </div>
    </SimplePage>
  )
}

export function FeedbackPage() {
  return (
    <SimplePage
      title="Phản hồi"
      description="Gửi góp ý về trải nghiệm đặt vé, sự kiện hoặc hỗ trợ từ EventHub."
    >
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
        <section className="glass-panel rounded-lg p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Họ và tên" placeholder="Nhập họ tên" />
            <Input label="Email" placeholder="email@example.com" type="email" />
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-muted">Nội dung phản hồi</span>
            <textarea
              className="mt-2 min-h-36 w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary"
              placeholder="Chia sẻ vấn đề hoặc góp ý của bạn"
            />
          </label>
          <button className="mt-5 rounded-md bg-primary px-5 py-3 font-bold text-slate-950">
            Gửi phản hồi
          </button>
        </section>
        <StatusCard
          title="Thời gian phản hồi"
          value="Trong 24 giờ"
          tone="success"
        />
      </div>
    </SimplePage>
  )
}

export { OrganizerRequestPage } from '@/pages/customer/OrganizerRequestPage.jsx'

export function OrganizerDashboardPage() {
  return (
    <DashboardShell title="Dashboard ban tổ chức" menu={organizerMenu}>
      <KpiGrid
        items={[
          ['Tổng sự kiện', '42'],
          ['Đã xuất bản', '31'],
          ['Vé đã bán', '18.240'],
          ['Doanh thu', '$428K'],
          ['Tỷ lệ check-in', '82%'],
          ['Hoàn vé chờ xử lý', '18'],
        ]}
      />
      <DashboardCharts />
      <Insight />
    </DashboardShell>
  )
}

export function CreateEventWizardPage() {
  return (
    <DashboardShell title="Tạo sự kiện mới" menu={organizerMenu}>
      <Wizard
        steps={[
          'Thông tin cơ bản',
          'Ngày giờ',
          'Địa điểm',
          'Hạng vé',
          'Sơ đồ ghế',
          'Xem trước & gửi duyệt',
        ]}
      />
      <FormGrid
        fields={[
          'Tên sự kiện',
          'Danh mục',
          'Mô tả',
          'Ảnh banner',
          'Ngày bắt đầu',
          'Địa điểm',
        ]}
      />
      <div className="mt-6 flex gap-3">
        <button className="rounded-md border border-border-soft px-5 py-3 font-bold text-subtle">
          Lưu nháp
        </button>
        <button className="rounded-md bg-primary px-5 py-3 font-bold text-slate-950">
          Gửi duyệt
        </button>
      </div>
    </DashboardShell>
  )
}

export function OrganizerEventListPage() {
  return (
    <DashboardShell title="Sự kiện của tôi" menu={organizerMenu}>
      <Toolbar
        placeholder="Tìm theo tên sự kiện..."
        filters={['Nháp', 'Chờ duyệt', 'Đã xuất bản', 'Đã hủy', 'Ẩn']}
      />
      <DataTable
        headers={[
          'Sự kiện',
          'Trạng thái',
          'Vé đã bán',
          'Doanh thu',
          'Hành động',
        ]}
        rows={[
          [
            'Neon Symphony',
            'Đã xuất bản',
            '8.420',
            '$168K',
            'Xem / Cập nhật / Hủy',
          ],
          ['AI Dev Summit', 'Chờ duyệt', '0', '$0', 'Xem / Gửi lại'],
        ]}
      />
    </DashboardShell>
  )
}

export function OrderListPage() {
  return (
    <DashboardShell title="Danh sách đơn hàng" menu={organizerMenu}>
      <Toolbar
        placeholder="Tìm mã đơn, khách hàng, sự kiện..."
        filters={['Đã thanh toán', 'Chờ thanh toán', 'Đã hoàn tiền']}
      />
      <DataTable
        headers={[
          'Mã đơn',
          'Khách hàng',
          'Sự kiện',
          'Số tiền',
          'Thanh toán',
          'Trạng thái',
          'Ngày tạo',
        ]}
        rows={[
          [
            '#EH-99201',
            'Alex Rivera',
            'Neon Symphony',
            '$169.90',
            'Thành công',
            'Hoàn tất',
            '24 Th10',
          ],
          [
            '#EH-99202',
            'Minh Anh',
            'AI Dev Summit',
            '$49.00',
            'Chờ',
            'Giữ vé',
            '25 Th10',
          ],
        ]}
      />
    </DashboardShell>
  )
}

export function AttendeeListPage() {
  return (
    <DashboardShell title="Danh sách người tham dự" menu={organizerMenu}>
      <Toolbar
        placeholder="Tìm tên, email, hạng vé..."
        filters={['Đã check-in', 'Chưa check-in']}
      />
      <DataTable
        headers={['Tên', 'Email', 'Hạng vé', 'Check-in', 'Thời gian']}
        rows={[
          ['Felix Arvid', 'felix@example.com', 'VIP', 'Đã check-in', '19:12'],
          ['Alex Rivera', 'alex@example.com', 'Thường', 'Chưa', '-'],
        ]}
      />
      <button className="mt-5 rounded-md bg-primary px-5 py-3 font-bold text-slate-950">
        Xuất danh sách
      </button>
    </DashboardShell>
  )
}

export function RevenueDashboardPage() {
  return (
    <DashboardShell title="Doanh thu" menu={organizerMenu}>
      <KpiGrid
        items={[
          ['Tổng doanh thu', '$428K'],
          ['Doanh thu ròng', '$392K'],
          ['Phí nền tảng', '$21K'],
          ['Hoàn tiền', '$15K'],
          ['Payout chờ xử lý', '$48K'],
        ]}
      />
      <DashboardCharts />
    </DashboardShell>
  )
}

export function StaffDashboardPage() {
  return (
    <DashboardShell title="Dashboard nhân sự" menu={staffMenu}>
      <KpiGrid
        items={[
          ['Sự kiện hôm nay', '3'],
          ['Tác vụ được giao', '12'],
          ['Đã check-in', '1.284'],
          ['Còn lại', '436'],
        ]}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <QuickAction icon={QrCode} title="Quét QR" />
        <QuickAction icon={UserCheck} title="Check-in thủ công" />
        <QuickAction icon={Ticket} title="Bán vé tại chỗ" />
      </div>
    </DashboardShell>
  )
}

export function QrCheckInPage() {
  return (
    <DashboardShell title="QR Check-in" menu={staffMenu}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="glass-panel rounded-lg p-6 text-center">
          <Camera className="mx-auto size-16 text-primary" />
          <div className="mx-auto mt-6 grid size-72 place-items-center rounded-lg border border-dashed border-primary/50 bg-panel-soft">
            <QrCode className="size-28 text-primary" />
          </div>
          <button className="mt-6 rounded-md bg-success px-5 py-3 font-bold text-white">
            Xác nhận check-in
          </button>
        </section>
        <div className="space-y-3">
          {['Vé hợp lệ', 'Đã check-in', 'Vé không hợp lệ', 'Vé đã hoàn'].map(
            (state, index) => (
              <StatusCard
                key={state}
                title={state}
                value={index === 0 ? 'Sẵn sàng xác nhận' : 'Cần xử lý'}
                tone={
                  index === 0 ? 'success' : index === 1 ? 'warning' : 'error'
                }
              />
            ),
          )}
        </div>
      </div>
    </DashboardShell>
  )
}

export function OnSiteBookingPage() {
  return (
    <DashboardShell title="Bán vé tại chỗ" menu={staffMenu}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <FormGrid
          fields={[
            'Chọn sự kiện',
            'Chọn hạng vé',
            'Tên khách hàng',
            'Email',
            'Số điện thoại',
            'Số lượng',
          ]}
        />
        <section className="glass-panel rounded-lg p-6">
          <h3 className="font-display text-xl font-bold text-white">
            Tóm tắt đơn tại chỗ
          </h3>
          <p className="mt-5 text-muted">Neon Symphony - Vé thường x2</p>
          <p className="mt-5 font-display text-3xl font-bold text-primary">
            $178.00
          </p>
          <button className="mt-6 w-full rounded-md bg-tertiary py-3 font-bold text-white">
            Xác nhận thanh toán tại chỗ
          </button>
        </section>
      </div>
    </DashboardShell>
  )
}

export function AdminDashboardPage() {
  return (
    <DashboardShell title="Admin Analytics Dashboard" menu={adminMenu}>
      <KpiGrid
        items={[
          ['Người dùng', '84.210'],
          ['Organizer', '1.284'],
          ['Sự kiện', '4.920'],
          ['Tổng doanh thu', '$2.8M'],
          ['Phí nền tảng', '$210K'],
          ['Yêu cầu chờ', '42'],
          ['Sự kiện chờ duyệt', '18'],
        ]}
      />
      <DashboardCharts />
      <Insight
        title="AI platform insight"
        text="Doanh thu tăng mạnh ở nhóm hội nghị và âm nhạc. Nên tăng đề xuất gói organizer Pro cho nhóm bán trên 5.000 vé/tháng."
      />
    </DashboardShell>
  )
}

export function AccountListPage() {
  return (
    <DashboardShell title="Quản lý tài khoản" menu={adminMenu}>
      <Toolbar
        placeholder="Tìm tên, email, vai trò..."
        filters={['Customer', 'Organizer', 'Staff', 'Admin', 'Đang khóa']}
      />
      <DataTable
        headers={[
          'Tên',
          'Email',
          'Vai trò',
          'Trạng thái',
          'Ngày tạo',
          'Đăng nhập cuối',
          'Hành động',
        ]}
        rows={[
          [
            'Alex Rivera',
            'alex@example.com',
            'Customer',
            'Hoạt động',
            '12 Th09',
            'Hôm nay',
            'Xem / Khóa',
          ],
          [
            'Sonic Ops',
            'ops@sonic.vn',
            'Organizer',
            'Hoạt động',
            '02 Th08',
            'Hôm qua',
            'Xem / Khóa',
          ],
        ]}
      />
    </DashboardShell>
  )
}

export function EventReviewPage() {
  return (
    <DashboardShell title="Duyệt sự kiện" menu={adminMenu}>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <DataTable
          headers={['Sự kiện', 'Organizer', 'Danh mục', 'Trạng thái']}
          rows={[
            ['AI Dev Summit', 'Tech Frontiers', 'Hội nghị', 'Chờ duyệt'],
            ['Food Fest', 'Global Events', 'Lễ hội', 'Cần chỉnh sửa'],
          ]}
        />
        <section className="glass-panel rounded-lg p-6">
          <h3 className="font-display text-xl font-bold text-white">
            Checklist duyệt
          </h3>
          {[
            'Thông tin đầy đủ',
            'Ảnh phù hợp',
            'Chính sách vé rõ ràng',
            'Địa điểm hợp lệ',
          ].map((item) => (
            <label
              key={item}
              className="mt-4 flex items-center gap-3 text-sm text-subtle"
            >
              <input type="checkbox" className="accent-primary" /> {item}
            </label>
          ))}
          <div className="mt-6 flex gap-3">
            <button className="rounded-md bg-success px-4 py-2 font-bold text-white">
              Duyệt
            </button>
            <button className="rounded-md bg-warning px-4 py-2 font-bold text-slate-950">
              Yêu cầu sửa
            </button>
            <button className="rounded-md bg-error px-4 py-2 font-bold text-white">
              Ẩn
            </button>
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}

export function PlatformFeePage() {
  return (
    <DashboardShell title="Cấu hình phí nền tảng" menu={adminMenu}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="glass-panel rounded-lg p-6">
          <FormGrid
            fields={[
              'Loại phí: phần trăm hoặc cố định',
              'Giá trị phí',
              'Áp dụng toàn nền tảng',
              'Áp dụng theo danh mục',
            ]}
          />
          <button className="mt-6 rounded-md bg-primary px-5 py-3 font-bold text-slate-950">
            Lưu cấu hình
          </button>
        </section>
        <section className="glass-panel rounded-lg p-6">
          <h3 className="font-display text-xl font-bold text-white">
            Mô phỏng phí
          </h3>
          <p className="mt-4 text-muted">Giá vé: $100</p>
          <p className="text-muted">Phí nền tảng: 5%</p>
          <p className="mt-4 font-display text-3xl font-bold text-primary">
            $5.00
          </p>
        </section>
      </div>
    </DashboardShell>
  )
}

function CustomerShell({ title, children }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
      <aside className="glass-panel h-fit rounded-lg p-4">
        {customerMenu.map(([label, href]) => (
          <a
            key={label}
            href={href}
            className="block rounded-md px-4 py-3 text-sm font-bold text-muted hover:bg-panel-soft hover:text-primary"
          >
            {label}
          </a>
        ))}
      </aside>
      <main>
        <SectionHeader title={title} />
        {children}
      </main>
    </div>
  )
}

function DashboardShell({ title, menu, children }) {
  return (
    <div className="grid min-h-[calc(100vh-132px)] lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r border-border-soft bg-surface p-4 lg:block">
        <div className="mb-5 flex items-center gap-3 px-3">
          <LayoutDashboard className="size-5 text-primary" />
          <span className="font-display font-bold text-white">
            EventHub Ops
          </span>
        </div>
        <nav className="space-y-1">
          {menu.map((item, index) => (
            <a
              key={item}
              href="#"
              className={`block rounded-md px-3 py-2 text-sm font-semibold ${index === 0 ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-panel-soft hover:text-white'}`}
            >
              {item}
            </a>
          ))}
        </nav>
      </aside>
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <SectionHeader title={title} />
        {children}
      </main>
    </div>
  )
}

function SimplePage({ title, description, children, accent = 'text-primary' }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className={`font-display text-4xl font-extrabold ${accent}`}>
          {title}
        </h1>
        <p className="mt-2 text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

function KpiGrid({ items }) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, value]) => (
        <section key={label} className="glass-panel rounded-lg p-5">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 font-display text-3xl font-extrabold text-white">
            {value}
          </p>
        </section>
      ))}
    </div>
  )
}

function DashboardCharts() {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Chart title="Biểu đồ doanh thu" icon={BarChart3} />
      <Chart title="Biểu đồ bán vé" icon={Ticket} />
    </div>
  )
}

function Chart({ title, icon: Icon }) {
  return (
    <section className="glass-panel rounded-lg p-6">
      <div className="mb-6 flex items-center gap-2">
        <Icon className="size-5 text-primary" />
        <h3 className="font-display text-xl font-bold text-white">{title}</h3>
      </div>
      <div className="flex h-56 items-end gap-3">
        {[45, 70, 52, 84, 62, 96, 78].map((height, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-md bg-primary/80"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </section>
  )
}

function Insight({
  title = 'AI insight',
  text = 'Nhu cầu mua vé tăng ở khung 20:00 - 22:00. Nên mở thêm hạng vé early access và đẩy thông báo cho nhóm khách đã yêu thích sự kiện.',
}) {
  return (
    <section className="mt-6 rounded-lg border border-ai/40 bg-ai/10 p-6">
      <div className="flex items-center gap-2 text-ai">
        <Bot className="size-5" />
        <h3 className="font-display text-xl font-bold">{title}</h3>
      </div>
      <p className="mt-3 text-subtle">{text}</p>
    </section>
  )
}

function Toolbar({ placeholder, filters }) {
  return (
    <div className="glass-panel mb-6 flex flex-col gap-3 rounded-lg p-4 lg:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          className="w-full rounded-md border border-border-soft bg-surface py-3 pl-10 pr-3 outline-none focus:border-primary"
          placeholder={placeholder}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            className="rounded-md border border-border-soft px-3 py-2 text-sm font-bold text-subtle"
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  )
}

function DataTable({ headers, rows }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-soft bg-panel">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-panel-soft text-subtle">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border-soft">
              {row.map((cell) => (
                <td key={cell} className="px-4 py-3 text-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormGrid({ fields }) {
  return (
    <section className="glass-panel rounded-lg p-6">
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <Input key={field} label={field} placeholder={field} />
        ))}
      </div>
    </section>
  )
}

function Input({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        {...props}
        className="mt-2 w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary"
      />
    </label>
  )
}

function Wizard({ steps }) {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto">
      {steps.map((step, index) => (
        <div
          key={step}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${index === 0 ? 'bg-primary text-slate-950' : 'border border-border-soft text-muted'}`}
        >
          {index + 1}. {step}
        </div>
      ))}
    </div>
  )
}

function StatusCard({ title, value, tone = 'primary' }) {
  const tones = {
    primary: 'border-primary/40 bg-primary/10 text-primary',
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
  }
  return (
    <section className={`rounded-lg border p-5 ${tones[tone]}`}>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm">{value}</p>
    </section>
  )
}

function QuickAction({ icon: Icon, title }) {
  return (
    <button className="glass-panel rounded-lg p-6 text-left transition hover:border-primary/60">
      <Icon className="size-8 text-primary" />
      <p className="mt-4 font-display text-xl font-bold text-white">{title}</p>
    </button>
  )
}

function Chat({ who, text, right }) {
  return (
    <div className={`flex ${right ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-md rounded-lg px-4 py-3 ${right ? 'bg-primary text-slate-950' : 'bg-panel-soft text-subtle'}`}
      >
        <p className="text-xs font-bold">{who}</p>
        <p className="mt-1">{text}</p>
      </div>
    </div>
  )
}
