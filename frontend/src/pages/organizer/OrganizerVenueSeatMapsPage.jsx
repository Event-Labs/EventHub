import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { Armchair, ArrowLeft, Eye, Lock, Pencil, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  Badge,
  ConfirmModal,
  OrganizerPage,
  OrganizerTable,
  StatusBadge,
  TableActionButton,
} from './OrganizerComponents.jsx'
import { getVenueSeatMaps } from '@/services/organizerVenues.js'
import { deleteSeatMap, getSeatMap } from '@/services/organizerSeatMaps.js'
import { fetchCurrentPlan } from '@/services/subscriptions.js'
import { SeatMapEditor } from './SeatMapEditor.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

function isLightColor(hex) {
  if (!hex || typeof hex !== 'string') return false
  const clean = hex.replace('#', '').trim()
  if (clean.length < 6) return false
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 170
}

function renderStagePreviewShape(x, y, w, h, shape = 'RECTANGLE', color = '#3B82F6', label = 'SÂN KHẤU', position = 'TOP', isLight = false) {
  const fillColor = color || '#3B82F6'
  const strokeColor = isLight ? 'rgba(15,23,42,0.25)' : 'rgba(255,255,255,0.4)'
  const isFillLight = isLightColor(fillColor)
  const textColor = isFillLight ? '#0D1B2A' : '#FFFFFF'

  if (shape === 'CIRCLE') {
    const rx = w / 2
    const ry = h / 2
    const cx = x + rx
    const cy = y + ry
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={3} />
        <ellipse cx={cx} cy={cy} rx={Math.max(2, rx - 8)} ry={Math.max(2, ry - 8)} fill="none" stroke={isFillLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'} strokeWidth={1} strokeDasharray="4 4" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  if (shape === 'SEMI_CIRCLE') {
    const rx = w / 2
    const ry = h
    const cx = x + rx
    return (
      <g>
        <path d={`M ${x} ${y + h} A ${rx} ${ry} 0 0 1 ${x + w} ${y + h} Z`} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={3} />
        <text x={cx} y={y + h / 2 + 6} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  if (shape === 'T_STAGE') {
    const topH = h * 0.45
    const stemW = w * 0.4
    const stemX = x + (w - stemW) / 2
    const d = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + topH} L ${stemX + stemW} ${y + topH} L ${stemX + stemW} ${y + h} L ${stemX} ${y + h} L ${stemX} ${y + topH} L ${x} ${y + topH} Z`
    return (
      <g>
        <path d={d} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={3} />
        <text x={x + w / 2} y={y + topH / 2 + 4} textAnchor="middle" fill={textColor} fontSize={12} fontWeight="800" style={{ userSelect: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  if (shape === 'DIAMOND') {
    const cx = x + w / 2
    const cy = y + h / 2
    const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`
    return (
      <g>
        <polygon points={points} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={3} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  // RECTANGLE default
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={2} />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" letterSpacing="1" style={{ userSelect: 'none' }}>
        {label}
      </text>
    </g>
  )
}

function SeatMapPreviewModal({ open, seatMapId, onClose, onEdit }) {
  const { isEnglish } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)

  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 })
  const scrollContainerRef = useRef(null)

  function handlePanMouseDown(e) {
    if (!scrollContainerRef.current) return
    if (e.target.closest('button')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setScrollStart({
      left: scrollContainerRef.current.scrollLeft,
      top: scrollContainerRef.current.scrollTop,
    })
  }

  function handlePanMouseMove(e) {
    if (!isDragging || !scrollContainerRef.current) return
    e.preventDefault()
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    scrollContainerRef.current.scrollLeft = scrollStart.left - dx
    scrollContainerRef.current.scrollTop = scrollStart.top - dy
  }

  function handlePanMouseUp() {
    setIsDragging(false)
  }

  useEffect(() => {
    if (!open || !seatMapId) return
    let isMounted = true
    setLoading(true)
    setError('')

    getSeatMap(seatMapId)
      .then((res) => {
        if (isMounted) setData(res)
      })
      .catch((err) => {
        console.error(err)
        if (isMounted) setError('Không thể tải dữ liệu sơ đồ ghế.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, seatMapId])

  const seatMap = data?.seat_map || data
  const zones = data?.zones || []
  const seats = data?.seats || []

  // Create zoneMap indexing both z.id and z.localId
  const zoneMap = new Map()
  zones.forEach((z) => {
    if (z.id) zoneMap.set(z.id, z)
    if (z.localId) zoneMap.set(z.localId, z)
  })

  // Read sm.config camelCase and snake_case properties exactly like SeatMapEditor
  const canvasBg = seatMap?.config?.canvasBg || seatMap?.config?.canvas_theme || '#0F172A'
  const isLightCanvas = isLightColor(canvasBg)

  const stagePosition = seatMap?.config?.stagePosition || seatMap?.config?.stage_position || 'TOP'
  const stageShape = seatMap?.config?.stageShape || seatMap?.config?.stage_shape || 'RECTANGLE'
  const stageColor = seatMap?.config?.stageColor || seatMap?.config?.stage_color || '#3B82F6'
  const stageLabel = seatMap?.config?.stageLabel || seatMap?.config?.stage_name || 'SÂN KHẤU'
  const stageRotation = seatMap?.config?.stageRotation || 0

  let stageX = seatMap?.config?.stageX ?? seatMap?.config?.custom_stage?.x ?? 0
  let stageY = seatMap?.config?.stageY ?? seatMap?.config?.custom_stage?.y ?? 0
  let stageW = seatMap?.config?.stageWidth ?? seatMap?.config?.custom_stage?.w ?? (stagePosition === 'LEFT' || stagePosition === 'RIGHT' ? 52 : 900)
  let stageH = seatMap?.config?.stageHeight ?? seatMap?.config?.custom_stage?.h ?? (stagePosition === 'LEFT' || stagePosition === 'RIGHT' ? 600 : 52)

  if (stagePosition === 'BOTTOM') {
    stageY = 548
    stageW = 900
    stageH = 52
  } else if (stagePosition === 'LEFT') {
    stageW = 52
    stageH = 600
  } else if (stagePosition === 'RIGHT') {
    stageX = 848
    stageW = 52
    stageH = 600
  }

  const standingAreas = seatMap?.config?.standingAreas || seatMap?.config?.standing_areas || []
  const auxElements = seatMap?.config?.auxiliaryElements || seatMap?.config?.aux_elements || []

  // Stats calculation matching SeatMapEditor
  const zoneSeatCounts = {}
  let activeSeatsCount = 0
  let disabledSeatsCount = 0

  seats.forEach((seat) => {
    if (seat.is_disabled || seat.isDisabled) {
      disabledSeatsCount += 1
    } else {
      activeSeatsCount += 1
    }
    const zid = seat.zone_id || seat.zoneLocalId || 'unassigned'
    zoneSeatCounts[zid] = (zoneSeatCounts[zid] || 0) + 1
  })

  const standingCapacity = standingAreas.reduce((sum, a) => sum + Number(a.capacity || 0), 0)
  const grandTotalCapacity = activeSeatsCount + standingCapacity

  // Calculate dynamic bounding box so NOTHING is cut off (minX, minY, maxX, maxY)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  seats.forEach((seat) => {
    const x = Number(seat.x_position ?? seat.x) || 0
    const y = Number(seat.y_position ?? seat.y) || 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + 36 > maxX) maxX = x + 36
    if (y + 36 > maxY) maxY = y + 36
  })

  if (stagePosition !== 'HIDDEN') {
    if (stageX < minX) minX = stageX
    if (stageY < minY) minY = stageY
    if (stageX + stageW > maxX) maxX = stageX + stageW
    if (stageY + stageH > maxY) maxY = stageY + stageH
  }

  standingAreas.forEach((area) => {
    const ax = Number(area.x) || 0
    const ay = Number(area.y) || 0
    const aw = Number(area.w) || 120
    const ah = Number(area.h) || 80
    if (ax < minX) minX = ax
    if (ay < minY) minY = ay
    if (ax + aw > maxX) maxX = ax + aw
    if (ay + ah > maxY) maxY = ay + ah
  })

  auxElements.forEach((aux) => {
    const ax = Number(aux.x) || 0
    const ay = Number(aux.y) || 0
    const aw = Number(aux.w) || 80
    const ah = Number(aux.h) || 40
    if (ax < minX) minX = ax
    if (ay < minY) minY = ay
    if (ax + aw > maxX) maxX = ax + aw
    if (ay + ah > maxY) maxY = ay + ah
  })

  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(minY)) minY = 0
  if (!Number.isFinite(maxX)) maxX = 900
  if (!Number.isFinite(maxY)) maxY = 600

  // Add 60px breathing margin around all outer edges
  const pad = 60
  const boxX = Math.floor(minX - pad)
  const boxY = Math.floor(minY - pad)
  const boxW = Math.ceil((maxX - minX) + pad * 2)
  const boxH = Math.ceil((maxY - minY) + pad * 2)

  const scaledW = Math.max(300, Math.round(boxW * zoom))
  const scaledH = Math.max(200, Math.round(boxH * zoom))

  const autoFitZoom = useCallback(() => {
    if (!boxW || !boxH) return
    const containerW = 900
    const containerH = 460
    const fitZoom = Math.min(1, Math.min(containerW / boxW, containerH / boxH))
    setZoom(Math.max(0.35, Number(fitZoom.toFixed(2))))
  }, [boxW, boxH])

  useEffect(() => {
    if (data && boxW && boxH) {
      autoFitZoom()
    }
  }, [data, boxW, boxH, autoFitZoom])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="flex max-h-[92vh] w-full max-w-[1150px] flex-col overflow-hidden rounded-2xl bg-[#0b1329] border border-white/15 shadow-2xl shadow-black/90 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#111c3a] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary/15 text-tertiary border border-tertiary/20">
              <Armchair className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">{seatMap?.name || (isEnglish ? 'Seat Map Details' : 'Chi tiết sơ đồ ghế')}</h2>
                {seatMap && (
                  <Badge tone={seatMap.is_active ? 'green' : 'gray'}>
                    {seatMap.is_active ? (isEnglish ? 'Active' : 'Đang hoạt động') : (isEnglish ? 'Inactive' : 'Tắt')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">
                <span className="font-extrabold text-white">{seats.length}</span> {isEnglish ? 'seats' : 'ghế ngồi'} ·{' '}
                <span className="font-extrabold text-white">{standingCapacity}</span> {isEnglish ? 'standing' : 'chỗ đứng'} ·{' '}
                <span className="font-extrabold text-white">{grandTotalCapacity}</span> {isEnglish ? 'total capacity' : 'tổng chỗ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-panel-soft hover:text-content transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-error">{error}</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Quick KPI stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="rounded-2xl border border-white/10 bg-[#121c3b]/80 p-4 sm:p-5 shadow-sm">
                <span className="text-xs sm:text-sm text-slate-300 font-bold block mb-1.5">{isEnglish ? 'Seated Seats' : 'Ghế ngồi'}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-white">{seats.length}</span>
                  <span className="text-xs sm:text-sm font-bold text-white">{isEnglish ? 'seats' : 'ghế'}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#121c3b]/80 p-4 sm:p-5 shadow-sm">
                <span className="text-xs sm:text-sm text-slate-300 font-bold block mb-1.5">{isEnglish ? 'Standing Capacity' : 'Chỗ đứng'}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-white">{standingCapacity}</span>
                  <span className="text-xs sm:text-sm font-bold text-white">{isEnglish ? 'people' : 'người'}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#121c3b]/80 p-4 sm:p-5 shadow-sm">
                <span className="text-xs sm:text-sm text-slate-300 font-bold block mb-1.5">{isEnglish ? 'Total Capacity' : 'Tổng sức chứa'}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-white">{grandTotalCapacity}</span>
                  <span className="text-xs sm:text-sm font-bold text-white">{isEnglish ? 'spots' : 'chỗ'}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#121c3b]/80 p-4 sm:p-5 shadow-sm">
                <span className="text-xs sm:text-sm text-slate-300 font-bold block mb-1.5">{isEnglish ? 'Layout Type' : 'Loại bố trí'}</span>
                <div className="flex items-baseline">
                  <span className="text-base sm:text-lg font-black text-white">
                    {seatMap?.layout_type === 'GRID' ? (isEnglish ? 'Grid' : 'Lưới (Grid)') : (isEnglish ? 'Freeform' : 'Tự do')}
                  </span>
                </div>
              </div>
            </div>

            {/* Zones & Standing Areas Legend */}
            {(zones.length > 0 || standingAreas.length > 0) && (
              <div className="rounded-2xl border border-white/10 bg-[#111a36]/60 p-4 space-y-4 shadow-sm">
                {zones.length > 0 && (
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-white block mb-2.5">
                      {isEnglish ? 'Seat Zones' : 'Phân khu hạng ghế (Seat Zones)'}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {zones.map((z) => {
                        const count = zoneSeatCounts[z.id] || zoneSeatCounts[z.localId] || 0
                        return (
                          <div
                            key={z.id || z.localId}
                            className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-white/15 px-3.5 py-2 text-xs"
                          >
                            <span className="size-3 rounded-full shrink-0 shadow-xs ring-1 ring-white/20" style={{ backgroundColor: z.color || '#3B82F6' }} />
                            <span className="font-bold text-white">{z.name}</span>
                            <span className="text-white font-bold">({count} {isEnglish ? 'seats' : 'ghế'})</span>
                          </div>
                        )
                      })}
                      {zoneSeatCounts['unassigned'] > 0 && (
                        <div className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-white/15 px-3.5 py-2 text-xs">
                          <span className="size-3 rounded-full shrink-0 bg-gray-500 ring-1 ring-white/20" />
                          <span className="font-bold text-white">{isEnglish ? 'Unassigned' : 'Chưa phân khu'}</span>
                          <span className="text-white font-bold">({zoneSeatCounts['unassigned']} {isEnglish ? 'seats' : 'ghế'})</span>
                        </div>
                      )}
                      {disabledSeatsCount > 0 && (
                        <div className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-white/15 px-3.5 py-2 text-xs">
                          <span className="size-3 rounded-full shrink-0 bg-slate-600 ring-1 ring-white/20" />
                          <span className="font-bold text-white">{isEnglish ? 'Disabled' : 'Vô hiệu hóa'}</span>
                          <span className="text-white font-bold">({disabledSeatsCount} {isEnglish ? 'seats' : 'ghế'})</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {standingAreas.length > 0 && (
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-white block mb-2.5">
                      {isEnglish ? 'Standing Areas' : 'Khu vực đứng (Standing Areas)'}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {standingAreas.map((area, idx) => (
                        <div
                          key={area.id || idx}
                          className="flex items-center gap-2 rounded-xl bg-slate-900/80 border border-white/15 px-3.5 py-2 text-xs"
                        >
                          <span className="size-3 rounded-full shrink-0 shadow-xs ring-1 ring-white/20" style={{ backgroundColor: area.color || '#EF4444' }} />
                          <span className="font-bold text-white">{area.name || (isEnglish ? 'Standing Area' : 'Vùng đứng')}</span>
                          <span className="text-white font-bold">({area.capacity || 0} {isEnglish ? 'people' : 'người'})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Canvas Viewer Container */}
            <div className="relative rounded-2xl border border-border-soft/30 bg-[#090D16] p-4 min-h-[420px] max-h-[62vh] overflow-hidden flex flex-col">
              {/* Zoom Controls */}
              <div className="sticky top-0 right-0 self-end z-20 flex items-center gap-1 rounded-xl bg-surface/90 border border-border-soft/40 p-1 shadow-md backdrop-blur-md text-content mb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
                  className="p-1.5 rounded-lg hover:bg-panel-soft text-subtle hover:text-content transition"
                  title={isEnglish ? 'Zoom in' : 'Phóng to'}
                >
                  <ZoomIn className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
                  className="p-1.5 rounded-lg hover:bg-panel-soft text-subtle hover:text-content transition"
                  title={isEnglish ? 'Zoom out' : 'Thu nhỏ'}
                >
                  <ZoomOut className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="p-1.5 rounded-lg hover:bg-panel-soft text-subtle hover:text-content transition"
                  title={isEnglish ? 'Reset zoom 100%' : 'Đặt lại zoom 100%'}
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={autoFitZoom}
                  className="px-2 py-1 rounded-lg text-xs font-bold text-tertiary hover:bg-tertiary/10 transition"
                  title={isEnglish ? 'Auto fit to frame' : 'Tự động vừa màn hình'}
                >
                  {isEnglish ? 'Fit to Frame' : 'Vừa khung'}
                </button>
                <span className="px-2 text-xs font-bold text-muted">{Math.round(zoom * 100)}%</span>
              </div>

              {/* SVG Canvas Scroll Area with Pan & Drag */}
              <div
                ref={scrollContainerRef}
                onMouseDown={handlePanMouseDown}
                onMouseMove={handlePanMouseMove}
                onMouseUp={handlePanMouseUp}
                onMouseLeave={handlePanMouseUp}
                className={`w-full flex-1 overflow-auto p-4 flex ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
              >
                <svg
                  width={scaledW}
                  height={scaledH}
                  viewBox={`${boxX} ${boxY} ${boxW} ${boxH}`}
                  className="m-auto rounded-xl border border-white/10 shadow-inner shrink-0"
                  style={{ backgroundColor: canvasBg }}
                >
                  {/* Grid Background Lines */}
                  <defs>
                    <pattern id="preview-grid" width="34" height="36" patternUnits="userSpaceOnUse">
                      <path d="M 34 0 L 0 0 0 36" fill="none" stroke={isLightCanvas ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.03)'} strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect x={boxX} y={boxY} width={boxW} height={boxH} fill="url(#preview-grid)" />

                  {/* Stage Rendering */}
                  {stagePosition !== 'HIDDEN' && (
                    <g transform={stageRotation ? `rotate(${stageRotation}, ${stageX + stageW / 2}, ${stageY + stageH / 2})` : undefined}>
                      {renderStagePreviewShape(
                        stageX,
                        stageY,
                        stageW,
                        stageH,
                        stageShape,
                        stageColor,
                        stageLabel,
                        stagePosition,
                        isLightCanvas,
                      )}
                    </g>
                  )}

                  {/* Standing Areas (Vùng đứng không ghế & Khối hình) Rendering */}
                  {standingAreas.map((area, idx) => {
                    const { id, name, capacity, color, x, y, w, h, rotation, shape = 'RECTANGLE' } = area
                    const fillColor = color || '#EF4444'
                    const isTriangle = shape === 'TRIANGLE'
                    const tPts = isTriangle && Array.isArray(area.trianglePoints) && area.trianglePoints.length === 3
                      ? area.trianglePoints
                      : [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
                    const p0 = { x: x + w * tPts[0].x, y: y + h * tPts[0].y }
                    const p1 = { x: x + w * tPts[1].x, y: y + h * tPts[1].y }
                    const p2 = { x: x + w * tPts[2].x, y: y + h * tPts[2].y }
                    const cx = isTriangle ? (p0.x + p1.x + p2.x) / 3 : x + w / 2
                    const cy = isTriangle ? (p0.y + p1.y + p2.y) / 3 : y + h / 2

                    return (
                      <g
                        key={id || idx}
                        transform={rotation ? `rotate(${rotation}, ${x + w / 2}, ${y + h / 2})` : undefined}
                      >
                        {isTriangle ? (
                          <polygon
                            points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
                            fill={fillColor}
                            fillOpacity={isLightCanvas ? 0.35 : 0.25}
                            stroke={fillColor}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        ) : shape === 'CIRCLE' ? (
                          <ellipse
                            cx={x + w / 2}
                            cy={y + h / 2}
                            rx={w / 2}
                            ry={h / 2}
                            fill={fillColor}
                            fillOpacity={isLightCanvas ? 0.35 : 0.25}
                            stroke={fillColor}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        ) : shape === 'DIAMOND' ? (
                          <polygon
                            points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
                            fill={fillColor}
                            fillOpacity={isLightCanvas ? 0.35 : 0.25}
                            stroke={fillColor}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        ) : (
                          <rect
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            rx={12}
                            fill={fillColor}
                            fillOpacity={isLightCanvas ? 0.35 : 0.25}
                            stroke={fillColor}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                          />
                        )}
                        <text
                          x={cx}
                          y={cy - 6}
                          textAnchor="middle"
                          fill={isLightCanvas ? '#0F172A' : 'white'}
                          fontSize={13}
                          fontWeight="800"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {name || 'Vùng đứng'}
                        </text>
                        <text
                          x={x + w / 2}
                          y={y + h / 2 + 12}
                          textAnchor="middle"
                          fill={isLightCanvas ? '#334155' : 'rgba(255,255,255,0.85)'}
                          fontSize={11}
                          fontWeight="700"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          Sức chứa: {capacity || 0} người
                        </text>
                      </g>
                    )
                  })}

                  {/* Auxiliary Elements (Vật thể phụ) Rendering */}
                  {auxElements.map((a, idx) => (
                    <g
                      key={a.id || idx}
                      transform={a.rotation ? `rotate(${a.rotation}, ${a.x + a.w / 2}, ${a.y + a.h / 2})` : undefined}
                    >
                      <rect
                        x={a.x}
                        y={a.y}
                        width={a.w}
                        height={a.h}
                        fill={isLightCanvas ? '#E2E8F0' : 'rgba(30, 41, 59, 0.8)'}
                        rx={Math.min(a.w, a.h) > 20 ? 8 : 4}
                        stroke={isLightCanvas ? '#94A3B8' : 'rgba(255,255,255,0.2)'}
                        strokeWidth={2}
                      />
                      <text
                        x={a.x + a.w / 2}
                        y={a.y + a.h / 2 + 5}
                        textAnchor="middle"
                        fill={isLightCanvas ? '#0F172A' : '#FFFFFF'}
                        fontSize={12}
                        fontWeight="800"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {a.label || a.type || 'Vật thể'}
                      </text>
                    </g>
                  ))}

                  {/* Seats Rendering */}
                  {seats.map((seat) => {
                    const zoneId = seat.zone_id || seat.zoneLocalId
                    const zone = zoneMap.get(zoneId)
                    const isDisabled = seat.is_disabled || seat.isDisabled
                    const seatColor = isDisabled ? '#EF4444' : zone ? zone.color : (isLightCanvas ? '#CBD5E1' : '#72787c')
                    const isSeatFillLight = isLightColor(seatColor)

                    const posX = Number(seat.x_position ?? seat.x) || 0
                    const posY = Number(seat.y_position ?? seat.y) || 0
                    const rowLabel = seat.row_label || seat.rowLabel || ''
                    const seatNum = seat.seat_number || seat.seatNumber || ''
                    const fullSeatLabel = `${rowLabel}${seatNum}`

                    return (
                      <g
                        key={seat.id || seat.localId || `${posX}-${posY}`}
                        transform={`translate(${posX}, ${posY})`}
                        className="cursor-pointer group"
                      >
                        <rect
                          width={28}
                          height={28}
                          rx={6}
                          fill={seatColor}
                          opacity={isDisabled ? 0.5 : 1}
                          stroke={isDisabled ? '#DC2626' : isLightCanvas ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255,255,255,0.3)'}
                          strokeWidth={1.5}
                          className="transition-all duration-150 group-hover:opacity-100 group-hover:stroke-primary"
                        />
                        <text
                          x={14}
                          y={17}
                          textAnchor="middle"
                          fill={isSeatFillLight ? '#0D1B2A' : '#FFFFFF'}
                          fontSize={9}
                          fontWeight="800"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {fullSeatLabel || seatNum}
                        </text>
                        <title>{`Hàng ${rowLabel || '?'}, Ghế ${seatNum}${zone ? ` (${zone.name})` : ''}${isDisabled ? ' [Vô hiệu hóa]' : ''}`}</title>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4 bg-[#111c3a]">
          <span className="text-xs text-slate-400">
            {isEnglish
              ? `Full viewport: ${boxW}px × ${boxH}px (Safety margin: 60px)`
              : `Khung nhìn toàn vẹn: ${boxW}px × ${boxH}px (Lề an toàn: 60px)`}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onClose()
                onEdit(seatMapId)
              }}
              className="org-btn-secondary text-xs"
            >
              {isEnglish ? 'Edit diagram' : 'Chỉnh sửa sơ đồ'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="org-btn-primary text-xs"
            >
              {isEnglish ? 'Close' : 'Đóng'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function getSeatMapTotalSeats(sm) {
  if (sm.total_capacity && sm.total_capacity > 0) return sm.total_capacity
  if (sm.seat_count && sm.seat_count > 0) return sm.seat_count
  if ((sm.layout_type || 'GRID') === 'GRID' && sm.rows_count > 0 && sm.cols_count > 0) {
    const standingCap = (sm.config?.standingAreas || sm.config?.standing_areas || []).reduce(
      (sum, sa) => sum + Number(sa.capacity || 0),
      0,
    )
    return (sm.rows_count * sm.cols_count) + standingCap
  }
  const standingCap = (sm.config?.standingAreas || sm.config?.standing_areas || []).reduce(
    (sum, sa) => sum + Number(sa.capacity || 0),
    0,
  )
  return (sm.seats?.length || 0) + standingCap
}

function getSeatMapZoneCount(sm) {
  const dbZoneCount = sm.zone_count ?? 0
  const standingCount = (sm.config?.standingAreas || sm.config?.standing_areas || []).length
  if (dbZoneCount > 0) return dbZoneCount
  const configZones = (sm.zones || sm.config?.zones || []).length
  return configZones + standingCount
}

export function OrganizerVenueSeatMapsPage() {
  const toast = useToast()
  const { venueId } = useParams()
  const navigate = useNavigate()
  const [seatMaps, setSeatMaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSeatMapId, setEditingSeatMapId] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSeatMapId, setPreviewSeatMapId] = useState(null)
  const [seatMapToDelete, setSeatMapToDelete] = useState(null)
  const [currentPlan, setCurrentPlan] = useState(null)

  useEffect(() => {
    fetchCurrentPlan()
      .then((res) => {
        if (res?.active && res?.plan) {
          setCurrentPlan(res.plan)
        }
      })
      .catch(() => setCurrentPlan(null))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const maps = await getVenueSeatMaps(venueId)
      setSeatMaps(maps)
    } catch (err) {
      console.error(err)
      const message = 'Không thể tải dữ liệu sơ đồ ghế.'
      setMessage(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function openEditor(seatMapId) {
    if (!seatMapId && currentPlan && !currentPlan.seat_map_enabled) {
      toast.error('Gói dịch vụ hiện tại không hỗ trợ sơ đồ ghế. Vui lòng nâng cấp gói để sử dụng tính năng này.')
      navigate('/organizer/subscriptions', {
        state: {
          returnTo: `/organizer/venues/${venueId}/seat-maps`,
          message: 'Tính năng thiết kế Sơ đồ ghế ngồi yêu cầu gói dịch vụ hỗ trợ sơ đồ ghế. Vui lòng nâng cấp gói để sử dụng.',
        },
      })
      return
    }
    setEditingSeatMapId(seatMapId)
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingSeatMapId(null)
  }

  function openPreview(seatMapId) {
    setPreviewSeatMapId(seatMapId)
    setPreviewOpen(true)
  }

  async function confirmDeleteSeatMap() {
    if (!seatMapToDelete) return
    const seatMapId = seatMapToDelete
    setSeatMapToDelete(null)
    try {
      await deleteSeatMap(seatMapId)
      setMessage('Đã xóa sơ đồ ghế.')
      toast.success('Đã xóa sơ đồ ghế.')
      loadData()
    } catch (err) {
      console.error(err)
      const message = getApiMessage(err, 'Không thể xóa sơ đồ ghế.')
      setMessage(message)
      toast.error(message)
    }
  }

  const layoutLabel = (sm) => {
    if (sm.layout_type === 'GRID') {
      return `${sm.rows_count || 0} hàng × ${sm.cols_count || 0} cột`
    }
    return 'Tự do'
  }

  return (
    <OrganizerPage
      title="Sơ đồ ghế"

    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/organizer/venues')}
          className="group inline-flex items-center gap-2 text-sm font-bold text-white hover:text-white/80 transition-all cursor-pointer drop-shadow-sm"
        >
          <ArrowLeft className="size-4 text-white transition-transform duration-200 group-hover:-translate-x-1" />
          <span className="text-white">Quay lại địa điểm</span>
        </button>
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="org-btn-primary flex items-center gap-1.5"
          title={currentPlan && !currentPlan.seat_map_enabled ? 'Cần nâng cấp gói để tạo sơ đồ ghế' : 'Tạo sơ đồ mới'}
        >
          {currentPlan && !currentPlan.seat_map_enabled && <Lock className="size-4" />}
          <span>+ Tạo sơ đồ mới</span>
        </button>
      </div>

      {message && <p className="mb-4 text-sm text-subtle font-semibold">{message}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <OrganizerTable
          minWidth="min-w-[840px]"
          headers={['Tên sơ đồ', 'Loại', 'Cấu hình', { label: 'Tổng số ghế', align: 'center' }, 'Khu vực', 'Trạng thái', 'Thao tác']}
          rows={seatMaps.map((sm) => [
            <span key="name" className="font-semibold text-white">{sm.name}</span>,
            <span key="type" className="whitespace-nowrap">{sm.layout_type}</span>,
            <span key="layout" className="whitespace-nowrap">{layoutLabel(sm)}</span>,
            <span key="seats" className="whitespace-nowrap font-mono text-center">{getSeatMapTotalSeats(sm)}</span>,
            <span key="zones" className="whitespace-nowrap">{getSeatMapZoneCount(sm)}</span>,
            <StatusBadge key="status" status={sm.is_active ? 'ACTIVE' : 'INACTIVE'} />,
            <div key="actions" className="flex items-center justify-center gap-2 whitespace-nowrap">
              <TableActionButton
                icon={Eye}
                tone="default"
                title="Xem sơ đồ"
                onClick={() => openPreview(sm.id)}
              />
              <TableActionButton
                icon={Pencil}
                tone="primary"
                title="Sửa sơ đồ"
                onClick={() => openEditor(sm.id)}
              />
              <TableActionButton
                icon={Trash2}
                tone="danger"
                title="Xóa sơ đồ"
                onClick={() => setSeatMapToDelete(sm.id)}
              />
            </div>,
          ])}
        />
      )}

      {!loading && !seatMaps.length && (
        <p className="mt-4 text-center text-sm text-muted py-6 border border-dashed border-border-soft/30 rounded-xl bg-panel-soft/30">
          Chưa có sơ đồ ghế. Nhấn &quot;Tạo sơ đồ mới&quot; để bắt đầu.
        </p>
      )}

      <SeatMapPreviewModal
        open={previewOpen}
        seatMapId={previewSeatMapId}
        onClose={() => {
          setPreviewOpen(false)
          setPreviewSeatMapId(null)
        }}
        onEdit={(id) => {
          setPreviewOpen(false)
          openEditor(id)
        }}
      />

      {editorOpen && (
        <SeatMapEditor
          venueId={venueId}
          seatMapId={editingSeatMapId}
          onSave={() => {
            const message = editingSeatMapId ? 'Đã cập nhật sơ đồ ghế.' : 'Đã tạo sơ đồ ghế mới.'
            setMessage(message)
            toast.success(message)
            closeEditor()
            loadData()
          }}
          onClose={closeEditor}
        />
      )}

      <ConfirmModal
        open={Boolean(seatMapToDelete)}
        title="Xóa sơ đồ ghế"
        message="Bạn có chắc chắn muốn xóa sơ đồ ghế này không? Hành động này không thể hoàn tác."
        confirmText="Xóa sơ đồ"
        cancelText="Hủy"
        tone="danger"
        onConfirm={confirmDeleteSeatMap}
        onCancel={() => setSeatMapToDelete(null)}
      />
    </OrganizerPage>
  )
}
