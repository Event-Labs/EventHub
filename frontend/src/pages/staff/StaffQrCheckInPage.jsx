import { useEffect, useRef, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Layers,
  Loader2,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  TicketCheck,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { BrowserQRCodeReader } from '@zxing/browser'
import {
  checkInStaffTicket,
  checkInTicketByQr,
  searchStaffTickets,
  verifyStaffTicketByQr,
} from '@/services/tickets.js'
import { fetchAssignedStaffEvents } from '@/services/operations.js'
import { Modal } from '@/components/Modal.jsx'
import { StaffPage, StaffPanel } from './StaffComponents.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { translatePhrase } from '@/i18n/phraseDictionary.js'

const emptyManualForm = {
  eventId: '',
  ticketCode: '',
  buyerName: '',
  buyerEmail: '',
  buyerPhone: '',
}

function getApiMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function formatDateTime(value) {
  const isEn = getAutoLocale() === 'en-US'
  if (!value) return isEn ? 'N/A' : 'Chưa có'
  return new Intl.DateTimeFormat(getAutoLocale(), {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function isTicketCheckedIn(ticket) {
  return ticket?.status === 'USED' || Boolean(ticket?.checkedInAt) || Boolean(ticket?.checked_in_at)
}

function statusTone(status, ticket = null) {
  if (status === 'USED' || (ticket && isTicketCheckedIn(ticket))) {
    return 'border-error/50 bg-error/15 text-error font-extrabold'
  }
  if (status === 'VALID' && (!ticket || !isTicketCheckedIn(ticket))) {
    return 'border-tertiary/40 bg-tertiary/10 text-tertiary font-bold'
  }
  return 'border-error/50 bg-error/15 text-error font-extrabold'
}

function ticketStatusLabel(ticket, isEnglish = false) {
  if (isTicketCheckedIn(ticket)) return isEnglish ? 'Checked-in' : 'Đã soát vé'
  if (ticket?.status === 'VALID') return isEnglish ? 'Not Checked-in' : 'Chưa soát vé'
  if (ticket?.status === 'CANCELLED') return isEnglish ? 'Cancelled' : 'Đã hủy'
  if (ticket?.status === 'REFUNDED') return isEnglish ? 'Refunded' : 'Đã hoàn tiền'
  if (ticket?.status === 'REFUND_PENDING') return isEnglish ? 'Refund Pending' : 'Đang hoàn tiền'
  if (ticket?.status === 'EXPIRED') return isEnglish ? 'Expired' : 'Đã hết hạn'
  return isEnglish ? 'Invalid' : 'Không hợp lệ'
}

function canCheckInTicket(ticket) {
  return ticket?.status === 'VALID' && !isTicketCheckedIn(ticket)
}

function playScanBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.15)
    oscillator.onended = () => context.close()
  } catch {
    // Browser audio policies can block this; scanning should continue silently.
  }
}

function playErrorBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime

    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(260, now)
    oscillator.frequency.setValueAtTime(180, now + 0.12)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.3)
    oscillator.onended = () => context.close()
  } catch {
    // Browser audio policies
  }
}

const getAutoIsEnglish = () =>
  (typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en')

function normalizeTicket(ticket) {
  if (!ticket) return null
  const isEnglish = getAutoIsEnglish()
  const rawAttendee = ticket.raw_attendee_name || ticket.attendee_name || ticket.attendeeName || ''
  const buyerName = ticket.buyer_name || ticket.buyer?.name || ticket.order?.buyer_name || ticket.buyerName || ''
  const attendeeName = rawAttendee || buyerName || (isEnglish ? 'Unknown' : 'Không rõ')

  const rawAttendeeEmail = ticket.raw_attendee_email || ticket.attendee_email || ticket.attendeeEmail || ''
  const buyerEmail = ticket.buyer_email || ticket.buyer?.email || ticket.order?.buyer_email || ticket.buyerEmail || ''

  const buyerPhone = ticket.buyer_phone || ticket.buyer?.phone || ticket.order?.buyer_phone || ticket.buyerPhone || ''

  const isDifferentAttendee = Boolean(
    rawAttendee &&
    buyerName &&
    rawAttendee.trim().toLowerCase() !== buyerName.trim().toLowerCase()
  )

  const isDifferentEmail = Boolean(
    rawAttendeeEmail &&
    buyerEmail &&
    rawAttendeeEmail.trim().toLowerCase() !== buyerEmail.trim().toLowerCase()
  )

  return {
    id: ticket.id,
    ticketCode: ticket.ticket_code || ticket.ticketCode,
    eventName: (isEnglish ? (translatePhrase(ticket.event?.title, 'en') || ticket.event?.title) : ticket.event?.title) || (isEnglish ? 'Unknown event' : 'Không rõ sự kiện'),
    attendeeName,
    buyerName: buyerName || attendeeName,
    isDifferentAttendee,
    isDifferentEmail,
    displayPrimaryName: attendeeName || buyerName || (isEnglish ? 'Unknown' : 'Không rõ'),
    buyerEmail: buyerEmail || rawAttendeeEmail || (isEnglish ? 'Unknown' : 'Không rõ'),
    attendeeEmail: rawAttendeeEmail || (isDifferentAttendee ? (isEnglish ? 'Not provided' : 'Chưa cung cấp') : buyerEmail) || (isEnglish ? 'Unknown' : 'Không rõ'),
    buyerPhone,
    ticketType: (isEnglish ? (translatePhrase(ticket.ticket_type?.name, 'en') || ticket.ticket_type?.name) : ticket.ticket_type?.name) || (isEnglish ? 'Unknown tier' : 'Không rõ hạng vé'),
    seat: ticket.seat?.label || null,
    status: ticket.status,
    checkedInAt: ticket.checked_in_at,
    checkedInBy: ticket.checked_in_by?.name || ticket.checked_in_by?.email || (isEnglish ? 'Current staff' : 'Nhân sự hiện tại'),
  }
}

function CameraDeniedContent({ onRetry }) {
  return (
    <div className="grid min-h-[calc(100vh-140px)] place-items-center">
      <StaffPanel className="max-w-xl text-center">
        <CameraOff className="mx-auto size-14 text-warning" />
        <h1 className="mt-5 text-xl font-extrabold text-content">Cần cấp quyền camera</h1>
        <p className="mt-2 text-sm text-subtle">Vui lòng cho phép truy cập camera để quét QR vé.</p>
        <div className="mt-6 rounded-xl border border-border-soft/20 bg-panel-soft p-4 text-left text-sm text-content">
          <p>1. Nhấn biểu tượng khóa hoặc cài đặt trên thanh địa chỉ.</p>
          <p className="mt-2">2. Chọn Camera và bật Allow.</p>
          <p className="mt-2">3. Nhấn thử lại để khởi tạo máy quét.</p>
        </div>
        <div className="mt-6 flex justify-center">
          <button className="admin-primary" onClick={onRetry}>
            <RotateCcw className="size-4" />
            Thử lại
          </button>
        </div>
      </StaffPanel>
    </div>
  )
}

export function StaffQrCheckInPage() {
  const { isEnglish, t } = useLanguage()
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const readerRef = useRef(null)
  const processingRef = useRef(false)
  const lastQrRef = useRef({ value: '', time: 0 })

  const [cameraState, setCameraState] = useState('idle')
  const [cameraMessage, setCameraMessage] = useState('Camera chưa bật.')
  const [qrMessage, setQrMessage] = useState('')
  const [checkInState, setCheckInState] = useState('idle')
  const [scannedTicket, setScannedTicket] = useState(null)
  const [scannedQrValue, setScannedQrValue] = useState('')
  const [resultTicket, setResultTicket] = useState(null)
  const [scanError, setScanError] = useState(null)
  const [recentTickets, setRecentTickets] = useState([])
  const [ticketPanelMessage, setTicketPanelMessage] = useState('')
  const [ticketNoticeCountdown, setTicketNoticeCountdown] = useState(0)
  const [assignedEvents, setAssignedEvents] = useState([])

  useEffect(() => {
    let active = true
    fetchAssignedStaffEvents()
      .then((events) => {
        if (active && Array.isArray(events)) {
          setAssignedEvents(events)
        }
      })
      .catch(() => { })
    return () => {
      active = false
    }
  }, [])

  const showSuccess = (ticket) => {
    setResultTicket(ticket)
    setScanError(null)
    setRecentTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)].slice(0, 5))
  }

  const stopCamera = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    processingRef.current = false

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraState((current) => (current === 'active' || current === 'opening' ? 'idle' : current))
    setCameraMessage('Camera chưa bật.')
  }

  const inspectTicketFromQr = async (rawValue) => {
    const value = String(rawValue || '').trim()
    const now = Date.now()

    if (
      !value ||
      processingRef.current ||
      (lastQrRef.current.value === value && now - lastQrRef.current.time < 2500)
    ) {
      return
    }

    processingRef.current = true
    lastQrRef.current = { value, time: now }
    setCheckInState('checking')
    setScannedTicket(null)
    setScannedQrValue('')
    setResultTicket(null)
    setScanError(null)
    setTicketPanelMessage('')
    setTicketNoticeCountdown(0)
    setQrMessage('Đã đọc QR, đang kiểm tra vé...')

    try {
      const ticket = await verifyStaffTicketByQr({ qrCode: value })
      const isAlreadyUsed = isTicketCheckedIn(ticket) || ticket.status === 'USED'
      const isNotValid = ticket.status !== 'VALID' && !isAlreadyUsed

      if (isAlreadyUsed) {
        playErrorBeep()
        setScannedTicket(ticket)
        setScannedQrValue(value)
        const checkedTime = ticket.checked_in_at || ticket.checkedInAt
        setScanError({
          type: 'USED',
          title: 'Vé đã được dùng',
          message: `Vé này đã được soát vào lúc ${formatDateTime(checkedTime)}${ticket.checked_in_by?.name ? ' bởi ' + ticket.checked_in_by.name : ''}. Không thể soát lại!`,
        })
        setQrMessage(`Vé đã dùng rồi! Đã soát lúc ${formatDateTime(checkedTime)}.`)
        setCheckInState('error')
        window.setTimeout(() => {
          processingRef.current = false
        }, 2000)
        return
      }

      if (isNotValid) {
        playErrorBeep()
        setScannedTicket(ticket)
        setScannedQrValue(value)
        setScanError({
          type: 'INVALID_STATUS',
          title: 'Vé lỗi / Không hợp lệ',
          message: ticket.status === 'CANCELLED'
            ? 'Vé này đã bị hủy.'
            : (ticket.status === 'REFUNDED'
              ? 'Vé này đã được hoàn tiền.'
              : 'Vé không hợp lệ để tham gia.'),
        })
        setQrMessage(`Vé không hợp lệ (${ticketStatusLabel(ticket, isEnglish)}).`)
        setCheckInState('error')
        window.setTimeout(() => {
          processingRef.current = false
        }, 2000)
        return
      }

      playScanBeep()
      setScannedTicket(ticket)
      setScannedQrValue(value)
      setScanError(null)
      setTicketPanelMessage('')
      setTicketNoticeCountdown(0)
      setQrMessage('Đã tìm thấy vé. Kiểm tra thông tin rồi xác nhận soát vé.')
      setCheckInState('ready')
    } catch (error) {
      playErrorBeep()
      setScannedTicket(null)
      setScannedQrValue('')
      const rawMessage = getApiMessage(error, 'Mã QR không hợp lệ hoặc vé không thể soát.')

      if (rawMessage === 'Vé này chưa đến giờ tham gia.') {
        setQrMessage('')
        setScanError(null)
        setTicketPanelMessage(rawMessage)
        setTicketNoticeCountdown(3)
        setCheckInState('error')
        return
      }

      const isDifferentEvent =
        error?.response?.status === 403 ||
        rawMessage.toLowerCase().includes('sự kiện khác') ||
        rawMessage.toLowerCase().includes('không có quyền') ||
        rawMessage.toLowerCase().includes('không được phân công')

      const errorTitle = isDifferentEvent ? 'Vé sự kiện khác' : 'Vé lỗi / Mã QR không hợp lệ'
      const errorMsg = isDifferentEvent
        ? 'Vé này thuộc sự kiện khác hoặc bạn không được phân công kiểm soát vé của sự kiện này.'
        : rawMessage

      setScanError({
        type: isDifferentEvent ? 'DIFFERENT_EVENT' : 'INVALID_QR',
        title: errorTitle,
        message: errorMsg,
      })
      setQrMessage(errorMsg)
      setCheckInState('error')

      window.setTimeout(() => {
        processingRef.current = false
      }, 2000)
    }
  }

  const confirmQrCheckIn = async () => {
    if (!scannedTicket?.id) return

    setCheckInState('checking')
    setQrMessage('Đang xác nhận soát vé...')

    try {
      const ticket = scannedQrValue
        ? await checkInTicketByQr({ qrCode: scannedQrValue })
        : await checkInStaffTicket(scannedTicket.id)
      showSuccess(ticket)
      setScannedTicket(null)
      setScannedQrValue('')
      setScanError(null)
      setQrMessage('Check-in thành công.')
      setCheckInState('success')
    } catch (error) {
      playErrorBeep()
      const rawMessage = getApiMessage(error, 'Vé không thể soát.')
      const isUsed =
        error?.response?.data?.code === 'ALREADY_CHECKED_IN' ||
        rawMessage.toLowerCase().includes('đã được check-in') ||
        rawMessage.toLowerCase().includes('đã được sử dụng')
      const isDifferentEvent =
        error?.response?.status === 403 ||
        rawMessage.toLowerCase().includes('sự kiện khác') ||
        rawMessage.toLowerCase().includes('không có quyền') ||
        rawMessage.toLowerCase().includes('không được phân công')

      setScanError({
        type: isUsed ? 'USED' : isDifferentEvent ? 'DIFFERENT_EVENT' : 'ERROR',
        title: isUsed ? 'Vé đã được dùng' : isDifferentEvent ? 'Vé sự kiện khác' : 'Lỗi soát vé',
        message: rawMessage,
      })
      setQrMessage(rawMessage)
      setCheckInState('error')
      processingRef.current = false
    }
  }

  const resetQrScan = () => {
    processingRef.current = false
    lastQrRef.current = { value: '', time: 0 }
    setScannedTicket(null)
    setScannedQrValue('')
    setResultTicket(null)
    setScanError(null)
    setTicketPanelMessage('')
    setTicketNoticeCountdown(0)
    setCheckInState('idle')
    setQrMessage(cameraState === 'active' ? 'Đưa mã QR vào khung hình để bắt đầu.' : '')
  }

  const dismissTicketNotice = () => {
    processingRef.current = false
    lastQrRef.current = { ...lastQrRef.current, time: Date.now() }
    setTicketPanelMessage('')
    setTicketNoticeCountdown(0)
    setScanError(null)
    setCheckInState('idle')
  }

  useEffect(() => {
    if (!ticketPanelMessage) return undefined

    const timerId = window.setTimeout(() => {
      processingRef.current = false
      lastQrRef.current = { ...lastQrRef.current, time: Date.now() }
      setTicketPanelMessage('')
      setTicketNoticeCountdown(0)
      setCheckInState('idle')
    }, 3000)
    const countdownId = window.setInterval(() => {
      setTicketNoticeCountdown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => {
      window.clearTimeout(timerId)
      window.clearInterval(countdownId)
    }
  }, [ticketPanelMessage])

  const startCamera = async () => {
    stopCamera()
    setQrMessage('')
    setTicketPanelMessage('')
    setTicketNoticeCountdown(0)
    setCameraState('opening')
    setCameraMessage('Đang mở camera...')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error')
      setCameraMessage('Trình duyệt không cho phép truy cập camera. Vui lòng dùng HTTPS hoặc localhost.')
      return
    }

    try {
      const reader = readerRef.current || new BrowserQRCodeReader()
      readerRef.current = reader

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          const value = result?.getText?.()
          if (value) {
            inspectTicketFromQr(value)
          }
        },
      )

      controlsRef.current = controls
      setCameraState('active')
      setCameraMessage('Camera đang mở. Đưa mã QR vào khung hình để quét.')
      setQrMessage('Đưa mã QR vào khung hình để bắt đầu.')
    } catch (error) {
      const permissionDenied = ['NotAllowedError', 'SecurityError'].includes(error?.name)
      setCameraState(permissionDenied ? 'denied' : 'error')
      setCameraMessage(
        permissionDenied
          ? 'Không có quyền camera. Vui lòng cấp quyền rồi thử lại.'
          : 'Camera không hoạt động hoặc không tìm thấy thiết bị camera.',
      )
    }
  }

  useEffect(() => () => stopCamera(), [])

  if (cameraState === 'denied') {
    return <CameraDeniedContent onRetry={startCamera} />
  }

  const normalizedResult = normalizeTicket(resultTicket)
  const normalizedScanned = normalizeTicket(scannedTicket)
  const isError = checkInState === 'error' || Boolean(scanError)
  const isSuccess = checkInState === 'success'

  return (
    <StaffPage
      title={isEnglish ? 'QR Check-in' : 'Soát vé QR'}
    >
      <Modal
        open={Boolean(ticketPanelMessage)}
        title="Thông báo check-in"
        onClose={dismissTicketNotice}
        maxWidth="max-w-md"
        footer={
          <button type="button" className="admin-primary min-w-32" onClick={dismissTicketNotice}>
            Đã hiểu ({ticketNoticeCountdown}s)
          </button>
        }
      >
        <div className="relative overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-b from-warning/15 to-warning/[0.03] px-6 py-7 text-center">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-warning/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-10 size-28 rounded-full bg-warning/10 blur-2xl" />

          <div className="relative">
            <div className="mx-auto grid size-20 place-items-center rounded-full border border-warning/40 bg-warning/15 shadow-[0_10px_35px_rgba(245,158,11,0.18)]">
              <div className="grid size-14 place-items-center rounded-full bg-warning/20">
                <ShieldAlert className="size-8 text-warning" />
              </div>
            </div>

            <span className="mt-5 inline-flex rounded-full border border-warning/35 bg-warning/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-warning">
              Chưa đến giờ check-in
            </span>

            <h3 className="mt-4 text-xl font-black leading-7 text-content">
              {ticketPanelMessage}
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-subtle">
              Vé hợp lệ nhưng cổng check-in của sự kiện hiện chưa mở.
            </p>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-border-soft/30 bg-surface/70 p-4 text-left shadow-sm">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/15">
                <Clock3 className="size-4 text-warning" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-content">Vui lòng thử lại sau</p>
                <p className="mt-1 text-xs leading-5 text-subtle">
                  Chờ đến thời gian check-in do ban tổ chức thiết lập, sau đó quét lại mã vé này.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          {assignedEvents.length > 0 && (
            <StaffPanel className="!py-3.5">
              <p className="text-xs font-bold uppercase text-white">Vị trí phân công của bạn</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {assignedEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <span className="font-bold text-content">{isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">
                      {event.staff_role || 'Nhân sự'}
                    </span>
                    {event.gate ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 px-2 py-0.5 font-bold text-purple-400">
                        <DoorOpen className="size-3" />
                        Cổng: {event.gate}
                      </span>
                    ) : (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-muted">Tất cả cổng</span>
                    )}
                    {event.zone && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 font-bold text-indigo-400">
                        <Layers className="size-3" />
                        Khu vực: {event.zone}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </StaffPanel>
          )}

          <StaffPanel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-white">Soát vé bằng mã QR</p>
                <h3 className="mt-1 text-lg font-extrabold text-content">Quét vé bằng camera máy tính</h3>
                <p className="mt-1 text-sm text-subtle">{cameraMessage}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="admin-secondary" onClick={stopCamera} disabled={cameraState !== 'active'}>
                  <CameraOff className="size-4" />
                  Tắt camera
                </button>
                <button className="admin-primary" onClick={startCamera} disabled={cameraState === 'opening'}>
                  {cameraState === 'opening' ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                  Bật camera
                </button>
              </div>
            </div>
          </StaffPanel>

          <div className="relative grid min-h-[520px] overflow-hidden rounded-2xl border border-border-soft/20 bg-black text-white shadow-sm">
            <video
              ref={videoRef}
              className="h-full min-h-[520px] w-full object-cover"
              muted
              playsInline
            />
            {cameraState !== 'active' && (
              <div className="absolute inset-0 grid place-items-center bg-black/85 p-8 text-center">
                <div>
                  <QrCode className="mx-auto size-20 text-primary" />
                  <h3 className="mt-4 text-xl font-extrabold">Sẵn sàng quét QR</h3>
                  <p className="mt-2 max-w-md text-sm text-white/70">
                    Nhấn bật camera, đưa mã QR trên vé vào giữa khung hình, hệ thống sẽ tự ghi nhận vé hợp lệ.
                  </p>
                </div>
              </div>
            )}

            {/* Viewfinder frame */}
            <div
              className={`pointer-events-none absolute inset-8 rounded-2xl border-2 transition-all duration-300 ${
                isError
                  ? 'border-error shadow-[0_0_0_999px_rgba(239,68,68,0.3)] ring-4 ring-error/50'
                  : isSuccess
                  ? 'border-success shadow-[0_0_0_999px_rgba(34,197,94,0.25)]'
                  : 'border-primary/70 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]'
              }`}
            />

            {/* Top alert banner on camera if error */}
            {isError && (
              <div className="absolute top-5 left-5 right-5 flex items-center justify-center gap-2 rounded-xl border border-error/50 bg-error/95 px-4 py-2.5 text-white font-black text-xs sm:text-sm tracking-wide shadow-xl shadow-error/30 animate-pulse z-10">
                <AlertOctagon className="size-5 shrink-0" />
                <span>
                  {scanError?.title ? scanError.title.toUpperCase() : 'VÉ CÓ VẤN ĐỀ - KHÔNG THỂ SOÁT VÉ'}
                </span>
              </div>
            )}

            {/* Bottom status bar */}
            <div
              className={`absolute bottom-5 left-5 right-5 rounded-xl border px-4 py-3 text-sm transition-all shadow-lg z-10 ${
                isError
                  ? 'border-error/80 bg-red-950/90 text-red-100 font-bold shadow-error/25'
                  : isSuccess
                  ? 'border-success/80 bg-emerald-950/90 text-emerald-100 font-bold'
                  : 'border-white/15 bg-black/65 text-white'
              }`}
            >
              {checkInState === 'checking' ? (
                <span className="flex items-center gap-2 text-primary font-bold">
                  <Loader2 className="size-4 animate-spin" />
                  Đang xử lý QR...
                </span>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isError && <XCircle className="size-5 shrink-0 text-error" />}
                    {isSuccess && <CheckCircle2 className="size-5 shrink-0 text-success" />}
                    <span className="truncate">
                      {qrMessage || 'Đưa mã QR vào khung hình để bắt đầu.'}
                    </span>
                  </div>
                  {isError && (
                    <button
                      type="button"
                      onClick={resetQrScan}
                      className="shrink-0 rounded-lg bg-error/30 hover:bg-error/50 px-2.5 py-1 text-xs font-bold text-white transition flex items-center gap-1 border border-error/40"
                    >
                      <RotateCcw className="size-3" />
                      Quét lại
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          {normalizedResult ? (
            <ResultPanel ticket={normalizedResult} onClear={resetQrScan} />
          ) : scanError && !normalizedScanned ? (
            <ErrorPanel error={scanError} onClear={resetQrScan} />
          ) : (
            <SelectedTicketPanel
              ticket={normalizedScanned}
              onCheckIn={confirmQrCheckIn}
              checking={checkInState === 'checking'}
              onClear={resetQrScan}
              emptyMessage="Quét mã QR để xem thông tin vé trước khi xác nhận soát vé."
              scanError={scanError}
            />
          )}
          <StaffPanel>
            <h3 className="font-bold text-content">Lượt soát vé gần đây</h3>
            {recentTickets.length === 0 ? (
              <p className="mt-3 text-sm text-subtle">Chưa có lượt soát vé trong phiên này.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {recentTickets.map((ticket) => {
                  const normalized = normalizeTicket(ticket)
                  return (
                    <div key={ticket.id} className="flex items-start justify-between gap-3 rounded-xl border border-border-soft/20 bg-panel-soft/30 p-3">
                      <div>
                        <p className="text-sm font-bold text-content">{normalized.displayPrimaryName}</p>
                        <p className="text-xs text-subtle">{normalized.ticketCode}</p>
                      </div>
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    </div>
                  )
                })}
              </div>
            )}
          </StaffPanel>
        </aside>
      </div>
    </StaffPage>
  )
}

export function ManualCheckInPage() {
  const searchRequestRef = useRef(0)
  const [manualForm, setManualForm] = useState(emptyManualForm)
  const [assignedEvents, setAssignedEvents] = useState([])
  const [eventsState, setEventsState] = useState('loading')
  const [eventsMessage, setEventsMessage] = useState('')
  const [searchState, setSearchState] = useState('idle')
  const [searchMessage, setSearchMessage] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [checkInState, setCheckInState] = useState('idle')
  const [resultTicket, setResultTicket] = useState(null)

  const updateManualField = (field, value) => {
    if (field === 'eventId') {
      setManualForm({ ...emptyManualForm, eventId: value })
      return
    }
    setManualForm((current) => ({ ...current, [field]: value }))
  }

  useEffect(() => {
    let active = true

    async function loadAssignedEvents() {
      try {
        const events = await fetchAssignedStaffEvents()
        if (!active) return
        const eventList = Array.isArray(events) ? events : []
        setAssignedEvents(eventList)
        setEventsState('success')
        if (eventList.length === 0) {
          setEventsMessage('Bạn chưa được phân công vào sự kiện nào đang hoạt động.')
        }
      } catch (error) {
        if (!active) return
        setEventsState('error')
        setEventsMessage(getApiMessage(error, 'Không thể tải danh sách sự kiện được phân công.'))
      }
    }

    loadAssignedEvents()
    return () => {
      active = false
    }
  }, [])

  const handleManualSearch = async (event) => {
    event.preventDefault()
    setSearchMessage('')
    setSelectedTicket(null)
    setResultTicket(null)

    const payload = Object.fromEntries(
      Object.entries(manualForm).map(([key, value]) => [key, value.trim()]),
    )

    if (!payload.eventId) {
      setSearchState('error')
      setSearchMessage('Vui lòng chọn sự kiện trước khi tải danh sách vé.')
      return
    }

    const selectedEvent = assignedEvents.find((item) => String(item.id) === payload.eventId)
    const checkinStartTime = new Date(selectedEvent?.checkin_start_time || selectedEvent?.start_time).getTime()
    if (Number.isFinite(checkinStartTime) && checkinStartTime > Date.now()) {
      searchRequestRef.current += 1
      setSearchResults([])
      setSearchState('not-open')
      setSearchMessage('Sự kiện này chưa đến giờ mở check-in.')
      return
    }

    const requestId = searchRequestRef.current + 1
    searchRequestRef.current = requestId
    setSearchState('loading')

    try {
      const data = await searchStaffTickets(payload)
      if (requestId !== searchRequestRef.current) return
      const tickets = data.tickets || []
      setSearchResults(tickets)

      if (tickets.length === 0) {
        setSearchState('empty')
        setSearchMessage('Sự kiện này chưa có vé phù hợp.')
        return
      }

      if (tickets.length === 1) {
        setSelectedTicket(tickets[0])
        setSearchState('single')
        setSearchMessage('Tìm thấy 1 vé phù hợp. Vui lòng xác nhận soát vé.')
        return
      }

      setSearchState('multiple')
      setSearchMessage('Có nhiều kết quả, vui lòng chọn đúng vé để soát')
    } catch (error) {
      if (requestId !== searchRequestRef.current) return
      setSearchState('error')
      setSearchMessage(getApiMessage(error, 'Không thể tìm vé.'))
    }
  }

  useEffect(() => {
    if (!manualForm.eventId.trim()) {
      const timeoutId = window.setTimeout(() => {
        searchRequestRef.current += 1
        setSearchState('idle')
        setSearchMessage('')
        setSearchResults([])
        setSelectedTicket(null)
        setResultTicket(null)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    // Choosing an event loads its ticket list; the remaining fields refine that list.
    const timeoutId = window.setTimeout(() => {
      handleManualSearch({ preventDefault() { } })
    }, Object.values(manualForm).slice(1).some((value) => value.trim()) ? 400 : 0)

    return () => window.clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualForm])

  const handleManualCheckIn = async (ticket = selectedTicket) => {
    if (!ticket?.id) return

    setCheckInState('checking')
    setSearchMessage('Đang soát vé...')

    try {
      const checkedTicket = await checkInStaffTicket(ticket.id)
      setResultTicket(checkedTicket)
      setSelectedTicket(checkedTicket)
      setSearchResults((current) => current.map((item) => (item.id === checkedTicket.id ? checkedTicket : item)))
      setSearchMessage('Check-in thành công.')
      setCheckInState('success')
    } catch (error) {
      setSearchMessage(getApiMessage(error, 'Vé không thể soát.'))
      setCheckInState('error')
    }
  }

  const handleSelectTicket = (ticket) => {
    setSelectedTicket(ticket)
    setCheckInState('idle')

    // The success panel belongs only to the ticket that was just checked in.
    // Clear it when staff selects another result so the detail card reflects
    // the newly selected ticket immediately.
    if (resultTicket?.id !== ticket?.id) {
      setResultTicket(null)
    }
  }

  const normalizedResult = normalizeTicket(resultTicket)
  const normalizedSelected = normalizeTicket(selectedTicket)

  return (
    <StaffPage
      title="Check-in Thủ công"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ManualSearchPanel
          form={manualForm}
          onChange={updateManualField}
          onSubmit={handleManualSearch}
          state={searchState}
          message={searchMessage}
          results={searchResults}
          selectedTicket={selectedTicket}
          onSelectTicket={handleSelectTicket}
          assignedEvents={assignedEvents}
          eventsState={eventsState}
          eventsMessage={eventsMessage}
        />

        <aside className="space-y-5 min-w-0">
          {normalizedResult ? (
            <ResultPanel ticket={normalizedResult} />
          ) : (
            <SelectedTicketPanel
              ticket={normalizedSelected}
              onCheckIn={() => handleManualCheckIn()}
              checking={checkInState === 'checking'}
            />
          )}
        </aside>
      </div>
    </StaffPage>
  )
}

function ManualSearchPanel({
  form,
  onChange,
  onSubmit,
  state,
  message,
  results,
  selectedTicket,
  onSelectTicket,
  assignedEvents,
  eventsState,
  eventsMessage,
}) {
  const { isEnglish } = useLanguage()
  const eventSelected = Boolean(form.eventId)

  return (
    <StaffPanel>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold uppercase text-white tracking-wider">Sự kiện <span className="text-error">*</span></span>
          <select
            required
            className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-white outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            value={form.eventId}
            onChange={(event) => onChange('eventId', event.target.value)}
            disabled={eventsState === 'loading' || eventsState === 'error'}
          >
            <option value="">
              {eventsState === 'loading' ? 'Đang tải sự kiện...' : 'Chọn sự kiện để tải danh sách vé'}
            </option>
            {assignedEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {isEnglish ? (translatePhrase(event.title, 'en') || event.title) : event.title}
              </option>
            ))}
          </select>
        </label>

        {eventsMessage && (
          <div className={`md:col-span-2 rounded-xl border p-3 text-sm ${eventsState === 'error'
              ? 'border-error/30 bg-error/10 text-error'
              : 'border-warning/30 bg-warning/10 text-warning'
            }`}>
            {eventsMessage}
          </div>
        )}

        <ManualInput
          label="Mã vé"
          placeholder="Mã vé..."
          value={form.ticketCode}
          onChange={(value) => onChange('ticketCode', value)}
          disabled={!eventSelected}
        />
        <ManualInput
          label="Tên người mua / Người tham dự"
          placeholder="Tên người mua hoặc tham dự..."
          value={form.buyerName}
          onChange={(value) => onChange('buyerName', value)}
          disabled={!eventSelected}
        />
        <ManualInput
          label="Email người mua / Tham dự"
          placeholder="Email người mua hoặc tham dự..."
          value={form.buyerEmail}
          onChange={(value) => onChange('buyerEmail', value)}
          disabled={!eventSelected}
        />
        <ManualInput
          label="Số điện thoại"
          placeholder="Số điện thoại..."
          value={form.buyerPhone}
          onChange={(value) => onChange('buyerPhone', value)}
          disabled={!eventSelected}
        />
        <div className="md:col-span-2 flex justify-end">
          <button className="admin-primary" type="submit" disabled={!eventSelected || state === 'loading'}>
            {state === 'loading' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Tìm vé
          </button>
        </div>
      </form>

      {message && (
        <p className="mt-4 text-center text-sm font-medium text-white/80">
          {typeof message === 'string' ? message.replace(/\.$/, '') : message}
        </p>
      )}

      {eventSelected && (
        <div className="mt-5 space-y-3 border-t border-border-soft/20 pt-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-extrabold text-content">Danh sách vé</h4>
            {state !== 'loading' && (
              <span className="rounded-full bg-panel-soft px-2.5 py-1 text-xs font-bold text-subtle">
                {results.length} vé
              </span>
            )}
          </div>

          {state === 'loading' && (
            <div className="flex items-center gap-2 rounded-xl border border-border-soft/20 bg-panel-soft/30 p-4 text-sm text-subtle">
              <Loader2 className="size-4 animate-spin" />
              Đang tải danh sách vé...
            </div>
          )}

          {state !== 'loading' && results.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-soft/30 p-5 text-center text-sm text-subtle">
              Không có vé phù hợp với bộ lọc hiện tại.
            </div>
          )}

          {state !== 'loading' && results.map((ticket) => {
            const normalized = normalizeTicket(ticket)
            const selected = selectedTicket?.id === ticket.id
            const isUsed = isTicketCheckedIn(normalized)

            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => onSelectTicket(ticket)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selected
                    ? isUsed
                      ? 'border-error bg-error/15'
                      : 'border-primary bg-primary/10'
                    : isUsed
                    ? 'border-error/30 bg-error/[0.04] hover:border-error/60'
                    : 'border-border-soft/20 bg-panel-soft/30 hover:border-primary/50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-content">
                      {normalized.displayPrimaryName}
                    </p>
                    <p className="mt-1 text-sm text-subtle">
                      <span className="font-mono font-bold text-[#E6C17A]">{normalized.ticketCode}</span> - {normalized.ticketType}
                      {normalized.seat ? ` · Ghế ${normalized.seat}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{normalized.eventName}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(normalized.status, normalized)}`}>
                    {ticketStatusLabel(normalized, isEnglish)}
                  </span>
                </div>
              </button>
            )
          })}

        </div>
      )}
    </StaffPanel>
  )
}

function ManualInput({ label, value, onChange, placeholder, disabled = false }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-white tracking-wider block leading-tight">{label}</span>
      <input
        className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        placeholder={placeholder || label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  )
}

function ResultPanel({ ticket, onClear }) {
  const { isEnglish } = useLanguage()
  if (!ticket) {
    return (
      <StaffPanel className="text-center overflow-hidden">
        <TicketCheck className="mx-auto size-14 text-white/60" />
        <h3 className="mt-4 text-lg font-extrabold text-white">Kết quả soát vé</h3>
        <p className="mt-2 text-sm text-white/80">Thông tin vé đã soát thành công sẽ hiển thị tại đây.</p>
      </StaffPanel>
    )
  }

  return (
    <StaffPanel className="overflow-hidden border border-success/40 bg-success/[0.03]">
      <div className="flex items-start gap-3 min-w-0">
        <CheckCircle2 className="mt-1 size-6 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-success tracking-wide">Soát vé thành công</p>
          <h3 className="mt-1 text-lg sm:text-xl font-black font-mono tracking-wider text-[#E6C17A] drop-shadow-[0_1px_6px_rgba(201,154,71,0.35)] truncate">
            {ticket.ticketCode}
          </h3>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        <InfoRow label="Sự kiện" value={ticket.eventName} />
        <InfoRow label="Hạng vé" value={ticket.ticketType} />
        {ticket.seat && <InfoRow label="Ghế ngồi" value={ticket.seat} />}
        <InfoRow
          label="Người tham dự"
          value={ticket.attendeeName || ticket.displayPrimaryName || ticket.buyerName}
        />
        <InfoRow
          label="Email"
          value={
            ticket.isDifferentAttendee
              ? (ticket.attendeeEmail || 'Chưa cung cấp')
              : (ticket.buyerEmail || 'Chưa cung cấp')
          }
        />
        {!ticket.isDifferentAttendee && ticket.buyerPhone && (
          <InfoRow label="Số điện thoại" value={ticket.buyerPhone} />
        )}
        <InfoRow label="Trạng thái" value={ticketStatusLabel(ticket, isEnglish)} tone="success" />
        <InfoRow label="Thời gian" value={formatDateTime(ticket.checkedInAt)} tone="success" />
        <InfoRow label="Check-in bởi" value={ticket.checkedInBy} />
      </div>
      {onClear && (
        <button className="admin-secondary mt-5 w-full" onClick={onClear} type="button">
          <RotateCcw className="size-4" />
          Quét vé khác
        </button>
      )}
    </StaffPanel>
  )
}

function SelectedTicketPanel({ ticket, onCheckIn, checking, onClear, emptyMessage, scanError }) {
  const { isEnglish } = useLanguage()
  const isCheckedIn = isTicketCheckedIn(ticket)
  const isInvalid = ticket?.status && ticket.status !== 'VALID'
  const hasProblem = isCheckedIn || isInvalid || Boolean(scanError)

  if (!ticket) {
    return (
      <StaffPanel className="overflow-hidden">
        <div className="flex gap-3">
          <ShieldAlert className="mt-1 size-5 shrink-0 text-warning" />
          <p className="text-sm text-white/90">
            {emptyMessage || 'Kết quả tìm kiếm thủ công chỉ hiển thị vé thuộc sự kiện bạn được phân công.'}
          </p>
        </div>
      </StaffPanel>
    )
  }

  return (
    <StaffPanel
      className={`overflow-hidden transition-all duration-300 ${
        hasProblem ? 'border border-error/50 bg-error/[0.04] shadow-md shadow-error/10' : ''
      }`}
    >
      {/* Alert banner if ticket is already checked in */}
      {isCheckedIn && (
        <div className="mb-4 rounded-xl border border-error/60 bg-error/20 p-3.5 text-left text-error shadow-sm">
          <div className="flex items-start gap-2.5">
            <XCircle className="size-5 shrink-0 mt-0.5 text-error" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-error">
                Cảnh báo: Vé đã được sử dụng!
              </p>
              <p className="mt-1 text-xs leading-relaxed text-red-200">
                Vé này đã được soát vào lúc <b>{formatDateTime(ticket.checkedInAt)}</b>
                {ticket.checkedInBy ? ` bởi ${ticket.checkedInBy}` : ''}. Không hợp lệ để vào cổng lại.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Alert banner if ticket is invalid and not checked in */}
      {isInvalid && !isCheckedIn && (
        <div className="mb-4 rounded-xl border border-error/60 bg-error/20 p-3.5 text-left text-error shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-5 shrink-0 mt-0.5 text-error" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-error">
                Cảnh báo: Vé không hợp lệ ({ticketStatusLabel(ticket, isEnglish)})
              </p>
              <p className="mt-1 text-xs leading-relaxed text-red-200">
                {scanError?.message || 'Vé này ở trạng thái không thể soát vé. Vui lòng kiểm tra lại.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-white tracking-wider">Vé đang chọn</p>
          <h3 className="mt-1 text-lg sm:text-xl font-black font-mono tracking-wider text-[#E6C17A] drop-shadow-[0_1px_6px_rgba(201,154,71,0.35)] truncate">
            {ticket.ticketCode}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${statusTone(
            ticket.status,
            ticket,
          )}`}
        >
          {ticketStatusLabel(ticket, isEnglish)}
        </span>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <InfoRow label="Sự kiện" value={ticket.eventName} />
        <InfoRow label="Hạng vé" value={ticket.ticketType} />
        {ticket.seat && <InfoRow label="Ghế ngồi" value={ticket.seat} />}
        <InfoRow
          label="Người tham dự"
          value={ticket.attendeeName || ticket.displayPrimaryName || ticket.buyerName}
        />
        <InfoRow
          label="Email"
          value={
            ticket.isDifferentAttendee
              ? (ticket.attendeeEmail || 'Chưa cung cấp')
              : (ticket.buyerEmail || 'Chưa cung cấp')
          }
        />
        {!ticket.isDifferentAttendee && ticket.buyerPhone && (
          <InfoRow label="Số điện thoại" value={ticket.buyerPhone} />
        )}
        <InfoRow
          label="Trạng thái vé"
          value={ticketStatusLabel(ticket, isEnglish)}
          tone={isCheckedIn || isInvalid ? 'error' : 'tertiary'}
        />
        <InfoRow
          label="Thời gian soát vé"
          value={ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : 'Chưa soát vé'}
          tone={isCheckedIn ? 'error' : 'default'}
        />
      </div>
      <div className="mt-5 grid gap-2">
        {canCheckInTicket(ticket) && (
          <button className="admin-primary w-full" onClick={onCheckIn} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            Xác nhận soát vé
          </button>
        )}
        {hasProblem && !canCheckInTicket(ticket) && (
          <div className="rounded-xl border border-error/40 bg-error/15 py-2.5 px-3 text-center text-xs font-black uppercase tracking-wider text-error">
            {isCheckedIn ? 'Vé đã soát - Không thể check-in lại' : 'Vé không hợp lệ để check-in'}
          </div>
        )}
        {onClear && (
          <button className="admin-secondary w-full" onClick={onClear} type="button" disabled={checking}>
            <RotateCcw className="size-4" />
            Quét vé khác
          </button>
        )}
      </div>
    </StaffPanel>
  )
}

function ErrorPanel({ error, onClear }) {
  const isDifferentEvent = error?.type === 'DIFFERENT_EVENT'
  const isUsed = error?.type === 'USED'

  return (
    <StaffPanel className="overflow-hidden border border-error/50 bg-error/[0.06] p-6 text-center shadow-lg shadow-error/10">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-error/50 bg-error/20 text-error shadow-[0_4px_20px_rgba(239,68,68,0.25)]">
        {isDifferentEvent ? (
          <AlertOctagon className="size-8 text-error" />
        ) : (
          <XCircle className="size-8 text-error" />
        )}
      </div>

      <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-error/50 bg-error/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-error">
        {error?.title || 'Vé có vấn đề'}
      </span>

      <h3 className="mt-3 text-lg font-black text-white">
        {isDifferentEvent
          ? 'Vé không thuộc sự kiện của bạn'
          : isUsed
          ? 'Vé đã được sử dụng trước đó'
          : 'Vé lỗi / Không thể soát'}
      </h3>

      <div className="mt-4 rounded-xl border border-error/40 bg-error/15 p-3.5 text-left text-sm text-red-100">
        <p className="font-bold text-white flex items-center gap-1.5">
          <AlertTriangle className="size-4 text-error shrink-0" />
          Chi tiết lỗi:
        </p>
        <p className="mt-1.5 leading-relaxed text-xs text-red-200">
          {error?.message || 'Mã QR không hợp lệ hoặc vé không đủ điều kiện để vào cổng.'}
        </p>
      </div>

      <div className="mt-5">
        <button
          className="admin-secondary w-full border-error/40 text-white hover:bg-error/20 transition flex items-center justify-center gap-2"
          onClick={onClear}
          type="button"
        >
          <RotateCcw className="size-4" />
          Quét vé khác
        </button>
      </div>
    </StaffPanel>
  )
}

function InfoRow({ label, value, strong = false, tone = 'default', breakAll = false }) {
  const isBreakAll = breakAll || label === 'Email'

  let toneClass = 'font-semibold text-white'
  if (tone === 'error') {
    toneClass = 'font-black text-error'
  } else if (tone === 'success' || strong) {
    toneClass = 'font-extrabold text-success'
  } else if (tone === 'tertiary') {
    toneClass = 'font-bold text-tertiary'
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-soft/20 pb-2.5 last:border-0 last:pb-0 min-w-0">
      <span className="shrink-0 text-white/80 font-medium text-xs sm:text-sm">{label}</span>
      <span
        className={`min-w-0 flex-1 text-right leading-relaxed text-xs sm:text-sm ${
          isBreakAll ? 'break-all' : 'break-words'
        } ${toneClass}`}
      >
        {value}
      </span>
    </div>
  )
}

export function CameraDeniedPage() {
  return <CameraDeniedContent onRetry={() => window.location.assign('/staff/qr-check-in')} />
}
