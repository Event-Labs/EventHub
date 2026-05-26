import { CheckCircle, Download, Info, QrCode, Share2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { events } from '@/data/events.js'

const event = events[0]

export function PaymentConfirmationPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-background px-4 py-12 text-center sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-ai text-white shadow-2xl shadow-ai/40">
          <CheckCircle className="size-10" />
        </div>
        <h1 className="mt-6 font-display text-4xl font-extrabold text-white">
          Thanh toán thành công!
        </h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          Vé của bạn đã sẵn sàng. Chúng tôi đã gửi email xác nhận đến
          alex.rivers@example.com.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            ['VIP ACCESS', 'A12'],
            ['STANDARD', 'A13'],
          ].map(([type, seat]) => (
            <article
              key={seat}
              className="overflow-hidden rounded-lg border border-border-soft bg-panel text-left"
            >
              <img
                src={event.image}
                alt=""
                className="h-32 w-full object-cover"
              />
              <div className="p-5">
                <span className="rounded-full bg-tertiary px-2 py-1 text-xs font-bold text-white">
                  {type}
                </span>
                <div className="mt-4 flex justify-between gap-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">
                      Neon Pulse Tour
                    </h2>
                    <p className="text-sm text-muted">
                      Thứ sáu, 24 Th10 - 20:00
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-tertiary">
                      GHẾ {seat}
                    </p>
                    <p className="text-xs text-muted">Cổng 4</p>
                  </div>
                </div>
                <div className="mt-5 grid place-items-center rounded-md bg-white p-5">
                  <QrCode className="size-28 text-slate-950" />
                </div>
                <div className="mt-4 flex gap-3">
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-md bg-panel-soft py-3 text-sm font-bold text-white">
                    <Download className="size-4" />
                    Tải PDF
                  </button>
                  <button className="grid size-11 place-items-center rounded-md bg-panel-soft text-white">
                    <Share2 className="size-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            to="/my-tickets"
            className="rounded-full bg-tertiary px-10 py-4 font-bold text-white"
          >
            Xem vé của tôi
          </Link>
          <Link
            to="/"
            className="rounded-full border border-border-soft px-10 py-4 font-bold text-subtle"
          >
            Về trang chủ
          </Link>
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 text-left">
          <Info className="mt-1 size-5 shrink-0 text-primary" />
          <p className="text-sm text-subtle">
            Vui lòng đến trước giờ diễn ra 45 phút. Chuẩn bị mã QR điện tử hoặc
            bản in để quét tại cổng.
          </p>
        </div>
      </section>
    </div>
  )
}
