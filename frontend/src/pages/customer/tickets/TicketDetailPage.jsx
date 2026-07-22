import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ReceiptText,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchTicketDetail } from '@/services/tickets.js'

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
  if (ticket?.status === 'EXPIRED') return 'Hết hạn'
  if (ticket?.status === 'USED') return '\u0110\u00e3 d\u00f9ng'
  if (ticket?.status === 'CANCELLED') return '\u0110\u00e3 h\u1ee7y'
  if (ticket?.checked_in_at) return '\u0110\u00e3 check-in'
  return 'H\u1ee3p l\u1ec7'
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

function ticketDetailBlock({ label, value, x, y, width = 330, size = 21 }) {
  const maxChars = Math.max(18, Math.floor(width / (size * 0.5)))
  const lines = wrapText(value, maxChars)
  const labelSvg = `<text x="${x}" y="${y}" fill="#9fb4d2" font-family="Manrope, Inter, Segoe UI, Arial, sans-serif" font-size="12" font-weight="850" letter-spacing="1.6">${escapeXml(label)}</text>`
  const valueSvg = svgTextLines(lines, { x, y: y + 30, size, lineHeight: size + 8, weight: 850 })
  return {
    svg: `${labelSvg}${valueSvg}`,
    height: 44 + lines.length * (size + 8),
  }
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
  const holderLabel = collectAttendees ? 'NG\u01af\u1edcI THAM D\u1ef0 (ATTENDEE)' : 'NG\u01af\u1edcI MUA V\u00c9 (BUYER)'
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

    <text x="44" y="62" fill="#38bdf8" font-family="${uiFont}" font-size="15" font-weight="800" letter-spacing="2.5">V\u00c9 CHECK-IN EVENTHUB (EVENTHUB CHECK-IN TICKET)</text>
    ${svgTextLines(titleLines, { x: 44, y: 112, size: titleSize, lineHeight: titleLineHeight, weight: 850, family: uiFont })}
    ${svgTextLines(ticketTypeLines, { x: 44, y: ticketTypeY, fill: '#a9bdd8', size: 18, lineHeight: 24, weight: 650, family: uiFont })}

    <rect x="44" y="${infoY}" width="258" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="66" y="${infoY + 34}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">PHI\u00caN (SESSION)</text>
    <text x="66" y="${infoY + 62}" fill="#ffffff" font-family="${uiFont}" font-size="19" font-weight="800">${escapeXml(formatDateTime(ticket.session?.start_time))}</text>

    <rect x="328" y="${infoY}" width="244" height="88" rx="14" fill="#1f2937" opacity=".72"/>
    <text x="350" y="${infoY + 34}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">GH\u1ebe (SEAT)</text>
    <text x="350" y="${infoY + 62}" fill="#ffffff" font-family="${uiFont}" font-size="22" font-weight="850">${escapeXml(seat)}</text>

    <text x="44" y="${attendeeY}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">${escapeXml(holderLabel)}</text>
    ${svgTextLines(attendeeLines, { x: 44, y: attendeeY + 28, size: 21, lineHeight: 27, weight: 850, family: uiFont })}
    <text x="328" y="${attendeeY}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">\u0110\u01a0N H\u00c0NG (ORDER)</text>
    ${svgTextLines(orderLines, { x: 328, y: attendeeY + 28, size: 19, lineHeight: 25, weight: 850, family: uiFont })}

    <text x="44" y="${venueY}" fill="#9fb4d2" font-family="${uiFont}" font-size="11" font-weight="800" letter-spacing=".8">\u0110\u1ecaA \u0110I\u1ec2M (VENUE)</text>
    ${svgTextLines(venueNameLines, { x: 44, y: venueY + 27, size: 21, lineHeight: 28, weight: 850, family: uiFont })}
    ${svgTextLines(addressLines, { x: 44, y: venueY + 27 + venueNameLines.length * 28, fill: '#d6e2f2', size: 13, lineHeight: 18, weight: 600, family: uiFont })}

    <text x="820" y="54" fill="#0f172a" font-family="${uiFont}" font-size="13" font-weight="850" text-anchor="middle" letter-spacing="1.4">QU\u00c9T \u0110\u1ec2 CHECK-IN (SCAN TO CHECK IN)</text>
    <rect x="712" y="82" width="216" height="216" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <image x="718" y="88" width="${qrSize}" height="${qrSize}" href="${escapeXml(qrSrc)}"/>
    <text x="820" y="342" fill="#0f172a" font-family="${monoFont}" font-size="17" font-weight="800" text-anchor="middle">${escapeXml(ticket.ticket_code)}</text>
    <rect x="738" y="372" width="164" height="42" rx="21" fill="${statusFill}"/>
    <text x="820" y="399" fill="${statusColor}" font-family="${uiFont}" font-size="15" font-weight="850" text-anchor="middle">${escapeXml(statusLabel)}</text>
    <text x="820" y="${ticketHeight - 50}" fill="#64748b" font-family="${uiFont}" font-size="11" font-weight="700" text-anchor="middle">Lu\u00f4n s\u1eb5n s\u00e0ng v\u00e9 t\u1ea1i c\u1ed5ng</text>
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
      setDownloadError('Kh\u00f4ng th\u1ec3 t\u1ea1o file v\u00e9. Vui l\u00f2ng th\u1eed l\u1ea1i sau.')
    } finally {
      setDownloading(false)
    }
  }

  if (!isAuthenticated) return null

  if (ticketQuery.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-muted">Äang táº£i vÃ©...</div>
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="size-4" />
          VÃ© cá»§a tÃ´i
        </Link>
        <p className="mt-8 text-error">KhÃ´ng thá»ƒ táº£i thÃ´ng tin vÃ© hoáº·c vÃ© khÃ´ng thuá»™c tÃ i khoáº£n cá»§a báº¡n.</p>
      </div>
    )
  }

  const ticket = ticketQuery.data
  const venue = venueLine(ticket)
  const seat = ticket.seat?.label || 'Không có ghế cố định'
  const venueText = [ticket.venue?.name, venue].filter(Boolean).join(', ')
  const isEntryEligible = ticket.status === 'VALID'
  const collectAttendees = Boolean(ticket.event?.require_attendee_info)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm font-bold text-primary">
        <ArrowLeft className="size-4" />
        {'V\u00e9 c\u1ee7a t\u00f4i'}
      </Link>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,620px)_320px] lg:items-start">
        <aside className="order-2 space-y-5 lg:order-2 lg:sticky lg:top-24">
          <Panel title={'Thanh to\u00e1n'} icon={ReceiptText}>
            <Info label={'M\u00e3 giao d\u1ecbch'} value={ticket.payment?.transaction_code || 'N/A'} />
            <Info label={'Ph\u01b0\u01a1ng th\u1ee9c'} value={ticket.payment?.provider || ticket.payment?.method || 'N/A'} />
            <Info label={'T\u1ed5ng thanh to\u00e1n'} value={formatCurrency(ticket.order.total_amount)} />
            <Info label={'Thanh to\u00e1n l\u00fac'} value={formatDateTime(ticket.payment?.paid_at)} />
          </Panel>
          <Panel title={'Th\u00f4ng tin check-in'} icon={CheckCircle2}>
            <Info label={'Tr\u1ea1ng th\u00e1i'} value={statusText(ticket)} />
            {ticket.status === 'EXPIRED' ? (
              <Info label={'Check-in'} value={'Đã đóng do vé hết hạn'} />
            ) : ticket.checked_in_at ? (
              <Info label={'Check-in l\u00fac'} value={formatDateTime(ticket.checked_in_at)} />
            ) : (
              <CheckInCountdown target={ticket.session.checkin_start_time} />
            )}
            {ticket.status !== 'EXPIRED' && <Info label={'M\u1edf check-in'} value={formatDateTime(ticket.session.checkin_start_time)} />}
          </Panel>
        </aside>

        <div className="order-1 lg:justify-self-start">
          <section className="mx-auto max-w-[620px] overflow-hidden rounded-xl border border-white/10 bg-[#101a33] shadow-2xl shadow-slate-950/30 lg:mx-0">
            <div className="relative min-h-56 overflow-hidden">
              {ticket.event.banner_url ? (
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
                    {ticket.ticket_type.name}
                  </span>
                </div>
                <h1 className="mt-3 font-display text-2xl font-black leading-tight text-white sm:text-3xl">
                  {ticket.event.title}
                </h1>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                {collectAttendees && (
                  <>
                    <CompactDetail label={'Ng\u01b0\u1eddi tham d\u1ef1'} value={ticket.attendee_name} />
                    <CompactDetail label={'Email ng\u01b0\u1eddi tham d\u1ef1'} value={ticket.attendee_email} />
                  </>
                )}
                <CompactDetail label={'Ng\u01b0\u1eddi mua v\u00e9'} value={ticket.order.buyer_name} />
                <CompactDetail label={'Email ng\u01b0\u1eddi mua'} value={ticket.order.buyer_email} />
                <CompactDetail label={'Th\u1eddi gian'} value={formatDateTime(ticket.session.start_time)} />
                <CompactDetail label={'\u0110\u01a1n h\u00e0ng'} value={ticket.order.order_code} />
                <CompactDetail label={'Lo\u1ea1i v\u00e9'} value={ticket.ticket_type.name} />
                <CompactDetail label={'Gh\u1ebf ng\u1ed3i'} value={seat} />
                <CompactDetail label="Check-in" value={ticket.checked_in_at ? formatDateTime(ticket.checked_in_at) : 'Ch\u01b0a check-in'} />
                <CompactDetail label={'\u0110\u1ecba \u0111i\u1ec3m'} value={venueText || 'N/A'} wide />
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
                  <div className="rounded-lg border border-error/30 bg-error/10 p-5 text-center font-bold text-error">
                    Vé đã hết hạn hoặc không còn hợp lệ để check-in.
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="mx-auto mt-5 max-w-[620px] lg:mx-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-[#111a31] px-5 py-4 text-sm font-extrabold text-white transition hover:bg-[#17213b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              {downloading ? '\u0110ang t\u1ea1o file...' : 'T\u1ea3i v\u00e9'}
            </button>
            {downloadError && <p className="mt-3 text-sm text-error">{downloadError}</p>}
            {!isEntryEligible && (
              <p className="mt-3 text-sm text-warning">
                {'V\u00e9 kh\u00f4ng c\u00f2n h\u1ee3p l\u1ec7 \u0111\u1ec3 v\u00e0o c\u1ed5ng. File t\u1ea3i xu\u1ed1ng s\u1ebd c\u00f3 watermark tr\u1ea1ng th\u00e1i.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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

  if (!target) return <Info label={'Check-in l\u00fac'} value="N/A" />
  if (parts?.ended) return <Info label={'Check-in l\u00fac'} value={'\u0110\u00e3 m\u1edf'} />

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








