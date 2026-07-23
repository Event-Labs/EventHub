import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Armchair, Eye, Pencil, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  Badge,
  ConfirmModal,
  OrganizerPage,
  OrganizerTable,
} from './OrganizerComponents.jsx'
import { getVenueSeatMaps } from '@/services/organizerVenues.js'
import { deleteSeatMap, getSeatMap } from '@/services/organizerSeatMaps.js'
import { SeatMapEditor } from './SeatMapEditor.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

function renderStagePreviewShape(x, y, w, h, shape = 'RECTANGLE', color = '#3B82F6', label = 'SÂN KHẤU', position = 'TOP') {
  const fillColor = color || '#3B82F6'
  const strokeColor = 'rgba(255,255,255,0.4)'

  if (shape === 'CIRCLE') {
    const rx = w / 2
    const ry = h / 2
    const cx = x + rx
    const cy = y + ry
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={3} />
        <ellipse cx={cx} cy={cy} rx={Math.max(2, rx - 8)} ry={Math.max(2, ry - 8)} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#FFFFFF" fontSize={13} fontWeight="bold" style={{ userSelect: 'none' }}>
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
        <text x={cx} y={y + h / 2 + 6} textAnchor="middle" fill="#FFFFFF" fontSize={13} fontWeight="bold" style={{ userSelect: 'none' }}>
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
        <text x={x + w / 2} y={y + topH / 2 + 4} textAnchor="middle" fill="#FFFFFF" fontSize={13} fontWeight="bold" style={{ userSelect: 'none' }}>
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
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#FFFFFF" fontSize={13} fontWeight="bold" style={{ userSelect: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  // RECTANGLE default
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fillColor} opacity={0.9} stroke={strokeColor} strokeWidth={2} />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fill="#FFFFFF" fontSize={13} fontWeight="bold" letterSpacing="1" style={{ userSelect: 'none' }}>
        {label}
      </text>
    </g>
  )
}

function SeatMapPreviewModal({ open, seatMapId, onClose, onEdit }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030818]/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="flex max-h-[92vh] w-full max-w-[1150px] flex-col overflow-hidden rounded-2xl bg-surface border border-border-soft/30 shadow-2xl text-content">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary/15 text-tertiary border border-tertiary/20">
              <Armchair className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-content">{seatMap?.name || 'Chi tiết sơ đồ ghế'}</h2>
                {seatMap && (
                  <Badge tone={seatMap.is_active ? 'green' : 'gray'}>
                    {seatMap.is_active ? 'Đang hoạt động' : 'Tắt'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-subtle">
                <span className="font-extrabold text-content">{seats.length}</span> ghế ngồi · <span className="font-extrabold text-tertiary">{standingCapacity}</span> chỗ đứng · <span className="font-extrabold text-success">{grandTotalCapacity}</span> tổng chỗ
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3">
                <span className="text-xs text-muted font-medium block">Ghế ngồi</span>
                <span className="text-lg font-extrabold text-content">{seats.length} <span className="text-xs font-normal text-muted">ghế</span></span>
              </div>
              <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3">
                <span className="text-xs text-muted font-medium block">Chỗ đứng</span>
                <span className="text-lg font-extrabold text-tertiary">{standingCapacity} <span className="text-xs font-normal text-muted">người</span></span>
              </div>
              <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3">
                <span className="text-xs text-muted font-medium block">Tổng sức chứa</span>
                <span className="text-lg font-extrabold text-success">{grandTotalCapacity} <span className="text-xs font-normal text-muted">chỗ</span></span>
              </div>
              <div className="rounded-xl border border-border-soft/30 bg-panel-soft/40 p-3">
                <span className="text-xs text-muted font-medium block">Loại bố trí</span>
                <span className="text-sm font-bold text-content">{seatMap?.layout_type === 'GRID' ? 'Lưới (Grid)' : 'Tự do'}</span>
              </div>
            </div>

            {/* Zones & Standing Areas Legend */}
            {(zones.length > 0 || standingAreas.length > 0) && (
              <div className="rounded-xl border border-border-soft/30 bg-panel-soft/30 p-3.5 space-y-3">
                {zones.length > 0 && (
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-subtle block mb-2">
                      Phân khu hạng ghế (Seat Zones)
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {zones.map((z) => {
                        const count = zoneSeatCounts[z.id] || zoneSeatCounts[z.localId] || 0
                        return (
                          <div
                            key={z.id || z.localId}
                            className="flex items-center gap-2 rounded-lg bg-surface border border-border-soft/30 px-3 py-1.5 text-xs"
                          >
                            <span className="size-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: z.color || '#3B82F6' }} />
                            <span className="font-semibold text-content">{z.name}</span>
                            <span className="text-muted font-bold">({count} ghế)</span>
                          </div>
                        )
                      })}
                      {zoneSeatCounts['unassigned'] > 0 && (
                        <div className="flex items-center gap-2 rounded-lg bg-surface border border-border-soft/30 px-3 py-1.5 text-xs">
                          <span className="size-3 rounded-full shrink-0 bg-gray-500" />
                          <span className="font-semibold text-content">Chưa phân khu</span>
                          <span className="text-muted font-bold">({zoneSeatCounts['unassigned']} ghế)</span>
                        </div>
                      )}
                      {disabledSeatsCount > 0 && (
                        <div className="flex items-center gap-2 rounded-lg bg-surface border border-border-soft/30 px-3 py-1.5 text-xs">
                          <span className="size-3 rounded-full shrink-0 bg-slate-600" />
                          <span className="font-semibold text-content">Vô hiệu hóa</span>
                          <span className="text-muted font-bold">({disabledSeatsCount} ghế)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {standingAreas.length > 0 && (
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-tertiary block mb-2">
                      Khu vực đứng (Standing Areas)
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {standingAreas.map((area, idx) => (
                        <div
                          key={area.id || idx}
                          className="flex items-center gap-2 rounded-lg bg-surface border border-border-soft/30 px-3 py-1.5 text-xs"
                        >
                          <span className="size-3 rounded-full shrink-0 shadow-xs border border-white/20" style={{ backgroundColor: area.color || '#EF4444' }} />
                          <span className="font-semibold text-content">{area.name || 'Vùng đứng'}</span>
                          <span className="text-tertiary font-bold">({area.capacity || 0} người)</span>
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
                  title="Phóng to"
                >
                  <ZoomIn className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
                  className="p-1.5 rounded-lg hover:bg-panel-soft text-subtle hover:text-content transition"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="p-1.5 rounded-lg hover:bg-panel-soft text-subtle hover:text-content transition"
                  title="Đặt lại zoom 100%"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={autoFitZoom}
                  className="px-2 py-1 rounded-lg text-xs font-bold text-tertiary hover:bg-tertiary/10 transition"
                  title="Tự động vừa màn hình"
                >
                  Vừa khung
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
                      <path d="M 34 0 L 0 0 0 36" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
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
                      )}
                    </g>
                  )}

                  {/* Standing Areas (Vùng đứng không ghế) Rendering */}
                  {standingAreas.map((area, idx) => {
                    const { id, name, capacity, color, x, y, w, h, rotation } = area
                    const fillColor = color || '#EF4444'

                    return (
                      <g
                        key={id || idx}
                        transform={rotation ? `rotate(${rotation}, ${x + w / 2}, ${y + h / 2})` : undefined}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={12}
                          fill={fillColor}
                          fillOpacity={0.25}
                          stroke={fillColor}
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                        <text
                          x={x + w / 2}
                          y={y + h / 2 - 6}
                          textAnchor="middle"
                          fill="white"
                          fontSize={13}
                          fontWeight="bold"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {name || 'Vùng đứng'}
                        </text>
                        <text
                          x={x + w / 2}
                          y={y + h / 2 + 12}
                          textAnchor="middle"
                          fill="rgba(255,255,255,0.85)"
                          fontSize={11}
                          fontWeight="600"
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
                        fill="rgba(30, 41, 59, 0.8)"
                        rx={Math.min(a.w, a.h) > 20 ? 8 : 4}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth={2}
                      />
                      <text
                        x={a.x + a.w / 2}
                        y={a.y + a.h / 2 + 5}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={12}
                        fontWeight="bold"
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
                    const seatColor = isDisabled ? '#EF4444' : zone ? zone.color : '#72787c'
                    
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
                          opacity={isDisabled ? 0.5 : 0.9}
                          stroke={isDisabled ? '#991B1B' : 'rgba(255,255,255,0.3)'}
                          strokeWidth={1.5}
                          className="transition-all duration-150 group-hover:opacity-100 group-hover:stroke-white"
                        />
                        <text
                          x={14}
                          y={17}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize={9}
                          fontWeight="bold"
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
        <div className="flex items-center justify-between border-t border-border-soft/20 px-6 py-4 bg-panel-soft/30">
          <span className="text-xs text-muted">
            Khung nhìn toàn vẹn: {boxW}px × {boxH}px (Lề an toàn: 60px)
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
              <Pencil className="size-3.5" />
              Chỉnh sửa sơ đồ
            </button>
            <button
              type="button"
              onClick={onClose}
              className="org-btn-primary text-xs"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
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
      description="Quản lý các sơ đồ chỗ ngồi cho địa điểm này."
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/organizer/venues')}
          className="text-sm font-semibold text-muted hover:text-content transition-colors"
        >
          ← Quay lại địa điểm
        </button>
        <button type="button" onClick={() => openEditor(null)} className="org-btn-primary">
          + Tạo sơ đồ mới
        </button>
      </div>

      {message && <p className="mb-4 text-sm text-subtle font-semibold">{message}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <OrganizerTable
          headers={['Tên sơ đồ', 'Loại', 'Cấu hình', 'Tổng số ghế', 'Khu vực', 'Trạng thái', '']}
          rows={seatMaps.map((sm) => [
            sm.name,
            sm.layout_type,
            layoutLabel(sm),
            getSeatMapTotalSeats(sm),
            getSeatMapZoneCount(sm),
            <Badge key="status" tone={sm.is_active ? 'green' : 'gray'}>
              {sm.is_active ? 'Đang hoạt động' : 'Không hoạt động'}
            </Badge>,
            <div key="actions" className="flex items-center gap-3 text-muted">
              <button type="button" onClick={() => openPreview(sm.id)} title="Xem sơ đồ">
                <Eye className="size-4 hover:text-primary transition-colors" />
              </button>
              <button type="button" onClick={() => openEditor(sm.id)} title="Sửa">
                <Pencil className="size-4 hover:text-tertiary transition-colors" />
              </button>
              <button type="button" onClick={() => setSeatMapToDelete(sm.id)} title="Xóa">
                <Trash2 className="size-4 text-error hover:opacity-80 transition-opacity" />
              </button>
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
