import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { checkoutOrder } from '@/services/orders.js'
import { getProfile } from '@/services/user.service.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

function formatPrice(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0 đ'
  return `${number.toLocaleString('vi-VN')} đ`
}

export function BookingCheckoutPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = hasAuthSession()

  const cart = location.state?.cart
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent('/booking/checkout')}`)
      return
    }
    if (!cart?.eventId || !cart?.items?.length) {
      navigate('/events')
    }
  }, [isAuthenticated, cart, navigate])

  useEffect(() => {
    if (!buyerEmail && isAuthenticated) {
      getProfile()
        .then((profile) => {
          setBuyerName(profile.full_name || '')
          setBuyerEmail(profile.email || '')
          setBuyerPhone(profile.phone || '')
        })
        .catch(() => { })
    }
  }, [buyerEmail, isAuthenticated])

  const lineItems = useMemo(() => cart?.items || [], [cart])
  const total = lineItems.reduce(
    (sum, item) => sum + Number(item.ticketType.price || 0) * item.quantity,
    0,
  )

  const checkoutMutation = useMutation({
    mutationFn: checkoutOrder,
    onSuccess: (data) => {
      toast.success('Đã tạo đơn thanh toán. Vui lòng hoàn tất thanh toán trong thời gian giữ vé.')
      navigate(`/payment-confirmation?orderId=${data.order.id}`, {
        replace: true,
        state: {
          checkout: data,
          eventTitle: cart.eventTitle,
        },
      })
    },
    onError: (err) => {
      const message = getApiMessage(err, 'Không thể tạo đơn thanh toán. Vui lòng thử lại.')
      setError(message)
      toast.error(message)
    },
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    setError('')

    checkoutMutation.mutate({
      event_id: cart.eventId,
      buyer_name: buyerName.trim(),
      buyer_email: buyerEmail.trim(),
      buyer_phone: buyerPhone.trim() || null,
      promo_code: cart.promoCode?.trim() || null,
      items: lineItems.map((item) => ({
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity,
        session_seat_ids: item.sessionSeatIds || item.session_seat_ids || [],
      })),
    })
  }

  if (!cart?.items?.length) return null

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Xác nhận đặt vé"
        description={`Đơn hàng cho sự kiện: ${cart.eventTitle}`}
      />

      <form className="grid gap-6 lg:grid-cols-[1fr_320px]" onSubmit={handleSubmit}>
        <div className="space-y-5">
          <section className="glass-panel rounded-lg p-6">
            <h2 className="font-display text-xl font-bold text-white">Thông tin người mua</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Họ tên" value={buyerName} onChange={setBuyerName} required />
              <Field
                label="Email"
                type="email"
                value={buyerEmail}
                onChange={setBuyerEmail}
                required
              />
              <Field
                label="Số điện thoại"
                value={buyerPhone}
                onChange={setBuyerPhone}
                placeholder="0901234567"
              />
            </div>
          </section>

          <section className="glass-panel rounded-lg p-6">
            <h2 className="font-display text-xl font-bold text-white">Vé đã chọn</h2>
            <div className="mt-4 space-y-3">
              {lineItems.map((item) => (
                <div
                  key={item.ticketType.id}
                  className="rounded-md border border-border-soft bg-panel-soft p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-white">{item.ticketType.name}</h3>
                      <p className="mt-1 text-sm text-muted">
                        Số lượng: {item.quantity}
                        {(item.sessionSeatIds || item.session_seat_ids)?.length
                          ? ` • ${item.quantity} ghế đã chọn`
                          : ''}
                      </p>
                    </div>
                    <p className="font-semibold text-primary">
                      {formatPrice(Number(item.ticketType.price || 0) * item.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>


        </div>

        <aside className="glass-panel h-fit rounded-lg p-6">
          <h2 className="font-display text-lg font-bold text-white">Tóm tắt</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {lineItems.map((item) => (
              <li key={item.ticketType.id} className="flex justify-between gap-3">
                <span>
                  {item.ticketType.name} × {item.quantity}
                </span>
                <span className="font-semibold text-white">
                  {formatPrice(Number(item.ticketType.price) * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-border-soft pt-4 font-bold text-white">
            <span>Tổng tiền</span>
            <span className="text-primary">{formatPrice(total)}</span>
          </div>
          {cart.promoCode && (
            <p className="mt-3 rounded-md border border-tertiary/30 bg-tertiary/10 p-3 text-xs font-semibold text-tertiary">
              Promo: {cart.promoCode}
            </p>
          )}
          <p className="mt-3 text-xs text-subtle">
            Backend sẽ giữ vé trong 15 phút, tạo đơn Pending và mở thanh toán PayOS của ban tổ chức.
          </p>
          <button
            type="submit"
            disabled={checkoutMutation.isPending}
            className="mt-5 w-full rounded-md bg-tertiary py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {checkoutMutation.isPending ? 'Đang giữ vé...' : 'Thanh toán qua PayOS'}
          </button>
          <Link
            to={`/events/${cart.eventSlug || cart.eventId}`}
            className="mt-3 block text-center text-sm text-muted hover:text-primary"
          >
            Quay lại sự kiện
          </Link>
        </aside>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, required = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-2 h-11 w-full rounded-md border border-border-soft bg-surface px-3 outline-none focus:border-primary"
      />
    </label>
  )
}
