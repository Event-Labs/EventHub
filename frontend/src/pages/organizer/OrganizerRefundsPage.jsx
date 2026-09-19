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

const VIETQR_BANK_BINS = {
  vietcombank: '970436',
  vcb: '970436',
  vietinbank: '970415',
  ctg: '970415',
  bidv: '970418',
  agribank: '970405',
  vba: '970405',
  mbbank: '970422',
  mb: '970422',
  'mb bank': '970422',
  techcombank: '970407',
  tcb: '970407',
  acb: '970416',
  vpbank: '970432',
  vpb: '970432',
  tpbank: '970423',
  tpb: '970423',
  vib: '970441',
  sacombank: '970403',
  stb: '970403',
  hdbank: '970437',
  hdb: '970437',
  shb: '970443',
  seabank: '970468',
  ocb: '970448',
  msb: '970426',
  lpbank: '970449',
  lienvietpostbank: '970449',
  pvcombank: '970412',
  bacabank: '970409',
  namabank: '970428',
  kienlongbank: '970452',
  bvbank: '970454',
  vietcapitalbank: '970454',
  baovietbank: '970438',
  saigonbank: '970400',
  vietbank: '970433',
  ncb: '970419',
  shinhanbank: '970424',
  shinhan: '970424',
  wooribank: '970457',
  cake: '546034',
  timo: '963388',
  viettelmoney: '971005',
  vnptmoney: '971011',
}

function resolveBankBin(bankInput) {
  if (!bankInput) return null
  const cleaned = String(bankInput).trim().toLowerCase()
  if (/^\d{6}$/.test(cleaned)) return cleaned
  if (VIETQR_BANK_BINS[cleaned]) return VIETQR_BANK_BINS[cleaned]
  for (const [name, bin] of Object.entries(VIETQR_BANK_BINS)) {
    if (cleaned.includes(name) || name.includes(cleaned)) return bin
  }
  return null
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
        title="Quản lý yêu cầu Hoàn vé"
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
  const isFailed = item.status === 'FAILED'
  const isReadOnly = !isPending && !isFailed

  const [decision, setDecision] = useState('APPROVE') // 'APPROVE' | 'REJECT'
  const [refundMethod, setRefundMethod] = useState('PAYOS') // 'PAYOS' | 'MANUAL_BANK_TRANSFER'
  const [finalAmount, setFinalAmount] = useState(Number(item.refund_amount || 0))
  const [rejectReason, setRejectReason] = useState('Không đúng chính sách')
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

    if (decision === 'REJECT') {
      if (!rejectReason) {
        toast.error('Vui lòng chọn lý do từ chối!')
        return
      }
      if (rejectReason === 'Khác' && !organizerNote.trim()) {
        toast.error('Vui lòng nhập ghi chú khi chọn lý do "Khác"!')
        return
      }

      processMutation.mutate({
        action: 'REJECT',
        reject_reason: rejectReason,
        organizer_note: organizerNote.trim() || undefined,
      })
      return
    }

    if (decision === 'APPROVE') {
      if (refundMethod === 'MANUAL_BANK_TRANSFER') {
        if (!transactionRef.trim()) {
          toast.error('Vui lòng nhập Mã giao dịch ngân hàng (Transaction Reference ID)!')
          return
        }
        processMutation.mutate({
          action: 'REFUND',
          refund_method: 'MANUAL_BANK_TRANSFER',
          final_refund_amount: Number(finalAmount) || undefined,
          transaction_ref: transactionRef.trim(),
          proof_url: proofUrl.trim() || undefined,
          organizer_note: organizerNote.trim() || undefined,
        })
        return
      }

      // Automated PayOS Gateway
      processMutation.mutate({
        action: 'APPROVE',
        refund_method: 'PAYOS',
        final_refund_amount: Number(finalAmount) || undefined,
        organizer_note: organizerNote.trim() || undefined,
      })
    }
  }

  const bankInfo = item.bank_info || (item.bank_name ? {
    bank_name: item.bank_name,
    account_number: item.bank_account_number,
    account_holder: item.bank_account_name,
  } : null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f172a] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>

        {/* Header Section (Report 3 Item 1) */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <RotateCcw className="size-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">Xử lý yêu cầu hoàn tiền</h3>
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
            {/* Action Decision (Report 3 Item 3) */}
            <div>
              <label className="block text-xs font-bold text-slate-300">Quyết định xử lý *</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDecision('APPROVE')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-bold transition ${
                    decision === 'APPROVE'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-md shadow-emerald-500/10'
                      : 'border-white/10 bg-[#162038] text-slate-300 hover:border-white/20'
                  }`}
                >
                  <CheckCircle className="size-4" />
                  Chấp nhận hoàn tiền
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('REJECT')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-bold transition ${
                    decision === 'REJECT'
                      ? 'border-red-500 bg-red-500/20 text-red-300 shadow-md shadow-red-500/10'
                      : 'border-white/10 bg-[#162038] text-slate-300 hover:border-white/20'
                  }`}
                >
                  <XCircle className="size-4" />
                  Từ chối hoàn tiền
                </button>
              </div>
            </div>

            {decision === 'APPROVE' ? (
              <div className="space-y-4 rounded-xl border border-white/5 bg-[#162038] p-4">
                {/* Final Refund Amount (Report 3 Item 4) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Số tiền hoàn (VND) *</label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={finalAmount}
                    onChange={(e) => setFinalAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#1e293b] px-3 py-2 text-sm font-bold text-emerald-400 focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Payment Method Indicator (Report 3 Item 7) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Phương thức thực hiện hoàn tiền</label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('PAYOS')}
                      className={`rounded-lg border p-2.5 text-xs font-semibold transition ${
                        refundMethod === 'PAYOS'
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-white/10 bg-[#1e293b] text-slate-300'
                      }`}
                    >
                      ⚡ Cổng thanh toán PayOS (Tự động)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMethod('MANUAL_BANK_TRANSFER')}
                      className={`rounded-lg border p-2.5 text-xs font-semibold transition ${
                        refundMethod === 'MANUAL_BANK_TRANSFER'
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-[#1e293b] text-slate-300'
                      }`}
                    >
                      🏦 Chuyển khoản thủ công
                    </button>
                  </div>
                </div>

                {refundMethod === 'MANUAL_BANK_TRANSFER' ? (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    {bankInfo?.account_number && (
                      <div className="rounded-xl border border-white/10 bg-[#121c33] p-3 flex flex-col sm:flex-row items-center gap-3">
                        <div className="bg-white p-2 rounded-lg shrink-0 shadow">
                          <img
                            src={`https://img.vietqr.io/image/${resolveBankBin(bankInfo.bank_name) || '970422'}-${bankInfo.account_number}-compact2.png?amount=${finalAmount || 0}&addInfo=${encodeURIComponent(`Hoan tien ${item.ticket?.ticket_code || item.order?.order_code || ''}`)}&accountName=${encodeURIComponent(bankInfo.account_holder || '')}`}
                            alt="VietQR Chuyển Khoản"
                            className="size-32 object-contain"
                          />
                        </div>
                        <div className="space-y-1 text-xs text-slate-300 flex-1 w-full">
                          <p className="font-bold text-amber-300 text-sm">Quét mã VietQR chuyển tiền</p>
                          <p className="text-[11px] text-slate-400">Mở ứng dụng ngân hàng của bạn quét mã để chuyển trực tiếp đến tài khoản khách hàng:</p>
                          <div className="pt-1 space-y-0.5 font-medium text-[11px]">
                            <div>Ngân hàng: <span className="text-white font-bold">{bankInfo.bank_name}</span></div>
                            <div>Số tài khoản: <span className="font-mono text-amber-300 font-bold">{bankInfo.account_number}</span></div>
                            <div>Chủ tài khoản: <span className="text-white font-bold">{bankInfo.account_holder || 'N/A'}</span></div>
                            <div>Số tiền: <span className="text-emerald-400 font-bold">{formatCurrency(finalAmount)}</span></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-amber-300">
                        Mã giao dịch chuyển khoản (Transaction Reference ID) *
                      </label>
                      <input
                        type="text"
                        required
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder="VD: FT260910123456 hoặc mã giao dịch ngân hàng..."
                        className="mt-1 w-full rounded-lg border border-amber-500/30 bg-[#1e293b] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Link ảnh biên lai chuyển khoản (Proof of Payment URL)
                      </label>
                      <input
                        type="text"
                        value={proofUrl}
                        onChange={(e) => setProofUrl(e.target.value)}
                        placeholder="https://..."
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#1e293b] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-primary-soft">
                    <p className="font-semibold text-primary">Quy trình hoàn tiền tự động qua PayOS (Chi hộ):</p>
                    <p className="mt-1 text-slate-300 leading-relaxed">
                      Hệ thống sẽ gọi PayOS Payouts API để chuyển tiền tự động đến tài khoản ngân hàng của khách hàng. Vé sẽ lập tức bị hủy vĩnh viễn và ghế sẽ được mở khóa lại.
                    </p>
                    <p className="mt-2 rounded bg-amber-500/10 border border-amber-500/20 p-2 text-[11px] text-amber-200">
                      💡 <b>Lưu ý:</b> PayOS chỉ nhận tiền vào tài khoản ngân hàng qua VietQR và không hỗ trợ hoàn tiền đảo chiều trực tiếp trên link thanh toán. Tính năng tự động yêu cầu tài khoản PayOS của Ban tổ chức đã kích hoạt dịch vụ <b>Chi hộ (Payout)</b> và có số dư ví chi. Nếu chưa kích hoạt Chi hộ, vui lòng chọn <b>Chuyển khoản thủ công</b> bên cạnh.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                {/* Rejection Reason Dropdown (Report 3 Item 5) */}
                <div>
                  <label className="block text-xs font-bold text-red-300">Lý do từ chối *</label>
                  <select
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-red-500/30 bg-[#1e293b] px-3 py-2 text-xs text-white focus:border-red-400 focus:outline-none"
                  >
                    <option value="Không đúng chính sách">Không đúng chính sách</option>
                    <option value="Vé đã qua sử dụng">Vé đã qua sử dụng</option>
                    <option value="Lý do không hợp lý">Lý do không hợp lý</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>
            )}

            {/* Organizer Note (Report 3 Item 6) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Ghi chú của BTC gửi khách hàng {decision === 'REJECT' && rejectReason === 'Khác' && <span className="text-red-400">*</span>}
              </label>
              <textarea
                rows={2}
                maxLength={500}
                required={decision === 'REJECT' && rejectReason === 'Khác'}
                value={organizerNote}
                onChange={(e) => setOrganizerNote(e.target.value)}
                placeholder={decision === 'REJECT' && rejectReason === 'Khác' ? 'Vui lòng nêu rõ lý do từ chối (bắt buộc)...' : 'Ghi chú thêm gửi đến khách hàng (tối đa 500 ký tự)...'}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#1e293b] p-3 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Footer Buttons (Report 3 Items 10 & 11) */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={processMutation.isPending}
                className={`rounded-lg px-5 py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                  decision === 'APPROVE'
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'bg-red-500 text-white hover:bg-red-400'
                }`}
              >
                {processMutation.isPending ? 'Đang xử lý...' : 'Xác nhận'}
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
