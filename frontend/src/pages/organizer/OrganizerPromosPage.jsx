import { useState, useEffect } from 'react'
import { 
  BarChart3, 
  Pencil, 
  Trash2, 
  Eye, 
  Plus, 
  Search, 
  AlertCircle,
  Calendar,
  Ticket,
  Percent,
  DollarSign,
  ChevronRight,
  Loader2
} from 'lucide-react'
import {
  Badge,
  OrganizerPage,
  OrganizerPanel,
  OrganizerTable,
  SearchBar,
} from './OrganizerComponents.jsx'
import { Modal } from '../../components/Modal.jsx'
import promotionService from '../../services/promotions'
import { http } from '../../services/http'

export function OrganizerPromosPage() {
  const [promos, setPromos] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ keyword: '', status: 'All Statuses' })
  
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

  useEffect(() => {
    fetchData()
    fetchEvents()
  }, [])

  const fetchData = async (currentFilters = filters) => {
    setLoading(true)
    try {
      const response = await promotionService.getAllPromos(currentFilters)
      setPromos(response.data.data)
    } catch (error) {
      console.error('Error fetching promos:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEvents = async () => {
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
  }

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
      fetchData()
    } catch (error) {
       if (error.response?.data?.errorCode === 'VALIDATION_ERROR') {
         const issues = error.response.data.data || []
         const errors = {}
         issues.forEach(issue => {
           errors[issue.path[0]] = issue.message
         })
         setFormErrors(errors)
       } else {
         alert(error?.response?.data?.message || 'Error creating promo code')
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
      fetchData()
    } catch (error) {
       if (error.response?.data?.errorCode === 'VALIDATION_ERROR') {
         const issues = error.response.data.data || []
         const errors = {}
         issues.forEach(issue => {
           errors[issue.path[0]] = issue.message
         })
         setFormErrors(errors)
       } else {
         alert(error?.response?.data?.message || 'Error updating promo code')
       }
    }
  }

  const handleDelete = async () => {
    try {
      await promotionService.deactivatePromo(selectedPromo.id)
      setShowDeleteModal(false)
      fetchData()
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

  const formatDateRange = (start, end) => {
    const s = new Date(start).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    const e = new Date(end).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    return `${s} - ${e}`
  }

  const getDiscountLabel = (promo) => {
    const value = parseFloat(promo.discount_value).toLocaleString()
    if (promo.discount_type === 'PERCENTAGE') {
      return `${value}% Off ${promo.event_name ? 'Tickets' : 'All Tickets'}`
    }
    return `$${value} Flat Discount`
  }

  const getStatusTone = (status) => {
    switch (status) {
      case 'Active': return 'green'
      case 'Scheduled': return 'blue'
      case 'Expired': return 'gray'
      case 'Inactive': return 'red'
      default: return 'blue'
    }
  }

  const hasEvents = events && events.length > 0;

  return (
    <OrganizerPage
      title="Promotion Management"
      description="Create and track performance of event discount codes."
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
          title={!hasEvents ? "Vui lòng tạo sự kiện trước khi tạo promo code" : "Create Promo Code"}
        >
          <Plus className="size-4" />
          Create Promo Code
        </button>
      }
    >
      {!hasEvents && !loading && (
        <div className="mb-6 rounded-md bg-amber-50 p-4 border border-amber-200">
           <div className="flex items-center gap-3 text-amber-800">
              <AlertCircle className="size-5 shrink-0" />
              <div>
                <p className="text-sm font-bold">Bạn chưa có sự kiện nào</p>
                <p className="text-sm mt-1">Vui lòng tạo ít nhất một sự kiện trước khi có thể quản lý Promo Code.</p>
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
              placeholder="Search by Promo Code or Event Name..."
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[#434655]">Status:</span>
            <select 
              className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm min-w-[140px]"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option>All Statuses</option>
              <option>Active</option>
              <option>Scheduled</option>
              <option>Expired</option>
              <option>Inactive</option>
            </select>
          </div>
          <button 
            className="text-sm font-bold text-primary hover:underline"
            onClick={() => {
              const resetFilters = { keyword: '', status: 'All Statuses' }
              setFilters(resetFilters)
              fetchData(resetFilters)
            }}
          >
            Clear All
          </button>
        </div>
      </OrganizerPanel>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border border-[#c3c6d7] bg-white">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-[#737686]">Loading promotion data...</p>
        </div>
      ) : (
        <OrganizerTable
          headers={['Promo Code', 'Sự kiện áp dụng', 'Discount Type', 'Usage Tracking', 'Valid Period', 'Status', 'Actions']}
          rows={promos.map((promo) => [
            <span key="promo" className="font-extrabold text-lg text-primary">{promo.code}</span>,
            <span key="event" className="text-sm font-semibold text-[#434655]">{promo.event_name || 'Tất cả sự kiện'}</span>,
            <span key="type" className="font-medium text-[#434655]">{getDiscountLabel(promo)}</span>,
            <Usage key="usage" used={promo.used_count} limit={promo.usage_limit} percent={promo.usage_percentage} />,
            <span key="period" className="text-sm text-[#434655]">{formatDateRange(promo.start_time, promo.end_time)}</span>,
            <Badge key="status" tone={getStatusTone(promo.status)}>{promo.status}</Badge>,
            <div key="actions" className="flex items-center gap-3 text-[#737686]">
              <button onClick={() => openDetail(promo)} className="hover:text-primary transition-colors" title="View Detail"><Eye className="size-4" /></button>
              <button 
                onClick={() => openEdit(promo)} 
                className={`hover:text-primary transition-colors ${promo.status === 'Expired' ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Edit"
                disabled={promo.status === 'Expired'}
              >
                <Pencil className="size-4" />
              </button>
              <button onClick={() => { setSelectedPromo(promo); setShowDeleteModal(true); }} className="hover:text-error transition-colors" title="Deactivate"><Trash2 className="size-4 text-error" /></button>
            </div>,
          ])}
        />
      )}

      {/* Modals */}
      <PromoFormModal 
        open={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Promo Code"
        onSubmit={handleCreate}
        formData={formData}
        setFormData={setFormData}
        errors={formErrors}
        events={events}
      />

      <PromoFormModal 
        open={showEditModal} 
        onClose={() => setShowEditModal(false)}
        title="Edit Promo Code"
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
        title="Confirm Deactivation"
        onClose={() => setShowDeleteModal(false)}
        footer={
          <>
            <button className="admin-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
            <button className="bg-error text-white px-4 py-2 rounded-md font-bold text-sm" onClick={handleDelete}>Deactivate</button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="bg-error/10 p-3 rounded-full">
            <AlertCircle className="size-8 text-error" />
          </div>
          <div>
            <h4 className="font-bold text-lg">Are you sure?</h4>
            <p className="text-sm text-[#737686] mt-2">
              This will deactivate the promo code <strong>{selectedPromo?.code}</strong>. 
              Users will no longer be able to use it, but existing records will be kept.
            </p>
          </div>
        </div>
      </Modal>
    </OrganizerPage>
  )
}

function Usage({ used, limit, percent }) {
  if (limit === null || limit === undefined || limit === 0) {
    return <span className="font-bold text-[#434655]">Unlimited</span>
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

function PromoFormModal({ open, onClose, title, onSubmit, formData, setFormData, errors = {}, events, isEdit, currentUsage }) {
  return (
    <Modal open={open} title={title} onClose={onClose} maxWidth="max-w-2xl"
      footer={
        <>
          <button className="admin-secondary" onClick={onClose}>Cancel</button>
          <button className="admin-primary" onClick={onSubmit}>{isEdit ? 'Save Changes' : 'Create Promo Code'}</button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        {isEdit && currentUsage !== null && (
          <div className="mb-6 rounded-md bg-primary/5 p-4 border border-primary/20">
            <p className="text-xs font-extrabold uppercase text-primary">Current Usage Performance</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex-1 h-3 rounded-full bg-white border border-[#c3c6d7] overflow-hidden">
                 <div className="h-full bg-primary" style={{ width: `${currentUsage}%` }} />
              </div>
              <span className="font-extrabold text-primary">{currentUsage}%</span>
            </div>
            <p className="text-xs text-[#737686] mt-2 italic">Be careful when reducing usage limits below current usage count.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.code ? 'text-error' : 'text-[#434655]'}`}>Promo Code</span>
            <input 
              type="text"
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm font-bold uppercase tracking-widest outline-none transition-all ${
                errors.code ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary focus:ring-2 focus:ring-primary/20'
              }`}
              placeholder="e.g. SUMMER50"
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
              {(events || []).map(ev => <option key={ev.id || ev._id} value={ev.id || ev._id}>{ev.title || ev.name || ev.eventName || 'Unnamed Event'}</option>)}
            </select>
            {errors.event_id && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.event_id}</p>}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-bold text-[#434655] uppercase font-display tracking-tight">Discount Type</span>
            <select 
              className="mt-1.5 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm outline-none focus:border-primary"
              value={formData.discount_type}
              onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
            >
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="FIXED">Fixed Amount ($)</option>
            </select>
          </label>
          <label className="block">
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.discount_value ? 'text-error' : 'text-[#434655]'}`}>Discount Value</span>
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
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.usage_limit ? 'text-error' : 'text-[#434655]'}`}>Usage Limit</span>
            <input 
              type="number"
              className={`mt-1.5 h-11 w-full rounded border px-3 text-sm outline-none transition-all ${
                 errors.usage_limit ? 'border-error bg-error/5 ring-1 ring-error/20' : 'border-[#c3c6d7] bg-white focus:border-primary'
              }`}
              placeholder="Leave empty for unlimited"
              value={formData.usage_limit}
              onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
            />
            {errors.usage_limit && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-error uppercase animate-in fade-in slide-in-from-top-1"><AlertCircle className="size-3" /> {errors.usage_limit}</p>}
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[#434655] uppercase font-display tracking-tight">Min Order Value</span>
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
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.start_time ? 'text-error' : 'text-[#434655]'}`}>Start Date & Time</span>
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
            <span className={`text-xs font-bold uppercase font-display tracking-tight transition-colors ${errors.end_time ? 'text-error' : 'text-[#434655]'}`}>End Date & Time</span>
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

  const getStatusTone = (status) => {
    switch (status) {
      case 'Active': return 'green'
      case 'Scheduled': return 'blue'
      case 'Expired': return 'gray'
      case 'Inactive': return 'red'
      default: return 'blue'
    }
  }

  const formatFullDate = (date) => new Date(date).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  return (
    <Modal open={open} title={`Promo Detail: ${promo.code}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <DetailItem label="PROMO CODE" value={promo.code} highlight />
          <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
            <DetailItem label="SỰ KIỆN ÁP DỤNG" value={promo.event_name ? 'Sự kiện cụ thể' : 'Tất cả sự kiện'} />
            <div className="mt-2 text-sm">
              <span className="font-bold text-gray-500">Tên sự kiện: </span>
              <span className="font-medium">{promo.event_name || 'N/A'}</span>
            </div>
            {promo.event_id && (
              <div className="mt-1 text-xs">
                <span className="font-bold text-gray-500">Event ID: </span>
                <span className="font-mono text-gray-600">{promo.event_id}</span>
              </div>
            )}
          </div>
          <DetailItem label="DISCOUNT" value={
            promo.discount_type === 'PERCENTAGE' 
              ? `${parseFloat(promo.discount_value)}% Off` 
              : `$${parseFloat(promo.discount_value).toLocaleString()} Flat`
          } />
          <DetailItem label="STATUS" value={<Badge tone={getStatusTone(promo.status)}>{promo.status}</Badge>} />
        </div>
        
        <div className="bg-[#f7f9fb] rounded-md p-5 border border-[#c3c6d7]">
          <p className="text-xs font-extrabold uppercase text-[#737686] mb-4">Usage Performance</p>
          
          <div className="space-y-4">
             <div className="flex justify-between items-end">
                <div className="text-3xl font-extrabold text-primary">{promo.used_count}</div>
                <div className="text-sm text-[#434655] font-bold">/ {promo.usage_limit || '∞'} Used</div>
             </div>

             {promo.usage_limit && (
               <>
                 <div className="h-4 rounded-full bg-[#e0e3e5] overflow-hidden relative">
                    <div className="h-full bg-primary" style={{ width: `${promo.usage_percentage}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-sm">
                      {promo.usage_percentage}% REACHED
                    </span>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-white p-3 rounded border border-[#c3c6d7]">
                       <p className="text-[10px] font-bold text-[#737686] uppercase">Remaining</p>
                       <p className="text-lg font-extrabold text-primary-dark">{promo.remaining_usage}</p>
                    </div>
                    <div className="bg-white p-3 rounded border border-[#c3c6d7]">
                       <p className="text-[10px] font-bold text-[#737686] uppercase">Capacity</p>
                       <p className="text-lg font-extrabold">{promo.usage_limit}</p>
                    </div>
                 </div>
               </>
             )}

             {!promo.usage_limit && (
               <div className="bg-white p-4 rounded border border-primary/20 text-center">
                  <p className="text-sm font-bold text-primary italic">No usage limit set for this promo code.</p>
               </div>
             )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-[#e0e3e5]">
         <div className="grid grid-cols-2 gap-4">
            <DetailItem label="START DATE" value={formatFullDate(promo.start_time)} />
            <DetailItem label="END DATE" value={formatFullDate(promo.end_time)} />
         </div>
         <div className="grid grid-cols-2 gap-4">
            <DetailItem label="CREATED AT" value={formatFullDate(promo.created_at || new Date())} />
            <DetailItem label="UPDATED AT" value={formatFullDate(promo.updated_at || new Date())} />
         </div>
      </div>
    </Modal>
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
