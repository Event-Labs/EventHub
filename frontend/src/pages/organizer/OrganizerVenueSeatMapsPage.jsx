import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerTable,
} from './OrganizerComponents.jsx'
import { getVenue, getVenueSeatMaps } from '@/services/organizerVenues.js'
import { deleteSeatMap } from '@/services/organizerSeatMaps.js'
import { SeatMapEditor } from './SeatMapEditor.jsx'

export function OrganizerVenueSeatMapsPage() {
  const { venueId } = useParams()
  const navigate = useNavigate()
  const [venue, setVenue] = useState(null)
  const [seatMaps, setSeatMaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSeatMapId, setEditingSeatMapId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [venueData, maps] = await Promise.all([
        getVenue(venueId),
        getVenueSeatMaps(venueId),
      ])
      setVenue(venueData)
      setSeatMaps(maps)
    } catch (err) {
      console.error(err)
      setMessage('Không thể tải dữ liệu sơ đồ ghế.')
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

  async function handleDelete(seatMapId) {
    if (!window.confirm('Xóa sơ đồ ghế này?')) return
    try {
      await deleteSeatMap(seatMapId)
      setMessage('Đã xóa sơ đồ ghế.')
      loadData()
    } catch (err) {
      console.error(err)
      setMessage(err.response?.data?.message || 'Không thể xóa sơ đồ ghế.')
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
      eyebrow={`Địa điểm / ${venue?.name || '...'} / Sơ đồ ghế`}
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
            sm.seat_count ?? 0,
            sm.zone_count ?? 0,
            <Badge key="status" tone={sm.is_active ? 'green' : 'gray'}>
              {sm.is_active ? 'Đang hoạt động' : 'Không hoạt động'}
            </Badge>,
            <div key="actions" className="flex items-center gap-3 text-muted">
              <button type="button" onClick={() => openEditor(sm.id)} title="Sửa">
                <Pencil className="size-4 hover:text-tertiary transition-colors" />
              </button>
              <button type="button" onClick={() => handleDelete(sm.id)} title="Xóa">
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

      {editorOpen && (
        <SeatMapEditor
          venueId={venueId}
          seatMapId={editingSeatMapId}
          onSave={() => {
            setMessage(editingSeatMapId ? 'Đã cập nhật sơ đồ ghế.' : 'Đã tạo sơ đồ ghế mới.')
            closeEditor()
            loadData()
          }}
          onClose={closeEditor}
        />
      )}
    </OrganizerPage>
  )
}
