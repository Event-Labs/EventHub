import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { fetchSubscriptionPaymentStatus } from '@/services/subscriptions.js'
import { OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

function fmtCurrency(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n) || 0)
}

function paymentQrImageSrc(qrCode) {
  if (!qrCode) return ''
  if (/^(https?:|data:image\/)/i.test(qrCode)) return qrCode
  return `https://api.qrserver.com/v1/create-qr-code/?size=224x224&data=${encodeURIComponent(qrCode)}`
}

function secondsLeft(expiredAt) {
  if (!expiredAt) return 0
  return Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000))
}

function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function OrganizerSubscriptionPaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentId  = searchParams.get('paymentId')
  const cancelled  = searchParams.get('cancelled') === 'true'

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [tick, setTick]       = useState(0)

  const fetchStatus = useCallback(async (showLoader = false) => {
    if (!paymentId) return
    if (showLoader) setSyncing(true)
    try {
      const result = await fetchSubscriptionPaymentStatus(paymentId)
      setData(result)
    } catch (_) {}
    finally {
      setSyncing(false)
      setLoading(false)
    }
  }, [paymentId])

  // Initial fetch
  useEffect(() => { fetchStatus() }, [fetchStatus])

  // Poll every 5s while PENDING
  useEffect(() => {
    if (data?.status !== 'PENDING') return
    const timer = setInterval(() => fetchStatus(), 5000)
    return () => clearInterval(timer)
  }, [data?.status, fetchStatus])

  // Countdown tick
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Auto-redirect on paid
  useEffect(() => {
    if (data?.status === 'PAID') {
      const timer = setTimeout(() => navigate('/organizer/subscriptions', { replace: true }), 2500)
      return () => clearTimeout(timer)
    }
  }, [data?.status, navigate])

  const payment = data?.payment
  const remaining = useMemo(() => secondsLeft(payment?.expired_at), [payment?.expired_at, tick])

  if (!paymentId) {
    return (
      <OrganizerPage title="Thanh toán gói dịch vụ">
        <OrganizerPanel className="py-16 text-center border-dashed">
          <p className="text-muted">Không tìm thấy thông tin thanh toán.</p>
        </OrganizerPanel>
      </OrganizerPage>
    )
  }

  if (loading) {
    return (
      <OrganizerPage title="Thanh toán gói dịch vụ">
        <OrganizerPanel className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
        </OrganizerPanel>
      </OrganizerPage>
    )
  }

  // ── Paid ────────────────────────────────────────────────────────────────
  if (data?.status === 'PAID') {
    return (
      <OrganizerPage title="Thanh toán thành công">
        <OrganizerPanel className="py-16 text-center">
          <CheckCircle2 className="mx-auto size-16 text-success animate-bounce" />
          <h2 className="mt-4 text-2xl font-extrabold text-content">Kích hoạt thành công!</h2>
          <p className="mt-2 text-sm text-muted">
            Gói <span className="font-bold text-content">{data.current_plan?.plan?.name}</span> đã
            được kích hoạt. Đang chuyển hướng...
          </p>
        </OrganizerPanel>
      </OrganizerPage>
    )
  }

  // ── Expired / Cancelled ──────────────────────────────────────────────────
  if (data?.status === 'EXPIRED' || cancelled || remaining === 0) {
    return (
      <OrganizerPage title="Thanh toán gói dịch vụ">
        <OrganizerPanel className="py-16 text-center">
          <XCircle className="mx-auto size-14 text-error" />
          <h2 className="mt-4 text-xl font-extrabold text-content">Giao dịch đã hết hạn</h2>
          <p className="mt-2 text-sm text-muted">
            Liên kết thanh toán đã hết hiệu lực. Vui lòng chọn lại gói.
          </p>
          <button
            type="button"
            onClick={() => navigate('/organizer/subscriptions')}
            className="mt-6 org-btn-primary"
          >
            Quay lại gói dịch vụ
          </button>
        </OrganizerPanel>
      </OrganizerPage>
    )
  }

  // ── Pending — show QR + checkout link ───────────────────────────────────
  return (
    <OrganizerPage
      title="Thanh toán gói dịch vụ"
      eyebrow="Gói dịch vụ / Thanh toán"
      description="Hoàn tất thanh toán qua PayOS để kích hoạt gói."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px] text-content animate-in fade-in">
        {/* Main — QR + link */}
        <OrganizerPanel>
          <div className="flex items-center gap-3 border-b border-border-soft/20 pb-4 mb-5">
            <Clock3 className="size-5 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase text-muted">PayOS Checkout</p>
              <p className="font-bold text-content">
                {payment?.description || 'Thanh toán gói dịch vụ'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border-soft/30 bg-panel-soft p-5 text-center">
            <p className="text-xs font-bold uppercase text-muted">Số tiền</p>
            <p className="mt-1 text-3xl font-extrabold text-content">
              {fmtCurrency(payment?.amount)}
            </p>

            {payment?.qr_code ? (
              <div className="mx-auto mt-5 w-fit rounded-xl bg-white p-3 shadow-sm border border-border-soft/20">
                <img
                  src={paymentQrImageSrc(payment.qr_code)}
                  alt="QR thanh toán"
                  className="size-52"
                />
              </div>
            ) : (
              <div className="mx-auto mt-5 grid size-52 place-items-center rounded-xl border border-dashed border-border-soft/30 text-sm text-muted bg-panel-soft/30">
                QR sẽ hiển thị sau khi PayOS phản hồi.
              </div>
            )}

            <p className="mx-auto mt-4 max-w-sm text-sm text-muted">
              Quét QR bằng app ngân hàng hoặc mở trang PayOS để thanh toán.
            </p>

            {payment?.checkout_url && (
              <a
                href={payment.checkout_url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 org-btn-primary"
              >
                Mở trang thanh toán PayOS
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        </OrganizerPanel>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Countdown */}
          <OrganizerPanel>
            <p className="text-xs font-bold uppercase text-muted">Thời gian còn lại</p>
            <p className="mt-2 font-mono text-3xl font-extrabold text-content">
              {formatCountdown(remaining)}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel-soft">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (remaining / (15 * 60)) * 100)}%` }}
              />
            </div>
          </OrganizerPanel>

          {/* Status info */}
          <OrganizerPanel>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Gói</span>
                <span className="font-bold text-content truncate max-w-[140px]" title={payment?.description}>{payment?.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Số tiền</span>
                <span className="font-bold text-primary">{fmtCurrency(payment?.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Trạng thái</span>
                <span className="font-bold text-warning">{data?.status ?? 'PENDING'}</span>
              </div>
            </div>
          </OrganizerPanel>

          {/* Actions */}
          <OrganizerPanel>
            <button
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={syncing}
              className="org-btn-secondary w-full"
            >
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/organizer/subscriptions')}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-error/30 bg-error/10 py-2.5 text-sm font-bold text-error transition hover:bg-error/20"
            >
              <XCircle className="size-4" />
              Hủy & quay lại
            </button>
          </OrganizerPanel>
        </div>
      </div>
    </OrganizerPage>
  )
}
