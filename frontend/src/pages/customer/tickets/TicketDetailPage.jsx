import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ReceiptText,
  RotateCcw,
  X,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { fetchTicketDetail } from '@/services/tickets.js'
import { submitRefundRequest } from '@/services/refunds.js'
import { useToast } from '@/providers/ToastProvider.jsx'

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value) {
  if (value === undefined || value === null) return 'N/A'
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

function statusText(ticket) {
  if (ticket?.status === 'REFUND_REQUESTED') return 'Đang chờ hoàn vé'
  if (ticket?.status === 'REFUNDED') return 'Đã hoàn vé'
  if (ticket?.status === 'EXPIRED') return 'Hết hạn'
  if (ticket?.status === 'USED') return 'Đã dùng'
  if (ticket?.status === 'CANCELLED') return 'Đã hủy'
  if (ticket?.checked_in_at) return 'Đã check-in'
  return 'Hợp lệ'
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
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    qr_code: ticket.qr_code || ticket.ticket_code,
    event_id: ticket.event?.id,
    session_id: ticket.session?.id,
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

function wrapText(value, maxChars) {
  const text = String(value || 'N/A').replace(/\s+/g, ' ').trim()
  const words = text.split(' ')
  const lines = []
  let current = ''

  words.forEach((word) => {
    if (!current) {
      current = word
      return
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
  })

  if (current) lines.push(current)
  return lines.length ? lines : ['N/A']
}

function svgTextLines(lines, { x, y, fill = '#ffffff', size = 22, weight = 800, lineHeight = 30, family = 'Manrope, Inter, Segoe UI, Arial, sans-serif', anchor = 'start', letterSpacing }) {
  const extra = letterSpacing ? ` letter-spacing="${letterSpacing}"` : ''
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${extra}>${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`
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

function buildTicketDownloadSvg(ticket, qrSrc) {
  const invalid = ticket.status !== 'VALID'
  const venue = venueLine(ticket)
  const venueName = ticket.venue?.name || 'N/A'
  const seat = ticket.seat?.label || 'Không có ghế cố định'
  const statusLabel = statusText(ticket)
  const statusFill = invalid ? '#fee2e2' : '#dcfce7'
  const statusColor = invalid ? '#991b1b' : '#166534'
  const uiFont = 'Manrope, Inter, Segoe UI, Arial, sans-serif'
  const monoFont = 'Cascadia Mono, Consolas, monospace'
  const qrSize = 204

  const titleLines = wrapText(ticket.event?.title, 30)
  const ticketTypeLines = wrapText(ticket.ticket_type?.name, 48)
  const collectAttendees = Boolean(ticket.event?.require_attendee_info)
  const holderLabel = collectAttendees ? 'NGƯỜI THAM DỰ (ATTENDEE)' : 'NGƯỜI MUA VÉ (BUYER)'
  const holderName = collectAttendees ? ticket.attendee_name || ticket.order?.buyer_name : ticket.order?.buyer_name
  const attendeeLines = wrapText(holderName, 24)
  const orderLines = wrapText(ticket.order?.order_code, 26)
  const venueNameLines = wrapText(venueName, 30)
  const addressLines = wrapText(venue, 70)
  const titleSize = titleLines.length > 2 ? 30 : 34
  const titleLineHeight = titleSize + 7
  const ticketTypeY = 118 + titleLines.length * titleLineHeight
  const infoY = Math.max(198, ticketTypeY + ticketTypeLines.length * 24 + 28)
  const attendeeY = infoY + 138
  const venueY = attendeeY + Math.max(attendeeLines.length, orderLines.length) * 27 + 54
  const ticketHeight = Math.max(500, venueY + venueNameLines.length * 28 + addressLines.length * 18 + 34)
  const ticketY = Math.max(90, Math.round((900 - ticketHeight) / 2))

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" style="display:block;background:#f4f7fb">
  <defs>
    <filter id="ticketShadow" x="-10%" y="-15%" width="120%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0f172a" flood-opacity=".20"/>
    </filter>
    <linearGradient id="ticketDark" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#172033"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="900" fill="#f4f7fb"/>
  <circle cx="230" cy="200" r="104" fill="#38bdf8" opacity=".10"/>
  <circle cx="1340" cy="710" r="150" fill="#10b981" opacity=".08"/>
  <circle cx="1050" cy="188" r="62" fill="#94a3b8" opacity=".08"/>

  <g transform="translate(300 ${ticketY})" filter="url(#ticketShadow)">
    <rect width="980" height="${ticketHeight}" rx="28" fill="#ffffff"/>
    <path d="M28 0h632v${ticketHeight}H28C12.5 ${ticketHeight} 0 ${ticketHeight - 12.5} 0 ${ticketHeight - 28}V28C0 12.5 12.5 0 28 0Z" fill="url(#ticketDark)"/>
    <path d="M660 0h292c15.5 0 28 12.5 28 28v${ticketHeight - 56}c0 15.5-12.5 28-28 28H660Z" fill="#ffffff"/>
    <path d="M660 30v${ticketHeight - 60}" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="10 12"/>
    <circle cx="660" cy="0" r="24" fill="#f4f7fb"/>
    <circle cx="660" cy="${ticketHeight}" r="24" fill="#f4f7fb"/>

    <text x="44" y="62" fill="#38bdf8" font-family="${uiFont}" font-size="15" font-weight="800" letter-spacing="2.5">VÉ CHECK-IN EVENTHUB (EVENTHUB CHECK-IN TICKET)</text>
    ${svgTextLines(titleLines, { x: 44, y: 112, size: titleSize, lineHeight: titleLineHeight, weight: 850, family: uiFont })}
    ${svgTextLines(ticketTypeLines, { x: 44, y: ticketTypeY, fill: '#a9bdd8', size: 18, lineHeight: 24, weight: 650, family: uiFont })}

    <rect x="44" y="${infoY}" width="258" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="66" y="${infoY + 34}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">PHIÊN (SESSION)</text>
    <text x="66" y="${infoY + 62}" fill="#ffffff" font-family="${uiFont}" font-size="19" font-weight="800">${escapeXml(formatDateTime(ticket.session?.start_time))}</text>

    <rect x="328" y="${infoY}" width="244" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="350" y="${infoY + 34}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">GHẾ (SEAT)</text>
    <text x="350" y="${infoY + 62}" fill="#ffffff" font-family="${uiFont}" font-size="22" font-weight="850">${escapeXml(seat)}</text>

    <text x="44" y="${attendeeY}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">${escapeXml(holderLabel)}</text>
    ${svgTextLines(attendeeLines, { x: 44, y: attendeeY + 28, size: 21, lineHeight: 27, weight: 850, family: uiFont })}
    <text x="328" y="${attendeeY}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">ĐƠN HÀNG (ORDER)</text>
    ${svgTextLines(orderLines, { x: 328, y: attendeeY + 28, size: 19, lineHeight: 25, weight: 850, family: uiFont })}

    <text x="44" y="${venueY}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">ĐỊA ĐIỂM (VENUE)</text>
    ${svgTextLines(venueNameLines, { x: 44, y: venueY + 27, size: 21, lineHeight: 28, weight: 850, family: uiFont })}
    ${svgTextLines(addressLines, { x: 44, y: venueY + 27 + venueNameLines.length * 28, fill: '#d6e2f2', size: 13, lineHeight: 18, weight: 600, family: uiFont })}

    <text x="820" y="54" fill="#0f172a" font-family="${uiFont}" font-size="13" font-weight="850" text-anchor="middle" letter-spacing="1.4">QUÉT ĐỂ CHECK-IN (SCAN TO CHECK IN)</text>
    <rect x="712" y="82" width="216" height="216" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <image x="718" y="88" width="${qrSize}" height="${qrSize}" href="${escapeXml(qrSrc)}"/>
    <text x="820" y="342" fill="#0f172a" font-family="${monoFont}" font-size="17" font-weight="800" text-anchor="middle">${escapeXml(ticket.ticket_code)}</text>
    <rect x="738" y="372" width="164" height="42" rx="21" fill="${statusFill}"/>
    <text x="820" y="399" fill="${statusColor}" font-family="${uiFont}" font-size="15" font-weight="850" text-anchor="middle">${escapeXml(statusLabel)}</text>
    <text x="820" y="${ticketHeight - 50}" fill="#64748b" font-family="${uiFont}" font-size="11" font-weight="700" text-anchor="middle">Luôn sẵn sàng vé tại cổng</text>
    <text x="820" y="${ticketHeight - 32}" fill="#64748b" font-family="${uiFont}" font-size="11" font-weight="700" text-anchor="middle">(Keep this ticket ready at the gate)</text>
  </g>
  ${invalid ? `<text x="800" y="470" fill="#dc2626" opacity=".15" font-family="${uiFont}" font-size="92" font-weight="900" text-anchor="middle" transform="rotate(-15 800 470)">${escapeXml(statusLabel)}</text>` : ''}
</svg>`
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

function svgToRasterBlob(svg, format) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || 1600
      canvas.height = image.naturalHeight || 1100
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#f4f7fb'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0)
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
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = hasAuthSession()
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const ticketQuery = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn: () => fetchTicketDetail(ticketId),
    enabled: isAuthenticated && Boolean(ticketId),
  })

  async function handleDownload() {
    if (!ticketQuery.data || downloading) return
    setDownloadError('')
    setDownloading(true)
    try {
      const qrDataUrl = await imageToDataUrl(qrImageSrc(ticketQuery.data))
      const svg = buildTicketDownloadSvg(ticketQuery.data, qrDataUrl)
      const baseName = ticketQuery.data?.ticket_code || 'ticket'
      const blob = await svgToRasterBlob(svg, 'png')
      downloadBlob(blob, `${baseName}.png`)
    } catch (err) {
      setDownloadError('Không thể tạo file vé. Vui lòng thử lại sau.')
    } finally {
      setDownloading(false)
    }
  }

  if (!isAuthenticated) return null

  if (ticketQuery.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-muted">Đang tải thông tin vé...</div>
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="size-4" />
          Vé của tôi
        </Link>
        <p className="mt-8 text-error">Không thể tải thông tin vé hoặc vé không thuộc tài khoản của bạn.</p>
      </div>
    )
  }

  const ticket = ticketQuery.data
  const venue = venueLine(ticket)
  const seat = ticket.seat?.label || 'Không có ghế cố định'
  const venueText = [ticket.venue?.name, venue].filter(Boolean).join(', ')
  const isOrderPaid = ['PAID', 'REFUND_REQUESTED'].includes(ticket.order?.status) || Boolean(ticket.payment?.paid_at) || ticket.payment?.status === 'PAID'
  const isEntryEligible = ticket.status === 'VALID'
  const collectAttendees = Boolean(ticket.event?.require_attendee_info)
  const canRequestRefund = isOrderPaid && isEntryEligible && !ticket.checked_in_at

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" />
        Vé của tôi
      </Link>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,620px)_320px] lg:items-start">
        <aside className="order-2 space-y-5 lg:order-2 lg:sticky lg:top-24">
          <Panel title="Thanh toán" icon={ReceiptText}>
            <Info label="Mã giao dịch" value={ticket.payment?.transaction_code || 'N/A'} />
            <Info label="Phương thức" value={ticket.payment?.provider || ticket.payment?.method || 'N/A'} />
            <Info label="Tổng thanh toán" value={formatCurrency(ticket.order?.total_amount)} />
            <Info label="Thanh toán lúc" value={formatDateTime(ticket.payment?.paid_at)} />
          </Panel>
          <Panel title="Thông tin check-in" icon={CheckCircle2}>
            <Info label="Trạng thái" value={statusText(ticket)} />
            {ticket.status === 'EXPIRED' ? (
              <Info label="Check-in" value="Đã đóng do vé hết hạn" />
            ) : ticket.checked_in_at ? (
              <Info label="Check-in lúc" value={formatDateTime(ticket.checked_in_at)} />
            ) : (
              <CheckInCountdown target={ticket.session?.checkin_start_time} />
            )}
            {ticket.status !== 'EXPIRED' && <Info label="Mở check-in" value={formatDateTime(ticket.session?.checkin_start_time)} />}
          </Panel>
        </aside>

        <div className="order-1 lg:justify-self-start">
          <section className="mx-auto max-w-[620px] overflow-hidden rounded-xl border border-white/10 bg-[#101a33] shadow-2xl shadow-slate-950/30 lg:mx-0">
            <div className="relative min-h-56 overflow-hidden">
              {ticket.event?.banner_url ? (
                <img src={ticket.event.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" />
              ) : (
                <div className="absolute inset-0 bg-panel-soft" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#101a33] via-[#101a33]/60 to-transparent" />
              <div className="relative flex min-h-56 flex-col justify-end p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase ${isEntryEligible ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                    {statusText(ticket)}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase text-slate-200">
                    {ticket.ticket_type?.name}
                  </span>
                </div>
                <h1 className="mt-3 font-display text-2xl font-black leading-tight text-white sm:text-3xl">
                  {ticket.event?.title}
                </h1>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                {collectAttendees && (
                  <>
                    <CompactDetail label="Người tham dự" value={ticket.attendee_name} />
                    <CompactDetail label="Email người tham dự" value={ticket.attendee_email} />
                  </>
                )}
                <CompactDetail label="Người mua vé" value={ticket.order?.buyer_name} />
                <CompactDetail label="Email người mua" value={ticket.order?.buyer_email} />
                <CompactDetail label="Thời gian" value={formatDateTime(ticket.session?.start_time)} />
                <CompactDetail label="Đơn hàng" value={ticket.order?.order_code} />
                <CompactDetail label="Loại vé" value={ticket.ticket_type?.name} />
                <CompactDetail label="Ghế ngồi" value={seat} />
                <CompactDetail label="Check-in" value={ticket.checked_in_at ? formatDateTime(ticket.checked_in_at) : 'Chưa check-in'} />
                <CompactDetail label="Địa điểm" value={venueText || 'N/A'} wide />
              </div>

              <div className="relative border-t border-dashed border-white/10 pt-6 before:absolute before:-left-8 before:top-0 before:size-6 before:-translate-y-1/2 before:rounded-full before:bg-[#071022] after:absolute after:-right-8 after:top-0 after:size-6 after:-translate-y-1/2 after:rounded-full after:bg-[#071022]">
                {isEntryEligible ? (
                  <>
                    <div className="mx-auto w-fit rounded-xl bg-white p-3 shadow-[0_0_38px_rgba(147,197,253,0.35)]">
                      <img src={qrImageSrc(ticket)} alt="QR check-in" className="size-48 rounded-md" />
                    </div>
                    <p className="mt-4 text-center font-mono text-sm font-black tracking-wide text-white">{ticket.ticket_code}</p>
                  </>
                ) : (
                  <p className={`py-4 text-center text-sm font-medium italic ${
                    ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                      ? 'text-amber-300'
                      : ticket.status === 'REFUNDED'
                      ? 'text-red-400'
                      : 'text-slate-400'
                  }`}>
                    {ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                      ? 'Vé đang có yêu cầu hoàn tiền đang chờ ban tổ chức xem xét trong vòng 48h'
                      : ticket.status === 'REFUNDED'
                      ? 'Vé này đã được hoàn tiền thành công và không còn hiệu lực'
                      : 'Vé đã hết hạn hoặc không còn hợp lệ để check-in'}
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="mx-auto mt-5 max-w-[620px] space-y-3 lg:mx-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-[#111a31] px-5 py-4 text-sm font-extrabold text-white transition hover:bg-[#17213b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              {downloading ? 'Đang tạo file...' : 'Tải vé'}
            </button>
            {downloadError && <p className="text-sm text-error">{downloadError}</p>}
            {!isEntryEligible && (
              <p className="text-sm text-warning">
                Vé không còn hợp lệ để vào cổng. File tải xuống sẽ có watermark trạng thái
              </p>
            )}

            {canRequestRefund ? (
              <RefundButton ticket={ticket} onRefundSubmitted={() => ticketQuery.refetch()} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function RefundButton({ ticket, onRefundSubmitted }) {
  const [isOpen, setIsOpen] = useState(false)
  const toast = useToast()
  const [reason, setReason] = useState('Trùng lịch cá nhân')
  const [customerNote, setCustomerNote] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')

  const refundMutation = useMutation({
    mutationFn: (payload) => submitRefundRequest(payload),
    onSuccess: (data) => {
      toast.success(data?.message || 'Gửi yêu cầu hoàn tiền thành công. Ban tổ chức sẽ xem xét trong vòng 48h.')
      setIsOpen(false)
      onRefundSubmitted?.()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Không thể gửi yêu cầu hoàn tiền. Vui lòng kiểm tra chính sách hoàn vé của sự kiện.')
    },
  })

  const refundPolicy = ticket.event?.refund_policy
  const originalPrice = Number(ticket.order_item?.final_price || ticket.order_item?.unit_price || ticket.ticket_type?.price || 0)
  const feePercentage = Math.min(100, Math.max(0, Number(refundPolicy?.fee_percentage || 0)))
  const cancellationFee = Math.round((originalPrice * feePercentage) / 100)
  const estimatedRefundAmount = Math.max(0, originalPrice - cancellationFee)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (reason === 'Khác' && !customerNote.trim()) {
      toast.error('Vui lòng nhập ghi chú chi tiết khi chọn lý do "Khác"!')
      return
    }

    refundMutation.mutate({
      ticket_id: ticket.id,
      order_id: ticket.order?.id,
      reason,
      customer_note: customerNote,
      bank_info: bankName ? { bank_name: bankName, account_number: accountNumber, account_holder: accountHolder } : undefined,
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-amber-500/20"
      >
        <RotateCcw className="size-4" />
        Yêu cầu hoàn tiền vé
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex flex-col w-full max-w-lg sm:max-w-xl max-h-[90vh] rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Section */}
            <div className="flex-none flex items-center justify-between border-b border-white/10 bg-[#131d35] px-5 py-3.5">
              <div className="flex items-center gap-2.5 text-amber-400">
                <RotateCcw className="size-5" />
                <h3 className="text-lg font-bold text-white">Yêu cầu hoàn tiền vé</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-5 space-y-3 text-xs">
                {/* Order & Event Summary (Report 3 Item 3) */}
                <div className="rounded-xl border border-white/10 bg-[#162038] p-3 text-xs text-slate-300">
                  <div className="border-b border-white/10 pb-2 mb-2">
                    <span className="text-slate-400 font-medium">Sự kiện: </span>
                    <span className="font-bold text-white text-sm break-words whitespace-normal">
                      {ticket.event?.title || 'Không có tên sự kiện'}
                    </span>
                  </div>
                  <div className="overflow-x-auto pb-0.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 min-w-[280px]">
                      <div>
                        <span className="text-slate-400">Đơn hàng: </span>
                        <span className="font-mono font-semibold text-white break-all">
                          #{ticket.order?.order_code || ticket.order?.id?.slice(0, 8)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Mã vé: </span>
                        <span className="font-mono font-bold text-amber-300">
                          {ticket.ticket_code}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Loại vé: </span>
                        <span className="font-semibold text-white">
                          {ticket.ticket_type?.name || 'Vé tiêu chuẩn'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Giá gốc: </span>
                        <span className="font-bold text-white">
                          {formatCurrency(originalPrice)}
                        </span>
                      </div>
                      {ticket.session?.start_time && (
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-slate-400">Thời gian: </span>
                          <span className="font-medium text-white">
                            {formatDateTime(ticket.session?.start_time)}
                          </span>
                        </div>
                      )}
                      {ticket.seat?.label && (
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-slate-400">Chỗ ngồi: </span>
                          <span className="font-medium text-white">
                            {ticket.seat.label}
                          </span>
                        </div>
                      )}
                      {(ticket.venue?.name || venueLine(ticket)) && (
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-slate-400">Địa điểm: </span>
                          <span className="font-medium text-white break-words">
                            {[ticket.venue?.name, venueLine(ticket)].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Applicable Refund Policy (Report 3 Item 4) */}
                {refundPolicy && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5 text-xs text-blue-200">
                    <p className="font-semibold text-blue-300">Chính sách hoàn vé của sự kiện:</p>
                    <p className="mt-1 leading-relaxed text-[11px] sm:text-xs">
                      {refundPolicy.allow_refunds === false
                        ? '⚠️ Sự kiện áp dụng chính sách Không hoàn tiền theo quy định của ban tổ chức.'
                        : `Hạn chót gửi yêu cầu: trước sự kiện ít nhất ${refundPolicy.deadline_days || 1} ngày. Phí xử lý hoàn vé: ${refundPolicy.fee_percentage || 0}%.`}
                    </p>
                  </div>
                )}

                {/* Estimated Refund Amount (Report 3 Item 5) */}
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs">
                  <span className="font-semibold text-emerald-300">Số tiền ước tính được hoàn:</span>
                  <span className="text-sm font-black text-emerald-400">
                    {formatCurrency(estimatedRefundAmount)}
                    {cancellationFee > 0 && (
                      <span className="ml-1 text-[11px] font-normal text-slate-400">
                        (Phí hoàn vé: {formatCurrency(cancellationFee)})
                      </span>
                    )}
                  </span>
                </div>

                {/* Refund Reason Dropdown (Report 3 Item 6) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Lý do hoàn vé *</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#1e293b] px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="Trùng lịch cá nhân">Trùng lịch cá nhân</option>
                    <option value="Sự kiện thay đổi thông tin">Sự kiện thay đổi thông tin</option>
                    <option value="Mua nhầm vé">Mua nhầm vé</option>
                    <option value="Lý do sức khỏe">Lý do sức khỏe</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                {/* Reason Note / Detail (Report 3 Item 7) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ghi chú chi tiết {reason === 'Khác' && <span className="text-error">*</span>}
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={customerNote}
                    required={reason === 'Khác'}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder={reason === 'Khác' ? 'Vui lòng nêu rõ lý do hoàn vé (bắt buộc)...' : 'Thông tin bổ sung (nếu có, tối đa 500 ký tự)...'}
                    className="w-full rounded-lg border border-white/10 bg-[#1e293b] p-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none resize-y min-h-[56px]"
                  />
                </div>

                {/* Bank Account Info Warning (Report 3 Item 8) */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                  <p className="font-semibold text-amber-300">Lưu ý phương thức nhận tiền:</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/90">
                    Tiền sẽ được hoàn về tài khoản / phương thức thanh toán ban đầu (hoặc tài khoản ngân hàng bên dưới nếu thanh toán chuyển khoản).
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border border-white/5 bg-[#172033] p-2.5">
                  <p className="text-xs font-semibold text-slate-300">Tài khoản ngân hàng nhận tiền hoàn (tùy chọn):</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Tên ngân hàng (VD: Vietcombank, MB...)"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="rounded-lg border border-white/10 bg-[#1e293b] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Số tài khoản"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="rounded-lg border border-white/10 bg-[#1e293b] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Tên chủ tài khoản (viết hoa không dấu)"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#1e293b] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Footer Section Buttons (Report 3 Items 9 & 10) */}
              <div className="flex-none flex items-center justify-end gap-3 border-t border-white/10 bg-[#131d35] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-white/10 hover:text-white transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={refundMutation.isPending}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {refundMutation.isPending ? 'Đang gửi...' : 'Gửi yêu cầu'}
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
    <section className="rounded-lg border border-border-soft bg-panel p-5">
      <div className="mb-4 flex items-center gap-2 text-primary">
        <Icon className="size-5" />
        <h2 className="font-bold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function CheckInCountdown({ target }) {
  const [now, setNow] = useState(() => Date.now())
  const parts = countdownParts(target, now)

  useEffect(() => {
    if (!target || parts?.ended) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [parts?.ended, target])

  if (!target) return <Info label="Check-in lúc" value="N/A" />
  if (parts?.ended) return <Info label="Check-in lúc" value="Đã mở" />

  return (
    <div className="rounded-lg border border-white/10 bg-[#121b3a] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-300">Check-in starts in</p>
        <Clock3 className="size-6 text-slate-500" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-white">
        <CountdownUnit label="Days" value={parts.days} />
        <CountdownUnit label="Hours" value={parts.hours} />
        <CountdownUnit label="Min" value={parts.minutes} />
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
