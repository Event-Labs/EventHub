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
import { http } from '../../services/http'

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

const PROMO_MESSAGE_LABELS = {
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
    event_id: undefined,
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
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEvents = useCallback(async () => {
    try {
      const response = await http.get('/events/my-events')
      
      // Safely extract the events array regardless of nesting
      let eventsList = []
      if (Array.isArray(response.data)) {
        eventsList = response.data
      } else if (response.data && Array.isArray(response.data.data)) {
        eventsList = response.data.data
      } else if (response.data && Array.isArray(response.data.items)) {
        eventsList = response.data.items
      }
      
      console.log('Fetched events:', eventsList)
      setEvents(eventsList)
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }, [])

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
    
    if (formData.event_id === undefined) {
      setFormErrors({ event_id: 'Vui lòng chọn sự kiện áp dụng' })
      return
    }

    try {
      // Clean data before sending
      const submissionData = {
        ...formData,
        event_id: (formData.event_id === 'ALL' || formData.event_id === '') ? null : formData.event_id,
        discount_value: Number(formData.discount_value),
        min_order_value: formData.min_order_value === '' ? 0 : Number(formData.min_order_value),
        max_discount: formData.max_discount === '' ? null : Number(formData.max_discount),
        usage_limit: formData.usage_limit === '' ? null : Number(formData.usage_limit),
      };

      await promotionService.createPromo(submissionData)
      setShowCreateModal(false)
      resetForm()
      fetchData(filters)
    } catch (error) {
       if (error.response?.data?.errorCode === 'VALIDATION_ERROR') {
         const issues = error.response.data.data || []
         const errors = {}
         issues.forEach(issue => {
           errors[issue.path[0]] = getPromoMessage(issue.message, 'Dữ liệu không hợp lệ')
         })
         setFormErrors(errors)
       } else {
         alert(getPromoMessage(error?.response?.data?.message, 'Không thể tạo mã khuyến mãi'))
       }
    }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    setFormErrors({})

    if (formData.event_id === undefined) {
      setFormErrors({ event_id: 'Vui lòng chọn sự kiện áp dụng' })
      return
    }

    try {
      const submissionData = {
        ...formData,
        event_id: (formData.event_id === 'ALL' || formData.event_id === '') ? null : formData.event_id,
        usage_limit: formData.usage_limit === '' ? null : Number(formData.usage_limit),
        min_order_value: formData.min_order_value === '' ? 0 : Number(formData.min_order_value),
        max_discount: formData.max_discount === '' ? null : Number(formData.max_discount),
        discount_value: Number(formData.discount_value),
      }
      await promotionService.updatePromo(selectedPromo.id, submissionData)
      setShowEditModal(false)
      resetForm()
      fetchData(filters)
    } catch (error) {
       if (error.response?.data?.errorCode === 'VALIDATION_ERROR') {
         const issues = error.response.data.data || []
         const errors = {}
         issues.forEach(issue => {
           errors[issue.path[0]] = getPromoMessage(issue.message, 'Dữ liệu không hợp lệ')
         })
         setFormErrors(errors)
       } else {
         alert(getPromoMessage(error?.response?.data?.message, 'Không thể cập nhật mã khuyến mãi'))
       }
    }
  }

  const handleDelete = async () => {
    try {
      await promotionService.deactivatePromo(selectedPromo.id)
      setShowDeleteModal(false)
      fetchData(filters)
    } catch (error) {
       console.error('Error deactivating promo:', error)
    }
  }

  const openEdit = (promo) => {
    setSelectedPromo(promo)
    setFormData({
      code: promo.code,
      event_id: promo.event_id || 'ALL',
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
      event_id: undefined,
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
      return `Giảm ${value}% cho ${promo.event_name ? 'vé sự kiện' : 'tất cả vé'}`
    }
    return `Giảm cố định $${value}`
  }

  const hasEvents = events && events.length > 0;

  return (
    <OrganizerPage
      title="Quản lý mã khuyến mãi"
      description="Tạo và theo dõi hiệu quả sử dụng mã khuyến mãi cho sự kiện."
      action={
        <button 
          className={`flex items-center gap-2 ${hasEvents ? 'admin-primary' : 'bg-gray-300 text-gray-500 cursor-not-allowed px-4 py-2 rounded-md font-bold text-sm'}`} 
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
        <div className="mb-6 rounded-md bg-amber-50 p-4 border border-amber-200">
           <div className="flex items-center gap-3 text-amber-800">
              <AlertCircle className="size-5 shrink-0" />
              <div>
                <p className="text-sm font-bold">Bạn chưa có sự kiện nào</p>
                <p className="text-sm mt-1">Vui lòng tạo ít nhất một sự kiện trước khi có thể quản lý mã khuyến mãi.</p>
              </div>
           </div>
        </div>
      )}

      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
            <input
              className="h-10 w-full rounded-md border border-[#c3c6d7] bg-[#f7f9fb] pl-10 pr-3 text-sm text-[#191c1e] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Tìm kiếm theo mã khuyến mãi hoặc tên sự kiện..."
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[#434655]">Trạng thái:</span>
            <select 
              className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm min-w-[140px]"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-[#c3c6d7] bg-white">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-[#737686]">Đang tải dữ liệu khuyến mãi...</p>
        </div>
      ) : (
        <OrganizerTable
          headers={['Mã khuyến mãi', 'Sự kiện áp dụng', 'Loại giảm giá', 'Theo dõi sử dụng', 'Thời gian áp dụng', 'Trạng thái', 'Thao tác']}
          rows={promos.map((promo) => [
            <span key="promo" className="font-extrabold text-lg text-primary">{promo.code}</span>,
            <span key="event" className="text-sm font-semibold text-[#434655]">{promo.event_name || 'Tất cả sự kiện'}</span>,
            <span key="type" className="font-medium text-[#434655]">{getDiscountLabel(promo)}</span>,
            <Usage key="usage" used={promo.used_count} limit={promo.usage_limit} percent={promo.usage_percentage} />,
            <span key="period" className="whitespace-nowrap text-sm text-[#434655]">{formatDateRange(promo.start_time, promo.end_time)}</span>,
            <StatusBadge key="status" status={promo.status} />,
            <div key="actions" className="flex items-center gap-3 text-[#737686]">
              <button onClick={() => openDetail(promo)} className="hover:text-primary transition-colors" title="Xem chi tiết"><Eye className="size-4" /></button>
              <button 
                onClick={() => openEdit(promo)} 
                className={`hover:text-primary transition-colors ${promo.status === 'Expired' ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Chỉnh sửa"
                disabled={promo.status === 'Expired'}
              >
                <Pencil className="size-4" />
              </button>
              <button onClick={() => { setSelectedPromo(promo); setShowDeleteModal(true); }} className="hover:text-error transition-colors" title="Ngừng hoạt động"><Trash2 className="size-4 text-error" /></button>
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
            <button className="admin-secondary" onClick={() => setShowDeleteModal(false)}>Hủy</button>
            <button className="bg-error text-white px-4 py-2 rounded-md font-bold text-sm" onClick={handleDelete}>Ngừng hoạt động</button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="bg-error/10 p-3 rounded-full">
            <AlertCircle className="size-8 text-error" />
          </div>
          <div>
            <h4 className="font-bold text-lg">Bạn có chắc chắn?</h4>
            <p className="text-sm text-[#737686] mt-2">
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
    return <span className="font-bold text-[#434655]">Không giới hạn</span>
  }

  return (
    <div className="w-36">
      <div className="mb-1.5 flex justify-between text-xs font-bold font-display tracking-tight">
        <span className="text-[#191c1e]">{used} / {limit}</span>
        <span className="text-primary">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#e0e3e5] overflow-hidden">
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
  return (
    <Modal open={open} title={title} onClose={onClose} maxWidth="max-w-2xl"
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>Hủy</button>
          <button className="admin-primary" onClick={onSubmit}>{isEdit ? 'Lưu thay đổi' : 'Tạo mã khuyến mãi'}</button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        {isEdit && currentUsage !== null && (
          <div className="mb-6 rounded-md bg-primary/5 p-4 border border-primary/20">
            <p className="text-xs font-extrabold uppercase text-primary">Hiệu quả sử dụng hiện tại</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex-1 h-3 rounded-full bg-white border border-[#c3c6d7] overflow-hidden">
                 <div className="h-full bg-primary" style={{ width: `${currentUsage}%` }} />
              </div>
              <span className="font-extrabold text-primary">{currentUsage}%</span>
            </div>
            <p className="text-xs text-[#737686] mt-2 italic">Hãy cẩn thận khi giảm giới hạn sử dụng xuống thấp hơn số lượt đã dùng hiện tại.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.code ? 'text-error' : 'text-[#434655]'}`}>Mã khuyến mãi</span>
            <input 
              type="text"
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm font-bold uppercase tracking-widest outline-none transition-all ${
                errors.code ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary focus:ring-2 focus:ring-primary/20'
              }`}
              placeholder="VD: SUMMER50"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              required
            />
            {errors.code && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.code}</p>}
          </label>
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.event_id ? 'text-error' : 'text-[#434655]'}`}>Sự kiện áp dụng</span>
            <select 
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm outline-none transition-all ${
                errors.event_id ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary'
              }`}
              value={formData.event_id === undefined ? '' : formData.event_id}
              onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
            >
              <option value="" disabled>-- Chọn sự kiện --</option>
              <option value="ALL">Tất cả sự kiện</option>
              {(events || []).map(ev => <option key={ev.id || ev._id} value={ev.id || ev._id}>{ev.title || ev.name || ev.eventName || 'Sự kiện chưa đặt tên'}</option>)}
            </select>
            {errors.event_id && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.event_id}</p>}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-bold text-[#434655] uppercase font-display tracking-tight">Loại giảm giá</span>
            <select 
              className="mt-1.5 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm outline-none focus:border-primary"
              value={formData.discount_type}
              onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
            >
              <option value="PERCENTAGE">Phần trăm (%)</option>
              <option value="FIXED">Số tiền cố định ($)</option>
            </select>
          </label>
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.discount_value ? 'text-error' : 'text-[#434655]'}`}>Giá trị giảm</span>
            <div className="relative mt-1.5">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${errors.discount_value ? 'text-error' : 'text-[#737686]'}`}>
                {formData.discount_type === 'PERCENTAGE' ? <Percent className="size-4" /> : <DollarSign className="size-4" />}
              </span>
              <input 
                type="number"
                className={`h-11 w-full rounded border pl-10 pr-3 text-sm font-extrabold outline-none transition-all ${
                  errors.discount_value ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary'
                }`}
                placeholder="0"
                value={formData.discount_value}
                onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                required
              />
            </div>
            {errors.discount_value && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.discount_value}</p>}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.usage_limit ? 'text-error' : 'text-[#434655]'}`}>Giới hạn lượt dùng</span>
            <input 
              type="number"
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm outline-none transition-all ${
                 errors.usage_limit ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary'
              }`}
              placeholder="Để trống nếu không giới hạn"
              value={formData.usage_limit}
              onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
            />
            {errors.usage_limit && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.usage_limit}</p>}
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[#434655] uppercase font-display tracking-tight">Giá trị đơn hàng tối thiểu</span>
            <input 
              type="number"
              className="mt-1.5 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm outline-none focus:border-primary"
              placeholder="0"
              value={formData.min_order_value}
              onChange={(e) => setFormData({ ...formData, min_order_value: e.target.value })}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.start_time ? 'text-error' : 'text-[#434655]'}`}>Thời gian bắt đầu</span>
            <input 
              type="datetime-local"
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm outline-none transition-all ${
                errors.start_time ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary'
              }`}
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              required
            />
            {errors.start_time && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.start_time}</p>}
          </label>
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.end_time ? 'text-error' : 'text-[#434655]'}`}>Thời gian kết thúc</span>
            <input 
              type="datetime-local"
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm outline-none transition-all ${
                errors.end_time ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary'
              }`}
              value={formData.end_time}
              onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              required
            />
            {errors.end_time && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.end_time}</p>}
          </label>
        </div>
      </form>
    </Modal>
  )
}

function PromoDetailModal({ open, onClose, promo }) {
  if (!promo) return null

  const discountValue = parseFloat(promo.discount_value).toLocaleString('vi-VN')
  const discountIcon = promo.discount_type === 'PERCENTAGE' ? Percent : DollarSign
  const discountTypeLabel = promo.discount_type === 'PERCENTAGE' ? 'Giảm theo phần trăm' : 'Giảm số tiền cố định'
  const discountDisplay = promo.discount_type === 'PERCENTAGE' ? `Giảm ${discountValue}%` : `Giảm ${discountValue}đ`
  const usageLimit = promo.usage_limit || 'Không giới hạn'
  const remainingUsage = promo.usage_limit ? promo.remaining_usage : 'Không giới hạn'
  const usagePercentage = Number(promo.usage_percentage || 0)

  return (
    <Modal open={open} title={`Chi tiết mã khuyến mãi: ${promo.code}`} onClose={onClose} maxWidth="max-w-5xl">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <DetailCard className="bg-[#f8fbff]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686]">Mã khuyến mãi</p>
                <p className="mt-1 font-display text-3xl font-extrabold text-primary">{promo.code}</p>
              </div>
              <StatusDetailRow status={promo.status} />
            </div>
          </DetailCard>

          <DetailCard>
            <DetailItem label="Sự kiện áp dụng" value={promo.event_name ? 'Sự kiện cụ thể' : 'Tất cả sự kiện'} />
            <div className="mt-3 space-y-1 text-sm">
              <p>
                <span className="font-bold text-gray-500">Tên sự kiện: </span>
                <span className="font-medium text-[#191c1e]">{promo.event_name || 'Không có'}</span>
              </p>
              {promo.event_id && (
                <p className="text-xs">
                  <span className="font-bold text-gray-500">Mã sự kiện: </span>
                  <span className="font-mono text-gray-600">{promo.event_id}</span>
                </p>
              )}
            </div>
          </DetailCard>

          <OfferCard
            icon={discountIcon}
            typeLabel={discountTypeLabel}
            value={discountDisplay}
          />
        </div>

        <div className="rounded-md border border-[#c3c6d7] bg-[#f7f9fb] p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs font-extrabold uppercase text-[#737686]">Hiệu quả sử dụng</p>
            <span className="whitespace-nowrap rounded bg-white px-2 py-1 text-xs font-bold text-primary">
              {usagePercentage}% đã dùng
            </span>
          </div>

          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-[#737686]">Số đã dùng</p>
              <p className="text-4xl font-extrabold text-primary">{promo.used_count}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-[#737686]">Tổng giới hạn</p>
              <p className="whitespace-nowrap text-xl font-extrabold text-[#191c1e]">{usageLimit}</p>
            </div>
          </div>

          <div className="mb-5">
            <div className="relative h-5 overflow-hidden rounded-full bg-[#e0e3e5]">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${usagePercentage}%` }} />
              <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-[10px] font-extrabold text-[#111827]">
                {usagePercentage}% đã dùng
              </span>
            </div>
          </div>

          {!promo.usage_limit && (
            <div className="mb-5 rounded-md border border-primary/20 bg-white p-3 text-sm font-bold text-primary">
              Mã khuyến mãi này không giới hạn lượt sử dụng.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UsageStat label="Số còn lại" value={remainingUsage} />
            <UsageStat label="Giới hạn" value={usageLimit} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-[#e0e3e5] pt-5 md:grid-cols-3">
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
    <div className={`rounded-md border border-[#c3c6d7] bg-white p-4 ${className}`}>
      {children}
    </div>
  )
}

function StatusDetailRow({ status }) {
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md border border-[#d7dbe8] bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686]">Trạng thái</p>
      <StatusBadge status={status} />
    </div>
  )
}

function OfferCard({ icon: Icon, typeLabel, value }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-slate-950">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686]">Ưu đãi</p>
          <p className="mt-1 text-sm font-bold text-[#434655]">{typeLabel}</p>
          <div className="mt-3 inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-md bg-white px-3 py-2 text-lg font-extrabold text-primary shadow-sm">
            {value}
          </div>
        </div>
      </div>
    </div>
  )
}

function UsageStat({ label, value }) {
  return (
    <div className="rounded border border-[#c3c6d7] bg-white p-3">
      <p className="text-[10px] font-bold uppercase text-[#737686]">{label}</p>
      <p className="mt-1 break-words text-lg font-extrabold text-[#191c1e]">{value}</p>
    </div>
  )
}

function DetailItem({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-[#737686] uppercase tracking-wider">{label}</p>
      <div className={`mt-1 font-bold ${highlight ? 'text-2xl text-primary' : 'text-[#191c1e]'}`}>
        {value}
      </div>
    </div>
  )
}
