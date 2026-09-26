import { getStoredUserKey, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
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
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { fetchTicketDetail } from '@/services/tickets.js'
import { submitRefundRequest, fetchRefundPreview, fetchMyRefundRequests } from '@/services/refunds.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { VIETNAMESE_BANKS, getBankDisplayName } from '@/constants/banks.js'

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
  const [refundDetailOpen, setRefundDetailOpen] = useState(false)
  const currentUserKey = getStoredUserKey()

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

  const venue = venueLine(ticket)
  const seat = ticket.seat?.label || 'Không có ghế cố định'
  const venueText = [ticket.venue?.name, venue].filter(Boolean).join(', ')
  const isOrderPaid = ['PAID', 'REFUND_REQUESTED'].includes(ticket.order?.status) || Boolean(ticket.payment?.paid_at) || ticket.payment?.status === 'PAID'
  const isEntryEligible = ticket.status === 'VALID'
  const collectAttendees = Boolean(ticket.event?.require_attendee_info)
  const activeRefundPolicy = ticket.refund_policy_snapshot || ticket.event?.refund_policy || {}
  const isRefundAllowedByPolicy = Boolean(activeRefundPolicy.allow_refund ?? activeRefundPolicy.allow_refunds)
  const canRequestRefund = isOrderPaid && isEntryEligible && !ticket.checked_in_at && isRefundAllowedByPolicy

  const hasRefundInfo = Boolean(
    refundRequest ||
    ticket.status === 'REFUND_PENDING' ||
    ticket.status === 'REFUNDED' ||
    ticket.status === 'REFUND_REQUESTED'
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        to="/my-tickets"
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-primary backdrop-blur-md transition hover:bg-primary/10 hover:border-primary/40 hover:shadow-[0_0_12px_rgba(6,182,212,0.2)]"
      >
        <ArrowLeft className="size-4" />
        Vé của tôi
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,620px)_360px] lg:items-start relative">
        <aside className="order-2 space-y-6 lg:order-2 lg:sticky lg:top-32">
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
                  <span className={`rounded-full px-4 py-1.5 text-[10px] font-black tracking-widest uppercase backdrop-blur-md ${
                    ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                      ? 'bg-amber-500/25 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)] border border-amber-500/40'
                      : ticket.status === 'REFUNDED'
                      ? 'bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)] border border-emerald-500/30'
                      : ticket.status === 'EXPIRED' || ticket.status === 'CANCELLED' || ticket.status === 'USED'
                      ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                      : isEntryEligible
                      ? 'bg-emerald-500/25 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)] border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)] border border-red-500/30'
                  }`}>
                    {statusText(ticket)}
                  </span>
                  <span className="rounded-full bg-black/40 px-4 py-1.5 text-[10px] font-black tracking-widest uppercase text-white border border-white/20 backdrop-blur-md shadow-sm">
                    {ticket.ticket_type?.name}
                  </span>
                </div>
                <h1 className="mt-4 font-display text-3xl font-black leading-tight text-white drop-shadow-md sm:text-4xl">
                  {ticket.event?.title}
                </h1>
              </div>
            </div>

            <div className="space-y-8 p-8">
              <div className="grid gap-6 sm:grid-cols-2">
                {collectAttendees && (
                  <>
                    <CompactDetail label="Họ tên người tham dự" value={ticket.attendee_name} />
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

              <div className="relative border-t-2 border-dashed border-white/10 pt-8 before:absolute before:-left-11 before:top-0 before:size-6 before:-translate-y-1/2 before:rounded-full before:bg-background after:absolute after:-right-11 after:top-0 after:size-6 after:-translate-y-1/2 after:rounded-full after:bg-background">
                {isEntryEligible ? (
                  <>
                    <div className="mx-auto w-fit rounded-[24px] bg-white p-5 shadow-[0_0_40px_rgba(255,255,255,0.1)] relative z-10">
                      <img src={qrImageSrc(ticket)} alt="QR check-in" className="size-52 rounded-lg" />
                    </div>
                    <p className="mt-6 text-center font-mono text-lg font-black tracking-[0.2em] text-white drop-shadow-md relative z-10">{ticket.ticket_code}</p>
                  </>
                ) : (
                  <div className="py-8 text-center relative z-10">
                    <p className={`font-black text-sm uppercase tracking-wider drop-shadow-[0_0_10px_currentColor] ${
                      ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                        ? 'text-amber-400'
                        : ticket.status === 'REFUNDED'
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}>
                      {ticket.status === 'REFUND_PENDING' || ticket.status === 'REFUND_REQUESTED'
                        ? 'Vé đang có yêu cầu hoàn tiền đang chờ ban tổ chức xem xét trong vòng 48h'
                        : ticket.status === 'REFUNDED'
                        ? 'Vé này đã được hoàn tiền thành công và không còn hiệu lực'
                        : 'Vé đã hết hạn hoặc không còn hợp lệ để check-in'}
                    </p>

                    {hasRefundInfo && (
                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setRefundDetailOpen(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-5 py-2 text-xs font-bold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)] backdrop-blur-md transition-all hover:bg-amber-500/25 hover:border-amber-500/60 cursor-pointer"
                        >
                          <RotateCcw className="size-3.5" />
                          Xem chi tiết hoàn tiền
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="mx-auto mt-8 max-w-[620px] space-y-4 lg:mx-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="cosmic-btn-primary w-full py-4 text-[15px] flex items-center justify-center gap-3"
            >
              <Download className="size-5" />
              {downloading ? 'Đang tạo file...' : 'Tải vé xuống thiết bị'}
            </button>
            {downloadError && <p className="text-sm text-error">{downloadError}</p>}
            {!isEntryEligible && (
              <p className="text-sm font-medium text-warning text-center">
                Vé không còn hợp lệ để vào cổng. File tải xuống sẽ có watermark trạng thái.
              </p>
            )}



            {canRequestRefund ? (
              <RefundButton
                ticket={ticket}
                onRefundSubmitted={() => {
                  ticketQuery.refetch()
                  refundsQuery.refetch()
                }}
              />
            ) : isOrderPaid && isEntryEligible && !ticket.checked_in_at && !isRefundAllowedByPolicy ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center text-xs text-slate-400">
                Vé không hỗ trợ hoàn hủy theo chính sách của sự kiện.
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
      />
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
          setPreviewError(err.response?.data?.message || 'Không thể lấy thông tin tính toán hoàn tiền.')
        }
      })
      .finally(() => {
        if (isMounted) setPreviewLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, ticket?.id])

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
      toast.error(previewData.reason || 'Vé này không đủ điều kiện hoàn tiền.')
      return
    }

    if (reason === 'Khác' && !customerNote.trim()) {
      toast.error('Vui lòng nhập ghi chú chi tiết khi chọn lý do "Khác"!')
      return
    }

    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      toast.error('Vui lòng chọn ngân hàng và nhập đầy đủ số tài khoản, tên chủ tài khoản nhận tiền hoàn!')
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-500/30 bg-transparent px-4 py-3.5 text-sm font-bold text-amber-400 transition-all hover:bg-amber-500/10 hover:border-amber-500/50"
      >
        <RotateCcw className="size-4" />
        Yêu cầu hoàn tiền vé
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
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <RotateCcw className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Yêu cầu hoàn tiền vé</h3>
                  <p className="text-xs text-slate-400">Xem trước thông tin hoàn tiền &amp; gửi yêu cầu đến ban tổ chức</p>
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Sự kiện</span>
                        <p className="text-sm font-black text-white mt-0.5">
                          {ticket.event?.title || 'Sự kiện'}
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary shrink-0">
                        {ticket.ticket_code}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium">Hạng vé: </span>
                        <span className="font-bold text-white">
                          {ticket.ticket_type?.name || 'Vé tiêu chuẩn'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Mã đơn: </span>
                        <span className="font-mono font-bold text-white">
                          #{ticket.order?.order_code || ticket.order?.id?.slice(0, 8)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Giá gốc: </span>
                        <span className="font-bold text-white">
                          {formatCurrency(originalPrice)}
                        </span>
                      </div>
                      {discountAmount > 0 && (
                        <div>
                          <span className="text-slate-400 font-medium">Khuyến mãi: </span>
                          <span className="font-bold text-emerald-400">
                            -{formatCurrency(discountAmount)}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400 font-medium">Thực tế đã trả: </span>
                        <span className="font-bold text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.3)]">
                          {formatCurrency(previewData?.paid_amount ?? actualPaid)}
                        </span>
                      </div>
                      {ticket.session?.start_time && (
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-slate-400 font-medium">Thời gian: </span>
                          <span className="font-bold text-white">
                            {formatDateTime(ticket.session?.start_time)}
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
                    <span>Đang kiểm tra chính sách và tính toán số tiền hoàn...</span>
                  </div>
                )}

                {previewError && (
                  <div className="rounded-[16px] border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-200">
                    <p className="font-bold text-rose-300">Không thể tải thông tin xem trước:</p>
                    <p className="mt-1 text-xs">{previewError}</p>
                  </div>
                )}

                {previewData && (
                  <div className="space-y-3">
                    {/* Time remaining and applicable refund rate */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <span className="text-slate-400 block mb-0.5">Thời gian trước sự kiện</span>
                        <span className="font-bold text-white text-sm">
                          {previewData.days_before_event != null ? `${previewData.days_before_event} ngày` : 'N/A'}
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <span className="text-slate-400 block mb-0.5">Tỷ lệ hoàn áp dụng</span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {previewData.refund_rate}%
                        </span>
                      </div>
                    </div>

                    {/* Calculated Refund Amount */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[16px] border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                      <span className="font-black text-emerald-300">Số tiền hoàn đề xuất:</span>
                      <span className="text-lg font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
                        {formatCurrency(previewData.refund_amount)}
                      </span>
                    </div>

                    {/* Ineligibility notice if not eligible */}
                    {!previewData.eligible && (
                      <div className="rounded-[16px] border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-200">
                        <p className="font-bold text-rose-300 flex items-center gap-1.5">
                          <AlertCircle className="size-4" />
                          Không đủ điều kiện hoàn vé
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">{previewData.reason}</p>
                      </div>
                    )}

                    {/* Policy lines */}
                    {previewData.policy_text && (
                      <div className="rounded-[16px] border border-cyan-500/30 bg-cyan-500/10 p-4 text-[12px] text-cyan-200 space-y-1">
                        <p className="font-bold text-cyan-300 mb-1">Chính sách hoàn vé của sự kiện:</p>
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
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">Lý do hoàn vé <span className="text-error">*</span></label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-white focus:border-amber-400 focus:bg-black/60 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all shadow-inner cursor-pointer"
                    >
                      <option value="Trùng lịch cá nhân">Trùng lịch cá nhân</option>
                      <option value="Sự kiện thay đổi thông tin">Sự kiện thay đổi thông tin</option>
                      <option value="Mua nhầm vé">Mua nhầm vé</option>
                      <option value="Lý do sức khỏe">Lý do sức khỏe</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>

                  {/* Reason Note / Detail */}
                  <div>
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">
                      Ghi chú chi tiết {reason === 'Khác' && <span className="text-error">*</span>}
                    </label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={customerNote}
                      required={reason === 'Khác'}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder={reason === 'Khác' ? 'Vui lòng nêu rõ lý do hoàn vé (bắt buộc)...' : 'Thông tin bổ sung (nếu có, tối đa 500 ký tự)...'}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 p-4 text-[13px] font-medium text-white placeholder-slate-500 focus:border-amber-400 focus:bg-black/60 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all shadow-inner resize-y min-h-[80px]"
                    />
                  </div>
                </div>

                {/* Mandatory Bank Account Info */}
                <div className="space-y-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  <p className="text-[13px] font-bold text-slate-300">
                    Tài khoản ngân hàng nhận tiền hoàn <span className="text-error">*</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-white focus:border-amber-400 focus:bg-[#0f172a] focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all shadow-inner cursor-pointer"
                    >
                      <option value="" disabled className="bg-[#0f172a] text-slate-400">
                        -- Chọn ngân hàng * --
                      </option>
                      {VIETNAMESE_BANKS.map((b) => {
                        const display = getBankDisplayName(b)
                        return (
                          <option key={b.code} value={display} className="bg-[#0f172a] text-white">
                            {display}
                          </option>
                        )
                      })}
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="Số tài khoản *"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-white placeholder-slate-500 focus:border-amber-400 focus:bg-black/60 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Tên chủ tài khoản (viết hoa không dấu) *"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-white placeholder-slate-500 focus:border-amber-400 focus:bg-black/60 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all shadow-inner"
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
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={refundMutation.isPending || previewLoading || (previewData && !previewData.eligible)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_0_20px_rgba(245,158,11,0.4)] transition hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(245,158,11,0.6)] disabled:opacity-50 disabled:hover:translate-y-0"
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
    <div className="rounded-[16px] border border-primary/20 bg-primary/10 p-5 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">Check-in starts in</p>
        <Clock3 className="size-5 text-primary opacity-50" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-white">
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

function RefundDetailModal({ isOpen, onClose, ticket, refundRequest }) {
  if (!isOpen || !ticket) return null

  const status = refundRequest?.status || (ticket.status === 'REFUNDED' ? 'REFUNDED' : 'PENDING')

  const getStatusBadge = () => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3.5 py-1 text-xs font-bold text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
            <Clock3 className="size-3.5" /> Đang chờ duyệt
          </span>
        )
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 px-3.5 py-1 text-xs font-bold text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            <CheckCircle2 className="size-3.5" /> Đã duyệt (Chờ hoàn tiền)
          </span>
        )
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1 text-xs font-bold text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="size-3.5" /> Đã hoàn tiền thành công
          </span>
        )
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3.5 py-1 text-xs font-bold text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.3)]">
            <X className="size-3.5" /> Từ chối hoàn tiền
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
          <h3 className="text-base font-bold text-white tracking-wide">Chi tiết hoàn tiền vé</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            title="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status & Amount highlight banner */}
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trạng thái hoàn tiền</p>
              <div className="mt-1.5">{getStatusBadge()}</div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Số tiền hoàn</p>
              <p className="mt-1 text-xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                {formatCurrency(refundAmount)}
              </p>
            </div>
          </div>

          {/* Details list */}
          <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-5 space-y-3.5 text-xs">
            {refundRequest?.id && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Mã yêu cầu:</span>
                <span className="font-mono font-bold text-primary">REQ #{refundRequest.id.slice(0, 8)}</span>
              </div>
            )}
            <div className="flex justify-between items-start gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium">Sự kiện:</span>
              <span className="font-bold text-white text-right max-w-[65%] line-clamp-2">
                {ticket.event?.title}
              </span>
            </div>

            <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium">Mã vé:</span>
              <span className="font-mono font-bold text-primary">{ticket.ticket_code}</span>
            </div>

            <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium">Mã đơn hàng:</span>
              <span className="font-mono font-bold text-white">
                #{ticket.order?.order_code || ticket.order?.id?.slice(0, 8)}
              </span>
            </div>

            {refundRequest?.created_at && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Ngày giờ gửi yêu cầu:</span>
                <span className="font-semibold text-slate-200">
                  {formatDateTime(refundRequest.created_at || refundRequest.requested_at)}
                </span>
              </div>
            )}

            {refundRequest?.refunded_at && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Ngày giờ hoàn tiền:</span>
                <span className="font-bold text-emerald-400">
                  {formatDateTime(refundRequest.refunded_at)}
                </span>
              </div>
            )}

            {refundRequest?.reviewed_at && !refundRequest?.refunded_at && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Ngày giờ xét duyệt:</span>
                <span className="font-semibold text-slate-200">
                  {formatDateTime(refundRequest.reviewed_at)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-start gap-4 border-b border-white/5 pb-2.5">
              <span className="text-slate-400 font-medium shrink-0">Lý do hoàn tiền:</span>
              <span className="font-semibold text-white text-right break-words">
                {refundRequest?.reason || 'Theo chính sách hoàn vé sự kiện'}
              </span>
            </div>

            {refundRequest?.refund_method && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Phương thức hoàn:</span>
                <span className="font-semibold text-slate-200">
                  {refundRequest.refund_method === 'PAYOS' ? 'Tự động qua cổng PayOS' : 'Chuyển khoản ngân hàng'}
                </span>
              </div>
            )}

            {refundRequest?.bank_name && (
              <div className="flex justify-between items-start gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium shrink-0">Tài khoản nhận:</span>
                <span className="font-semibold text-slate-200 text-right">
                  {refundRequest.bank_name} - {refundRequest.bank_account_number} ({refundRequest.bank_account_name})
                </span>
              </div>
            )}

            {refundRequest?.transaction_ref && (
              <div className="flex justify-between items-center gap-4 border-b border-white/5 pb-2.5">
                <span className="text-slate-400 font-medium">Mã GD hoàn tiền:</span>
                <span className="font-mono font-bold text-emerald-400">{refundRequest.transaction_ref}</span>
              </div>
            )}
          </div>

          {/* Organizer Reject Reason */}
          {refundRequest?.reject_reason && (
            <div className="rounded-[18px] border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
              <p className="font-bold flex items-center gap-1.5 text-red-300">
                <AlertCircle className="size-4" /> Lý do từ chối từ Ban tổ chức:
              </p>
              <p className="mt-1.5 leading-relaxed text-red-100/90">{refundRequest.reject_reason}</p>
            </div>
          )}

          {/* Organizer Note */}
          {refundRequest?.organizer_note && (
            <div className="rounded-[18px] border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-200">
              <p className="font-bold flex items-center gap-1.5 text-blue-300">
                <HelpCircle className="size-4" /> Ghi chú từ Ban tổ chức:
              </p>
              <p className="mt-1.5 leading-relaxed text-blue-100/90">{refundRequest.organizer_note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
