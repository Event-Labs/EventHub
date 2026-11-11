import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Search,
  ShieldAlert,
  User,
  X,
  Phone,
  Mail,
  RotateCcw,
  Ticket,
  MessageSquare,
  Send,
  Loader2,
  ImageIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/Modal.jsx'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Page, Panel, Table, TableActionButton } from './AdminComponents.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import { fetchOrganizerRefundRequests } from '@/services/refunds.js'
import {
  fetchAdminComplaints,
  fetchAdminComplaintStats,
  updateAdminComplaintStatus,
  COMPLAINT_CATEGORIES,
  getCategoryLabel,
  getCategoryBadgeClass,
  getStatusLabel,
  getStatusBadgeClass,
} from '@/services/complaints.js'

function formatDateTime(value, isEnglish = false) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value) {
  if (value === undefined || value === null) return '0 đ'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

function getLocalizedCategoryLabel(catValue, isEnglish = false) {
  if (!isEnglish) return getCategoryLabel(catValue)
  switch (catValue) {
    case 'EVENT_CONTENT':
      return 'Event Content / Misleading Info'
    case 'ORGANIZER_SERVICE':
      return 'Organizer Service Quality'
    case 'TICKET_CHECKIN':
      return 'Ticket & Check-in Issue'
    case 'FRAUD_SCAM':
      return 'Suspected Fraud / Scam'
    case 'REFUND_ISSUE':
      return 'Payment & Refund Issue'
    case 'OTHER':
      return 'Other Issue'
    default:
      return catValue || 'Uncategorized'
  }
}

function getLocalizedStatusLabel(status, isEnglish = false) {
  if (!isEnglish) return getStatusLabel(status)
  switch (status) {
    case 'PENDING':
      return 'Pending Review'
    case 'IN_PROGRESS':
      return 'In Progress'
    case 'RESOLVED':
      return 'Resolved'
    case 'REJECTED':
      return 'Rejected'
    default:
      return status || 'Unknown'
  }
}

const REFUND_DISPUTE_FILTERS = [
  { value: 'ALL', label: { vi: 'Tất cả trạng thái', en: 'All Statuses' } },
  { value: 'UNRESOLVED', label: { vi: 'Chưa giải quyết', en: 'Unresolved' } },
  { value: 'HAS_PROOF', label: { vi: 'BTC đã có chứng từ', en: 'Proof Uploaded' } },
  { value: 'NO_PROOF', label: { vi: 'BTC chưa có chứng từ', en: 'Missing Proof' } },
]

const CUSTOMER_COMPLAINT_STATUS_FILTERS = [
  { value: 'ALL', label: { vi: 'Tất cả trạng thái', en: 'All Statuses' } },
  { value: 'PENDING', label: { vi: 'Chờ xử lý', en: 'Pending Review' } },
  { value: 'IN_PROGRESS', label: { vi: 'Đang giải quyết', en: 'In Progress' } },
  { value: 'RESOLVED', label: { vi: 'Đã giải quyết', en: 'Resolved' } },
  { value: 'REJECTED', label: { vi: 'Bác bỏ', en: 'Rejected' } },
]

export function AdminDisputesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { isEnglish, t } = useLanguage()

  // Main Tab Navigation: CUSTOMER_COMPLAINTS vs REFUND_DISPUTES
  const [activeTab, setActiveTab] = useState('CUSTOMER_COMPLAINTS')

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 1: CUSTOMER COMPLAINTS STATE & QUERIES
  // ───────────────────────────────────────────────────────────────────────────
  const [selectedComplaintStatus, setSelectedComplaintStatus] = useState('ALL')
  const [selectedComplaintCategory, setSelectedComplaintCategory] = useState('ALL')
  const [complaintSearchQuery, setComplaintSearchQuery] = useState('')
  const [complaintDetailModalItem, setComplaintDetailModalItem] = useState(null)

  // Complaint resolution form state in modal
  const [resolveStatus, setResolveStatus] = useState('RESOLVED')
  const [resolveAdminNote, setResolveAdminNote] = useState('')

  const complaintStatsQuery = useQuery({
    queryKey: ['admin-complaints-stats'],
    queryFn: () => fetchAdminComplaintStats(),
    refetchInterval: 30_000,
  })

  const complaintsQuery = useQuery({
    queryKey: [
      'admin-complaints',
      selectedComplaintStatus,
      selectedComplaintCategory,
      complaintSearchQuery,
    ],
    queryFn: () =>
      fetchAdminComplaints({
        status: selectedComplaintStatus,
        category: selectedComplaintCategory,
        search: complaintSearchQuery,
      }),
    refetchInterval: 30_000,
  })

  const complaintItems = Array.isArray(complaintsQuery.data?.data)
    ? complaintsQuery.data.data
    : Array.isArray(complaintsQuery.data)
      ? complaintsQuery.data
      : []

  const complaintStats = complaintStatsQuery.data || {}

  // Mutation to update complaint status
  const updateComplaintMutation = useMutation({
    mutationFn: ({ id, status, admin_note }) =>
      updateAdminComplaintStatus(id, { status, admin_note }),
    onSuccess: (res) => {
      toast.success(res?.message || 'Cập nhật trạng thái khiếu nại thành công.')
      queryClient.invalidateQueries({ queryKey: ['admin-complaints'] })
      queryClient.invalidateQueries({ queryKey: ['admin-complaints-stats'] })
      setComplaintDetailModalItem(null)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Không thể cập nhật trạng thái khiếu nại.')
    },
  })

  const handleOpenComplaintDetail = (item) => {
    setComplaintDetailModalItem(item)
    setResolveStatus(item.status === 'PENDING' ? 'IN_PROGRESS' : item.status)
    setResolveAdminNote(item.admin_note || '')
  }

  const handleSaveComplaintResolution = (e) => {
    e.preventDefault()
    if (!complaintDetailModalItem?.id) return
    updateComplaintMutation.mutate({
      id: complaintDetailModalItem.id,
      status: resolveStatus,
      admin_note: resolveAdminNote,
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 2: REFUND DISPUTES STATE & QUERIES (Existing functionality)
  // ───────────────────────────────────────────────────────────────────────────
  const [selectedRefundFilter, setSelectedRefundFilter] = useState('ALL')
  const [refundSearchQuery, setRefundSearchQuery] = useState('')
  const [refundDetailModalItem, setRefundDetailModalItem] = useState(null)

  const refundDisputesQuery = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: () => fetchOrganizerRefundRequests({ status: 'DISPUTED' }),
    refetchInterval: 30_000,
  })

  const rawRefundList = Array.isArray(refundDisputesQuery.data)
    ? refundDisputesQuery.data
    : refundDisputesQuery.data?.data || []

  const uniqueRefundOrganizersCount = useMemo(() => {
    const orgs = new Set()
    rawRefundList.forEach((item) => {
      const orgId = item.organizer_id || item.event?.organizer_id
      if (orgId) orgs.add(orgId)
    })
    return orgs.size
  }, [rawRefundList])

  const totalDisputedAmount = useMemo(() => {
    return rawRefundList.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0)
  }, [rawRefundList])

  const unresolvedRefundCount = useMemo(() => {
    return rawRefundList.filter((item) => item.disputed === true).length
  }, [rawRefundList])

  const filteredRefundList = useMemo(() => {
    return rawRefundList.filter((item) => {
      if (selectedRefundFilter === 'UNRESOLVED') {
        if (!item.disputed) return false
      } else if (selectedRefundFilter === 'HAS_PROOF') {
        if (
          !item.proof_url &&
          !item.organizer_proof_url &&
          !item.transaction_ref &&
          !item.organizer_transaction_ref
        ) {
          return false
        }
      } else if (selectedRefundFilter === 'NO_PROOF') {
        if (
          item.proof_url ||
          item.organizer_proof_url ||
          item.transaction_ref ||
          item.organizer_transaction_ref
        ) {
          return false
        }
      }

      if (!refundSearchQuery.trim()) return true
      const query = refundSearchQuery.toLowerCase()
      const ticketCode = item.ticket?.ticket_code?.toLowerCase() || ''
      const orderCode = item.order?.order_code?.toLowerCase() || ''
      const buyerName = (item.customer?.full_name || item.order?.buyer_name || '').toLowerCase()
      const buyerEmail = (item.customer?.email || item.order?.buyer_email || '').toLowerCase()
      const buyerPhone = (item.customer?.phone || '').toLowerCase()
      const eventTitle = (item.event?.title || '').toLowerCase()
      const orgName = (
        item.event?.organizers?.business_name ||
        item.organizer_name ||
        ''
      ).toLowerCase()
      const reason = (item.dispute_reason || '').toLowerCase()

      return (
        ticketCode.includes(query) ||
        orderCode.includes(query) ||
        buyerName.includes(query) ||
        buyerEmail.includes(query) ||
        buyerPhone.includes(query) ||
        eventTitle.includes(query) ||
        orgName.includes(query) ||
        reason.includes(query)
      )
    })
  }, [rawRefundList, selectedRefundFilter, refundSearchQuery])

  return (
    <Page
      title={isEnglish ? 'Dispute & Complaint Management' : 'Quản lý Khiếu nại'}
      description={isEnglish ? 'Review and resolve customer complaints, event disputes, and monitor refund disputes system-wide' : 'Tiếp nhận, xử lý phản ánh của khách hàng về sự kiện, ban tổ chức, vé và giám sát các khiếu nại hoàn tiền trên toàn hệ thống'}
    >
      <div className="space-y-6">
        {/* TOP LEVEL NAVIGATION TABS */}
        <div className="flex border-b border-border-soft/60 gap-2 sm:gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('CUSTOMER_COMPLAINTS')}
            className={`flex items-center gap-2.5 pb-3.5 px-1 sm:px-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'CUSTOMER_COMPLAINTS'
                ? 'border-[#C99A47] text-[#E6C17A]'
                : 'border-transparent text-subtle hover:text-white'
            }`}
          >
            <ShieldAlert className="size-4.5" />
            <span>{isEnglish ? 'Customer Complaints' : 'Khiếu nại từ Khách hàng'}</span>
            {Number(complaintStats.pending_complaints || 0) > 0 && (
              <span className="rounded-full bg-[#C99A47]/20 border border-[#C99A47]/40 px-2.5 py-0.5 text-[10px] font-black text-[#E6C17A]">
                {complaintStats.pending_complaints}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('REFUND_DISPUTES')}
            className={`flex items-center gap-2.5 pb-3.5 px-1 sm:px-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'REFUND_DISPUTES'
                ? 'border-[#C99A47] text-[#E6C17A]'
                : 'border-transparent text-subtle hover:text-white'
            }`}
          >
            <RotateCcw className="size-4.5" />
            <span>{isEnglish ? 'Refund Complaints' : 'Khiếu nại Hoàn tiền'}</span>
            {unresolvedRefundCount > 0 && (
              <span className="rounded-full bg-[#C99A47]/20 border border-[#C99A47]/40 px-2.5 py-0.5 text-[10px] font-black text-[#E6C17A]">
                {unresolvedRefundCount}
              </span>
            )}
          </button>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1 CONTENT: CUSTOMER COMPLAINTS                                    */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'CUSTOMER_COMPLAINTS' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Chờ xử lý */}
              <div
                onClick={() => setSelectedComplaintStatus('PENDING')}
                className={`glass-panel flex flex-col justify-between rounded-[24px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
                  selectedComplaintStatus === 'PENDING'
                    ? 'border-[#C99A47] bg-[#C99A47]/10 ring-1 ring-[#C99A47]/40 shadow-[0_0_15px_rgba(201,154,71,0.15)]'
                    : 'border-white/5 hover:border-[#C99A47]/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                      {isEnglish ? 'Pending Review' : 'Chờ xử lý'}
                    </p>
                    {Number(complaintStats.pending_complaints || 0) > 0 && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
                        {isEnglish ? 'Action Required' : 'Cần xử lý'}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight font-display drop-shadow-sm leading-tight [html.light_&]:text-[#0D1B2A]">
                    {complaintStats.pending_complaints || 0}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'New complaints needing attention and action' : 'Phản ánh mới cần xem xét và can thiệp'}
                </p>
              </div>

              {/* Card 2: Đang giải quyết */}
              <div
                onClick={() => setSelectedComplaintStatus('IN_PROGRESS')}
                className={`glass-panel flex flex-col justify-between rounded-[24px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
                  selectedComplaintStatus === 'IN_PROGRESS'
                    ? 'border-[#C99A47] bg-[#C99A47]/10 ring-1 ring-[#C99A47]/40 shadow-[0_0_15px_rgba(201,154,71,0.15)]'
                    : 'border-white/5 hover:border-[#C99A47]/40'
                }`}
              >
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'In Progress' : 'Đang giải quyết'}
                  </p>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight font-display drop-shadow-sm leading-tight [html.light_&]:text-[#0D1B2A]">
                    {complaintStats.in_progress_complaints || 0}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Working with organizers or customers' : 'Đang làm việc với Ban tổ chức hoặc khách hàng'}
                </p>
              </div>

              {/* Card 3: Đã giải quyết */}
              <div
                onClick={() => setSelectedComplaintStatus('RESOLVED')}
                className={`glass-panel flex flex-col justify-between rounded-[24px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
                  selectedComplaintStatus === 'RESOLVED'
                    ? 'border-[#C99A47] bg-[#C99A47]/10 ring-1 ring-[#C99A47]/40 shadow-[0_0_15px_rgba(201,154,71,0.15)]'
                    : 'border-white/5 hover:border-[#C99A47]/40'
                }`}
              >
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'Resolved' : 'Đã giải quyết'}
                  </p>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight font-display drop-shadow-sm leading-tight [html.light_&]:text-[#0D1B2A]">
                    {complaintStats.resolved_complaints || 0}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Complaints successfully resolved' : 'Khiếu nại đã hoàn tất xử lý thỏa đáng'}
                </p>
              </div>

              {/* Card 4: Ban tổ chức bị phản ánh */}
              <div className="glass-panel flex flex-col justify-between rounded-[24px] border-white/5 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-[#C99A47]/40">
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'Reported Organizers' : 'BTC có khiếu nại'}
                  </p>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight font-display drop-shadow-sm leading-tight [html.light_&]:text-[#0D1B2A]">
                    {complaintStats.unique_organizers_complained || 0}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Total organizers with reported complaints' : 'Tổng đơn vị phát sinh khiếu nại trên hệ thống'}
                </p>
              </div>
            </div>

            {/* Filters and Search Bar - All on one row */}
            <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto">
                {CUSTOMER_COMPLAINT_STATUS_FILTERS.map((f) => {
                  const isActive = selectedComplaintStatus === f.value
                  const label = isEnglish ? f.label.en : f.label.vi
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setSelectedComplaintStatus(f.value)}
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap shadow-sm transition duration-200 hover:-translate-y-0.5 cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30'
                          : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-[#C99A47]/50 hover:bg-surface hover:text-[#E6C17A]'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Right Controls: Category Select & Search */}
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedComplaintCategory}
                  onChange={(e) => setSelectedComplaintCategory(e.target.value)}
                  className="h-9 rounded-full border border-border-soft/60 bg-[#121b33] px-3 text-xs font-medium text-content outline-none focus:border-[#C99A47] cursor-pointer shadow-inner"
                >
                  <option value="ALL">{isEnglish ? 'All categories' : 'Tất cả danh mục'}</option>
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {getLocalizedCategoryLabel(c.value, isEnglish)}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle pointer-events-none" />
                  <input
                    type="text"
                    placeholder={isEnglish ? 'Search...' : 'Tìm kiếm'}
                    value={complaintSearchQuery}
                    onChange={(e) => setComplaintSearchQuery(e.target.value)}
                    className="h-9 w-36 sm:w-44 lg:w-48 rounded-full border border-border-soft/60 bg-[#121b33] pl-8 pr-3 text-xs text-white placeholder:text-subtle outline-none focus:border-[#C99A47] transition shadow-inner"
                  />
                </div>
              </div>
            </div>

            {/* Complaints Table */}
            {complaintsQuery.isLoading ? (
              <div className="rounded-2xl border border-border-soft/40 bg-panel-soft p-10 text-center text-sm text-slate-400">
                <Loader2 className="size-6 animate-spin mx-auto text-rose-400 mb-2" />
                {isEnglish ? 'Loading complaints list...' : 'Đang tải danh sách khiếu nại...'}
              </div>
            ) : complaintItems.length === 0 ? (
              <div className="rounded-2xl border border-border-soft/40 bg-panel-soft p-12 text-center">
                <p className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {isEnglish ? 'No matching complaints found' : 'Không có khiếu nại nào phù hợp'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {isEnglish
                    ? 'There are currently no customer complaints matching the selected filters.'
                    : 'Hiện tại không có phản ánh nào từ khách hàng ở trạng thái hoặc bộ lọc này.'}
                </p>
              </div>
            ) : (
              <Table
                compact
                headers={
                  isEnglish
                    ? [
                        'COMPLAINT ID / DATE',
                        'CUSTOMER',
                        'RELATED TARGET',
                        'CATEGORIES',
                        'TITLE & DESCRIPTION',
                        'STATUS',
                        'ACTIONS',
                      ]
                    : [
                        'MÃ KN / NGÀY GỬI',
                        'KHÁCH HÀNG',
                        'ĐỐI TƯỢNG LIÊN QUAN',
                        'DANH MỤC',
                        'TIÊU ĐỀ & NỘI DUNG PHẢN ÁNH',
                        'TRẠNG THÁI',
                        'THAO TÁC',
                      ]
                }
                rows={complaintItems.map((item) => {
                  const hasEvidences = Array.isArray(item.evidence_urls) && item.evidence_urls.length > 0
                  return [
                    // 1. Mã KN / Ngày
                    <div key="id" className="space-y-0.5">
                      <span className="font-mono text-xs font-bold text-sky-400">
                        #{item.id?.slice(0, 8)}
                      </span>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatDateTime(item.created_at, isEnglish)}
                      </p>
                    </div>,

                    // 2. Khách hàng
                    <div key="customer" className="space-y-0.5">
                      <p className="text-xs font-bold text-white [html.light_&]:text-[#0D1B2A]">
                        {item.customer_name || (isEnglish ? 'Customer' : 'Khách hàng')}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.contact_email || item.customer_email || ''}
                      </p>
                      {(item.contact_phone || item.customer_phone) && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          {item.contact_phone || item.customer_phone}
                        </p>
                      )}
                    </div>,

                    // 3. Đối tượng liên quan
                    <div key="target" className="max-w-[200px] space-y-0.5">
                      {item.event_title ? (
                        <p className="text-xs font-bold text-white [html.light_&]:text-[#0D1B2A] truncate" title={item.event_title}>
                          {item.event_title}
                        </p>
                      ) : (
                        <p className="text-xs italic text-slate-500">
                          {isEnglish ? 'General platform issue' : 'Khiếu nại chung'}
                        </p>
                      )}
                      {item.organizer_name && (
                        <p className="text-[11px] text-amber-300 [html.light_&]:text-amber-800 truncate font-semibold">
                          {isEnglish ? 'Organizer: ' : 'BTC: '}{item.organizer_name}
                        </p>
                      )}
                      {item.ticket_code && (
                        <span className="font-mono text-[10px] text-sky-300 [html.light_&]:text-sky-700">
                          {isEnglish ? 'Ticket: ' : 'Vé: '}{item.ticket_code}
                        </span>
                      )}
                    </div>,

                    // 4. Danh mục
                    <div key="category">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(item.category)}`}>
                        {getLocalizedCategoryLabel(item.category, isEnglish)}
                      </span>
                    </div>,

                    // 5. Tiêu đề & Nội dung
                    <div key="content" className="max-w-[260px] space-y-1">
                      <p className="text-xs font-bold text-white [html.light_&]:text-[#0D1B2A] truncate" title={item.title}>
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-300 [html.light_&]:text-slate-600 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                      {hasEvidences && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-300 [html.light_&]:text-rose-700">
                          <ImageIcon className="size-3" />
                          {item.evidence_urls.length} {isEnglish ? (item.evidence_urls.length > 1 ? 'evidence photos' : 'evidence photo') : 'ảnh minh chứng'}
                        </span>
                      )}
                    </div>,

                    // 6. Trạng thái
                    <div key="status">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(item.status)}`}>
                        {getLocalizedStatusLabel(item.status, isEnglish)}
                      </span>
                      {item.admin_note && (
                        <p className="text-[10px] text-slate-400 mt-1 italic truncate max-w-[120px]" title={item.admin_note}>
                          {isEnglish ? 'Note: ' : 'Ghi chú: '}{item.admin_note}
                        </p>
                      )}
                    </div>,

                    // 7. Thao tác
                    <div key="actions" className="flex items-center justify-center">
                      <TableActionButton
                        title={isEnglish ? 'View details & resolve complaint' : 'Xem chi tiết & Xử lý khiếu nại'}
                        onClick={() => handleOpenComplaintDetail(item)}
                        icon={Eye}
                        tone="default"
                      />
                    </div>,
                  ]
                })}
              />
            )}

            {/* DETAIL & RESOLUTION MODAL FOR CUSTOMER COMPLAINTS */}
            {complaintDetailModalItem && (
              <Modal
                open={Boolean(complaintDetailModalItem)}
                title={
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span>
                      {isEnglish ? 'Complaint' : 'Khiếu nại'} #{complaintDetailModalItem.id?.slice(0, 8)}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(complaintDetailModalItem.status)}`}>
                      {getLocalizedStatusLabel(complaintDetailModalItem.status, isEnglish)}
                    </span>
                  </div>
                }
                onClose={() => setComplaintDetailModalItem(null)}
                maxWidth="max-w-3xl"
                footer={
                  <div className="flex w-full items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setComplaintDetailModalItem(null)}
                      className="admin-secondary px-6"
                    >
                      {isEnglish ? 'Cancel' : 'Hủy'}
                    </button>
                    <button
                      type="submit"
                      form="complaint-resolution-form"
                      disabled={updateComplaintMutation.isPending}
                      className="admin-primary px-6 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {updateComplaintMutation.isPending
                        ? (isEnglish ? 'Saving...' : 'Đang lưu...')
                        : (isEnglish ? 'Save' : 'Lưu')}
                    </button>
                  </div>
                }
              >
                <form id="complaint-resolution-form" onSubmit={handleSaveComplaintResolution} className="space-y-6 py-1">
                  {/* Customer & Target Information Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Customer Info */}
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-black uppercase tracking-wider text-white [html.light_&]:text-slate-600 block text-xs">
                        {isEnglish ? 'Complainant Info' : 'Thông tin Người khiếu nại'}
                      </span>
                      <p className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A] flex items-center gap-2">
                        <User className="size-4 text-[#C99A47]" />
                        {complaintDetailModalItem.customer_name || (isEnglish ? 'Customer' : 'Khách hàng')}
                      </p>
                      <p className="text-slate-300 [html.light_&]:text-slate-600 flex items-center gap-2">
                        <Mail className="size-3.5 text-[#C99A47]" />
                        {complaintDetailModalItem.contact_email || complaintDetailModalItem.customer_email || 'N/A'}
                      </p>
                      {(complaintDetailModalItem.contact_phone || complaintDetailModalItem.customer_phone) && (
                        <p className="text-slate-300 [html.light_&]:text-slate-600 flex items-center gap-2">
                          <Phone className="size-3.5 text-[#C99A47]" />
                          {complaintDetailModalItem.contact_phone || complaintDetailModalItem.customer_phone}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 pt-1 border-t border-white/5 [html.light_&]:border-slate-200 flex items-center gap-1">
                        <Clock className="size-3" />
                        {isEnglish ? 'Submitted:' : 'Thời gian gửi:'} {formatDateTime(complaintDetailModalItem.created_at, isEnglish)}
                      </p>
                    </div>

                    {/* Target Event / Organizer */}
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-black uppercase tracking-wider text-white [html.light_&]:text-slate-600 block text-xs">
                        {isEnglish ? 'Reported Target' : 'Đối tượng bị phản ánh'}
                      </span>
                      {complaintDetailModalItem.event_title ? (
                        <>
                          <p className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A] truncate" title={complaintDetailModalItem.event_title}>
                            {complaintDetailModalItem.event_title}
                          </p>
                          {complaintDetailModalItem.organizer_name && (
                            <p className="text-amber-400 [html.light_&]:text-amber-800 font-semibold flex items-center gap-1.5">
                              <Building2 className="size-3.5" />
                              {isEnglish ? 'Organizer: ' : 'BTC: '}{complaintDetailModalItem.organizer_name}
                            </p>
                          )}
                          {complaintDetailModalItem.ticket_code && (
                            <p className="font-mono text-sky-400 [html.light_&]:text-sky-700 flex items-center gap-1.5">
                              <Ticket className="size-3.5" />
                              {isEnglish ? 'Ticket code:' : 'Mã vé:'} {complaintDetailModalItem.ticket_code}
                            </p>
                          )}
                          {complaintDetailModalItem.organizer_id && (
                            <div className="pt-1">
                              <Link
                                to={`/admin/organizers/${complaintDetailModalItem.organizer_id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C99A47]/40 bg-[#C99A47]/10 px-2.5 py-1 text-[11px] font-semibold text-[#E6C17A] [html.light_&]:bg-amber-100 [html.light_&]:text-amber-800 [html.light_&]:border-amber-300 hover:opacity-80 transition"
                              >
                                <Building2 className="size-3" /> {isEnglish ? 'View Organizer Profile' : 'Xem hồ sơ Ban tổ chức'}
                              </Link>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-slate-400 [html.light_&]:text-slate-500 italic">
                          {isEnglish ? 'General platform complaint' : 'Khiếu nại dịch vụ chung nền tảng'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Complaint Details Box */}
                  <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2.5 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(complaintDetailModalItem.category)}`}>
                        {getLocalizedCategoryLabel(complaintDetailModalItem.category, isEnglish)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                      {complaintDetailModalItem.title}
                    </h4>
                    <p className="text-xs text-slate-200 [html.light_&]:text-slate-700 leading-relaxed whitespace-pre-line">
                      {complaintDetailModalItem.description}
                    </p>

                    {/* Evidence Gallery */}
                    {Array.isArray(complaintDetailModalItem.evidence_urls) &&
                      complaintDetailModalItem.evidence_urls.length > 0 && (
                        <div className="pt-3 border-t border-white/10 [html.light_&]:border-slate-200 space-y-2">
                          <span className="text-[11px] font-bold text-[#E6C17A] [html.light_&]:text-amber-800 flex items-center gap-1.5">
                            <ImageIcon className="size-3.5" />
                            {isEnglish
                              ? `Attached proof images (${complaintDetailModalItem.evidence_urls.length}):`
                              : `Ảnh minh chứng đính kèm (${complaintDetailModalItem.evidence_urls.length} ảnh):`}
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {complaintDetailModalItem.evidence_urls.map((imgUrl, i) => (
                              <a
                                key={i}
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative aspect-square rounded-xl overflow-hidden border border-white/20 bg-black block hover:border-[#C99A47] transition-colors"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`Evidence ${i + 1}`}
                                  className="size-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <ExternalLink className="size-4 text-white" />
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Previous Resolution Note if any */}
                  {complaintDetailModalItem.admin_note && (
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-1 text-xs [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-bold text-slate-400 [html.light_&]:text-slate-500 text-[10px] uppercase tracking-wider block">
                        {isEnglish ? 'Previous Resolution Note' : 'Ghi chú xử lý trước đó'}
                      </span>
                      <p className="text-slate-200 [html.light_&]:text-slate-700 italic">
                        &ldquo;{complaintDetailModalItem.admin_note}&rdquo;
                      </p>
                      {complaintDetailModalItem.resolved_by_name && (
                        <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 pt-1">
                          {isEnglish ? 'Resolved by:' : 'Người xử lý:'} <strong>{complaintDetailModalItem.resolved_by_name}</strong>{' '}
                          {complaintDetailModalItem.resolved_at && `(${formatDateTime(complaintDetailModalItem.resolved_at)})`}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="border-t border-white/10 [html.light_&]:border-slate-200" />

                  {/* ADMIN RESOLUTION SECTION */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                        {isEnglish ? 'Update Status & Customer Feedback' : 'Cập nhật trạng thái & Phản hồi khiếu nại'}
                      </h4>
                    </div>

                    {/* Status Select */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { val: 'PENDING', label: isEnglish ? 'Pending' : 'Chờ xử lý' },
                        { val: 'IN_PROGRESS', label: isEnglish ? 'In Progress' : 'Đang giải quyết' },
                        { val: 'RESOLVED', label: isEnglish ? 'Resolved' : 'Đã giải quyết' },
                        { val: 'REJECTED', label: isEnglish ? 'Rejected' : 'Từ chối / Bác bỏ' },
                      ].map((st) => (
                        <button
                          key={st.val}
                          type="button"
                          onClick={() => setResolveStatus(st.val)}
                          className={`rounded-xl border p-2.5 text-center text-xs font-bold transition cursor-pointer ${
                            resolveStatus === st.val
                              ? 'border-[#C99A47] bg-[#C99A47]/20 text-[#E6C17A] [html.light_&]:border-[#C99A47] [html.light_&]:bg-amber-100 [html.light_&]:text-amber-900 shadow-sm'
                              : 'border-white/15 bg-[#121c38]/60 text-slate-400 hover:text-white [html.light_&]:border-slate-200 [html.light_&]:bg-white [html.light_&]:text-slate-700 [html.light_&]:hover:bg-slate-50'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {/* Admin Note / Resolution message */}
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D] mb-2">
                        {isEnglish ? 'Resolution notes / Message to customer:' : 'Ghi chú xử lý / Nội dung phản hồi đến khách hàng:'}
                      </span>
                      <textarea
                        rows={3}
                        placeholder={
                          isEnglish
                            ? 'Enter resolution details, action taken with organizer or advice for customer...'
                            : 'Nhập kết quả xử lý, đôn đốc BTC hoặc hướng dẫn cho khách hàng...'
                        }
                        value={resolveAdminNote}
                        onChange={(e) => setResolveAdminNote(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-[#121c38]/60 p-3.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-[#C99A47] [html.light_&]:border-slate-300 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A] leading-relaxed"
                      />
                      <p className="mt-1.5 text-[11px] text-slate-400 [html.light_&]:text-slate-500 italic">
                        {isEnglish
                          ? '* When status is set to "Resolved" or "Rejected", an email notification will be sent to the customer.'
                          : '* Khi chuyển sang trạng thái "Đã giải quyết" hoặc "Bác bỏ", hệ thống sẽ tự động gửi thông báo phản hồi qua email tới khách hàng.'}
                      </p>
                    </div>
                  </div>
                </form>
              </Modal>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2 CONTENT: REFUND DISPUTES (Existing functionality)               */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'REFUND_DISPUTES' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Đang khiếu nại */}
              <div
                onClick={() => setSelectedRefundFilter('UNRESOLVED')}
                className={`glass-panel flex flex-col justify-between rounded-[24px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
                  selectedRefundFilter === 'UNRESOLVED'
                    ? 'border-[#C99A47] bg-[#C99A47]/10 ring-1 ring-[#C99A47]/40 shadow-[0_0_15px_rgba(201,154,71,0.15)]'
                    : 'border-white/5 hover:border-[#C99A47]/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                      {isEnglish ? 'Disputed Refunds' : 'Đang khiếu nại'}
                    </p>
                    {unresolvedRefundCount > 0 && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
                        {isEnglish ? 'Action Required' : 'Cần xử lý'}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight font-display drop-shadow-sm leading-tight [html.light_&]:text-[#0D1B2A]">
                    {unresolvedRefundCount}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Customers report not received refund' : 'Khách hàng báo chưa nhận được tiền vào tài khoản'}
                </p>
              </div>

              {/* Card 2: Tổng số tiền tranh chấp */}
              <div className="glass-panel flex flex-col justify-between rounded-[24px] border-white/5 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-[#C99A47]/40">
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'Disputed Amount' : 'Tổng tiền khiếu nại'}
                  </p>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-[#E6C17A] tracking-tight font-display drop-shadow-sm leading-tight">
                    {formatCurrency(totalDisputedAmount)}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Total refund amount awaiting audit' : 'Tổng giá trị vé đang chờ đối soát hoàn tiền'}
                </p>
              </div>

              {/* Card 3: Số Ban tổ chức liên quan */}
              <div className="glass-panel flex flex-col justify-between rounded-[24px] border-white/5 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-[#C99A47]/40">
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'Related Organizers' : 'Ban tổ chức liên quan'}
                  </p>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight font-display drop-shadow-sm leading-tight [html.light_&]:text-[#0D1B2A]">
                    {uniqueRefundOrganizersCount}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Organizers with disputed refunds' : 'Đơn vị phát sinh khiếu nại cần theo dõi nghĩa vụ'}
                </p>
              </div>

              {/* Card 4: Tình trạng chứng từ */}
              <div
                onClick={() => setSelectedRefundFilter('NO_PROOF')}
                className={`glass-panel flex flex-col justify-between rounded-[24px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
                  selectedRefundFilter === 'NO_PROOF'
                    ? 'border-[#C99A47] bg-[#C99A47]/10 ring-1 ring-[#C99A47]/40 shadow-[0_0_15px_rgba(201,154,71,0.15)]'
                    : 'border-white/5 hover:border-[#C99A47]/40'
                }`}
              >
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    {isEnglish ? 'Missing Proof' : 'BTC chưa có chứng từ'}
                  </p>
                  <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-amber-300 tracking-tight font-display drop-shadow-sm leading-tight">
                    {
                      rawRefundList.filter(
                        (i) =>
                          !i.proof_url &&
                          !i.organizer_proof_url &&
                          !i.transaction_ref &&
                          !i.organizer_transaction_ref
                      ).length
                    }
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-subtle leading-relaxed">
                  {isEnglish ? 'Need follow-up with organizer for proof' : 'Cần đôn đốc BTC thực hiện chuyển khoản cho khách'}
                </p>
              </div>
            </div>

            {/* Filters and Search Bar - All on one row */}
            <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto">
                {REFUND_DISPUTE_FILTERS.map((f) => {
                  const isActive = selectedRefundFilter === f.value
                  const label = isEnglish ? f.label.en : f.label.vi
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setSelectedRefundFilter(f.value)}
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap shadow-sm transition duration-200 hover:-translate-y-0.5 cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30'
                          : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-[#C99A47]/50 hover:bg-surface hover:text-[#E6C17A]'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Search */}
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle pointer-events-none" />
                <input
                  type="text"
                  placeholder={isEnglish ? 'Search...' : 'Tìm kiếm'}
                  value={refundSearchQuery}
                  onChange={(e) => setRefundSearchQuery(e.target.value)}
                  className="h-9 w-40 sm:w-48 lg:w-56 rounded-full border border-border-soft/60 bg-[#121b33] pl-8 pr-3 text-xs text-white placeholder:text-subtle outline-none focus:border-[#C99A47] transition shadow-inner"
                />
              </div>
            </div>

            {/* Table */}
            {refundDisputesQuery.isLoading ? (
              <div className="rounded-2xl border border-border-soft/40 bg-panel-soft p-8 text-center text-sm text-slate-400">
                {isEnglish ? 'Loading refund disputes list...' : 'Đang tải danh sách khiếu nại hoàn tiền...'}
              </div>
            ) : filteredRefundList.length === 0 ? (
              <div className="rounded-2xl border border-border-soft/40 bg-panel-soft p-12 text-center">
                <p className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {isEnglish ? 'No refund disputes needing action' : 'Không có khiếu nại hoàn tiền nào cần xử lý'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {isEnglish
                    ? 'All customers have received their refunds or no disputes have been raised.'
                    : 'Tất cả khách hàng đã nhận được tiền hoàn vé hoặc không có tranh chấp nào phát sinh.'}
                </p>
              </div>
            ) : (
              <Table
                compact
                headers={
                  isEnglish
                    ? [
                        'REQUEST ID / DATE',
                        'ORGANIZER / EVENT',
                        'CUSTOMER',
                        'AMOUNT',
                        'DISPUTE REASON',
                        'PROOF & AUDIT',
                        'ACTIONS',
                      ]
                    : [
                        'MÃ YC / NGÀY KHIẾU NẠI',
                        'BAN TỔ CHỨC / SỰ KIỆN',
                        'KHÁCH HÀNG',
                        'SỐ TIỀN',
                        'LÝ DO KHIẾU NẠI',
                        'ĐỐI SOÁT TỪ BTC',
                        'THAO TÁC',
                      ]
                }
                rows={filteredRefundList.map((item) => {
                  const hasProof = Boolean(
                    item.proof_url ||
                      item.organizer_proof_url ||
                      item.transaction_ref ||
                      item.organizer_transaction_ref
                  )
                  return [
                    // 1. Mã YC / Ngày
                    <div key="code" className="space-y-0.5">
                      <span className="font-mono text-xs font-bold text-sky-400">
                        #{item.id?.slice(0, 8)}
                      </span>
                      <p className="text-[11px] text-rose-300 flex items-center gap-1 font-medium">
                        <Clock className="size-3" />
                        {formatDateTime(item.disputed_at || item.updated_at, isEnglish)}
                      </p>
                    </div>,

                    // 2. BTC / Sự kiện
                    <div key="event" className="max-w-[220px] space-y-0.5">
                      <p
                        className="text-xs font-bold text-white [html.light_&]:text-[#0D1B2A] truncate"
                        title={item.event?.title}
                      >
                        {item.event?.title || (isEnglish ? 'Event' : 'Sự kiện')}
                      </p>
                      <p className="text-[11px] text-amber-300 [html.light_&]:text-amber-800 truncate font-semibold">
                        {isEnglish ? 'Organizer: ' : 'BTC: '}{item.event?.organizers?.business_name || item.organizer_name || (isEnglish ? 'Organizer' : 'Ban tổ chức')}
                      </p>
                    </div>,

                    // 3. Khách hàng
                    <div key="buyer" className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-200 [html.light_&]:text-[#0D1B2A]">
                        {item.customer?.full_name || item.order?.buyer_name || (isEnglish ? 'Customer' : 'Khách hàng')}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.customer?.email || item.order?.buyer_email || ''}
                      </p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {isEnglish ? 'Ticket: ' : 'Mã vé: '}{item.ticket?.ticket_code || item.order?.order_code || 'N/A'}
                      </p>
                    </div>,

                    // 4. Số tiền
                    <span key="amount" className="font-mono font-bold text-amber-400 [html.light_&]:text-amber-700 text-xs">
                      {formatCurrency(item.refund_amount)}
                    </span>,

                    // 5. Lý do khiếu nại
                    <div key="reason" className="max-w-[240px]">
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200 [html.light_&]:text-rose-800 leading-snug">
                        &ldquo;{item.dispute_reason || (isEnglish ? 'Customer reported that refund was not received into bank account.' : 'Khách hàng báo chưa nhận được tiền hoàn vào tài khoản.')}&rdquo;
                      </div>
                    </div>,

                    // 6. Đối soát từ BTC
                    <div key="proof" className="space-y-1">
                      {hasProof ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 [html.light_&]:text-emerald-800">
                          <CheckCircle2 className="size-3 text-emerald-400 [html.light_&]:text-emerald-700" />
                          {isEnglish ? 'Proof / Txn Ref provided' : 'Đã có mã GD / biên lai'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 [html.light_&]:text-amber-800">
                          <AlertCircle className="size-3 text-amber-400 [html.light_&]:text-amber-700" />
                          {isEnglish ? 'Missing proof' : 'Chưa có chứng từ'}
                        </span>
                      )}
                      {item.refund_method && (
                        <p className="text-[10px] text-slate-400">
                          {isEnglish ? 'Method: ' : 'Phương thức: '}{item.refund_method === 'PAYOS' ? 'PayOS' : (isEnglish ? 'Manual transfer' : 'Thủ công')}
                        </p>
                      )}
                    </div>,

                    // 7. Thao tác
                    <div key="actions" className="flex items-center justify-center">
                      <TableActionButton
                        title={isEnglish ? 'View refund dispute details & audit' : 'Xem chi tiết khiếu nại & đối soát'}
                        onClick={() => setRefundDetailModalItem(item)}
                        icon={Eye}
                        tone="default"
                      />
                    </div>,
                  ]
                })}
              />
            )}

            {/* Detail Modal for Refund Dispute Review */}
            {refundDetailModalItem && (
              <Modal
                open={Boolean(refundDetailModalItem)}
                title={
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span>
                      {isEnglish ? 'Refund Dispute' : 'Chi tiết Khiếu nại hoàn tiền'} #{refundDetailModalItem.id?.slice(0, 8)}
                    </span>
                    <span className="text-xs font-normal text-slate-400 [html.light_&]:text-slate-500">
                      ({isEnglish ? 'Submitted: ' : 'Gửi lúc: '} {formatDateTime(refundDetailModalItem.disputed_at || refundDetailModalItem.updated_at, isEnglish)})
                    </span>
                  </div>
                }
                onClose={() => setRefundDetailModalItem(null)}
                maxWidth="max-w-3xl"
                footer={
                  <div className="flex w-full items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] text-slate-400 [html.light_&]:text-slate-500 italic">
                      * {isEnglish ? 'If organizer does not refund in time, Admin may suspend them via Organizer Profile.' : 'Nếu Ban tổ chức không hoàn tiền đúng hạn, Admin có thể đình chỉ hoạt động tại trang Hồ sơ Organizer.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setRefundDetailModalItem(null)}
                      className="admin-secondary px-6"
                    >
                      {isEnglish ? 'Close' : 'Đóng'}
                    </button>
                  </div>
                }
              >
                <div className="space-y-6 py-1">
                  {/* Dispute Alert Banner */}
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1 text-xs text-amber-200 [html.light_&]:border-amber-300 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-900">
                    <div className="flex items-center gap-2 font-bold text-amber-400 [html.light_&]:text-amber-800 text-sm">
                      <AlertCircle className="size-4 shrink-0" />
                      {isEnglish ? 'Customer Dispute Content' : 'Nội dung khiếu nại từ khách hàng'}
                    </div>
                    <p className="text-sm font-medium text-white [html.light_&]:text-[#0D1B2A] pt-1 leading-relaxed">
                      &ldquo;{refundDetailModalItem.dispute_reason || (isEnglish ? 'Customer reported that refund was not received after organizer confirmation.' : 'Khách hàng báo chưa nhận được tiền vào tài khoản ngân hàng sau khi BTC xác nhận hoàn tiền.')}&rdquo;
                    </p>
                  </div>

                  {/* Grid Information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Event & Organizer */}
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-black uppercase tracking-wider text-white [html.light_&]:text-slate-600 block text-xs">
                        {isEnglish ? 'Event & Organizer' : 'Sự kiện & Ban tổ chức'}
                      </span>
                      <p className="font-bold text-white [html.light_&]:text-[#0D1B2A] text-sm truncate" title={refundDetailModalItem.event?.title}>
                        {refundDetailModalItem.event?.title || (isEnglish ? 'Event' : 'Sự kiện')}
                      </p>
                      <p className="text-amber-400 [html.light_&]:text-amber-800 font-semibold">
                        BTC: {refundDetailModalItem.event?.organizers?.business_name || refundDetailModalItem.organizer_name || 'N/A'}
                      </p>
                      {refundDetailModalItem.organizer_id && (
                        <div className="pt-1">
                          <Link
                            to={`/admin/organizers/${refundDetailModalItem.organizer_id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C99A47]/40 bg-[#C99A47]/10 px-2.5 py-1 text-xs font-semibold text-[#E6C17A] [html.light_&]:bg-amber-100 [html.light_&]:text-amber-800 [html.light_&]:border-amber-300 hover:opacity-80 transition"
                          >
                            <Building2 className="size-3.5" /> {isEnglish ? 'View Organizer Profile' : 'Xem hồ sơ Ban tổ chức'}
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Customer Contact */}
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-black uppercase tracking-wider text-white [html.light_&]:text-slate-600 block text-xs">
                        {isEnglish ? 'Complainant Customer' : 'Khách hàng khiếu nại'}
                      </span>
                      <p className="font-bold text-white [html.light_&]:text-[#0D1B2A] text-sm flex items-center gap-1.5">
                        <User className="size-4 text-[#C99A47]" />
                        {refundDetailModalItem.customer?.full_name || refundDetailModalItem.order?.buyer_name || (isEnglish ? 'Customer' : 'Khách hàng')}
                      </p>
                      <p className="text-slate-300 [html.light_&]:text-slate-600 flex items-center gap-1.5">
                        <Mail className="size-3.5 text-[#C99A47]" />
                        {refundDetailModalItem.customer?.email || refundDetailModalItem.order?.buyer_email || 'N/A'}
                      </p>
                      {refundDetailModalItem.customer?.phone && (
                        <p className="text-slate-300 [html.light_&]:text-slate-600 flex items-center gap-1.5">
                          <Phone className="size-3.5 text-[#C99A47]" />
                          {refundDetailModalItem.customer.phone}
                        </p>
                      )}
                      <p className="font-mono text-slate-400 [html.light_&]:text-slate-500 text-[11px] pt-1 border-t border-white/5 [html.light_&]:border-slate-200">
                        {isEnglish ? 'Ticket code:' : 'Mã vé:'} {refundDetailModalItem.ticket?.ticket_code || refundDetailModalItem.order?.order_code || 'N/A'}
                      </p>
                    </div>

                    {/* Amount & Bank Account of Customer */}
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-black uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-500 block text-[10px]">
                        {isEnglish ? 'Recipient Bank Account' : 'Tài khoản khách nhận hoàn tiền'}
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'Amount:' : 'Số tiền hoàn:'}</span>
                        <span className="font-mono font-bold text-[#E6C17A] [html.light_&]:text-amber-800 text-sm">
                          {formatCurrency(refundDetailModalItem.refund_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'Bank:' : 'Ngân hàng:'}</span>
                        <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                          {refundDetailModalItem.bank_name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'Account number:' : 'Số tài khoản:'}</span>
                        <span className="font-mono font-bold text-white [html.light_&]:text-[#0D1B2A]">
                          {refundDetailModalItem.bank_account_number || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'Account name:' : 'Chủ tài khoản:'}</span>
                        <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A] uppercase">
                          {refundDetailModalItem.bank_account_name || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Organizer Proof & Audit */}
                    <div className="rounded-xl border border-white/10 bg-[#121c38]/50 p-4 space-y-2 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50/70 [html.light_&]:text-[#0D1B2A]">
                      <span className="font-black uppercase tracking-wider text-slate-400 [html.light_&]:text-slate-500 block text-[10px]">
                        {isEnglish ? 'Organizer Payment Proof' : 'Chứng từ đối soát từ Ban tổ chức'}
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'Method:' : 'Phương thức:'}</span>
                        <span className="font-semibold text-white [html.light_&]:text-[#0D1B2A]">
                          {refundDetailModalItem.refund_method === 'PAYOS' ? 'PayOS (Tự động)' : 'Chuyển khoản thủ công'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 [html.light_&]:text-slate-500">{isEnglish ? 'Transaction ref:' : 'Mã giao dịch:'}</span>
                        <span className="font-mono text-emerald-400 [html.light_&]:text-emerald-700 font-bold">
                          {refundDetailModalItem.transaction_ref || refundDetailModalItem.organizer_transaction_ref || (isEnglish ? 'Not provided' : 'Chưa cung cấp')}
                        </span>
                      </div>
                      {refundDetailModalItem.proof_url || refundDetailModalItem.organizer_proof_url ? (
                        <div className="pt-1">
                          <a
                            href={refundDetailModalItem.proof_url || refundDetailModalItem.organizer_proof_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-sky-400 [html.light_&]:text-sky-700 hover:underline font-semibold"
                          >
                            <FileText className="size-3.5" /> {isEnglish ? 'View proof receipt' : 'Xem ảnh biên lai chuyển tiền (Ủy nhiệm chi)'}
                          </a>
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-400 [html.light_&]:text-amber-800 pt-1">
                          ⚠️ {isEnglish ? 'Organizer has not uploaded proof of transfer.' : 'Ban tổ chức chưa tải lên ảnh biên lai chuyển khoản.'}
                        </p>
                      )}
                      {refundDetailModalItem.organizer_note && (
                        <p className="text-[11px] text-slate-300 [html.light_&]:text-slate-600 pt-1 italic">
                          {isEnglish ? 'Organizer note:' : 'Ghi chú của BTC:'} &ldquo;{refundDetailModalItem.organizer_note}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        )}
      </div>
    </Page>
  )
}
