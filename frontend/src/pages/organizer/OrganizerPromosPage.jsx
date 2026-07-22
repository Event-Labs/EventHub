import { useState, useEffect, useCallback } from 'react'
import { 
  Pencil, 
  Trash2, 
  Eye, 
  Plus, 
  Search, 
  AlertCircle,
  Percent,
  DollarSign,
  Loader2
} from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerPanel,
  OrganizerTable,
} from './OrganizerComponents.jsx'
import { Modal } from '../../components/Modal.jsx'
import promotionService from '../../services/promotions'
import { fetchOrganizerEvents } from '../../services/organizerEvents'
import { useToast } from '@/providers/ToastProvider.jsx'

const STATUS_LABELS = {
  Active: 'Đang hoạt động',
  Scheduled: 'Đã lên lịch',
  Expired: 'Hết hạn',
  Inactive: 'Ngừng hoạt động',
}

const STATUS_OPTIONS = [
  { value: 'All Statuses', label: 'Tất cả trạng thái' },
  { value: 'Active', label: STATUS_LABELS.Active },
  { value: 'Scheduled', label: STATUS_LABELS.Scheduled },
  { value: 'Expired', label: STATUS_LABELS.Expired },
  { value: 'Inactive', label: STATUS_LABELS.Inactive },
]

const DEFAULT_FILTERS = { keyword: '', status: 'All Statuses' }

const formatVnd = (value) => Number(value || 0).toLocaleString('vi-VN', {
  style: 'currency',
  currency: 'VND',
})

const PROMO_MESSAGE_LABELS = {
  'Promo code has already been used and cannot be deleted': 'Mã khuyến mãi đã được sử dụng và không thể xóa',
  'Promo code already exists': 'Mã khuyến mãi đã tồn tại',
  'Promo code not found': 'Không tìm thấy mã khuyến mãi',
  'Discount type must be PERCENTAGE or FIXED': 'Loại giảm giá không hợp lệ',
  'Discount value must be a number': 'Giá trị giảm phải là số',
  'Discount value must be positive': 'Giá trị giảm phải lớn hơn 0',
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status
}

function getStatusTone(status) {
  switch (status) {
    case 'Active': return 'green'
    case 'Scheduled': return 'blue'
    case 'Expired': return 'gray'
    case 'Inactive': return 'red'
    default: return 'blue'
  }
}

function getPromoMessage(message, fallback) {
  if (!message) return fallback
  return PROMO_MESSAGE_LABELS[message] || (/[À-ỹ]/.test(message) ? message : fallback)
}

function formatPromoDate(date) {
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateRange(start, end) {
  return `${formatPromoDate(start)} - ${formatPromoDate(end)}`
}

function formatPromoDateTime(date) {
  const value = new Date(date)
  const time = value.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `${formatPromoDate(value)} ${time}`
}

export function OrganizerPromosPage() {
  const toast = useToast()
  const [promos, setPromos] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  
  const [selectedPromo, setSelectedPromo] = useState(null)
  const [formData, setFormData] = useState({
    code: '',
    applyToAllEvents: true,
    eventIds: [],
    discount_type: 'PERCENTAGE',
    discount_value: '',
    usage_limit: '',
    start_time: '',
    end_time: '',
    min_order_value: '',
    max_discount: '',
  })
  const [formErrors, setFormErrors] = useState({})

  const fetchData = useCallback(async (currentFilters) => {
    setLoading(true)
    try {
      const response = await promotionService.getAllPromos(currentFilters)
      setPromos(response.data.data)
    } catch (error) {
      console.error('Error fetching promos:', error)
      toast.error('Không thể tải danh sách mã khuyến mãi.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const fetchEvents = useCallback(async () => {
    try {
      const eventsList = await fetchOrganizerEvents()
      setEvents(Array.isArray(eventsList) ? eventsList : [])
    } catch (error) {
      console.error('Error fetching events:', error)
      toast.error('Không thể tải danh sách sự kiện.')
    }
  }, [toast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(DEFAULT_FILTERS)
    fetchEvents()
  }, [fetchData, fetchEvents])

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    fetchData(newFilters)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormErrors({})
    
    if (!formData.applyToAllEvents && !formData.eventIds?.length) {
      setFormErrors({ eventIds: 'Vui lòng chọn ít nhất 1 sự kiện áp dụng' })
      return
    }

    try {
      // Clean data before sending
      const submissionData = {
        ...formData,
        applyToAllEvents: Boolean(formData.applyToAllEvents),
        eventIds: formData.applyToAllEvents ? [] : formData.eventIds,
        event_id: formData.applyToAllEvents ? null : formData.eventIds[0],
        discount_value: Number(formData.discount_value),
        min_order_value: formData.min_order_value === '' ? 0 : Number(formData.min_order_value),
        max_discount: formData.discount_type === 'PERCENTAGE' && formData.max_discount !== '' ? Number(formData.max_discount) : null,
        usage_limit: formData.usage_limit === '' ? null : Number(formData.usage_limit),
      };

      await promotionService.createPromo(submissionData)
      setShowCreateModal(false)
      resetForm()
      fetchData(filters)
      toast.success('Đã tạo mã khuyến mãi.')
    } catch (error) {
       if (error.response?.data?.errorCode === 'VALIDATION_ERROR') {
         const issues = error.response.data.data || []
         const errors = {}
         issues.forEach(issue => {
           errors[issue.path[0]] = getPromoMessage(issue.message, 'Dữ liệu không hợp lệ')
         })
         setFormErrors(errors)
       } else {
         toast.error(getPromoMessage(error?.response?.data?.message, 'Không thể tạo mã khuyến mãi.'))
       }
     }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    setFormErrors({})

    if (!formData.applyToAllEvents && !formData.eventIds?.length) {
      setFormErrors({ eventIds: 'Vui lòng chọn ít nhất 1 sự kiện áp dụng' })
      return
    }

    try {
      const submissionData = {
        ...formData,
        applyToAllEvents: Boolean(formData.applyToAllEvents),
        eventIds: formData.applyToAllEvents ? [] : formData.eventIds,
        event_id: formData.applyToAllEvents ? null : formData.eventIds[0],
        usage_limit: formData.usage_limit === '' ? null : Number(formData.usage_limit),
        min_order_value: formData.min_order_value === '' ? 0 : Number(formData.min_order_value),
        max_discount: formData.discount_type === 'PERCENTAGE' && formData.max_discount !== '' ? Number(formData.max_discount) : null,
        discount_value: Number(formData.discount_value),
      }
      await promotionService.updatePromo(selectedPromo.id, submissionData)
      setShowEditModal(false)
      resetForm()
      fetchData(filters)
      toast.success('Đã cập nhật mã khuyến mãi.')
    } catch (error) {
       if (error.response?.data?.errorCode === 'VALIDATION_ERROR') {
         const issues = error.response.data.data || []
         const errors = {}
         issues.forEach(issue => {
           errors[issue.path[0]] = getPromoMessage(issue.message, 'Dữ liệu không hợp lệ')
         })
         setFormErrors(errors)
       } else {
         toast.error(getPromoMessage(error?.response?.data?.message, 'Không thể cập nhật mã khuyến mãi.'))
       }
    }
  }

  const handleDelete = async () => {
    const usageCount = Number(selectedPromo?.usage_count || selectedPromo?.used_count || 0)
    if (usageCount > 0) {
      toast.error('Mã khuyến mãi đã được sử dụng và không thể xóa.')
      setShowDeleteModal(false)
      return
    }
    try {
      await promotionService.deactivatePromo(selectedPromo.id)
      setShowDeleteModal(false)
      fetchData(filters)
      toast.success('Đã ngừng hoạt động mã khuyến mãi.')
    } catch (error) {
       console.error('Error deactivating promo:', error)
       toast.error(getPromoMessage(error?.response?.data?.message, 'Không thể ngừng hoạt động mã khuyến mãi.'))
    }
  }

  const openEdit = (promo) => {
    const promoEventIds = Array.isArray(promo.eventIds)
      ? promo.eventIds
      : Array.isArray(promo.event_ids)
        ? promo.event_ids
        : promo.event_id
          ? [promo.event_id]
          : []
    const applyToAllEvents = promo.applyToAllEvents ?? (!promo.event_id && promoEventIds.length === 0)
    setSelectedPromo(promo)
    setFormData({
      code: promo.code,
      applyToAllEvents,
      eventIds: applyToAllEvents ? [] : promoEventIds,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
      usage_limit: promo.usage_limit || '',
      start_time: new Date(promo.start_time).toISOString().slice(0, 16),
      end_time: new Date(promo.end_time).toISOString().slice(0, 16),
      min_order_value: promo.min_order_value || '',
      max_discount: promo.max_discount || '',
    })
    setShowEditModal(true)
  }

  const openDetail = (promo) => {
    setSelectedPromo(promo)
    setShowDetailModal(true)
  }

  const resetForm = () => {
    setSelectedPromo(null)
    setFormData({
      code: '',
      applyToAllEvents: true,
      eventIds: [],
      discount_type: 'PERCENTAGE',
      discount_value: '',
      usage_limit: '',
      start_time: '',
      end_time: '',
      min_order_value: '',
      max_discount: '',
    })
    setFormErrors({})
  }

  const getDiscountLabel = (promo) => {
    const value = parseFloat(promo.discount_value).toLocaleString()
    if (promo.discount_type === 'PERCENTAGE') {
      const cap = promo.max_discount ? `, tối đa ${formatVnd(promo.max_discount)}` : ''
      return `Giảm ${value}%${cap} cho ${promo.applyToAllEvents ? 'tất cả sự kiện' : 'sự kiện đã chọn'}`
    }
    return `Giảm cố định ${formatVnd(promo.discount_value)}`
  }

  const hasEvents = events && events.length > 0;

  return (
    <OrganizerPage
      title="Quản lý mã khuyến mãi"
      description="Tạo và theo dõi hiệu quả sử dụng mã khuyến mãi cho sự kiện."
      action={
        <button 
          className={`flex items-center gap-2 ${hasEvents ? 'org-btn-primary' : 'bg-neutral text-muted cursor-not-allowed px-4 py-2 rounded-xl font-bold text-sm'}`} 
          onClick={() => { 
            if (hasEvents) {
              resetForm(); 
              setShowCreateModal(true); 
            }
          }}
          disabled={!hasEvents}
          title={!hasEvents ? "Vui lòng tạo sự kiện trước khi tạo mã khuyến mãi" : "Tạo mã khuyến mãi"}
        >
          <Plus className="size-4" />
          Tạo mã khuyến mãi
        </button>
      }
    >
      {!hasEvents && !loading && (
        <div className="mb-6 rounded-xl bg-warning/10 p-4 border border-warning/30">
           <div className="flex items-center gap-3 text-warning">
              <AlertCircle className="size-5 shrink-0" />
              <div>
                <p className="text-sm font-bold">Bạn chưa có sự kiện nào</p>
                <p className="text-sm mt-1 text-subtle">Vui lòng tạo ít nhất một sự kiện trước khi có thể quản lý mã khuyến mãi.</p>
              </div>
           </div>
        </div>
      )}

      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              className="h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft pl-10 pr-3 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted"
              placeholder="Tìm kiếm theo mã khuyến mãi hoặc tên sự kiện..."
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-subtle">Trạng thái:</span>
            <select 
              className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none focus:border-primary min-w-[140px]"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-surface text-content">{option.label}</option>
              ))}
            </select>
          </div>
          <button 
            className="text-sm font-bold text-primary hover:underline"
            onClick={() => {
              const resetFilters = DEFAULT_FILTERS
              setFilters(resetFilters)
              fetchData(resetFilters)
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      </OrganizerPanel>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border-soft/30 bg-surface/80">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted">Đang tải dữ liệu khuyến mãi...</p>
        </div>
      ) : (
        <OrganizerTable
          headers={['Mã khuyến mãi', 'Sự kiện áp dụng', 'Loại giảm giá', 'Theo dõi sử dụng', 'Thời gian áp dụng', 'Trạng thái', 'Thao tác']}
          rows={promos.map((promo) => [
            <span key="promo" className="font-extrabold text-lg text-primary">{promo.code}</span>,
            <span key="event" className="text-sm font-semibold text-subtle">{promo.applyToAllEvents ? 'Tất cả sự kiện' : (promo.event_name || 'Sự kiện đã chọn')}</span>,
            <span key="type" className="font-medium text-subtle">{getDiscountLabel(promo)}</span>,
            <Usage key="usage" used={promo.used_count} limit={promo.usage_limit} percent={promo.usage_percentage} />,
            <span key="period" className="whitespace-nowrap text-sm text-subtle">{formatDateRange(promo.start_time, promo.end_time)}</span>,
            <StatusBadge key="status" status={promo.status} />,
            <div key="actions" className="flex items-center gap-3 text-muted">
              <button onClick={() => openDetail(promo)} className="rounded-md p-1.5 text-sky-500 transition-all hover:scale-110 hover:bg-sky-500/10 hover:text-sky-400" title="Xem chi tiết"><Eye className="size-4" /></button>
              <button 
                onClick={() => openEdit(promo)} 
                className={`rounded-md p-1.5 text-violet-500 transition-all hover:scale-110 hover:bg-violet-500/10 hover:text-violet-400 ${promo.status === 'Expired' ? 'cursor-not-allowed opacity-50' : ''}`}
                title="Chỉnh sửa"
                disabled={promo.status === 'Expired'}
              >
                <Pencil className="size-4" />
              </button>
              <button onClick={() => { setSelectedPromo(promo); setShowDeleteModal(true); }} className={`rounded-md p-1.5 transition-all ${Number(promo.usage_count || promo.used_count || 0) > 0 ? 'cursor-not-allowed text-muted opacity-50' : 'text-error hover:scale-110 hover:bg-error/10 hover:text-error'}`} title={Number(promo.usage_count || promo.used_count || 0) > 0 ? 'Mã đã được sử dụng, không thể xóa' : 'Ngừng hoạt động'} disabled={Number(promo.usage_count || promo.used_count || 0) > 0}><Trash2 className="size-4" /></button>
            </div>,
          ])}
        />
      )}

      {/* Modals */}
      <PromoFormModal 
        open={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Tạo mã khuyến mãi mới"
        onSubmit={handleCreate}
        formData={formData}
        setFormData={setFormData}
        errors={formErrors}
        events={events}
      />

      <PromoFormModal 
        open={showEditModal} 
        onClose={() => setShowEditModal(false)}
        title="Chỉnh sửa mã khuyến mãi"
        onSubmit={handleEdit}
        formData={formData}
        setFormData={setFormData}
        errors={formErrors}
        events={events}
        isEdit
        currentUsage={selectedPromo?.usage_percentage}
      />

      <PromoDetailModal 
        open={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        promo={selectedPromo}
      />

      <Modal
        open={showDeleteModal}
        title="Xác nhận ngừng hoạt động"
        onClose={() => setShowDeleteModal(false)}
        footer={
          <>
            <button className="org-btn-secondary" onClick={() => setShowDeleteModal(false)}>Hủy</button>
            <button className="bg-error text-white px-4 py-2 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity" onClick={handleDelete}>Ngừng hoạt động</button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="bg-error/10 p-3 rounded-full">
            <AlertCircle className="size-8 text-error" />
          </div>
          <div>
            <h4 className="font-bold text-lg text-content">Bạn có chắc chắn?</h4>
            <p className="text-sm text-subtle mt-2">
              Thao tác này sẽ ngừng hoạt động mã khuyến mãi <strong>{selectedPromo?.code}</strong>. 
              Người dùng sẽ không thể sử dụng mã này nữa, nhưng các bản ghi hiện có vẫn được giữ lại.
            </p>
          </div>
        </div>
      </Modal>
    </OrganizerPage>
  )
}

function Usage({ used, limit, percent }) {
  if (limit === null || limit === undefined || limit === 0) {
    return <span className="font-bold text-subtle">Không giới hạn</span>
  }

  return (
    <div className="w-36">
      <div className="mb-1.5 flex justify-between text-xs font-bold font-display tracking-tight">
        <span className="text-content">{used} / {limit}</span>
        <span className="text-primary">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-panel-soft overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${percent > 90 ? 'bg-error' : 'bg-primary'}`} 
          style={{ width: `${percent}%` }} 
        />
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className="flex min-w-[140px] justify-center whitespace-nowrap">
      <Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</Badge>
    </span>
  )
}

function PromoFormModal({ open, onClose, title, onSubmit, formData, setFormData, errors = {}, events, isEdit, currentUsage }) {
  const fieldClass = 'mt-1.5 h-11 w-full rounded-lg border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none transition focus:border-tertiary focus:ring-2 focus:ring-tertiary/15 placeholder:text-muted'
  const errorFieldClass = 'border-error bg-error/5 ring-1 ring-error/20 text-content'
  const panelClass = 'rounded-xl border border-border-soft/30 bg-panel/60 p-4'

  return (
    <Modal open={open} title={title} onClose={onClose} maxWidth="max-w-3xl"
      footer={
        <>
          <button className="org-btn-secondary" onClick={onClose}>Hủy</button>
          <button className="org-btn-primary" onClick={onSubmit}>{isEdit ? 'Lưu thay đổi' : 'Tạo mã khuyến mãi'}</button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        {isEdit && currentUsage !== null && (
          <div className="rounded-xl border border-tertiary/25 bg-tertiary/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-extrabold uppercase text-primary">Hiệu quả sử dụng hiện tại</p>
              <span className="rounded-lg border border-tertiary/30 bg-surface/50 px-2.5 py-1 text-xs font-extrabold text-primary">{currentUsage}%</span>
            </div>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-border-soft/20 bg-panel-soft">
                 <div className="h-full bg-tertiary" style={{ width: `${currentUsage}%` }} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Hãy cẩn thận khi giảm giới hạn sử dụng xuống thấp hơn số lượt đã dùng hiện tại.</p>
          </div>
        )}

        <section className={panelClass}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <label className="block">
              <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.code ? 'text-error' : 'text-subtle'}`}>Mã khuyến mãi</span>
              <input
                type="text"
                className={`${fieldClass} font-extrabold uppercase tracking-widest ${errors.code ? errorFieldClass : ''}`}
                placeholder="VD: SUMMER50"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                required
              />
              {errors.code && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.code}</p>}
            </label>

            <div>
              <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.eventIds ? 'text-error' : 'text-subtle'}`}>Sự kiện áp dụng</span>
              <label className={`mt-1.5 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-sm font-bold transition ${
                formData.applyToAllEvents
                  ? 'border-tertiary/40 bg-tertiary/10 text-content'
                  : 'border-border-soft/40 bg-panel-soft text-content'
              }`}>
                <span>Áp dụng cho tất cả sự kiện</span>
              <input
                type="checkbox"
                className="size-4 accent-tertiary"
                checked={Boolean(formData.applyToAllEvents)}
                onChange={(e) => setFormData({
                  ...formData,
                  applyToAllEvents: e.target.checked,
                  eventIds: e.target.checked ? [] : formData.eventIds,
                })}
              />
              </label>

              {!formData.applyToAllEvents && (
                <select
                  className={`${fieldClass} mt-2 ${errors.eventIds ? errorFieldClass : ''}`}
                  value={formData.eventIds?.[0] || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    eventIds: e.target.value ? [e.target.value] : [],
                  })}
                >
                  <option value="" className="bg-surface text-content">Chọn sự kiện cụ thể</option>
                  {(events || []).map(ev => <option key={ev.id || ev._id} value={ev.id || ev._id} className="bg-surface text-content">{ev.title || ev.name || ev.eventName || 'Sự kiện chưa đặt tên'}</option>)}
                </select>
              )}
              {errors.eventIds && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.eventIds}</p>}
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold text-subtle uppercase font-display tracking-tight">Loại giảm giá</span>
              <select
                className={fieldClass}
                value={formData.discount_type}
                onChange={(e) => setFormData({
                  ...formData,
                  discount_type: e.target.value,
                  max_discount: e.target.value === 'PERCENTAGE' ? formData.max_discount : '',
                })}
              >
                <option value="PERCENTAGE" className="bg-surface text-content">Phần trăm (%)</option>
                <option value="FIXED" className="bg-surface text-content">Số tiền cố định (VND)</option>
              </select>
            </label>

            <label className="block">
              <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.discount_value ? 'text-error' : 'text-subtle'}`}>Giá trị giảm</span>
              <div className="relative mt-1.5">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${errors.discount_value ? 'text-error' : 'text-muted'}`}>
                  {formData.discount_type === 'PERCENTAGE' ? <Percent className="size-4" /> : <DollarSign className="size-4" />}
                </span>
                <input
                  type="number"
                  className={`${fieldClass} pl-10 font-extrabold ${errors.discount_value ? errorFieldClass : ''}`}
                  placeholder="0"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  required
                />
              </div>
              {errors.discount_value && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.discount_value}</p>}
            </label>

            {formData.discount_type === 'PERCENTAGE' && (
              <label className="block">
                <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.max_discount ? 'text-error' : 'text-subtle'}`}>Giảm tối đa</span>
                <input
                  type="number"
                  min="0"
                  className={`${fieldClass} font-extrabold ${errors.max_discount ? errorFieldClass : ''}`}
                  placeholder="VND"
                  value={formData.max_discount}
                  onChange={(e) => setFormData({ ...formData, max_discount: e.target.value })}
                />
                {errors.max_discount && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.max_discount}</p>}
              </label>
            )}
          </div>
        </section>

        <section className={panelClass}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.usage_limit ? 'text-error' : 'text-subtle'}`}>Giới hạn lượt dùng</span>
              <input
                type="number"
                className={`${fieldClass} ${errors.usage_limit ? errorFieldClass : ''}`}
                placeholder="Để trống nếu không giới hạn"
                value={formData.usage_limit}
                onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
              />
              {errors.usage_limit && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.usage_limit}</p>}
            </label>

            <label className="block">
              <span className="text-xs font-bold text-subtle uppercase font-display tracking-tight">Giá trị đơn hàng tối thiểu</span>
              <input
                type="number"
                className={fieldClass}
                placeholder="0"
                value={formData.min_order_value}
                onChange={(e) => setFormData({ ...formData, min_order_value: e.target.value })}
              />
            </label>

            <label className="block">
              <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.start_time ? 'text-error' : 'text-subtle'}`}>Thời gian bắt đầu</span>
              <input
                type="datetime-local"
                className={`${fieldClass} ${errors.start_time ? errorFieldClass : ''}`}
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
              />
              {errors.start_time && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.start_time}</p>}
            </label>

            <label className="block">
              <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.end_time ? 'text-error' : 'text-subtle'}`}>Thời gian kết thúc</span>
              <input
                type="datetime-local"
                className={`${fieldClass} ${errors.end_time ? errorFieldClass : ''}`}
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
              />
              {errors.end_time && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.end_time}</p>}
            </label>
          </div>
        </section>
      </form>
    </Modal>
  )
}

function PromoDetailModal({ open, onClose, promo }) {
  if (!promo) return null

  const discountValue = parseFloat(promo.discount_value).toLocaleString('vi-VN')
  const discountIcon = promo.discount_type === 'PERCENTAGE' ? Percent : DollarSign
  const discountTypeLabel = promo.discount_type === 'PERCENTAGE' ? 'Giảm theo phần trăm' : 'Giảm số tiền cố định'
  const discountDisplay = promo.discount_type === 'PERCENTAGE' ? `Giảm ${discountValue}%` : `Giảm ${formatVnd(promo.discount_value)}`
  const maxDiscountDisplay = promo.discount_type === 'PERCENTAGE' && promo.max_discount ? formatVnd(promo.max_discount) : 'Không giới hạn'
  const usageLimit = promo.usage_limit || 'Không giới hạn'
  const remainingUsage = promo.usage_limit ? promo.remaining_usage : 'Không giới hạn'
  const usagePercentage = Number(promo.usage_percentage || 0)

  return (
    <Modal open={open} title={`Chi tiết mã khuyến mãi: ${promo.code}`} onClose={onClose} maxWidth="max-w-5xl">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <DetailCard className="bg-tertiary/10 border-tertiary/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Mã khuyến mãi</p>
                <p className="mt-1 font-display text-3xl font-extrabold text-primary">{promo.code}</p>
              </div>
              <StatusDetailRow status={promo.status} />
            </div>
          </DetailCard>

          <DetailCard>
            <DetailItem label="Sự kiện áp dụng" value={promo.applyToAllEvents ? 'Tất cả sự kiện' : 'Sự kiện cụ thể'} />
            <div className="mt-3 space-y-1 text-sm text-content">
              <p>
                <span className="font-bold text-muted">Tên sự kiện: </span>
                <span className="font-semibold text-content">{promo.applyToAllEvents ? 'Tất cả sự kiện của organizer' : (promo.event_name || 'Không có')}</span>
              </p>
              {!promo.applyToAllEvents && (promo.eventIds?.length || promo.event_id) && (
                <p className="text-xs">
                  <span className="font-bold text-muted">Mã sự kiện: </span>
                  <span className="font-mono text-muted">{(promo.eventIds || [promo.event_id]).join(', ')}</span>
                </p>
              )}
            </div>
          </DetailCard>

          <OfferCard
            icon={discountIcon}
            typeLabel={discountTypeLabel}
            value={promo.discount_type === 'PERCENTAGE' ? `${discountDisplay}, tối đa ${maxDiscountDisplay}` : discountDisplay}
          />
        </div>

        <div className="rounded-xl border border-border-soft/30 bg-panel-soft p-5 text-content">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs font-extrabold uppercase text-muted">Hiệu quả sử dụng</p>
            <span className="whitespace-nowrap rounded bg-surface/50 border border-border-soft/20 px-2 py-1 text-xs font-bold text-primary">
              {usagePercentage}% đã dùng
            </span>
          </div>

          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-muted">Số đã dùng</p>
              <p className="text-4xl font-extrabold text-primary">{promo.used_count}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-muted">Tổng giới hạn</p>
              <p className="whitespace-nowrap text-xl font-extrabold text-content">{usageLimit}</p>
            </div>
          </div>

          <div className="mb-5">
            <div className="relative h-5 overflow-hidden rounded-full bg-surface border border-border-soft/20">
              <div className="h-full bg-tertiary transition-all duration-500" style={{ width: `${usagePercentage}%` }} />
              <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-[10px] font-extrabold text-content">
                {usagePercentage}% đã dùng
              </span>
            </div>
          </div>

          {!promo.usage_limit && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-surface/50 p-3 text-sm font-bold text-primary">
              Mã khuyến mãi này không giới hạn lượt sử dụng.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UsageStat label="Số còn lại" value={remainingUsage} />
            <UsageStat label="Giới hạn" value={usageLimit} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border-soft/30 pt-5 md:grid-cols-3">
        <DetailCard>
          <DetailItem label="Thời gian áp dụng" value={formatDateRange(promo.start_time, promo.end_time)} />
        </DetailCard>
        <DetailCard>
          <DetailItem label="Ngày tạo" value={formatPromoDateTime(promo.created_at || new Date())} />
        </DetailCard>
        <DetailCard>
          <DetailItem label="Cập nhật" value={formatPromoDateTime(promo.updated_at || new Date())} />
        </DetailCard>
      </div>
    </Modal>
  )
}

function DetailCard({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-border-soft/30 bg-surface/80 p-4 ${className}`}>
      {children}
    </div>
  )
}

function StatusDetailRow({ status }) {
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl border border-border-soft/30 bg-panel-soft px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Trạng thái</p>
      <StatusBadge status={status} />
    </div>
  )
}

function OfferCard({ icon: Icon, typeLabel, value }) {
  return (
    <div className="rounded-xl border border-tertiary/30 bg-tertiary/10 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tertiary text-white">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Ưu đãi</p>
          <p className="mt-1 text-sm font-bold text-subtle">{typeLabel}</p>
          <div className="mt-3 inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-xl bg-panel-soft border border-border-soft/20 px-3 py-2 text-lg font-extrabold text-primary shadow-sm">
            {value}
          </div>
        </div>
      </div>
    </div>
  )
}

function UsageStat({ label, value }) {
  return (
    <div className="rounded-xl border border-border-soft/30 bg-panel-soft p-3">
      <p className="text-[10px] font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words text-lg font-extrabold text-content">{value}</p>
    </div>
  )
}

function DetailItem({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{label}</p>
      <div className={`mt-1 font-bold ${highlight ? 'text-2xl text-primary' : 'text-content'}`}>
        {value}
      </div>
    </div>
  )
}
