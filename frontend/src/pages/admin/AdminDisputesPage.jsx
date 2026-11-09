import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page, Panel, StatusBadge, Table, TableActionButton } from './AdminComponents.jsx'
import { fetchOrganizerRefundRequests } from '@/services/refunds.js'

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

const DISPUTE_FILTERS = [
  { value: 'ALL', label: 'Tất cả khiếu nại' },
  { value: 'UNRESOLVED', label: 'Chưa giải quyết' },
  { value: 'HAS_PROOF', label: 'BTC đã có chứng từ' },
  { value: 'NO_PROOF', label: 'BTC chưa có chứng từ' },
]

export function AdminDisputesPage() {
  const [selectedFilter, setSelectedFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [detailModalItem, setDetailModalItem] = useState(null)

  // Fetch only disputed refund requests across the entire platform
  const disputesQuery = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: () => fetchOrganizerRefundRequests({ status: 'DISPUTED' }),
  })

  const rawList = Array.isArray(disputesQuery.data)
    ? disputesQuery.data
    : disputesQuery.data?.data || []

  // Unique organizers involved in disputes
  const uniqueOrganizersCount = useMemo(() => {
    const orgs = new Set()
    rawList.forEach((item) => {
      const orgId = item.organizer_id || item.event?.organizer_id
      if (orgId) orgs.add(orgId)
    })
    return orgs.size
  }, [rawList])

  // Total disputed amount
  const totalDisputedAmount = useMemo(() => {
    return rawList.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0)
  }, [rawList])

  // Unresolved count (still actively disputed)
  const unresolvedCount = useMemo(() => {
    return rawList.filter((item) => item.disputed === true).length
  }, [rawList])

  // Filtered List
  const filteredList = useMemo(() => {
    return rawList.filter((item) => {
      // 1. Status Filter
      if (selectedFilter === 'UNRESOLVED') {
        if (!item.disputed) return false
      } else if (selectedFilter === 'HAS_PROOF') {
        if (!item.proof_url && !item.organizer_proof_url && !item.transaction_ref && !item.organizer_transaction_ref) {
          return false
        }
      } else if (selectedFilter === 'NO_PROOF') {
        if (item.proof_url || item.organizer_proof_url || item.transaction_ref || item.organizer_transaction_ref) {
          return false
        }
      }

      // 2. Search
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const ticketCode = item.ticket?.ticket_code?.toLowerCase() || ''
      const orderCode = item.order?.order_code?.toLowerCase() || ''
      const buyerName = (item.customer?.full_name || item.order?.buyer_name || '').toLowerCase()
      const buyerEmail = (item.customer?.email || item.order?.buyer_email || '').toLowerCase()
      const buyerPhone = (item.customer?.phone || '').toLowerCase()
      const eventTitle = (item.event?.title || '').toLowerCase()
      const orgName = (item.event?.organizers?.business_name || item.organizer_name || '').toLowerCase()
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
  }, [rawList, selectedFilter, searchQuery])

  return (
    <Page
      title="Quản lý Khiếu nại Hoàn tiền"
      description="Giám sát các phản ánh từ khách hàng báo chưa nhận được tiền hoàn vé để đôn đốc và can thiệp kịp thời đối với Ban tổ chức"
    >
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Đang khiếu nại (Đỏ Rose) */}
          <div
            onClick={() => setSelectedFilter('UNRESOLVED')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
              selectedFilter === 'UNRESOLVED'
                ? 'border-rose-500 bg-rose-500/15 ring-2 ring-rose-500/30'
                : 'border-rose-500/30 bg-[#0d172e] hover:border-rose-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                Đang khiếu nại
              </span>
              {unresolvedCount > 0 && (
                <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </div>
            <p className="mt-2 font-mono text-3xl font-black text-rose-400">
              {unresolvedCount}
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
              {uniqueOrganizersCount}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Đơn vị phát sinh khiếu nại cần theo dõi nghĩa vụ
            </p>
          </div>

          {/* Card 4: Tình trạng chứng từ */}
          <div
            onClick={() => setSelectedFilter('NO_PROOF')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all cursor-pointer ${
              selectedFilter === 'NO_PROOF'
                ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/30'
                : 'border-white/10 bg-[#0d172e] hover:border-amber-400/60'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              BTC chưa có chứng từ
            </span>
            <p className="mt-2 font-mono text-3xl font-black text-amber-300">
              {rawList.filter((i) => !i.proof_url && !i.organizer_proof_url && !i.transaction_ref && !i.organizer_transaction_ref).length}
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
            {DISPUTE_FILTERS.map((f) => {
              const isActive = selectedFilter === f.value
              return (
                <button
                  key={f.value}
                  onClick={() => setSelectedFilter(f.value)}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-80 rounded-lg border border-white/15 bg-[#0d172e] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/40 focus:border-rose-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <Panel className="p-0 overflow-hidden">
          {disputesQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Đang tải danh sách khiếu nại...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="mx-auto size-12 text-emerald-500/60" />
              <p className="mt-3 text-sm font-bold text-white">
                Không có khiếu nại nào cần xử lý
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
              rows={filteredList.map((item) => {
                const hasProof = Boolean(item.proof_url || item.organizer_proof_url || item.transaction_ref || item.organizer_transaction_ref)
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
                    <p className="text-xs font-bold text-white truncate" title={item.event?.title}>
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
                      onClick={() => setDetailModalItem(item)}
                      icon={Eye}
                      tone="danger"
                    />
                  </div>,
                ]
              })}
            />
          )}
        </Panel>

        {/* Detail Modal for Admin Dispute Review */}
        {detailModalItem && (
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
                      Chi tiết Khiếu nại #{detailModalItem.id?.slice(0, 8)}
                    </h3>
                    <p className="text-xs text-rose-300">
                      Gửi lúc: {formatDateTime(detailModalItem.disputed_at || detailModalItem.updated_at)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailModalItem(null)}
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
                  &ldquo;{detailModalItem.dispute_reason || 'Khách hàng báo chưa nhận được tiền vào tài khoản ngân hàng sau khi BTC xác nhận hoàn tiền.'}&rdquo;
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
                    {detailModalItem.event?.title || 'Sự kiện'}
                  </p>
                  <p className="text-amber-300 font-semibold">
                    Ban tổ chức: {detailModalItem.event?.organizers?.business_name || detailModalItem.organizer_name || 'N/A'}
                  </p>
                  {detailModalItem.organizer_id && (
                    <div className="pt-1">
                      <Link
                        to={`/admin/organizers/${detailModalItem.organizer_id}`}
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
                    {detailModalItem.customer?.full_name || detailModalItem.order?.buyer_name || 'Khách hàng'}
                  </p>
                  <p className="text-slate-300 flex items-center gap-1.5">
                    <Mail className="size-3.5 text-slate-400" />
                    {detailModalItem.customer?.email || detailModalItem.order?.buyer_email || 'N/A'}
                  </p>
                  {detailModalItem.customer?.phone && (
                    <p className="text-slate-300 flex items-center gap-1.5">
                      <Phone className="size-3.5 text-slate-400" />
                      {detailModalItem.customer.phone}
                    </p>
                  )}
                  <p className="font-mono text-slate-400 text-[11px] pt-1">
                    Mã vé: {detailModalItem.ticket?.ticket_code || detailModalItem.order?.order_code || 'N/A'}
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
                      {formatCurrency(detailModalItem.refund_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Ngân hàng:</span>
                    <span className="font-semibold text-white">
                      {detailModalItem.bank_name || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Số tài khoản:</span>
                    <span className="font-mono font-bold text-white">
                      {detailModalItem.bank_account_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Chủ tài khoản:</span>
                    <span className="font-semibold text-white uppercase">
                      {detailModalItem.bank_account_name || 'N/A'}
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
                      {detailModalItem.refund_method === 'PAYOS' ? 'PayOS (Tự động)' : 'Chuyển khoản thủ công'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Mã giao dịch:</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {detailModalItem.transaction_ref || detailModalItem.organizer_transaction_ref || 'Chưa cung cấp'}
                    </span>
                  </div>
                  {detailModalItem.proof_url || detailModalItem.organizer_proof_url ? (
                    <div className="pt-1">
                      <a
                        href={detailModalItem.proof_url || detailModalItem.organizer_proof_url}
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
                  {detailModalItem.organizer_note && (
                    <p className="text-[11px] text-slate-300 pt-1 italic">
                      Ghi chú của BTC: &ldquo;{detailModalItem.organizer_note}&rdquo;
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
                  onClick={() => setDetailModalItem(null)}
                  className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}

