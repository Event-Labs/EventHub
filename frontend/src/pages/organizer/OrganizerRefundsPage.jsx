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
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${selectedStatus === f.value
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
                      {item.status === 'PENDING' ? (
                        <button
                          onClick={() => setProcessingItem(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#1c2747] px-3 py-1.5 text-xs font-bold text-white transition hover:border-primary hover:text-primary"
                        >
                          Xử lý
                        </button>
                      ) : (
                        <button
                          onClick={() => setProcessingItem(item)}
                          title="Chi tiết"
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 bg-[#1c2747] text-slate-300 transition hover:border-primary hover:text-primary"
                        >
                          <Eye className="size-4" />
                        </button>
                      )}
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

  const defaultRefundAmount = Number(item.refund_amount || 0)

  // Calculations for Actual Paid Amount and Policy
  const originalPrice = Number(
    item.ticket?.final_price ||
    item.ticket?.unit_price ||
    item.ticket?.ticket_type?.price ||
    item.order?.subtotal ||
    defaultRefundAmount ||
    0
  )
  const subtotal = Number(item.order?.subtotal || 0)
  const discountAmount = Number(item.order?.discount_amount || 0)
  const totalAmount = Number(item.order?.total_amount || 0)

  let actualPaid = Number(item.ticket?.final_price || 0)
  let discountPercent = 0

  if (!actualPaid || actualPaid === originalPrice) {
    if (subtotal > 0 && discountAmount > 0) {
      const ticketDiscount = Math.round((originalPrice / subtotal) * discountAmount)
      actualPaid = Math.max(0, originalPrice - ticketDiscount)
      discountPercent = Math.round((discountAmount / subtotal) * 100)
    } else if (totalAmount > 0 && totalAmount < originalPrice) {
      actualPaid = totalAmount
      discountPercent = Math.round(((originalPrice - totalAmount) / originalPrice) * 100)
    } else {
      actualPaid = originalPrice
    }
  } else if (originalPrice > actualPaid) {
    discountPercent = Math.round(((originalPrice - actualPaid) / originalPrice) * 100)
  }

  if (totalAmount > 0 && actualPaid > totalAmount) {
    actualPaid = totalAmount
  }
  if (actualPaid <= 0 && defaultRefundAmount > 0) {
    actualPaid = defaultRefundAmount
  }
  if (actualPaid < defaultRefundAmount) {
    actualPaid = defaultRefundAmount
  }

  // Policy calculation
  const rawPolicy = item.event?.refund_policy
  const policy = typeof rawPolicy === 'string' ? JSON.parse(rawPolicy) : (rawPolicy || {})
  const deadlineDays = policy.deadline_days !== undefined && policy.deadline_days !== null ? Number(policy.deadline_days) : null
  const feePercentage = Math.min(100, Math.max(0, Number(policy.fee_percentage || 0)))
  const refundPercentage = 100 - feePercentage
  const cancellationFee = Math.round((actualPaid * feePercentage) / 100)

  let policyText = ''
  if (policy.allow_refunds === false) {
    policyText = 'Không hỗ trợ hoàn tiền theo chính sách sự kiện'
  } else if (deadlineDays !== null && deadlineDays > 0) {
    policyText = `Hủy trước ${deadlineDays} ngày - Hoàn ${refundPercentage}% (Phí ${feePercentage > 0 ? formatCurrency(cancellationFee) : '0 đ'})`
  } else {
    policyText = `Hoàn ${refundPercentage}% (Phí ${feePercentage > 0 ? formatCurrency(cancellationFee) : '0 đ'})`
  }

  const [decision, setDecision] = useState('APPROVE') // 'APPROVE' | 'REJECT'
  const [refundMethod, setRefundMethod] = useState('PAYOS') // 'PAYOS' | 'MANUAL_BANK_TRANSFER'
  const [finalAmount, setFinalAmount] = useState(defaultRefundAmount)
  const [organizerNote, setOrganizerNote] = useState(item.organizer_note || '')
  const [transactionRef, setTransactionRef] = useState(item.transaction_ref || '')
  const [proofUrl, setProofUrl] = useState(item.proof_url || '')

  const handleSelectRefundMethod = (method) => {
    setRefundMethod(method)
    if (method === 'PAYOS') {
      setFinalAmount(defaultRefundAmount)
    }
  }

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
      if (!organizerNote.trim()) {
        toast.error('Vui lòng nhập lý do từ chối để gửi cho khách hàng!')
        return
      }

      processMutation.mutate({
        action: 'REJECT',
        reject_reason: organizerNote.trim(),
        organizer_note: organizerNote.trim(),
      })
      return
    }

    if (decision === 'APPROVE') {
      const numAmount = Number(finalAmount)
      if (isNaN(numAmount) || numAmount <= 0) {
        toast.error('Số tiền hoàn phải lớn hơn 0 đ!')
        return
      }
      if (numAmount > actualPaid) {
        toast.error(`Số tiền hoàn không được vượt quá số tiền thực tế khách đã thanh toán (${formatCurrency(actualPaid)})!`)
        return
      }

      if (refundMethod === 'MANUAL_BANK_TRANSFER') {
        if (!transactionRef.trim()) {
          toast.error('Vui lòng nhập Mã giao dịch ngân hàng (Transaction Reference ID)!')
          return
        }
        processMutation.mutate({
          action: 'REFUND',
          refund_method: 'MANUAL_BANK_TRANSFER',
          final_refund_amount: numAmount,
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
        final_refund_amount: defaultRefundAmount,
        organizer_note: organizerNote.trim() || undefined,
      })
    }
  }

  const bankInfo = item.bank_info || (item.bank_name ? {
    bank_name: item.bank_name,
    account_number: item.bank_account_number,
    account_holder: item.bank_account_name,
  } : null)

  const isAmountOverMax = Number(finalAmount) > actualPaid
  const isAmountInvalid = Number(finalAmount) <= 0 || isNaN(Number(finalAmount))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-lg sm:max-w-xl max-h-[90vh] rounded-[32px] border border-white/10 bg-slate-900/80 shadow-[0_0_50px_rgba(0,0,0,0.4)] backdrop-blur-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="flex-none flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
          <h3 className="font-display text-lg font-black text-white drop-shadow-sm tracking-tight">Xử lý yêu cầu hoàn tiền</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Action Form or ReadOnly History */}
        {!isReadOnly ? (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-[13px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
              {/* Info Grid */}
              <div className="grid gap-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner sm:grid-cols-2">
                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] block mb-1">Sự kiện:</span>
                  <p className="font-black text-white text-[15px] break-words drop-shadow-sm">{item.event?.title || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] block mb-1">Mã vé / Mã đơn:</span>
                  <p className="font-mono font-bold text-amber-400">
                    {item.ticket?.ticket_code ? `${item.ticket.ticket_code}` : `Đơn: ${item.order?.order_code}`}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Khách hàng:</span>
                  <p className="font-semibold text-white break-words mt-0.5">
                    {item.customer?.full_name || item.order?.buyer_name} <br/>
                    <span className="text-slate-400 font-normal">({item.customer?.email || item.order?.buyer_email})</span>
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Lý do yêu cầu:</span>
                  <p className="font-semibold text-white break-words mt-0.5">{item.reason}</p>
                </div>

                {/* Information Header / Tóm tắt tính toán hoàn tiền */}
                <div className="sm:col-span-2 rounded-[16px] border border-white/5 bg-black/20 p-4 space-y-3 shadow-inner">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-white/5 pb-3">
                    <span className="text-slate-400 font-medium">Giá vé đã thanh toán thực tế:</span>
                    <div className="font-bold text-white">
                      {formatCurrency(actualPaid)}
                      {discountPercent > 0 && (
                        <span className="ml-1.5 text-xs font-semibold text-emerald-400">
                          (Đã áp mã giảm {discountPercent}%)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-white/5 pb-3">
                    <span className="text-slate-400 font-medium shrink-0">Quy định / Chính sách áp dụng:</span>
                    <div className="inline-flex items-center rounded-md bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/20 text-right shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                      {policyText}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pt-1">
                    <span className="font-bold text-slate-300">Số tiền hoàn đề xuất:</span>
                    <span className="text-lg font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
                      {formatCurrency(defaultRefundAmount)}
                    </span>
                  </div>
                </div>

                {bankInfo && (
                  <div className="sm:col-span-2 rounded-[16px] border border-white/5 bg-black/20 p-4 shadow-inner">
                    <p className="font-bold text-amber-400 mb-2">Thông tin ngân hàng nhận hoàn tiền:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-200">
                      <div><span className="text-slate-400">Ngân hàng:</span> <br/><span className="font-medium text-white">{bankInfo.bank_name || 'N/A'}</span></div>
                      <div><span className="text-slate-400">Số TK:</span> <br/><span className="font-mono font-bold text-white">{bankInfo.account_number || 'N/A'}</span></div>
                      <div><span className="text-slate-400">Chủ TK:</span> <br/><span className="font-medium text-white">{bankInfo.account_holder || 'N/A'}</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Decision */}
              <div>
                <label className="block text-[13px] font-bold text-slate-300 mb-2">Quyết định xử lý <span className="text-error">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVE')}
                    className={`flex items-center justify-center gap-2 rounded-[16px] border p-3 text-[13px] font-bold transition-all ${decision === 'APPROVE'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                      : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    <CheckCircle className="size-4" />
                    Chấp nhận hoàn tiền
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('REJECT')}
                    className={`flex items-center justify-center gap-2 rounded-[16px] border p-3 text-[13px] font-bold transition-all ${decision === 'REJECT'
                      ? 'border-rose-500 bg-rose-500/20 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                      : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    <XCircle className="size-4" />
                    Từ chối hoàn tiền
                  </button>
                </div>
              </div>

              {/* Conditional Fields based on Decision */}
              {decision === 'APPROVE' ? (
                <div className="space-y-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  {/* Số tiền hoàn (VND) */}
                  <div>
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">Số tiền hoàn (VND) <span className="text-error">*</span></label>
                    {refundMethod === 'PAYOS' ? (
                      <div>
                        <input
                          type="text"
                          value={formatCurrency(defaultRefundAmount)}
                          disabled
                          readOnly
                          className="w-full rounded-[16px] border border-white/5 bg-black/40 px-4 py-3 text-[13px] font-black text-slate-500 cursor-not-allowed select-none shadow-inner"
                        />
                        <p className="mt-2 text-[11px] text-slate-400 italic">
                          * Cổng PayOS tự động hoàn đúng số tiền theo đề xuất ({formatCurrency(defaultRefundAmount)}) để đảm bảo đối soát chính xác
                        </p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="number"
                          min="1000"
                          max={actualPaid}
                          step="1000"
                          value={finalAmount}
                          onChange={(e) => setFinalAmount(e.target.value)}
                          className={`w-full rounded-[16px] border px-4 py-3 text-[13px] font-black text-emerald-400 focus:outline-none transition-all shadow-inner ${isAmountOverMax || isAmountInvalid
                            ? 'border-rose-500 bg-rose-500/10 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                            : 'border-white/10 bg-black/40 focus:border-emerald-500 focus:bg-black/60 focus:ring-1 focus:ring-emerald-500'
                            }`}
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <span className="text-slate-400">
                            Tối đa: <span className="text-amber-400 font-bold">{formatCurrency(actualPaid)}</span> (Giá thực tế đã thanh toán)
                          </span>
                          {isAmountOverMax && (
                            <span className="font-bold text-rose-400">
                              Không được vượt quá {formatCurrency(actualPaid)}
                            </span>
                          )}
                          {isAmountInvalid && finalAmount !== '' && (
                            <span className="font-bold text-rose-400">
                              Số tiền hoàn phải lớn hơn 0 đ
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Method Selector */}
                  <div>
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">Phương thức thực hiện hoàn tiền</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectRefundMethod('PAYOS')}
                        className={`rounded-[16px] border p-3 text-[13px] font-bold transition-all ${refundMethod === 'PAYOS'
                          ? 'border-primary bg-primary/20 text-primary shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                          : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-white'
                          }`}
                      >
                        Cổng thanh toán PayOS (Tự động)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectRefundMethod('MANUAL_BANK_TRANSFER')}
                        className={`rounded-[16px] border p-3 text-[13px] font-bold transition-all ${refundMethod === 'MANUAL_BANK_TRANSFER'
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-white'
                          }`}
                      >
                        Chuyển khoản thủ công
                      </button>
                    </div>
                  </div>

                  {refundMethod === 'MANUAL_BANK_TRANSFER' ? (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      {bankInfo?.account_number && (
                        <div className="rounded-[16px] border border-white/5 bg-black/20 p-4 flex flex-col sm:flex-row items-center gap-4 shadow-inner">
                          <div className="bg-white p-2 rounded-xl shrink-0 shadow-lg">
                            <img
                              src={`https://img.vietqr.io/image/${resolveBankBin(bankInfo.bank_name) || '970422'}-${bankInfo.account_number}-compact2.png?amount=${finalAmount || 0}&addInfo=${encodeURIComponent(`Hoan tien ${item.ticket?.ticket_code || item.order?.order_code || ''}`)}&accountName=${encodeURIComponent(bankInfo.account_holder || '')}`}
                              alt="VietQR Chuyển Khoản"
                              className="size-28 object-contain"
                            />
                          </div>
                          <div className="space-y-1.5 text-[13px] text-slate-300 flex-1 w-full">
                            <p className="font-black text-amber-400 text-sm drop-shadow-sm">Quét mã VietQR chuyển tiền</p>
                            <p className="text-[11px] text-slate-400">Mở ứng dụng ngân hàng của bạn quét mã để chuyển trực tiếp đến tài khoản khách hàng:</p>
                            <div className="pt-2 space-y-1 font-medium text-[12px]">
                              <div>Ngân hàng: <span className="text-white font-bold">{bankInfo.bank_name}</span></div>
                              <div>Số tài khoản: <span className="font-mono text-amber-400 font-bold">{bankInfo.account_number}</span></div>
                              <div>Chủ tài khoản: <span className="text-white font-bold">{bankInfo.account_holder || 'N/A'}</span></div>
                              <div>Số tiền: <span className="text-emerald-400 font-black">{formatCurrency(finalAmount)}</span></div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-[13px] font-bold text-amber-400 mb-2">
                          Mã giao dịch chuyển khoản (Transaction Reference ID) <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder="VD: FT260910123456 hoặc mã giao dịch ngân hàng..."
                          className="w-full rounded-[16px] border border-amber-500/50 bg-amber-500/5 px-4 py-3 text-[13px] font-medium text-white placeholder-slate-500 focus:bg-amber-500/10 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold text-slate-300 mb-2">
                          Link ảnh biên lai chuyển khoản (Proof of Payment URL)
                        </label>
                        <input
                          type="text"
                          value={proofUrl}
                          onChange={(e) => setProofUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-[16px] border border-white/10 bg-black/40 px-4 py-3 text-[13px] font-medium text-white placeholder-slate-500 focus:border-primary focus:bg-black/60 focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-inner"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] italic text-amber-400/90 leading-relaxed bg-amber-500/10 border border-amber-500/20 p-3 rounded-[12px]">
                      * Lưu ý: Tính năng tự động yêu cầu tài khoản PayOS của Ban tổ chức đã kích hoạt dịch vụ Chi hộ (Payout) và có số dư ví chi. Nếu chưa kích hoạt Chi hộ, vui lòng chọn Chuyển khoản thủ công.
                    </p>
                  )}

                  {/* Ghi chú của BTC gửi khách hàng khi Chấp nhận */}
                  <div>
                    <label className="block text-[13px] font-bold text-slate-300 mb-2">
                      Ghi chú của BTC gửi khách hàng
                    </label>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={organizerNote}
                      onChange={(e) => setOrganizerNote(e.target.value)}
                      placeholder="Ghi chú thêm gửi đến khách hàng (tùy chọn, tối đa 500 ký tự)..."
                      className="w-full rounded-[16px] border border-white/10 bg-black/40 p-4 text-[13px] font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:bg-black/60 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all shadow-inner resize-y min-h-[80px]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                  <div>
                    <label className="block text-[13px] font-bold text-rose-400 mb-2">
                      Lý do từ chối (Bắt buộc gửi cho khách hàng) <span className="text-error">*</span>
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      required
                      value={organizerNote}
                      onChange={(e) => setOrganizerNote(e.target.value)}
                      placeholder="Vui lòng nhập lý do từ chối yêu cầu hoàn tiền (bắt buộc gửi đến khách hàng)..."
                      className="w-full rounded-[16px] border border-rose-500/50 bg-rose-500/5 p-4 text-[13px] font-medium text-white placeholder-slate-500 focus:bg-rose-500/10 focus:ring-1 focus:ring-rose-500 focus:outline-none transition-all shadow-inner resize-y min-h-[100px]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-slate-400">Gợi ý nhanh:</span>
                    <button type="button" onClick={() => setOrganizerNote('Không đúng chính sách quy định')} className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 transition border border-white/10">Không đúng chính sách quy định</button>
                    <button type="button" onClick={() => setOrganizerNote('Vé đã qua sử dụng / hết hạn')} className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 transition border border-white/10">Vé đã qua sử dụng / hết hạn</button>
                    <button type="button" onClick={() => setOrganizerNote('Lý do hoàn vé không hợp lệ')} className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 transition border border-white/10">Lý do hoàn vé không hợp lệ</button>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Footer Buttons */}
            <div className="flex-none flex items-center justify-end gap-3 border-t border-white/5 bg-white/[0.02] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-[13px] font-bold text-slate-300 hover:bg-white/10 hover:text-white transition backdrop-blur-md"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={processMutation.isPending || (decision === 'APPROVE' && refundMethod === 'MANUAL_BANK_TRANSFER' && (isAmountOverMax || isAmountInvalid))}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-bold shadow-lg transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 ${
                  decision === 'APPROVE'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                    : 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] hover:shadow-[0_0_25px_rgba(225,29,72,0.5)]'
                }`}
              >
                {processMutation.isPending
                  ? 'Đang xử lý...'
                  : decision === 'APPROVE'
                    ? 'Xác nhận hoàn tiền'
                    : 'Xác nhận từ chối'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-5 space-y-3.5 text-xs">
            <div className="rounded-xl border border-white/5 bg-[#162038] p-3.5 space-y-2">
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
            </div>
            {/* Readonly info grid */}
            <div className="grid gap-3 rounded-xl border border-white/5 bg-[#162038] p-3 text-xs sm:grid-cols-2">
              <div>
                <span className="text-slate-400">Sự kiện:</span>
                <p className="font-bold text-white break-words">{item.event?.title || 'N/A'}</p>
              </div>
              <div>
                <span className="text-slate-400">Mã vé / Mã đơn:</span>
                <p className="font-mono font-bold text-amber-400">
                  {item.ticket?.ticket_code ? `${item.ticket.ticket_code}` : `Đơn: ${item.order?.order_code}`}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Khách hàng:</span>
                <p className="font-semibold text-white break-words">
                  {item.customer?.full_name || item.order?.buyer_name} ({item.customer?.email || item.order?.buyer_email})
                </p>
              </div>
              <div>
                <span className="text-slate-400">Lý do yêu cầu:</span>
                <p className="font-semibold text-slate-200 break-words">{item.reason}</p>
              </div>

              {/* Information Header / Tóm tắt tính toán hoàn tiền */}
              <div className="sm:col-span-2 rounded-xl border border-white/10 bg-[#111a2e] p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-white/5 pb-2">
                  <span className="text-slate-400 font-medium">Giá vé đã thanh toán thực tế:</span>
                  <div className="font-bold text-white">
                    {formatCurrency(actualPaid)}
                    {discountPercent > 0 && (
                      <span className="ml-1.5 text-xs font-semibold text-emerald-400">
                        (Đã áp mã giảm {discountPercent}%)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-white/5 pb-2">
                  <span className="text-slate-400 font-medium shrink-0">Quy định / Chính sách áp dụng:</span>
                  <div className="inline-flex items-center rounded-md bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/20 text-right">
                    {policyText}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pt-0.5">
                  <span className="font-bold text-slate-300">Số tiền hoàn:</span>
                  <span className="text-base font-black text-emerald-400">
                    {formatCurrency(item.refund_amount)}
                  </span>
                </div>
              </div>
              {bankInfo && (
                <div className="sm:col-span-2 rounded-lg border border-white/10 bg-[#1e2a4a] p-2.5">
                  <p className="font-bold text-amber-300">Thông tin ngân hàng nhận hoàn tiền:</p>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-slate-200">
                    <div><span className="text-slate-400">Ngân hàng:</span> {bankInfo.bank_name || 'N/A'}</div>
                    <div><span className="text-slate-400">Số TK:</span> <span className="font-mono font-bold">{bankInfo.account_number || 'N/A'}</span></div>
                    <div><span className="text-slate-400">Chủ TK:</span> {bankInfo.account_holder || 'N/A'}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
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
