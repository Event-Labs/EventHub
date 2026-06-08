import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock3, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { cancelOrder, fetchOrderStatus } from '@/services/orders.js'

function formatPrice(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0 đ'
  return `${number.toLocaleString('vi-VN')} đ`
}

function secondsLeft(expiredAt) {
  if (!expiredAt) return 0
  return Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000))
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function PaymentConfirmationPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const checkout = location.state?.checkout
  const orderId = searchParams.get('orderId') || checkout?.order?.id
  const [tick, setTick] = useState(0)

  const statusQuery = useQuery({
    queryKey: ['order-status', orderId],
    queryFn: () => fetchOrderStatus(orderId),
    enabled: Boolean(orderId),
    initialData: checkout
      ? {
          order: checkout.order,
          payment: checkout.payment,
          items: checkout.items,
        }
      : undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.order?.status
      return status === 'PENDING' ? 5000 : false
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => statusQuery.refetch(),
  })

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const data = statusQuery.data
  const remainingSeconds = useMemo(
    () => secondsLeft(data?.order?.expired_at),
    [data?.order?.expired_at, tick],
  )

  if (!orderId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted">Không tìm thấy thông tin đơn hàng.</p>
        <Link to="/my-tickets" className="mt-4 inline-block font-bold text-primary">
          Xem vé của tôi
        </Link>
      </div>
    )
  }

  if (statusQuery.isLoading || !data) {
    return <State message="Đang tải trạng thái thanh toán..." />
  }

  const paid = data.order.status === 'PAID'
  const expired = ['EXPIRED', 'CANCELLED', 'FAILED'].includes(data.order.status) || remainingSeconds === 0
  const eventTitle = data.order.event?.title || location.state?.eventTitle || 'Sự kiện'

  if (paid) {
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
            Đơn <span className="font-semibold text-white">{data.order.order_code}</span> cho{' '}
            {eventTitle} đã được xác nhận. Vé đã sẵn sàng trong My Tickets.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/my-tickets"
              className="rounded-md bg-primary px-5 py-3 text-sm font-bold text-slate-950"
            >
              Vé của tôi
            </Link>
            <Link
              to={`/events/${data.order.event?.slug || data.order.event?.id || ''}`}
              className="rounded-md border border-border-soft px-5 py-3 text-sm font-bold text-white"
            >
              Quay lại sự kiện
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <section className="glass-panel rounded-lg p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-tertiary/20 text-tertiary">
            <Clock3 className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-tertiary">PayOS Checkout</p>
            <h1 className="font-display text-2xl font-bold text-white">{eventTitle}</h1>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border-soft bg-panel p-5 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-muted">
            Số tiền cần thanh toán
          </p>
          <p className="mt-2 font-display text-4xl font-extrabold text-white">
            {formatPrice(data.order.total_amount)}
          </p>

          {data.payment?.qr_code ? (
            <div className="mx-auto mt-6 w-fit rounded-lg bg-white p-4">
              <img src={data.payment.qr_code} alt="QR PayOS" className="size-56" />
            </div>
          ) : (
            <div className="mx-auto mt-6 grid size-56 place-items-center rounded-lg border border-dashed border-border-soft text-sm text-muted">
              QR sẽ hiển thị sau khi PayOS trả dữ liệu.
            </div>
          )}

          <p className="mx-auto mt-4 max-w-md text-sm text-muted">
            Quét QR trong app ngân hàng hoặc mở trang PayOS. Frontend chỉ hiển thị trạng thái sau khi backend nhận webhook và xác nhận thanh toán.
          </p>

          {data.payment?.checkout_url && (
            <a
              href={data.payment.checkout_url}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-tertiary px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
            >
              Mở trang thanh toán PayOS
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </section>

      <aside className="glass-panel h-fit rounded-lg p-6">
        <div className="rounded-md bg-ai/15 p-4">
          <p className="text-sm font-bold text-ai">Thời gian giữ vé</p>
          <p className="mt-2 font-mono text-3xl font-bold text-white">
            {formatCountdown(remainingSeconds)}
          </p>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <Line label="Mã đơn" value={data.order.order_code} />
          <Line label="Trạng thái đơn" value={data.order.status} />
          <Line label="Trạng thái PayOS" value={data.payment?.status || 'PENDING'} />
          <Line label="Tổng tiền" value={formatPrice(data.order.total_amount)} strong />
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border-soft py-3 text-sm font-bold text-white transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <RefreshCw className="size-4" />
            {statusQuery.isFetching ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}
          </button>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || data.order.status !== 'PENDING'}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-error/40 py-3 text-sm font-bold text-error transition hover:bg-error/10 disabled:opacity-60"
          >
            <XCircle className="size-4" />
            Hủy đơn
          </button>
        </div>

        {expired && (
          <p className="mt-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
            Giao dịch đã hết thời gian giữ vé hoặc đã bị hủy. Vui lòng đặt vé lại từ đầu.
          </p>
        )}
      </aside>
    </div>
  )
}

function Line({ label, value, strong = false }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className={strong ? 'font-bold text-primary' : 'font-semibold text-white'}>{value}</span>
    </div>
  )
}

function State({ message }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center text-muted">
      {message}
    </div>
  )
}
