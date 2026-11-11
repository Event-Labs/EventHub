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

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('vi-VN', {
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

const REFUND_DISPUTE_FILTERS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'UNRESOLVED', label: 'Chưa giải quyết' },
  { value: 'HAS_PROOF', label: 'BTC đã có chứng từ' },
  { value: 'NO_PROOF', label: 'BTC chưa có chứng từ' },
]

const CUSTOMER_COMPLAINT_STATUS_FILTERS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'PENDING', label: 'Chờ xử lý' },
  { value: 'IN_PROGRESS', label: 'Đang giải quyết' },
  { value: 'RESOLVED', label: 'Đã giải quyết' },
  { value: 'REJECTED', label: 'Bác bỏ' },
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
                      {f.label}
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
                      {c.label}
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
            <Panel className="p-0 overflow-hidden">
              {complaintsQuery.isLoading ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  <Loader2 className="size-6 animate-spin mx-auto text-rose-400 mb-2" />
                  Đang tải danh sách khiếu nại...
                </div>
              ) : complaintItems.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="mx-auto size-12 text-emerald-500/60" />
                  <p className="mt-3 text-sm font-bold text-white">
                    Không có khiếu nại nào phù hợp
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Hiện tại không có phản ánh nào từ khách hàng ở trạng thái hoặc bộ lọc này.
                  </p>
                </div>
              ) : (
                <Table
                  compact
                  headers={[
                    'Mã KN / Ngày gửi',
                    'Khách hàng',
                    'Đối tượng liên quan',
                    'Danh mục',
                    'Tiêu đề & Nội dung phản ánh',
                    'Trạng thái',
                    'Thao tác',
                  ]}
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
                          {formatDateTime(item.created_at)}
                        </p>
                      </div>,

                      // 2. Khách hàng
                      <div key="customer" className="space-y-0.5">
                        <p className="text-xs font-bold text-white">
                          {item.customer_name || 'Khách hàng'}
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
                          <p className="text-xs font-bold text-white truncate" title={item.event_title}>
                            {item.event_title}
                          </p>
                        ) : (
                          <p className="text-xs italic text-slate-500">Khiếu nại chung</p>
                        )}
                        {item.organizer_name && (
                          <p className="text-[11px] text-amber-300 truncate font-semibold">
                            BTC: {item.organizer_name}
                          </p>
                        )}
                        {item.ticket_code && (
                          <span className="font-mono text-[10px] text-sky-300">
                            Vé: {item.ticket_code}
                          </span>
                        )}
                      </div>,

                      // 4. Danh mục
                      <div key="category">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(item.category)}`}>
                          {getCategoryLabel(item.category)}
                        </span>
                      </div>,

                      // 5. Tiêu đề & Nội dung
                      <div key="content" className="max-w-[260px] space-y-1">
                        <p className="text-xs font-bold text-white truncate" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                        {hasEvidences && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-300">
                            <ImageIcon className="size-3" />
                            {item.evidence_urls.length} ảnh minh chứng
                          </span>
                        )}
                      </div>,

                      // 6. Trạng thái
                      <div key="status">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                        {item.admin_note && (
                          <p className="text-[10px] text-slate-400 mt-1 italic truncate max-w-[120px]" title={item.admin_note}>
                            Ghi chú: {item.admin_note}
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
            </Panel>

            {/* DETAIL & RESOLUTION MODAL FOR CUSTOMER COMPLAINTS */}
            {complaintDetailModalItem && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border-soft/60 bg-[#0f172a] p-6 shadow-2xl text-white space-y-5">
                  {/* Modal Header */}
                  <div className="flex items-start justify-between border-b border-border-soft/60 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#C99A47]/15 text-[#E6C17A] border border-[#C99A47]/30 shrink-0">
                        <ShieldAlert className="size-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold text-white">
                            {isEnglish ? 'Complaint' : 'Khiếu nại'} #{complaintDetailModalItem.id?.slice(0, 8)}
                          </h3>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(complaintDetailModalItem.status)}`}>
                            {getStatusLabel(complaintDetailModalItem.status)}
                          </span>
                        </div>
                        <p className="text-xs text-subtle mt-0.5">
                          {isEnglish ? 'Submitted at:' : 'Thời gian gửi:'} {formatDateTime(complaintDetailModalItem.created_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComplaintDetailModalItem(null)}
                      className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  {/* Customer & Target Information Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Customer Info */}
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-subtle block text-[10px]">
                        {isEnglish ? 'Complainant Info' : 'Thông tin Người khiếu nại'}
                      </span>
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        <User className="size-4 text-[#E6C17A]" />
                        {complaintDetailModalItem.customer_name || (isEnglish ? 'Customer' : 'Khách hàng')}
                      </p>
                      <p className="text-slate-300 flex items-center gap-2">
                        <Mail className="size-3.5 text-subtle" />
                        {complaintDetailModalItem.contact_email || complaintDetailModalItem.customer_email || 'N/A'}
                      </p>
                      {(complaintDetailModalItem.contact_phone || complaintDetailModalItem.customer_phone) && (
                        <p className="text-slate-300 flex items-center gap-2">
                          <Phone className="size-3.5 text-subtle" />
                          {complaintDetailModalItem.contact_phone || complaintDetailModalItem.customer_phone}
                        </p>
                      )}
                    </div>

                    {/* Target Event / Organizer */}
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-subtle block text-[10px]">
                        {isEnglish ? 'Reported Target' : 'Đối tượng bị phản ánh'}
                      </span>
                      {complaintDetailModalItem.event_title ? (
                        <>
                          <p className="text-sm font-bold text-white truncate" title={complaintDetailModalItem.event_title}>
                            {complaintDetailModalItem.event_title}
                          </p>
                          {complaintDetailModalItem.organizer_name && (
                            <p className="text-amber-300 font-semibold flex items-center gap-1.5">
                              <Building2 className="size-3.5" />
                              BTC: {complaintDetailModalItem.organizer_name}
                            </p>
                          )}
                          {complaintDetailModalItem.ticket_code && (
                            <p className="font-mono text-sky-400 flex items-center gap-1.5">
                              <Ticket className="size-3.5" />
                              {isEnglish ? 'Ticket code:' : 'Mã vé:'} {complaintDetailModalItem.ticket_code}
                            </p>
                          )}
                          {complaintDetailModalItem.organizer_id && (
                            <div className="pt-1">
                              <Link
                                to={`/admin/organizers/${complaintDetailModalItem.organizer_id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C99A47]/40 bg-[#C99A47]/10 px-2.5 py-1 text-[11px] font-semibold text-[#E6C17A] hover:bg-[#C99A47]/20 transition"
                              >
                                <Building2 className="size-3" /> {isEnglish ? 'View Organizer Profile' : 'Xem hồ sơ Ban tổ chức'}
                              </Link>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-subtle italic">{isEnglish ? 'General platform complaint' : 'Khiếu nại dịch vụ chung nền tảng'}</p>
                      )}
                    </div>
                  </div>

                  {/* Complaint Details Box */}
                  <div className="rounded-2xl border border-border-soft/50 bg-[#121b33]/60 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(complaintDetailModalItem.category)}`}>
                        {getCategoryLabel(complaintDetailModalItem.category)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white">
                      {complaintDetailModalItem.title}
                    </h4>
                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                      {complaintDetailModalItem.description}
                    </p>

                    {/* Evidence Gallery */}
                    {Array.isArray(complaintDetailModalItem.evidence_urls) &&
                      complaintDetailModalItem.evidence_urls.length > 0 && (
                        <div className="pt-2 border-t border-white/10 space-y-2">
                          <span className="text-[11px] font-bold text-[#E6C17A] flex items-center gap-1.5">
                            <ImageIcon className="size-3.5" />
                            {isEnglish ? `Attached proof images (${complaintDetailModalItem.evidence_urls.length}):` : `Ảnh minh chứng đính kèm (${complaintDetailModalItem.evidence_urls.length} ảnh):`}
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
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-1 text-xs">
                      <span className="font-bold text-subtle text-[10px] uppercase tracking-wider block">
                        {isEnglish ? 'Previous Resolution Note' : 'Ghi chú xử lý trước đó'}
                      </span>
                      <p className="text-slate-200 italic">
                        &ldquo;{complaintDetailModalItem.admin_note}&rdquo;
                      </p>
                      {complaintDetailModalItem.resolved_by_name && (
                        <p className="text-[11px] text-subtle pt-1">
                          {isEnglish ? 'Resolved by:' : 'Người xử lý:'} <strong>{complaintDetailModalItem.resolved_by_name}</strong> {complaintDetailModalItem.resolved_at && `(${formatDateTime(complaintDetailModalItem.resolved_at)})`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ADMIN RESOLUTION FORM */}
                  <form onSubmit={handleSaveComplaintResolution} className="space-y-4 pt-2 border-t border-border-soft/60 text-xs">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6C17A]">
                      {isEnglish ? 'Update Status & Customer Feedback' : 'Cập nhật trạng thái & Phản hồi khiếu nại'}
                    </h4>

                    {/* Status Select */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { val: 'PENDING', label: isEnglish ? 'Pending' : 'Chờ xử lý', color: 'amber' },
                        { val: 'IN_PROGRESS', label: isEnglish ? 'In Progress' : 'Đang giải quyết', color: 'sky' },
                        { val: 'RESOLVED', label: isEnglish ? 'Resolved' : 'Đã giải quyết', color: 'emerald' },
                        { val: 'REJECTED', label: isEnglish ? 'Rejected' : 'Từ chối / Bác bỏ', color: 'rose' },
                      ].map((st) => (
                        <button
                          key={st.val}
                          type="button"
                          onClick={() => setResolveStatus(st.val)}
                          className={`rounded-xl border p-2.5 text-center font-bold transition cursor-pointer ${
                            resolveStatus === st.val
                              ? 'border-[#C99A47] bg-[#C99A47]/20 text-[#E6C17A] shadow-md shadow-[#C99A47]/20'
                              : 'border-border-soft/40 bg-[#121b33] text-subtle hover:text-white hover:border-[#C99A47]/40'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {/* Admin Note / Resolution message */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        {isEnglish ? 'Resolution notes / Message to customer:' : 'Ghi chú xử lý / Nội dung phản hồi đến khách hàng:'}
                      </label>
                      <textarea
                        rows={3}
                        placeholder={isEnglish ? 'Enter resolution details, action taken with organizer or advice for customer...' : 'Nhập kết quả xử lý, đôn đốc BTC hoặc hướng dẫn cho khách hàng...'}
                        value={resolveAdminNote}
                        onChange={(e) => setResolveAdminNote(e.target.value)}
                        className="w-full rounded-xl border border-border-soft/60 bg-[#121b33] p-3 text-xs text-white placeholder:text-subtle focus:border-[#C99A47] focus:outline-none leading-relaxed"
                      />
                      <p className="mt-1 text-[11px] text-subtle italic">
                        {isEnglish ? '* When status is set to "Resolved" or "Rejected", a notification will be sent to the customer.' : '* Khi chuyển sang trạng thái "Đã giải quyết" hoặc "Bác bỏ", hệ thống sẽ tự động gửi thông báo phản hồi tới tài khoản của khách hàng.'}
                      </p>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setComplaintDetailModalItem(null)}
                        className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition cursor-pointer"
                      >
                        {isEnglish ? 'Close' : 'Đóng'}
                      </button>
                      <button
                        type="submit"
                        disabled={updateComplaintMutation.isPending}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-5 py-2.5 text-xs font-black text-[#0D1B2A] shadow-lg shadow-[#C99A47]/25 hover:brightness-110 transition cursor-pointer disabled:opacity-50"
                      >
                        {updateComplaintMutation.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            <span>{isEnglish ? 'Saving...' : 'Đang lưu...'}</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-4" />
                            <span>{isEnglish ? 'Save Resolution' : 'Lưu kết quả xử lý'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
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
                      {f.label}
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
            <Panel className="p-0 overflow-hidden">
              {refundDisputesQuery.isLoading ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  Đang tải danh sách khiếu nại hoàn tiền...
                </div>
              ) : filteredRefundList.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="mx-auto size-12 text-emerald-500/60" />
                  <p className="mt-3 text-sm font-bold text-white">
                    Không có khiếu nại hoàn tiền nào cần xử lý
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Tất cả khách hàng đã nhận được tiền hoàn vé hoặc không có tranh chấp nào phát sinh.
                  </p>
                </div>
              ) : (
                <Table
                  compact
                  headers={[
                    'Mã YC / Ngày khiếu nại',
                    'Ban tổ chức / Sự kiện',
                    'Khách hàng',
                    'Số tiền',
                    'Lý do khiếu nại',
                    'Đối soát từ BTC',
                    'Thao tác',
                  ]}
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
                          {formatDateTime(item.disputed_at || item.updated_at)}
                        </p>
                      </div>,

                      // 2. BTC / Sự kiện
                      <div key="event" className="max-w-[220px] space-y-0.5">
                        <p
                          className="text-xs font-bold text-white truncate"
                          title={item.event?.title}
                        >
                          {item.event?.title || 'Sự kiện'}
                        </p>
                        <p className="text-[11px] text-amber-300 truncate font-semibold">
                          BTC: {item.event?.organizers?.business_name || item.organizer_name || 'Ban tổ chức'}
                        </p>
                      </div>,

                      // 3. Khách hàng
                      <div key="buyer" className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-200">
                          {item.customer?.full_name || item.order?.buyer_name || 'Khách hàng'}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {item.customer?.email || item.order?.buyer_email || ''}
                        </p>
                        <p className="font-mono text-[10px] text-slate-500">
                          Mã vé: {item.ticket?.ticket_code || item.order?.order_code || 'N/A'}
                        </p>
                      </div>,

                      // 4. Số tiền
                      <span key="amount" className="font-mono font-bold text-amber-400 text-xs">
                        {formatCurrency(item.refund_amount)}
                      </span>,

                      // 5. Lý do khiếu nại
                      <div key="reason" className="max-w-[240px]">
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200 leading-snug">
                          &ldquo;{item.dispute_reason || 'Khách hàng báo chưa nhận được tiền hoàn vào tài khoản.'}&rdquo;
                        </div>
                      </div>,

                      // 6. Đối soát từ BTC
                      <div key="proof" className="space-y-1">
                        {hasProof ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                            <CheckCircle2 className="size-3 text-emerald-400" />
                            Đã có mã GD / biên lai
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                            <AlertCircle className="size-3 text-amber-400" />
                            Chưa có chứng từ
                          </span>
                        )}
                        {item.refund_method && (
                          <p className="text-[10px] text-slate-400">
                            Phương thức: {item.refund_method === 'PAYOS' ? 'PayOS' : 'Thủ công'}
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
            </Panel>

            {/* Detail Modal for Refund Dispute Review */}
            {refundDetailModalItem && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border-soft/60 bg-[#0f172a] p-6 shadow-2xl text-white space-y-5">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-border-soft/60 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#C99A47]/15 text-[#E6C17A] border border-[#C99A47]/30 shrink-0">
                        <ShieldAlert className="size-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          {isEnglish ? 'Refund Dispute' : 'Chi tiết Khiếu nại'} #{refundDetailModalItem.id?.slice(0, 8)}
                        </h3>
                        <p className="text-xs text-subtle">
                          {isEnglish ? 'Submitted at:' : 'Gửi lúc:'} {formatDateTime(refundDetailModalItem.disputed_at || refundDetailModalItem.updated_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRefundDetailModalItem(null)}
                      className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  {/* Dispute Alert Banner */}
                  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1 text-xs text-amber-200">
                    <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                      <AlertCircle className="size-4 shrink-0" />
                      {isEnglish ? 'Customer Dispute Content' : 'Nội dung khiếu nại từ khách hàng'}
                    </div>
                    <p className="text-sm font-medium text-white pt-1 leading-relaxed">
                      &ldquo;{refundDetailModalItem.dispute_reason || (isEnglish ? 'Customer reported that refund was not received after organizer confirmation.' : 'Khách hàng báo chưa nhận được tiền vào tài khoản ngân hàng sau khi BTC xác nhận hoàn tiền.')}&rdquo;
                    </p>
                  </div>

                  {/* Grid Information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Event & Organizer */}
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-subtle block text-[11px]">
                        {isEnglish ? 'Event & Organizer' : 'Sự kiện & Ban tổ chức'}
                      </span>
                      <p className="font-bold text-white text-sm">
                        {refundDetailModalItem.event?.title || (isEnglish ? 'Event' : 'Sự kiện')}
                      </p>
                      <p className="text-amber-300 font-semibold">
                        BTC: {refundDetailModalItem.event?.organizers?.business_name || refundDetailModalItem.organizer_name || 'N/A'}
                      </p>
                      {refundDetailModalItem.organizer_id && (
                        <div className="pt-1">
                          <Link
                            to={`/admin/organizers/${refundDetailModalItem.organizer_id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C99A47]/40 bg-[#C99A47]/10 px-2.5 py-1 text-xs font-semibold text-[#E6C17A] hover:bg-[#C99A47]/20 transition"
                          >
                            <Building2 className="size-3.5" /> {isEnglish ? 'View Organizer Profile' : 'Xem hồ sơ Ban tổ chức'}
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Customer Contact */}
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-subtle block text-[11px]">
                        {isEnglish ? 'Complainant Customer' : 'Khách hàng khiếu nại'}
                      </span>
                      <p className="font-bold text-white text-sm flex items-center gap-1.5">
                        <User className="size-4 text-[#E6C17A]" />
                        {refundDetailModalItem.customer?.full_name || refundDetailModalItem.order?.buyer_name || (isEnglish ? 'Customer' : 'Khách hàng')}
                      </p>
                      <p className="text-slate-300 flex items-center gap-1.5">
                        <Mail className="size-3.5 text-subtle" />
                        {refundDetailModalItem.customer?.email || refundDetailModalItem.order?.buyer_email || 'N/A'}
                      </p>
                      {refundDetailModalItem.customer?.phone && (
                        <p className="text-slate-300 flex items-center gap-1.5">
                          <Phone className="size-3.5 text-subtle" />
                          {refundDetailModalItem.customer.phone}
                        </p>
                      )}
                      <p className="font-mono text-subtle text-[11px] pt-1">
                        {isEnglish ? 'Ticket code:' : 'Mã vé:'} {refundDetailModalItem.ticket?.ticket_code || refundDetailModalItem.order?.order_code || 'N/A'}
                      </p>
                    </div>

                    {/* Amount & Bank Account of Customer */}
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-subtle block text-[11px]">
                        {isEnglish ? 'Recipient Bank Account' : 'Tài khoản khách nhận hoàn tiền'}
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-subtle">{isEnglish ? 'Amount:' : 'Số tiền hoàn:'}</span>
                        <span className="font-mono font-bold text-[#E6C17A] text-sm">
                          {formatCurrency(refundDetailModalItem.refund_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-subtle">{isEnglish ? 'Bank:' : 'Ngân hàng:'}</span>
                        <span className="font-semibold text-white">
                          {refundDetailModalItem.bank_name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-subtle">{isEnglish ? 'Account number:' : 'Số tài khoản:'}</span>
                        <span className="font-mono font-bold text-white">
                          {refundDetailModalItem.bank_account_number || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-subtle">{isEnglish ? 'Account name:' : 'Chủ tài khoản:'}</span>
                        <span className="font-semibold text-white uppercase">
                          {refundDetailModalItem.bank_account_name || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Organizer Proof & Audit */}
                    <div className="rounded-2xl border border-border-soft/40 bg-panel-soft/60 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-subtle block text-[11px]">
                        {isEnglish ? 'Organizer Payment Proof' : 'Chứng từ đối soát từ Ban tổ chức'}
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-subtle">{isEnglish ? 'Method:' : 'Phương thức:'}</span>
                        <span className="font-semibold text-white">
                          {refundDetailModalItem.refund_method === 'PAYOS' ? 'PayOS (Tự động)' : 'Chuyển khoản thủ công'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-subtle">{isEnglish ? 'Transaction ref:' : 'Mã giao dịch:'}</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {refundDetailModalItem.transaction_ref || refundDetailModalItem.organizer_transaction_ref || (isEnglish ? 'Not provided' : 'Chưa cung cấp')}
                        </span>
                      </div>
                      {refundDetailModalItem.proof_url || refundDetailModalItem.organizer_proof_url ? (
                        <div className="pt-1">
                          <a
                            href={refundDetailModalItem.proof_url || refundDetailModalItem.organizer_proof_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline"
                          >
                            <FileText className="size-3.5" /> {isEnglish ? 'View proof receipt' : 'Xem ảnh biên lai chuyển tiền (Ủy nhiệm chi)'}
                          </a>
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-400 pt-1">
                          ⚠️ {isEnglish ? 'Organizer has not uploaded proof of transfer.' : 'Ban tổ chức chưa tải lên ảnh biên lai chuyển khoản.'}
                        </p>
                      )}
                      {refundDetailModalItem.organizer_note && (
                        <p className="text-[11px] text-slate-300 pt-1 italic">
                          {isEnglish ? 'Organizer note:' : 'Ghi chú của BTC:'} &ldquo;{refundDetailModalItem.organizer_note}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-border-soft/60">
                    <p className="text-[11px] text-subtle">
                      * {isEnglish ? 'If organizer does not refund in time, Admin may suspend them via Organizer Profile.' : 'Nếu Ban tổ chức không hoàn tiền đúng hạn, Admin có thể đình chỉ hoạt động tại trang Hồ sơ Organizer.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setRefundDetailModalItem(null)}
                      className="rounded-xl border border-border-soft/60 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                    >
                      {isEnglish ? 'Close' : 'Đóng'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Page>
  )
}
