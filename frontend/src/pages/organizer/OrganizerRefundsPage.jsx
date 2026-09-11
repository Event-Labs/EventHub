import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  Filter,
  Hourglass,
  RotateCcw,
  Search,
  XCircle,
  AlertCircle,
  CheckCircle,
  Eye,
  CreditCard,
  Building,
  User,
  Mail,
  Calendar,
  DollarSign,
  FileText,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { useToast } from '@/providers/ToastProvider.jsx'
import { fetchOrganizerRefundRequests, processOrganizerRefund } from '@/services/refunds.js'

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

const STATUS_FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'REJECTED', label: 'Từ chối' },
]

export function OrganizerRefundsPage() {
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [processingItem, setProcessingItem] = useState(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const refundsQuery = useQuery({
    queryKey: ['organizer-refunds', selectedStatus],
    queryFn: () => fetchOrganizerRefundRequests(selectedStatus === 'ALL' ? undefined : { status: selectedStatus }),
  })

  const rawList = Array.isArray(refundsQuery.data)
    ? refundsQuery.data
    : (refundsQuery.data?.data || [])

  const filteredList = useMemo(() => {
    return rawList.filter((item) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      const ticketCode = item.ticket?.ticket_code?.toLowerCase() || ''
      const orderCode = item.order?.order_code?.toLowerCase() || ''
      const buyerName = (item.customer?.full_name || item.order?.buyer_name || '').toLowerCase()
      const buyerEmail = (item.customer?.email || item.order?.buyer_email || '').toLowerCase()
      const eventTitle = (item.event?.title || '').toLowerCase()
      const reason = (item.reason || '').toLowerCase()

      return (
        ticketCode.includes(query) ||
        orderCode.includes(query) ||
        buyerName.includes(query) ||
        buyerEmail.includes(query) ||
        eventTitle.includes(query) ||
        reason.includes(query)
      )
    })
  }, [rawList, searchQuery])

  // Summary counts
  const counts = useMemo(() => {
    return {
      all: rawList.length,
      pending: rawList.filter((r) => r.status === 'PENDING').length,
      approved: rawList.filter((r) => r.status === 'APPROVED').length,
      refunded: rawList.filter((r) => r.status === 'REFUNDED').length,
      rejected: rawList.filter((r) => r.status === 'REJECTED').length,
    }
  }, [rawList])

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-400">
            <Hourglass className="size-3.5" /> Chờ duyệt
          </span>
        )
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-bold text-blue-400">
            <CheckCircle className="size-3.5" /> Đã duyệt
          </span>
        )
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="size-3.5" /> Đã hoàn
          </span>
        )
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400">
            <XCircle className="size-3.5" /> Đã từ chối
          </span>
        )
      default:
        return <span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-bold text-slate-300">{status}</span>
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Quản lý yêu cầu hoàn vé"
        description="Xem xét và xử lý các yêu cầu hoàn tiền vé từ người mua theo chính sách sự kiện"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#121b33] p-4">
          <p className="text-xs font-semibold text-slate-400">Tổng yêu cầu</p>
          <p className="mt-1 font-mono text-2xl font-black text-white">{counts.all}</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs font-semibold text-amber-300">Cần xử lý (Chờ duyệt)</p>
          <p className="mt-1 font-mono text-2xl font-black text-amber-400">{counts.pending}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs font-semibold text-emerald-300">Đã hoàn tiền</p>
          <p className="mt-1 font-mono text-2xl font-black text-emerald-400">{counts.refunded}</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-xs font-semibold text-red-300">Từ chối</p>
          <p className="mt-1 font-mono text-2xl font-black text-red-400">{counts.rejected}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSelectedStatus(f.value)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                selectedStatus === f.value
                  ? 'bg-primary text-slate-950 shadow'
                  : 'border border-white/10 bg-[#151d34] text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã vé, tên, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#151d34] py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
        {refundsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Đang tải danh sách yêu cầu hoàn vé...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center">
            <RotateCcw className="mx-auto size-12 text-slate-600" />
            <p className="mt-3 text-sm font-bold text-white">Không tìm thấy yêu cầu hoàn vé nào</p>
            <p className="mt-1 text-xs text-slate-400">Tất cả các yêu cầu theo bộ lọc sẽ được hiển thị tại đây.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-[#172242] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Mã YC / Ngày</th>
                  <th className="px-4 py-3">Sự kiện</th>
                  <th className="px-4 py-3">Vé / Người mua</th>
                  <th className="px-4 py-3">Số tiền hoàn</th>
                  <th className="px-4 py-3">Lý do</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                {filteredList.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="font-mono font-bold text-primary">#{item.id.slice(0, 8)}</p>
                      <p className="text-[10px] text-slate-400">{formatDateTime(item.created_at)}</p>
                    </td>
                    <td className="max-w-[200px] px-4 py-3.5">
                      <p className="truncate font-bold text-white" title={item.event?.title}>
                        {item.event?.title || 'N/A'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <p className="font-mono font-semibold text-slate-200">{item.ticket?.ticket_code || item.order?.order_code}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.customer?.full_name || item.order?.buyer_name || 'Khách hàng'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono font-bold text-amber-400">
                      {formatCurrency(item.refund_amount)}
                    </td>
                    <td className="max-w-[220px] px-4 py-3.5">
                      <p className="line-clamp-2 text-slate-300" title={item.reason}>
                        {item.reason}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        onClick={() => setProcessingItem(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#1c2747] px-3 py-1.5 text-xs font-bold text-white transition hover:border-primary hover:text-primary"
                      >
                        {item.status === 'PENDING' ? 'Xử lý' : 'Chi tiết'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Refund Modal */}
      {processingItem && (
        <ProcessRefundModal
          item={processingItem}
          onClose={() => setProcessingItem(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['organizer-refunds'] })
            setProcessingItem(null)
          }}
        />
      )}
    </div>
  )
}

function ProcessRefundModal({ item, onClose, onSuccess }) {
  const toast = useToast()
  const isPending = item.status === 'PENDING'
  const isApproved = item.status === 'APPROVED'
  const isReadOnly = !isPending && !isApproved

  const [decision, setDecision] = useState(isApproved ? 'REFUND' : 'APPROVE') // 'APPROVE' | 'REJECT' | 'REFUND'
  const [rejectReason, setRejectReason] = useState(item.reject_reason || '')
  const [organizerNote, setOrganizerNote] = useState(item.organizer_note || '')
  const [transactionRef, setTransactionRef] = useState(item.transaction_ref || '')
  const [proofUrl, setProofUrl] = useState(item.proof_url || '')

  const processMutation = useMutation({
    mutationFn: (payload) => processOrganizerRefund(item.id, payload),
    onSuccess: (data) => {
      toast.success(data?.message || 'Xử lý yêu cầu hoàn tiền thành công!')
      onSuccess?.()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Không thể xử lý yêu cầu hoàn tiền.')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()

    if (decision === 'REJECT' && !rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối!')
      return
    }

    const payload = {
      action: decision,
      reject_reason: decision === 'REJECT' ? rejectReason : undefined,
      organizer_note: organizerNote || undefined,
      transaction_ref: (decision === 'REFUND' || decision === 'APPROVE') ? transactionRef : undefined,
      proof_url: proofUrl || undefined,
    }

    processMutation.mutate(payload)
  }

  const bankInfo = item.bank_info

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f172a] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <RotateCcw className="size-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">Chi tiết yêu cầu hoàn tiền</h3>
            <p className="font-mono text-xs text-slate-400">ID: #{item.id}</p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="mt-5 grid gap-4 rounded-xl border border-white/5 bg-[#162038] p-4 text-xs sm:grid-cols-2">
          <div>
            <span className="text-slate-400">Sự kiện:</span>
            <p className="font-bold text-white">{item.event?.title || 'N/A'}</p>
          </div>
          <div>
            <span className="text-slate-400">Mã vé / Mã đơn:</span>
            <p className="font-mono font-bold text-amber-400">
              {item.ticket?.ticket_code ? `Vé: ${item.ticket.ticket_code}` : `Đơn: ${item.order?.order_code}`}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Khách hàng:</span>
            <p className="font-semibold text-white">
              {item.customer?.full_name || item.order?.buyer_name} ({item.customer?.email || item.order?.buyer_email})
            </p>
          </div>
          <div>
            <span className="text-slate-400">Số tiền đề xuất hoàn:</span>
            <p className="text-base font-black text-emerald-400">{formatCurrency(item.refund_amount)}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-400">Lý do yêu cầu:</span>
            <p className="mt-1 font-semibold text-slate-200">{item.reason}</p>
            {item.customer_note && (
              <p className="mt-1 text-slate-400 italic">"Ghi chú: {item.customer_note}"</p>
            )}
          </div>

          {bankInfo && (
            <div className="sm:col-span-2 rounded-lg border border-white/10 bg-[#1e2a4a] p-3">
              <p className="font-bold text-amber-300">Thông tin ngân hàng nhận hoàn tiền:</p>
              <div className="mt-1 grid grid-cols-3 gap-2 text-slate-200">
                <div><span className="text-slate-400">Ngân hàng:</span> {bankInfo.bank_name || 'N/A'}</div>
                <div><span className="text-slate-400">Số TK:</span> <span className="font-mono font-bold">{bankInfo.account_number || 'N/A'}</span></div>
                <div><span className="text-slate-400">Chủ TK:</span> {bankInfo.account_holder || 'N/A'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Action Form */}
        {!isReadOnly ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300">Hành động xử lý</label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setDecision('APPROVE')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-bold transition ${
                    decision === 'APPROVE'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                      : 'border-white/10 bg-[#162038] text-slate-300'
                  }`}
                >
                  <CheckCircle className="size-4" />
                  Duyệt yêu cầu
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('REFUND')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-bold transition ${
                    decision === 'REFUND'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-white/10 bg-[#162038] text-slate-300'
                  }`}
                >
                  <CreditCard className="size-4" />
                  Đã hoàn tiền ngay
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('REJECT')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-bold transition ${
                    decision === 'REJECT'
                      ? 'border-red-500 bg-red-500/20 text-red-300'
                      : 'border-white/10 bg-[#162038] text-slate-300'
                  }`}
                >
                  <XCircle className="size-4" />
                  Từ chối
                </button>
              </div>
            </div>

            {decision === 'REJECT' ? (
              <div>
                <label className="block text-xs font-bold text-red-300">Lý do từ chối *</label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do từ chối theo chính sách sự kiện..."
                  className="mt-1 w-full rounded-lg border border-red-500/30 bg-[#1e293b] p-3 text-xs text-white placeholder-slate-500 focus:border-red-400 focus:outline-none"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Mã giao dịch hoàn tiền (Transaction Ref)</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="VD: FT260910123456 hoặc mã chuyển khoản ngân hàng"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#1e293b] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Link ảnh bill / bằng chứng chuyển khoản (Proof URL)</label>
                  <input
                    type="text"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#1e293b] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300">Ghi chú của BTC gửi khách hàng (Tùy chọn)</label>
              <textarea
                rows={2}
                value={organizerNote}
                onChange={(e) => setOrganizerNote(e.target.value)}
                placeholder="Ghi chú thêm gửi đến khách hàng..."
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#1e293b] p-3 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={processMutation.isPending}
                className="rounded-lg bg-primary px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-primary-hover disabled:opacity-50"
              >
                {processMutation.isPending ? 'Đang cập nhật...' : 'Xác nhận xử lý'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-3 rounded-xl border border-white/5 bg-[#162038] p-4 text-xs">
            <p className="font-bold text-white">Lịch sử xử lý:</p>
            {item.reject_reason && (
              <p className="text-red-300"><span className="font-semibold">Lý do từ chối:</span> {item.reject_reason}</p>
            )}
            {item.transaction_ref && (
              <p className="text-emerald-300"><span className="font-semibold">Mã giao dịch hoàn:</span> {item.transaction_ref}</p>
            )}
            {item.organizer_note && (
              <p className="text-slate-300"><span className="font-semibold">Ghi chú BTC:</span> {item.organizer_note}</p>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
