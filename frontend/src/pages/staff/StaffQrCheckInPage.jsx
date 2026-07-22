import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  TicketCheck,
  UserCheck,
} from 'lucide-react'
import { BrowserQRCodeReader } from '@zxing/browser'
import {
  checkInStaffTicket,
  checkInTicketByQr,
  searchStaffTickets,
  verifyStaffTicketByQr,
} from '@/services/tickets.js'
import { fetchAssignedStaffEvents } from '@/services/operations.js'
import { StaffPage, StaffPanel } from './StaffComponents.jsx'

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

function formatDateTime(value) {
  if (!value) return 'Chưa có'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function statusTone(status) {
  if (status === 'USED') return 'border-success/40 bg-success/10 text-success'
  if (status === 'VALID') return 'border-tertiary/40 bg-tertiary/10 text-tertiary'
  return 'border-error/40 bg-error/10 text-error'
}

function isTicketCheckedIn(ticket) {
  return ticket?.status === 'USED' || Boolean(ticket?.checkedInAt)
}

function ticketStatusLabel(ticket) {
  if (isTicketCheckedIn(ticket)) return 'Đã soát vé'
  if (ticket?.status === 'VALID') return 'Chưa soát vé'
  if (ticket?.status === 'CANCELLED') return 'Đã hủy'
  return 'Không rõ'
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

function normalizeTicket(ticket) {
  if (!ticket) return null
  return {
    id: ticket.id,
    ticketCode: ticket.ticket_code || ticket.ticketCode,
    eventName: ticket.event?.title || 'Không rõ sự kiện',
    buyerName: ticket.buyer?.name || ticket.order?.buyer_name || ticket.attendee_name || 'Không rõ',
    buyerEmail: ticket.buyer?.email || ticket.order?.buyer_email || ticket.attendee_email || 'Không rõ',
    buyerPhone: ticket.buyer?.phone || ticket.order?.buyer_phone || '',
    ticketType: ticket.ticket_type?.name || 'Không rõ hạng vé',
    seat: ticket.seat?.label || null,
    status: ticket.status,
    checkedInAt: ticket.checked_in_at,
    checkedInBy: ticket.checked_in_by?.name || ticket.checked_in_by?.email || 'Nhân sự hiện tại',
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
  const [recentTickets, setRecentTickets] = useState([])

  const showSuccess = (ticket) => {
    setResultTicket(ticket)
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
    setQrMessage('Đã đọc QR, đang kiểm tra vé...')

    try {
      const ticket = await verifyStaffTicketByQr({ qrCode: value })
      playScanBeep()
      setScannedTicket(ticket)
      setScannedQrValue(value)
      setQrMessage('Đã tìm thấy vé. Kiểm tra thông tin rồi xác nhận soát vé.')
      setCheckInState('ready')
    } catch (error) {
      setQrMessage(getApiMessage(error, 'Mã QR không hợp lệ hoặc vé không thể soát.'))
      setCheckInState('error')
      window.setTimeout(() => {
        processingRef.current = false
      }, 1500)
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
      setQrMessage('Check-in thành công.')
      setCheckInState('success')
    } catch (error) {
      setQrMessage(getApiMessage(error, 'Vé không thể soát.'))
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
    setCheckInState('idle')
    setQrMessage(cameraState === 'active' ? 'Đưa mã QR vào khung hình để bắt đầu.' : '')
  }

  const startCamera = async () => {
    stopCamera()
    setQrMessage('')
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

  return (
    <StaffPage
      title="QR Check-in"
      description="Bật camera máy tính để quét mã QR trên vé và tự động ghi nhận vào cổng."
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <StaffPanel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-muted">Soát vé bằng mã QR</p>
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
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary/70 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
            <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-white/15 bg-black/65 px-4 py-3 text-sm">
              {checkInState === 'checking' ? (
                <span className="flex items-center gap-2 text-primary">
                  <Loader2 className="size-4 animate-spin" />
                  Đang xử lý QR...
                </span>
              ) : (
                qrMessage || 'Đưa mã QR vào khung hình để bắt đầu.'
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          {normalizedResult ? (
            <ResultPanel ticket={normalizedResult} onClear={resetQrScan} />
          ) : (
            <SelectedTicketPanel
              ticket={normalizedScanned}
              onCheckIn={confirmQrCheckIn}
              checking={checkInState === 'checking'}
              onClear={resetQrScan}
              emptyMessage="Quét mã QR để xem thông tin vé trước khi xác nhận soát vé."
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
                        <p className="text-sm font-bold text-content">{normalized.buyerName}</p>
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
      setSearchMessage('Có nhiều kết quả, vui lòng chọn đúng vé để soát.')
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
      handleManualSearch({ preventDefault() {} })
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

  const normalizedResult = normalizeTicket(resultTicket)
  const normalizedSelected = normalizeTicket(selectedTicket)

  return (
    <StaffPage
      title="Check-in thủ công"
      description="Chọn sự kiện để tải danh sách vé, sau đó có thể lọc thêm theo thông tin vé hoặc người mua."
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <ManualSearchPanel
          form={manualForm}
          onChange={updateManualField}
          onSubmit={handleManualSearch}
          state={searchState}
          message={searchMessage}
          results={searchResults}
          selectedTicket={selectedTicket}
          onSelectTicket={setSelectedTicket}
          onCheckIn={handleManualCheckIn}
          checkInState={checkInState}
          assignedEvents={assignedEvents}
          eventsState={eventsState}
          eventsMessage={eventsMessage}
        />

        <aside className="space-y-5">
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
  onCheckIn,
  checkInState,
  assignedEvents,
  eventsState,
  eventsMessage,
}) {
  const eventSelected = Boolean(form.eventId)

  return (
    <StaffPanel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted">Soát vé thủ công</p>
          <h3 className="mt-1 text-lg font-extrabold text-content">Tìm vé bằng thông tin vé hoặc người mua</h3>
        </div>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
        <label className="block md:col-span-4">
          <span className="text-xs font-bold uppercase text-muted">Sự kiện <span className="text-error">*</span></span>
          <select
            required
            className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            value={form.eventId}
            onChange={(event) => onChange('eventId', event.target.value)}
            disabled={eventsState === 'loading' || eventsState === 'error'}
          >
            <option value="">
              {eventsState === 'loading' ? 'Đang tải sự kiện...' : 'Chọn sự kiện để tải danh sách vé'}
            </option>
            {assignedEvents.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
        </label>

        {eventsMessage && (
          <div className={`md:col-span-4 rounded-xl border p-3 text-sm ${
            eventsState === 'error'
              ? 'border-error/30 bg-error/10 text-error'
              : 'border-warning/30 bg-warning/10 text-warning'
          }`}>
            {eventsMessage}
          </div>
        )}

        <ManualInput label="Mã vé" value={form.ticketCode} onChange={(value) => onChange('ticketCode', value)} disabled={!eventSelected} />
        <ManualInput label="Tên người mua" value={form.buyerName} onChange={(value) => onChange('buyerName', value)} disabled={!eventSelected} />
        <ManualInput label="Email người mua" value={form.buyerEmail} onChange={(value) => onChange('buyerEmail', value)} disabled={!eventSelected} />
        <ManualInput label="Số điện thoại" value={form.buyerPhone} onChange={(value) => onChange('buyerPhone', value)} disabled={!eventSelected} />
        <div className="md:col-span-4 flex justify-end">
          <button className="admin-primary" type="submit" disabled={!eventSelected || state === 'loading'}>
            {state === 'loading' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Tìm vé
          </button>
        </div>
      </form>

      {message && (
        <div className="mt-4 rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3 text-sm text-content">
          {message}
        </div>
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

            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => onSelectTicket(ticket)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border-soft/20 bg-panel-soft/30 hover:border-primary/50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-content">{normalized.buyerName}</p>
                    <p className="mt-1 text-sm text-subtle">
                      {normalized.ticketCode} - {normalized.ticketType}
                      {normalized.seat ? ` · Ghế ${normalized.seat}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{normalized.eventName}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(normalized.status)}`}>
                    {ticketStatusLabel(normalized)}
                  </span>
                </div>
              </button>
            )
          })}

          {state !== 'loading' && selectedTicket && canCheckInTicket(normalizeTicket(selectedTicket)) && (
            <div className="flex justify-end">
              <button className="admin-primary" onClick={() => onCheckIn(selectedTicket)} disabled={checkInState === 'checking'}>
                {checkInState === 'checking' ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                Xác nhận soát vé
              </button>
            </div>
          )}
        </div>
      )}
    </StaffPanel>
  )
}

function ManualInput({ label, value, onChange, disabled = false }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-muted">{label}</span>
      <input
        className="mt-1 h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none transition placeholder:text-muted focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  )
}

function ResultPanel({ ticket, onClear }) {
  if (!ticket) {
    return (
      <StaffPanel className="text-center">
        <TicketCheck className="mx-auto size-14 text-muted" />
        <h3 className="mt-4 text-lg font-extrabold text-content">Kết quả soát vé</h3>
        <p className="mt-2 text-sm text-subtle">Thông tin vé đã soát thành công sẽ hiển thị tại đây.</p>
      </StaffPanel>
    )
  }

  return (
    <StaffPanel>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 size-6 shrink-0 text-success" />
        <div>
          <p className="text-xs font-bold uppercase text-success">Soát vé thành công</p>
          <h3 className="mt-1 text-lg font-extrabold text-content">{ticket.ticketCode}</h3>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        <InfoRow label="Sự kiện" value={ticket.eventName} />
        <InfoRow label="Người mua" value={ticket.buyerName} />
        <InfoRow label="Email" value={ticket.buyerEmail} />
        <InfoRow label="Số điện thoại" value={ticket.buyerPhone || 'Không có'} />
        <InfoRow label="Hạng vé" value={ticket.ticketType} />
        {ticket.seat && <InfoRow label="Ghế ngồi" value={ticket.seat} />}
        <InfoRow label="Trạng thái" value={ticketStatusLabel(ticket)} strong />
        <InfoRow label="Thời gian" value={formatDateTime(ticket.checkedInAt)} />
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

function SelectedTicketPanel({ ticket, onCheckIn, checking, onClear, emptyMessage }) {
  if (!ticket) {
    return (
      <StaffPanel>
        <div className="flex gap-3">
          <ShieldAlert className="mt-1 size-5 shrink-0 text-warning" />
          <p className="text-sm text-subtle">
            {emptyMessage || 'Kết quả tìm kiếm thủ công chỉ hiển thị vé thuộc sự kiện bạn được phân công.'}
          </p>
        </div>
      </StaffPanel>
    )
  }

  return (
    <StaffPanel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted">Vé đang chọn</p>
          <h3 className="mt-1 font-extrabold text-content">{ticket.ticketCode}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(ticket.status)}`}>
          {ticketStatusLabel(ticket)}
        </span>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <InfoRow label="Sự kiện" value={ticket.eventName} />
        <InfoRow label="Người mua" value={ticket.buyerName} />
        <InfoRow label="Email" value={ticket.buyerEmail} />
        <InfoRow label="Số điện thoại" value={ticket.buyerPhone || 'Không có'} />
        <InfoRow label="Hạng vé" value={ticket.ticketType} />
        {ticket.seat && <InfoRow label="Ghế ngồi" value={ticket.seat} />}
        <InfoRow label="Trạng thái vé" value={ticketStatusLabel(ticket)} strong={isTicketCheckedIn(ticket)} />
        <InfoRow label="Thời gian soát vé" value={ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : 'Chưa soát vé'} />
      </div>
      <div className="mt-5 grid gap-2">
        {canCheckInTicket(ticket) && (
          <button className="admin-primary w-full" onClick={onCheckIn} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
            Xác nhận soát vé
          </button>
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

function InfoRow({ label, value, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-soft/20 pb-2 last:border-0 last:pb-0">
      <span className="text-subtle">{label}</span>
      <span className={`max-w-[58%] text-right ${strong ? 'font-extrabold text-success' : 'font-semibold text-content'}`}>
        {value}
      </span>
    </div>
  )
}

export function CameraDeniedPage() {
  return <CameraDeniedContent onRetry={() => window.location.assign('/staff/qr-check-in')} />
}
