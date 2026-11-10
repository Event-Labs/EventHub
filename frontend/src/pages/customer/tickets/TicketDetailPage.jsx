import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  ReceiptText,
  RotateCcw,
  X,
  AlertCircle,
  ExternalLink,
  HelpCircle,
  Star,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { fetchTicketDetail, cancelFreeTicket } from '@/services/tickets.js'
import {
  submitRefundRequest,
  fetchRefundPreview,
  fetchMyRefundRequests,
  submitPayoutInfo,
  disputeRefund,
  confirmReceivedRefund,
} from '@/services/refunds.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { QRCodeImage } from '@/components/QRCodeImage.jsx'
import QRCode from 'qrcode'
import { VIETNAMESE_BANKS, getBankDisplayName, resolveBankName } from '@/constants/banks.js'
import logoSrc from '@/assets/eventhub-logo.png'
import { buildUniversalTicketSvg } from '@/utils/ticketSvgGenerator.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { cleanAndFormatVenue } from '@/i18n/eventTranslations.js'
import { translatePhrase } from '@/i18n/phraseDictionary.js'

const getAutoIsEnglish = () => (typeof document !== 'undefined' && document.documentElement.lang === 'en') || (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en')

function formatDateTime(value, isEnglish = getAutoIsEnglish()) {
  if (!value) return isEnglish ? 'N/A' : 'Chưa cập nhật'
  return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value, isEnglish = getAutoIsEnglish()) {
  if (value === undefined || value === null) return 'N/A'
  if (Number(value) === 0) return isEnglish ? 'Free' : 'Miễn phí'
  if (isEnglish) {
    return `${new Intl.NumberFormat('en-US').format(value)} VND`
  }
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

function venueLine(ticket) {
  return [
    ticket?.venue?.address_line,
    ticket?.venue?.ward,
    ticket?.venue?.district,
    ticket?.venue?.city,
  ].filter(Boolean).join(', ')
}

function statusText(ticket, refundRequest, isEnglish = false) {
  if (typeof refundRequest === 'boolean') {
    isEnglish = refundRequest
    refundRequest = null
  }
  if (ticket?.status === 'REFUNDED' || refundRequest?.status === 'REFUNDED' || ticket?.order?.status === 'REFUNDED') {
    return isEnglish ? 'Refunded' : 'Đã hoàn vé'
  }
  if (ticket?.status === 'REFUND_REQUESTED' || ticket?.status === 'REFUND_PENDING') {
    return isEnglish ? 'Refund Pending' : 'Đang chờ hoàn vé'
  }
  if (ticket?.event?.status === 'CANCELLED') {
    return isEnglish ? 'Refund Pending' : 'Đang chờ hoàn vé'
  }
  if (ticket?.status === 'EXPIRED') return isEnglish ? 'Expired' : 'Hết hạn'
  if (ticket?.status === 'USED') return isEnglish ? 'Used' : 'Đã dùng'
  if (ticket?.status === 'CANCELLED') return isEnglish ? 'Cancelled' : 'Đã hủy'
  if (ticket?.checked_in_at) return isEnglish ? 'Checked In' : 'Đã check-in'
  return isEnglish ? 'Valid' : 'Hợp lệ'
}

function countdownParts(target, now) {
  if (!target) return null
  const diff = Math.max(0, new Date(target).getTime() - now)
  const totalMinutes = Math.floor(diff / 60000)
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    ended: diff === 0,
  }
}

function qrPayload(ticket) {
  return JSON.stringify({
    type: 'EVENTHUB_TICKET',
    ticket_code: ticket.ticket_code || ticket.qr_code || ticket.id,
  })
}

function qrImageSrc(ticket) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=14&data=${encodeURIComponent(qrPayload(ticket))}`
}

function escapeXml(value) {
  return String(value ?? 'N/A')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function imageToDataUrl(src) {
  const response = await fetch(src)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

let cachedLogoDataUrl = null
async function getLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl
  try {
    cachedLogoDataUrl = await imageToDataUrl(logoSrc)
    return cachedLogoDataUrl
  } catch {
    return ''
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function svgToRasterBlob(svg, format = 'png') {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 700
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Cannot export ticket image'))
      }, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Cannot render ticket image'))
    }
    image.src = url
  })
}

export function TicketDetailPage() {
  const { language, isVietnamese, isEnglish, t } = useLanguage()
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = hasAuthSession()
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [refundDetailOpen, setRefundDetailOpen] = useState(false)
  const currentUserKey = getStoredUserKey()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const queryClient = useQueryClient()

  const ticketQuery = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn: () => fetchTicketDetail(ticketId),
    enabled: isAuthenticated && Boolean(ticketId),
  })

  const refundsQuery = useQuery({
    queryKey: ['my-refunds', currentUserKey],
    queryFn: () => fetchMyRefundRequests(),
    enabled: isAuthenticated,
  })

  const ticket = ticketQuery.data

  const refundRequest = useMemo(() => {
    if (!refundsQuery.data || !ticket?.id) return null
    return (refundsQuery.data || []).find(
      (item) =>
        item.ticket_id === ticket.id ||
        item.ticket?.id === ticket.id ||
        (item.order_id === ticket.order?.id && (!item.ticket_id || item.ticket_id === ticket.id))
    )
  }, [refundsQuery.data, ticket?.id, ticket?.order?.id])

  async function handleDownload() {
    if (!ticketQuery.data || downloading) return
    setDownloadError('')
    setDownloading(true)
    try {
      const qrDataUrl = await QRCode.toDataURL(qrPayload(ticketQuery.data), { width: 300, margin: 2 })
      const logoDataUrl = await getLogoDataUrl()
      const svg = buildUniversalTicketSvg(ticketQuery.data, qrDataUrl, logoDataUrl, { locale: language })
      const baseName = ticketQuery.data?.ticket_code || 'ticket'
      const blob = await svgToRasterBlob(svg, 'png')
      downloadBlob(blob, `${baseName}.png`)
    } catch {
      setDownloadError(isEnglish ? 'Failed to download ticket. Please try again.' : t('tickets.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }

  if (!isAuthenticated) return null

  if (ticketQuery.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-muted">{isEnglish ? 'Loading ticket details...' : 'Đang tải thông tin vé...'}</div>
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-white transition-colors hover:text-white/80">
          <ArrowLeft className="size-4" />
          {isEnglish ? 'My Tickets' : 'Vé của tôi'}
        </Link>
        <p className="mt-8 text-error">{isEnglish ? 'Unable to load ticket details or ticket does not belong to your account.' : 'Không thể tải thông tin vé hoặc vé không thuộc tài khoản của bạn.'}</p>
      </div>
    )
  }

  const venue = venueLine(ticket)
  const eventTitle = isEnglish ? (translatePhrase(ticket.event?.title, 'en') || ticket.event?.title) : ticket.event?.title
  const ticketTypeName = isEnglish ? (translatePhrase(ticket.ticket_type?.name, 'en') || ticket.ticket_type?.name) : ticket.ticket_type?.name
  const seat = ticket.seat?.label || (isEnglish ? 'No fixed seat' : 'Không có ghế cố định')
  const venueText = cleanAndFormatVenue(ticket.venue || venue, isEnglish) || (isEnglish ? 'N/A' : 'Chưa có địa điểm')
  const isZeroAmountOrFree = ticket.order?.status === 'CONFIRMED' || Number(ticket.order?.total_amount) === 0 || ['FREE', 'FULLY_DISCOUNTED', 'COMPLIMENTARY'].includes(ticket.ticket_source)
  const isOrderPaid = ['PAID', 'CONFIRMED', 'REFUND_REQUESTED'].includes(ticket.order?.status) || Boolean(ticket.payment?.paid_at) || ticket.payment?.status === 'PAID'
  const isEntryEligible = ticket.status === 'VALID'
  const sessionStartTime = ticket.session?.start_time ? new Date(ticket.session.start_time).getTime() : 0
  const isMoreThan2HoursBeforeSession = sessionStartTime > 0 && sessionStartTime - Date.now() > 2 * 60 * 60 * 1000
  const isFreeOrDiscounted = ticket.order?.status === 'CONFIRMED' && ['FREE', 'FULLY_DISCOUNTED'].includes(ticket.ticket_source)
  const canCancelFreeTicket = isFreeOrDiscounted && isEntryEligible && !ticket.checked_in_at && isMoreThan2HoursBeforeSession
  const collectAttendees = Boolean(ticket.event?.require_attendee_info)
  const activeRefundPolicy = ticket.refund_policy_snapshot || ticket.event?.refund_policy || {}
  const isRefundAllowedByPolicy = Boolean(activeRefundPolicy.allow_refund ?? activeRefundPolicy.allow_refunds)
  const canRequestRefund = !isZeroAmountOrFree && isOrderPaid && isEntryEligible && !ticket.checked_in_at && isRefundAllowedByPolicy
  const isCheckedIn = Boolean(ticket.checked_in_at) || ticket.status === 'USED' || ticket.check_in_status === 'CHECKED_IN'
  const sessionEndTime = ticket.session?.end_time
    ? new Date(ticket.session.end_time).getTime()
    : ticket.session?.start_time
      ? new Date(ticket.session.start_time).getTime()
      : ticket.event?.end_time
        ? new Date(ticket.event.end_time).getTime()
        : null
  const isSessionEnded = sessionEndTime ? sessionEndTime <= Date.now() : false
  const canReviewEvent = (isCheckedIn || isSessionEnded || ticket.event?.status === 'COMPLETED') &&
    ticket.status !== 'CANCELLED' && ticket.status !== 'REFUNDED' && ticket.status !== 'REFUND_PENDING' 

  const hasRefundInfo = Boolean(
    refundRequest ||
    ticket.status === 'REFUND_PENDING' ||
    ticket.status === 'REFUNDED' ||
    ticket.status === 'REFUND_REQUESTED' ||
    ticket.event?.status === 'CANCELLED'
  )

  const isEventCancelled = ticket.event?.status === 'CANCELLED' || ticket.status === 'REFUND_REQUESTED' || ticket.status === 'CANCELLED'
  const isTicketRefunded = ticket.status === 'REFUNDED' || refundRequest?.status === 'REFUNDED' || ticket.order?.status === 'REFUNDED'
  const hasProvidedPayout = Boolean(refundRequest?.bank_account_number)
  const needsPayoutInput = Boolean(
    (isEventCancelled || refundRequest) &&
    !hasProvidedPayout &&
    !isTicketRefunded &&
    refundRequest?.status !== 'REJECTED'
  )

  return (
    <div className="mx-auto max-w-5xl px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-8 pb-10">
      <Link
        to="/my-tickets"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white backdrop-blur-md transition-colors hover:text-white/80"
      >
        <ArrowLeft className="size-4" />
        {isEnglish ? 'My Tickets' : 'Vé của tôi'}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,620px)_360px] lg:items-start relative">
        <aside className="order-2 space-y-6 lg:order-2 lg:sticky lg:top-32">
          <Panel title={isEnglish ? 'Payment' : 'Thanh toán'} icon={ReceiptText}>
            <Info label={isEnglish ? 'Transaction Code' : 'Mã giao dịch'} value={ticket.payment?.transaction_code || (ticket.order?.status === 'CONFIRMED' ? (isEnglish ? 'Free' : 'Miễn phí') : 'N/A')} />
            <Info label={isEnglish ? 'Method' : 'Phương thức'} value={ticket.order?.payment_method === 'FREE' || ticket.order?.status === 'CONFIRMED' ? (isEnglish ? 'Free' : 'Miễn phí') : (ticket.payment?.provider || ticket.payment?.method || 'N/A')} />
            <Info label={isEnglish ? 'Total Payment' : 'Tổng thanh toán'} value={formatCurrency(ticket.order?.total_amount, isEnglish)} />
            <Info label={isEnglish ? 'Paid At' : 'Thanh toán lúc'} value={ticket.payment?.paid_at ? formatDateTime(ticket.payment?.paid_at, isEnglish) : (ticket.order?.status === 'CONFIRMED' ? formatDateTime(ticket.order?.created_at, isEnglish) : 'N/A')} />
          </Panel>
          <Panel title={isEnglish ? 'Check-in Information' : 'Thông tin check-in'} icon={CheckCircle2}>
            <Info label={isEnglish ? 'Status' : 'Trạng thái'} value={statusText(ticket, refundRequest, isEnglish)} />
            {ticket.status === 'EXPIRED' ? (
              <Info label={isEnglish ? 'Check-in' : 'Check-in'} value={isEnglish ? 'Closed due to expired ticket' : 'Đã đóng do vé hết hạn'} />
            ) : ticket.checked_in_at ? (
              <Info label={isEnglish ? 'Checked-in At' : 'Check-in lúc'} value={formatDateTime(ticket.checked_in_at, isEnglish)} />
            ) : (
              <CheckInCountdown target={ticket.session?.checkin_start_time} isEnglish={isEnglish} />
            )}
            {ticket.status !== 'EXPIRED' && <Info label={isEnglish ? 'Check-in Opens' : 'Mở check-in'} value={formatDateTime(ticket.session?.checkin_start_time, isEnglish)} />}
          </Panel>
        </aside>

        <div className="order-1 lg:justify-self-start w-full">
          <section className="glass-panel mx-auto max-w-[620px] overflow-hidden rounded-[32px] border-primary/20 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] lg:mx-0 relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--color-primary)_0%,_transparent_60%)] opacity-10 pointer-events-none" />
            <div className="relative min-h-64 overflow-hidden">
              {ticket.event?.banner_url ? (
                <img src={ticket.event.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-85" />
              ) : (
                <div className="absolute inset-0 bg-white/5" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
              <div className="relative flex min-h-64 flex-col justify-end p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-4 py-1.5 text-[10px] font-black tracking-widest uppercase backdrop-blur-md ${isTicketRefunded
                    ? 'bg-purple-500/20 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.25)] border border-purple-500/40'
                    : ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                      ? 'bg-amber-500/25 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)] border border-amber-500/40'
                      : ticket.status === 'EXPIRED' || ticket.status === 'CANCELLED' || ticket.status === 'USED'
                        ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                        : isEntryEligible
                          ? 'bg-emerald-500/25 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)] border border-emerald-500/40'
                          : 'bg-red-500/20 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)] border border-red-500/30'
                    }`}>
                    {statusText(ticket, refundRequest, isEnglish)}
                  </span>
                  <span className="rounded-full bg-black/40 px-4 py-1.5 text-[10px] font-black tracking-widest uppercase text-white border border-white/20 backdrop-blur-md shadow-sm">
                    {ticketTypeName}
                  </span>
                </div>
                <h1 className="mt-4 font-display text-3xl font-black leading-tight text-white drop-shadow-md sm:text-4xl">
                  {eventTitle}
                </h1>
              </div>
            </div>

            <div className="space-y-8 p-8">
              <div className="grid gap-6 sm:grid-cols-2">
                {collectAttendees ? (
                  <>
                    <CompactDetail label={isEnglish ? 'Attendee Name' : 'Họ tên người tham dự'} value={ticket.attendee_name} />
                    <CompactDetail label={isEnglish ? 'Attendee Email' : 'Email người tham dự'} value={ticket.attendee_email} />
                  </>
                ) : (
                  <>
                    <CompactDetail label={isEnglish ? 'Buyer Name' : 'Họ tên người mua'} value={ticket.order?.buyer_name} />
                    <CompactDetail label={isEnglish ? 'Buyer Email' : 'Email người mua'} value={ticket.order?.buyer_email} />
                  </>
                )}
                <CompactDetail label={isEnglish ? 'Ticket Type' : 'Loại vé'} value={ticketTypeName} />
                <CompactDetail label={isEnglish ? 'Seat' : 'Ghế ngồi'} value={seat} />
                <CompactDetail label={isEnglish ? 'Time' : 'Thời gian'} value={formatDateTime(ticket.session?.start_time, isEnglish)} />
                <CompactDetail label={isEnglish ? 'Check-in' : 'Check-in'} value={ticket.checked_in_at ? formatDateTime(ticket.checked_in_at, isEnglish) : (isEnglish ? 'Not checked in' : 'Chưa check-in')} />
                <CompactDetail label={isEnglish ? 'Venue' : 'Địa điểm'} value={venueText || 'N/A'} wide />
                {collectAttendees && (
                  <>
                    <CompactDetail label={isEnglish ? 'Buyer Name' : 'Người mua vé'} value={ticket.order?.buyer_name} />
                    <CompactDetail label={isEnglish ? 'Buyer Email' : 'Email người mua'} value={ticket.order?.buyer_email} />
                  </>
                )}
                <CompactDetail label={isEnglish ? 'Order Code' : 'Mã đơn hàng'} value={ticket.order?.order_code} />
              </div>

              <div className="relative border-t-2 border-dashed border-white/10 pt-8 before:absolute before:-left-11 before:top-0 before:size-6 before:-translate-y-1/2 before:rounded-full before:bg-background after:absolute after:-right-11 after:top-0 after:size-6 after:-translate-y-1/2 after:rounded-full after:bg-background">
                {isEntryEligible ? (
                  <>
                    <div className="mx-auto w-fit rounded-[24px] bg-white p-5 shadow-[0_0_40px_rgba(255,255,255,0.1)] relative z-10">
                      <QRCodeImage text={qrPayload(ticket)} alt="QR check-in" size={208} className="size-52 rounded-lg" />
                    </div>
                    <p className="mt-6 text-center font-mono text-lg font-black tracking-[0.2em] text-white drop-shadow-md relative z-10">{ticket.ticket_code}</p>
                  </>
                ) : (
                  <div className="py-8 text-center relative z-10">
                    <p className={`font-black text-sm uppercase tracking-wider drop-shadow-[0_0_10px_currentColor] ${isTicketRefunded
                      ? 'text-purple-400'
                      : ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                      }`}>
                      {isTicketRefunded
                        ? (isEnglish ? 'This ticket has been refunded and is no longer valid' : 'Vé này đã được hoàn tiền thành công và không còn hiệu lực')
                        : ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                          ? (isEnglish ? 'Ticket has a pending refund request awaiting organizer review within 48h' : 'Vé đang có yêu cầu hoàn tiền đang chờ ban tổ chức xem xét trong vòng 48h')
                          : (isEnglish ? 'Ticket is expired or no longer valid for check-in' : 'Vé đã hết hạn hoặc không còn hợp lệ để check-in')}
                    </p>

                    {hasRefundInfo && (
                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setRefundDetailOpen(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-[#C99A47]/40 bg-[#C99A47]/15 px-5 py-2 text-xs font-bold text-[#E6C17A] shadow-[0_0_15px_rgba(201,154,71,0.25)] backdrop-blur-md transition-all hover:bg-[#C99A47]/25 hover:border-[#E6C17A]/60 cursor-pointer"
                        >
                          <RotateCcw className="size-3.5" />
                          {isEnglish ? 'View Refund Details' : 'Xem chi tiết hoàn tiền'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="mx-auto mt-8 max-w-[620px] space-y-4 lg:mx-0">
            {canReviewEvent && (
              <button
                type="button"
                onClick={() => navigate(`/feedback?eventId=${ticket.event?.id}`)}
                className="w-full py-4 text-[15px] font-bold rounded-2xl bg-gradient-to-r from-[#C99A47] via-[#E6C17A] to-[#C99A47] hover:brightness-110 text-[#0D1B2A] flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(201,154,71,0.35)] transition-all cursor-pointer active:scale-[0.99]"
              >
                <Star className="size-5 fill-[#0D1B2A]" />
                {isEnglish ? 'Review Event' : 'Đánh giá sự kiện'}
              </button>
            )}

            {needsPayoutInput && (
              <button
                type="button"
                onClick={() => setRefundDetailOpen(true)}
                className="w-full py-4 text-[15px] font-bold rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(245,158,11,0.35)] transition-all cursor-pointer"
              >
                <RotateCcw className="size-5" />
                {isEnglish ? 'Provide Bank Account for 100% Refund' : 'Cung cấp số tài khoản nhận tiền hoàn 100%'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="cosmic-btn-primary w-full py-4 text-[15px] flex items-center justify-center gap-3 cursor-pointer"
            >
              <Download className="size-5" />
              {downloading ? (isEnglish ? 'Generating file...' : 'Đang tạo file...') : (isEnglish ? 'Download Ticket' : 'Tải vé xuống thiết bị')}
            </button>
            {downloadError && <p className="text-sm text-error">{downloadError}</p>}
            {!isEntryEligible && (
              <p className="text-sm font-medium text-warning text-center">
                {isEnglish ? 'Ticket is no longer valid for entry. Downloaded file will contain a status watermark.' : 'Vé không còn hợp lệ để vào cổng. File tải xuống sẽ có watermark trạng thái.'}
              </p>
            )}

            {canCancelFreeTicket ? (
              <CancelFreeTicketButton
                ticket={ticket}
                isEnglish={isEnglish}
                onCancelled={() => {
                  ticketQuery.refetch()
                }}
              />
            ) : canRequestRefund ? (
              <RefundButton
                ticket={ticket}
                isEnglish={isEnglish}
                onRefundSubmitted={() => {
                  ticketQuery.refetch()
                  refundsQuery.refetch()
                }}
              />
            ) : isFreeOrDiscounted && isEntryEligible && !ticket.checked_in_at && !isMoreThan2HoursBeforeSession ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center text-xs text-slate-400">
                {isEnglish ? 'Free tickets can only be cancelled at least 2 hours prior to start time.' : 'Vé miễn phí chỉ có thể hủy trước giờ bắt đầu sự kiện ít nhất 2 giờ.'}
              </div>
            ) : isOrderPaid && isEntryEligible && !ticket.checked_in_at && !isRefundAllowedByPolicy && !isZeroAmountOrFree ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center text-xs text-slate-400">
                {isEnglish ? 'Tickets are non-refundable according to event policy.' : 'Vé không hỗ trợ hoàn hủy theo chính sách của sự kiện.'}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <RefundDetailModal
        isOpen={refundDetailOpen}
        onClose={() => setRefundDetailOpen(false)}
        ticket={ticket}
        refundRequest={refundRequest}
        isEnglish={isEnglish}
        onPayoutSubmitted={() => {
          ticketQuery.refetch()
          refundsQuery.refetch()
          queryClient.invalidateQueries({ queryKey: ['my-refunds'] })
          queryClient.invalidateQueries({ queryKey: ['ticket-detail'] })
        }}
      />
    </div>
  )
}

function CancelFreeTicketButton({ ticket, onCancelled, isEnglish = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const toast = useToast()

  const cancelMutation = useMutation({
    mutationFn: () => cancelFreeTicket(ticket.id, reason.trim() || (isEnglish ? 'User self-cancelled free ticket' : 'Khách hàng tự hủy vé miễn phí')),
    onSuccess: (data) => {
      toast.success(data?.message || (isEnglish ? 'Free ticket cancelled successfully' : 'Hủy vé miễn phí thành công'))
      setIsOpen(false)
      onCancelled?.()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || (isEnglish ? 'Unable to cancel ticket. Please try again later.' : 'Không thể hủy vé. Vui lòng thử lại sau.'))
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 py-3.5 text-sm font-bold text-rose-400 transition hover:bg-rose-500/20 hover:border-rose-500/50 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        <X className="size-4" />
        {isEnglish ? 'Cancel Free Ticket' : 'Hủy vé miễn phí'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0d172e] p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="size-5 text-rose-400" />
                {isEnglish ? 'Confirm Free Ticket Cancellation' : 'Xác nhận hủy vé miễn phí'}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <p>
                {isEnglish ? (
                  <>Are you sure you want to cancel ticket <strong className="text-white font-mono">{ticket.ticket_code}</strong> for event <strong className="text-white">{eventTitle}</strong>?</>
                ) : (
                  <>Bạn có chắc chắn muốn hủy vé <strong className="text-white font-mono">{ticket.ticket_code}</strong> cho sự kiện <strong className="text-white">{ticket.event?.title}</strong> không?</>
                )}
              </p>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <strong>{isEnglish ? 'Note:' : 'Lưu ý:'}</strong> {isEnglish ? 'Cancelled tickets cannot be restored. Seat or slot will be released for other attendees.' : 'Vé sau khi hủy sẽ không thể khôi phục lại. Ghế ngồi hoặc lượt đặt sẽ được giải phóng cho khán giả khác. Nếu muốn tham gia, bạn sẽ phải tiến hành đặt lại vé nếu sự kiện còn chỗ.'}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  {isEnglish ? 'Cancellation Reason (Optional)' : 'Lý do hủy (không bắt buộc)'}
                </label>
                <input
                  type="text"
                  placeholder={isEnglish ? 'e.g. Schedule conflict, sudden busy...' : 'Ví dụ: Bận việc đột xuất, trùng lịch...'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => setIsOpen(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white"
              >
                {isEnglish ? 'Keep Ticket' : 'Giữ lại vé'}
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-rose-900/40"
              >
                {cancelMutation.isPending ? (isEnglish ? 'Cancelling...' : 'Đang hủy...') : (isEnglish ? 'Confirm Cancellation' : 'Xác nhận hủy vé')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function RefundButton({ ticket, onRefundSubmitted, isEnglish = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const toast = useToast()
  const [reason, setReason] = useState('Trùng lịch cá nhân')
  const [customerNote, setCustomerNote] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')

  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState(null)

  useEffect(() => {
    if (!isOpen || !ticket?.id) return
    let isMounted = true
    setPreviewLoading(true)
    setPreviewError(null)

    fetchRefundPreview(ticket.id)
      .then((data) => {
        if (isMounted) setPreviewData(data)
      })
      .catch((err) => {
        if (isMounted) {
          setPreviewError(err.response?.data?.message || (isEnglish ? 'Unable to retrieve refund calculation info.' : 'Không thể lấy thông tin tính toán hoàn tiền.'))
        }
      })
      .finally(() => {
        if (isMounted) setPreviewLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, ticket?.id, isEnglish])

  const refundMutation = useMutation({
    mutationFn: (payload) => submitRefundRequest(payload),
    onSuccess: (data) => {
      toast.success(data?.message || (isEnglish ? 'Refund request submitted. The organizer will review within 48 hours.' : 'Gửi yêu cầu hoàn tiền thành công. Ban tổ chức sẽ xem xét trong vòng 48h.'))
      setIsOpen(false)
      onRefundSubmitted?.()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || (isEnglish ? 'Unable to submit refund request. Please check the event refund policy.' : 'Không thể gửi yêu cầu hoàn tiền. Vui lòng kiểm tra chính sách hoàn vé của sự kiện.'))
    },
  })

  const originalPrice = Number(ticket.ticket_type?.price || ticket.order_item?.unit_price || ticket.order_item?.final_price || 0)
  const subtotal = Number(ticket.order?.subtotal || 0)
  const orderDiscount = Number(ticket.order?.discount_amount || 0)
  const orderTotal = Number(ticket.order?.total_amount || 0)

  let actualPaid = Number(ticket.order_item?.actual_price || 0)
  if (!actualPaid) {
    if (subtotal > 0 && orderDiscount > 0) {
      const ticketDiscount = Math.round((originalPrice / subtotal) * orderDiscount)
      actualPaid = Math.max(0, originalPrice - ticketDiscount)
    } else if (orderTotal > 0 && orderTotal < originalPrice) {
      actualPaid = orderTotal
    } else {
      actualPaid = originalPrice
    }
    if (orderTotal > 0 && actualPaid > orderTotal) {
      actualPaid = orderTotal
    }
  }

  const discountAmount = Math.max(0, originalPrice - actualPaid)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (previewData && !previewData.eligible) {
      toast.error(previewData.reason || (isEnglish ? 'This ticket is not eligible for refund.' : 'Vé này không đủ điều kiện hoàn tiền.'))
      return
    }

    if (reason === 'Khác' && !customerNote.trim()) {
      toast.error(isEnglish ? 'Please provide detailed notes when selecting "Other"!' : 'Vui lòng nhập ghi chú chi tiết khi chọn lý do "Khác"!')
      return
    }

    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      toast.error(isEnglish ? 'Please select bank and enter full account number and holder name!' : 'Vui lòng chọn ngân hàng và nhập đầy đủ số tài khoản, tên chủ tài khoản nhận tiền hoàn!')
      return
    }

    refundMutation.mutate({
      ticket_id: ticket.id,
      order_id: ticket.order?.id,
      reason,
      customer_note: customerNote,
      bank_info: {
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim().toUpperCase(),
      },
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#C99A47]/40 bg-transparent px-4 py-3.5 text-sm font-bold text-[#E6C17A] transition-all hover:bg-[#C99A47]/10 hover:border-[#E6C17A]/60 hover:shadow-[0_0_15px_rgba(201,154,71,0.2)]"
      >
        <RotateCcw className="size-4" />
        {isEnglish ? 'Request Ticket Refund' : 'Yêu cầu hoàn tiền vé'}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div
            className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative z-10 w-full max-w-xl max-h-[92vh] flex flex-col rounded-[28px] border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex-none flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-[#C99A47]/15 border border-[#E6C17A]/30 text-[#E6C17A]">
                  <RotateCcw className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">{isEnglish ? 'Request Ticket Refund' : 'Yêu cầu hoàn tiền vé'}</h3>
                  <p className="text-xs text-slate-400">{isEnglish ? 'Preview refund info & submit request to organizer' : 'Xem trước thông tin hoàn tiền & gửi yêu cầu đến ban tổ chức'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col justify-between">
              <div className="p-6 space-y-4">
                {/* Information Header / Ticket summary */}
                <div className="rounded-[20px] border border-white/5 bg-white/[0.02] p-4 text-xs">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">{isEnglish ? 'Event' : 'Sự kiện'}</span>
                        <p className="text-sm font-black text-white mt-0.5">
                          {eventTitle || (isEnglish ? 'Event' : 'Sự kiện')}
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary shrink-0">
                        {ticket.ticket_code}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium">{isEnglish ? 'Ticket Tier: ' : 'Hạng vé: '}</span>
                        <span className="font-bold text-white">
                          {ticketTypeName || (isEnglish ? 'Standard Ticket' : 'Vé tiêu chuẩn')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">{isEnglish ? 'Order ID: ' : 'Mã đơn: '}</span>
                        <span className="font-mono font-bold text-white">
                          #{ticket.order?.order_code || ticket.order?.id?.slice(0, 8)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">{isEnglish ? 'Original Price: ' : 'Giá gốc: '}</span>
                        <span className="font-bold text-white">
                          {formatCurrency(originalPrice, isEnglish)}
                        </span>
                      </div>
                      {discountAmount > 0 && (
                        <div>
                          <span className="text-slate-400 font-medium">{isEnglish ? 'Discount: ' : 'Khuyến mãi: '}</span>
                          <span className="font-bold text-emerald-400">
                            -{formatCurrency(discountAmount, isEnglish)}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400 font-medium">{isEnglish ? 'Actually Paid: ' : 'Thực tế đã trả: '}</span>
                        <span className="font-bold text-[#E6C17A] drop-shadow-[0_0_5px_rgba(201,154,71,0.3)]">
                          {formatCurrency(previewData?.paid_amount ?? actualPaid, isEnglish)}
                        </span>
                      </div>
                      {ticket.session?.start_time && (
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-slate-400 font-medium">{isEnglish ? 'Time: ' : 'Thời gian: '}</span>
                          <span className="font-bold text-white">
                            {formatDateTime(ticket.session?.start_time, isEnglish)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview Loading State */}
                {previewLoading && (
                  <div className="rounded-[16px] border border-white/10 bg-white/[0.02] p-4 text-center text-slate-300 text-xs flex items-center justify-center gap-2.5">
                    <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>{isEnglish ? 'Checking policy and calculating refund amount...' : 'Đang kiểm tra chính sách và tính toán số tiền hoàn...'}</span>
                  </div>
                )}

                {previewError && (
                  <div className="rounded-[16px] border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-200">
                    <p className="font-bold text-rose-300">{isEnglish ? 'Failed to preview refund:' : 'Không thể tải thông tin xem trước:'}</p>
                    <p className="mt-1 text-xs">{previewError}</p>
                  </div>
                )}

                {previewData && (
                  <div className="space-y-3">
                    {/* Time remaining and applicable refund rate */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <span className="text-slate-400 block mb-0.5">{isEnglish ? 'Time before event' : 'Thời gian trước sự kiện'}</span>
                        <span className="font-bold text-white text-sm">
                          {previewData.days_before_event != null ? `${previewData.days_before_event} ${isEnglish ? 'days' : 'ngày'}` : 'N/A'}
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <span className="text-slate-400 block mb-0.5">{isEnglish ? 'Applicable refund rate' : 'Tỷ lệ hoàn áp dụng'}</span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {previewData.refund_rate}%
                        </span>
                      </div>
                    </div>

                    {/* Calculated Refund Amount */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                      <span className="font-black text-emerald-300">{isEnglish ? 'Proposed refund amount:' : 'Số tiền hoàn đề xuất:'}</span>
                      <span className="text-lg font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
                        {formatCurrency(previewData.refund_amount, isEnglish)}
                      </span>
                    </div>

                    {/* Ineligibility notice if not eligible */}
                    {!previewData.eligible && (
                      <div className="rounded-[16px] border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-200">
                        <p className="font-bold text-rose-300 flex items-center gap-1.5">
                          <AlertCircle className="size-4" />
                          {isEnglish ? 'Ineligible for refund' : 'Không đủ điều kiện hoàn vé'}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">{previewData.reason}</p>
                      </div>
                    )}

                    {/* Policy lines */}
                    {previewData.policy_text && (
                      <div className="rounded-[16px] border border-cyan-500/30 bg-cyan-500/10 p-4 text-[12px] text-cyan-200 space-y-1">
                        <p className="font-bold text-cyan-300 mb-1">{isEnglish ? 'Event refund policy:' : 'Chính sách hoàn vé của sự kiện:'}</p>
                        <p className="whitespace-pre-line text-slate-300 leading-relaxed font-normal">
                          {previewData.policy_text}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Refund Reason Dropdown */}
                <div className="bg-black/20 p-5 rounded-[24px] border border-white/5 shadow-inner space-y-4">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">
                      {isEnglish ? 'Refund Reason' : 'Lý do hoàn vé'} <span className="text-error">*</span>
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-[#F5EBDD] transition-all shadow-inner cursor-pointer hover:border-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.25)] focus:border-[#E6C17A] focus:bg-black/60 focus:ring-1 focus:ring-[#E6C17A] focus:shadow-[0_0_16px_rgba(201,154,71,0.35)] focus:outline-none"
                    >
                      <option value="Trùng lịch cá nhân" className="bg-[#0f172a] text-[#F5EBDD]">{isEnglish ? 'Personal schedule conflict' : 'Trùng lịch cá nhân'}</option>
                      <option value="Sự kiện thay đổi thông tin" className="bg-[#0f172a] text-[#F5EBDD]">{isEnglish ? 'Event changed details' : 'Sự kiện thay đổi thông tin'}</option>
                      <option value="Mua nhầm vé" className="bg-[#0f172a] text-[#F5EBDD]">{isEnglish ? 'Purchased by mistake' : 'Mua nhầm vé'}</option>
                      <option value="Lý do sức khỏe" className="bg-[#0f172a] text-[#F5EBDD]">{isEnglish ? 'Health issues' : 'Lý do sức khỏe'}</option>
                      <option value="Khác" className="bg-[#0f172a] text-[#F5EBDD]">{isEnglish ? 'Other' : 'Khác'}</option>
                    </select>
                  </div>

                  {/* Reason Note / Detail */}
                  <div>
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">
                      {isEnglish ? 'Detailed Note' : 'Ghi chú chi tiết'} {reason === 'Khác' && <span className="text-error">*</span>}
                    </label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={customerNote}
                      required={reason === 'Khác'}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder={reason === 'Khác' ? (isEnglish ? 'Please provide detailed reason (required)...' : 'Vui lòng nêu rõ lý do hoàn vé (bắt buộc)...') : (isEnglish ? 'Additional info (optional, max 500 chars)...' : 'Thông tin bổ sung (nếu có, tối đa 500 ký tự)...')}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 p-4 text-[13px] font-medium text-[#F5EBDD] placeholder-slate-500 transition-all shadow-inner resize-y min-h-[80px] hover:border-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.25)] focus:border-[#E6C17A] focus:bg-black/60 focus:ring-1 focus:ring-[#E6C17A] focus:shadow-[0_0_16px_rgba(201,154,71,0.35)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Mandatory Bank Account Info */}
                <div className="space-y-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  <p className="text-[13px] font-bold text-slate-300">
                    {isEnglish ? 'Bank account receiving refund' : 'Tài khoản ngân hàng nhận tiền hoàn'} <span className="text-error">*</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-[#F5EBDD] transition-all shadow-inner cursor-pointer hover:border-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.25)] focus:border-[#E6C17A] focus:bg-[#0f172a] focus:ring-1 focus:ring-[#E6C17A] focus:shadow-[0_0_16px_rgba(201,154,71,0.35)] focus:outline-none"
                    >
                      <option value="" disabled className="bg-[#0f172a] text-slate-400">
                        {isEnglish ? '-- Select Bank * --' : '-- Chọn ngân hàng * --'}
                      </option>
                      {VIETNAMESE_BANKS.map((b) => {
                        const display = getBankDisplayName(b)
                        return (
                          <option key={b.code} value={display} className="bg-[#0f172a] text-[#F5EBDD]">
                            {display}
                          </option>
                        )
                      })}
                    </select>
                    <input
                      type="text"
                      required
                      placeholder={isEnglish ? 'Account Number *' : 'Số tài khoản *'}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-[#F5EBDD] placeholder-slate-500 transition-all shadow-inner hover:border-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.25)] focus:border-[#E6C17A] focus:bg-black/60 focus:ring-1 focus:ring-[#E6C17A] focus:shadow-[0_0_16px_rgba(201,154,71,0.35)] focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder={isEnglish ? 'Account Holder Name (CAPITALS) *' : 'Tên chủ tài khoản *'}
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                    className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-[#F5EBDD] placeholder-slate-500 transition-all shadow-inner hover:border-[#E6C17A] hover:shadow-[0_0_12px_rgba(201,154,71,0.25)] focus:border-[#E6C17A] focus:bg-black/60 focus:ring-1 focus:ring-[#E6C17A] focus:shadow-[0_0_16px_rgba(201,154,71,0.35)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Footer Section Buttons */}
              <div className="flex-none flex items-center justify-end gap-3 border-t border-white/5 bg-white/[0.02] px-6 py-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-[13px] font-bold text-slate-300 hover:bg-white/10 hover:text-white transition backdrop-blur-md"
                >
                  {isEnglish ? 'Cancel' : 'Hủy'}
                </button>
                <button
                  type="submit"
                  disabled={refundMutation.isPending || previewLoading || (previewData && !previewData.eligible)}
                  className="btn-gold-primary px-7 py-2.5 text-[13px] font-bold cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
                >
                  {refundMutation.isPending ? (isEnglish ? 'Submitting...' : 'Đang gửi...') : (isEnglish ? 'Submit Request' : 'Gửi yêu cầu')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function CompactDetail({ label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold leading-relaxed text-white">{value || 'N/A'}</p>
    </div>
  )
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="glass-panel relative overflow-hidden rounded-[24px] border-primary/20 bg-slate-950/40 p-8 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_var(--color-primary)_0%,_transparent_50%)] opacity-10" />
      <div className="mb-6 flex items-center gap-3 text-primary">
        <Icon className="size-6 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
        <h2 className="font-display text-xl font-black uppercase tracking-widest text-white drop-shadow-sm">{title}</h2>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function CheckInCountdown({ target, isEnglish = false }) {
  const [now, setNow] = useState(() => Date.now())
  const parts = countdownParts(target, now)

  useEffect(() => {
    if (!target || parts?.ended) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [parts?.ended, target])

  if (!target) return <Info label={isEnglish ? 'Check-in Opens' : 'Check-in lúc'} value="N/A" />
  if (parts?.ended) return <Info label={isEnglish ? 'Check-in Opens' : 'Check-in lúc'} value={isEnglish ? 'Open' : 'Đã mở'} />

  return (
    <div className="rounded-[16px] border border-primary/20 bg-primary/10 p-5 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">{isEnglish ? 'Check-in starts in' : 'Check-in bắt đầu sau'}</p>
        <Clock3 className="size-5 text-primary opacity-50" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-white">
        <CountdownUnit label={isEnglish ? 'Days' : 'Ngày'} value={parts.days} />
        <CountdownUnit label={isEnglish ? 'Hours' : 'Giờ'} value={parts.hours} />
        <CountdownUnit label={isEnglish ? 'Min' : 'Phút'} value={parts.minutes} />
      </div>
    </div>
  )
}

function CountdownUnit({ label, value }) {
  return (
    <div>
      <p className="font-mono text-2xl font-black leading-none">{String(value).padStart(2, '0')}</p>
      <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 break-words font-semibold text-white">{value}</p>
    </div>
  )
}

function RefundDetailModal({ isOpen, onClose, ticket, refundRequest, onPayoutSubmitted, isEnglish = false }) {
  if (!isOpen || !ticket) return null

  const toast = useToast()
  const status = refundRequest?.status || (ticket.status === 'REFUNDED' ? 'REFUNDED' : 'PENDING')
  const [bankName, setBankName] = useState(refundRequest?.bank_name || '')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState(refundRequest?.bank_account_name || ticket.order?.buyer_name || '')
  const [submittingPayout, setSubmittingPayout] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const isCustomerConfirmed = Boolean(
    refundRequest?.audit_trail?.some?.((a) => a.action === 'CONFIRM_REFUND_RECEIVED' || a.action === 'CUSTOMER_CONFIRMED')
  )
  const [confirmedReceived, setConfirmedReceived] = useState(isCustomerConfirmed)
  useEffect(() => {
    setConfirmedReceived(isCustomerConfirmed)
  }, [isCustomerConfirmed])

  const needsPayoutInfo = Boolean(
    refundRequest &&
    !refundRequest.bank_account_number &&
    status !== 'REFUNDED' &&
    status !== 'REJECTED'
  )

  const handlePayoutSubmit = async (e) => {
    e.preventDefault()
    if (!bankName || !accountNumber || !accountName) {
      toast.error(isEnglish ? 'Please fill in complete bank account details.' : 'Vui lòng điền đầy đủ thông tin tài khoản ngân hàng nhận tiền hoàn.')
      return
    }
    setSubmittingPayout(true)
    try {
      await submitPayoutInfo({
        refund_request_id: refundRequest.id,
        bank_name: bankName,
        bank_account_number: accountNumber.trim(),
        bank_account_name: accountName.trim().toUpperCase(),
      })
      toast.success(isEnglish ? 'Bank account info saved. The organizer will process the payout.' : 'Đã lưu thông tin nhận tiền hoàn. Ban tổ chức sẽ tiến hành chuyển khoản.')
      onPayoutSubmitted?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || (isEnglish ? 'Unable to save payout info.' : 'Không thể lưu thông tin nhận tiền.'))
    } finally {
      setSubmittingPayout(false)
    }
  }

  const handleConfirmReceived = async () => {
    try {
      await confirmReceivedRefund(refundRequest.id)
      setConfirmedReceived(true)
      toast.success(isEnglish ? 'Thank you for confirming receipt of the full refund.' : 'Cảm ơn bạn đã xác nhận đã nhận đủ tiền hoàn.')
      onPayoutSubmitted?.()
    } catch (err) {
      toast.error(err.response?.data?.message || (isEnglish ? 'Failed to confirm receipt.' : 'Không thể xác nhận đã nhận tiền.'))
    }
  }

  const handleDisputeSubmit = async (e) => {
    e?.preventDefault()
    if (!disputeReason?.trim()) {
      toast.error(isEnglish ? 'Please enter a dispute reason.' : 'Vui lòng nhập lý do khiếu nại.')
      return
    }
    setSubmittingDispute(true)
    try {
      await disputeRefund(refundRequest.id, disputeReason.trim())
      toast.warning(isEnglish ? 'Dispute submitted. Organizer and Admin will review the transaction.' : 'Đã gửi khiếu nại chưa nhận được tiền. Ban tổ chức và Admin sẽ kiểm tra lại giao dịch.')
      setShowDisputeForm(false)
      setDisputeReason('')
      onPayoutSubmitted?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || (isEnglish ? 'Failed to submit dispute.' : 'Không thể gửi khiếu nại.'))
    } finally {
      setSubmittingDispute(false)
    }
  }

  const getStatusBadge = () => {
    if (needsPayoutInfo) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-3.5 py-1 text-xs font-bold text-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.3)] animate-pulse">
          <Clock3 className="size-3.5" /> {isEnglish ? 'Bank Account Needed' : 'Cần cung cấp STK nhận tiền'}
        </span>
      )
    }
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3.5 py-1 text-xs font-bold text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
            <Clock3 className="size-3.5" /> {isEnglish ? 'Pending Review' : 'Đang chờ duyệt'}
          </span>
        )
      case 'CUSTOMER_INPUT':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-orange-500/15 px-3.5 py-1 text-xs font-bold text-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.3)] animate-pulse">
            <Clock3 className="size-3.5" /> {isEnglish ? 'Bank Account Needed' : 'Cần cung cấp STK nhận tiền'}
          </span>
        )
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 px-3.5 py-1 text-xs font-bold text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            <CheckCircle2 className="size-3.5" /> {isEnglish ? 'Approved (Awaiting Payout)' : 'Đã duyệt (Chờ BTC chuyển tiền)'}
          </span>
        )
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-3.5 py-1 text-xs font-bold text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <CheckCircle2 className="size-3.5" /> {isEnglish ? 'Refunded Successfully' : 'Đã hoàn tiền thành công'}
          </span>
        )
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3.5 py-1 text-xs font-bold text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.3)]">
            <X className="size-3.5" /> {isEnglish ? 'Refund Rejected' : 'Từ chối hoàn tiền'}
          </span>
        )
      default:
        return (
          <span className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-bold text-slate-300">
            {status}
          </span>
        )
    }
  }

  const refundAmount = refundRequest?.refund_amount ?? (ticket.order_item?.actual_price || ticket.order_item?.final_price || ticket.ticket_type?.price || 0)

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col rounded-[24px] border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/90 backdrop-blur-md shrink-0">
          <h3 className="text-lg font-bold text-white tracking-wide">{isEnglish ? 'Ticket Refund Details' : 'Chi tiết hoàn tiền vé'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            title={isEnglish ? 'Close' : 'Đóng'}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status & Amount highlight banner */}
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
            <div>
              <p className="text-[11px] font-bold text-white uppercase tracking-wider">{isEnglish ? 'Refund Status' : 'Trạng thái hoàn tiền'}</p>
              <div className="mt-1.5">{getStatusBadge()}</div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-white uppercase tracking-wider">{isEnglish ? 'Refund Amount' : 'Số tiền hoàn'}</p>
              <p className="mt-1 text-xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                {formatCurrency(refundAmount, isEnglish)}
              </p>
            </div>
          </div>

          {/* Form to submit payout info if needsPayoutInfo */}
          {needsPayoutInfo && (
            <div className="rounded-[20px] border border-orange-500/30 bg-orange-500/10 p-5">
              <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wider mb-2">
                {isEnglish ? 'Provide Bank Account for Refund' : 'Cung cấp thông tin tài khoản nhận tiền hoàn'}
              </h4>
              <p className="text-xs text-orange-200/90 mb-3">
                {isEnglish ? 'Due to event cancellation or update, the organizer needs your bank info to process 100% refund.' : 'Do sự kiện bị hủy hoặc thay đổi, Ban tổ chức cần thông tin tài khoản ngân hàng của bạn để chuyển khoản hoàn tiền 100%.'}
              </p>
              <form onSubmit={handlePayoutSubmit} className="space-y-3">
                <div>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/15 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  >
                    <option value="">{isEnglish ? '-- Select Bank --' : '-- Chọn ngân hàng thụ hưởng --'}</option>
                    {VIETNAMESE_BANKS.map((b) => (
                      <option key={b.code} value={b.shortName}>
                        {b.shortName} - {b.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    required
                    placeholder={isEnglish ? 'Bank account number' : 'Số tài khoản ngân hàng'}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    placeholder={isEnglish ? 'Account holder name (CAPITALS)' : 'Tên chủ tài khoản (VIẾT HOA KHÔNG DẤU)'}
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-white/15 bg-slate-900 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  className="w-full rounded-xl bg-orange-600 hover:bg-orange-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer"
                >
                  {submittingPayout ? (isEnglish ? 'Saving...' : 'Đang lưu...') : (isEnglish ? 'Confirm Payout Info' : 'Xác nhận thông tin nhận tiền')}
                </button>
              </form>
            </div>
          )}

          {/* Display submitted bank account info if already provided */}
          {!needsPayoutInfo && refundRequest?.bank_name && (
            <div className="rounded-[20px] border border-blue-500/30 bg-blue-500/10 p-4">
              <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-2.5">
                {isEnglish ? 'Registered Payout Bank Account' : 'Tài khoản nhận tiền hoàn đã ghi nhận'}
              </h4>
              <div className="space-y-1.5 text-xs text-blue-100">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-blue-200/70 font-medium shrink-0">{isEnglish ? 'Bank:' : 'Ngân hàng:'}</span>
                  <span className="font-semibold text-right text-white">{resolveBankName(refundRequest.bank_name)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-blue-200/70 font-medium shrink-0">{isEnglish ? 'Account No:' : 'Số TK:'}</span>
                  <span className="font-mono font-bold text-amber-300 tracking-wider">
                    {refundRequest.bank_account_number?.startsWith?.('enc.') ? '••••••••' : refundRequest.bank_account_number}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-blue-200/70 font-medium shrink-0">{isEnglish ? 'Account Holder:' : 'Chủ TK:'}</span>
                  <span className="font-bold text-white uppercase">{refundRequest.bank_account_name || 'N/A'}</span>
                </div>
              </div>
              <p className="text-[11px] text-blue-200/80 mt-3 pt-2 border-t border-blue-500/20">
                {isEnglish ? 'The organizer will review and execute 100% refund transfer per policy.' : 'Ban tổ chức sẽ đối soát và thực hiện chuyển tiền hoàn 100% cho bạn theo quy định.'}
              </p>
            </div>
          )}

          {/* Details list */}
          <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-5 space-y-3.5 text-xs">
            {refundRequest?.id && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">{isEnglish ? 'Request ID:' : 'Mã yêu cầu:'}</span>
                <span className="font-mono font-bold text-primary">REQ #{refundRequest.id.slice(0, 8)}</span>
              </div>
            )}
            <div className="flex justify-between items-start gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium">{isEnglish ? 'Event:' : 'Sự kiện:'}</span>
              <span className="font-bold text-white text-right max-w-[65%] line-clamp-2">
                {eventTitle}
              </span>
            </div>

            <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium">{isEnglish ? 'Ticket Code:' : 'Mã vé:'}</span>
              <span className="font-mono font-bold text-primary">{ticket.ticket_code}</span>
            </div>

            <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium">{isEnglish ? 'Order ID:' : 'Mã đơn hàng:'}</span>
              <span className="font-mono font-bold text-white">
                #{ticket.order?.order_code || ticket.order?.id?.slice(0, 8)}
              </span>
            </div>

            {refundRequest?.created_at && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">{isEnglish ? 'Request Date & Time:' : 'Ngày giờ gửi yêu cầu:'}</span>
                <span className="font-semibold text-slate-200">
                  {formatDateTime(refundRequest.created_at || refundRequest.requested_at, isEnglish)}
                </span>
              </div>
            )}

            {refundRequest?.refunded_at && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">{isEnglish ? 'Refund Date & Time:' : 'Ngày giờ hoàn tiền:'}</span>
                <span className="font-bold text-emerald-400">
                  {formatDateTime(refundRequest.refunded_at, isEnglish)}
                </span>
              </div>
            )}

            {refundRequest?.reviewed_at && !refundRequest?.refunded_at && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">{isEnglish ? 'Review Date & Time:' : 'Ngày giờ xét duyệt:'}</span>
                <span className="font-semibold text-slate-200">
                  {formatDateTime(refundRequest.reviewed_at, isEnglish)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-start gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium shrink-0">{isEnglish ? 'Refund Reason:' : 'Lý do hoàn tiền:'}</span>
              <span className="font-semibold text-white text-right break-words">
                {formatRefundReason(refundRequest?.reason, isEnglish ? 'en' : 'vi') || (isEnglish ? 'Per event refund policy' : 'Theo chính sách hoàn vé sự kiện')}
              </span>
            </div>

            {refundRequest?.refund_method && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">{isEnglish ? 'Refund Method:' : 'Phương thức hoàn:'}</span>
                <span className="font-semibold text-slate-200">
                  {refundRequest.refund_method === 'PAYOS' ? (isEnglish ? 'Automatic via PayOS' : 'Tự động qua cổng PayOS') : (isEnglish ? 'Bank Transfer' : 'Chuyển khoản ngân hàng')}
                </span>
              </div>
            )}

            {refundRequest?.bank_name && (
              <div className="flex justify-between items-start gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium shrink-0">{isEnglish ? 'Receiving Account:' : 'Tài khoản nhận:'}</span>
                <div className="text-right text-slate-200 space-y-0.5">
                  <p className="font-semibold text-white">{resolveBankName(refundRequest.bank_name)}</p>
                  <p className="font-mono font-bold text-amber-300">
                    {refundRequest.bank_account_number?.startsWith?.('enc.') ? '••••••••' : refundRequest.bank_account_number}
                  </p>
                  {refundRequest.bank_account_name && (
                    <p className="font-medium text-slate-400 uppercase text-[11px]">({refundRequest.bank_account_name})</p>
                  )}
                </div>
              </div>
            )}

            {refundRequest?.transaction_ref && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">{isEnglish ? 'Transaction Ref:' : 'Mã GD hoàn tiền:'}</span>
                <span className="font-mono font-bold text-emerald-400">{refundRequest.transaction_ref}</span>
              </div>
            )}

            {(refundRequest?.proof_url || refundRequest?.organizer_proof_url) && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Biên lai chuyển khoản:</span>
                <a
                  href={refundRequest.proof_url || refundRequest.organizer_proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs"
                >
                  <span>Xem biên lai</span>
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Organizer Reject Reason */}
          {refundRequest?.reject_reason && (
            <div className="rounded-[18px] border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
              <p className="font-bold flex items-center gap-1.5 text-red-300">
                <AlertCircle className="size-4" /> {isEnglish ? 'Organizer rejection reason:' : 'Lý do từ chối từ Ban tổ chức:'}
              </p>
              <p className="mt-1.5 leading-relaxed text-red-100/90">{refundRequest.reject_reason}</p>
            </div>
          )}

          {/* Organizer Note */}
          {refundRequest?.organizer_note && (
            <div className="rounded-[18px] border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-200">
              <p className="font-bold flex items-center gap-1.5 text-blue-300">
                <HelpCircle className="size-4" /> {isEnglish ? 'Note from Organizer:' : 'Ghi chú từ Ban tổ chức:'}
              </p>
              <p className="mt-1.5 leading-relaxed text-blue-100/90">{refundRequest.organizer_note}</p>
            </div>
          )}

          {/* Confirm Receipt & Dispute buttons if REFUNDED */}
          {status === 'REFUNDED' && (
            confirmedReceived ? (
              <div className="flex items-center gap-2.5 py-1 px-1 text-sm font-medium text-slate-200 animate-in fade-in duration-200">
                <Check className="size-5 text-emerald-400 stroke-[2.5] shrink-0" />
                <span>{isEnglish ? 'You confirmed receipt of the refund into your account.' : 'Bạn đã xác nhận nhận được tiền hoàn vào tài khoản.'}</span>
              </div>
            ) : (
              <div className="rounded-[20px] border border-white/10 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-300 mb-3">
                  {isEnglish ? 'Organizer marked as refunded. Have you received the money in your bank account?' : 'Ban tổ chức đã đánh dấu hoàn tiền. Bạn đã nhận được tiền vào tài khoản ngân hàng chưa?'}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmReceived}
                    disabled={submittingDispute}
                    className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isEnglish ? 'I have received the money' : 'Tôi đã nhận được tiền'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDisputeForm((prev) => !prev)}
                    disabled={submittingDispute}
                    className={`flex-1 rounded-full py-2.5 text-xs font-bold transition shadow-sm cursor-pointer ${
                      showDisputeForm
                        ? 'bg-rose-900/80 border border-rose-500 text-white'
                        : 'bg-rose-950/60 border border-rose-700/50 hover:bg-rose-900/60 text-rose-300'
                    }`}
                  >
                    {isEnglish ? 'Not received yet' : 'Chưa nhận được'}
                  </button>
                </div>

                {/* Inline Dispute Form */}
                {showDisputeForm && (
                  <form onSubmit={handleDisputeSubmit} className="mt-3.5 pt-3.5 border-t border-white/10 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="block text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                      {isEnglish ? 'Reason for not receiving funds:' : 'Lý do chưa nhận được tiền:'}
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder={isEnglish ? 'Enter dispute details (e.g. checked bank statement but balance not credited)...' : 'Nhập lý do khiếu nại (ví dụ: đã kiểm tra sao kê nhưng chưa nhận được tiền vào tài khoản)...'}
                      className="w-full rounded-xl border border-rose-500/30 bg-slate-950/80 p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDisputeForm(false)
                          setDisputeReason('')
                        }}
                        className="rounded-full px-4 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        {isEnglish ? 'Cancel' : 'Hủy'}
                      </button>
                      <button
                        type="submit"
                        disabled={submittingDispute || !disputeReason.trim()}
                        className="rounded-full bg-rose-600 hover:bg-rose-500 px-5 py-1.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {submittingDispute ? (isEnglish ? 'Submitting...' : 'Đang gửi...') : (isEnglish ? 'Send Dispute' : 'Gửi khiếu nại')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
