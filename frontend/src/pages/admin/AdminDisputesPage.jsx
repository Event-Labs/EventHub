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
  { value: 'ALL', label: 'Tất cả khiếu nại hoàn tiền' },
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
      title="Quản lý Khiếu nại"
      description="Tiếp nhận, xử lý phản ánh của khách hàng về sự kiện, ban tổ chức, vé và giám sát các khiếu nại hoàn tiền trên toàn hệ thống"
    >
      <div className="space-y-6">
        {/* TOP LEVEL NAVIGATION TABS */}
        <div className="flex border-b border-white/10 gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('CUSTOMER_COMPLAINTS')}
            className={`flex items-center gap-2.5 pb-3 px-2 sm:px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'CUSTOMER_COMPLAINTS'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="size-4.5" />
            <span>Khiếu nại từ Khách hàng</span>
            {Number(complaintStats.pending_complaints || 0) > 0 && (
              <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black text-rose-300 animate-pulse">
                {complaintStats.pending_complaints}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('REFUND_DISPUTES')}
            className={`flex items-center gap-2.5 pb-3 px-2 sm:px-4 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'REFUND_DISPUTES'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="size-4.5" />
            <span>Khiếu nại Hoàn tiền</span>
            {unresolvedRefundCount > 0 && (
              <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-300">
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
                className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
                  selectedComplaintStatus === 'PENDING'
                    ? 'border-rose-500 bg-rose-500/15 ring-2 ring-rose-500/30'
                    : 'border-rose-500/30 bg-[#0d172e] hover:border-rose-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Chờ xử lý
                  </span>
                  {Number(complaintStats.pending_complaints || 0) > 0 && (
                    <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                </div>
                <p className="mt-2 font-mono text-3xl font-black text-rose-400">
                  {complaintStats.pending_complaints || 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Phản ánh mới cần xem xét và can thiệp
                </p>
              </div>

              {/* Card 2: Đang giải quyết */}
              <div
                onClick={() => setSelectedComplaintStatus('IN_PROGRESS')}
                className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
                  selectedComplaintStatus === 'IN_PROGRESS'
                    ? 'border-sky-500 bg-sky-500/15 ring-2 ring-sky-500/30'
                    : 'border-sky-500/30 bg-[#0d172e] hover:border-sky-400'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Đang giải quyết
                </span>
                <p className="mt-2 font-mono text-3xl font-black text-sky-400">
                  {complaintStats.in_progress_complaints || 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Đang làm việc với Ban tổ chức hoặc khách hàng
                </p>
              </div>

              {/* Card 3: Đã giải quyết */}
              <div
                onClick={() => setSelectedComplaintStatus('RESOLVED')}
                className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
                  selectedComplaintStatus === 'RESOLVED'
                    ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30'
                    : 'border-emerald-500/30 bg-[#0d172e] hover:border-emerald-400'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Đã giải quyết
                </span>
                <p className="mt-2 font-mono text-3xl font-black text-emerald-400">
                  {complaintStats.resolved_complaints || 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Khiếu nại đã hoàn tất xử lý thỏa đáng
                </p>
              </div>

              {/* Card 4: Ban tổ chức bị phản ánh */}
              <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-4 sm:p-5 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  BTC có khiếu nại
                </span>
                <p className="mt-2 font-mono text-3xl font-black text-white">
                  {complaintStats.unique_organizers_complained || 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Tổng đơn vị phát sinh khiếu nại trên hệ thống
                </p>
              </div>
            </div>

            {/* Filters and Search Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {CUSTOMER_COMPLAINT_STATUS_FILTERS.map((f) => {
                  const isActive = selectedComplaintStatus === f.value
                  return (
                    <button
                      key={f.value}
                      onClick={() => setSelectedComplaintStatus(f.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        isActive
                          ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30 border border-rose-400'
                          : 'border border-white/10 bg-[#0d172e] text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>

              {/* Right Controls: Category Select & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <select
                  value={selectedComplaintCategory}
                  onChange={(e) => setSelectedComplaintCategory(e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#0d172e] px-3 py-1.5 text-xs text-white focus:border-rose-400 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Tất cả danh mục</option>
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm tiêu đề, khách hàng, sự kiện, BTC..."
                    value={complaintSearchQuery}
                    onChange={(e) => setComplaintSearchQuery(e.target.value)}
                    className="w-full sm:w-72 rounded-lg border border-white/15 bg-[#0d172e] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/40 focus:border-rose-400 focus:outline-none"
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
                          title="Xem chi tiết & Xử lý khiếu nại"
                          onClick={() => handleOpenComplaintDetail(item)}
                          icon={Eye}
                          tone="danger"
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
                <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-rose-500/30 bg-[#0f172a] p-6 shadow-2xl text-white space-y-5">
                  {/* Modal Header */}
                  <div className="flex items-start justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                        <ShieldAlert className="size-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold text-white">
                            Khiếu nại #{complaintDetailModalItem.id?.slice(0, 8)}
                          </h3>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(complaintDetailModalItem.status)}`}>
                            {getStatusLabel(complaintDetailModalItem.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Thời gian gửi: {formatDateTime(complaintDetailModalItem.created_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComplaintDetailModalItem(null)}
                      className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  {/* Customer & Target Information Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Customer Info */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-slate-400 block text-[10px]">
                        Thông tin Người khiếu nại
                      </span>
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        <User className="size-4 text-rose-400" />
                        {complaintDetailModalItem.customer_name || 'Khách hàng'}
                      </p>
                      <p className="text-slate-300 flex items-center gap-2">
                        <Mail className="size-3.5 text-slate-400" />
                        {complaintDetailModalItem.contact_email || complaintDetailModalItem.customer_email || 'N/A'}
                      </p>
                      {(complaintDetailModalItem.contact_phone || complaintDetailModalItem.customer_phone) && (
                        <p className="text-slate-300 flex items-center gap-2">
                          <Phone className="size-3.5 text-slate-400" />
                          {complaintDetailModalItem.contact_phone || complaintDetailModalItem.customer_phone}
                        </p>
                      )}
                    </div>

                    {/* Target Event / Organizer */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-slate-400 block text-[10px]">
                        Đối tượng bị phản ánh
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
                              Mã vé: {complaintDetailModalItem.ticket_code}
                            </p>
                          )}
                          {complaintDetailModalItem.organizer_id && (
                            <div className="pt-1">
                              <Link
                                to={`/admin/organizers/${complaintDetailModalItem.organizer_id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
                              >
                                <Building2 className="size-3" /> Xem hồ sơ Ban tổ chức
                              </Link>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-slate-400 italic">Khiếu nại dịch vụ chung nền tảng</p>
                      )}
                    </div>
                  </div>

                  {/* Complaint Details Box */}
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-2.5">
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
                          <span className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                            <ImageIcon className="size-3.5" />
                            Ảnh minh chứng đính kèm ({complaintDetailModalItem.evidence_urls.length} ảnh):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {complaintDetailModalItem.evidence_urls.map((imgUrl, i) => (
                              <a
                                key={i}
                                href={imgUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative aspect-square rounded-xl overflow-hidden border border-white/20 bg-black block"
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
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1 text-xs">
                      <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider block">
                        Ghi chú xử lý trước đó
                      </span>
                      <p className="text-slate-200 italic">
                        &ldquo;{complaintDetailModalItem.admin_note}&rdquo;
                      </p>
                      {complaintDetailModalItem.resolved_by_name && (
                        <p className="text-[11px] text-slate-400 pt-1">
                          Người xử lý: <strong>{complaintDetailModalItem.resolved_by_name}</strong> {complaintDetailModalItem.resolved_at && `(${formatDateTime(complaintDetailModalItem.resolved_at)})`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ADMIN RESOLUTION FORM */}
                  <form onSubmit={handleSaveComplaintResolution} className="space-y-4 pt-2 border-t border-white/10 text-xs">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                      Cập nhật trạng thái & Phản hồi khiếu nại
                    </h4>

                    {/* Status Select */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { val: 'PENDING', label: 'Chờ xử lý', color: 'amber' },
                        { val: 'IN_PROGRESS', label: 'Đang giải quyết', color: 'sky' },
                        { val: 'RESOLVED', label: 'Đã giải quyết', color: 'emerald' },
                        { val: 'REJECTED', label: 'Từ chối / Bác bỏ', color: 'rose' },
                      ].map((st) => (
                        <button
                          key={st.val}
                          type="button"
                          onClick={() => setResolveStatus(st.val)}
                          className={`rounded-xl border p-2.5 text-center font-bold transition cursor-pointer ${
                            resolveStatus === st.val
                              ? 'border-rose-500 bg-rose-500/20 text-white shadow-md'
                              : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {/* Admin Note / Resolution message */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Ghi chú xử lý / Nội dung phản hồi đến khách hàng:
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Nhập kết quả xử lý, đôn đốc BTC hoặc hướng dẫn cho khách hàng..."
                        value={resolveAdminNote}
                        onChange={(e) => setResolveAdminNote(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-900/90 p-3 text-xs text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none leading-relaxed"
                      />
                      <p className="mt-1 text-[11px] text-slate-400 italic">
                        * Khi chuyển sang trạng thái &ldquo;Đã giải quyết&rdquo; hoặc &ldquo;Bác bỏ&rdquo;, hệ thống sẽ tự động gửi thông báo phản hồi tới tài khoản của khách hàng.
                      </p>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setComplaintDetailModalItem(null)}
                        className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition cursor-pointer"
                      >
                        Đóng
                      </button>
                      <button
                        type="submit"
                        disabled={updateComplaintMutation.isPending}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/25 hover:from-rose-600 hover:to-amber-600 transition cursor-pointer disabled:opacity-50"
                      >
                        {updateComplaintMutation.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            <span>Đang lưu...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-4" />
                            <span>Lưu kết quả xử lý</span>
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
              {/* Card 1: Đang khiếu nại (Đỏ Rose) */}
              <div
                onClick={() => setSelectedRefundFilter('UNRESOLVED')}
                className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
                  selectedRefundFilter === 'UNRESOLVED'
                    ? 'border-rose-500 bg-rose-500/15 ring-2 ring-rose-500/30'
                    : 'border-rose-500/30 bg-[#0d172e] hover:border-rose-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Đang khiếu nại
                  </span>
                  {unresolvedRefundCount > 0 && (
                    <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                </div>
                <p className="mt-2 font-mono text-3xl font-black text-rose-400">
                  {unresolvedRefundCount}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Khách hàng báo chưa nhận được tiền vào tài khoản
                </p>
              </div>

              {/* Card 2: Tổng số tiền tranh chấp */}
              <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-4 sm:p-5 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tổng tiền khiếu nại
                </span>
                <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-amber-400">
                  {formatCurrency(totalDisputedAmount)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Tổng giá trị vé đang chờ đối soát hoàn tiền
                </p>
              </div>

              {/* Card 3: Số Ban tổ chức liên quan */}
              <div className="rounded-2xl border border-white/10 bg-[#0d172e] p-4 sm:p-5 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ban tổ chức liên quan
                </span>
                <p className="mt-2 font-mono text-3xl font-black text-white">
                  {uniqueRefundOrganizersCount}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Đơn vị phát sinh khiếu nại cần theo dõi nghĩa vụ
                </p>
              </div>

              {/* Card 4: Tình trạng chứng từ */}
              <div
                onClick={() => setSelectedRefundFilter('NO_PROOF')}
                className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
                  selectedRefundFilter === 'NO_PROOF'
                    ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/30'
                    : 'border-white/10 bg-[#0d172e] hover:border-amber-400/60'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  BTC chưa có chứng từ
                </span>
                <p className="mt-2 font-mono text-3xl font-black text-amber-300">
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
                <p className="mt-1 text-[11px] text-slate-400">
                  Cần đôn đốc BTC thực hiện chuyển khoản cho khách
                </p>
              </div>
            </div>

            {/* Filters and Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {REFUND_DISPUTE_FILTERS.map((f) => {
                  const isActive = selectedRefundFilter === f.value
                  return (
                    <button
                      key={f.value}
                      onClick={() => setSelectedRefundFilter(f.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        isActive
                          ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30 border border-rose-400'
                          : 'border border-white/10 bg-[#0d172e] text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm mã vé, khách hàng, sự kiện, BTC..."
                  value={refundSearchQuery}
                  onChange={(e) => setRefundSearchQuery(e.target.value)}
                  className="w-full sm:w-80 rounded-lg border border-white/15 bg-[#0d172e] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/40 focus:border-rose-400 focus:outline-none"
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
                          title="Xem chi tiết khiếu nại & đối soát"
                          onClick={() => setRefundDetailModalItem(item)}
                          icon={Eye}
                          tone="danger"
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
                <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-rose-500/30 bg-[#0f172a] p-6 shadow-2xl text-white space-y-5">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                        <ShieldAlert className="size-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          Chi tiết Khiếu nại #{refundDetailModalItem.id?.slice(0, 8)}
                        </h3>
                        <p className="text-xs text-rose-300">
                          Gửi lúc: {formatDateTime(refundDetailModalItem.disputed_at || refundDetailModalItem.updated_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRefundDetailModalItem(null)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  {/* Dispute Alert Banner */}
                  <div className="rounded-xl border border-rose-500/50 bg-rose-500/15 p-4 space-y-1 text-xs text-rose-200">
                    <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
                      <AlertCircle className="size-4 shrink-0" />
                      Nội dung khiếu nại từ khách hàng
                    </div>
                    <p className="text-sm font-medium text-white pt-1 leading-relaxed">
                      &ldquo;{refundDetailModalItem.dispute_reason || 'Khách hàng báo chưa nhận được tiền vào tài khoản ngân hàng sau khi BTC xác nhận hoàn tiền.'}&rdquo;
                    </p>
                  </div>

                  {/* Grid Information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Event & Organizer */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-slate-400 block text-[11px]">
                        Sự kiện & Ban tổ chức
                      </span>
                      <p className="font-bold text-white text-sm">
                        {refundDetailModalItem.event?.title || 'Sự kiện'}
                      </p>
                      <p className="text-amber-300 font-semibold">
                        Ban tổ chức: {refundDetailModalItem.event?.organizers?.business_name || refundDetailModalItem.organizer_name || 'N/A'}
                      </p>
                      {refundDetailModalItem.organizer_id && (
                        <div className="pt-1">
                          <Link
                            to={`/admin/organizers/${refundDetailModalItem.organizer_id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            <Building2 className="size-3.5" /> Xem hồ sơ Ban tổ chức
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Customer Contact */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-slate-400 block text-[11px]">
                        Khách hàng khiếu nại
                      </span>
                      <p className="font-bold text-white text-sm flex items-center gap-1.5">
                        <User className="size-4 text-slate-400" />
                        {refundDetailModalItem.customer?.full_name || refundDetailModalItem.order?.buyer_name || 'Khách hàng'}
                      </p>
                      <p className="text-slate-300 flex items-center gap-1.5">
                        <Mail className="size-3.5 text-slate-400" />
                        {refundDetailModalItem.customer?.email || refundDetailModalItem.order?.buyer_email || 'N/A'}
                      </p>
                      {refundDetailModalItem.customer?.phone && (
                        <p className="text-slate-300 flex items-center gap-1.5">
                          <Phone className="size-3.5 text-slate-400" />
                          {refundDetailModalItem.customer.phone}
                        </p>
                      )}
                      <p className="font-mono text-slate-400 text-[11px] pt-1">
                        Mã vé: {refundDetailModalItem.ticket?.ticket_code || refundDetailModalItem.order?.order_code || 'N/A'}
                      </p>
                    </div>

                    {/* Amount & Bank Account of Customer */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-slate-400 block text-[11px]">
                        Tài khoản khách nhận hoàn tiền
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Số tiền hoàn:</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {formatCurrency(refundDetailModalItem.refund_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Ngân hàng:</span>
                        <span className="font-semibold text-white">
                          {refundDetailModalItem.bank_name || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Số tài khoản:</span>
                        <span className="font-mono font-bold text-white">
                          {refundDetailModalItem.bank_account_number || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Chủ tài khoản:</span>
                        <span className="font-semibold text-white uppercase">
                          {refundDetailModalItem.bank_account_name || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Organizer Proof & Audit */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <span className="font-bold uppercase tracking-wider text-slate-400 block text-[11px]">
                        Chứng từ đối soát từ Ban tổ chức
                      </span>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Phương thức:</span>
                        <span className="font-semibold text-white">
                          {refundDetailModalItem.refund_method === 'PAYOS' ? 'PayOS (Tự động)' : 'Chuyển khoản thủ công'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Mã giao dịch:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {refundDetailModalItem.transaction_ref || refundDetailModalItem.organizer_transaction_ref || 'Chưa cung cấp'}
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
                            <FileText className="size-3.5" /> Xem ảnh biên lai chuyển tiền (Ủy nhiệm chi)
                          </a>
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-400 pt-1">
                          ⚠️ Ban tổ chức chưa tải lên ảnh biên lai chuyển khoản.
                        </p>
                      )}
                      {refundDetailModalItem.organizer_note && (
                        <p className="text-[11px] text-slate-300 pt-1 italic">
                          Ghi chú của BTC: &ldquo;{refundDetailModalItem.organizer_note}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <p className="text-[11px] text-slate-400">
                      * Nếu Ban tổ chức không hoàn tiền đúng hạn, Admin có thể đình chỉ hoạt động tại trang Hồ sơ Organizer.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRefundDetailModalItem(null)}
                      className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                    >
                      Đóng
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
