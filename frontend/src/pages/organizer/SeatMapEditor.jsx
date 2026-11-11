import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  Ban,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eraser,
  Grid,
  GripVertical,
  Hand,
  Loader2,
  Minus,
  MousePointer2,
  Paintbrush,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Shapes,
  Sparkles,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { createSeatMap, generateSeatMapFromImage, getSeatMap, updateSeatMap } from '@/services/organizerSeatMaps.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { translatePhrase } from '@/i18n/phraseDictionary.js'

const SEAT_W = 28
const SEAT_H = 28
const GAP_X = 6
const GAP_Y = 8
const SNAP_X = SEAT_W + GAP_X
const SNAP_Y = SEAT_H + GAP_Y
const STAGE_OFFSET_Y = 70
const ZONE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F43F5E']

const getStageShapes = (isEnglish) => [
  { id: 'RECTANGLE', label: isEnglish ? 'Rectangle / Square' : 'Hình chữ nhật / Vuông' },
  { id: 'TRIANGLE', label: isEnglish ? 'Triangle' : 'Hình tam giác' },
  { id: 'CIRCLE', label: isEnglish ? 'Circle / Ellipse' : 'Hình tròn / Ellipse' },
  { id: 'SEMI_CIRCLE', label: isEnglish ? 'Semi-circle' : 'Hình bán nguyệt' },
  { id: 'T_STAGE', label: isEnglish ? 'T-Stage (Runway)' : 'Sân khấu chữ T (Runway)' },
  { id: 'DIAMOND', label: isEnglish ? 'Diamond' : 'Hình thoi / Kim cương' },
]

const getCanvasThemes = (isEnglish) => [
  { id: '#0F172A', label: isEnglish ? 'Navy Dark' : 'Xanh đen', color: '#0F172A' },
  { id: '#090D16', label: isEnglish ? 'Deep Black' : 'Đen tuyền', color: '#090D16' },
  { id: '#1E293B', label: isEnglish ? 'Charcoal Gray' : 'Xám than', color: '#1E293B' },
  { id: '#F8FAFC', label: isEnglish ? 'Light Canvas' : 'Nền sáng', color: '#F8FAFC', light: true },
]

const getTools = (isEnglish) => [
  { id: 'SELECT', label: isEnglish ? 'Select' : 'Chọn', icon: MousePointer2, shortcut: 'V' },
  { id: 'ADD', label: isEnglish ? 'Add Seat' : 'Vẽ ghế', icon: Plus, shortcut: 'A', freeformOnly: true },
  { id: 'PAINT', label: isEnglish ? 'Paint Zone' : 'Tô khu vực', icon: Paintbrush, shortcut: 'P' },
  { id: 'ERASE', label: isEnglish ? 'Erase' : 'Xóa', icon: Eraser, shortcut: 'E' },
  { id: 'DISABLE', label: isEnglish ? 'Disable' : 'Vô hiệu', icon: Ban, shortcut: 'D' },
]

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

function newLocalId() {
  return crypto.randomUUID()
}

function rowLabelForIndex(r) {
  if (r < 26) return String.fromCharCode(65 + r)
  return String.fromCharCode(64 + Math.floor(r / 26)) + String.fromCharCode(65 + (r % 26))
}

function RenameModal({ isOpen, title, initialValue, onSave, onClose }) {
  const { isEnglish } = useLanguage()
  const [val, setVal] = useState(initialValue || '')

  useEffect(() => {
    setVal(initialValue || '')
  }, [initialValue, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/40 bg-surface p-6 shadow-2xl space-y-4 text-content">
        <h3 className="text-base font-extrabold text-content">{title || (isEnglish ? 'Rename' : 'Đổi tên')}</h3>
        <div>
          <label className="text-xs text-subtle font-semibold mb-1 block">{isEnglish ? 'New display name:' : 'Tên hiển thị mới:'}</label>
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
            placeholder={isEnglish ? 'Enter new name...' : 'Nhập tên mới...'}
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
            {isEnglish ? 'Cancel' : 'Hủy'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (val.trim()) onSave(val.trim())
            }}
            className="org-btn-primary px-5 py-2 text-xs"
          >
            {isEnglish ? 'Save changes' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Gán row_label + seat_number duy nhất trước khi lưu (tránh UNIQUE constraint). */
function normalizeSeatsForSave(seats) {
  const existingKeys = new Set()
  let allValidAndUnique = seats.length > 0
  for (const s of seats) {
    if (!s.rowLabel || s.rowLabel === 'X' || !s.seatNumber) {
      allValidAndUnique = false
      break
    }
    const k = `${s.rowLabel}|${s.seatNumber}`
    if (existingKeys.has(k)) {
      allValidAndUnique = false
      break
    }
    existingKeys.add(k)
  }
  if (allValidAndUnique) {
    return seats
  }

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

/**
 * Tự động gióng thẳng hàng thông minh (Robust Smart Alignment):
 * 1. Khi người dùng chọn ghế cụ thể (targetIds):
 *    - Tự động gom cụm các ghế theo hàng ngang (chênh lệch Y <= 15px) và gióng thẳng hàng Y theo trung vị.
 *    - Tự động gom cụm các ghế theo cột dọc (chênh lệch X <= 15px) và gióng thẳng hàng X theo trung vị.
 *    - Hoạt động 100% tin cậy trên hàng lẻ, cột lẻ, hoặc cả khối ghế người dùng quét chọn.
 * 2. Khi người dùng bấm căn hàng toàn bộ sơ đồ (targetIds = null):
 *    - Tự động phát hiện các ghế thuộc đường cong / góc chéo (lân cận gần nhất có min(dx, dy) >= 7.5px) để BẢO VỆ NGUYÊN VẸN ĐỘ CONG.
 *    - Chỉ gióng thẳng tắp các hàng ngang và cột dọc thẳng của khán đài.
 */
function autoAlignSeatList(allSeats, targetIds = null) {
  if (!Array.isArray(allSeats) || allSeats.length < 2) return allSeats

  const isManualSelection = Boolean(targetIds && targetIds.size > 0)
  const isTarget = (id) => (!isManualSelection || targetIds.has(id))
  const targetSeats = allSeats.filter((s) => isTarget(s.localId))
  if (targetSeats.length < 2) return allSeats

  const n = targetSeats.length
  const rowSeatMap = new Map()
  const colSeatMap = new Map()

  // Helper 1D clustering
  const cluster1D = (items, keyFn, thresh) => {
    const sorted = [...items].sort((a, b) => keyFn(a) - keyFn(b))
    const groups = []
    for (const item of sorted) {
      const v = keyFn(item)
      let bestG = null
      let bestD = 1e9
      for (const g of groups) {
        const mean = g.reduce((acc, cur) => acc + keyFn(cur), 0) / g.length
        const d = Math.abs(v - mean)
        if (d <= thresh && d < bestD) {
          bestD = d
          bestG = g
        }
      }
      if (bestG) {
        bestG.push(item)
      } else {
        groups.push([item])
      }
    }
    return groups
  }

  if (isManualSelection) {
    // Chế độ người dùng chọn chủ động: Căn thẳng tắp theo cụm hàng và cụm cột
    // 1. Căn hàng ngang Y: các ghế có khoảng cách Y gần nhau (<= 14px)
    const rowGroups = cluster1D(targetSeats, (s) => s.y, 14)
    for (const group of rowGroups) {
      if (group.length >= 2) {
        const sortedY = group.map((s) => s.y).sort((a, b) => a - b)
        const medY = sortedY[Math.floor(sortedY.length / 2)]
        for (const s of group) {
          rowSeatMap.set(s.localId, medY)
        }
      }
    }

    // 2. Căn cột dọc X: các ghế có khoảng cách X gần nhau (<= 14px)
    const colGroups = cluster1D(targetSeats, (s) => s.x, 14)
    for (const group of colGroups) {
      if (group.length >= 2) {
        const sortedX = group.map((s) => s.x).sort((a, b) => a - b)
        const medX = sortedX[Math.floor(sortedX.length / 2)]
        for (const s of group) {
          colSeatMap.set(s.localId, medX)
        }
      }
    }
  } else {
    // Chế độ tự động toàn bộ sơ đồ: Bảo vệ độ cong & đường chéo
    const isCurvedOrDiagonal = new Array(n).fill(false)
    for (let i = 0; i < n; i++) {
      const s1 = targetSeats[i]
      let minD = 1e9
      let bestDx = 0
      let bestDy = 0
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const s2 = targetSeats[j]
        const dx = Math.abs(s1.x - s2.x)
        const dy = Math.abs(s1.y - s2.y)
        const d = Math.hypot(dx, dy)
        if (d < minD) {
          minD = d
          bestDx = dx
          bestDy = dy
        }
      }
      // Ghế nằm trên góc chéo 45 độ hoặc đường cong: lân cận gần nhất có min(dx, dy) >= 7.5px
      if (minD <= 52 && Math.min(bestDx, bestDy) >= 7.5) {
        isCurvedOrDiagonal[i] = true
      }
    }

    const orthoSeats = targetSeats.filter((_, idx) => !isCurvedOrDiagonal[idx])
    if (orthoSeats.length >= 2) {
      // 1. Căn hàng ngang cho các ghế thẳng
      const rowGroups = cluster1D(orthoSeats, (s) => s.y, 10)
      for (const group of rowGroups) {
        if (group.length >= 3) {
          const sortedY = group.map((s) => s.y).sort((a, b) => a - b)
          const medY = sortedY[Math.floor(sortedY.length / 2)]
          for (const s of group) {
            rowSeatMap.set(s.localId, medY)
          }
        }
      }

      // 2. Căn cột dọc cho các ghế thẳng
      const colGroups = cluster1D(orthoSeats, (s) => s.x, 10)
      for (const group of colGroups) {
        if (group.length >= 3) {
          const sortedX = group.map((s) => s.x).sort((a, b) => a - b)
          const medX = sortedX[Math.floor(sortedX.length / 2)]
          for (const s of group) {
            colSeatMap.set(s.localId, medX)
          }
        }
      }
    }
  }

  return allSeats.map((s) => {
    if (!isTarget(s.localId)) return s
    const nextX = colSeatMap.has(s.localId) ? colSeatMap.get(s.localId) : s.x
    const nextY = rowSeatMap.has(s.localId) ? rowSeatMap.get(s.localId) : s.y
    return { ...s, x: nextX, y: nextY }
  })
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

function getTrianglePoints(area) {
  if (Array.isArray(area?.trianglePoints) && area.trianglePoints.length === 3) {
    return area.trianglePoints
  }
  return [
    { x: 0.5, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
}

function computeTriangleAbsolutePoints(area) {
  const { x, y, w, h } = area
  const tPts = getTrianglePoints(area)
  return tPts.map((p) => ({
    x: x + w * p.x,
    y: y + h * p.y,
  }))
}

function computeTriangleCentroid(area) {
  const pts = computeTriangleAbsolutePoints(area)
  return {
    x: (pts[0].x + pts[1].x + pts[2].x) / 3,
    y: (pts[0].y + pts[1].y + pts[2].y) / 3,
  }
}

function renderStageShapeBody(x, y, w, h, shape = 'RECTANGLE', color = 'var(--color-panel-soft)', label = 'SÂN KHẤU', position = 'TOP', isLight = false) {
  const fillColor = color || (isLight ? '#2563EB' : 'var(--color-panel-soft)')
  const strokeColor = isLight ? 'rgba(15,23,42,0.25)' : 'rgba(255,255,255,0.3)'
  const isFillLight = isLightColor(fillColor)
  const textColor = isFillLight ? '#0D1B2A' : '#FFFFFF'

  if (shape === 'TRIANGLE') {
    const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`
    return (
      <g>
        <polygon points={points} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
        <text x={x + w / 2} y={y + h * 0.65} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none', pointerEvents: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  if (shape === 'CIRCLE') {
    const rx = w / 2
    const ry = h / 2
    const cx = x + rx
    const cy = y + ry
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
        <ellipse cx={cx} cy={cy} rx={Math.max(2, rx - 8)} ry={Math.max(2, ry - 8)} fill="none" stroke={isFillLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'} strokeWidth={1} strokeDasharray="4 4" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none', pointerEvents: 'none' }}>
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
        <text x={cx} y={y + h / 2 + 6} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none', pointerEvents: 'none' }}>
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
        <text x={x + w / 2} y={y + topH / 2 + 4} textAnchor="middle" fill={textColor} fontSize={12} fontWeight="800" style={{ userSelect: 'none', pointerEvents: 'none' }}>
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
        <text x={cx} y={cy + 4} textAnchor="middle" fill={textColor} fontSize={13} fontWeight="800" style={{ userSelect: 'none', pointerEvents: 'none' }}>
          {label}
        </text>
      </g>
    )
  }

  // RECTANGLE
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fillColor} rx={Math.min(w, h) > 20 ? 12 : 4} stroke={strokeColor} strokeWidth={2} />
      {(position === 'TOP' || position === 'CUSTOM') && <rect x={x} y={y + h - 4} width={w} height={4} fill={isFillLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)'} />}
      {position === 'BOTTOM' && <rect x={x} y={y} width={w} height={4} fill={isFillLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)'} />}
      {position === 'LEFT' && <rect x={x + w - 4} y={y} width={4} height={h} fill={isFillLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)'} />}
      {position === 'RIGHT' && <rect x={x} y={y} width={4} height={h} fill={isFillLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)'} />}
      <text
        x={x + w / 2}
        y={y + h / 2 + 5}
        textAnchor="middle"
        fill={textColor}
        fontSize={13}
        fontWeight="800"
        letterSpacing="1"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
        transform={position === 'LEFT' || position === 'RIGHT' || (position === 'CUSTOM' && h > w) ? `rotate(-90 ${x + w / 2} ${y + h / 2})` : undefined}
      >
        {label}
      </text>
    </g>
  )
}

export function SeatMapEditor({ venueId, seatMapId, onSave, onClose }) {
  const { isEnglish } = useLanguage()
  const toast = useToast()
  const stageShapes = useMemo(() => getStageShapes(isEnglish), [isEnglish])
  const canvasThemes = useMemo(() => getCanvasThemes(isEnglish), [isEnglish])
  const tools = useMemo(() => getTools(isEnglish), [isEnglish])
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
  const [aiGenerating, setAiGenerating] = useState(false)
  const aiFileInputRef = useRef(null)
  const [error, setError] = useState(null)
  const [mapName, setMapName] = useState('')
  const [zones, setZones] = useState([])
  const [seats, setSeats] = useState([])
  const [loading, setLoading] = useState(Boolean(seatMapId))
  const [canvasBg, setCanvasBg] = useState('#0F172A')
  const isLightCanvas = useMemo(() => isLightColor(canvasBg), [canvasBg])
  const [sidebarTab, setSidebarTab] = useState('STAGE') // STAGE | ZONES | GRID | THEMES
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toolbarExpandedManual, setToolbarExpandedManual] = useState(null)
  const isToolbarExpanded = toolbarExpandedManual !== null ? toolbarExpandedManual : !sidebarOpen
  const canvasContainerRef = useRef(null)
  const [canvasWidth, setCanvasWidth] = useState(1200)

  useEffect(() => {
    if (!canvasContainerRef.current) return undefined
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCanvasWidth(entry.contentRect.width)
        }
      }
    })
    ro.observe(canvasContainerRef.current)
    return () => ro.disconnect()
  }, [])

  const canShowQuickActionLabels = isToolbarExpanded && canvasWidth >= 1150
  const canShowToolLabels = isToolbarExpanded && canvasWidth >= 720
  const canShowPaintText = isToolbarExpanded && canvasWidth >= 850

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
  const [seatDragAnchorId, setSeatDragAnchorId] = useState(null)
  const [hasDraggedSeats, setHasDraggedSeats] = useState(false)
  const [activeSnapGuides, setActiveSnapGuides] = useState({ x: null, y: null })

  const [auxElements, setAuxElements] = useState([])
  const [draggingAuxId, setDraggingAuxId] = useState(null)
  const [auxDragOffset, setAuxDragOffset] = useState({ x: 0, y: 0 })

  const [selectedShapeId, setSelectedShapeId] = useState(null)
  const [draggingHandle, setDraggingHandle] = useState(null)

  const mainContainerRef = useRef(null)
  const [toolbarPos, setToolbarPos] = useState(null)
  const toolbarRef = useRef(null)
  const [selectionBarPos, setSelectionBarPos] = useState(null)
  const selectionBarRef = useRef(null)
  const [shapeInspectorPos, setShapeInspectorPos] = useState(null)
  const shapeInspectorRef = useRef(null)

  const makeDraggable = (setPos, elementRef) => (e) => {
    if (e.button !== 0) return
    if (e.target.closest('button, input, select, textarea')) return
    e.stopPropagation()

    const container = canvasContainerRef.current || mainContainerRef.current
    const el = elementRef.current
    if (!container || !el) return

    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    const currentLeft = elRect.left - containerRect.left
    const currentTop = elRect.top - containerRect.top

    const startMouseX = e.clientX
    const startMouseY = e.clientY

    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault()
      const dx = moveEvent.clientX - startMouseX
      const dy = moveEvent.clientY - startMouseY

      const maxX = Math.max(10, containerRect.width - elRect.width - 10)
      const maxY = Math.max(10, containerRect.height - elRect.height - 10)

      const nextX = Math.min(Math.max(10, currentLeft + dx), maxX)
      const nextY = Math.min(Math.max(10, currentTop + dy), maxY)

      setPos({ x: nextX, y: nextY })
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Auto-save and Crash Protection
  const AUTOSAVE_KEY = `eventhub_seatmap_draft_${venueId || 'v'}_${seatMapId || 'new'}`
  const [autoSaveStatus, setAutoSaveStatus] = useState('SAVED') // 'SAVED', 'SAVING', 'OFFLINE_SAVED', 'ERROR'
  const [lastSavedTime, setLastSavedTime] = useState('')
  const [recoveredDraft, setRecoveredDraft] = useState(null)
  const isInitialLoadedRef = useRef(false)
  const isSavingRef = useRef(false)

  // Undo / Redo History Stack (Step-by-step navigation)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const clipboardRef = useRef(null)

  // Live mirror refs to prevent stale closures across callbacks
  const seatsRef = useRef(seats)
  seatsRef.current = seats
  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const standingAreasRef = useRef(standingAreas)
  standingAreasRef.current = standingAreas
  const auxElementsRef = useRef(auxElements)
  auxElementsRef.current = auxElements
  const stageConfigRef = useRef(stageConfig)
  stageConfigRef.current = stageConfig
  const layoutTypeRef = useRef(layoutType)
  layoutTypeRef.current = layoutType
  const gridConfigRef = useRef(gridConfig)
  gridConfigRef.current = gridConfig
  const canvasBgRef = useRef(canvasBg)
  canvasBgRef.current = canvasBg
  const mapNameRef = useRef(mapName)
  mapNameRef.current = mapName

  const getSnapshot = useCallback(() => ({
    seats: JSON.parse(JSON.stringify(seatsRef.current)),
    zones: JSON.parse(JSON.stringify(zonesRef.current)),
    standingAreas: JSON.parse(JSON.stringify(standingAreasRef.current)),
    auxElements: JSON.parse(JSON.stringify(auxElementsRef.current)),
    stageConfig: JSON.parse(JSON.stringify(stageConfigRef.current)),
    layoutType: layoutTypeRef.current,
    gridConfig: JSON.parse(JSON.stringify(gridConfigRef.current)),
    canvasBg: canvasBgRef.current,
  }), [])

  const recordHistory = useCallback(() => {
    undoStackRef.current.push(getSnapshot())
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift()
    }
    // Clear redo stack on any new user change
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [getSnapshot])

  // Backward compatibility alias for saveHistory
  const saveHistory = recordHistory

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    if (snapshot.seats) setSeats(snapshot.seats)
    if (snapshot.zones) setZones(snapshot.zones)
    if (snapshot.standingAreas) setStandingAreas(snapshot.standingAreas)
    if (snapshot.auxElements) setAuxElements(snapshot.auxElements)
    if (snapshot.stageConfig) setStageConfig(snapshot.stageConfig)
    if (snapshot.layoutType) setLayoutType(snapshot.layoutType)
    if (snapshot.gridConfig) setGridConfig(snapshot.gridConfig)
    if (snapshot.canvasBg) setCanvasBg(snapshot.canvasBg)
    setSelectedIds(new Set())
    setSelectedShapeId(null)
  }, [])

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return
    // 1. Push current snapshot to redo stack
    redoStackRef.current.push(getSnapshot())
    if (redoStackRef.current.length > 50) {
      redoStackRef.current.shift()
    }

    // 2. Pop previous snapshot and restore
    const previous = undoStackRef.current.pop()
    applySnapshot(previous)

    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
  }, [getSnapshot, applySnapshot])

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return
    // 1. Push current snapshot to undo stack
    undoStackRef.current.push(getSnapshot())
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift()
    }

    // 2. Pop next snapshot and restore
    const nextState = redoStackRef.current.pop()
    applySnapshot(nextState)

    setCanUndo(true)
    setCanRedo(redoStackRef.current.length > 0)
  }, [getSnapshot, applySnapshot])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  useEffect(() => {
    if (!seatMapId) {
      try {
        const savedDraftStr = localStorage.getItem(AUTOSAVE_KEY)
        if (savedDraftStr) {
          const draft = JSON.parse(savedDraftStr)
          if (draft && draft.timestamp && (Date.now() - draft.timestamp < 7 * 24 * 3600 * 1000)) {
            if ((draft.seats && draft.seats.length > 0) || (draft.standingAreas && draft.standingAreas.length > 0)) {
              setRecoveredDraft(draft)
            }
          }
        }
      } catch (e) {}

      if (layoutType === 'GRID' && seats.length === 0 && gridConfig.rows > 0 && gridConfig.cols > 0) {
        generateGrid()
      }
      isInitialLoadedRef.current = true
      setAutoSaveStatus('OFFLINE_SAVED')
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
        isInitialLoadedRef.current = true
        setAutoSaveStatus('SAVED')
        setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))

        // Check for recovered draft from unexpected power loss or browser exit
        try {
          const savedDraftStr = localStorage.getItem(AUTOSAVE_KEY)
          if (savedDraftStr) {
            const draft = JSON.parse(savedDraftStr)
            if (draft && draft.timestamp && (Date.now() - draft.timestamp < 7 * 24 * 3600 * 1000)) {
              const hasDiff =
                (draft.seats && draft.seats.length !== loaded.length) ||
                ((draft.standingAreas?.length || 0) !== (sm.config?.standingAreas?.length || 0)) ||
                ((draft.zones?.length || 0) !== (sm.zones?.length || 0))
              if (hasDiff) {
                setRecoveredDraft(draft)
              }
            }
          }
        } catch (e) {
          console.warn('Draft check error:', e)
        }
      })
      .catch((err) => {
        console.error(err)
        const message = getApiMessage(err, 'Không thể tải dữ liệu sơ đồ ghế.')
        setError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [seatMapId, toast, AUTOSAVE_KEY])

  // Auto-save effect: Tự động lưu nháp liên tục vào LocalStorage (phòng ngừa mất điện hoặc sự cố đột ngột)
  useEffect(() => {
    if (!isInitialLoadedRef.current || loading) return

    const localTimer = setTimeout(() => {
      try {
        const draft = {
          timestamp: Date.now(),
          venueId,
          seatMapId,
          mapName,
          layoutType,
          gridConfig,
          stageConfig,
          standingAreas,
          auxElements,
          canvasBg,
          zones,
          seats,
        }
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(draft))
        setAutoSaveStatus('SAVED')
        setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
      } catch (e) {
        console.warn('LocalStorage draft save error:', e)
      }
    }, 300)

    return () => {
      clearTimeout(localTimer)
    }
  }, [seats, zones, standingAreas, auxElements, stageConfig, canvasBg, layoutType, gridConfig, mapName, seatMapId, venueId, AUTOSAVE_KEY, loading])

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


  const selectAll = useCallback(() => {
    if (seats.length > 0) {
      setSelectedIds(new Set(seats.map((s) => s.localId)))
    }
    if (standingAreas.length > 0) {
      if (!selectedShapeId || !selectedShapeId.startsWith('std-')) {
        setSelectedShapeId(standingAreas[0].id)
      }
    } else if (auxElements.length > 0) {
      if (!selectedShapeId || !selectedShapeId.startsWith('aux-')) {
        setSelectedShapeId(auxElements[0].id)
      }
    }
    toast.success('Đã chọn tất cả')
  }, [seats, standingAreas, auxElements, selectedShapeId, toast])

  const copySelected = useCallback(() => {
    if (selectedIds.size > 0) {
      const selectedSeats = seats.filter((s) => selectedIds.has(s.localId))
      const selectedStanding = selectedShapeId && selectedShapeId.startsWith('std-')
        ? standingAreas.filter((a) => a.id === selectedShapeId)
        : (selectedIds.size === seats.length && seats.length > 0)
          ? standingAreas
          : []
      const selectedAux = selectedShapeId && selectedShapeId.startsWith('aux-')
        ? auxElements.filter((a) => a.id === selectedShapeId)
        : (selectedIds.size === seats.length && seats.length > 0)
          ? auxElements
          : []

      clipboardRef.current = {
        type: 'COMPOSITE',
        seats: JSON.parse(JSON.stringify(selectedSeats)),
        standingAreas: JSON.parse(JSON.stringify(selectedStanding)),
        auxElements: JSON.parse(JSON.stringify(selectedAux)),
      }
      toast.success('Đã sao chép các phần tử đã chọn')
      return
    }

    if (selectedShapeId) {
      const standing = standingAreas.find((a) => a.id === selectedShapeId)
      if (standing) {
        clipboardRef.current = {
          type: 'STANDING',
          item: JSON.parse(JSON.stringify(standing)),
        }
        toast.success(`Đã sao chép: ${standing.name || 'Vùng đứng'}`)
        return
      }

      const aux = auxElements.find((a) => a.id === selectedShapeId)
      if (aux) {
        clipboardRef.current = {
          type: 'AUX',
          item: JSON.parse(JSON.stringify(aux)),
        }
        toast.success(`Đã sao chép: ${aux.label || 'Vật thể'}`)
        return
      }
    }
  }, [selectedIds, seats, selectedShapeId, standingAreas, auxElements, toast])

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
          label: `${a.label} (Bản sao)`,
          x: a.x + offset,
          y: a.y + offset,
        }))
        setAuxElements((prev) => [...prev, ...newPastedAux])
        if (newPastedAux.length === 1 && (!copiedStanding || copiedStanding.length === 0)) {
          setSelectedShapeId(newPastedAux[0].id)
        }
      }
      toast.success('Đã dán các phần tử')
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
      toast.success(`Đã dán ${newPastedSeats.length} ghế`)
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
      toast.success(`Đã dán: ${newStanding.name}`)
    } else if (clipboardRef.current.type === 'AUX') {
      const item = clipboardRef.current.item
      const newAux = {
        ...item,
        id: `aux-${newLocalId()}`,
        label: `${item.label} (Bản sao)`,
        x: item.x + offset,
        y: item.y + offset,
      }
      setAuxElements((prev) => [...prev, newAux])
      setSelectedShapeId(newAux.id)
      toast.success(`Đã dán: ${newAux.label}`)
    }
  }, [saveHistory, toast])

  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    setSeats((prev) => prev.filter((s) => !selectedIds.has(s.localId)))
    setSelectedIds(new Set())
  }, [selectedIds, saveHistory])

  const deleteStandingArea = useCallback((id) => {
    saveHistory()
    setStandingAreas((prev) => prev.filter((a) => a.id !== id))
    setSelectedShapeId((cur) => (cur === id ? null : cur))
  }, [saveHistory])

  const deleteAuxElement = useCallback((id) => {
    saveHistory()
    setAuxElements((prev) => prev.filter((a) => a.id !== id))
    setSelectedShapeId((cur) => (cur === id ? null : cur))
  }, [saveHistory])

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

  const alignSelectedHorizontal = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    const selectedSeats = seats.filter((s) => selectedIds.has(s.localId))
    if (!selectedSeats.length) return
    const sorted = [...selectedSeats].sort((a, b) => a.x - b.x)
    const targetY = sorted[0].y
    setSeats((prev) =>
      prev.map((s) => (selectedIds.has(s.localId) ? { ...s, y: targetY } : s)),
    )
    toast.success(`Đã căn thẳng hàng ngang ${selectedSeats.length} ghế`)
  }, [selectedIds, seats, saveHistory, toast])

  const alignSelectedVertical = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    const selectedSeats = seats.filter((s) => selectedIds.has(s.localId))
    if (!selectedSeats.length) return
    const sorted = [...selectedSeats].sort((a, b) => a.y - b.y)
    const targetX = sorted[0].x
    setSeats((prev) =>
      prev.map((s) => (selectedIds.has(s.localId) ? { ...s, x: targetX } : s)),
    )
    toast.success(`Đã căn thẳng hàng dọc ${selectedSeats.length} ghế`)
  }, [selectedIds, seats, saveHistory, toast])

  const snapSelectedToGrid = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    const selectedSeats = seats.filter((s) => selectedIds.has(s.localId))
    if (!selectedSeats.length) return
    const sorted = [...selectedSeats].sort((a, b) => a.y - b.y || a.x - b.x)
    const origin = sorted[0]
    setSeats((prev) =>
      prev.map((s) => {
        if (!selectedIds.has(s.localId)) return s
        const relX = Math.round((s.x - origin.x) / SNAP_X) * SNAP_X
        const relY = Math.round((s.y - origin.y) / SNAP_Y) * SNAP_Y
        return {
          ...s,
          x: Math.max(0, origin.x + relX),
          y: Math.max(0, origin.y + relY),
        }
      }),
    )
    toast.success(`Đã hít đều ${selectedIds.size} ghế theo lưới chuẩn của khối`)
  }, [selectedIds, seats, saveHistory, toast])

  const autoAlignSelected = useCallback(() => {
    if (!selectedIds.size) return
    saveHistory()
    setSeats((prev) => {
      const next = autoAlignSeatList(prev, selectedIds)
      return next
    })
    toast.success(`Đã tự động căn thẳng hàng ${selectedIds.size} ghế theo các trục!`)
  }, [selectedIds, saveHistory, toast])

  const autoAlignAllSeats = useCallback(() => {
    if (!seats.length) return
    saveHistory()
    setSeats((prev) => {
      const next = autoAlignSeatList(prev, null)
      return next
    })
    toast.success(`Đã tự động căn thẳng hàng toàn bộ ${seats.length} ghế!`)
  }, [seats.length, saveHistory, toast])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      const key = e.key.toLowerCase()
      const isCtrl = e.ctrlKey || e.metaKey

      if (isCtrl && (e.code === 'KeyZ' || key === 'z')) {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if (isCtrl && (e.code === 'KeyY' || key === 'y')) {
        e.preventDefault()
        redo()
        return
      }
      if (isCtrl && (e.code === 'KeyS' || key === 's')) {
        e.preventDefault()
        handleSave()
        return
      }
      if (isCtrl && (e.code === 'KeyA' || key === 'a')) {
        e.preventDefault()
        selectAll()
        return
      }
      if (isCtrl && (e.code === 'KeyC' || key === 'c')) {
        e.preventDefault()
        copySelected()
        return
      }
      if (isCtrl && (e.code === 'KeyV' || key === 'v')) {
        e.preventDefault()
        pasteCopied()
        return
      }
      if ((isCtrl && key === 'b') || key === '[') {
        e.preventDefault()
        setToolbarExpandedManual(null)
        setSidebarOpen((v) => !v)
        return
      }
      if (key === 't' && !isCtrl && !e.altKey) {
        e.preventDefault()
        setToolbarExpandedManual((prev) => {
          const current = prev !== null ? prev : !sidebarOpen
          return !current
        })
        return
      }

      if (key === 'delete' || key === 'backspace' || e.code === 'Delete' || e.code === 'Backspace') {
        let deleted = false
        if (selectedIds.size) {
          e.preventDefault()
          deleteSelected()
          deleted = true
        }
        if (selectedShapeId) {
          e.preventDefault()
          if (selectedShapeId.startsWith('std-')) {
            deleteStandingArea(selectedShapeId)
            deleted = true
          } else if (selectedShapeId.startsWith('aux-')) {
            deleteAuxElement(selectedShapeId)
            deleted = true
          } else if (selectedShapeId === 'STAGE') {
            saveHistory()
            setStageConfig((c) => ({ ...c, position: 'HIDDEN' }))
            setSelectedShapeId(null)
            deleted = true
          }
        }
        if (deleted) {
          toast.success('Đã xóa phần tử')
        }
        return
      }
      if (key === 'escape' || e.code === 'Escape') {
        setSelectedIds(new Set())
        setSelectedShapeId(null)
        setRubberBand(null)
      }
      if (!isCtrl && !e.altKey) {
        const matched = tools.find((t) => t.shortcut.toLowerCase() === key)
        if (matched && !(matched.freeformOnly && layoutType === 'GRID')) {
          setTool(matched.id)
          if (matched.id === 'PAINT') {
            setSidebarTab('ZONES')
            if (!activeZoneId && zones.length > 0) setActiveZoneId(zones[0].localId)
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    selectedIds,
    selectedShapeId,
    deleteSelected,
    deleteStandingArea,
    deleteAuxElement,
    layoutType,
    undo,
    redo,
    selectAll,
    copySelected,
    pasteCopied,
    saveHistory,
    toast,
    zones,
    activeZoneId,
    handleSave,
    sidebarOpen,
  ])

  function toSVGPoint(e) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    }
  }

  function generateGrid() {
    recordHistory()
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
    recordHistory()
    const newZone = {
      localId: newLocalId(),
      name: `Khu vực ${zones.length + 1}`,
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
    }
    setZones((prev) => [...prev, newZone])
    setActiveZoneId(newZone.localId)
  }

  function deleteZone(zoneLocalId) {
    recordHistory()
    setZones((prev) => prev.filter((z) => z.localId !== zoneLocalId))
    setSeats((prev) =>
      prev.map((s) => (s.zoneLocalId === zoneLocalId ? { ...s, zoneLocalId: null } : s)),
    )
    if (activeZoneId === zoneLocalId) setActiveZoneId(null)
  }

  function addStandingArea(shape = 'RECTANGLE') {
    saveHistory()
    const newArea = {
      id: `std-${newLocalId()}`,
      name: shape === 'TRIANGLE' ? `Khối Tam Giác ${standingAreas.length + 1}` : `Vùng Đứng ${standingAreas.length + 1}`,
      capacity: 100,
      color: ZONE_COLORS[standingAreas.length % ZONE_COLORS.length],
      shape: shape,
      trianglePoints: shape === 'TRIANGLE' ? [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] : undefined,
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

  function applyPreset(presetType) {
    recordHistory()
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

  async function handleAiImageChange(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return

    setAiGenerating(true)
    setError(null)
    try {
      const aiData = await generateSeatMapFromImage(file)
      if (aiData?.isValidSeatMap === false) {
        const invalidMsg =
          aiData.invalidReason ||
          'Hình ảnh tải lên không phải là sơ đồ ghế hoặc sơ đồ sân khấu hợp lệ. Vui lòng chọn ảnh sơ đồ ghế rõ nét.'
        setError(invalidMsg)
        toast.error(invalidMsg)
        return
      }
      saveHistory()

      if (aiData.layoutType) setLayoutType(aiData.layoutType)
      if (aiData.canvasBg) setCanvasBg(aiData.canvasBg)
      if (aiData.gridConfig) setGridConfig(aiData.gridConfig)
      if (aiData.stageConfig) setStageConfig(aiData.stageConfig)
      if (Array.isArray(aiData.zones)) {
        setZones(aiData.zones)
        setActiveZoneId(aiData.zones[0]?.localId || null)
      }
      if (Array.isArray(aiData.standingAreas)) {
        setStandingAreas(aiData.standingAreas)
      }
      if (Array.isArray(aiData.auxElements)) {
        setAuxElements(aiData.auxElements)
      }
      if (Array.isArray(aiData.seats)) {
        const autoAligned = autoAlignSeatList(aiData.seats)
        setSeats(autoAligned)
        seatCounter.current = autoAligned.length + 1
      }
      setSelectedIds(new Set())
      setSelectedShapeId(null)

      if (!mapName.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
        setMapName(`Sơ đồ AI - ${baseName}`)
      }

      const seatCnt = aiData.seats?.length || 0
      const zoneCnt = aiData.zones?.length || 0
      const standCnt = aiData.standingAreas?.length || 0
      toast.success(
        `AI đã dựng xong sơ đồ: tự động căn thẳng hàng ${seatCnt} ghế, ${zoneCnt} khu vực và ${standCnt} khối khán đài!`,
      )
    } catch (err) {
      console.error('[AI Seatmap Import Error]:', err)
      const message = getApiMessage(err, 'Không thể phân tích ảnh sơ đồ ghế bằng AI.')
      setError(message)
      toast.error(message)
    } finally {
      setAiGenerating(false)
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
      recordHistory()
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
    if (tool === 'ERASE') {
      e.stopPropagation()
      saveHistory()
      setStageConfig((c) => ({ ...c, position: 'HIDDEN' }))
      if (selectedShapeId === 'STAGE') setSelectedShapeId(null)
      toast.success('Đã ẩn sân khấu')
      return
    }
    if (tool !== 'SELECT') return
    e.stopPropagation()
    recordHistory()
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
    if (tool === 'ERASE') {
      e.stopPropagation()
      deleteAuxElement(aux.id)
      toast.success(`Đã xóa ${aux.label || 'vật thể'}`)
      return
    }
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
    if (tool === 'ERASE') {
      e.stopPropagation()
      deleteStandingArea(area.id)
      toast.success(`Đã xóa ${area.name || 'vùng đứng'}`)
      return
    }
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
      recordHistory()
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
      recordHistory()
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

    if (tool === 'PAINT') {
      if (activeZoneId) {
        recordHistory()
        const targets =
          selectedIds.has(seat.localId) && selectedIds.size > 1 ? selectedIds : new Set([seat.localId])
        setSeats((prev) =>
          prev.map((s) =>
            targets.has(s.localId) && !s.isDisabled ? { ...s, zoneLocalId: activeZoneId } : s,
          ),
        )
      } else {
        toast.info('Vui lòng chọn một màu khu vực trước khi tô')
      }
      return
    }

    if (tool === 'SELECT') {
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
      recordHistory()
      setIsDraggingSeats(true)
      setSeatDragAnchorId(seat.localId)
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
      } else if (draggingHandle.type === 'TRIANGLE_VERTEX') {
        const { elementId, vertexIndex, startPoints, startPt, areaW, areaH, rotation } = draggingHandle
        const dx = pt.x - startPt.x
        const dy = pt.y - startPt.y
        const rad = ((rotation || 0) * Math.PI) / 180
        const localDx = dx * Math.cos(-rad) - dy * Math.sin(-rad)
        const localDy = dx * Math.sin(-rad) + dy * Math.cos(-rad)

        const newRelX = Math.max(-0.2, Math.min(1.2, startPoints[vertexIndex].x + localDx / areaW))
        const newRelY = Math.max(-0.2, Math.min(1.2, startPoints[vertexIndex].y + localDy / areaH))

        const newPoints = startPoints.map((p, idx) =>
          idx === vertexIndex
            ? { x: Math.round(newRelX * 1000) / 1000, y: Math.round(newRelY * 1000) / 1000 }
            : p
        )

        if (elementId.startsWith('std-')) {
          setStandingAreas((prev) =>
            prev.map((a) => (a.id === elementId ? { ...a, trianglePoints: newPoints } : a))
          )
        } else if (elementId.startsWith('aux-')) {
          setAuxElements((prev) =>
            prev.map((a) => (a.id === elementId ? { ...a, trianglePoints: newPoints } : a))
          )
        }
      } else if (draggingHandle.type === 'TRIANGLE_EDGE') {
        const { elementId, edgeIndex, startPoints, startPt, areaW, areaH, rotation } = draggingHandle
        const dx = pt.x - startPt.x
        const dy = pt.y - startPt.y
        const rad = ((rotation || 0) * Math.PI) / 180
        const localDx = dx * Math.cos(-rad) - dy * Math.sin(-rad)
        const localDy = dx * Math.sin(-rad) + dy * Math.cos(-rad)

        let newPoints
        if (edgeIndex === 1) {
          const dRelY = localDy / areaH
          newPoints = startPoints.map((p, idx) => {
            if (idx === 1 || idx === 2) {
              return { x: p.x, y: Math.max(0, Math.min(1.5, Math.round((p.y + dRelY) * 1000) / 1000)) }
            }
            return p
          })
        } else if (edgeIndex === 0) {
          const dRelX = localDx / areaW
          const dRelY = localDy / areaH
          newPoints = startPoints.map((p, idx) => {
            if (idx === 1) {
              return {
                x: Math.max(0, Math.min(1.5, Math.round((p.x + dRelX) * 1000) / 1000)),
                y: Math.max(0, Math.min(1.5, Math.round((p.y + dRelY) * 1000) / 1000)),
              }
            }
            if (idx === 0) {
              return {
                x: Math.max(0, Math.min(1, Math.round((p.x + dRelX * 0.5) * 1000) / 1000)),
                y: p.y,
              }
            }
            return p
          })
        } else if (edgeIndex === 2) {
          const dRelX = localDx / areaW
          const dRelY = localDy / areaH
          newPoints = startPoints.map((p, idx) => {
            if (idx === 2) {
              return {
                x: Math.max(-0.5, Math.min(1, Math.round((p.x + dRelX) * 1000) / 1000)),
                y: Math.max(0, Math.min(1.5, Math.round((p.y + dRelY) * 1000) / 1000)),
              }
            }
            if (idx === 0) {
              return {
                x: Math.max(0, Math.min(1, Math.round((p.x + dRelX * 0.5) * 1000) / 1000)),
                y: p.y,
              }
            }
            return p
          })
        }

        if (newPoints) {
          if (elementId.startsWith('std-')) {
            setStandingAreas((prev) =>
              prev.map((a) => (a.id === elementId ? { ...a, trianglePoints: newPoints } : a))
            )
          } else if (elementId.startsWith('aux-')) {
            setAuxElements((prev) =>
              prev.map((a) => (a.id === elementId ? { ...a, trianglePoints: newPoints } : a))
            )
          }
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
      let dx = pt.x - seatDragStartPt.x
      let dy = pt.y - seatDragStartPt.y

      // Shift key lock axis: di chuyển theo 1 trục duy nhất
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) {
          dy = 0
        } else {
          dx = 0
        }
      }

      let deltaX = dx
      let deltaY = dy
      let guideX = null
      let guideY = null

      const anchorOrig = seatDragAnchorId && seatDragOriginals[seatDragAnchorId]

      if (snapEnabled && !e.altKey && anchorOrig) {
        let rawTargetX = anchorOrig.x + dx
        let rawTargetY = anchorOrig.y + dy

        // 1. Tự động hít về vị trí ban đầu nếu di chuyển gần vị trí gốc (<= 5px)
        if (Math.abs(dx) <= 5) {
          rawTargetX = anchorOrig.x
          guideX = anchorOrig.x
        }
        if (Math.abs(dy) <= 5) {
          rawTargetY = anchorOrig.y
          guideY = anchorOrig.y
        }

        // 2. Tìm ghế lân cận (không thuộc nhóm đang kéo) để hít nam châm thông minh (Smart Magnetic Alignment)
        const otherSeats = seatsRef.current.filter((s) => !seatDragOriginals[s.localId])

        // --- Căn thẳng hàng X (cột dọc thẳng tắp, ví dụ C18 thẳng hàng với B11) ---
        if (guideX === null) {
          let bestDiffX = 1e9
          let bestSnapX = null

          // a) Thẳng hàng X với ghế lân cận (cùng cột dọc trong phạm vi 280px theo Y)
          for (const s of otherSeats) {
            const distY = Math.abs(rawTargetY - s.y)
            if (distY <= 280) {
              const diffX = Math.abs(rawTargetX - s.x)
              if (diffX <= 8 && diffX < bestDiffX) {
                bestDiffX = diffX
                bestSnapX = s.x
              }
            }
          }

          // b) Bước khoảng cách tiêu chuẩn 34px sang trái/phải với ghế cùng hàng (Y lệch <= 16px)
          if (bestSnapX === null) {
            for (const s of otherSeats) {
              const distY = Math.abs(rawTargetY - s.y)
              if (distY <= 16) {
                for (const offset of [-SNAP_X, SNAP_X]) {
                  const targetCandX = s.x + offset
                  const diffX = Math.abs(rawTargetX - targetCandX)
                  if (diffX <= 6 && diffX < bestDiffX) {
                    bestDiffX = diffX
                    bestSnapX = targetCandX
                  }
                }
              }
            }
          }

          if (bestSnapX !== null) {
            rawTargetX = bestSnapX
            guideX = bestSnapX
          }
        }

        // --- Căn thẳng hàng Y (hàng ngang thẳng tắp) ---
        if (guideY === null) {
          let bestDiffY = 1e9
          let bestSnapY = null

          // a) Thẳng hàng Y với ghế lân cận (cùng hàng ngang trong phạm vi 280px theo X)
          for (const s of otherSeats) {
            const distX = Math.abs(rawTargetX - s.x)
            if (distX <= 280) {
              const diffY = Math.abs(rawTargetY - s.y)
              if (diffY <= 8 && diffY < bestDiffY) {
                bestDiffY = diffY
                bestSnapY = s.y
              }
            }
          }

          // b) Bước khoảng cách tiêu chuẩn 36px lên/xuống với ghế cùng cột (X lệch <= 16px)
          if (bestSnapY === null) {
            for (const s of otherSeats) {
              const distX = Math.abs(rawTargetX - s.x)
              if (distX <= 16) {
                for (const offset of [-SNAP_Y, SNAP_Y]) {
                  const targetCandY = s.y + offset
                  const diffY = Math.abs(rawTargetY - targetCandY)
                  if (diffY <= 6 && diffY < bestDiffY) {
                    bestDiffY = diffY
                    bestSnapY = targetCandY
                  }
                }
              }
            }
          }

          if (bestSnapY !== null) {
            rawTargetY = bestSnapY
            guideY = bestSnapY
          }
        }

        deltaX = Math.round(rawTargetX - anchorOrig.x)
        deltaY = Math.round(rawTargetY - anchorOrig.y)
      } else {
        deltaX = Math.round(dx)
        deltaY = Math.round(dy)
      }

      setActiveSnapGuides({ x: guideX, y: guideY })

      setSeats((prev) =>
        prev.map((s) => {
          if (seatDragOriginals[s.localId]) {
            return {
              ...s,
              x: Math.max(0, seatDragOriginals[s.localId].x + deltaX),
              y: Math.max(0, seatDragOriginals[s.localId].y + deltaY),
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
      if (hasDraggedSeats) {
        saveHistory()
      }
      setIsDraggingSeats(false)
      setSeatDragStartPt(null)
      setSeatDragOriginals({})
      setSeatDragAnchorId(null)
      setActiveSnapGuides({ x: null, y: null })
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

    isSavingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const result = seatMapId
        ? await updateSeatMap(seatMapId, payload)
        : await createSeatMap(venueId, payload)
      try {
        localStorage.removeItem(AUTOSAVE_KEY)
      } catch (e) {}
      setAutoSaveStatus('SAVED')
      onSave(result)
    } catch (err) {
      console.error(err)
      const message = getApiMessage(err, 'Không thể lưu sơ đồ ghế.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
      isSavingRef.current = false
    }
  }

  const visibleTools = tools.filter((t) => !(t.freeformOnly && layoutType === 'GRID'))

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted">{isEnglish ? 'Loading seat map...' : 'Đang tải sơ đồ ghế...'}</p>
        </div>
      </div>,
      document.body,
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-content">
      <RenameModal
        {...renameModalState}
        onClose={() => setRenameModalState({ isOpen: false, title: '', initialValue: '', onSave: null })}
      />

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-soft/30 bg-surface/90 px-4 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/10 hover:text-white"
        >
          {isEnglish ? '← Go back' : '← Quay lại'}
        </button>
        <div className="h-6 w-px bg-border-soft/20" />
        <input
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder={isEnglish ? 'Seat map name...' : 'Tên sơ đồ ghế...'}
          className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold text-content outline-none placeholder:text-muted"
        />

        {/* Autosave Draft Status Indicator */}
        <div
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-panel-soft/60 border border-border-soft/20 text-xs shadow-xs"
          title={isEnglish ? "Drawings are continuously autosaved locally on this computer. Click 'Save diagram' to save to the system." : "Bản vẽ luôn được tự động lưu nháp liên tục trên máy (đề phòng mất điện hoặc lỡ tay tắt tab). Bấm 'Lưu sơ đồ' để lưu chính thức vào hệ thống và quay lại trang quản lý."}
        >
          <Check className="size-3.5 text-emerald-400 stroke-[2.5]" />
          <span className="text-emerald-300 font-medium">
            {isEnglish ? `Draft autosaved ${lastSavedTime ? `(${lastSavedTime})` : ''}` : `Đã tự động lưu nháp ${lastSavedTime ? `(${lastSavedTime})` : ''}`}
          </span>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="rounded-xl bg-panel-soft border border-border-soft/20 px-3 py-1 text-xs font-semibold text-content">
            {stats.active} {isEnglish ? 'seats' : 'ghế ngồi'} · {stats.standingCap} {isEnglish ? 'standing' : 'chỗ đứng'} · {stats.totalCap} {isEnglish ? 'total seats' : 'tổng chỗ'}
          </span>
          {stats.total > 1800 && (
            <span className="text-xs font-medium text-warning animate-pulse">{isEnglish ? 'Near 2,000 limit' : 'Gần giới hạn 2000'}</span>
          )}
        </div>

        <input
          ref={aiFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleAiImageChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => aiFileInputRef.current?.click()}
          disabled={aiGenerating || saving}
          className="btn-seatmap-ai-led"
          title={isEnglish ? "Upload seat map image for AI automatic recognition and layout generation" : "Tải ảnh sơ đồ ghế lên để AI tự động nhận diện và dựng sơ đồ"}
        >
          <svg
            className="btn-seatmap-ai-led-svg"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect className="btn-seatmap-ai-led-track" />
            <rect className="btn-seatmap-ai-led-beam-glow" pathLength="100" />
            <rect className="btn-seatmap-ai-led-beam-core" pathLength="100" />
          </svg>
          <span className="btn-seatmap-ai-led-content">
            <Sparkles className={`size-3.5 ${aiGenerating ? 'animate-spin' : ''}`} />
            <span>{aiGenerating ? (isEnglish ? 'AI generating...' : 'AI đang dựng...') : (isEnglish ? 'Generate from Image (AI)' : 'Tạo từ ảnh (AI)')}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || aiGenerating}
          className="org-btn-primary min-w-[120px] shadow-md shadow-primary/20 cursor-pointer"
          title={isEnglish ? "Save seat map to system and return to management page" : "Lưu sơ đồ vào hệ thống và quay lại trang quản lý sơ đồ"}
        >
          {saving ? (isEnglish ? 'Saving & returning...' : 'Đang lưu & quay lại...') : (isEnglish ? 'Save diagram' : 'Lưu sơ đồ')}
        </button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`relative flex flex-col border-r border-border-soft/30 bg-surface/90 backdrop-blur-sm text-content overflow-hidden transition-[width] duration-300 ease-in-out z-20 ${
            sidebarOpen ? 'w-[320px] shrink-0' : 'w-0 shrink-0 border-r-0'
          }`}
        >
          <div className="flex h-full w-[320px] flex-col overflow-hidden">
            {/* Navigation Tabs */}
            <div className="border-b border-border-soft/30 bg-panel-soft/30 p-1 shrink-0">
              <div className="grid grid-cols-4 gap-1 w-full">
                {[
                  { id: 'STAGE', label: isEnglish ? 'Stage' : 'Sân khấu', icon: Shapes },
                  { id: 'ZONES', label: isEnglish ? 'Zones' : 'Khu vực', icon: Users },
                  { id: 'GRID', label: isEnglish ? 'Seats' : 'Lưới ghế', icon: Grid },
                  { id: 'THEMES', label: isEnglish ? 'Themes' : 'Giao diện', icon: Palette },
                ].map((tab) => {
                  const IconComp = tab.icon
                  const active = sidebarTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSidebarTab(tab.id)}
                      className={`flex flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold rounded-lg transition-all ${
                        active
                          ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 font-black'
                          : 'text-subtle hover:text-content hover:bg-panel-soft'
                      }`}
                    >
                      <IconComp className="size-4 shrink-0" />
                      <span className="whitespace-nowrap tracking-tight leading-none text-center">
                        {tab.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: SÂN KHẤU & PRESETS */}
            {sidebarTab === 'STAGE' && (
              <div className="space-y-4">
                <section className="rounded-xl border border-[#C99A47]/30 p-3.5 bg-[#C99A47]/5 space-y-3.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-white">
                    {isEnglish ? 'Stage Configuration' : 'Cấu hình sân khấu'}
                  </p>
                  <label className="text-sm text-subtle block">
                    {isEnglish ? 'Display Name' : 'Tên hiển thị'}
                    <input
                      type="text"
                      value={stageConfig.label}
                      onChange={(e) => setStageConfig((c) => ({ ...c, label: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3.5 py-2 text-base font-bold text-content outline-none focus:border-primary"
                    />
                  </label>

                  <label className="text-sm text-subtle block">
                    {isEnglish ? 'Stage Block Shape' : 'Hình dạng khối sân khấu'}
                    <select
                      value={stageConfig.shape || 'RECTANGLE'}
                      onChange={(e) => setStageConfig((c) => ({ ...c, shape: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3.5 py-2 text-base text-content outline-none focus:border-primary"
                    >
                      {stageShapes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <label className="text-sm text-subtle block mb-1.5">{isEnglish ? 'Stage Color' : 'Màu sắc sân khấu'}</label>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="color"
                        value={stageConfig.color || '#3B82F6'}
                        onChange={(e) => setStageConfig((c) => ({ ...c, color: e.target.value }))}
                        className="h-9 w-11 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#64748B'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setStageConfig((c) => ({ ...c, color: hex }))}
                            className="size-6 rounded-full border border-white/20 transition-transform hover:scale-110"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="text-sm text-subtle block">
                    {isEnglish ? 'Position' : 'Vị trí'}
                    <select
                      value={stageConfig.position}
                      onChange={(e) => setStageConfig((c) => ({ ...c, position: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3.5 py-2 text-base text-content outline-none focus:border-primary"
                    >
                      <option value="TOP">{isEnglish ? 'Top' : 'Bên trên'}</option>
                      <option value="BOTTOM">{isEnglish ? 'Bottom' : 'Bên dưới'}</option>
                      <option value="LEFT">{isEnglish ? 'Left' : 'Trái'}</option>
                      <option value="RIGHT">{isEnglish ? 'Right' : 'Phải'}</option>
                      <option value="CUSTOM">{isEnglish ? 'Custom (Drag & Drop)' : 'Tuỳ chỉnh (Kéo thả)'}</option>
                      <option value="HIDDEN">{isEnglish ? 'Hide Stage' : 'Ẩn sân khấu'}</option>
                    </select>
                  </label>

                  {stageConfig.position === 'CUSTOM' && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <label className="text-xs text-subtle">
                        {isEnglish ? 'Width' : 'Ngang'}
                        <input type="number" value={stageConfig.w} onChange={(e) => setStageConfig(c => ({ ...c, w: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-border-soft/40 bg-surface px-1.5 py-1 text-sm text-content outline-none focus:border-primary" />
                      </label>
                      <label className="text-xs text-subtle">
                        {isEnglish ? 'Height' : 'Dọc'}
                        <input type="number" value={stageConfig.h} onChange={(e) => setStageConfig(c => ({ ...c, h: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-border-soft/40 bg-surface px-1.5 py-1 text-sm text-content outline-none focus:border-primary" />
                      </label>
                      <label className="text-xs text-subtle">
                        {isEnglish ? 'Rotate (°)' : 'Xoay (°)'}
                        <input type="number" value={stageConfig.rotation || 0} onChange={(e) => setStageConfig(c => ({ ...c, rotation: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-border-soft/40 bg-surface px-1.5 py-1 text-sm text-content outline-none focus:border-primary" />
                      </label>
                    </div>
                  )}

                  {/* Các nút thêm vật thể phụ */}
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAuxElements(p => [...p, { id: newLocalId(), type: 'AUX_STAGE', label: isEnglish ? 'Aux Stage' : 'Sân khấu phụ', x: 300, y: 300, w: 180, h: 40 }])}
                        className="flex items-center gap-1.5 p-2 rounded-xl border border-border-soft/40 hover:bg-panel-soft transition justify-center text-xs font-semibold bg-surface text-content shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5 text-tertiary" /> {isEnglish ? 'Aux Stage' : 'Sân phụ'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuxElements(p => [...p, { id: newLocalId(), type: 'SCREEN', label: isEnglish ? 'LED Screen' : 'Màn hình LED', x: 300, y: 300, w: 120, h: 20 }])}
                        className="flex items-center gap-1.5 p-2 rounded-xl border border-border-soft/40 hover:bg-panel-soft transition justify-center text-xs font-semibold bg-surface text-content shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5 text-tertiary" /> {isEnglish ? 'LED Screen' : 'Màn hình'}
                      </button>
                    </div>
                    {auxElements.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {auxElements.map(a => (
                          <div key={a.id} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-surface border border-border-soft/30 text-content shadow-sm">
                            <div className="flex items-center justify-between">
                              <input
                                type="text"
                                value={isEnglish ? (translatePhrase(a.label, 'en') || a.label) : a.label}
                                onChange={(e) => setAuxElements(p => p.map(x => x.id === a.id ? { ...x, label: e.target.value } : x))}
                                className="bg-transparent font-bold px-1 w-32 outline-none border-b border-border-soft/40 focus:border-tertiary text-xs"
                              />
                              <button type="button" onClick={() => setAuxElements(p => p.filter(x => x.id !== a.id))} title={isEnglish ? "Delete" : "Xóa"} className="p-1 hover:bg-panel-soft rounded text-muted hover:text-error transition"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* Mẫu có sẵn */}
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-white">
                    {isEnglish ? 'Quick Presets & AI' : 'Mẫu thiết kế nhanh & AI'}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => aiFileInputRef.current?.click()}
                      disabled={aiGenerating}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[#C99A47]/60 bg-gradient-to-r from-[#C99A47]/15 to-[#E6C17A]/10 p-3 text-center hover:border-[#E6C17A] hover:from-[#C99A47]/25 hover:to-[#E6C17A]/20 transition disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-extrabold text-[#E6C17A]">
                        <Sparkles className="size-4" />
                        {aiGenerating ? (isEnglish ? 'AI analyzing image...' : 'AI đang phân tích ảnh...') : (isEnglish ? 'Import map from image (AI YOLO)' : 'Nhập sơ đồ từ ảnh (AI YOLO)')}
                      </span>
                      <span className="text-[11px] text-subtle">
                        {isEnglish ? 'Auto-detect seats, stage, zones & standing areas' : 'Tự động nhận diện ghế, sân khấu, khu vực & vùng đứng'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('THEATER')}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border-soft/30 bg-surface p-3 text-center hover:border-[#C99A47] hover:bg-[#C99A47]/5 transition"
                    >
                      <span className="text-base font-bold text-white">{isEnglish ? 'Theater / Hall' : 'Nhà hát / Hội trường'}</span>
                      <span className="text-xs text-muted">{isEnglish ? 'Square + 200 seats' : 'Vuông + 200 ghế'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('T_STAGE')}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border-soft/30 bg-surface p-3 text-center hover:border-[#C99A47] hover:bg-[#C99A47]/5 transition"
                    >
                      <span className="text-base font-bold text-white">{isEnglish ? 'Concert Stage T' : 'Concert Sân khấu T'}</span>
                      <span className="text-xs text-muted">{isEnglish ? 'T-Stage + Standing + Seats' : 'Sân T + Đứng + Ghế'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('FESTIVAL')}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border-soft/30 bg-surface p-3 text-center hover:border-[#C99A47] hover:bg-[#C99A47]/5 transition"
                    >
                      <span className="text-base font-bold text-white">{isEnglish ? 'Mixed Festival' : 'Festival Hỗn hợp'}</span>
                      <span className="text-xs text-muted">{isEnglish ? 'Semi-circle + Standing Area' : 'Bán nguyệt + Vùng đứng'}</span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 2: KHU VỰC & VÙNG ĐỨNG */}
            {sidebarTab === 'ZONES' && (
              <div className="space-y-4">
                {/* Vùng đứng không ghế */}
                <section className="rounded-xl border border-[#C99A47]/30 p-3.5 bg-[#C99A47]/5 space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-white">
                      {isEnglish ? 'Standing Areas (No Seats)' : 'Vùng đứng (Không ghế)'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => addStandingArea('RECTANGLE')}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#C99A47]/60 hover:border-[#E6C17A] bg-[#C99A47]/5 hover:bg-[#C99A47]/15 py-2.5 px-2 text-xs font-bold text-[#E6C17A] hover:text-white transition-all cursor-pointer"
                      >
                        {isEnglish ? '+ Standing Area' : '+ Vùng đứng'}
                      </button>
                      <button
                        type="button"
                        onClick={() => addStandingArea('TRIANGLE')}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#C99A47]/60 hover:border-[#E6C17A] bg-[#C99A47]/5 hover:bg-[#C99A47]/15 py-2.5 px-2 text-xs font-bold text-[#E6C17A] hover:text-white transition-all cursor-pointer"
                      >
                        {isEnglish ? '+ Triangle Block' : '+ Khối tam giác'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-subtle leading-relaxed">
                    {isEnglish
                      ? 'Create general admission standing areas or geometric shapes. Drag edges and triangle vertices to customize shapes.'
                      : 'Tạo các khu vực vé đứng tự do hoặc khối hình tam giác, chữ nhật. Có thể kéo các cạnh và đỉnh tam giác để tùy biến hình dạng.'}
                  </p>

                  <div className="space-y-2">
                    {standingAreas.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted border border-dashed border-border-soft/30 rounded-xl">
                        {isEnglish ? 'No standing areas yet' : 'Chưa có vùng đứng nào'}
                      </p>
                    )}
                    {standingAreas.map((area) => (
                      <div key={area.id} className="p-3 rounded-xl bg-surface border border-border-soft/40 shadow-sm space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={isEnglish ? (translatePhrase(area.name, 'en') || area.name) : area.name}
                            onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, name: e.target.value } : a)))}
                            className="bg-transparent font-bold text-xs text-content outline-none border-b border-border-soft/40 focus:border-tertiary w-full"
                          />
                          <select
                            value={area.shape || 'RECTANGLE'}
                            onChange={(e) => {
                              saveHistory()
                              const newShape = e.target.value
                              setStandingAreas((prev) =>
                                prev.map((a) =>
                                  a.id === area.id
                                    ? {
                                        ...a,
                                        shape: newShape,
                                        trianglePoints:
                                          newShape === 'TRIANGLE'
                                            ? a.trianglePoints || [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
                                            : a.trianglePoints,
                                      }
                                    : a,
                                ),
                              )
                            }}
                            className="rounded-lg border border-border-soft/40 bg-panel-soft px-1.5 py-1 text-[11px] font-bold text-content outline-none"
                            title={isEnglish ? 'Select shape' : 'Chọn hình dạng'}
                          >
                            <option value="RECTANGLE">{isEnglish ? 'Rectangle' : 'Chữ nhật'}</option>
                            <option value="TRIANGLE">{isEnglish ? 'Triangle' : 'Tam giác'}</option>
                            <option value="CIRCLE">{isEnglish ? 'Circle' : 'Hình tròn'}</option>
                            <option value="DIAMOND">{isEnglish ? 'Diamond' : 'Hình thoi'}</option>
                          </select>
                          <input
                            type="color"
                            value={area.color || '#EF4444'}
                            onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, color: e.target.value } : a)))}
                            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <button
                            type="button"
                            onClick={() => deleteStandingArea(area.id)}
                            className="text-muted hover:text-error transition"
                            title={isEnglish ? 'Delete standing area (Backspace/Delete)' : 'Xóa vùng đứng (Backspace/Delete)'}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        {area.shape === 'TRIANGLE' && (
                          <div className="flex items-center gap-1.5 text-[11px] pt-1 border-t border-border-soft/20">
                            <span className="text-[10px] text-subtle font-bold">{isEnglish ? 'Preset:' : 'Mẫu:'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                saveHistory()
                                setStandingAreas((prev) =>
                                  prev.map((a) => (a.id === area.id ? { ...a, trianglePoints: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] } : a)),
                                )
                              }}
                              className="px-1.5 py-0.5 rounded bg-panel-soft hover:bg-tertiary/20 text-[10px] font-bold border border-border-soft/30"
                              title={isEnglish ? 'Isosceles triangle' : 'Tam giác cân'}
                            >
                              {isEnglish ? 'Isosceles' : 'Cân'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                saveHistory()
                                setStandingAreas((prev) =>
                                  prev.map((a) => (a.id === area.id ? { ...a, trianglePoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] } : a)),
                                )
                              }}
                              className="px-1.5 py-0.5 rounded bg-panel-soft hover:bg-tertiary/20 text-[10px] font-bold border border-border-soft/30"
                              title={isEnglish ? 'Right triangle (left)' : 'Tam giác vuông góc trái'}
                            >
                              {isEnglish ? 'Left Right' : 'Vuông trái'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                saveHistory()
                                setStandingAreas((prev) =>
                                  prev.map((a) => (a.id === area.id ? { ...a, trianglePoints: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] } : a)),
                                )
                              }}
                              className="px-1.5 py-0.5 rounded bg-panel-soft hover:bg-tertiary/20 text-[10px] font-bold border border-border-soft/30"
                              title={isEnglish ? 'Right triangle (right)' : 'Tam giác vuông góc phải'}
                            >
                              {isEnglish ? 'Right Right' : 'Vuông phải'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                saveHistory()
                                const cur = getTrianglePoints(area)
                                setStandingAreas((prev) =>
                                  prev.map((a) =>
                                    a.id === area.id
                                      ? { ...a, trianglePoints: cur.map((p) => ({ x: p.x, y: 1 - p.y })) }
                                      : a,
                                  ),
                                )
                              }}
                              className="px-1.5 py-0.5 rounded bg-panel-soft hover:bg-tertiary/20 text-[10px] font-bold border border-border-soft/30"
                              title={isEnglish ? 'Flip triangle vertically' : 'Lật ngược tam giác theo chiều dọc'}
                            >
                              {isEnglish ? 'Flip Vert' : 'Lật dọc'}
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-subtle">
                            {isEnglish ? 'Capacity (people)' : 'Sức chứa (người)'}
                            <input
                              type="number"
                              min={1}
                              value={area.capacity}
                              onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, capacity: Number(e.target.value) } : a)))}
                              className="mt-0.5 w-full rounded-lg border border-border-soft/40 bg-panel-soft px-2 py-1 text-xs text-content outline-none focus:border-primary font-bold"
                            />
                          </label>
                          <label className="text-[10px] text-subtle">
                            {isEnglish ? 'Size (W×H)' : 'Kích thước (W×H)'}
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
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-white">
                      {isEnglish ? 'Ticket Zones (Seated)' : 'Khu vực vé (Ghế ngồi)'}
                    </p>
                    <button
                      type="button"
                      onClick={addZone}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#C99A47]/60 hover:border-[#E6C17A] bg-[#C99A47]/5 hover:bg-[#C99A47]/15 py-2.5 px-3 text-xs font-bold text-[#E6C17A] hover:text-white transition-all cursor-pointer"
                    >
                      {isEnglish ? '+ Add Zone' : '+ Thêm khu vực'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {zones.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted">
                        {isEnglish ? 'No seat zones yet' : 'Chưa có khu vực ghế nào'}
                      </p>
                    )}
                    {zones.map((zone) => {
                      const count = seats.filter((s) => s.zoneLocalId === zone.localId).length
                      const isActive = activeZoneId === zone.localId
                      return (
                        <div
                          key={zone.localId}
                          onClick={() => setActiveZoneId(isActive ? null : zone.localId)}
                          className={`flex items-center justify-between rounded-xl border p-2.5 transition cursor-pointer ${isActive
                            ? 'border-[#E6C17A] bg-gradient-to-r from-[#C99A47]/20 to-[#E6C17A]/25 text-white shadow-sm ring-1 ring-[#C99A47]/40'
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
                              value={isEnglish ? (translatePhrase(zone.name, 'en') || zone.name) : zone.name}
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
                            <span className="text-[11px] font-bold text-subtle">{count} {isEnglish ? 'seats' : 'ghế'}</span>
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
                  <p className="text-xs font-bold uppercase tracking-wide text-white">
                    {isEnglish ? 'Layout Type & Grid Setup' : 'Loại Layout & Tạo lưới'}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      ['GRID', isEnglish ? 'Fixed Grid' : 'Lưới cố định'],
                      ['FREEFORM', isEnglish ? 'Freeform' : 'Vẽ tự do'],
                      ['MIXED', isEnglish ? 'Mixed' : 'Hỗn hợp'],
                    ].map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setLayoutType(type)}
                        className={`rounded-xl px-2 py-2 text-xs font-bold transition-all border ${layoutType === type
                          ? 'border-[#C99A47] text-[#E6C17A] bg-[#C99A47]/10 shadow-sm'
                          : 'border-border-soft/30 bg-panel-soft text-subtle hover:bg-panel-soft/80 hover:text-content hover:border-border-soft/60'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {layoutType === 'GRID' && (
                    <div className="space-y-2 pt-2 border-t border-border-soft/20">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-sm font-semibold text-white block">
                          {isEnglish ? 'Rows' : 'Số Hàng'}
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={gridConfig.rows}
                            onChange={(e) => setGridConfig((g) => ({ ...g, rows: Number(e.target.value) }))}
                            className="mt-1.5 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-2 text-base font-bold text-white outline-none focus:border-primary"
                          />
                        </label>
                        <label className="text-sm font-semibold text-white block">
                          {isEnglish ? 'Columns' : 'Số Cột'}
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={gridConfig.cols}
                            onChange={(e) => setGridConfig((g) => ({ ...g, cols: Number(e.target.value) }))}
                            className="mt-1.5 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-2 text-base font-bold text-white outline-none focus:border-primary"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={generateGrid}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#C99A47]/50 bg-[#C99A47]/10 hover:bg-[#C99A47]/20 hover:border-[#E6C17A] py-2.5 px-3 text-xs font-bold text-[#E6C17A] hover:text-white transition-all cursor-pointer"
                      >
                        <RotateCcw className="size-3.5" />
                        {isEnglish ? `Recreate seat grid (${gridConfig.rows * gridConfig.cols} seats)` : `Tạo lại lưới ghế (${gridConfig.rows * gridConfig.cols} ghế)`}
                      </button>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-white">
                    {isEnglish ? 'Quick Seat Actions' : 'Thao tác nhanh ghế'}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set(seats.map((s) => s.localId)))}
                      className="rounded-xl border border-border-soft/30 bg-surface py-2 text-xs font-semibold text-content hover:bg-panel-soft transition"
                    >
                      {isEnglish ? `Select all seats (${seats.length})` : `Chọn tất cả ghế (${seats.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="rounded-xl border border-border-soft/30 bg-surface py-2 text-xs font-semibold text-content hover:bg-panel-soft transition"
                    >
                      {isEnglish ? 'Deselect all' : 'Bỏ chọn tất cả'}
                    </button>
                    <button
                      type="button"
                      onClick={disableSelected}
                      disabled={!selectedIds.size}
                      className="rounded-xl border border-error/30 bg-error/10 py-2 text-xs font-bold text-error hover:bg-error/20 transition disabled:opacity-50"
                    >
                      {isEnglish ? `Disable (${selectedIds.size}) selected seats` : `Vô hiệu hóa (${selectedIds.size}) ghế đang chọn`}
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 4: GIAO DIỆN & NỀN */}
            {sidebarTab === 'THEMES' && (
              <div className="space-y-4">
                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-white">
                    {isEnglish ? 'Canvas Background Color' : 'Màu nền Canvas'}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {canvasThemes.map((t) => {
                      const isSelected = canvasBg === t.color
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition cursor-pointer ${isSelected
                              ? 'border-[#E6C17A] bg-[#C99A47]/10 text-white shadow-sm ring-1 ring-[#C99A47]/40'
                              : 'border-border-soft/30 bg-surface text-subtle hover:border-border-soft/60 hover:text-content hover:bg-panel-soft/30'
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="canvasTheme"
                              value={t.color}
                              checked={isSelected}
                              onChange={() => setCanvasBg(t.color)}
                              className="sr-only"
                            />
                            <div
                              className={`size-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isSelected
                                  ? 'border-[#E6C17A] bg-[#C99A47]/20'
                                  : 'border-border-soft/60 bg-transparent'
                                }`}
                            >
                              {isSelected && (
                                <div className="size-2 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] shadow-xs" />
                              )}
                            </div>
                            <span className="text-sm font-semibold">{t.label}</span>
                          </div>
                          <div
                            className="size-4 rounded-full border border-white/20 shrink-0"
                            style={{ backgroundColor: t.color }}
                            title={isEnglish ? `Color code: ${t.color}` : `Mã màu: ${t.color}`}
                          />
                        </label>
                      )
                    })}
                  </div>

                  <div className="pt-2 border-t border-border-soft/20 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{isEnglish ? 'Custom Color:' : 'Màu tự chọn:'}</span>
                    <input
                      type="color"
                      value={canvasBg}
                      onChange={(e) => setCanvasBg(e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border-soft/20 p-3.5 bg-panel-soft/10 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-white">
                    <input
                      type="checkbox"
                      checked={snapEnabled}
                      onChange={(e) => setSnapEnabled(e.target.checked)}
                      className="size-4 rounded border-border-soft/40 bg-panel-soft accent-[#C99A47]"
                    />
                    {isEnglish ? 'Snap to Grid Alignment' : 'Căn chỉnh Lưới Snap'}
                  </label>
                  <p className="text-xs leading-relaxed text-subtle">
                    {isEnglish
                      ? 'Automatically snap seats and objects to grid cells when dragging.'
                      : 'Tự động hít vị trí ghế & vật thể theo ô lưới khi kéo thả.'}
                  </p>
                </section>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Toggle Collapse/Expand Button on Outer Border */}
      <button
        type="button"
        onClick={() => {
          setToolbarExpandedManual(null)
          setSidebarOpen((prev) => !prev)
        }}
        title={
          sidebarOpen
            ? (isEnglish ? 'Collapse sidebar (Shortcut: [ or Ctrl+B)' : 'Thu gọn thanh bên để tiện vẽ (Phím tắt: [ hoặc Ctrl+B)')
            : (isEnglish ? 'Expand sidebar (Shortcut: [ or Ctrl+B)' : 'Mở rộng thanh bên cấu hình (Phím tắt: [ hoặc Ctrl+B)')
        }
        className={`group absolute top-1/2 -translate-y-1/2 z-30 flex h-14 w-6 items-center justify-center rounded-r-xl border border-l-0 shadow-2xl transition-all duration-300 cursor-pointer select-none ${
          sidebarOpen
            ? 'left-[320px] border-[#C99A47]/40 bg-[#0D1B2A]/95 text-[#C99A47] hover:w-7 hover:bg-[#C99A47] hover:text-[#0D1B2A] shadow-black/50'
            : 'left-0 border-[#C99A47]/60 bg-[#0D1B2A] text-[#C99A47] hover:w-7 hover:bg-[#C99A47] hover:text-[#0D1B2A] shadow-black/70 animate-pulse-subtle'
        }`}
        aria-label={sidebarOpen ? (isEnglish ? 'Collapse configuration panel' : 'Thu gọn bảng cấu hình') : (isEnglish ? 'Expand configuration panel' : 'Mở bảng cấu hình')}
      >
        {sidebarOpen ? (
          <ChevronLeft className="size-4 shrink-0 transition-transform group-hover:scale-110" />
        ) : (
          <ChevronRight className="size-4 shrink-0 transition-transform group-hover:scale-110" />
        )}
      </button>

        {/* Main Canvas Container */}
        <main ref={canvasContainerRef} className="relative flex flex-1 flex-col overflow-hidden">
          {/* Recovery Banner for Autosaved Draft */}
          {recoveredDraft && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl border border-amber-500/50 bg-[#0D1B2A]/95 px-4 py-2 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-3">
              <AlertCircle className="size-4 text-amber-400 shrink-0" />
              <span>
                {isEnglish ? 'Found autosaved draft from ' : 'Tìm thấy bản vẽ tự động lưu lúc '}
                <b>{new Date(recoveredDraft.timestamp).toLocaleTimeString(isEnglish ? 'en-US' : 'vi-VN')}</b>
                {isEnglish ? ' (power outage / crash protection).' : ' (phòng mất điện/đột ngột).'}
              </span>
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  type="button"
                  onClick={() => {
                    recordHistory()
                    applySnapshot(recoveredDraft)
                    if (recoveredDraft.mapName) setMapName(recoveredDraft.mapName)
                    setRecoveredDraft(null)
                    toast.success(isEnglish ? 'Autosaved draft restored!' : 'Đã khôi phục bản vẽ nháp tự động!')
                  }}
                  className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1 font-extrabold transition shadow-sm cursor-pointer"
                >
                  {isEnglish ? 'Restore' : 'Khôi phục'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try { localStorage.removeItem(AUTOSAVE_KEY) } catch (e) {}
                    setRecoveredDraft(null)
                  }}
                  className="rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 px-2.5 py-1 font-bold transition cursor-pointer"
                >
                  {isEnglish ? 'Dismiss' : 'Bỏ qua'}
                </button>
              </div>
            </div>
          )}

          {/* Top Floating Controls */}
          <div
            ref={toolbarRef}
            style={toolbarPos ? { left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px`, transform: 'none', position: 'absolute' } : undefined}
            className={`z-10 flex flex-col items-end gap-2.5 transition-all duration-300 ease-in-out max-w-[calc(100%-2rem)] ${
              toolbarPos
                ? 'absolute pointer-events-auto'
                : `absolute pointer-events-none ${recoveredDraft ? 'top-16' : 'top-4'} ${
                    sidebarOpen ? 'left-4 translate-x-0' : 'left-1/2 -translate-x-1/2'
                  }`
            }`}
          >
            {/* Floating Toolbar */}
            <div className={`pointer-events-auto flex items-center rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 max-w-full ${
              isToolbarExpanded ? 'gap-2 sm:gap-3 p-1.5 sm:p-2 sm:px-2.5' : 'gap-1.5 p-1.5'
            } ${
              isLightCanvas
                ? 'border-slate-300 bg-white/95 text-slate-800 shadow-xl shadow-slate-900/10'
                : 'border-border-soft/40 bg-surface/90 text-content'
            }`}>
              <div
                className="flex items-center text-subtle hover:text-content cursor-grab active:cursor-grabbing px-1 py-1 select-none shrink-0"
                onMouseDown={makeDraggable(setToolbarPos, toolbarRef)}
                title={isEnglish ? 'Drag to move toolbar (Double-click to reset)' : 'Kéo để di chuyển thanh công cụ (Nhấp đúp để về mặc định)'}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setToolbarPos(null)
                }}
              >
                <GripVertical className="size-4" />
              </div>
              <div className={`flex items-center border-r transition-all duration-300 ${
                isToolbarExpanded ? 'gap-1 sm:gap-1.5 pr-2 sm:pr-2.5' : 'gap-1 pr-1.5'
              } ${isLightCanvas ? 'border-slate-300' : 'border-border-soft/30'}`}>
                {visibleTools.map((t) => {
                  const IconComp = t.icon
                  const isActive = tool === t.id
                  const showLabel = canShowToolLabels || (!isToolbarExpanded && isActive)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTool(t.id)
                        if (t.id === 'PAINT') {
                          setSidebarTab('ZONES')
                          if (!activeZoneId && zones.length > 0) setActiveZoneId(zones[0].localId)
                        }
                      }}
                      title={`${t.label} (${t.shortcut})`}
                      className={`shrink-0 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isToolbarExpanded
                          ? 'px-2.5 sm:px-3 py-2'
                          : isActive
                            ? 'px-2.5 py-1.5'
                            : 'p-1.5'
                      } ${isActive
                        ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 font-black'
                        : isLightCanvas
                          ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-bold'
                          : 'text-subtle hover:bg-panel-soft hover:text-content'
                        }`}
                    >
                      <IconComp className="size-4 shrink-0" />
                      <span className={`whitespace-nowrap ${showLabel ? 'inline' : 'hidden'}`}>
                        {t.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Quick Actions: Quay lại (Undo), Tiếp tục (Redo), Chọn hết, Sao chép, Dán */}
              <div className={`flex items-center border-r transition-all duration-300 ${
                isToolbarExpanded ? 'gap-1 sm:gap-1.5 pr-2 sm:pr-2.5' : 'gap-0.5 pr-1.5'
              } ${isLightCanvas ? 'border-slate-300' : 'border-border-soft/30'}`}>
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  title={isEnglish ? 'Undo previous action (Ctrl+Z)' : 'Quay lại thao tác trước đó (Ctrl+Z)'}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${
                    canShowQuickActionLabels ? 'px-2.5 sm:px-3 py-2' : 'p-1.5'
                  } ${
                    isLightCanvas
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-bold'
                      : 'text-subtle hover:bg-panel-soft hover:text-content'
                  }`}
                >
                  <RotateCcw className="size-4 shrink-0" />
                  {canShowQuickActionLabels && <span className="whitespace-nowrap">{isEnglish ? 'Undo' : 'Quay lại'}</span>}
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  title={isEnglish ? 'Redo next action (Ctrl+Y or Ctrl+Shift+Z)' : 'Quay lại thao tác sau đó (Ctrl+Y hoặc Ctrl+Shift+Z)'}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${
                    canShowQuickActionLabels ? 'px-2.5 sm:px-3 py-2' : 'p-1.5'
                  } ${
                    isLightCanvas
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-bold'
                      : 'text-subtle hover:bg-panel-soft hover:text-content'
                  }`}
                >
                  <RotateCw className="size-4 shrink-0" />
                  {canShowQuickActionLabels && <span className="whitespace-nowrap">{isEnglish ? 'Redo' : 'Tiếp tục'}</span>}
                </button>
                <button
                  type="button"
                  onClick={selectAll}
                  title={isEnglish ? 'Select all seats (Ctrl+A)' : 'Chọn tất cả ghế (Ctrl+A)'}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    canShowQuickActionLabels ? 'px-2.5 sm:px-3 py-2' : 'p-1.5'
                  } ${
                    isLightCanvas
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-bold'
                      : 'text-subtle hover:bg-panel-soft hover:text-content'
                  }`}
                >
                  <CheckSquare className="size-4 shrink-0" />
                  {canShowQuickActionLabels && <span className="whitespace-nowrap">{isEnglish ? 'Select All' : 'Chọn hết'}</span>}
                </button>
                <button
                  type="button"
                  onClick={copySelected}
                  title={isEnglish ? 'Copy (Ctrl+C)' : 'Sao chép (Ctrl+C)'}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    canShowQuickActionLabels ? 'px-2.5 sm:px-3 py-2' : 'p-1.5'
                  } ${
                    isLightCanvas
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-bold'
                      : 'text-subtle hover:bg-panel-soft hover:text-content'
                  }`}
                >
                  <Copy className="size-4 shrink-0" />
                  {canShowQuickActionLabels && <span className="whitespace-nowrap">{isEnglish ? 'Copy' : 'Sao chép'}</span>}
                </button>
                <button
                  type="button"
                  onClick={pasteCopied}
                  title={isEnglish ? 'Paste (Ctrl+V)' : 'Dán (Ctrl+V)'}
                  className={`shrink-0 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    canShowQuickActionLabels ? 'px-2.5 sm:px-3 py-2' : 'p-1.5'
                  } ${
                    isLightCanvas
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-bold'
                      : 'text-subtle hover:bg-panel-soft hover:text-content'
                  }`}
                >
                  <ClipboardPaste className="size-4 shrink-0" />
                  {canShowQuickActionLabels && <span className="whitespace-nowrap">{isEnglish ? 'Paste' : 'Dán'}</span>}
                </button>
              </div>

              {/* Quick Paint zone selector */}
              {tool === 'PAINT' && zones.length > 0 && (
                <div className={`shrink-0 flex items-center transition-all duration-300 ${
                  isToolbarExpanded ? 'gap-2 pl-2' : 'gap-1.5 pl-1'
                }`}>
                  {canShowPaintText ? (
                    <span className={`text-xs sm:text-sm font-extrabold whitespace-nowrap ${isLightCanvas ? 'text-slate-800' : 'text-subtle'}`}>
                      {isEnglish ? 'Paint Zone:' : 'Tô khu vực:'}
                    </span>
                  ) : (
                    <Paintbrush className="size-3.5 text-subtle shrink-0" title={isEnglish ? 'Paint zone' : 'Tô màu khu vực'} />
                  )}
                  <div className={`flex items-center ${isToolbarExpanded ? 'gap-1.5' : 'gap-1'}`}>
                    {zones.map((z) => (
                      <button
                        key={z.localId}
                        type="button"
                        onClick={() => {
                          setActiveZoneId(z.localId)
                          if (selectedIds.size > 0) applyZoneToSelected(z.localId)
                        }}
                        title={isEnglish ? `Zone: ${z.name}` : `Khu vực: ${z.name}`}
                        className={`size-5 sm:size-6 rounded-full border-2 transition-transform shrink-0 cursor-pointer ${activeZoneId === z.localId
                          ? isLightCanvas ? 'scale-115 border-slate-900 shadow-md ring-2 ring-[#C99A47]' : 'scale-115 border-white shadow-md'
                          : isLightCanvas ? 'border-slate-400/50 shadow-xs opacity-90 hover:opacity-100 hover:scale-105' : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: z.color }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Expand / Collapse Toggle Button */}
              <div className={`shrink-0 flex items-center pl-1 border-l sticky right-0 bg-inherit ${isLightCanvas ? 'border-slate-300' : 'border-border-soft/30'}`}>
                <button
                  type="button"
                  onClick={() => setToolbarExpandedManual(!isToolbarExpanded)}
                  title={isToolbarExpanded ? (isEnglish ? 'Collapse toolbar (Shortcut: T)' : 'Thu gọn thanh công cụ (Phím tắt: T)') : (isEnglish ? 'Expand toolbar (Shortcut: T)' : 'Mở rộng dãn thanh công cụ (Phím tắt: T)')}
                  className="p-1.5 rounded-xl transition text-subtle hover:bg-panel-soft hover:text-[#C99A47] cursor-pointer"
                  aria-label={isToolbarExpanded ? (isEnglish ? 'Collapse toolbar' : 'Thu gọn thanh công cụ') : (isEnglish ? 'Expand toolbar' : 'Mở rộng thanh công cụ')}
                >
                  {isToolbarExpanded ? (
                    <ChevronLeft className="size-4 shrink-0 stroke-[2.5]" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 stroke-[2.5]" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Edit Popup Inspector on Selection */}
          {selectedShapeId && (() => {
            if (selectedShapeId === 'STAGE') {
              return (
                <div
                  ref={shapeInspectorRef}
                  onMouseDown={makeDraggable(setShapeInspectorPos, shapeInspectorRef)}
                  style={shapeInspectorPos ? { left: `${shapeInspectorPos.x}px`, top: `${shapeInspectorPos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
                  className={`absolute ${shapeInspectorPos ? '' : 'top-4 right-4'} z-20 flex items-center gap-2.5 rounded-2xl border p-3 shadow-2xl backdrop-blur-md select-none cursor-grab active:cursor-grabbing ${
                    isLightCanvas
                      ? 'border-primary/50 bg-white/95 text-slate-800 shadow-slate-900/15'
                      : 'border-primary/40 bg-surface/95 text-content'
                  }`}
                >
                  <div
                    className="flex items-center text-subtle hover:text-content cursor-grab active:cursor-grabbing pr-0.5 select-none"
                    title={isEnglish ? 'Drag to move panel (Double-click to reset)' : 'Kéo để di chuyển khung (Nhấp đúp để về mặc định)'}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setShapeInspectorPos(null)
                    }}
                  >
                    <GripVertical className="size-4" />
                  </div>
                  <div className="flex flex-col gap-1 cursor-default">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isLightCanvas ? 'text-slate-800' : 'text-white'}`}>
                      {isEnglish ? 'Edit Stage' : 'Chỉnh sửa Sân khấu'}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={stageConfig.label}
                        onChange={(e) => setStageConfig((c) => ({ ...c, label: e.target.value }))}
                        placeholder={isEnglish ? 'Enter stage name...' : 'Nhập tên sân khấu...'}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold outline-none focus:border-primary w-48 shadow-inner ${
                          isLightCanvas ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-border-soft/40 bg-panel-soft text-content'
                        }`}
                        autoFocus
                      />
                      <input
                        type="color"
                        value={stageConfig.color || '#3B82F6'}
                        onChange={(e) => setStageConfig((c) => ({ ...c, color: e.target.value }))}
                        className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        title={isEnglish ? 'Change stage color' : 'Đổi màu sân khấu'}
                      />
                      <select
                        value={stageConfig.shape || 'RECTANGLE'}
                        onChange={(e) => setStageConfig((c) => ({ ...c, shape: e.target.value }))}
                        className={`rounded-xl border px-2 py-1.5 text-xs font-bold outline-none focus:border-primary ${
                          isLightCanvas ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-border-soft/40 bg-panel-soft text-content'
                        }`}
                      >
                        {stageShapes.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setSelectedShapeId(null)} className={`text-xs font-bold px-1.5 py-1 ${isLightCanvas ? 'text-slate-500 hover:text-slate-900' : 'text-muted hover:text-content'}`}>✕</button>
                    </div>
                  </div>
                </div>
              )
            }

            const standingItem = standingAreas.find((a) => a.id === selectedShapeId)
            if (standingItem) {
              return (
                <div
                  ref={shapeInspectorRef}
                  onMouseDown={makeDraggable(setShapeInspectorPos, shapeInspectorRef)}
                  style={shapeInspectorPos ? { left: `${shapeInspectorPos.x}px`, top: `${shapeInspectorPos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
                  className={`absolute ${shapeInspectorPos ? '' : 'top-4 right-4'} z-20 flex flex-col gap-2 rounded-2xl border p-3 shadow-2xl backdrop-blur-md select-none cursor-grab active:cursor-grabbing ${
                    isLightCanvas
                      ? 'border-tertiary/50 bg-white/95 text-slate-800 shadow-slate-900/15'
                      : 'border-tertiary/40 bg-surface/95 text-content'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border-soft/30 pb-1.5 cursor-grab active:cursor-grabbing">
                    <div className="flex items-center gap-1">
                      <div
                        className="cursor-grab active:cursor-grabbing p-0.5"
                        title={isEnglish ? "Drag to move panel (Double click to reset position)" : "Kéo để di chuyển khung (Nhấp đúp để về mặc định)"}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setShapeInspectorPos(null)
                        }}
                      >
                        <GripVertical className="size-3.5 text-subtle hover:text-content" />
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isLightCanvas ? 'text-slate-800' : 'text-white'}`}>
                        {isEnglish
                          ? `Edit ${standingItem.shape === 'TRIANGLE' ? 'Triangle Block' : 'Standing Area'}`
                          : `Chỉnh sửa ${standingItem.shape === 'TRIANGLE' ? 'Khối Tam Giác' : 'Vùng Đứng'}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedShapeId(null)}
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${isLightCanvas ? 'text-slate-500 hover:text-slate-900' : 'text-muted hover:text-content'}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2 cursor-default">
                    <input
                      type="text"
                      value={isEnglish ? (translatePhrase(standingItem.name, 'en') || standingItem.name) : standingItem.name}
                      onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === standingItem.id ? { ...a, name: e.target.value } : a)))}
                      placeholder={isEnglish ? "Standing area name..." : "Tên vùng đứng..."}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold outline-none focus:border-tertiary w-36 shadow-inner ${
                        isLightCanvas ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-border-soft/40 bg-panel-soft text-content'
                      }`}
                      autoFocus
                    />
                    <label className={`text-[10px] font-bold flex items-center gap-1 ${isLightCanvas ? 'text-slate-600' : 'text-subtle'}`}>
                      {isEnglish ? 'Capacity:' : 'Sức chứa:'}
                      <input
                        type="number"
                        min={1}
                        value={standingItem.capacity}
                        onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === standingItem.id ? { ...a, capacity: Number(e.target.value) } : a)))}
                        className={`w-14 rounded-xl border px-2 py-1 text-xs font-bold outline-none focus:border-tertiary ${
                          isLightCanvas ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-border-soft/40 bg-panel-soft text-content'
                        }`}
                      />
                    </label>
                    <input
                      type="color"
                      value={standingItem.color || '#EF4444'}
                      onChange={(e) => setStandingAreas((prev) => prev.map((a) => (a.id === standingItem.id ? { ...a, color: e.target.value } : a)))}
                      className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                      title={isEnglish ? "Representative color" : "Màu đại diện"}
                    />
                    <select
                      value={standingItem.shape || 'RECTANGLE'}
                      onChange={(e) => {
                        saveHistory()
                        const newShape = e.target.value
                        setStandingAreas((prev) =>
                          prev.map((a) =>
                            a.id === standingItem.id
                              ? {
                                  ...a,
                                  shape: newShape,
                                  trianglePoints:
                                    newShape === 'TRIANGLE'
                                      ? a.trianglePoints || [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
                                      : a.trianglePoints,
                                }
                              : a,
                          ),
                        )
                      }}
                      className={`rounded-xl border px-2 py-1 text-xs font-bold outline-none focus:border-primary ${
                        isLightCanvas ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-border-soft/40 bg-panel-soft text-content'
                      }`}
                      title={isEnglish ? "Block shape" : "Hình dạng khối"}
                    >
                      <option value="RECTANGLE">{isEnglish ? 'Rectangle' : 'Chữ nhật'}</option>
                      <option value="TRIANGLE">{isEnglish ? 'Triangle' : 'Tam giác'}</option>
                      <option value="CIRCLE">{isEnglish ? 'Circle' : 'Hình tròn'}</option>
                      <option value="DIAMOND">{isEnglish ? 'Diamond' : 'Hình thoi'}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteStandingArea(standingItem.id)}
                      className="text-error hover:bg-error/10 p-1.5 rounded-lg transition"
                      title={isEnglish ? "Delete standing area (Backspace/Delete)" : "Xóa vùng đứng (Backspace/Delete)"}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {standingItem.shape === 'TRIANGLE' && (
                    <div className="flex items-center gap-1.5 pt-1 border-t border-border-soft/20 text-[11px]">
                      <span className={`text-[10px] font-bold ${isLightCanvas ? 'text-slate-600' : 'text-subtle'}`}>
                        {isEnglish ? 'Preset:' : 'Mẫu tam giác:'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          saveHistory()
                          setStandingAreas((prev) =>
                            prev.map((a) =>
                              a.id === standingItem.id
                                ? { ...a, trianglePoints: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
                                : a,
                            ),
                          )
                        }}
                        className="px-2 py-0.5 rounded-lg bg-panel-soft hover:bg-tertiary/20 font-bold border border-border-soft/40 transition"
                        title={isEnglish ? "Isosceles triangle" : "Tam giác cân"}
                      >
                        {isEnglish ? 'Isosceles' : 'Cân'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveHistory()
                          setStandingAreas((prev) =>
                            prev.map((a) =>
                              a.id === standingItem.id
                                ? { ...a, trianglePoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
                                : a,
                            ),
                          )
                        }}
                        className="px-2 py-0.5 rounded-lg bg-panel-soft hover:bg-tertiary/20 font-bold border border-border-soft/40 transition"
                        title={isEnglish ? "Right triangle (left)" : "Tam giác vuông góc trái"}
                      >
                        {isEnglish ? 'Left Right' : 'Vuông trái'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveHistory()
                          setStandingAreas((prev) =>
                            prev.map((a) =>
                              a.id === standingItem.id
                                ? { ...a, trianglePoints: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }
                                : a,
                            ),
                          )
                        }}
                        className="px-2 py-0.5 rounded-lg bg-panel-soft hover:bg-tertiary/20 font-bold border border-border-soft/40 transition"
                        title={isEnglish ? "Right triangle (right)" : "Tam giác vuông góc phải"}
                      >
                        {isEnglish ? 'Right Right' : 'Vuông phải'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveHistory()
                          const cur = getTrianglePoints(standingItem)
                          setStandingAreas((prev) =>
                            prev.map((a) =>
                              a.id === standingItem.id
                                ? {
                                    ...a,
                                    trianglePoints: cur.map((p) => ({ x: p.x, y: 1 - p.y })),
                                  }
                                : a,
                            ),
                          )
                        }}
                        className="px-2 py-0.5 rounded-lg bg-panel-soft hover:bg-tertiary/20 font-bold border border-border-soft/40 transition"
                        title={isEnglish ? "Flip triangle vertically" : "Lật ngược tam giác theo chiều dọc"}
                      >
                        {isEnglish ? 'Flip Vert' : 'Lật dọc'}
                      </button>
                    </div>
                  )}
                </div>
              )
            }

            const auxItem = auxElements.find((a) => a.id === selectedShapeId)
            if (auxItem) {
              return (
                <div
                  ref={shapeInspectorRef}
                  onMouseDown={makeDraggable(setShapeInspectorPos, shapeInspectorRef)}
                  style={shapeInspectorPos ? { left: `${shapeInspectorPos.x}px`, top: `${shapeInspectorPos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
                  className={`absolute ${shapeInspectorPos ? '' : 'top-4 right-4'} z-20 flex items-center gap-2.5 rounded-2xl border p-3 shadow-2xl backdrop-blur-md select-none cursor-grab active:cursor-grabbing ${
                    isLightCanvas
                      ? 'border-slate-300 bg-white/95 text-slate-800 shadow-slate-900/15'
                      : 'border-border-soft/40 bg-surface/95 text-content'
                  }`}
                >
                  <div
                    className="flex items-center text-subtle hover:text-content cursor-grab active:cursor-grabbing pr-0.5 select-none"
                    title={isEnglish ? "Drag to move panel (Double click to reset position)" : "Kéo để di chuyển khung (Nhấp đúp để về mặc định)"}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setShapeInspectorPos(null)
                    }}
                  >
                    <GripVertical className="size-4" />
                  </div>
                  <div className="flex flex-col gap-1 cursor-default">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isLightCanvas ? 'text-slate-800' : 'text-white'}`}>
                      {isEnglish ? 'Edit Auxiliary Object' : 'Chỉnh sửa Vật thể phụ'}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={isEnglish ? (translatePhrase(auxItem.label, 'en') || auxItem.label) : auxItem.label}
                        onChange={(e) => setAuxElements((prev) => prev.map((a) => (a.id === auxItem.id ? { ...a, label: e.target.value } : a)))}
                        placeholder={isEnglish ? "Object name..." : "Tên vật thể..."}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold outline-none focus:border-primary w-48 shadow-inner ${
                          isLightCanvas ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-border-soft/40 bg-panel-soft text-content'
                        }`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => deleteAuxElement(auxItem.id)}
                        className="text-error hover:bg-error/10 p-1.5 rounded-lg transition"
                        title={isEnglish ? "Delete object (Backspace/Delete)" : "Xóa vật thể (Backspace/Delete)"}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => setSelectedShapeId(null)} className={`text-xs font-bold px-1.5 py-1 ${isLightCanvas ? 'text-slate-500 hover:text-slate-900' : 'text-muted hover:text-content'}`}>✕</button>
                    </div>
                  </div>
                </div>
              )
            }

            return null
          })()}

          {/* Floating Zoom Controls */}
          <div className={`absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-2xl border p-1.5 shadow-2xl backdrop-blur-md transition-colors ${
            isLightCanvas
              ? 'border-slate-300 bg-white/95 text-slate-800 shadow-xl shadow-slate-900/10'
              : 'border-border-soft/40 bg-surface/90 text-content'
          }`}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              className={`rounded-xl p-2 transition font-bold ${isLightCanvas ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950' : 'text-subtle hover:bg-panel-soft hover:text-content'}`}
              title={isEnglish ? "Zoom in" : "Phóng to"}
            >
              <ZoomIn className="size-4" />
            </button>
            <span className={`px-2 text-xs font-black ${isLightCanvas ? 'text-slate-900' : 'text-content'}`}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              className={`rounded-xl p-2 transition font-bold ${isLightCanvas ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950' : 'text-subtle hover:bg-panel-soft hover:text-content'}`}
              title={isEnglish ? "Zoom out" : "Thu nhỏ"}
            >
              <ZoomOut className="size-4" />
            </button>
            <div className={`h-4 w-px mx-1 ${isLightCanvas ? 'bg-slate-300' : 'bg-border-soft/30'}`} />
            <button
              type="button"
              onClick={() => { setZoom(1); setPan({ x: 40, y: 80 }); }}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${isLightCanvas ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950' : 'text-subtle hover:bg-panel-soft hover:text-content'}`}
            >
              100%
            </button>
          </div>

          {/* Selection Action Bar for Seats */}
          {selectedIds.size > 0 && (
            <div
              ref={selectionBarRef}
              onMouseDown={makeDraggable(setSelectionBarPos, selectionBarRef)}
              style={selectionBarPos ? { left: `${selectionBarPos.x}px`, top: `${selectionBarPos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
              className={`absolute ${selectionBarPos ? '' : 'top-4 right-4'} z-10 flex items-center gap-2.5 rounded-2xl border px-3 py-2 shadow-2xl backdrop-blur-md select-none transition-colors cursor-grab active:cursor-grabbing ${
                isLightCanvas
                  ? 'border-[#C99A47] bg-white/95 text-slate-800 shadow-slate-900/15'
                  : 'border-tertiary/30 bg-surface/95 text-content'
              }`}
            >
              <div
                className="flex items-center text-subtle hover:text-content cursor-grab active:cursor-grabbing pr-0.5 select-none"
                title={isEnglish ? "Drag to move action bar (Double click to reset position)" : "Kéo để di chuyển khung tác vụ (Nhấp đúp để về mặc định)"}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setSelectionBarPos(null)
                }}
              >
                <GripVertical className="size-4" />
              </div>
              <span className={`text-xs font-bold ${isLightCanvas ? 'text-slate-800' : 'text-content'} cursor-default`}>
                {isEnglish ? 'Selected ' : 'Đã chọn '}
                <span className={`${isLightCanvas ? 'text-[#C99A47]' : 'text-primary'} font-extrabold`}>{selectedIds.size}</span>
                {isEnglish ? ' seats' : ' ghế'}
              </span>
              {zones.length > 0 && (
                <div className="flex items-center gap-1.5 border-l border-r px-2.5 border-border-soft/40">
                  <span className={`text-[11px] font-bold ${isLightCanvas ? 'text-slate-600' : 'text-subtle'}`}>
                    {isEnglish ? 'Assign zone:' : 'Gán khu vực:'}
                  </span>
                  <div className="flex items-center gap-1">
                    {zones.map((z) => (
                      <button
                        key={z.localId}
                        type="button"
                        onClick={() => applyZoneToSelected(z.localId)}
                        title={isEnglish ? `Assign selected seats to ${z.name}` : `Gán các ghế đã chọn vào ${z.name}`}
                        className="size-5 rounded-full border-2 border-white/80 shadow-sm hover:scale-115 transition-transform cursor-pointer"
                        style={{ backgroundColor: z.color }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Align & Snap Tools */}
              <div className="flex items-center gap-1 border-r pr-2 border-border-soft/40">
                <button
                  type="button"
                  onClick={alignSelectedHorizontal}
                  className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
                  title={isEnglish ? "Align selected seats into a straight horizontal row" : "Căn các ghế đã chọn thành 1 hàng ngang thẳng tắp"}
                >
                  <AlignCenterHorizontal className="size-3.5" />
                  {isEnglish ? 'Align Horiz' : 'Căn ngang'}
                </button>
                <button
                  type="button"
                  onClick={alignSelectedVertical}
                  className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
                  title={isEnglish ? "Align selected seats into a straight vertical column" : "Căn các ghế đã chọn thành 1 cột dọc thẳng tắp"}
                >
                  <AlignCenterVertical className="size-3.5" />
                  {isEnglish ? 'Align Vert' : 'Căn dọc'}
                </button>
                <button
                  type="button"
                  onClick={snapSelectedToGrid}
                  className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                    isLightCanvas
                      ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                      : 'border-border-soft bg-surface-soft text-content hover:bg-surface-elevated'
                  }`}
                  title={isEnglish ? "Snap all selected seats to standard grid points" : "Hít toàn bộ các ghế đã chọn vào các điểm ô lưới chuẩn"}
                >
                  <Grid className="size-3.5" />
                  {isEnglish ? 'Snap Grid' : 'Hít lưới'}
                </button>
                <button
                  type="button"
                  onClick={autoAlignSelected}
                  className="flex items-center gap-1 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25 transition cursor-pointer"
                  title={isEnglish ? "Auto align selected seats along horizontal and vertical axes" : "Tự động căn thẳng hàng các ghế đã chọn theo các trục dọc và ngang"}
                >
                  <Sparkles className="size-3.5" />
                  {isEnglish ? 'Auto Align' : 'Tự động căn hàng'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={disableSelected}
                  className="flex items-center gap-1 rounded-xl border border-warning/40 bg-warning/15 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-warning hover:bg-warning/25 transition cursor-pointer"
                >
                  <Ban className="size-3.5" />
                  {isEnglish ? 'Disable' : 'Vô hiệu'}
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="flex items-center gap-1 rounded-xl border border-error/40 bg-error/15 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-error hover:bg-error/25 transition cursor-pointer"
                  title={isEnglish ? "Delete selected seats (Backspace/Delete)" : "Xóa ghế đã chọn (Backspace/Delete)"}
                >
                  <Trash2 className="size-3.5" />
                  {isEnglish ? 'Delete' : 'Xóa'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className={`text-xs font-bold px-2 cursor-pointer ${isLightCanvas ? 'text-slate-600 hover:text-slate-950' : 'text-subtle hover:text-content'}`}
                >
                  {isEnglish ? 'Deselect' : 'Bỏ chọn'}
                </button>
              </div>
            </div>
          )}
          {/* SVG Canvas */}
          <div
            className="relative flex-1 overflow-hidden"
            style={{
              backgroundColor: canvasBg,
              backgroundImage: isLightCanvas
                ? 'radial-gradient(circle, rgba(15, 23, 42, 0.18) 1.2px, transparent 1.2px)'
                : 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            }}
            onWheel={handleWheel}
          >
            {!selectedShapeId && selectedIds.size === 0 && (
              <div className={`pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur transition-colors ${
                isLightCanvas
                  ? 'border-slate-300/80 bg-white/95 text-slate-700 shadow-slate-900/10'
                  : 'border-border-soft/30 bg-surface/90 text-subtle'
              }`}>
                <Hand className="size-3.5 text-tertiary" />
                {isEnglish ? (
                  <>Click block to edit name directly · Hold <b>Alt</b> + drag mouse to move</>
                ) : (
                  <>Click khối để sửa tên trực tiếp · Giữ <b>Alt</b> + kéo chuột để di chuyển</>
                )}
              </div>
            )}

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
                      {renderStageShapeBody(x, y, w, h, stageConfig.shape, stageConfig.color, stageConfig.label, stageConfig.position, isLightCanvas)}

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

                {/* Standing Areas (Vùng đứng không ghế & Khối hình) */}
                {standingAreas.map((area) => {
                  const isSelected = selectedShapeId === area.id
                  const { id, name, capacity, color, x, y, w, h, rotation, shape = 'RECTANGLE' } = area
                  const fillColor = color || '#EF4444'

                  const isTriangle = shape === 'TRIANGLE'
                  const tPts = isTriangle ? getTrianglePoints(area) : null
                  const p0 = isTriangle ? { x: x + w * tPts[0].x, y: y + h * tPts[0].y } : null
                  const p1 = isTriangle ? { x: x + w * tPts[1].x, y: y + h * tPts[1].y } : null
                  const p2 = isTriangle ? { x: x + w * tPts[2].x, y: y + h * tPts[2].y } : null
                  const centroid = isTriangle ? {
                    x: (p0.x + p1.x + p2.x) / 3,
                    y: (p0.y + p1.y + p2.y) / 3,
                  } : { x: x + w / 2, y: y + h / 2 }

                  const m01 = isTriangle ? { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 } : null
                  const m12 = isTriangle ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : null
                  const m20 = isTriangle ? { x: (p2.x + p0.x) / 2, y: (p2.y + p0.y) / 2 } : null

                  return (
                    <g
                      key={id}
                      transform={rotation ? `rotate(${rotation}, ${x + w / 2}, ${y + h / 2})` : undefined}
                      onMouseDown={(e) => handleStandingMouseDown(e, area)}
                      onDoubleClick={(e) => handleStandingDoubleClick(e, area)}
                      style={{ cursor: tool === 'SELECT' ? 'move' : 'default' }}
                    >
                      {isTriangle ? (
                        <polygon
                          points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
                          fill={fillColor}
                          fillOpacity={0.25}
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
                          fillOpacity={0.25}
                          stroke={fillColor}
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                      ) : shape === 'DIAMOND' ? (
                        <polygon
                          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
                          fill={fillColor}
                          fillOpacity={0.25}
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
                          fillOpacity={0.25}
                          stroke={fillColor}
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                      )}
                      <text
                        x={centroid.x}
                        y={centroid.y - 6}
                        textAnchor="middle"
                        fill={isLightCanvas ? '#0F172A' : 'white'}
                        fontSize={13}
                        fontWeight="bold"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {isEnglish ? (translatePhrase(name, 'en') || name) : (name || 'Vùng đứng')}
                      </text>
                      <text
                        x={centroid.x}
                        y={centroid.y + 12}
                        textAnchor="middle"
                        fill={isLightCanvas ? '#334155' : 'rgba(255,255,255,0.85)'}
                        fontSize={11}
                        fontWeight="600"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {isEnglish ? `Capacity: ${capacity || 0} people` : `Sức chứa: ${capacity || 0} người`}
                      </text>

                      {isSelected && (
                        <>
                          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 30} stroke="#3B82F6" strokeWidth={2} />
                          <circle
                            cx={x + w / 2}
                            cy={y - 30}
                            r={6}
                            fill="white"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            style={{ cursor: 'pointer' }}
                            title={isEnglish ? "Rotate shape" : "Xoay hình"}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              setDraggingHandle({
                                type: 'ROTATE',
                                elementId: id,
                                cx: x + w / 2,
                                cy: y + h / 2,
                                startRot: rotation || 0,
                                startPt: toSVGPoint(e),
                              })
                            }}
                          />

                          {isTriangle ? (
                            <>
                              {/* Dashed triangle outline */}
                              <polygon
                                points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
                                fill="none"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                pointerEvents="none"
                              />

                              {/* 3 Edge Drag Handles at midpoints (Kéo cạnh) */}
                              {[
                                { idx: 0, pt: m01, label: isEnglish ? 'Right edge' : 'Cạnh phải' },
                                { idx: 1, pt: m12, label: isEnglish ? 'Bottom edge' : 'Cạnh đáy' },
                                { idx: 2, pt: m20, label: isEnglish ? 'Left edge' : 'Cạnh trái' },
                              ].map((edge) => (
                                <g key={`edge-${edge.idx}`}>
                                  <rect
                                    x={edge.pt.x - 7}
                                    y={edge.pt.y - 7}
                                    width={14}
                                    height={14}
                                    rx={3}
                                    fill="#F59E0B"
                                    stroke="#FFFFFF"
                                    strokeWidth={2}
                                    style={{ cursor: 'move' }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation()
                                      saveHistory()
                                      setDraggingHandle({
                                        type: 'TRIANGLE_EDGE',
                                        elementId: id,
                                        edgeIndex: edge.idx,
                                        startPoints: tPts,
                                        startPt: toSVGPoint(e),
                                        areaX: x,
                                        areaY: y,
                                        areaW: w,
                                        areaH: h,
                                        rotation: rotation || 0,
                                      })
                                    }}
                                  >
                                    <title>{isEnglish ? `Drag to adjust ${edge.label}` : `Kéo để chỉnh ${edge.label}`}</title>
                                  </rect>
                                </g>
                              ))}

                              {/* 3 Vertex Drag Handles (Kéo đỉnh) */}
                              {[
                                { idx: 0, pt: p0, label: isEnglish ? 'Top vertex' : 'Đỉnh trên' },
                                { idx: 1, pt: p1, label: isEnglish ? 'Bottom-right vertex' : 'Đỉnh dưới phải' },
                                { idx: 2, pt: p2, label: isEnglish ? 'Bottom-left vertex' : 'Đỉnh dưới trái' },
                              ].map((vertex) => (
                                <circle
                                  key={`vertex-${vertex.idx}`}
                                  cx={vertex.pt.x}
                                  cy={vertex.pt.y}
                                  r={7}
                                  fill="#FFFFFF"
                                  stroke="#2563EB"
                                  strokeWidth={2.5}
                                  style={{ cursor: 'crosshair' }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    saveHistory()
                                    setDraggingHandle({
                                      type: 'TRIANGLE_VERTEX',
                                      elementId: id,
                                      vertexIndex: vertex.idx,
                                      startPoints: tPts,
                                      startPt: toSVGPoint(e),
                                      areaX: x,
                                      areaY: y,
                                      areaW: w,
                                      areaH: h,
                                      rotation: rotation || 0,
                                    })
                                  }}
                                >
                                  <title>{isEnglish ? `Drag to adjust ${vertex.label}` : `Kéo để chỉnh ${vertex.label}`}</title>
                                </circle>
                              ))}

                              {/* Bounding Corner Resize Handle (Bottom-Right) */}
                              <circle
                                cx={x + w}
                                cy={y + h}
                                r={6}
                                fill="white"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                style={{ cursor: 'nwse-resize' }}
                                title={isEnglish ? "Drag to resize W x H" : "Kéo dãn kích thước W x H"}
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  saveHistory()
                                  setDraggingHandle({
                                    type: 'RESIZE',
                                    elementId: id,
                                    startW: w,
                                    startH: h,
                                    startPt: toSVGPoint(e),
                                    cx: x + w / 2,
                                    cy: y + h / 2,
                                    rotation: rotation || 0,
                                  })
                                }}
                              />
                            </>
                          ) : (
                            <>
                              <circle
                                cx={x + w}
                                cy={y + h}
                                r={6}
                                fill="white"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                style={{ cursor: 'nwse-resize' }}
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  saveHistory()
                                  setDraggingHandle({
                                    type: 'RESIZE',
                                    elementId: id,
                                    startW: w,
                                    startH: h,
                                    startPt: toSVGPoint(e),
                                    cx: x + w / 2,
                                    cy: y + h / 2,
                                    rotation: rotation || 0,
                                  })
                                }}
                              />
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                rx={12}
                                fill="none"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                pointerEvents="none"
                              />
                            </>
                          )}
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
                    <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={isLightCanvas ? '#E2E8F0' : 'var(--color-panel-soft)'} rx={Math.min(a.w, a.h) > 20 ? 8 : 4} stroke={isLightCanvas ? '#94A3B8' : 'var(--color-border-soft)'} strokeWidth={2} />
                    <text
                      x={a.x + a.w / 2}
                      y={a.y + a.h / 2 + 5}
                      textAnchor="middle"
                      fill={isLightCanvas ? '#0F172A' : 'var(--color-content)'}
                      fontSize={12}
                      fontWeight="bold"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {isEnglish ? (translatePhrase(a.label, 'en') || a.label) : a.label}
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
                  const fill = seat.isDisabled
                    ? (isLightCanvas ? '#E2E8F0' : '#1E293B')
                    : zone
                      ? zone.color
                      : (isLightCanvas ? '#CBD5E1' : '#72787c')
                  const isSelected = selectedIds.has(seat.localId)
                  const isFillLight = isLightColor(fill)
                  const seatTextColor = seat.isDisabled ? '#94A3B8' : isFillLight ? '#0D1B2A' : '#FFFFFF'

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
                        stroke={isSelected
                          ? '#2563EB'
                          : seat.isDisabled
                            ? (isLightCanvas ? '#94A3B8' : '#475569')
                            : isLightCanvas
                              ? 'rgba(15, 23, 42, 0.3)'
                              : 'rgba(255, 255, 255, 0.12)'
                        }
                        strokeWidth={isSelected ? 3 : 1}
                        strokeDasharray={seat.isDisabled ? '2 2' : undefined}
                        opacity={seat.isDisabled ? (isLightCanvas ? 0.45 : 0.35) : 1}
                      />
                      <text
                        x={14}
                        y={18}
                        textAnchor="middle"
                        fontSize={8.5}
                        fill={seatTextColor}
                        fontWeight="800"
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

                {/* Smart Magnetic Guides khi kéo ghế */}
                {activeSnapGuides.x !== null && (
                  <line
                    x1={activeSnapGuides.x + SEAT_W / 2}
                    y1={-1000}
                    x2={activeSnapGuides.x + SEAT_W / 2}
                    y2={5000}
                    stroke="#3B82F6"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    pointerEvents="none"
                    opacity={0.85}
                  />
                )}
                {activeSnapGuides.y !== null && (
                  <line
                    x1={-1000}
                    y1={activeSnapGuides.y + SEAT_H / 2}
                    x2={5000}
                    y2={activeSnapGuides.y + SEAT_H / 2}
                    stroke="#3B82F6"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    pointerEvents="none"
                    opacity={0.85}
                  />
                )}
              </g>
            </svg>
          </div>
        </main>
      </div>
    </div>,
    document.body,
  )
}

/**
 * SeatMapPreview – component xem trước sơ đồ ghế (dùng trong chi tiết sự kiện & mua vé)
 */
export function SeatMapPreview({
  seatMap,
  seats: propSeats,
  zones: propZones,
  width: defaultWidth = 800,
  height = 300,
  interactive = false,
  mode = 'VIEW', // 'VIEW' | 'TOGGLE_DISABLE' | 'SELECT_SEATS'
  disabledSeatIds = [],
  selectedSeatIds = [],
  soldSeatIds = [],
  pausedSeatIds = [],
  onToggleSeat,
  showControls = true,
}) {
  const { isEnglish } = useLanguage()
  const containerRef = useRef(null)
  const [width, setWidth] = useState(defaultWidth)
  const [zoomLevel, setZoomLevel] = useState(1)

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

  const disabledSet = useMemo(() => new Set((disabledSeatIds || []).map(String)), [disabledSeatIds])
  const selectedSet = useMemo(() => new Set((selectedSeatIds || []).map(String)), [selectedSeatIds])
  const soldSet = useMemo(() => new Set((soldSeatIds || []).map(String)), [soldSeatIds])
  const pausedSet = useMemo(() => new Set((pausedSeatIds || []).map(String)), [pausedSeatIds])

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
  const baseScale = Math.min(scaleX, scaleY, 1)
  const scale = baseScale * zoomLevel

  const svgWidth = Math.max(width, originalW * scale + padding * 2)
  const svgHeight = Math.max(height, originalH * scale + padding * 2)

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
        {renderStageShapeBody(x, y, w, h, stageShape, stageColor, label, stagePos, isLightPreview)}
      </g>
    )
  }

  const isLightPreview = isLightColor(canvasBg)

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-border-soft/30 overflow-auto w-full select-none"
      style={{
        backgroundColor: canvasBg,
        backgroundImage: isLightPreview
          ? 'radial-gradient(circle, rgba(15, 23, 42, 0.18) 1.2px, transparent 1.2px)'
          : 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
        backgroundSize: `${20 * scale}px ${20 * scale}px`,
        width: '100%',
        height,
      }}
    >
      {/* Zoom controls for interactive modes */}
      {(interactive || showControls) && (
        <div className="sticky top-2 right-2 float-right z-10 mr-2 mb-[-36px] flex items-center gap-1 rounded-lg bg-[#0b1329]/90 border border-white/10 px-2 py-1 backdrop-blur-md shadow-lg text-xs text-white">
          <button
            type="button"
            title="Thu nhỏ"
            onClick={() => setZoomLevel((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))}
            className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="font-mono text-[11px] px-1 text-amber-300 font-bold min-w-[36px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            title="Phóng to"
            onClick={() => setZoomLevel((z) => Math.min(2.5, Math.round((z + 0.2) * 10) / 10))}
            className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
          >
            <Plus className="size-3.5" />
          </button>
          {zoomLevel !== 1 && (
            <button
              type="button"
              title="Khôi phục kích thước ban đầu"
              onClick={() => setZoomLevel(1)}
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 hover:bg-white/20 text-slate-200 transition"
            >
              Fit
            </button>
          )}
        </div>
      )}

      <svg width={svgWidth} height={svgHeight}>
        <g transform={`translate(${(svgWidth - originalW * scale) / 2}, ${(svgHeight - originalH * scale) / 2}) scale(${scale})`}>
          {renderStage()}

          {/* Standing Areas */}
          {standingAreas.map((a) => {
            const isTriangle = a.shape === 'TRIANGLE'
            const tPts = isTriangle ? getTrianglePoints(a) : null
            const ax = a.x - minX
            const ay = a.y - minY
            const p0 = isTriangle ? { x: ax + a.w * tPts[0].x, y: ay + a.h * tPts[0].y } : null
            const p1 = isTriangle ? { x: ax + a.w * tPts[1].x, y: ay + a.h * tPts[1].y } : null
            const p2 = isTriangle ? { x: ax + a.w * tPts[2].x, y: ay + a.h * tPts[2].y } : null
            const cx = isTriangle ? (p0.x + p1.x + p2.x) / 3 : ax + a.w / 2
            const cy = isTriangle ? (p0.y + p1.y + p2.y) / 3 : ay + a.h / 2

            return (
              <g key={a.id} transform={a.rotation ? `rotate(${a.rotation}, ${ax + a.w / 2}, ${ay + a.h / 2})` : undefined}>
                {isTriangle ? (
                  <polygon
                    points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
                    fill={a.color || '#EF4444'}
                    fillOpacity={isLightPreview ? 0.35 : 0.25}
                    stroke={a.color || '#EF4444'}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                ) : a.shape === 'CIRCLE' ? (
                  <ellipse
                    cx={ax + a.w / 2}
                    cy={ay + a.h / 2}
                    rx={a.w / 2}
                    ry={a.h / 2}
                    fill={a.color || '#EF4444'}
                    fillOpacity={isLightPreview ? 0.35 : 0.25}
                    stroke={a.color || '#EF4444'}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                ) : a.shape === 'DIAMOND' ? (
                  <polygon
                    points={`${ax + a.w / 2},${ay} ${ax + a.w},${ay + a.h / 2} ${ax + a.w / 2},${ay + a.h} ${ax},${ay + a.h / 2}`}
                    fill={a.color || '#EF4444'}
                    fillOpacity={isLightPreview ? 0.35 : 0.25}
                    stroke={a.color || '#EF4444'}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                ) : (
                  <rect
                    x={ax}
                    y={ay}
                    width={a.w}
                    height={a.h}
                    rx={12}
                    fill={a.color || '#EF4444'}
                    fillOpacity={isLightPreview ? 0.35 : 0.25}
                    stroke={a.color || '#EF4444'}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                )}
                <text
                  x={cx}
                  y={cy - 6}
                  textAnchor="middle"
                  fill={isLightPreview ? '#0F172A' : 'white'}
                  fontSize={13}
                  fontWeight="800"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {a.name || 'Vùng đứng'}
                </text>
                <text
                  x={cx}
                  y={cy + 12}
                  textAnchor="middle"
                  fill={isLightPreview ? '#334155' : 'rgba(255,255,255,0.85)'}
                  fontSize={11}
                  fontWeight="700"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  Sức chứa: {a.capacity || 0} người
                </text>
              </g>
            )
          })}

          {/* Auxiliary Elements */}
          {seatMap?.config?.auxiliaryElements?.map((a) => (
            <g key={a.id} transform={a.rotation ? `rotate(${a.rotation}, ${a.x - minX + a.w / 2}, ${a.y - minY + a.h / 2})` : undefined}>
              <rect
                x={a.x - minX}
                y={a.y - minY}
                width={a.w}
                height={a.h}
                fill={isLightPreview ? '#E2E8F0' : 'var(--color-panel-soft)'}
                rx={Math.min(a.w, a.h) > 20 ? 8 : 4}
                stroke={isLightPreview ? '#94A3B8' : 'var(--color-border-soft)'}
                strokeWidth={2}
              />
              <text
                x={a.x - minX + a.w / 2}
                y={a.y - minY + a.h / 2 + 5}
                textAnchor="middle"
                fill={isLightPreview ? '#0F172A' : 'var(--color-content)'}
                fontSize={12}
                fontWeight="800"
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
            const sId = String(s.id || s.seat_id || s.localId || '')
            const rowLabel = s.row_label ?? s.rowLabel ?? ''
            const seatNumber = s.seat_number ?? s.seatNumber ?? ''
            const label = `${rowLabel}${seatNumber}`

            const isSold = soldSet.has(sId) || s.status === 'SOLD'
            const isPaused = pausedSet.has(sId) || (mode !== 'TOGGLE_DISABLE' && s.status === 'BLOCKED')
            const isExplicitlyDisabled = disabledSet.has(sId) || Boolean(s.is_disabled ?? s.isDisabled)
            const isDisabled = mode === 'TOGGLE_DISABLE' ? isExplicitlyDisabled : false
            const isSelected = selectedSet.has(sId)

            let fill = zoneColorById.get(s.zone_id ?? s.zoneLocalId ?? s.zone?.id) ?? (isLightPreview ? '#CBD5E1' : '#64748B')
            let stroke = isLightPreview ? 'rgba(15, 23, 42, 0.3)' : 'rgba(255,255,255,0.1)'
            let strokeWidth = 1
            let opacity = 1
            let cursor = interactive ? 'pointer' : 'default'
            let tooltipText = `${label} • Đang hoạt động`

            if (isSold) {
              fill = '#1E293B'
              stroke = '#334155'
              opacity = 0.35
              cursor = 'not-allowed'
              tooltipText = `${label} • Đã bán (Không thể thao tác)`
            } else if (mode === 'TOGGLE_DISABLE') {
              if (isDisabled) {
                fill = '#1E293B'
                stroke = '#475569'
                strokeWidth = 1
                opacity = 0.35
                tooltipText = `${label} • Đã vô hiệu hóa (Bấm để mở lại)`
              } else {
                tooltipText = `${label} • Đang mở bán (Bấm để vô hiệu hóa)`
              }
            } else if (mode === 'SELECT_SEATS') {
              if (isSelected) {
                fill = '#F59E0B'
                stroke = '#FDE68A'
                strokeWidth = 2.5
                opacity = 1
                tooltipText = `${label} • Đang chọn`
              } else if (isPaused) {
                fill = '#EF4444'
                stroke = '#DC2626'
                strokeWidth = 1.5
                opacity = 0.7
                tooltipText = `${label} • Đang tạm dừng bán (Bấm để chọn)`
              } else {
                tooltipText = `${label} • Đang mở bán (Bấm để chọn tạm dừng)`
              }
            } else if (s.is_disabled ?? s.isDisabled) {
              fill = isLightPreview ? '#E2E8F0' : '#1E293B'
              stroke = isLightPreview ? '#94A3B8' : '#475569'
              strokeWidth = 1
              opacity = isLightPreview ? 0.45 : 0.35
              tooltipText = `${label} • Vô hiệu hóa`
            }

            const isSeatDisabled = (mode === 'TOGGLE_DISABLE' && isDisabled) || Boolean(s.is_disabled ?? s.isDisabled)
            const isFillLight = isLightColor(fill)
            const seatTextColor = isSold || isSeatDisabled ? '#64748B' : isFillLight ? '#0D1B2A' : '#FFFFFF'

            return (
              <g
                key={sId || `${rowLabel}-${seatNumber}`}
                transform={`translate(${x},${y})`}
                onClick={() => {
                  if (!interactive || isSold) return
                  if (onToggleSeat) {
                    onToggleSeat({
                      ...s,
                      id: s.id || s.seat_id || s.localId,
                      seat_id: s.seat_id || s.id,
                      row_label: rowLabel,
                      seat_number: seatNumber,
                      label,
                      is_disabled: isDisabled,
                      is_paused: isPaused,
                      is_selected: isSelected,
                    })
                  }
                }}
                style={{ cursor }}
                className={interactive && !isSold ? 'hover:brightness-125 transition-all' : ''}
              >
                <title>{tooltipText}</title>
                <rect
                  width={28}
                  height={28}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isSeatDisabled ? '2 2' : undefined}
                  opacity={opacity}
                />
                <text
                  x={14}
                  y={18}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill={seatTextColor}
                  fontWeight="800"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
