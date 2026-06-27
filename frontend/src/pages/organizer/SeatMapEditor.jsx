import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Eraser,
  Hand,
  MousePointer2,
  Paintbrush,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { createSeatMap, getSeatMap, updateSeatMap } from '@/services/organizerSeatMaps.js'

const SEAT_W = 28
const SEAT_H = 28
const GAP_X = 6
const GAP_Y = 8
const SNAP_X = SEAT_W + GAP_X
const SNAP_Y = SEAT_H + GAP_Y
const STAGE_OFFSET_Y = 70
const ZONE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']

const TOOLS = [
  { id: 'SELECT', label: 'Chọn', icon: MousePointer2, shortcut: 'V' },
  { id: 'ADD', label: 'Vẽ ghế', icon: Plus, shortcut: 'A', freeformOnly: true },
  { id: 'PAINT', label: 'Tô zone', icon: Paintbrush, shortcut: 'P' },
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

function snapPoint(x, y) {
  return {
    x: Math.round(x / SNAP_X) * SNAP_X,
    y: Math.max(STAGE_OFFSET_Y, Math.round((y - STAGE_OFFSET_Y) / SNAP_Y) * SNAP_Y + STAGE_OFFSET_Y),
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

export function SeatMapEditor({ venueId, seatMapId, onSave, onClose }) {
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

  const seatsRef = useRef(seats)
  seatsRef.current = seats

  useEffect(() => {
    if (!seatMapId) return
    setLoading(true)
    getSeatMap(seatMapId)
      .then((sm) => {
        setMapName(sm.name)
        setLayoutType(sm.layout_type || 'GRID')
        setGridConfig({ rows: sm.rows_count || 10, cols: sm.cols_count || 20 })
        setZones((sm.zones || []).map((z) => ({ localId: z.id, name: z.name, color: z.color })))
        const loaded = (sm.seats || []).map((s) => ({
          localId: s.id,
          rowLabel: s.row_label,
          seatNumber: s.seat_number,
          x: s.x_position,
          y: s.y_position,
          zoneLocalId: s.zone_id,
          isDisabled: s.is_disabled,
        }))
        setSeats(loaded)
        seatCounter.current = loaded.length + 1
      })
      .catch((err) => {
        console.error(err)
        setError('Không thể tải sơ đồ ghế.')
      })
      .finally(() => setLoading(false))
  }, [seatMapId])

  const activeZone = zones.find((z) => z.localId === activeZoneId)
  const selectedCount = selectedIds.size

  const stats = useMemo(() => {
    const active = seats.filter((s) => !s.isDisabled).length
    const disabled = seats.length - active
    const zoned = seats.filter((s) => s.zoneLocalId && !s.isDisabled).length
    return { total: seats.length, active, disabled, zoned, unassigned: active - zoned }
  }, [seats])

  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return
    setSeats((prev) => prev.filter((s) => !selectedIds.has(s.localId)))
    setSelectedIds(new Set())
  }, [selectedIds])

  const applyZoneToSelected = useCallback(
    (zoneId) => {
      if (!selectedIds.size) return
      setSeats((prev) =>
        prev.map((s) => (selectedIds.has(s.localId) ? { ...s, zoneLocalId: zoneId } : s)),
      )
    },
    [selectedIds],
  )

  const disableSelected = useCallback(() => {
    if (!selectedIds.size) return
    setSeats((prev) =>
      prev.map((s) => (selectedIds.has(s.localId) ? { ...s, isDisabled: true } : s)),
    )
  }, [selectedIds])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const key = e.key.toLowerCase()
      if (key === 'delete' || key === 'backspace') {
        if (selectedIds.size) {
          e.preventDefault()
          deleteSelected()
        }
      }
      if (key === 'escape') {
        setSelectedIds(new Set())
        setRubberBand(null)
      }
      const matched = TOOLS.find((t) => t.shortcut.toLowerCase() === key)
      if (matched && !(matched.freeformOnly && layoutType === 'GRID')) {
        setTool(matched.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, deleteSelected, layoutType])

  function toSVGPoint(e) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    }
  }

  function generateGrid() {
    const newSeats = []
    for (let r = 0; r < gridConfig.rows; r += 1) {
      const rowLabel = rowLabelForIndex(r)
      for (let c = 0; c < gridConfig.cols; c += 1) {
        newSeats.push({
          localId: newLocalId(),
          rowLabel,
          seatNumber: String(c + 1),
          x: c * SNAP_X,
          y: STAGE_OFFSET_Y + r * SNAP_Y,
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
    setZones((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        name: `Zone ${prev.length + 1}`,
        color: ZONE_COLORS[prev.length % ZONE_COLORS.length],
      },
    ])
  }

  function deleteZone(zoneLocalId) {
    setZones((prev) => prev.filter((z) => z.localId !== zoneLocalId))
    setSeats((prev) =>
      prev.map((s) => (s.zoneLocalId === zoneLocalId ? { ...s, zoneLocalId: null } : s)),
    )
    if (activeZoneId === zoneLocalId) setActiveZoneId(null)
  }

  function handlePaintAt(pt) {
    if (tool === 'ADD' && layoutType !== 'GRID') {
      const pos = snapEnabled
        ? snapPoint(pt.x, pt.y)
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
    }
  }

  function handleMouseMove(e) {
    if (isPanning && panStart) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      return
    }
    const pt = toSVGPoint(e)

    if (isPainting) {
      handlePaintAt(pt)
      return
    }

    if (rubberBand) {
      setRubberBand((rb) => ({ ...rb, x2: pt.x, y2: pt.y }))
    }
  }

  function handleMouseUp() {
    setIsPanning(false)
    setIsPainting(false)
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
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (e.shiftKey) {
            if (next.has(seat.localId)) next.delete(seat.localId)
            else next.add(seat.localId)
          } else {
            next.clear()
            next.add(seat.localId)
          }
          return next
        })
      }
    }
  }

  function handleWheel(e) {
    setZoom((z) => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)))
  }

  async function handleSave() {
    if (!mapName.trim()) {
      setError('Vui lòng nhập tên sơ đồ')
      return
    }
    if (!seats.length) {
      setError('Sơ đồ cần có ít nhất 1 ghế')
      return
    }
    if (seats.length > 2000) {
      setError('Tối đa 2000 ghế mỗi sơ đồ')
      return
    }

    const zoneIndexMap = {}
    zones.forEach((z, i) => {
      zoneIndexMap[z.localId] = i
    })

    const normalizedSeats = normalizeSeatsForSave(seats)

    const payload = {
      name: mapName,
      layout_type: layoutType,
      canvas_width: 900,
      canvas_height: 600,
      config: { stageLabel: 'SÂN KHẤU / STAGE', stageHeight: 52 },
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
      setError(err.response?.data?.message || 'Lỗi khi lưu sơ đồ')
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
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-soft/30 bg-surface/90 px-4 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-3 py-1.5 text-sm text-muted transition hover:bg-panel-soft hover:text-content"
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
        <div className="hidden items-center gap-2 sm:flex">
          <span className="rounded-xl bg-panel-soft border border-border-soft/20 px-3 py-1 text-xs font-semibold text-content">
            {stats.total} ghế
          </span>
          {stats.total > 1800 && (
            <span className="text-xs font-medium text-warning animate-pulse">Gần giới hạn 2000</span>
          )}
        </div>
        {error && <span className="max-w-[200px] truncate text-sm text-error font-semibold">{error}</span>}
        <button type="button" onClick={handleSave} disabled={saving} className="org-btn-primary min-w-[100px]">
          {saving ? 'Đang lưu...' : 'Lưu sơ đồ'}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-border-soft/30 bg-surface/90 backdrop-blur-sm text-content">
          <div className="space-y-4 p-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Tổng ghế', stats.total, 'var(--color-content)'],
                ['Hoạt động', stats.active, 'var(--color-success)'],
                ['Đã gán zone', stats.zoned, 'var(--color-primary)'],
                ['Chưa gán', stats.unassigned, 'var(--color-neutral)'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-border-soft/30 bg-panel-soft p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
                  <p className="text-xl font-extrabold" style={{ color }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* Layout type */}
            <section className="rounded-xl border border-border-soft/20 p-3 bg-panel-soft/10">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Loại layout</p>
              <div className="grid grid-cols-3 gap-1">
                {[
                  ['GRID', 'Lưới'],
                  ['FREEFORM', 'Tự do'],
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
            </section>

            {/* Grid config */}
            {layoutType === 'GRID' && (
              <section className="rounded-xl border border-border-soft/20 p-3 bg-panel-soft/10">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Cấu hình lưới</p>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="text-xs text-subtle">
                    Hàng
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={gridConfig.rows}
                      onChange={(e) => setGridConfig((g) => ({ ...g, rows: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-2 py-1.5 text-sm text-content outline-none focus:border-primary"
                    />
                  </label>
                  <label className="text-xs text-subtle">
                    Cột
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={gridConfig.cols}
                      onChange={(e) => setGridConfig((g) => ({ ...g, cols: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-2 py-1.5 text-sm text-content outline-none focus:border-primary"
                    />
                  </label>
                </div>
                <button type="button" onClick={generateGrid} className="org-btn-primary w-full text-sm">
                  Tạo lưới ghế
                </button>
              </section>
            )}

            {layoutType !== 'GRID' && (
              <section className="rounded-xl border border-border-soft/20 p-3 bg-panel-soft/10">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-subtle">
                  <input
                    type="checkbox"
                    checked={snapEnabled}
                    onChange={(e) => setSnapEnabled(e.target.checked)}
                    className="rounded border-border-soft/40 bg-panel-soft accent-primary"
                  />
                  Snap vào lưới khi vẽ
                </label>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Dùng công cụ <b>Vẽ ghế</b> — click hoặc kéo để đặt nhiều ghế cùng lúc.
                </p>
              </section>
            )}

            {/* Zones */}
            <section className="rounded-xl border border-border-soft/20 p-3 bg-panel-soft/10">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Khu vực (Zones)</p>
                <button type="button" onClick={addZone} className="text-xs font-bold text-primary hover:underline">
                  + Thêm zone
                </button>
              </div>
              <div className="space-y-1.5">
                {zones.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted">Chưa có zone nào</p>
                )}
                {zones.map((zone) => {
                  const count = seats.filter((s) => s.zoneLocalId === zone.localId).length
                  const isActive = activeZoneId === zone.localId
                  return (
                    <div
                      key={zone.localId}
                      onClick={() => setActiveZoneId(isActive ? null : zone.localId)}
                      className={`group flex cursor-pointer items-center gap-2 rounded-xl border-2 p-2 transition-all ${
                        isActive
                          ? 'border-primary bg-tertiary/10 shadow-sm'
                          : 'border-transparent hover:border-border-soft/20 hover:bg-panel-soft/60'
                      }`}
                    >
                      <input
                        type="color"
                        value={zone.color}
                        onChange={(e) =>
                          setZones((prev) =>
                            prev.map((z) =>
                              z.localId === zone.localId ? { ...z, color: e.target.value } : z,
                            ),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-6 cursor-pointer rounded-md border-0 p-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={zone.name}
                        onChange={(e) =>
                          setZones((prev) =>
                            prev.map((z) =>
                              z.localId === zone.localId ? { ...z, name: e.target.value } : z,
                            ),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none text-content"
                      />
                      <span className="rounded-full bg-surface/50 border border-border-soft/20 px-2 py-0.5 text-[10px] font-bold text-muted shadow-sm">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteZone(zone.localId)
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-muted hover:text-error text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Help */}
            <section className="rounded-xl border border-dashed border-border-soft/30 bg-panel-soft/30 p-3">
              <p className="mb-1 text-xs font-bold text-subtle">Phím tắt</p>
              <ul className="space-y-0.5 text-[11px] leading-relaxed text-muted">
                <li><kbd className="rounded bg-surface border border-border-soft/25 px-1 text-content">V</kbd> Chọn · <kbd className="rounded bg-surface border border-border-soft/25 px-1 text-content">A</kbd> Vẽ · <kbd className="rounded bg-surface border border-border-soft/25 px-1 text-content">P</kbd> Tô zone</li>
                <li><kbd className="rounded bg-surface border border-border-soft/25 px-1 text-content">E</kbd> Xóa · <kbd className="rounded bg-surface border border-border-soft/25 px-1 text-content">Del</kbd> Xóa đã chọn</li>
                <li>Shift+click chọn nhiều · Kéo vùng chọn hàng loạt</li>
                <li>Alt+kéo hoặc giữ chuột giữa để pan</li>
              </ul>
            </section>
          </div>
        </aside>

        {/* Canvas area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-soft/30 bg-surface/90 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-1 rounded-xl border border-border-soft/30 bg-panel-soft p-1">
              {visibleTools.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setTool(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    tool === id
                      ? 'bg-surface text-content border border-border-soft/20 shadow-md'
                      : 'text-subtle hover:bg-panel-soft/60'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden md:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="h-6 w-px bg-border-soft/20" />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
                className="rounded-lg p-1.5 text-subtle hover:bg-panel-soft"
                title="Thu nhỏ"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="min-w-[44px] text-center text-xs font-semibold text-subtle">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                className="rounded-lg p-1.5 text-subtle hover:bg-panel-soft"
                title="Phóng to"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 40, y: 80 })
                }}
                className="ml-1 rounded-lg px-2.5 py-1 text-xs text-muted hover:bg-panel-soft transition-colors"
              >
                Reset
              </button>
            </div>

            {activeZone && (tool === 'PAINT' || tool === 'SELECT') && (
              <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning animate-in fade-in">
                <div className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: activeZone.color }} />
                <span>
                  Đang tô: <b>{activeZone.name}</b>
                </span>
                <button type="button" onClick={() => setActiveZoneId(null)} className="text-muted hover:text-warning ml-1">
                  ✕
                </button>
              </div>
            )}

            {tool === 'PAINT' && !activeZone && (
              <span className="text-xs text-warning font-semibold">← Chọn zone ở panel trái để tô màu</span>
            )}
          </div>

          {/* Selection action bar */}
          {selectedCount > 0 && (
            <div className="flex shrink-0 items-center gap-3 border-b border-tertiary/20 bg-tertiary/10 px-4 py-2 text-content animate-in slide-in-from-top duration-200">
              <span className="text-sm font-bold text-primary">
                {selectedCount} ghế đã chọn
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {zones.length > 0 && (
                  <select
                    className="h-8 rounded-xl border border-border-soft/40 bg-panel-soft px-2 text-xs text-content outline-none focus:border-primary"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) applyZoneToSelected(e.target.value)
                      e.target.value = ''
                    }}
                  >
                    <option value="" className="bg-surface text-content">Gán zone...</option>
                    {zones.map((z) => (
                      <option key={z.localId} value={z.localId} className="bg-surface text-content">
                        {z.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={disableSelected}
                  className="flex items-center gap-1 rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-xs font-semibold text-content hover:bg-panel-soft/80 transition-colors"
                >
                  <Ban className="size-3" />
                  Vô hiệu
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="flex items-center gap-1 rounded-xl border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/20 transition-colors"
                >
                  <Trash2 className="size-3" />
                  Xóa ({selectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted hover:text-content font-bold transition-colors"
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
              backgroundColor: 'var(--color-background)',
              backgroundImage: 'radial-gradient(circle, var(--color-border-soft) 1px, transparent 1px)',
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            }}
            onWheel={handleWheel}
          >
            <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-xl bg-surface/90 border border-border-soft/20 px-2.5 py-1 text-[10px] text-muted shadow-lg backdrop-blur">
              <Hand className="size-3" />
              Alt + kéo để di chuyển bản đồ
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
                <rect x={0} y={0} width={900} height={52} fill="var(--color-panel-soft)" rx={12} />
                <rect x={0} y={48} width={900} height={4} fill="var(--color-border-soft)" rx={0} />
                <text
                  x={450}
                  y={32}
                  textAnchor="middle"
                  fill="var(--color-content)"
                  fontSize={13}
                  fontWeight="bold"
                  style={{ userSelect: 'none' }}
                >
                  SÂN KHẤU / STAGE
                </text>

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
                        stroke={
                          isSelected
                            ? 'var(--color-tertiary)'
                            : activeZoneId && !seat.isDisabled
                              ? '#ffffff50'
                              : 'rgba(255,255,255,0.08)'
                        }
                        strokeWidth={isSelected ? 2.5 : 1}
                        opacity={seat.isDisabled ? 0.4 : 1}
                        filter={isSelected ? 'url(#seatGlow)' : undefined}
                      />
                      <text
                        x={14}
                        y={18}
                        textAnchor="middle"
                        fontSize={7}
                        fill="white"
                        fontWeight="700"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {seat.rowLabel}
                        {seat.seatNumber}
                      </text>
                    </g>
                  )
                })}

                {/* Rubber band */}
                {rubberBand && (
                  <rect
                    x={Math.min(rubberBand.x1, rubberBand.x2)}
                    y={Math.min(rubberBand.y1, rubberBand.y2)}
                    width={Math.abs(rubberBand.x2 - rubberBand.x1)}
                    height={Math.abs(rubberBand.y2 - rubberBand.y1)}
                    fill="rgba(59,130,246,0.1)"
                    stroke="#3B82F6"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    rx={2}
                  />
                )}

                <defs>
                  <filter id="seatGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#FBBF24" floodOpacity="0.8" />
                  </filter>
                </defs>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SeatMapPreview({ seats, zones, width = 300, height = 200 }) {
  if (!seats?.length) return null
  const allX = seats.map((s) => s.x_position ?? s.x)
  const allY = seats.map((s) => s.y_position ?? s.y)
  const minX = Math.min(...allX)
  const maxX = Math.max(...allX)
  const minY = Math.min(...allY)
  const maxY = Math.max(...allY)
  const scaleX = (width - 20) / (maxX - minX + 28)
  const scaleY = (height - 20) / (maxY - minY + 28)
  const scale = Math.min(scaleX, scaleY, 1)

  return (
    <svg width={width} height={height} className="rounded-xl border border-border-soft/30 bg-panel-soft/30">
      <g transform={`translate(10,10) scale(${scale})`}>
        {seats.map((s) => {
          const x = (s.x_position ?? s.x) - minX
          const y = (s.y_position ?? s.y) - minY
          const zone = zones?.find((z) => z.id === (s.zone_id ?? s.zoneLocalId))
          return (
            <rect
              key={s.id || s.localId}
              x={x}
              y={y}
              width={28}
              height={28}
              rx={4}
              fill={zone?.color ?? 'var(--color-neutral)'}
              opacity={0.85}
            />
          )
        })}
      </g>
    </svg>
  )
}
