import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock3, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cancelOrder, fetchOrderStatus } from '@/services/orders.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { cn } from '@/lib/utils.js'

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

function paymentQrImageSrc(qrCode) {
  if (!qrCode) return ''
  if (/^(https?:|data:image\/)/i.test(qrCode)) return qrCode
  return `https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(qrCode)}`
}

export function PaymentConfirmationPage() {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const checkout = location.state?.checkout
  const orderId = searchParams.get('orderId') || checkout?.order?.id
  const [tick, setTick] = useState(0)
  const paymentSuccessHandledRef = useRef(false)

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
    onSuccess: () => {
      toast.success('Đã hủy đơn hàng.')
      statusQuery.refetch()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể hủy đơn hàng. Vui lòng thử lại.'))
    },
  })

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (statusQuery.data?.order?.status !== 'PAID' || paymentSuccessHandledRef.current) return

    paymentSuccessHandledRef.current = true
    toast.success('Thanh toán thành công. Vé của bạn đã sẵn sàng!')
    navigate('/my-tickets', { replace: true })
  }, [navigate, statusQuery.data?.order?.status, toast])

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
      <div className="min-h-[calc(100vh-64px)] bg-background px-4 py-16 text-center sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_50%)] opacity-20 pointer-events-none" />
        <section className="glass-panel mx-auto max-w-2xl rounded-[32px] p-12 border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--color-success)_0%,_transparent_60%)] opacity-10 pointer-events-none" />
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-success/20 text-success shadow-[0_0_30px_rgba(16,185,129,0.3)] border border-success/30">
            <CheckCircle className="size-12" />
          </div>
          <h1 className="mt-8 font-display text-4xl font-extrabold text-white drop-shadow-md">
            Thanh toán thành công!
          </h1>
          <p className="mx-auto mt-4 max-w-md text-slate-300 text-lg">
            Đơn <span className="font-semibold text-primary">{data.order.order_code}</span> cho{' '}
            {eventTitle} đã được xác nhận. Vé đã sẵn sàng trong My Tickets.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to="/my-tickets"
              className="cosmic-btn-primary px-8 py-3.5 text-[15px]"
            >
              Vé của tôi
            </Link>
            <Link
              to={`/events/${data.order.event?.slug || data.order.event?.id || ''}`}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-8 py-3.5 font-bold text-white transition-all hover:bg-white/10 hover:border-white/20"
            >
              Quay lại sự kiện
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8 relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--color-primary)_0%,_transparent_60%)] opacity-10 pointer-events-none" />
      <section className="glass-panel rounded-[24px] p-8 lg:p-10 border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-primary)_0%,_transparent_60%)] opacity-10 pointer-events-none" />
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-inner">
            <Clock3 className="size-6" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary">PayOS Checkout</p>
            <h1 className="font-display text-2xl font-black text-white drop-shadow-sm leading-tight">{eventTitle}</h1>
          </div>
        </div>

        <div className="mt-8 rounded-[24px] border border-white/5 bg-white/5 p-8 text-center shadow-inner">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Số tiền cần thanh toán
          </p>
          <p className="mt-3 font-display text-5xl font-black text-white drop-shadow-lg tracking-tight">
            {formatPrice(data.order.total_amount)}
          </p>

          {data.payment?.qr_code ? (
            <div className="mx-auto mt-8 w-fit rounded-2xl bg-white p-5 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
              <img src={paymentQrImageSrc(data.payment.qr_code)} alt="QR PayOS" className="size-60" />
            </div>
          ) : (
            <div className="mx-auto mt-8 grid size-60 place-items-center rounded-2xl border-2 border-dashed border-white/10 bg-slate-900/50 text-sm font-medium text-slate-400">
              QR sẽ hiển thị sau khi PayOS trả dữ liệu.
            </div>
          )}

          <p className="mx-auto mt-6 max-w-md text-sm text-slate-400 leading-relaxed">
            Quét QR trong app ngân hàng hoặc mở trang PayOS. Hệ thống sẽ tự động cập nhật khi thanh toán thành công.
          </p>

          {data.payment?.checkout_url && (
            <a
              href={data.payment.checkout_url}
              target="_blank"
              rel="noreferrer"
              className="cosmic-btn-primary mx-auto mt-8 flex w-fit min-w-[280px] items-center justify-center gap-2 py-4"
            >
              Mở trang thanh toán PayOS
              <ExternalLink className="size-5" />
            </a>
          )}
        </div>
      </section>

      <aside className="glass-panel h-fit rounded-[24px] p-8 border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative overflow-hidden lg:sticky lg:top-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--color-primary)_0%,_transparent_50%)] opacity-10 pointer-events-none" />
        <div className="rounded-[16px] border border-primary/30 bg-primary/10 p-6 text-center shadow-inner">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Thời gian giữ vé</p>
          <p className="mt-3 font-mono text-4xl font-bold text-white drop-shadow-sm">
            {formatCountdown(remainingSeconds)}
          </p>
        </div>

        <div className="mt-8 space-y-4 text-sm">
          <Line label="Mã đơn" value={data.order.order_code} />
          <Line label="Trạng thái đơn" value={data.order.status} />
          <Line label="Trạng thái PayOS" value={data.payment?.status || 'PENDING'} />
          <Line label="Tổng tiền" value={formatPrice(data.order.total_amount)} strong />
        </div>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 py-4 font-bold text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-5', statusQuery.isFetching && 'animate-spin')} />
            {statusQuery.isFetching ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}
          </button>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || data.order.status !== 'PENDING'}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-error/30 bg-transparent py-4 font-bold text-error transition-all hover:bg-error/10 hover:border-error/50 disabled:opacity-50"
          >
            <XCircle className="size-5" />
            Hủy đơn
          </button>
        </div>

        {expired && (
          <p className="mt-6 rounded-xl border border-error/30 bg-error/10 p-4 text-sm font-medium text-error text-center">
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
