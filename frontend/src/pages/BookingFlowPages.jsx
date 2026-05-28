import {
  ArrowRight,
  Check,
  Clock,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { events, qrImage } from '@/data/events.js'

const event = events[0]
const selectedSeats = ['VIP-A 12', 'VIP-A 13']

export function BookingTicketsPage() {
  return (
    <BookingShell step={1}>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <EventStrip />
          <h1 className="mb-5 mt-6 font-display text-2xl font-bold text-white">
            Chọn loại vé
          </h1>
          <div className="space-y-4">
            <TicketType
              title="VIP Front Row Seating"
              desc="Ghế trước sân khấu, vào cổng ưu tiên, quà lưu niệm."
              price="$249.00"
            />
            <TicketType
              title="General Admission"
              desc="Vé vào khu vực festival tiêu chuẩn."
              price="$89.00"
            />
            <TicketType
              title="Early Bird Special"
              desc="Đã bán hết."
              price="$45.00"
              disabled
            />
          </div>
        </section>
        <OrderCard cta="Tiếp tục chọn ghế" to="/booking/seats" />
      </div>
    </BookingShell>
  )
}

export function BookingSeatsPage() {
  return (
    <BookingShell step={1}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h1 className="mb-5 font-display text-2xl font-bold text-white">
            Chọn ghế của bạn
          </h1>
          <div className="rounded-lg border border-border-soft bg-panel p-6">
            <div className="mx-auto mb-8 h-5 max-w-md rounded-t-full bg-slate-950 text-center text-xs font-bold text-white">
              STAGE
            </div>
            <div className="space-y-8">
              <SeatGrid rows={3} cols={12} selected={[2, 3]} />
              <SeatGrid rows={8} cols={1} selected={[]} />
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-primary/40 bg-primary/10 p-4">
            <p className="text-sm font-bold text-primary">Ghế đã chọn</p>
            <div className="mt-3 flex gap-3">
              {selectedSeats.map((seat) => (
                <span
                  key={seat}
                  className="rounded-md border border-primary bg-surface px-4 py-2 font-bold text-primary"
                >
                  {seat}
                </span>
              ))}
            </div>
          </div>
        </section>
        <OrderCard cta="Xác nhận ghế" to="/booking/attendees" total="$274.50" />
      </div>
    </BookingShell>
  )
}

export function BookingAttendeesPage() {
  return (
    <BookingShell step={2}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h1 className="mb-5 font-display text-2xl font-bold text-white">
            Thông tin người tham dự
          </h1>
          <AttendeeCard number={1} filled />
          <AttendeeCard number={2} />
          <div className="mt-5 rounded-lg border border-ai/30 bg-ai/10 p-4 text-sm text-subtle">
            Vui lòng nhập đúng họ tên theo giấy tờ tùy thân. Vé không thể chuyển
            nhượng sau khi đăng ký.
          </div>
        </section>
        <OrderCard cta="Kiểm tra đơn" to="/booking/review" total="$332.50" />
      </div>
    </BookingShell>
  )
}

export function BookingReviewPage() {
  return (
    <BookingShell step={3}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-5">
          <h1 className="font-display text-2xl font-bold text-white">
            Kiểm tra đơn hàng
          </h1>
          <EventStrip />
          <Panel title="Vé & ghế">
            {selectedSeats.map((seat) => (
              <div
                key={seat}
                className="mb-3 flex items-center justify-between rounded-md bg-panel-soft p-3"
              >
                <span className="font-bold text-white">
                  VIP Section A - {seat}
                </span>
                <span className="text-primary">$149.00</span>
              </div>
            ))}
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Người tham dự">
              <p className="font-bold text-white">Alex Rivers</p>
              <p className="text-muted">alex.rivers@gmail.com</p>
            </Panel>
            <Panel title="Người mua">
              <p className="font-bold text-white">Alex Rivers</p>
              <p className="text-muted">Visa kết thúc bằng 4242</p>
            </Panel>
          </div>
          <Panel title="Mã khuyến mãi">
            <div className="flex gap-3">
              <input
                className="flex-1 rounded-md border border-border-soft bg-surface p-3 outline-none"
                placeholder="Nhập mã"
              />
              <button className="rounded-md bg-panel-soft px-4 font-bold">
                Áp dụng
              </button>
            </div>
          </Panel>
        </section>
        <OrderCard cta="Thanh toán" to="/booking/payment" total="$336.89" />
      </div>
    </BookingShell>
  )
}

export function BookingPaymentPage() {
  return (
    <BookingShell step={4}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {['PayOS QR', 'Chuyển khoản', 'Thẻ Credit/Debit'].map(
              (method, index) => (
                <button
                  key={method}
                  className={`rounded-lg border p-4 text-left ${index === 0 ? 'border-tertiary text-white' : 'border-border-soft text-muted'}`}
                >
                  <CreditCard className="mb-2 size-5 text-primary" />
                  <span className="font-bold">{method}</span>
                </button>
              ),
            )}
          </div>
          <div className="glass-panel rounded-lg p-8 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-muted">
              Số tiền cần thanh toán
            </p>
            <h1 className="mt-2 font-display text-5xl font-extrabold text-white">
              $512.75
            </h1>
            <div className="mx-auto mt-6 w-fit rounded-lg bg-gradient-to-br from-primary to-tertiary p-1">
              <div className="rounded-md bg-white p-4">
                <img src={qrImage} alt="QR thanh toán" className="size-48" />
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              Quét mã bằng ứng dụng ngân hàng hoặc ví điện tử để hoàn tất giao
              dịch.
            </p>
            <Link
              to="/payment-confirmation"
              className="mt-6 inline-flex rounded-full bg-tertiary px-10 py-4 font-bold text-white"
            >
              Tôi đã thanh toán
            </Link>
          </div>
        </section>
        <OrderCard
          cta="Chờ thanh toán"
          to="/payment-confirmation"
          total="$512.75"
        />
      </div>
    </BookingShell>
  )
}

function BookingShell({ step, children }) {
  const labels = ['Ghế', 'Thông tin', 'Kiểm tra', 'Thanh toán']
  return (
    <div className="bg-background text-content">
      <div className="mx-auto min-h-[calc(100vh-64px)] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto mb-8 flex max-w-2xl items-center justify-between">
          {labels.map((label, index) => {
            const active = index + 1 === step
            const done = index + 1 < step
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <div
                  className={`grid size-9 place-items-center rounded-full text-sm font-bold ${active ? 'bg-tertiary text-white' : done ? 'bg-primary text-slate-950' : 'bg-panel-soft text-muted'}`}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </div>
                <span className="text-xs font-bold">{label}</span>
              </div>
            )
          })}
        </div>
        {children}
      </div>
    </div>
  )
}

function EventStrip() {
  return (
    <div className="flex gap-4 rounded-lg bg-panel p-4">
      <img
        src={event.image}
        alt=""
        className="h-28 w-44 rounded-md object-cover"
      />
      <div className="self-center">
        <span className="rounded-full bg-tertiary/20 px-2 py-1 text-xs font-bold text-tertiary">
          LIVE PERFORMANCE
        </span>
        <h2 className="mt-2 font-display text-xl font-bold text-white">
          {event.title}
        </h2>
        <p className="text-sm text-muted">
          {event.date} - {event.venue}
        </p>
      </div>
    </div>
  )
}

function TicketType({ title, desc, price, disabled }) {
  return (
    <div
      className={`rounded-lg bg-panel-soft p-5 ${disabled ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm text-muted">{desc}</p>
          <p className="mt-1 text-xs text-primary">Có thể hoàn vé</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-white">{price}</p>
          {!disabled && (
            <div className="mt-2 inline-flex items-center gap-3 rounded-md bg-background px-3 py-1">
              <Minus className="size-4" />0<Plus className="size-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OrderCard({ cta, to, total = '$0.00' }) {
  return (
    <aside className="glass-panel h-fit rounded-lg p-5 lg:sticky lg:top-24">
      <div className="mb-4 flex items-center justify-between rounded-md bg-ai/20 p-3 text-ai">
        <span className="flex items-center gap-2 text-sm font-bold">
          <Clock className="size-4" />
          Giữ vé trong
        </span>
        <span className="font-mono font-bold">09:40</span>
      </div>
      <h2 className="font-display text-2xl font-bold text-white">
        Tóm tắt đơn
      </h2>
      <div className="my-5 space-y-3 border-y border-border-soft py-5 text-sm">
        <Line
          label="Tạm tính"
          value={total === '$0.00' ? '$0.00' : '$298.00'}
        />
        <Line
          label="Phí dịch vụ"
          value={total === '$0.00' ? '$0.00' : '$24.50'}
        />
      </div>
      <Line label="Tổng cộng" value={total} large />
      <Link
        to={to}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-tertiary py-4 font-bold text-white"
      >
        {cta}
        <ArrowRight className="size-4" />
      </Link>
      <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted">
        <ShieldCheck className="size-3" /> Thanh toán bảo mật bởi EventHub Pay
      </p>
    </aside>
  )
}

function SeatGrid({ rows, cols, selected }) {
  return (
    <div
      className="mx-auto grid w-fit gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: rows * cols }).map((_, index) => (
        <div
          key={index}
          className={`size-4 rounded-t-md ${selected.includes(index) ? 'bg-primary' : index % 7 === 0 ? 'bg-slate-700' : 'bg-slate-500'}`}
        />
      ))}
    </div>
  )
}

function AttendeeCard({ number, filled }) {
  return (
    <div className="mb-4 rounded-lg bg-panel p-5">
      <h3 className="mb-4 font-display text-xl font-bold text-white">
        Vé {number} <span className="text-sm text-muted">(VIP Seating)</span>
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Họ và tên"
          placeholder="Nhập tên người tham dự"
          defaultValue={filled ? 'Alex Rivers' : ''}
        />
        <Input
          label="Email"
          placeholder="Nhập email"
          defaultValue={filled ? 'alex.rivers@premium.com' : ''}
        />
        <Input
          label="Số điện thoại"
          placeholder="+84..."
          className="md:col-span-2"
          defaultValue={filled ? '+1 (555) 0123-456' : ''}
        />
      </div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className="rounded-lg bg-panel p-5">
      <h3 className="mb-4 font-display text-xl font-bold text-white">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Input({ label, className = '', ...props }) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary"
      />
    </label>
  )
}

function Line({ label, value, large }) {
  return (
    <div
      className={`flex justify-between ${large ? 'font-display text-xl font-bold' : 'text-sm'}`}
    >
      <span>{label}</span>
      <span className={large ? 'text-primary' : ''}>{value}</span>
    </div>
  )
}
