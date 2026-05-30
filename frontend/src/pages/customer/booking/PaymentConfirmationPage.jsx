import { CheckCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function PaymentConfirmationPage() {
  const location = useLocation()
  const order = location.state?.order
  const tickets = location.state?.tickets || []
  const eventTitle = location.state?.eventTitle || 'Sự kiện'

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted">Không tìm thấy thông tin đơn hàng.</p>
        <Link to="/my-tickets" className="mt-4 inline-block text-primary font-bold">
          Xem vé của tôi
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background px-4 py-12 text-center sm:px-6 lg:px-8">
      <section className="mx-auto max-w-2xl">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-success/20 text-success">
          <CheckCircle className="size-10" />
        </div>
        <h1 className="mt-6 font-display text-4xl font-extrabold text-white">
          Thanh toán thành công!
        </h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          Đơn <span className="font-semibold text-white">{order.order_code}</span> cho{' '}
          {eventTitle} đã được lưu vào hệ thống.
        </p>

        <div className="mt-8 space-y-3 text-left">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className="rounded-lg border border-border-soft bg-panel p-4"
            >
              <p className="text-xs font-bold uppercase text-primary">Mã vé</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">{ticket.ticket_code}</p>
              <p className="mt-2 text-sm text-muted">Trạng thái: {ticket.status}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/my-tickets"
            className="rounded-md bg-primary px-5 py-3 text-sm font-bold text-slate-950"
          >
            Vé của tôi
          </Link>
          <Link
            to="/feedback"
            className="rounded-md border border-border-soft px-5 py-3 text-sm font-bold text-white"
          >
            Gửi phản hồi (sau khi sự kiện kết thúc)
          </Link>
        </div>
      </section>
    </div>
  )
}
