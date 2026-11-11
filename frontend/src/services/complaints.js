import { http } from '@/services/http.js'

export const COMPLAINT_CATEGORIES = [
  { value: 'EVENT_CONTENT', label: 'Vấn đề sự kiện / Nội dung sai lệch', color: 'amber' },
  { value: 'ORGANIZER_SERVICE', label: 'Chất lượng dịch vụ Ban tổ chức', color: 'purple' },
  { value: 'TICKET_CHECKIN', label: 'Sự cố vé & Soát vé (Check-in)', color: 'sky' },
  { value: 'FRAUD_SCAM', label: 'Nghi vấn gian lận / Lừa đảo', color: 'rose' },
  { value: 'REFUND_ISSUE', label: 'Vấn đề thanh toán & Hoàn tiền', color: 'emerald' },
  { value: 'OTHER', label: 'Vấn đề khác', color: 'slate' },
]

export const COMPLAINT_STATUSES = [
  { value: 'PENDING', label: 'Chờ xử lý', color: 'amber' },
  { value: 'IN_PROGRESS', label: 'Đang giải quyết', color: 'sky' },
  { value: 'RESOLVED', label: 'Đã giải quyết', color: 'emerald' },
  { value: 'REJECTED', label: 'Từ chối / Bác bỏ', color: 'rose' },
]

export function getCategoryLabel(val) {
  const found = COMPLAINT_CATEGORIES.find((c) => c.value === val)
  return found?.label || val || 'Chưa phân loại'
}

export function getCategoryBadgeClass(val) {
  switch (val) {
    case 'FRAUD_SCAM':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300'
    case 'EVENT_CONTENT':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'ORGANIZER_SERVICE':
      return 'border-purple-500/30 bg-purple-500/10 text-purple-300'
    case 'TICKET_CHECKIN':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
    case 'REFUND_ISSUE':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    default:
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300'
  }
}

export function getStatusBadgeClass(status) {
  switch (status) {
    case 'PENDING':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    case 'IN_PROGRESS':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-400'
    case 'RESOLVED':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    case 'REJECTED':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-400'
    default:
      return 'border-slate-500/30 bg-slate-500/10 text-slate-400'
  }
}

export function getStatusLabel(status) {
  const found = COMPLAINT_STATUSES.find((s) => s.value === status)
  return found?.label || status || 'Chưa rõ'
}

/**
 * Customer APIs
 */
export async function submitComplaint(payload) {
  const res = await http.post('/complaints', payload)
  return res.data
}

export async function fetchMyComplaints() {
  const res = await http.get('/complaints/my')
  return res.data?.data || []
}

/**
 * Admin APIs
 */
export async function fetchAdminComplaints(params = {}) {
  const res = await http.get('/admin/complaints', { params })
  return res.data
}

export async function fetchAdminComplaintStats() {
  const res = await http.get('/admin/complaints/stats')
  return res.data?.data || {}
}

export async function fetchAdminComplaintDetail(id) {
  const res = await http.get(`/admin/complaints/${id}`)
  return res.data?.data || null
}

export async function updateAdminComplaintStatus(id, { status, admin_note }) {
  const res = await http.patch(`/admin/complaints/${id}/status`, { status, admin_note })
  return res.data
}

