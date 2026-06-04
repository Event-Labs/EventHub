import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { checkoutOrder } from '@/services/orders.js'
import { getProfile } from '@/services/user.service.js'

function formatPrice(value) {
  const number = Number(value)
  if (Number.isNaN(number)) return '0 đ'
  return `${number.toLocaleString('vi-VN')} đ`
}

export function BookingCheckoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = Boolean(localStorage.getItem('eventhub-token'))

  const cart = location.state?.cart
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [attendees, setAttendees] = useState({})
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
        .catch(() => {})
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
      navigate('/payment-confirmation', {
        replace: true,
        state: {
          order: data.order,
          tickets: data.tickets,
          eventTitle: cart.eventTitle,
        },
      })
    },
    onError: (err) => {
      const apiError = err.response?.data
      if (apiError?.errors && Array.isArray(apiError.errors)) {
        setError(apiError.errors.map((item) => item.message).join(', '))
      } else {
        setError(apiError?.message || 'Thanh toán thất bại. Vui lòng thử lại.')
      }
    },
  })

  const updateAttendee = (ticketTypeId, field, value) => {
    setAttendees((current) => ({
      ...current,
      [ticketTypeId]: {
        ...current[ticketTypeId],
        [field]: value,
      },
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setError('')

    const items = lineItems.map((item) => {
      const attendee = attendees[item.ticketType.id] || {}
      return {
        ticket_type_id: item.ticketType.id,
        quantity: item.quantity,
        session_seat_ids: item.sessionSeatIds || item.session_seat_ids,
        attendee_name: attendee.name?.trim() || buyerName.trim(),
        attendee_email: attendee.email?.trim() || buyerEmail.trim(),
      }
    })

    checkoutMutation.mutate({
      event_id: cart.eventId,
      buyer_name: buyerName.trim(),
      buyer_email: buyerEmail.trim(),
      buyer_phone: buyerPhone.trim() || null,
      items,
    })
  }

  if (!cart?.items?.length) return null

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Thanh toán"
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

          {lineItems.map((item) => (
            <section key={item.ticketType.id} className="glass-panel rounded-lg p-6">
              <h3 className="font-bold text-primary">
                {item.ticketType.name} × {item.quantity}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {formatPrice(item.ticketType.price)} / vé
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Tên người tham dự"
                  value={attendees[item.ticketType.id]?.name || ''}
                  onChange={(value) => updateAttendee(item.ticketType.id, 'name', value)}
                  placeholder={buyerName || 'Nhập tên'}
                  required
                />
                <Field
                  label="Email người tham dự"
                  type="email"
                  value={attendees[item.ticketType.id]?.email || ''}
                  onChange={(value) => updateAttendee(item.ticketType.id, 'email', value)}
                  placeholder={buyerEmail || 'email@example.com'}
                  required
                />
              </div>
            </section>
          ))}

          {error && <p className="text-sm text-error">{error}</p>}
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
            <span>Tổng</span>
            <span className="text-primary">{formatPrice(total)}</span>
          </div>
          <p className="mt-3 text-xs text-subtle">
            Thanh toán mô phỏng (lưu vào orders, tickets, payments trong database).
          </p>
          <button
            type="submit"
            disabled={checkoutMutation.isPending}
            className="mt-5 w-full rounded-md bg-primary py-3 text-sm font-bold text-slate-950 disabled:opacity-60"
          >
            {checkoutMutation.isPending ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
          </button>
          <Link to={`/events/${cart.eventSlug || cart.eventId}`} className="mt-3 block text-center text-sm text-muted hover:text-primary">
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
