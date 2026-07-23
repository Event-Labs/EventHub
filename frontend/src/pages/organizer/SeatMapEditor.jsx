import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CheckSquare,
  ClipboardPaste,
  Copy,
  Eraser,
  Grid,
  Hand,
  Layers,
  MousePointer2,
  Paintbrush,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  Shapes,
  Sparkles,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { createSeatMap, getSeatMap, updateSeatMap } from '@/services/organizerSeatMaps.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const SEAT_W = 28
const SEAT_H = 28
const GAP_X = 6
const GAP_Y = 8
const SNAP_X = SEAT_W + GAP_X
const SNAP_Y = SEAT_H + GAP_Y
const STAGE_OFFSET_Y = 70
const ZONE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F43F5E']

const STAGE_SHAPES = [
  { id: 'RECTANGLE', label: 'Hình chữ nhật / Vuông', icon: '▭' },
  { id: 'CIRCLE', label: 'Hình tròn / Ellipse', icon: '◯' },
  { id: 'SEMI_CIRCLE', label: 'Hình bán nguyệt', icon: '⌒' },
  { id: 'T_STAGE', label: 'Sân khấu chữ T (Runway)', icon: '⊤' },
  { id: 'DIAMOND', label: 'Hình thoi / Kim cương', icon: '◇' },
]

const CANVAS_THEMES = [
  { id: '#0F172A', label: 'Dark Navy', color: '#0F172A' },
  { id: '#090D16', label: 'Pure Dark', color: '#090D16' },
  { id: '#1E293B', label: 'Studio Slate', color: '#1E293B' },
  { id: '#F8FAFC', label: 'Light Canvas', color: '#F8FAFC', light: true },
]

const TOOLS = [
  { id: 'SELECT', label: 'Chọn', icon: MousePointer2, shortcut: 'V' },
  { id: 'ADD', label: 'Vẽ ghế', icon: Plus, shortcut: 'A', freeformOnly: true },
  { id: 'PAINT', label: 'Tô khu vực', icon: Paintbrush, shortcut: 'P' },
  { id: 'ERASE', label: 'Xóa', icon: Eraser, shortcut: 'E' },
  { id: 'DISABLE', label: 'Vô hiệu', icon: Ban, shortcut: 'D' },
]

function newLocalId() {
  return crypto.randomUUID()
}

function rowLabelForIndex(r) {
  if (r < 26) return String.fromCharCode(65 + r)
  return String.fromCharCode(64 + Math.floor(r / 26)) + String.fromCharCode(65 + (r % 26))
}

function RenameModal({ isOpen, title, initialValue, onSave, onClose }) {
  const [val, setVal] = useState(initialValue || '')

  useEffect(() => {
    setVal(initialValue || '')
  }, [initialValue, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/40 bg-surface p-6 shadow-2xl space-y-4 text-content">
        <h3 className="text-base font-extrabold text-content">{title || 'Đổi tên'}</h3>
        <div>
          <label className="text-xs text-subtle font-semibold mb-1 block">Tên hiển thị mới:</label>
          <input
            type="text"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && val.trim()) {
                onSave(val.trim())
              }
              if (e.key === 'Escape') onClose()
            }}
            placeholder="Nhập tên mới..."
            className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3.5 py-2.5 text-sm font-bold text-content outline-none focus:border-tertiary shadow-inner"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-subtle hover:bg-panel-soft hover:text-content transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              if (val.trim()) onSave(val.trim())
            }}
            className="org-btn-primary px-5 py-2 text-xs"
          >
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  )
}

/** Gán row_label + seat_number duy nhất trước khi lưu (tránh UNIQUE constraint). */
function normalizeSeatsForSave(seats) {
  const sorted = [...seats].sort((a, b) => a.y - b.y || a.x - b.x)
  const rowGroups = []

  for (const seat of sorted) {
    const band = Math.round(seat.y / SNAP_Y)
    let group = rowGroups.find((g) => g.band === band)
    if (!group) {
      group = { band, items: [] }
      rowGroups.push(group)
    }
    group.items.push(seat)
  }

  rowGroups.sort((a, b) => a.band - b.band)
  const used = new Set()
  const labelById = new Map()

  rowGroups.forEach((group, rowIdx) => {
    group.items.sort((a, b) => a.x - b.x)
    group.items.forEach((seat, colIdx) => {
      let rowLabel = rowLabelForIndex(rowIdx)
      let seatNumber = String(colIdx + 1)
      let key = `${rowLabel}|${seatNumber}`
      let suffix = 2
      while (used.has(key)) {
        seatNumber = `${colIdx + 1}-${suffix}`
        suffix += 1
        key = `${rowLabel}|${seatNumber}`
      }
      used.add(key)
      labelById.set(seat.localId, { rowLabel, seatNumber })
    })
  })

  return seats.map((s) => {
    const labels = labelById.get(s.localId)
    return labels ? { ...s, rowLabel: labels.rowLabel, seatNumber: labels.seatNumber } : s
  })
}

function snapPoint(x, y, stagePos = 'TOP') {
  const startX = stagePos === 'LEFT' ? STAGE_OFFSET_Y : 0
  const startY = stagePos === 'TOP' ? STAGE_OFFSET_Y : 0
  return {
    x: Math.max(startX, Math.round((x - startX) / SNAP_X) * SNAP_X + startX),
    y: Math.max(startY, Math.round((y - startY) / SNAP_Y) * SNAP_Y + startY),
  }
}

function seatAtPoint(seats, x, y) {
  return seats.find((s) => x >= s.x && x <= s.x + SEAT_W && y >= s.y && y <= s.y + SEAT_H)
}

function seatsInRect(seats, x1, y1, x2, y2) {
  const left = Math.min(x1, x2)
  const right = Math.max(x1, x2)
  const top = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)
  return seats.filter(
    (s) => s.x + SEAT_W >= left && s.x <= right && s.y + SEAT_H >= top && s.y <= bottom,
  )
}

function seatKey(x, y) {
  return `${x},${y}`
}

function renderStageShapeBody(x, y, w, h, shape = 'RECTANGLE', color = 'var(--color-panel-soft)', label = 'SÂN KHẤU', position = 'TOP') {
  const fillColor = color || 'var(--color-panel-soft)'
  const strokeColor = 'rgba(255,255,255,0.3)'

  if (shape === 'CIRCLE') {
    const rx = w / 2
    const ry = h / 2
    const cx = x + rx
    const cy = y + ry
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
        <ellipse cx={cx} cy={cy} rx={Math.max(2, rx - 8)} ry={Math.max(2, ry - 8)} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 4" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold" style={{ userSelect: 'none', pointerEvents: 'none' }}>
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
        <path d={`M ${x} ${y + h} A ${rx} ${ry} 0 0 1 ${x + w} ${y + h} Z`} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
        <text x={cx} y={y + h / 2 + 6} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold" style={{ userSelect: 'none', pointerEvents: 'none' }}>
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
        <path d={d} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
        <text x={x + w / 2} y={y + topH / 2 + 4} textAnchor="middle" fill="white" fontSize={12} fontWeight="bold" style={{ userSelect: 'none', pointerEvents: 'none' }}>
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
        <polygon points={points} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold" style={{ userSelect: 'none', pointerEvents: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  // RECTANGLE
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fillColor} rx={Math.min(w, h) > 20 ? 12 : 4} stroke={strokeColor} strokeWidth={2} />
      {(position === 'TOP' || position === 'CUSTOM') && <rect x={x} y={y + h - 4} width={w} height={4} fill="rgba(255,255,255,0.3)" />}
      {position === 'BOTTOM' && <rect x={x} y={y} width={w} height={4} fill="rgba(255,255,255,0.3)" />}
      {position === 'LEFT' && <rect x={x + w - 4} y={y} width={4} height={h} fill="rgba(255,255,255,0.3)" />}
      {position === 'RIGHT' && <rect x={x} y={y} width={4} height={h} fill="rgba(255,255,255,0.3)" />}
      <text
        x={x + w / 2}
        y={y + h / 2 + 5}
        textAnchor="middle"
        fill="white"
        fontSize={13}
        fontWeight="bold"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
        transform={position === 'LEFT' || position === 'RIGHT' || (position === 'CUSTOM' && h > w) ? `rotate(-90 ${x + w / 2} ${y + h / 2})` : undefined}
      >
        {label}
      </text>
    </g>
  )
}

export function SeatMapEditor({ venueId, seatMapId, onSave, onClose }) {
  const toast = useToast()
  const svgRef = useRef(null)
  const paintVisited = useRef(new Set())
  const seatCounter = useRef(1)

  const [tool, setTool] = useState('SELECT')
  const [layoutType, setLayoutType] = useState('GRID')
  const [activeZoneId, setActiveZoneId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 80 })
  const [rubberBand, setRubberBand] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isPainting, setIsPainting] = useState(false)
  const [panStart, setPanStart] = useState(null)
  const [gridConfig, setGridConfig] = useState({ rows: 10, cols: 20 })
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [mapName, setMapName] = useState('')
  const [zones, setZones] = useState([])
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(Boolean(seatMapId))
  const [canvasBg, setCanvasBg] = useState('#0F172A')
  const [sidebarTab, setSidebarTab] = useState('STAGE') // STAGE | ZONES | GRID | THEMES

  const [renameModalState, setRenameModalState] = useState({ isOpen: false, title: '', initialValue: '', onSave: null })

  const [stageConfig, setStageConfig] = useState({
    position: 'TOP',
    shape: 'RECTANGLE',
    color: '#3B82F6',
    label: 'SÂN KHẤU',
    x: 0,
    y: 0,
    w: 900,
    h: 52,
    rotation: 0,
  })

  const [standingAreas, setStandingAreas] = useState([])
  const [draggingStandingId, setDraggingStandingId] = useState(null)
  const [standingDragOffset, setStandingDragOffset] = useState({ x: 0, y: 0 })

  const [isDraggingStage, setIsDraggingStage] = useState(false)
  const [stageDragOffset, setStageDragOffset] = useState({ x: 0, y: 0 })
  const [isDraggingSeats, setIsDraggingSeats] = useState(false)
  const [seatDragStartPt, setSeatDragStartPt] = useState(null)
  const [seatDragOriginals, setSeatDragOriginals] = useState({})
  const [hasDraggedSeats, setHasDraggedSeats] = useState(false)

  const [auxElements, setAuxElements] = useState([])
  const [draggingAuxId, setDraggingAuxId] = useState(null)
  const [auxDragOffset, setAuxDragOffset] = useState({ x: 0, y: 0 })

  const [selectedShapeId, setSelectedShapeId] = useState(null)
  const [draggingHandle, setDraggingHandle] = useState(null)

  const seatsRef = useRef(seats)
  seatsRef.current = seats

  useEffect(() => {
    if (!seatMapId) {
      if (layoutType === 'GRID' && seats.length === 0 && gridConfig.rows > 0 && gridConfig.cols > 0) {
        generateGrid()
      }
      return
    }
    setLoading(true)
    getSeatMap(seatMapId)
      .then((sm) => {
        setMapName(sm.name)
        const lType = sm.layout_type || 'GRID'
        setLayoutType(lType)
        const rows = sm.rows_count || 10
        const cols = sm.cols_count || 20
        setGridConfig({ rows, cols })
        setCanvasBg(sm.config?.canvasBg || '#0F172A')
        const stagePos = sm.config?.stagePosition || 'TOP'
        setStageConfig({
          position: stagePos,
          shape: sm.config?.stageShape || 'RECTANGLE',
          color: sm.config?.stageColor || '#3B82F6',
          label: sm.config?.stageLabel || 'SÂN KHẤU',
          x: sm.config?.stageX || 0,
          y: sm.config?.stageY || 0,
          w: sm.config?.stageWidth || 900,
          h: sm.config?.stageHeight || 52,
          rotation: sm.config?.stageRotation || 0,
        })
        setStandingAreas(sm.config?.standingAreas || [])
        setAuxElements(sm.config?.auxiliaryElements || [])
        setZones((sm.zones || []).map((z) => ({ localId: z.id, name: z.name, color: z.color })))
        let loaded = (sm.seats || []).map((s) => ({
          localId: s.id,
          rowLabel: s.row_label,
          seatNumber: s.seat_number,
          x: s.x_position,
          y: s.y_position,
          zoneLocalId: s.zone_id,
          isDisabled: s.is_disabled,
        }))
        if (loaded.length === 0 && lType === 'GRID' && rows > 0 && cols > 0) {
          const generated = []
          const startY = stagePos === 'TOP' ? STAGE_OFFSET_Y : 20
          const startX = stagePos === 'LEFT' ? STAGE_OFFSET_Y : 20
          for (let r = 0; r < rows; r += 1) {
            const rowLabel = rowLabelForIndex(r)
            for (let c = 0; c < cols; c += 1) {
              generated.push({
                localId: newLocalId(),
                rowLabel,
                seatNumber: String(c + 1),
                x: startX + c * SNAP_X,
                y: startY + r * SNAP_Y,
                zoneLocalId: null,
                isDisabled: false,
              })
            }
          }
          loaded = generated
        }
        setSeats(loaded)
        seatCounter.current = loaded.length + 1
      })
      .catch((err) => {
        console.error(err)
        const message = getApiMessage(err, 'Không thể tải dữ liệu sơ đồ ghế.')
        setError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [seatMapId, toast])

  const stats = useMemo(() => {
    const activeSeats = seats.filter((s) => !s.isDisabled).length
    const disabledSeats = seats.length - activeSeats
    const zonedSeats = seats.filter((s) => s.zoneLocalId && !s.isDisabled).length
    const standingCapacity = standingAreas.reduce((sum, a) => sum + Number(a.capacity || 0), 0)
    const grandTotal = activeSeats + standingCapacity
    return {
      total: seats.length,
      active: activeSeats,
      disabled: disabledSeats,
      zoned: zonedSeats,
      unassigned: activeSeats - zonedSeats,
      standingCap: standingCapacity,
      totalCap: grandTotal,
    }
  }, [seats, standingAreas])

  const historyStackRef = useRef([])
  const clipboardRef = useRef(null)

  const saveHistory = useCallback(() => {
    historyStackRef.current.push({
      seats: JSON.parse(JSON.stringify(seats)),
      zones: JSON.parse(JSON.stringify(zones)),
      standingAreas: JSON.parse(JSON.stringify(standingAreas)),
      auxElements: JSON.parse(JSON.stringify(auxElements)),
      stageConfig: JSON.parse(JSON.stringify(stageConfig)),
    })
    if (historyStackRef.current.length > 40) {
      historyStackRef.current.shift()
    }
  }, [seats, zones, standingAreas, auxElements, stageConfig])

  const undo = useCallback(() => {
    if (!historyStackRef.current.length) return
    const previous = historyStackRef.current.pop()
    setSeats(previous.seats)
    setZones(previous.zones)
    setStandingAreas(previous.standingAreas)
    setAuxElements(previous.auxElements)
    setStageConfig(previous.stageConfig)
    setSelectedIds(new Set())
    setSelectedShapeId(null)
  }, [])

  const selectAll = useCallback(() => {
    if (seats.length > 0) {
      setSelectedIds(new Set(seats.map((s) => s.localId)))
    }
    if (standingAreas.length > 0) {
      if (!selectedShapeId || !selectedShapeId.startsWith('std-')) {
        setSelectedShapeId(standingAreas[0].id)
      }
    }
  }, [seats, standingAreas, selectedShapeId])

  const copySelected = useCallback(() => {
    if (selectedIds.size > 0) {
      const selectedSeats = seats.filter((s) => selectedIds.has(s.localId))
      const selectedStanding = selectedShapeId
        ? standingAreas.filter((a) => a.id === selectedShapeId)
        : selectedIds.size === seats.length && seats.length > 0
          ? standingAreas
          : []
      const selectedAux = selectedShapeId ? auxElements.filter((a) => a.id === selectedShapeId) : []

      clipboardRef.current = {
        type: 'COMPOSITE',
        seats: JSON.parse(JSON.stringify(selectedSeats)),
        standingAreas: JSON.parse(JSON.stringify(selectedStanding)),
        auxElements: JSON.parse(JSON.stringify(selectedAux)),
      }
      return
    }

    if (selectedShapeId) {
      const standing = standingAreas.find((a) => a.id === selectedShapeId)
      if (standing) {
        clipboardRef.current = {
          type: 'STANDING',
          item: JSON.parse(JSON.stringify(standing)),
        }
        return
      }

      const aux = auxElements.find((a) => a.id === selectedShapeId)
      if (aux) {
        clipboardRef.current = {
          type: 'AUX',
          item: JSON.parse(JSON.stringify(aux)),
        }
        return
      }
    }
  }, [selectedIds, seats, selectedShapeId, standingAreas, auxElements])

  const pasteCopied = useCallback(() => {
    if (!clipboardRef.current) return

    saveHistory()

    const offset = 30 // Offset shift for pasted items

    if (clipboardRef.current.type === 'COMPOSITE') {
      const { seats: copiedSeats, standingAreas: copiedStanding, auxElements: copiedAux } = clipboardRef.current

      if (copiedSeats && copiedSeats.length > 0) {
        const newPastedSeats = copiedSeats.map((s) => ({
          ...s,
          localId: newLocalId(),
          x: s.x + offset,
          y: s.y + offset,
        }))
        setSeats((prev) => [...prev, ...newPastedSeats])
        setSelectedIds(new Set(newPastedSeats.map((s) => s.localId)))
      }

      if (copiedStanding && copiedStanding.length > 0) {
        const newPastedStanding = copiedStanding.map((a) => ({
          ...a,
          id: `std-${newLocalId()}`,
          name: `${a.name} (Bản sao)`,
          x: a.x + offset,
          y: a.y + offset,
        }))
        setStandingAreas((prev) => [...prev, ...newPastedStanding])
        if (newPastedStanding.length === 1) {
          setSelectedShapeId(newPastedStanding[0].id)
        }
      }

      if (copiedAux && copiedAux.length > 0) {
        const newPastedAux = copiedAux.map((a) => ({
          ...a,
          id: `aux-${newLocalId()}`,
          x: a.x + offset,
          y: a.y + offset,
        }))
        setAuxElements((prev) => [...prev, ...newPastedAux])
      }
    } else if (clipboardRef.current.type === 'SEATS') {
      const copied = clipboardRef.current.items
      const newPastedSeats = copied.map((s) => ({
        ...s,
        localId: newLocalId(),
        x: s.x + offset,
        y: s.y + offset,
      }))
      setSeats((prev) => [...prev, ...newPastedSeats])
      setSelectedIds(new Set(newPastedSeats.map((s) => s.localId)))
    } else if (clipboardRef.current.type === 'STANDING') {
      const item = clipboardRef.current.item
      const newStanding = {
        ...item,
        id: `std-${newLocalId()}`,
        name: `${item.name} (Bản sao)`,
        x: item.x + offset,
        y: item.y + offset,
      }
      setStandingAreas((prev) => [...prev, newStanding])
      setSelectedShapeId(newStanding.id)
    } else if (clipboardRef.current.type === 'AUX') {
      const item = clipboardRef.current.item
      const newAux = {
        ...item,
        id: `aux-${newLocalId()}`,
        x: item.x + offset,
        y: item.y + offset,
      }
      setAuxElements((prev) => [...prev, newAux])
      setSelectedShapeId(newAux.id)
    }
  }, [saveHistory])

  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    setSeats((prev) => prev.filter((s) => !selectedIds.has(s.localId)))
    setSelectedIds(new Set())
  }, [selectedIds, saveHistory])

  const applyZoneToSelected = useCallback(
    (zoneId) => {
      if (!selectedIds.size) return
      saveHistory()
      setSeats((prev) =>
        prev.map((s) => (selectedIds.has(s.localId) ? { ...s, zoneLocalId: zoneId } : s)),
      )
    },
    [selectedIds, saveHistory],
  )

  const disableSelected = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    setSeats((prev) =>
      prev.map((s) => (selectedIds.has(s.localId) ? { ...s, isDisabled: true } : s)),
    )
  }, [selectedIds, saveHistory])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      const key = e.key.toLowerCase()
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey

      if (ctrlKey && key === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (ctrlKey && key === 'a') {
        e.preventDefault()
        selectAll()
        return
      }
      if (ctrlKey && key === 'c') {
        e.preventDefault()
        copySelected()
        return
      }
      if (ctrlKey && key === 'v') {
        e.preventDefault()
        pasteCopied()
        return
      }

      if (key === 'delete' || key === 'backspace') {
        if (selectedIds.size) {
          e.preventDefault()
          deleteSelected()
        }
        if (selectedShapeId && selectedShapeId.startsWith('std-')) {
          e.preventDefault()
          saveHistory()
          deleteStandingArea(selectedShapeId)
        }
      }
      if (key === 'escape') {
        setSelectedIds(new Set())
        setSelectedShapeId(null)
        setRubberBand(null)
      }
      const matched = TOOLS.find((t) => t.shortcut.toLowerCase() === key)
      if (matched && !(matched.freeformOnly && layoutType === 'GRID')) {
        setTool(matched.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, selectedShapeId, deleteSelected, layoutType, undo, selectAll, copySelected, pasteCopied, saveHistory])

  function toSVGPoint(e) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    }
  }

  function generateGrid() {
    const newSeats = []
    const startY = stageConfig.position === 'TOP' ? STAGE_OFFSET_Y : 20
    const startX = stageConfig.position === 'LEFT' ? STAGE_OFFSET_Y : 20
    for (let r = 0; r < gridConfig.rows; r += 1) {
      const rowLabel = rowLabelForIndex(r)
      for (let c = 0; c < gridConfig.cols; c += 1) {
        newSeats.push({
          localId: newLocalId(),
          rowLabel,
          seatNumber: String(c + 1),
          x: startX + c * SNAP_X,
          y: startY + r * SNAP_Y,
          zoneLocalId: null,
          isDisabled: false,
        })
      }
    }
    setSeats(newSeats)
    setSelectedIds(new Set())
    seatCounter.current = newSeats.length + 1
  }

  function addZone() {
    const newZone = {
      localId: newLocalId(),
      name: `Khu vực ${zones.length + 1}`,
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
    }
    setZones((prev) => [...prev, newZone])
    setActiveZoneId(newZone.localId)
  }

  function deleteZone(zoneLocalId) {
    setZones((prev) => prev.filter((z) => z.localId !== zoneLocalId))
    setSeats((prev) =>
      prev.map((s) => (s.zoneLocalId === zoneLocalId ? { ...s, zoneLocalId: null } : s)),
    )
    if (activeZoneId === zoneLocalId) setActiveZoneId(null)
  }

  function addStandingArea() {
    saveHistory()
    const newArea = {
      id: `std-${newLocalId()}`,
      name: `Vùng Đứng ${standingAreas.length + 1}`,
      capacity: 100,
      color: ZONE_COLORS[standingAreas.length % ZONE_COLORS.length],
      x: 200,
      y: 200,
      w: 240,
      h: 120,
      rotation: 0,
    }
    setStandingAreas((prev) => [...prev, newArea])
    setSelectedShapeId(newArea.id)
    setSelectedIds(new Set())
    setSidebarTab('ZONES')
  }

  function deleteStandingArea(id) {
    saveHistory()
    setStandingAreas((prev) => prev.filter((a) => a.id !== id))
    if (selectedShapeId === id) setSelectedShapeId(null)
  }

  function applyPreset(presetType) {
    if (presetType === 'THEATER') {
      setStageConfig({ position: 'TOP', shape: 'RECTANGLE', color: '#3B82F6', label: 'SÂN KHẤU CHÍNH', x: 0, y: 0, w: 900, h: 52, rotation: 0 })
      setGridConfig({ rows: 10, cols: 20 })
      setLayoutType('GRID')
      setStandingAreas([])
      generateGrid()
      toast.success('Đã áp dụng mẫu Nhà hát / Hội trường')
    } else if (presetType === 'T_STAGE') {
      setStageConfig({ position: 'CUSTOM', shape: 'T_STAGE', color: '#8B5CF6', label: 'SÂN KHẤU T', x: 220, y: 20, w: 460, h: 220, rotation: 0 })
      setLayoutType('GRID')
      setGridConfig({ rows: 8, cols: 18 })
      generateGrid()
      setStandingAreas([
        { id: `std-${newLocalId()}`, name: 'Khu Đứng VIP (Mặt sân)', capacity: 150, color: '#EF4444', x: 180, y: 260, w: 540, h: 100, rotation: 0 }
      ])
      toast.success('Đã áp dụng mẫu Concert Sân khấu T')
    } else if (presetType === 'FESTIVAL') {
      setStageConfig({ position: 'TOP', shape: 'SEMI_CIRCLE', color: '#10B981', label: 'SÂN KHẤU CHÍNH', x: 200, y: 10, w: 500, h: 90, rotation: 0 })
      setLayoutType('GRID')
      setGridConfig({ rows: 8, cols: 16 })
      generateGrid()
      setStandingAreas([
        { id: `std-${newLocalId()}`, name: 'Vùng Đứng GA (Festival)', capacity: 300, color: '#F59E0B', x: 160, y: 120, w: 580, h: 140, rotation: 0 }
      ])
      toast.success('Đã áp dụng mẫu Festival Hỗn hợp (Ghế + Đứng)')
    }
  }

  function handlePaintAt(pt) {
    if (tool === 'ADD' && layoutType !== 'GRID') {
      const pos = snapEnabled
        ? snapPoint(pt.x, pt.y, stageConfig.position)
        : { x: Math.round(pt.x), y: Math.round(pt.y) }
      const key = seatKey(pos.x, pos.y)
      if (paintVisited.current.has(key)) return
      paintVisited.current.add(key)

      setSeats((prev) => {
        if (prev.some((s) => seatKey(s.x, s.y) === key)) return prev
        if (prev.length >= 2000) return prev
        const num = seatCounter.current
        seatCounter.current += 1
        return [
          ...prev,
          {
            localId: newLocalId(),
            rowLabel: 'X',
            seatNumber: String(num),
            x: pos.x,
            y: pos.y,
            zoneLocalId: activeZoneId,
            isDisabled: false,
          },
        ]
      })
      return
    }

    if (tool === 'ERASE') {
      const hit = seatAtPoint(seatsRef.current, pt.x, pt.y)
      if (!hit) return
      setSeats((prev) => prev.filter((s) => s.localId !== hit.localId))
      setSelectedIds((sel) => {
        if (!sel.has(hit.localId)) return sel
        const next = new Set(sel)
        next.delete(hit.localId)
        return next
      })
      return
    }

    if (tool === 'DISABLE') {
      const hit = seatAtPoint(seatsRef.current, pt.x, pt.y)
      if (!hit) return
      setSeats((prev) =>
        prev.map((s) =>
          s.localId === hit.localId ? { ...s, isDisabled: !s.isDisabled } : s,
        ),
      )
      return
    }

    if (tool === 'PAINT' && activeZoneId) {
      const hit = seatAtPoint(seatsRef.current, pt.x, pt.y)
      if (!hit || hit.isDisabled) return
      setSeats((prev) =>
        prev.map((s) =>
          s.localId === hit.localId ? { ...s, zoneLocalId: activeZoneId } : s,
        ),
      )
    }
  }

  function handleMouseDown(e) {
    if (e.target !== svgRef.current && e.target.tagName !== 'svg') return
    const pt = toSVGPoint(e)

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      return
    }

    if (tool === 'ADD' || tool === 'ERASE' || tool === 'DISABLE' || tool === 'PAINT') {
      setIsPainting(true)
      paintVisited.current = new Set()
      handlePaintAt(pt)
      return
    }

    if (tool === 'SELECT') {
      if (!e.shiftKey) setSelectedIds(new Set())
      setRubberBand({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y })
      setSelectedShapeId(null)
    }
  }

  function handleStageMouseDown(e) {
    if (tool !== 'SELECT') return
    e.stopPropagation()
    setSelectedShapeId('STAGE')
    setSidebarTab('STAGE')
    setIsDraggingStage(true)
    const pt = toSVGPoint(e)

    let curX = stageConfig.x, curY = stageConfig.y, curW = stageConfig.w, curH = stageConfig.h
    if (stageConfig.position === 'TOP') { curX = 0; curY = 0; curW = 900; curH = 52 }
    else if (stageConfig.position === 'BOTTOM') { curX = 0; curY = 548; curW = 900; curH = 52 }
    else if (stageConfig.position === 'LEFT') { curX = 0; curY = 0; curW = 52; curH = 600 }
    else if (stageConfig.position === 'RIGHT') { curX = 848; curY = 0; curW = 52; curH = 600 }

    setStageDragOffset({ x: pt.x - curX, y: pt.y - curY })
    if (stageConfig.position !== 'CUSTOM') {
      setStageConfig((c) => ({ ...c, position: 'CUSTOM', x: curX, y: curY, w: curW, h: curH, rotation: c.rotation || 0 }))
    }
  }

  function handleStageDoubleClick(e) {
    e.stopPropagation()
    setRenameModalState({
      isOpen: true,
      title: 'Đổi tên Sân khấu',
      initialValue: stageConfig.label,
      onSave: (newName) => {
        setStageConfig((c) => ({ ...c, label: newName }))
        setRenameModalState({ isOpen: false })
      },
    })
  }

  function handleAuxMouseDown(e, aux) {
    if (tool !== 'SELECT') return
    e.stopPropagation()
    saveHistory()
    setSelectedShapeId(aux.id)
    setSelectedIds(new Set())
    setSidebarTab('STAGE')
    setDraggingAuxId(aux.id)
    const pt = toSVGPoint(e)
    setAuxDragOffset({ x: pt.x - aux.x, y: pt.y - aux.y })
  }

  function handleAuxDoubleClick(e, aux) {
    e.stopPropagation()
    setRenameModalState({
      isOpen: true,
      title: 'Đổi tên Vật thể phụ',
      initialValue: aux.label,
      onSave: (newName) => {
        saveHistory()
        setAuxElements((prev) => prev.map((a) => (a.id === aux.id ? { ...a, label: newName } : a)))
        setRenameModalState({ isOpen: false })
      },
    })
  }

  function handleStandingMouseDown(e, area) {
    if (tool !== 'SELECT') return
    e.stopPropagation()
    saveHistory()
    setSelectedShapeId(area.id)
    setSelectedIds(new Set())
    setSidebarTab('ZONES')
    setDraggingStandingId(area.id)
    const pt = toSVGPoint(e)
    setStandingDragOffset({ x: pt.x - area.x, y: pt.y - area.y })
  }

  function handleStandingDoubleClick(e, area) {
    e.stopPropagation()
    setRenameModalState({
      isOpen: true,
      title: 'Đổi tên Vùng đứng',
      initialValue: area.name,
      onSave: (newName) => {
        setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, name: newName } : a)))
        setRenameModalState({ isOpen: false })
      },
    })
  }

  function handleSeatMouseDown(e, seat) {
    e.stopPropagation()

    if (tool === 'ERASE') {
      if (selectedIds.size > 1 && selectedIds.has(seat.localId)) {
        deleteSelected()
      } else {
        setSeats((prev) => prev.filter((s) => s.localId !== seat.localId))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(seat.localId)
          return next
        })
      }
      return
    }

    if (tool === 'DISABLE') {
      if (selectedIds.size > 1 && selectedIds.has(seat.localId)) {
        disableSelected()
      } else {
        setSeats((prev) =>
          prev.map((s) =>
            s.localId === seat.localId ? { ...s, isDisabled: !s.isDisabled } : s,
          ),
        )
      }
      return
    }

    if (tool === 'PAINT' && activeZoneId) {
      const targets =
        selectedIds.has(seat.localId) && selectedIds.size > 1 ? selectedIds : new Set([seat.localId])
      setSeats((prev) =>
        prev.map((s) =>
          targets.has(s.localId) && !s.isDisabled ? { ...s, zoneLocalId: activeZoneId } : s,
        ),
      )
      return
    }

    if (tool === 'SELECT') {
      if (activeZoneId !== null) {
        const targets =
          selectedIds.has(seat.localId) && selectedIds.size > 1 ? selectedIds : new Set([seat.localId])
        setSeats((prev) =>
          prev.map((s) =>
            targets.has(s.localId) && !s.isDisabled ? { ...s, zoneLocalId: activeZoneId } : s,
          ),
        )
      } else {
        let next = new Set(selectedIds)
        if (e.shiftKey) {
          if (next.has(seat.localId)) next.delete(seat.localId)
          else next.add(seat.localId)
          setSelectedIds(next)
        } else {
          if (!next.has(seat.localId)) {
            next = new Set([seat.localId])
            setSelectedIds(next)
          }
        }
        setIsDraggingSeats(true)
        const pt = toSVGPoint(e)
        setSeatDragStartPt(pt)
        const origs = {}
        next.forEach((id) => {
          const found = seatsRef.current.find((s) => s.localId === id)
          if (found) origs[id] = { x: found.x, y: found.y }
        })
        setSeatDragOriginals(origs)
        setHasDraggedSeats(false)
      }
    }
  }

  function handleMouseMove(e) {
    if (isPanning && panStart) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      return
    }
    const pt = toSVGPoint(e)

    if (draggingHandle) {
      if (draggingHandle.type === 'RESIZE') {
        const dx = pt.x - draggingHandle.startPt.x
        const dy = pt.y - draggingHandle.startPt.y
        const rad = (draggingHandle.rotation * Math.PI) / 180
        const dw = dx * Math.cos(-rad) - dy * Math.sin(-rad)
        const dh = dx * Math.sin(-rad) + dy * Math.cos(-rad)
        const newW = Math.max(30, draggingHandle.startW + Math.round(dw))
        const newH = Math.max(20, draggingHandle.startH + Math.round(dh))

        if (draggingHandle.elementId === 'STAGE') {
          setStageConfig((c) => ({ ...c, w: newW, h: newH }))
        } else if (draggingHandle.elementId.startsWith('std-')) {
          setStandingAreas((prev) => prev.map((a) => (a.id === draggingHandle.elementId ? { ...a, w: newW, h: newH } : a)))
        } else {
          setAuxElements((prev) => prev.map((a) => (a.id === draggingHandle.elementId ? { ...a, w: newW, h: newH } : a)))
        }
      } else if (draggingHandle.type === 'ROTATE') {
        const anglePt = Math.atan2(pt.y - draggingHandle.cy, pt.x - draggingHandle.cx) * (180 / Math.PI)
        const angleStart = Math.atan2(draggingHandle.startPt.y - draggingHandle.cy, draggingHandle.startPt.x - draggingHandle.cx) * (180 / Math.PI)
        const deltaAngle = anglePt - angleStart
        const newRot = Math.round(draggingHandle.startRot + deltaAngle)

        if (draggingHandle.elementId === 'STAGE') {
          setStageConfig((c) => ({ ...c, rotation: newRot }))
        } else if (draggingHandle.elementId.startsWith('std-')) {
          setStandingAreas((prev) => prev.map((a) => (a.id === draggingHandle.elementId ? { ...a, rotation: newRot } : a)))
        } else {
          setAuxElements((prev) => prev.map((a) => (a.id === draggingHandle.elementId ? { ...a, rotation: newRot } : a)))
        }
      }
      return
    }

    if (draggingStandingId) {
      setStandingAreas((prev) => prev.map(a =>
        a.id === draggingStandingId ? { ...a, x: Math.round(pt.x - standingDragOffset.x), y: Math.round(pt.y - standingDragOffset.y) } : a
      ))
      return
    }

    if (draggingAuxId) {
      setAuxElements((prev) => prev.map(a =>
        a.id === draggingAuxId ? { ...a, x: Math.round(pt.x - auxDragOffset.x), y: Math.round(pt.y - auxDragOffset.y) } : a
      ))
      return
    }

    if (isDraggingStage) {
      setStageConfig((c) => ({
        ...c,
        x: Math.round(pt.x - stageDragOffset.x),
        y: Math.round(pt.y - stageDragOffset.y),
      }))
      return
    }

    if (isDraggingSeats && seatDragStartPt) {
      setHasDraggedSeats(true)
      const dx = pt.x - seatDragStartPt.x
      const dy = pt.y - seatDragStartPt.y

      let snappedDx = dx, snappedDy = dy
      if (snapEnabled) {
        snappedDx = Math.round(dx / SNAP_X) * SNAP_X
        snappedDy = Math.round(dy / SNAP_Y) * SNAP_Y
      }

      setSeats((prev) =>
        prev.map((s) => {
          if (seatDragOriginals[s.localId]) {
            return {
              ...s,
              x: Math.max(0, seatDragOriginals[s.localId].x + snappedDx),
              y: Math.max(0, seatDragOriginals[s.localId].y + snappedDy),
            }
          }
          return s
        }),
      )
      return
    }

    if (isPainting) {
      handlePaintAt(pt)
      return
    }

    if (rubberBand) {
      setRubberBand((rb) => (rb ? { ...rb, x2: pt.x, y2: pt.y } : null))
    }
  }

  function handleMouseUp() {
    setIsPanning(false)
    setPanStart(null)
    setIsPainting(false)
    setIsDraggingStage(false)
    setDraggingAuxId(null)
    setDraggingStandingId(null)
    setDraggingHandle(null)

    if (isDraggingSeats) {
      setIsDraggingSeats(false)
      setSeatDragStartPt(null)
      setSeatDragOriginals({})
    }

    paintVisited.current = new Set()

    if (rubberBand) {
      const inRect = seatsInRect(seats, rubberBand.x1, rubberBand.y1, rubberBand.x2, rubberBand.y2)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        inRect.forEach((s) => next.add(s.localId))
        return next
      })
      setRubberBand(null)
    }
  }

  function handleWheel(e) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom((z) => Math.min(2.5, Math.max(0.4, z * factor)))
  }

  async function handleSave() {
    if (!mapName.trim()) {
      const message = 'Vui lòng nhập tên sơ đồ ghế.'
      setError(message)
      toast.error(message)
      return
    }

    let seatsToSave = seats
    if (layoutType === 'GRID' && seatsToSave.length === 0 && gridConfig.rows > 0 && gridConfig.cols > 0) {
      const generated = []
      const startY = stageConfig.position === 'TOP' ? STAGE_OFFSET_Y : 20
      const startX = stageConfig.position === 'LEFT' ? STAGE_OFFSET_Y : 20
      for (let r = 0; r < gridConfig.rows; r += 1) {
        const rowLabel = rowLabelForIndex(r)
        for (let c = 0; c < gridConfig.cols; c += 1) {
          generated.push({
            localId: newLocalId(),
            rowLabel,
            seatNumber: String(c + 1),
            x: startX + c * SNAP_X,
            y: startY + r * SNAP_Y,
            zoneLocalId: null,
            isDisabled: false,
          })
        }
      }
      seatsToSave = generated
      setSeats(generated)
    }

    if (seatsToSave.length > 2000) {
      const message = 'Tối đa 2000 ghế mỗi sơ đồ.'
      setError(message)
      toast.error(message)
      return
    }

    const zoneIndexMap = {}
    zones.forEach((z, i) => {
      zoneIndexMap[z.localId] = i
    })

    const normalizedSeats = normalizeSeatsForSave(seatsToSave)

    const payload = {
      name: mapName,
      layout_type: layoutType,
      canvas_width: 900,
      canvas_height: 600,
      config: {
        stageLabel: stageConfig.label,
        stagePosition: stageConfig.position,
        stageShape: stageConfig.shape || 'RECTANGLE',
        stageColor: stageConfig.color || '#3B82F6',
        stageX: Math.round(stageConfig.x),
        stageY: Math.round(stageConfig.y),
        stageWidth: Math.round(stageConfig.w),
        stageHeight: Math.round(stageConfig.h),
        stageRotation: stageConfig.rotation || 0,
        auxiliaryElements: auxElements,
        standingAreas: standingAreas,
        canvasBg: canvasBg || '#0F172A',
      },
      rows_count: gridConfig.rows,
      cols_count: gridConfig.cols,
      zones: zones.map((z, i) => ({ name: z.name, color: z.color, sort_order: i })),
      seats: normalizedSeats.map((s) => ({
        row_label: s.rowLabel,
        seat_number: s.seatNumber,
        x_position: Math.round(s.x),
        y_position: Math.round(s.y),
        zone_index: s.zoneLocalId != null ? zoneIndexMap[s.zoneLocalId] ?? null : null,
        is_disabled: s.isDisabled,
      })),
    }

    setSaving(true)
    setError(null)
    try {
      const result = seatMapId
        ? await updateSeatMap(seatMapId, payload)
        : await createSeatMap(venueId, payload)
      onSave(result)
    } catch (err) {
      console.error(err)
      const message = getApiMessage(err, 'Không thể lưu sơ đồ ghế.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const visibleTools = TOOLS.filter((t) => !(t.freeformOnly && layoutType === 'GRID'))

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted">Đang tải sơ đồ ghế...</p>
        </div>
      </div>
    )
  }

  const cursorStyle = isPanning
    ? 'grabbing'
    : tool === 'ADD'
      ? 'crosshair'
      : tool === 'ERASE'
        ? 'not-allowed'
        : tool === 'PAINT'
          ? 'copy'
          : 'default'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-content">
      <RenameModal
        {...renameModalState}
        onClose={() => setRenameModalState({ isOpen: false, title: '', initialValue: '', onSave: null })}
      />

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-soft/30 bg-surface/90 px-4 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-3 py-1.5 text-sm font-semibold text-muted transition hover:bg-panel-soft hover:text-content"
        >
          ← Đóng
        </button>
        <div className="h-6 w-px bg-border-soft/20" />
        <input
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="Tên sơ đồ ghế..."
          className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold text-content outline-none placeholder:text-muted"
        />
        <div className="hidden items-center gap-3 sm:flex">
          <span className="rounded-xl bg-panel-soft border border-border-soft/20 px-3 py-1 text-xs font-semibold text-content">
            {stats.active} ghế ngồi · {stats.standingCap} chỗ đứng · {stats.totalCap} tổng chỗ
          </span>
          {stats.total > 1800 && (
            <span className="text-xs font-medium text-warning animate-pulse">Gần giới hạn 2000</span>
          )}
        </div>

        <button type="button" onClick={handleSave} disabled={saving} className="org-btn-primary min-w-[100px]">
          {saving ? 'Đang lưu...' : 'Lưu sơ đồ'}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-border-soft/30 bg-surface/90 backdrop-blur-sm text-content overflow-hidden">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 border-b border-border-soft/30 bg-panel-soft/30 p-1">
            {[
              { id: 'STAGE', label: 'Sân khấu', icon: Shapes },
              { id: 'ZONES', label: 'Khu vực', icon: Users },
              { id: 'GRID', label: 'Lưới ghế', icon: Grid },
              { id: 'THEMES', label: 'Giao diện', icon: Palette },
            ].map((tab) => {
              const IconComp = tab.icon
              const active = sidebarTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id)}
                  className={`flex flex-col items-center gap-1 py-2 text-[10px] font-bold rounded-lg transition-all ${
                    active ? 'bg-tertiary text-white shadow-sm' : 'text-subtle hover:text-content hover:bg-panel-soft'
                  }`}
                >
                  <IconComp className="size-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: SÂN KHẤU & PRESETS */}
            {sidebarTab === 'STAGE' && (
              <div className="space-y-4">
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-1.5">
                    <Shapes className="size-3.5 text-tertiary" /> Cấu hình sân khấu
                  </p>
                  <label className="text-xs text-subtle block">
                    Tên hiển thị
                    <input
                      type="text"
                      value={stageConfig.label}
                      onChange={(e) => setStageConfig((c) => ({ ...c, label: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-sm font-bold text-content outline-none focus:border-primary"
                    />
                  </label>

                  <label className="text-xs text-subtle block">
                    Hình dạng khối sân khấu
                    <select
                      value={stageConfig.shape || 'RECTANGLE'}
                      onChange={(e) => setStageConfig((c) => ({ ...c, shape: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-sm text-content outline-none focus:border-primary"
                    >
                      {STAGE_SHAPES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.icon} {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <label className="text-xs text-subtle block mb-1">Màu sắc sân khấu</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={stageConfig.color || '#3B82F6'}
                        onChange={(e) => setStageConfig((c) => ({ ...c, color: e.target.value }))}
                        className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <div className="flex flex-wrap gap-1">
                        {['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#64748B'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setStageConfig((c) => ({ ...c, color: hex }))}
                            className="size-5 rounded-full border border-white/20 transition-transform hover:scale-110"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="text-xs text-subtle block">
                    Vị trí
                    <select
                      value={stageConfig.position}
                      onChange={(e) => setStageConfig((c) => ({ ...c, position: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-sm text-content outline-none focus:border-primary"
                    >
                      <option value="TOP">Bên trên</option>
                      <option value="BOTTOM">Bên dưới</option>
                      <option value="LEFT">Trái</option>
                      <option value="RIGHT">Phải</option>
                      <option value="CUSTOM">Tuỳ chỉnh (Kéo thả)</option>
                      <option value="HIDDEN">Ẩn sân khấu</option>
                    </select>
                  </label>

                  {stageConfig.position === 'CUSTOM' && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <label className="text-[11px] text-subtle">
                        Ngang
                        <input type="number" value={stageConfig.w} onChange={(e) => setStageConfig(c => ({ ...c, w: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-border-soft/40 bg-surface px-1 py-1 text-xs text-content outline-none focus:border-primary" />
                      </label>
                      <label className="text-[11px] text-subtle">
                        Dọc
                        <input type="number" value={stageConfig.h} onChange={(e) => setStageConfig(c => ({ ...c, h: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-border-soft/40 bg-surface px-1 py-1 text-xs text-content outline-none focus:border-primary" />
                      </label>
                      <label className="text-[11px] text-subtle">
                        Xoay (°)
                        <input type="number" value={stageConfig.rotation || 0} onChange={(e) => setStageConfig(c => ({ ...c, rotation: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-border-soft/40 bg-surface px-1 py-1 text-xs text-content outline-none focus:border-primary" />
                      </label>
                    </div>
                  )}
                </section>

                {/* Mẫu có sẵn */}
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-tertiary" /> Mẫu thiết kế nhanh
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button type="button" onClick={() => applyPreset('THEATER')} className="flex items-center justify-between rounded-xl border border-border-soft/30 bg-surface p-2.5 text-xs font-semibold text-content hover:border-tertiary transition">
                      <span>🎭 Nhà hát / Hội trường</span>
                      <span className="text-[10px] text-muted">Vuông + 200 ghế</span>
                    </button>
                    <button type="button" onClick={() => applyPreset('T_STAGE')} className="flex items-center justify-between rounded-xl border border-border-soft/30 bg-surface p-2.5 text-xs font-semibold text-content hover:border-tertiary transition">
                      <span>🎤 Concert Sân khấu T</span>
                      <span className="text-[10px] text-muted">Sân T + Đứng + Ghế</span>
                    </button>
                    <button type="button" onClick={() => applyPreset('FESTIVAL')} className="flex items-center justify-between rounded-xl border border-border-soft/30 bg-surface p-2.5 text-xs font-semibold text-content hover:border-tertiary transition">
                      <span>🔥 Festival Hỗn hợp</span>
                      <span className="text-[10px] text-muted">Bán nguyệt + Vùng đứng</span>
                    </button>
                  </div>
                </section>

                {/* Aux elements */}
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Vật thể phụ khác</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setAuxElements(p => [...p, { id: newLocalId(), type: 'AUX_STAGE', label: 'Sân khấu phụ', x: 300, y: 300, w: 180, h: 40 }])}
                      className="flex items-center gap-1.5 p-2 rounded-xl border border-border-soft/40 hover:bg-panel-soft transition justify-center text-xs font-semibold bg-surface text-content shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 text-tertiary" /> Sân phụ
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuxElements(p => [...p, { id: newLocalId(), type: 'SCREEN', label: 'Màn hình LED', x: 300, y: 300, w: 120, h: 20 }])}
                      className="flex items-center gap-1.5 p-2 rounded-xl border border-border-soft/40 hover:bg-panel-soft transition justify-center text-xs font-semibold bg-surface text-content shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 text-tertiary" /> Màn hình
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {auxElements.map(a => (
                      <div key={a.id} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-surface border border-border-soft/30 text-content shadow-sm">
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={a.label}
                            onChange={(e) => setAuxElements(p => p.map(x => x.id === a.id ? { ...x, label: e.target.value } : x))}
                            className="bg-transparent font-bold px-1 w-32 outline-none border-b border-border-soft/40 focus:border-tertiary text-xs"
                          />
                          <button type="button" onClick={() => setAuxElements(p => p.filter(x => x.id !== a.id))} title="Xóa" className="p-1 hover:bg-panel-soft rounded text-muted hover:text-error transition"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* TAB 2: KHU VỰC & VÙNG ĐỨNG */}
            {sidebarTab === 'ZONES' && (
              <div className="space-y-4">
                {/* Vùng đứng không ghế */}
                <section className="rounded-xl border border-tertiary/30 p-3.5 bg-tertiary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-tertiary flex items-center gap-1.5">
                      <Users className="size-3.5" /> Vùng đứng (Không ghế)
                    </p>
                    <button type="button" onClick={addStandingArea} className="org-btn-primary text-xs py-1 px-2.5">
                      + Thêm vùng đứng
                    </button>
                  </div>
                  <p className="text-[11px] text-subtle leading-relaxed">
                    Tạo các khu vực vé đứng tự do (GA Standing, VIP Standing...). Khách hàng mua vé vùng này sẽ không cần chọn từng số ghế.
                  </p>

                  <div className="space-y-2">
                    {standingAreas.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted border border-dashed border-border-soft/30 rounded-xl">Chưa có vùng đứng nào</p>
                    )}
                    {standingAreas.map((area) => (
                      <div key={area.id} className="p-3 rounded-xl bg-surface border border-border-soft/40 shadow-sm space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={area.name}
                            onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, name: e.target.value } : a)))}
                            className="bg-transparent font-bold text-xs text-content outline-none border-b border-border-soft/40 focus:border-tertiary w-full"
                          />
                          <input
                            type="color"
                            value={area.color || '#EF4444'}
                            onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, color: e.target.value } : a)))}
                            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <button type="button" onClick={() => deleteStandingArea(area.id)} className="text-muted hover:text-error transition"><Trash2 className="size-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-subtle">
                            Sức chứa (người)
                            <input
                              type="number"
                              min={1}
                              value={area.capacity}
                              onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, capacity: Number(e.target.value) } : a)))}
                              className="mt-0.5 w-full rounded-lg border border-border-soft/40 bg-panel-soft px-2 py-1 text-xs text-content outline-none focus:border-primary font-bold"
                            />
                          </label>
                          <label className="text-[10px] text-subtle">
                            Kích thước (W×H)
                            <div className="flex items-center gap-1 mt-0.5">
                              <input type="number" value={area.w} onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, w: Number(e.target.value) } : a)))} className="w-1/2 rounded-lg border border-border-soft/40 bg-panel-soft px-1 py-1 text-[11px] text-content" />
                              <input type="number" value={area.h} onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, h: Number(e.target.value) } : a)))} className="w-1/2 rounded-lg border border-border-soft/40 bg-panel-soft px-1 py-1 text-[11px] text-content" />
                            </div>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Khu vực ghế ngồi */}
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-1.5">
                      <Layers className="size-3.5 text-tertiary" /> Khu vực vé (Ghế ngồi)
                    </p>
                    <button type="button" onClick={addZone} className="text-xs font-bold text-primary hover:underline">
                      + Thêm khu vực
                    </button>
                  </div>
                  <div className="space-y-2">
                    {zones.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted">Chưa có khu vực ghế nào</p>
                    )}
                    {zones.map((zone) => {
                      const count = seats.filter((s) => s.zoneLocalId === zone.localId).length
                      const isActive = activeZoneId === zone.localId
                      return (
                        <div
                          key={zone.localId}
                          onClick={() => setActiveZoneId(isActive ? null : zone.localId)}
                          className={`flex items-center justify-between rounded-xl border p-2.5 transition cursor-pointer ${
                            isActive
                              ? 'border-tertiary bg-tertiary/10 shadow-sm'
                              : 'border-border-soft/30 bg-surface hover:border-border-soft/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="color"
                              value={zone.color}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setZones((prev) =>
                                  prev.map((z) => (z.localId === zone.localId ? { ...z, color: e.target.value } : z)),
                                )
                              }
                              className="h-6 w-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
                            />
                            <input
                              type="text"
                              value={zone.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setZones((prev) =>
                                  prev.map((z) => (z.localId === zone.localId ? { ...z, name: e.target.value } : z)),
                                )
                              }
                              className="bg-transparent font-bold text-xs text-content outline-none border-b border-transparent focus:border-tertiary truncate flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-subtle">{count} ghế</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteZone(zone.localId)
                              }}
                              className="text-muted hover:text-error transition p-1"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* TAB 3: QUẢN LÝ LƯỚI GHẾ */}
            {sidebarTab === 'GRID' && (
              <div className="space-y-4">
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-1.5">
                    <Grid className="size-3.5 text-tertiary" /> Loại Layout & Tạo lưới
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      ['GRID', 'Lưới cố định'],
                      ['FREEFORM', 'Vẽ tự do'],
                      ['MIXED', 'Hỗn hợp'],
                    ].map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setLayoutType(type)}
                        className={`rounded-xl px-2 py-2 text-xs font-bold transition-all ${
                          layoutType === type
                            ? 'bg-tertiary text-white shadow-sm'
                            : 'bg-panel-soft text-subtle hover:bg-panel-soft/80'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {layoutType === 'GRID' && (
                    <div className="space-y-2 pt-2 border-t border-border-soft/20">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-subtle">
                          Số Hàng
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={gridConfig.rows}
                            onChange={(e) => setGridConfig((g) => ({ ...g, rows: Number(e.target.value) }))}
                            className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-sm text-content outline-none focus:border-primary"
                          />
                        </label>
                        <label className="text-xs text-subtle">
                          Số Cột
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={gridConfig.cols}
                            onChange={(e) => setGridConfig((g) => ({ ...g, cols: Number(e.target.value) }))}
                            className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-sm text-content outline-none focus:border-primary"
                          />
                        </label>
                      </div>
                      <button type="button" onClick={generateGrid} className="org-btn-primary w-full text-xs">
                        Tạo lại lưới ghế ({gridConfig.rows * gridConfig.cols} ghế)
                      </button>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Thao tác nhanh ghế</p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set(seats.map((s) => s.localId)))}
                      className="rounded-xl border border-border-soft/30 bg-surface py-2 text-xs font-semibold text-content hover:bg-panel-soft transition"
                    >
                      Chọn tất cả ghế ({seats.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="rounded-xl border border-border-soft/30 bg-surface py-2 text-xs font-semibold text-content hover:bg-panel-soft transition"
                    >
                      Bỏ chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={disableSelected}
                      disabled={!selectedIds.size}
                      className="rounded-xl border border-error/30 bg-error/10 py-2 text-xs font-bold text-error hover:bg-error/20 transition disabled:opacity-50"
                    >
                      Vô hiệu hóa ({selectedIds.size}) ghế đang chọn
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 4: GIAO DIỆN & NỀN */}
            {sidebarTab === 'THEMES' && (
              <div className="space-y-4">
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-1.5">
                    <Palette className="size-3.5 text-tertiary" /> Màu nền Canvas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {CANVAS_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCanvasBg(t.color)}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition ${
                          canvasBg === t.color ? 'border-tertiary ring-2 ring-tertiary/20' : 'border-border-soft/30'
                        }`}
                        style={{ backgroundColor: t.color, color: t.light ? '#0F172A' : '#FFFFFF' }}
                      >
                        <div className="size-4 rounded-full border border-white/20" style={{ backgroundColor: t.color }} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-border-soft/20 flex items-center justify-between">
                    <span className="text-xs text-subtle">Màu tự chọn:</span>
                    <input
                      type="color"
                      value={canvasBg}
                      onChange={(e) => setCanvasBg(e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-content">
                    <input
                      type="checkbox"
                      checked={snapEnabled}
                      onChange={(e) => setSnapEnabled(e.target.checked)}
                      className="rounded border-border-soft/40 bg-panel-soft accent-primary"
                    />
                    Căn chỉnh Lưới Snap (Snap to Grid)
                  </label>
                  <p className="text-[11px] leading-relaxed text-subtle">
                    Tự động hít vị trí ghế & vật thể theo ô lưới khi kéo thả.
                  </p>
                </section>
              </div>
            )}
          </div>
        </aside>

        {/* Main Canvas Container */}
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {/* Floating Toolbar */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-2xl border border-border-soft/40 bg-surface/90 p-1.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1 border-r border-border-soft/30 pr-2">
              {visibleTools.map((t) => {
                const IconComp = t.icon
                const isActive = tool === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTool(t.id)}
                    title={`${t.label} (${t.shortcut})`}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-tertiary text-white shadow-md'
                        : 'text-subtle hover:bg-panel-soft hover:text-content'
                    }`}
                  >
                    <IconComp className="size-4" />
                    <span className="hidden md:inline">{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Quick Actions: Undo, Select All, Copy, Paste */}
            <div className="flex items-center gap-1 border-r border-border-soft/30 pr-2">
              <button
                type="button"
                onClick={undo}
                title="Hoàn tác (Ctrl+Z)"
                className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-subtle hover:bg-panel-soft hover:text-content transition-all"
              >
                <RotateCcw className="size-4" />
                <span className="hidden lg:inline">Undo</span>
              </button>
              <button
                type="button"
                onClick={selectAll}
                title="Chọn tất cả ghế (Ctrl+A)"
                className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-subtle hover:bg-panel-soft hover:text-content transition-all"
              >
                <CheckSquare className="size-4" />
                <span className="hidden lg:inline">Chọn hết</span>
              </button>
              <button
                type="button"
                onClick={copySelected}
                title="Sao chép (Ctrl+C)"
                className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-subtle hover:bg-panel-soft hover:text-content transition-all"
              >
                <Copy className="size-4" />
                <span className="hidden lg:inline">Copy</span>
              </button>
              <button
                type="button"
                onClick={pasteCopied}
                title="Dán (Ctrl+V)"
                className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-subtle hover:bg-panel-soft hover:text-content transition-all"
              >
                <ClipboardPaste className="size-4" />
                <span className="hidden lg:inline">Paste</span>
              </button>
            </div>

            {/* Quick Paint zone selector */}
            {(tool === 'PAINT' || tool === 'SELECT') && zones.length > 0 && (
              <div className="flex items-center gap-1.5 pl-1">
                <span className="text-[11px] font-bold text-subtle hidden lg:inline">Tô khu vực:</span>
                <div className="flex items-center gap-1">
                  {zones.map((z) => (
                    <button
                      key={z.localId}
                      type="button"
                      onClick={() => {
                        setActiveZoneId(z.localId)
                        if (selectedIds.size > 0) applyZoneToSelected(z.localId)
                      }}
                      title={z.name}
                      className={`size-6 rounded-full border-2 transition-transform ${
                        activeZoneId === z.localId ? 'scale-115 border-white shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: z.color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Edit Popup Inspector on Selection */}
          {selectedShapeId && (() => {
            if (selectedShapeId === 'STAGE') {
              return (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-3 rounded-2xl border border-primary/40 bg-surface/95 p-3 shadow-2xl backdrop-blur-md">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">⚡ Chỉnh sửa Sân khấu</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={stageConfig.label}
                        onChange={(e) => setStageConfig((c) => ({ ...c, label: e.target.value }))}
                        placeholder="Nhập tên sân khấu..."
                        className="rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-xs font-bold text-content outline-none focus:border-primary w-48 shadow-inner"
                        autoFocus
                      />
                      <input
                        type="color"
                        value={stageConfig.color || '#3B82F6'}
                        onChange={(e) => setStageConfig((c) => ({ ...c, color: e.target.value }))}
                        className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        title="Đổi màu sân khấu"
                      />
                      <select
                        value={stageConfig.shape || 'RECTANGLE'}
                        onChange={(e) => setStageConfig((c) => ({ ...c, shape: e.target.value }))}
                        className="rounded-xl border border-border-soft/40 bg-panel-soft px-2 py-1.5 text-xs font-bold text-content outline-none focus:border-primary"
                      >
                        {STAGE_SHAPES.map((s) => (
                          <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setSelectedShapeId(null)} className="text-muted hover:text-content text-xs font-bold px-1.5 py-1">✕</button>
                    </div>
                  </div>
                </div>
              )
            }

            const standingItem = standingAreas.find((a) => a.id === selectedShapeId)
            if (standingItem) {
              return (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-3 rounded-2xl border border-tertiary/40 bg-surface/95 p-3 shadow-2xl backdrop-blur-md">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-tertiary">⚡ Chỉnh sửa Vùng đứng</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={standingItem.name}
                        onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === standingItem.id ? { ...a, name: e.target.value } : a)))}
                        placeholder="Tên vùng đứng..."
                        className="rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-xs font-bold text-content outline-none focus:border-tertiary w-44 shadow-inner"
                        autoFocus
                      />
                      <label className="text-[10px] font-bold text-subtle flex items-center gap-1">
                        Sức chứa:
                        <input
                          type="number"
                          min={1}
                          value={standingItem.capacity}
                          onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === standingItem.id ? { ...a, capacity: Number(e.target.value) } : a)))}
                          className="w-16 rounded-xl border border-border-soft/40 bg-panel-soft px-2 py-1 text-xs font-bold text-content outline-none focus:border-tertiary"
                        />
                      </label>
                      <input
                        type="color"
                        value={standingItem.color || '#EF4444'}
                        onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === standingItem.id ? { ...a, color: e.target.value } : a)))}
                        className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        title="Màu đại diện"
                      />
                      <button type="button" onClick={() => deleteStandingArea(standingItem.id)} className="text-error hover:bg-error/10 p-1.5 rounded-lg transition" title="Xóa vùng đứng"><Trash2 className="size-3.5" /></button>
                      <button type="button" onClick={() => setSelectedShapeId(null)} className="text-muted hover:text-content text-xs font-bold px-1.5 py-1">✕</button>
                    </div>
                  </div>
                </div>
              )
            }

            const auxItem = auxElements.find((a) => a.id === selectedShapeId)
            if (auxItem) {
              return (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-3 rounded-2xl border border-border-soft/40 bg-surface/95 p-3 shadow-2xl backdrop-blur-md">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">⚡ Chỉnh sửa Vật thể phụ</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={auxItem.label}
                        onChange={(e) => setAuxElements((prev) => prev.map((a) => (a.id === auxItem.id ? { ...a, label: e.target.value } : a)))}
                        placeholder="Tên vật thể..."
                        className="rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-xs font-bold text-content outline-none focus:border-primary w-48 shadow-inner"
                        autoFocus
                      />
                      <button type="button" onClick={() => setAuxElements((prev) => prev.filter((a) => a.id !== auxItem.id))} className="text-error hover:bg-error/10 p-1.5 rounded-lg transition" title="Xóa"><Trash2 className="size-3.5" /></button>
                      <button type="button" onClick={() => setSelectedShapeId(null)} className="text-muted hover:text-content text-xs font-bold px-1.5 py-1">✕</button>
                    </div>
                  </div>
                </div>
              )
            }

            return null
          })()}

          {/* Floating Zoom Controls */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-2xl border border-border-soft/40 bg-surface/90 p-1.5 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              className="rounded-xl p-2 text-subtle hover:bg-panel-soft hover:text-content transition"
              title="Phóng to"
            >
              <ZoomIn className="size-4" />
            </button>
            <span className="px-2 text-xs font-bold text-content">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              className="rounded-xl p-2 text-subtle hover:bg-panel-soft hover:text-content transition"
              title="Thu nhỏ"
            >
              <ZoomOut className="size-4" />
            </button>
            <div className="h-4 w-px bg-border-soft/30 mx-1" />
            <button
              type="button"
              onClick={() => { setZoom(1); setPan({ x: 40, y: 80 }); }}
              className="rounded-xl px-2.5 py-1 text-xs font-bold text-subtle hover:bg-panel-soft hover:text-content transition"
            >
              100%
            </button>
          </div>

          {/* Selection Action Bar for Seats */}
          {selectedIds.size > 0 && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-3 rounded-2xl border border-tertiary/30 bg-surface/95 px-4 py-2 shadow-2xl backdrop-blur-md">
              <span className="text-xs font-bold text-content">
                Đã chọn <span className="text-tertiary font-extrabold">{selectedIds.size}</span> ghế
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={disableSelected}
                  className="flex items-center gap-1 rounded-xl border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning hover:bg-warning/20 transition"
                >
                  <Ban className="size-3.5" />
                  Vô hiệu
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="flex items-center gap-1 rounded-xl border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-bold text-error hover:bg-error/20 transition"
                >
                  <Trash2 className="size-3.5" />
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs font-bold text-subtle hover:text-content px-2"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}

          {/* SVG Canvas */}
          <div
            className="relative flex-1 overflow-hidden"
            style={{
              backgroundColor: canvasBg,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            }}
            onWheel={handleWheel}
          >
            <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-xl bg-surface/90 border border-border-soft/30 px-3 py-1.5 text-[11px] font-medium text-subtle shadow-lg backdrop-blur">
              <Hand className="size-3.5 text-tertiary" />
              Click khối để sửa tên trực tiếp · Giữ <b>Alt</b> + kéo chuột để di chuyển
            </div>

            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: cursorStyle }}
            >
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Stage */}
                {(() => {
                  if (stageConfig.position === 'HIDDEN') return null
                  let x = 0, y = 0, w = 900, h = 52
                  if (stageConfig.position === 'CUSTOM') {
                    x = stageConfig.x
                    y = stageConfig.y
                    w = stageConfig.w
                    h = stageConfig.h
                  } else if (stageConfig.position === 'BOTTOM') {
                    y = 548
                  } else if (stageConfig.position === 'LEFT') {
                    w = 52
                    h = 600
                  } else if (stageConfig.position === 'RIGHT') {
                    x = 848
                    w = 52
                    h = 600
                  }

                  const isSelected = selectedShapeId === 'STAGE'

                  return (
                    <g
                      key="stage-group"
                      onMouseDown={handleStageMouseDown}
                      onDoubleClick={handleStageDoubleClick}
                      style={{ cursor: tool === 'SELECT' ? 'move' : 'default' }}
                      transform={stageConfig.rotation ? `rotate(${stageConfig.rotation}, ${x + w / 2}, ${y + h / 2})` : undefined}
                    >
                      {renderStageShapeBody(x, y, w, h, stageConfig.shape, stageConfig.color, stageConfig.label, stageConfig.position)}

                      {isSelected && (
                        <>
                          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 30} stroke="#3B82F6" strokeWidth={2} />
                          <circle
                            cx={x + w / 2} cy={y - 30} r={6} fill="white" stroke="#3B82F6" strokeWidth={2}
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setDraggingHandle({ type: 'ROTATE', elementId: 'STAGE', cx: x + w / 2, cy: y + h / 2, startRot: stageConfig.rotation || 0, startPt: toSVGPoint(e) })
                            }}
                          />
                          <circle
                            cx={x + w} cy={y + h} r={6} fill="white" stroke="#3B82F6" strokeWidth={2}
                            style={{ cursor: 'nwse-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setDraggingHandle({ type: 'RESIZE', elementId: 'STAGE', startW: w, startH: h, startPt: toSVGPoint(e), cx: x + w / 2, cy: y + h / 2, rotation: stageConfig.rotation || 0 })
                            }}
                          />
                          <rect x={x} y={y} width={w} height={h} rx={12} fill="none" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 4" pointerEvents="none" />
                        </>
                      )}
                    </g>
                  )
                })()}

                {/* Standing Areas (Vùng đứng không ghế) */}
                {standingAreas.map((area) => {
                  const isSelected = selectedShapeId === area.id
                  const { id, name, capacity, color, x, y, w, h, rotation } = area
                  const fillColor = color || '#EF4444'

                  return (
                    <g
                      key={id}
                      transform={rotation ? `rotate(${rotation}, ${x + w / 2}, ${y + h / 2})` : undefined}
                      onMouseDown={(e) => handleStandingMouseDown(e, area)}
                      onDoubleClick={(e) => handleStandingDoubleClick(e, area)}
                      style={{ cursor: tool === 'SELECT' ? 'move' : 'default' }}
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

                      {isSelected && (
                        <>
                          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 30} stroke="#3B82F6" strokeWidth={2} />
                          <circle
                            cx={x + w / 2} cy={y - 30} r={6} fill="white" stroke="#3B82F6" strokeWidth={2}
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setDraggingHandle({ type: 'ROTATE', elementId: id, cx: x + w / 2, cy: y + h / 2, startRot: rotation || 0, startPt: toSVGPoint(e) })
                            }}
                          />
                          <circle
                            cx={x + w} cy={y + h} r={6} fill="white" stroke="#3B82F6" strokeWidth={2}
                            style={{ cursor: 'nwse-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setDraggingHandle({ type: 'RESIZE', elementId: id, startW: w, startH: h, startPt: toSVGPoint(e), cx: x + w / 2, cy: y + h / 2, rotation: rotation || 0 })
                            }}
                          />
                          <rect x={x} y={y} width={w} height={h} rx={12} fill="none" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 4" pointerEvents="none" />
                        </>
                      )}
                    </g>
                  )
                })}

                {/* Aux Elements */}
                {auxElements.map((a) => (
                  <g
                    key={a.id}
                    onMouseDown={(e) => handleAuxMouseDown(e, a)}
                    onDoubleClick={(e) => handleAuxDoubleClick(e, a)}
                    style={{ cursor: tool === 'SELECT' ? 'move' : 'default' }}
                    transform={a.rotation ? `rotate(${a.rotation}, ${a.x + a.w / 2}, ${a.y + a.h / 2})` : undefined}
                  >
                    <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="var(--color-panel-soft)" rx={Math.min(a.w, a.h) > 20 ? 8 : 4} stroke="var(--color-border-soft)" strokeWidth={2} />
                    <text
                      x={a.x + a.w / 2}
                      y={a.y + a.h / 2 + 5}
                      textAnchor="middle"
                      fill="var(--color-content)"
                      fontSize={12}
                      fontWeight="bold"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {a.label}
                    </text>

                    {selectedShapeId === a.id && (
                      <>
                        <line x1={a.x + a.w / 2} y1={a.y} x2={a.x + a.w / 2} y2={a.y - 30} stroke="#3B82F6" strokeWidth={2} />
                        <circle
                          cx={a.x + a.w / 2} cy={a.y - 30} r={6} fill="white" stroke="#3B82F6" strokeWidth={2}
                          style={{ cursor: 'pointer' }}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            setDraggingHandle({ type: 'ROTATE', elementId: a.id, cx: a.x + a.w / 2, cy: a.y + a.h / 2, startRot: a.rotation || 0, startPt: toSVGPoint(e) })
                          }}
                        />
                        <circle
                          cx={a.x + a.w} cy={a.y + a.h} r={6} fill="white" stroke="#3B82F6" strokeWidth={2}
                          style={{ cursor: 'nwse-resize' }}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            setDraggingHandle({ type: 'RESIZE', elementId: a.id, startW: a.w, startH: a.h, startPt: toSVGPoint(e), cx: a.x + a.w / 2, cy: a.y + a.h / 2, rotation: a.rotation || 0 })
                          }}
                        />
                        <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 4" pointerEvents="none" />
                      </>
                    )}
                  </g>
                ))}

                {/* Seats */}
                {seats.map((seat) => {
                  const zone = zones.find((z) => z.localId === seat.zoneLocalId)
                  const fill = seat.isDisabled ? '#EF4444' : zone ? zone.color : '#72787c'
                  const isSelected = selectedIds.has(seat.localId)
                  return (
                    <g
                      key={seat.localId}
                      transform={`translate(${seat.x},${seat.y})`}
                      onMouseDown={(e) => handleSeatMouseDown(e, seat)}
                      style={{ cursor: tool === 'ERASE' ? 'not-allowed' : 'pointer' }}
                    >
                      <rect
                        width={SEAT_W}
                        height={SEAT_H}
                        rx={6}
                        fill={fill}
                        stroke={isSelected ? '#3B82F6' : seat.isDisabled ? '#ffffff50' : 'rgba(255,255,255,0.1)'}
                        strokeWidth={isSelected ? 3 : 1}
                        opacity={seat.isDisabled ? 0.35 : 1}
                      />
                      <text
                        x={14}
                        y={18}
                        textAnchor="middle"
                        fontSize={8}
                        fill="white"
                        fontWeight="700"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {seat.rowLabel}{seat.seatNumber}
                      </text>
                    </g>
                  )
                })}

                {/* Rubberband Selection Box */}
                {rubberBand && (
                  <rect
                    x={Math.min(rubberBand.x1, rubberBand.x2)}
                    y={Math.min(rubberBand.y1, rubberBand.y2)}
                    width={Math.abs(rubberBand.x2 - rubberBand.x1)}
                    height={Math.abs(rubberBand.y2 - rubberBand.y1)}
                    fill="rgba(59, 130, 246, 0.15)"
                    stroke="#3B82F6"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    pointerEvents="none"
                  />
                )}
              </g>
            </svg>
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * SeatMapPreview – component xem trước sơ đồ ghế (dùng trong chi tiết sự kiện & mua vé)
 */
export function SeatMapPreview({ seatMap, seats: propSeats, zones: propZones, width: defaultWidth = 800, height = 300 }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(defaultWidth)

  useEffect(() => {
    if (!containerRef.current) return undefined
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width)
        }
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const finalSeats = propSeats || seatMap?.seats || []
  const zones = propZones || seatMap?.zones || []
  const standingAreas = seatMap?.config?.standingAreas || []
  const canvasBg = seatMap?.config?.canvasBg || '#0F172A'

  const stagePos = seatMap?.config?.stagePosition || 'TOP'
  const stageShape = seatMap?.config?.stageShape || 'RECTANGLE'
  const stageColor = seatMap?.config?.stageColor || '#3B82F6'

  let rawMinX = Infinity, rawMaxX = -Infinity, rawMinY = Infinity, rawMaxY = -Infinity

  finalSeats.forEach((s) => {
    const x = s.x_position ?? s.x
    const y = s.y_position ?? s.y
    if (x < rawMinX) rawMinX = x
    if (x + 28 > rawMaxX) rawMaxX = x + 28
    if (y < rawMinY) rawMinY = y
    if (y + 28 > rawMaxY) rawMaxY = y + 28
  })

  standingAreas.forEach((a) => {
    if (a.x < rawMinX) rawMinX = a.x
    if (a.x + a.w > rawMaxX) rawMaxX = a.x + a.w
    if (a.y < rawMinY) rawMinY = a.y
    if (a.y + a.h > rawMaxY) rawMaxY = a.y + a.h
  })

  const stageCustomX = seatMap?.config?.stageX || 0
  const stageCustomY = seatMap?.config?.stageY || 0
  const stageCustomW = seatMap?.config?.stageWidth || 900
  const stageCustomH = seatMap?.config?.stageHeight || 52

  if (stagePos === 'CUSTOM') {
    if (stageCustomX < rawMinX) rawMinX = stageCustomX
    if (stageCustomX + stageCustomW > rawMaxX) rawMaxX = stageCustomX + stageCustomW
    if (stageCustomY < rawMinY) rawMinY = stageCustomY
    if (stageCustomY + stageCustomH > rawMaxY) rawMaxY = stageCustomY + stageCustomH
  }

  if (!isFinite(rawMinX)) {
    rawMinX = 0; rawMaxX = 300; rawMinY = 0; rawMaxY = 200;
  }

  const gap = 20
  let stageW = 0, stageH = 0, stageX = 0, stageY = 0

  if (stagePos && stagePos !== 'HIDDEN' && stagePos !== 'CUSTOM') {
    if (stagePos === 'TOP') {
      stageW = Math.max(300, rawMaxX - rawMinX)
      stageH = 52
      stageX = rawMinX
      stageY = rawMinY - gap - stageH
      rawMinY = stageY
    } else if (stagePos === 'BOTTOM') {
      stageW = Math.max(300, rawMaxX - rawMinX)
      stageH = 52
      stageX = rawMinX
      stageY = rawMaxY + gap
      rawMaxY = stageY + stageH
    } else if (stagePos === 'LEFT') {
      stageH = Math.max(200, rawMaxY - rawMinY)
      stageW = 52
      stageX = rawMinX - gap - stageW
      stageY = rawMinY
      rawMinX = stageX
    } else if (stagePos === 'RIGHT') {
      stageH = Math.max(200, rawMaxY - rawMinY)
      stageW = 52
      stageX = rawMaxX + gap
      stageY = rawMinY
      rawMaxX = stageX + stageW
    }
  }

  const padding = 24
  const minX = rawMinX - padding
  const maxX = rawMaxX + padding
  const minY = rawMinY - padding
  const maxY = rawMaxY + padding

  const originalW = maxX - minX
  const originalH = maxY - minY

  const scaleX = width / originalW
  const scaleY = height / originalH
  const scale = Math.min(scaleX, scaleY, 1)

  const zoneColorById = useMemo(() => {
    const m = new Map()
    ;(zones || []).forEach((z) => m.set(z.id || z.localId, z.color))
    return m
  }, [zones])

  const renderStage = () => {
    if (!stagePos || stagePos === 'HIDDEN') return null
    let x, y, w, h
    const label = seatMap?.config?.stageLabel || 'SÂN KHẤU'
    if (stagePos === 'CUSTOM') {
      x = stageCustomX - minX
      y = stageCustomY - minY
      w = stageCustomW
      h = stageCustomH
    } else {
      x = stageX - minX
      y = stageY - minY
      w = stageW
      h = stageH
    }

    return (
      <g transform={seatMap?.config?.stageRotation ? `rotate(${seatMap.config.stageRotation}, ${x + w / 2}, ${y + h / 2})` : undefined}>
        {renderStageShapeBody(x, y, w, h, stageShape, stageColor, label, stagePos)}
      </g>
    )
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-border-soft/30 overflow-hidden w-full"
      style={{
        backgroundColor: canvasBg,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
        backgroundSize: `${20 * scale}px ${20 * scale}px`,
        width: '100%',
        height
      }}
    >
      <svg width={width} height={height}>
        <g transform={`translate(${(width - originalW * scale) / 2}, ${(height - originalH * scale) / 2}) scale(${scale})`}>
          {renderStage()}

          {/* Standing Areas */}
          {standingAreas.map((a) => (
            <g key={a.id} transform={a.rotation ? `rotate(${a.rotation}, ${a.x - minX + a.w / 2}, ${a.y - minY + a.h / 2})` : undefined}>
              <rect
                x={a.x - minX}
                y={a.y - minY}
                width={a.w}
                height={a.h}
                rx={12}
                fill={a.color || '#EF4444'}
                fillOpacity={0.25}
                stroke={a.color || '#EF4444'}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <text
                x={a.x - minX + a.w / 2}
                y={a.y - minY + a.h / 2 - 6}
                textAnchor="middle"
                fill="white"
                fontSize={13}
                fontWeight="bold"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {a.name || 'Vùng đứng'}
              </text>
              <text
                x={a.x - minX + a.w / 2}
                y={a.y - minY + a.h / 2 + 12}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                fontSize={11}
                fontWeight="600"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                Sức chứa: {a.capacity || 0} người
              </text>
            </g>
          ))}

          {/* Auxiliary Elements */}
          {seatMap?.config?.auxiliaryElements?.map((a) => (
            <g key={a.id} transform={a.rotation ? `rotate(${a.rotation}, ${a.x - minX + a.w / 2}, ${a.y - minY + a.h / 2})` : undefined}>
              <rect x={a.x - minX} y={a.y - minY} width={a.w} height={a.h} fill="var(--color-panel-soft)" rx={Math.min(a.w, a.h) > 20 ? 8 : 4} stroke="var(--color-border-soft)" strokeWidth={2} />
              <text
                x={a.x - minX + a.w / 2}
                y={a.y - minY + a.h / 2 + 5}
                textAnchor="middle"
                fill="var(--color-content)"
                fontSize={12}
                fontWeight="bold"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {a.label}
              </text>
            </g>
          ))}

          {/* Seats */}
          {finalSeats.map((s) => {
            const x = (s.x_position ?? s.x) - minX
            const y = (s.y_position ?? s.y) - minY
            const isDisabled = s.is_disabled ?? s.isDisabled
            const fill = isDisabled ? '#EF4444' : zoneColorById.get(s.zone_id ?? s.zoneLocalId) ?? '#72787c'
            return (
              <g key={s.id || s.localId} transform={`translate(${x},${y})`}>
                <rect
                  width={28}
                  height={28}
                  rx={6}
                  fill={fill}
                  stroke={isDisabled ? '#ffffff50' : 'rgba(255,255,255,0.1)'}
                  strokeWidth={1}
                  opacity={isDisabled ? 0.35 : 1}
                />
                <text
                  x={14}
                  y={18}
                  textAnchor="middle"
                  fontSize={8}
                  fill="white"
                  fontWeight="700"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {s.row_label ?? s.rowLabel}{s.seat_number ?? s.seatNumber}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
