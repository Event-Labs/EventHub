import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock3, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cancelOrder, fetchOrderStatus } from '@/services/orders.js'
import { clearBookingDraft } from '@/utils/bookingDraft.js'
import { getApiMessage } from '@/lib/messages.js'
import { QRCodeImage } from '@/components/QRCodeImage.jsx'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { cn } from '@/lib/utils.js'

function formatPrice(value, isEnglish = false) {
  const number = Number(value)
  if (!Number.isFinite(number)) return isEnglish ? '0 ₫' : '0 đ'
  return `${number.toLocaleString(isEnglish ? 'en-US' : 'vi-VN')} ₫`
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
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const checkout = location.state?.checkout
  const orderId = searchParams.get('orderId') || checkout?.order?.id
  const [tick, setTick] = useState(0)
  const paymentSuccessHandledRef = useRef(false)
  const expiredHandledRef = useRef(false)

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
      return status === 'PENDING' ? 3000 : false
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => {
      toast.success(isEnglish ? 'Order cancelled.' : 'Đã hủy đơn hàng.')
      statusQuery.refetch()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to cancel order. Please try again.' : 'Không thể hủy đơn hàng. Vui lòng thử lại.'))
    },
  })

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const orderStatus = statusQuery.data?.order?.status
    if ((orderStatus === 'PAID' || orderStatus === 'CONFIRMED') && !paymentSuccessHandledRef.current) {
      paymentSuccessHandledRef.current = true
      clearBookingDraft()
      const msg = orderStatus === 'CONFIRMED'
        ? (isEnglish ? 'Booking confirmed. Your tickets are ready!' : 'Đặt vé thành công. Vé của bạn đã sẵn sàng!')
        : (isEnglish ? 'Payment successful. Your tickets are ready!' : 'Thanh toán thành công. Vé của bạn đã sẵn sàng!')
      toast.success(msg)
      navigate('/my-tickets', { replace: true })
    }
  }, [navigate, statusQuery.data?.order?.status, toast, isEnglish])

  const data = statusQuery.data
  const remainingSeconds = useMemo(
    () => secondsLeft(data?.order?.expired_at),
    [data?.order?.expired_at, tick],
  )

  useEffect(() => {
    if (!orderId && !expiredHandledRef.current) {
      expiredHandledRef.current = true
      clearBookingDraft()
      toast.error('Thời gian giữ vé (15 phút) đã hết hạn. Đơn đặt vé đã bị hủy.')
      navigate('/', { replace: true })
    }
  }, [orderId, navigate, toast])

  useEffect(() => {
    if (!statusQuery.data?.order) return
    const currentOrder = statusQuery.data.order
    const isOrderExpired =
      ['EXPIRED', 'CANCELLED', 'FAILED'].includes(currentOrder.status) ||
      (currentOrder.expired_at && secondsLeft(currentOrder.expired_at) <= 0)

    if (isOrderExpired && !expiredHandledRef.current && !paymentSuccessHandledRef.current) {
      expiredHandledRef.current = true
      clearBookingDraft(currentOrder.event_id || currentOrder.event?.id)
      toast.error('Thời gian giữ vé (15 phút) đã hết hạn. Đơn đặt vé đã bị hủy.')
      navigate('/', { replace: true })
    }
  }, [statusQuery.data?.order?.status, statusQuery.data?.order?.expired_at, statusQuery.data?.order?.event_id, statusQuery.data?.order?.event?.id, navigate, toast, tick])

  if (!orderId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted">{isEnglish ? 'Order information not found.' : 'Không tìm thấy thông tin đơn hàng.'}</p>
        <Link to="/my-tickets" className="mt-4 inline-block font-bold text-primary">
          {isEnglish ? 'View My Tickets' : 'Xem vé của tôi'}
        </Link>
      </div>
    )
  }

  if (statusQuery.isLoading || !data) {
    return <State message={isEnglish ? 'Loading payment status...' : 'Đang tải trạng thái thanh toán...'} />
  }

  const paid = data.order.status === 'PAID'
  const expired = ['EXPIRED', 'CANCELLED', 'FAILED'].includes(data.order.status) || remainingSeconds === 0
  const eventTitle = data.order.event?.title || location.state?.eventTitle || (isEnglish ? 'Event' : 'Sự kiện')

  if (expired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Loader2 className="size-8 text-rose-500 animate-spin mb-3" />
        <p className="text-slate-300 text-sm">Thời gian giữ vé đã hết hạn. Đang chuyển hướng về trang chủ...</p>
      </div>
    )
  }

  if (paid) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-transparent px-4 py-16 text-center sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_50%)] opacity-20 pointer-events-none" />
        <section className="glass-panel mx-auto max-w-2xl rounded-[32px] p-12 border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--color-success)_0%,_transparent_60%)] opacity-10 pointer-events-none" />
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-success/20 text-success shadow-[0_0_30px_rgba(16,185,129,0.3)] border border-success/30">
            <CheckCircle className="size-12" />
          </div>
          <h1 className="mt-8 font-display text-4xl font-extrabold text-white drop-shadow-md">
            {isEnglish ? 'Payment Successful!' : 'Thanh toán thành công!'}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-slate-300 text-lg">
            {isEnglish ? (
              <>Order <span className="font-semibold text-primary">{data.order.order_code}</span> for {eventTitle} has been confirmed. Tickets are ready in My Tickets.</>
            ) : (
              <>Đơn <span className="font-semibold text-primary">{data.order.order_code}</span> cho {eventTitle} đã được xác nhận. Vé đã sẵn sàng trong My Tickets.</>
            )}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              to="/my-tickets"
              className="cosmic-btn-primary px-8 py-3.5 text-[15px]"
            >
              {isEnglish ? 'My Tickets' : 'Vé của tôi'}
            </Link>
            <Link
              to={`/events/${data.order.event?.slug || data.order.event?.id || ''}`}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-8 py-3.5 font-bold text-white transition-all hover:bg-white/10 hover:border-white/20"
            >
              {isEnglish ? 'Back to Event' : 'Quay lại sự kiện'}
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
          <p className="text-[10px] font-black uppercase tracking-widest text-white">
            {isEnglish ? 'Amount Due' : 'Số tiền cần thanh toán'}
          </p>
          <p className="mt-3 font-display text-5xl font-black text-white drop-shadow-lg tracking-tight">
            {formatPrice(data.order.total_amount, isEnglish)}
          </p>

          {/* QR code container */}
          {data.payment?.qr_code ? (
            <div className="mx-auto mt-8 w-fit rounded-2xl bg-white p-5 shadow-xl border border-white/10">
              <QRCodeImage text={data.payment.qr_code} alt="QR PayOS" size={240} className="size-60" />
            </div>
          ) : (
            <div className="mx-auto mt-8 grid size-60 place-items-center rounded-2xl border-2 border-dashed border-white/10 bg-slate-900/50 text-sm font-medium text-slate-400">
              {isEnglish ? 'QR code will appear once PayOS responds.' : 'QR sẽ hiển thị sau khi PayOS trả dữ liệu.'}
            </div>
          )}

          {data.payment?.checkout_url && (
            <a
              href={data.payment.checkout_url}
              target="_blank"
              rel="noreferrer"
              className="cosmic-btn-primary mx-auto mt-6 flex w-fit min-w-[280px] items-center justify-center gap-2 py-3.5 rounded-full"
            >
              {isEnglish ? 'Open PayOS Payment Page' : 'Mở trang thanh toán PayOS'}
              <ExternalLink className="size-5" />
            </a>
          )}
        </div>
      </section>

      <aside className="glass-panel h-fit rounded-[24px] p-8 border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative overflow-hidden lg:sticky lg:top-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--color-primary)_0%,_transparent_50%)] opacity-10 pointer-events-none" />
        <div className="rounded-[16px] border border-primary/30 bg-primary/10 p-6 text-center shadow-inner">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">{isEnglish ? 'Reservation Window' : 'Thời gian giữ vé'}</p>
          <p className="mt-3 font-mono text-4xl font-bold text-white drop-shadow-sm">
            {formatCountdown(remainingSeconds)}
          </p>
        </div>

        <div className="mt-8 space-y-4 text-sm">
          <Line label={isEnglish ? 'Order Code' : 'Mã đơn'} value={data.order.order_code} />
          <Line label={isEnglish ? 'Order Status' : 'Trạng thái đơn'} value={data.order.status} />
          <Line label={isEnglish ? 'PayOS Status' : 'Trạng thái PayOS'} value={data.payment?.status || 'PENDING'} />
          <Line label={isEnglish ? 'Total Amount' : 'Tổng tiền'} value={formatPrice(data.order.total_amount, isEnglish)} strong />
        </div>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 py-4 font-bold text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-5', statusQuery.isFetching && 'animate-spin')} />
            {statusQuery.isFetching ? (isEnglish ? 'Checking...' : 'Đang kiểm tra...') : (isEnglish ? 'Check Status' : 'Kiểm tra trạng thái')}
          </button>
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || data.order.status !== 'PENDING'}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-error/30 bg-transparent py-4 font-bold text-error transition-all hover:bg-error/10 hover:border-error/50 disabled:opacity-50"
          >
            <XCircle className="size-5" />
            {isEnglish ? 'Cancel Order' : 'Hủy đơn'}
          </button>
        </div>

        {expired && (
          <p className="mt-6 rounded-xl border border-error/30 bg-error/10 p-4 text-sm font-medium text-error text-center">
            {isEnglish
              ? 'Transaction reservation expired or order was cancelled. Please book again.'
              : 'Giao dịch đã hết thời gian giữ vé hoặc đã bị hủy. Vui lòng đặt vé lại từ đầu.'}
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
