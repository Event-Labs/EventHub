import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  CheckCircle,
  CreditCard,
  Building,
  User,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  FileText,
  Copy,
  Check,
  Upload,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  QrCode,
  Info,
  ChevronLeft,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchOrganizerRefundDetail,
  processOrganizerRefund,
  fetchOrganizerPaymentChannel,
} from '@/services/refunds.js'
import { uploadOrganizerDocument } from '@/services/uploads.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { VIETNAMESE_BANKS } from '@/constants/banks.js'

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

function resolveBankBin(bankInput) {
  if (!bankInput) return null
  const cleaned = String(bankInput).trim().toLowerCase()
  if (/^\d{6}$/.test(cleaned)) return cleaned

  const found = VIETNAMESE_BANKS.find((b) => {
    const code = b.code.toLowerCase()
    const shortName = b.shortName.toLowerCase()
    const fullName = b.fullName.toLowerCase()
    return cleaned.includes(code) || cleaned.includes(shortName) || cleaned.includes(fullName)
  })
  if (found?.bin) return found.bin
  return null
}

function getStatusBadge(status) {
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
          <Clock className="size-3.5" />
          Chờ xử lý
        </span>
      )
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300">
          <CheckCircle2 className="size-3.5" />
          Đã duyệt chi
        </span>
      )
    case 'PROCESSING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300 animate-pulse">
          <RefreshCw className="size-3.5 animate-spin" />
          Đang xử lý PayOS
        </span>
      )
    case 'REFUNDED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
          <CheckCircle className="size-3.5" />
          Đã hoàn tiền
        </span>
      )
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300">
          <XCircle className="size-3.5" />
          Đã từ chối
        </span>
      )
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300">
          <AlertCircle className="size-3.5" />
          Hoàn tiền thất bại
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-300">
          {status || 'N/A'}
        </span>
      )
  }
}

export function OrganizerRefundDetailPage() {
  const { refundId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  // Selection & Form State
  const [decision, setDecision] = useState('APPROVE') // 'APPROVE' | 'REJECT'
  const [refundMethod, setRefundMethod] = useState('PAYOS') // 'PAYOS' | 'MANUAL_BANK_TRANSFER'
  const [manualStep, setManualStep] = useState(1) // 1: Chuyển tiền | 2: Đối soát
  const [transactionRef, setTransactionRef] = useState('')
  const [organizerNote, setOrganizerNote] = useState('')
  const [rejectReason, setRejectReason] = useState('Không đúng chính sách quy định sự kiện')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [copiedField, setCopiedField] = useState(null)

  // Payment Channel Query to check if PayOS is configured
  const paymentChannelQuery = useQuery({
    queryKey: ['organizer-payment-channel'],
    queryFn: fetchOrganizerPaymentChannel,
    staleTime: 60 * 1000,
  })
  const paymentChannel = paymentChannelQuery.data
  const isPayOSConnected = Boolean(paymentChannel?.client_id && paymentChannel?.is_active !== false)

  // Proof upload state
  const [proofFile, setProofFile] = useState(null)
  const [proofPreviewUrl, setProofPreviewUrl] = useState('')
  const [isUploadingProof, setIsUploadingProof] = useState(false)

  // Fetch refund detail
  const {
    data: item,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['organizer-refund-detail', refundId],
    queryFn: () => fetchOrganizerRefundDetail(refundId),
    enabled: Boolean(refundId),
  })

  // Calculation breakdown
  const defaultRefundAmount = Number(item?.refund_amount || 0)
  const originalPrice = Number(
    item?.ticket?.final_price ||
    item?.ticket?.unit_price ||
    item?.ticket?.ticket_type?.price ||
    item?.order?.subtotal ||
    defaultRefundAmount ||
    0,
  )
  const subtotal = Number(item?.order?.subtotal || 0)
  const discountAmount = Number(item?.order?.discount_amount || 0)
  const totalAmount = Number(item?.order?.total_amount || 0)

  let actualPaid = Number(item?.ticket?.final_price || 0)
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

  if (totalAmount > 0 && actualPaid > totalAmount) actualPaid = totalAmount
  if (actualPaid <= 0 && defaultRefundAmount > 0) actualPaid = defaultRefundAmount
  if (actualPaid < defaultRefundAmount) actualPaid = defaultRefundAmount

  const rawPolicy = item?.event?.refund_policy
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

  const bankInfo = item?.bank_info || (item?.bank_name ? {
    bank_name: item.bank_name,
    account_number: item.bank_account_number,
    account_holder: item.bank_account_name,
  } : null)

  const bin = resolveBankBin(bankInfo?.bank_name) || '970422'
  const transferMemo = `Hoan tien ${item?.ticket?.ticket_code || item?.order?.order_code || ''}`
  const qrUrl = bankInfo?.account_number
    ? `https://img.vietqr.io/image/${bin}-${bankInfo.account_number}-compact2.png?amount=${defaultRefundAmount}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(bankInfo.account_holder || '')}`
    : null

  const isPending = item?.status === 'PENDING'
  const isFailed = item?.status === 'FAILED'
  const canProcess = isPending || isFailed

  // Copy helper
  const handleCopy = (text, fieldName, label) => {
    if (!text) return
    navigator.clipboard.writeText(String(text))
    setCopiedField(fieldName)
    toast.success(`Đã sao chép ${label}!`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Handle file select
  const handleProofChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Vui lòng chọn file ảnh hợp lệ (JPG, PNG hoặc WEBP)!')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dung lượng ảnh không được vượt quá 5MB!')
      return
    }

    setProofFile(file)
    setProofPreviewUrl(URL.createObjectURL(file))
  }

  const handleRemoveProof = () => {
    setProofFile(null)
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl)
      setProofPreviewUrl('')
    }
  }

  // Mutation for processing refund
  const processMutation = useMutation({
    mutationFn: (payload) => processOrganizerRefund(refundId, payload),
    onSuccess: (data) => {
      toast.success(data?.message || 'Xử lý yêu cầu hoàn tiền thành công!')
      queryClient.invalidateQueries({ queryKey: ['organizer-refund-detail', refundId] })
      queryClient.invalidateQueries({ queryKey: ['organizer-refunds'] })
      refetch()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || err.message || 'Không thể xử lý yêu cầu hoàn tiền.')
    },
  })

  // Submit PayOS refund
  const handlePayOSSubmit = () => {
    if (!canProcess) return
    processMutation.mutate({
      action: 'APPROVE',
      refund_method: 'PAYOS',
      final_refund_amount: defaultRefundAmount,
      organizer_note: organizerNote.trim() || undefined,
    })
  }

  // Submit Manual refund
  const handleManualSubmit = async () => {
    if (!canProcess) return

    if (!transactionRef.trim()) {
      toast.error('Vui lòng nhập Mã giao dịch ngân hàng!')
      return
    }

    if (!isConfirmed) {
      toast.error('Vui lòng xác nhận bạn đã chuyển đúng số tiền hoàn cho khách hàng!')
      return
    }

    let uploadedProofUrl = ''
    if (proofFile) {
      try {
        setIsUploadingProof(true)
        const uploadRes = await uploadOrganizerDocument(proofFile, { imageOnly: true })
        uploadedProofUrl = uploadRes?.secure_url || uploadRes?.url || ''
      } catch (uploadErr) {
        setIsUploadingProof(false)
        toast.error('Không thể tải ảnh biên lai lên hệ thống: ' + (uploadErr.message || 'Lỗi tải ảnh'))
        return
      } finally {
        setIsUploadingProof(false)
      }
    }

    processMutation.mutate({
      action: 'REFUND',
      refund_method: 'MANUAL_BANK_TRANSFER',
      final_refund_amount: defaultRefundAmount,
      transaction_ref: transactionRef.trim(),
      proof_url: uploadedProofUrl || undefined,
      organizer_note: organizerNote.trim() || undefined,
    })
  }

  // Submit Rejection
  const handleRejectSubmit = () => {
    if (!canProcess) return
    const reasonText = organizerNote.trim() || rejectReason
    if (!reasonText) {
      toast.error('Vui lòng nhập lý do từ chối để gửi cho khách hàng!')
      return
    }

    processMutation.mutate({
      action: 'REJECT',
      reject_reason: rejectReason,
      organizer_note: organizerNote.trim() || rejectReason,
    })
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-slate-400">
        <RefreshCw className="size-10 animate-spin text-primary" />
        <p className="mt-4 text-sm font-medium">Đang tải thông tin yêu cầu hoàn tiền...</p>
      </div>
    )
  }

  // Error State / Not Found
  if (isError || !item) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="size-10" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-white">Không tìm thấy yêu cầu hoàn tiền</h3>
        <p className="mt-1 text-sm text-slate-400">
          {error?.response?.data?.message || 'Yêu cầu không tồn tại hoặc bạn không có quyền truy cập.'}
        </p>
        <Link
          to="/organizer/refunds"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-primary/90"
        >
          <ArrowLeft className="size-4" />
          Quay lại danh sách yêu cầu
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 text-slate-100">
      {/* ─────────────────────────────────────────────────────────────
          SECTION A: HEADER
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
        <div className="space-y-1">
          <Link
            to="/organizer/refunds"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="size-3.5" />
            Quản lý hoàn tiền
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Xử lý yêu cầu hoàn tiền
            </h1>
            <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 rounded-lg">
              #RF-{item.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {getStatusBadge(item.status)}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MAIN 2-COLUMN LAYOUT
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Main Processing & Workflow (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* ─────────────────────────────────────────────────────────
              SECTION C: REFUND STATUS / TIMELINE
          ───────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-5 shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              Tiến trình yêu cầu hoàn tiền
            </h2>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-2">
              {/* Step 1: Requested */}
              <div className="flex items-center gap-3 z-10">
                <div className="size-8 rounded-full flex items-center justify-center font-bold text-xs bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20">
                  <Check className="size-4 stroke-[3]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Khách gửi yêu cầu</p>
                  <p className="text-[11px] text-slate-400">{formatDateTime(item.requested_at || item.created_at)}</p>
                </div>
              </div>

              <div className="hidden sm:block flex-1 h-0.5 bg-white/10 mx-2" />

              {/* Step 2: In Review / Processing */}
              <div className="flex items-center gap-3 z-10">
                <div
                  className={`size-8 rounded-full flex items-center justify-center font-bold text-xs ${item.status === 'REFUNDED'
                      ? 'bg-emerald-500 text-slate-950'
                      : item.status === 'REJECTED'
                        ? 'bg-red-500 text-white'
                        : 'bg-primary text-slate-950 ring-4 ring-primary/20 animate-pulse'
                    }`}
                >
                  {item.status === 'REFUNDED' ? (
                    <Check className="size-4 stroke-[3]" />
                  ) : item.status === 'REJECTED' ? (
                    <X className="size-4 stroke-[3]" />
                  ) : (
                    '2'
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    {item.status === 'REJECTED'
                      ? 'Đã từ chối'
                      : item.status === 'REFUNDED'
                        ? 'Đã duyệt chi'
                        : 'BTC đang xử lý'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {item.status === 'PENDING' ? 'Chờ chọn phương thức' : formatDateTime(item.reviewed_at || item.updated_at)}
                  </p>
                </div>
              </div>

              <div className="hidden sm:block flex-1 h-0.5 bg-white/10 mx-2" />

              {/* Step 3: Completed */}
              <div className="flex items-center gap-3 z-10">
                <div
                  className={`size-8 rounded-full flex items-center justify-center font-bold text-xs ${item.status === 'REFUNDED'
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                      : item.status === 'REJECTED'
                        ? 'bg-red-500 text-white'
                        : 'bg-white/10 text-slate-500'
                    }`}
                >
                  {item.status === 'REFUNDED' ? (
                    <Check className="size-4 stroke-[3]" />
                  ) : item.status === 'REJECTED' ? (
                    <X className="size-4 stroke-[3]" />
                  ) : (
                    '3'
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    {item.status === 'REJECTED' ? 'Từ chối hoàn tiền' : 'Hoàn tiền hoàn tất'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {item.status === 'REFUNDED' ? formatDateTime(item.refunded_at || item.updated_at) : 'Khách nhận tiền'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              SECTION D & E: ACTIVE PROCESSING AREA (If Pending or Failed)
          ───────────────────────────────────────────────────────── */}
          {canProcess ? (
            <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-5 sm:p-6 shadow-xl space-y-6">
              {/* ─────────────────────────────────────────────────────
                  1. DECISION SELECTOR: CHẤP NHẬN HOẶC TỪ CHỐI TRƯỚC
              ───────────────────────────────────────────────────── */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    Quyết định xử lý <span className="text-red-400">*</span>
                  </h2>
                  <span className="text-xs text-slate-400">
                    Vui lòng chọn quyết định trước để hiển thị biểu mẫu xử lý tương ứng
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Option A: APPROVE */}
                  <div
                    onClick={() => setDecision('APPROVE')}
                    className={`cursor-pointer rounded-xl border p-4 transition-all flex items-start gap-3.5 ${decision === 'APPROVE'
                        ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/10'
                        : 'border-white/10 bg-[#141e36] hover:border-white/20'
                      }`}
                  >
                    <div
                      className={`mt-0.5 size-5 rounded-full border flex items-center justify-center shrink-0 ${decision === 'APPROVE'
                          ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                          : 'border-slate-500'
                        }`}
                    >
                      {decision === 'APPROVE' && <Check className="size-3 stroke-[3]" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        Chấp nhận hoàn tiền
                        {decision === 'APPROVE' && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                            Đã chọn
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Đồng ý hoàn lại số tiền <span className="font-bold text-emerald-400">{formatCurrency(defaultRefundAmount)}</span> theo chính sách hoàn vé.
                      </p>
                    </div>
                  </div>

                  {/* Option B: REJECT */}
                  <div
                    onClick={() => setDecision('REJECT')}
                    className={`cursor-pointer rounded-xl border p-4 transition-all flex items-start gap-3.5 ${decision === 'REJECT'
                        ? 'border-red-500 bg-red-500/10 ring-2 ring-red-500 shadow-lg shadow-red-500/10'
                        : 'border-white/10 bg-[#141e36] hover:border-white/20'
                      }`}
                  >
                    <div
                      className={`mt-0.5 size-5 rounded-full border flex items-center justify-center shrink-0 ${decision === 'REJECT'
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-slate-500'
                        }`}
                    >
                      {decision === 'REJECT' && <X className="size-3 stroke-[3]" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        Từ chối yêu cầu
                        {decision === 'REJECT' && (
                          <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                            Đã chọn
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Từ chối yêu cầu hoàn tiền nếu không hợp lệ và gửi thông báo lý do đến người mua.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────
                  2. KHI CHỌN CHẤP NHẬN: CHỌN PHƯƠNG THỨC & FORM TƯƠNG ỨNG
              ───────────────────────────────────────────────────── */}
              {decision === 'APPROVE' && (
                <div className="space-y-6 pt-4 border-t border-white/10">
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                      Chọn phương thức thực hiện hoàn tiền <span className="text-red-400">*</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Chọn cổng thanh toán PayOS tự động hoặc chuyển khoản trực tiếp qua ngân hàng
                    </p>
                  </div>

                  {/* METHOD SELECTION CARDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* OPTION 1: PayOS Automatic */}
                    <div
                      onClick={() => setRefundMethod('PAYOS')}
                      className={`relative flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all ${refundMethod === 'PAYOS'
                          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10 ring-2 ring-primary'
                          : 'border-white/10 bg-[#141e36] hover:border-white/25'
                        }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-primary/20 text-primary">
                              Khuyến nghị
                            </span>
                            {paymentChannelQuery.isLoading ? null : isPayOSConnected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Đã kết nối
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                <AlertCircle className="size-3" />
                                Chưa kết nối
                              </span>
                            )}
                          </div>
                          <div
                            className={`size-4 rounded-full border flex items-center justify-center ${refundMethod === 'PAYOS' ? 'border-primary bg-primary' : 'border-slate-500'
                              }`}
                          >
                            {refundMethod === 'PAYOS' && <div className="size-1.5 rounded-full bg-slate-950" />}
                          </div>
                        </div>
                        <h3 className="text-sm font-bold text-white">Cổng thanh toán PayOS</h3>
                        <p className="text-xs text-slate-300 font-medium">Hoàn tiền tự động qua cổng thanh toán</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Hệ thống tự động gửi lệnh chi hoàn tiền qua API PayOS. Không cần chuyển khoản thủ công.
                        </p>
                      </div>
                    </div>

                    {/* OPTION 2: Manual Bank Transfer */}
                    <div
                      onClick={() => setRefundMethod('MANUAL_BANK_TRANSFER')}
                      className={`relative flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all ${refundMethod === 'MANUAL_BANK_TRANSFER'
                          ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10 ring-2 ring-amber-400'
                          : 'border-white/10 bg-[#141e36] hover:border-white/25'
                        }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-400/20 text-amber-300">
                            Thủ công (2 bước)
                          </span>
                          <div
                            className={`size-4 rounded-full border flex items-center justify-center ${refundMethod === 'MANUAL_BANK_TRANSFER' ? 'border-amber-400 bg-amber-400' : 'border-slate-500'
                              }`}
                          >
                            {refundMethod === 'MANUAL_BANK_TRANSFER' && <div className="size-1.5 rounded-full bg-slate-950" />}
                          </div>
                        </div>
                        <h3 className="text-sm font-bold text-white">Chuyển khoản thủ công</h3>
                        <p className="text-xs text-amber-200/90 font-medium">Chuyển trực tiếp qua tài khoản ngân hàng</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Quét mã VietQR hoặc chuyển khoản trực tiếp, sau đó nhập Transaction ID và tải biên lai đối soát.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ─────────────────────────────────────────────────
                      FLOW A: PAYOS (TỰ ĐỘNG) HOẶC CẢNH BÁO CHƯA KẾT NỐI
                  ───────────────────────────────────────────────── */}
                  {refundMethod === 'PAYOS' && (
                    <div>
                      {!isPayOSConnected && !paymentChannelQuery.isLoading ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-4">
                          <div className="flex items-start gap-3.5">
                            <div className="rounded-xl bg-amber-500/20 p-2.5 text-amber-400 shrink-0">
                              <AlertCircle className="size-5" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">Chưa kết nối Cổng thanh toán PayOS</h4>
                                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                  Chưa cấu hình
                                </span>
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed">
                                Tài khoản của bạn chưa được liên kết hoặc cấu hình kênh thanh toán PayOS (Client ID, API Key, Checksum Key). Để hệ thống có thể hoàn tiền tự động về tài khoản khách hàng, bạn cần thiết lập thông tin PayOS trong trang Cài đặt thanh toán.
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
                            <button
                              type="button"
                              onClick={() => navigate('/organizer/settings/payment')}
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-primary/20 hover:bg-primary/90 transition"
                            >
                              <ExternalLink className="size-4" />
                              Đến Cài đặt thanh toán để thiết lập ngay
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefundMethod('MANUAL_BANK_TRANSFER')}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#16223d] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-white/25 transition"
                            >
                              Chuyển sang Chuyển khoản thủ công
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <span className="text-xs font-semibold text-primary">Phương thức xử lý</span>
                            <h4 className="text-base font-black text-white">PayOS - Hoàn tiền tự động</h4>
                          </div>

                          <div className="space-y-1.5 text-xs text-slate-300">
                            <p className="font-semibold text-white flex items-center gap-1.5">
                              <Info className="size-4 text-primary" />
                              Quy trình hoàn tiền tự động:
                            </p>
                            <p className="text-[12px] text-slate-300 leading-relaxed">
                              Hệ thống sẽ kết nối trực tiếp đến cổng PayOS của Ban tổ chức để thực hiện lệnh Chi hộ (Payout) hoàn lại đúng{' '}
                              <span className="font-bold text-emerald-400">{formatCurrency(defaultRefundAmount)}</span> về tài khoản của khách hàng.
                            </p>
                            <p className="text-[11px] italic text-amber-300/90 pt-1">
                              * Lưu ý: Tài khoản PayOS của BTC cần kích hoạt dịch vụ Chi hộ và có đủ số dư ví chi. Nếu chưa kích hoạt, vui lòng chọn Chuyển khoản thủ công.
                            </p>
                          </div>

                          {/* Organizer Note */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              Ghi chú của BTC gửi khách hàng (Tùy chọn)
                            </label>
                            <textarea
                              rows={2}
                              maxLength={500}
                              value={organizerNote}
                              onChange={(e) => setOrganizerNote(e.target.value)}
                              placeholder="Ghi chú thêm gửi đến khách hàng qua email thông báo (tùy chọn)..."
                              className="w-full rounded-lg border border-white/10 bg-[#16223d] p-3 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                            />
                          </div>

                          {/* Submit PayOS CTA */}
                          <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                              type="button"
                              disabled={processMutation.isPending}
                              onClick={handlePayOSSubmit}
                              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-xs font-black text-slate-950 shadow-lg shadow-primary/20 hover:bg-primary/90 transition disabled:opacity-50"
                            >
                              {processMutation.isPending ? (
                                <>
                                  <RefreshCw className="size-4 animate-spin" />
                                  Đang kết nối cổng PayOS...
                                </>
                              ) : (
                                'Thực hiện hoàn tiền qua PayOS'
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────
                      FLOW B: MANUAL BANK TRANSFER (2-STEP WORKFLOW)
                  ───────────────────────────────────────────────── */}
                  {refundMethod === 'MANUAL_BANK_TRANSFER' && (
                    <div className="space-y-5">
                      {/* Stepper Navigation */}
                      <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setManualStep(1)}
                            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition ${manualStep === 1
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : 'bg-white/5 text-slate-300 hover:text-white'
                              }`}
                          >
                            Bước 1: Chuyển tiền
                          </button>
                          <ChevronRight className="size-4 text-slate-500" />
                          <button
                            type="button"
                            onClick={() => setManualStep(2)}
                            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition ${manualStep === 2
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : 'bg-white/5 text-slate-300 hover:text-white'
                              }`}
                          >
                            Bước 2: Đối soát
                          </button>
                        </div>
                        <span className="text-xs font-bold text-amber-300">
                          Bước {manualStep} / 2
                        </span>
                      </div>

                      {/* STEP 1: CHUYỂN TIỀN (VietQR & Account Info) */}
                      {manualStep === 1 && (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-black text-white">Bước 1: Chuyển khoản hoàn tiền</h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Quét mã VietQR hoặc sao chép thông tin tài khoản bên dưới để chuyển tiền đến khách hàng
                            </p>
                          </div>

                          {/* QR and Account Details */}
                          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 py-2">
                            {qrUrl && (
                              <div className="flex flex-col items-center bg-white p-4 sm:p-5 rounded-2xl shadow-xl shrink-0">
                                <img
                                  src={qrUrl}
                                  alt="VietQR Chuyển khoản hoàn tiền"
                                  className="size-60 sm:size-72 object-contain"
                                />
                                <span className="mt-2.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                  VietQR Chuẩn NAPAS 247
                                </span>
                              </div>
                            )}

                            {/* Account Details with Copy Buttons */}
                            <div className="flex-1 space-y-3 w-full">
                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="text-xs text-slate-400">Ngân hàng:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">{bankInfo?.bank_name || 'N/A'}</span>
                                  {bankInfo?.bank_name && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(bankInfo.bank_name, 'bank_name', 'Tên ngân hàng')}
                                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition"
                                      title="Sao chép tên ngân hàng"
                                    >
                                      {copiedField === 'bank_name' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="text-xs text-slate-400">Số tài khoản:</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-bold text-amber-300">
                                    {bankInfo?.account_number || 'N/A'}
                                  </span>
                                  {bankInfo?.account_number && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(bankInfo.account_number, 'account_number', 'Số tài khoản')}
                                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition"
                                      title="Sao chép số tài khoản"
                                    >
                                      {copiedField === 'account_number' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="text-xs text-slate-400">Chủ tài khoản:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white uppercase">
                                    {bankInfo?.account_holder || 'N/A'}
                                  </span>
                                  {bankInfo?.account_holder && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(bankInfo.account_holder, 'account_holder', 'Chủ tài khoản')}
                                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition"
                                      title="Sao chép tên chủ tài khoản"
                                    >
                                      {copiedField === 'account_holder' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="text-xs text-slate-400">Nội dung chuyển khoản:</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-slate-200">
                                    {transferMemo}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(transferMemo, 'memo', 'Nội dung CK')}
                                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition"
                                    title="Sao chép nội dung chuyển khoản"
                                  >
                                    {copiedField === 'memo' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-slate-400">Số tiền:</span>
                                <span className="font-mono text-sm font-black text-emerald-400">
                                  {formatCurrency(defaultRefundAmount)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Notice */}
                          <p className="text-xs text-amber-300/90 italic">
                            * Vui lòng chuyển đúng số tài khoản và số tiền trước khi bấm xác nhận chuyển bước
                          </p>

                          {/* Step 1 Actions */}
                          <div className="flex items-center justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => setManualStep(2)}
                              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-xs font-black text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 transition"
                            >
                              Tôi đã chuyển khoản
                              <ChevronRight className="size-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* STEP 2: ĐỐI SOÁT (Transaction ID + Proof Upload) */}
                      {manualStep === 2 && (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-black text-white">Bước 2: Nhập thông tin đối soát</h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Nhập mã giao dịch ngân hàng và tải lên biên lai chuyển tiền để lưu hồ sơ đối soát
                            </p>
                          </div>

                          {/* Transaction Reference ID */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-white">
                              Mã giao dịch ngân hàng <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={transactionRef}
                              onChange={(e) => setTransactionRef(e.target.value)}
                              placeholder="Ví dụ: FT260910123456, MB123456789, VCB987654321..."
                              className="w-full rounded-xl border border-white/10 bg-[#121c33] p-3 font-mono text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                            />
                            <p className="text-[11px] text-slate-400">
                              Mã tham chiếu giao dịch hiển thị trên ứng dụng ngân hàng của bạn sau khi chuyển khoản thành công.
                            </p>
                          </div>

                          {/* Proof of Payment File Upload */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-semibold text-slate-300">
                                Ảnh chụp biên lai chuyển khoản (Ủy nhiệm chi)
                              </label>
                              <span className="text-[11px] text-slate-400">JPG, PNG, WEBP (Tối đa 5MB)</span>
                            </div>

                            {!proofPreviewUrl ? (
                              <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/15 rounded-xl p-6 cursor-pointer bg-[#121c33]/60 hover:bg-[#121c33] hover:border-amber-400/50 transition-all group">
                                <Upload className="size-8 text-slate-400 group-hover:text-amber-400 transition" />
                                <p className="mt-2 text-xs font-bold text-white">Bấm để tải ảnh biên lai chuyển khoản</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">hoặc kéo thả file ảnh vào đây</p>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={handleProofChange}
                                />
                              </label>
                            ) : (
                              <div className="rounded-xl border border-white/10 bg-[#121c33] p-3 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={proofPreviewUrl}
                                    alt="Biên lai xem trước"
                                    className="size-16 rounded-lg object-cover border border-white/10"
                                  />
                                  <div className="space-y-0.5">
                                    <p className="text-xs font-bold text-white truncate max-w-xs">{proofFile?.name || 'Ảnh biên lai'}</p>
                                    <p className="text-[11px] text-slate-400">
                                      {proofFile ? `${(proofFile.size / 1024).toFixed(1)} KB` : 'Đã chọn'}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRemoveProof}
                                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition"
                                >
                                  Gỡ bỏ ảnh
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Organizer Note */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-300">
                              Ghi chú của BTC gửi khách hàng (Tùy chọn)
                            </label>
                            <textarea
                              rows={2}
                              maxLength={500}
                              value={organizerNote}
                              onChange={(e) => setOrganizerNote(e.target.value)}
                              placeholder="Ghi chú thêm gửi đến khách hàng..."
                              className="w-full rounded-xl border border-white/10 bg-[#141e36] p-3 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                            />
                          </div>

                          {/* Confirmation Checkbox */}
                          <label className="flex items-start gap-3 cursor-pointer py-1 select-none">
                            <input
                              type="checkbox"
                              checked={isConfirmed}
                              onChange={(e) => setIsConfirmed(e.target.checked)}
                              className="mt-0.5 size-4 rounded border-slate-600 bg-[#1e293b] text-amber-400 focus:ring-amber-400"
                            />
                            <span className="text-xs text-slate-300 font-medium leading-relaxed">
                              Tôi xác nhận đã chuyển đúng số tiền <span className="font-bold text-emerald-400">{formatCurrency(defaultRefundAmount)}</span> đến tài khoản ngân hàng của khách hàng theo đúng quy định
                            </span>
                          </label>

                          {/* Step 2 Actions */}
                          <div className="flex items-center justify-between pt-2">
                            <button
                              type="button"
                              onClick={() => setManualStep(1)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
                            >
                              <ChevronLeft className="size-4" />
                              Quay lại Bước 1
                            </button>
                            <button
                              type="button"
                              disabled={!transactionRef.trim() || !isConfirmed || processMutation.isPending || isUploadingProof}
                              onClick={handleManualSubmit}
                              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-xs font-black text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 transition disabled:opacity-50"
                            >
                              {processMutation.isPending || isUploadingProof ? (
                                <>
                                  <RefreshCw className="size-4 animate-spin" />
                                  Đang lưu đối soát...
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="size-4" />
                                  Đã chuyển tiền & Xác nhận
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─────────────────────────────────────────────────────
                  3. KHI CHỌN TỪ CHỐI: HIỆN FORM TỪ CHỐI TƯƠNG ỨNG
              ───────────────────────────────────────────────────── */}
              {decision === 'REJECT' && (
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div>
                    <h4 className="text-sm font-black text-white">Từ chối yêu cầu hoàn tiền</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Vé sẽ được hoàn trả về trạng thái hợp lệ và thông báo lý do từ chối đến email khách hàng
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">
                      Lý do từ chối (Bắt buộc gửi cho khách hàng) <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={organizerNote}
                      onChange={(e) => setOrganizerNote(e.target.value)}
                      placeholder="Vui lòng nêu rõ lý do từ chối để khách hàng nắm rõ..."
                      className="w-full rounded-xl border border-white/10 bg-[#141e36] p-3 text-xs text-white placeholder-slate-500 focus:border-red-400 focus:outline-none"
                    />

                    {/* Quick suggestion chips */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-400">Gợi ý nhanh:</span>
                      {[
                        'Không đúng chính sách quy định sự kiện',
                        'Vé đã qua sử dụng hoặc check-in',
                        'Quá thời hạn yêu cầu hoàn vé',
                        'Thông tin tài khoản nhận tiền chưa chính xác',
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setOrganizerNote(preset)}
                          className="rounded-lg border border-white/10 bg-[#141e36] px-2.5 py-1 text-[11px] text-slate-300 hover:border-red-400/40 hover:text-white transition"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2 border-t border-white/5">
                    <button
                      type="button"
                      disabled={!organizerNote.trim() || processMutation.isPending}
                      onClick={handleRejectSubmit}
                      className="inline-flex items-center justify-center rounded-xl bg-red-500 px-6 py-3 text-xs font-black text-white hover:bg-red-400 transition disabled:opacity-50 shadow-lg shadow-red-500/20"
                    >
                      {processMutation.isPending ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          Đang xử lý...
                        </>
                      ) : (
                        'Xác nhận từ chối'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────
                SECTION F: COMPLETED / AUDIT INFORMATION
            ───────────────────────────────────────────────────────── */
            <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-5 sm:p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {item.status === 'REFUNDED' ? (
                      <>
                        <CheckCircle className="size-5 text-emerald-400" />
                        Hồ sơ đối soát hoàn tiền
                      </>
                    ) : item.status === 'REJECTED' ? (
                      <>
                        <XCircle className="size-5 text-red-400" />
                        Hồ sơ từ chối hoàn tiền
                      </>
                    ) : (
                      <>
                        <Info className="size-5 text-primary" />
                        Thông tin xử lý
                      </>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Chi tiết giao dịch và đối soát đã được lưu trữ trong hệ thống
                  </p>
                </div>
                {getStatusBadge(item.status)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1">
                  <span className="text-slate-400">Phương thức hoàn tiền:</span>
                  <p className="font-bold text-white">
                    {item.refund_method === 'PAYOS'
                      ? 'Cổng thanh toán PayOS (Tự động)'
                      : item.refund_method === 'MANUAL_BANK_TRANSFER'
                        ? 'Chuyển khoản thủ công'
                        : 'Chưa xác định'}
                  </p>
                </div>

                <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1">
                  <span className="text-slate-400">Số tiền hoàn:</span>
                  <p className="font-mono font-black text-emerald-400 text-sm">
                    {formatCurrency(item.refund_amount)}
                  </p>
                </div>

                {item.transaction_ref && (
                  <div className="sm:col-span-2 rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1">
                    <span className="text-slate-400">Mã giao dịch ngân hàng / đối soát:</span>
                    <p className="font-mono font-bold text-amber-300 text-sm">{item.transaction_ref}</p>
                  </div>
                )}

                {item.reject_reason && (
                  <div className="sm:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 space-y-1 text-red-300">
                    <span className="font-bold">Lý do từ chối:</span>
                    <p className="text-xs">{item.reject_reason}</p>
                  </div>
                )}

                {item.organizer_note && (
                  <div className="sm:col-span-2 rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1">
                    <span className="text-slate-400">Ghi chú của BTC:</span>
                    <p className="text-slate-200">{item.organizer_note}</p>
                  </div>
                )}

                {/* Proof of payment preview */}
                {item.proof_url && (
                  <div className="sm:col-span-2 rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-2">
                    <span className="text-slate-400 font-bold block">Biên lai chuyển khoản đối soát:</span>
                    <div className="flex items-center gap-4">
                      <a
                        href={item.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block overflow-hidden rounded-xl border border-white/15"
                      >
                        <img
                          src={item.proof_url}
                          alt="Biên lai hoàn tiền"
                          className="h-28 w-44 object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <ExternalLink className="size-5 text-white" />
                        </div>
                      </a>
                      <div className="space-y-1">
                        <a
                          href={item.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                        >
                          Xem ảnh gốc kích thước đầy đủ
                          <ExternalLink className="size-3.5" />
                        </a>
                        <p className="text-[11px] text-slate-400">Biên lai được lưu trữ an toàn trên máy chủ Cloudinary</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1">
                  <span className="text-slate-400">Người xử lý:</span>
                  <p className="font-bold text-white">{item.processed_by?.full_name || 'Ban tổ chức'}</p>
                </div>

                <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1">
                  <span className="text-slate-400">Thời gian cập nhật:</span>
                  <p className="font-bold text-white">{formatDateTime(item.refunded_at || item.reviewed_at || item.updated_at)}</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Link
                  to="/organizer/refunds"
                  className="rounded-xl bg-white/10 px-5 py-2.5 text-xs font-bold text-white hover:bg-white/20 transition"
                >
                  Quay lại danh sách yêu cầu
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Summary & Calculation Details (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* SECTION B: REFUND REQUEST SUMMARY */}
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-5 shadow-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Thông tin yêu cầu hoàn tiền
            </h3>

            {/* Event Info */}
            <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-2">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Sự kiện</span>
              <p className="font-bold text-white text-sm leading-snug">{item.event?.title || 'N/A'}</p>
              {item.event?.start_time && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  {formatDateTime(item.event.start_time)}
                </p>
              )}
            </div>

            {/* Ticket / Order Code */}
            <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Mã vé / Mã đơn:</span>
                <span className="font-mono font-bold text-amber-400">
                  {item.ticket?.ticket_code || `Đơn: ${item.order?.order_code}`}
                </span>
              </div>
              {item.ticket?.ticket_type?.name && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Loại vé:</span>
                  <span className="font-semibold text-white">{item.ticket.ticket_type.name}</span>
                </div>
              )}
              {item.order?.order_code && item.ticket?.ticket_code && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Mã đơn hàng:</span>
                  <span className="font-mono text-slate-300">{item.order.order_code}</span>
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-2 text-xs">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">Khách hàng</span>
              <p className="font-bold text-white text-sm">
                {item.customer?.full_name || item.order?.buyer_name || 'Khách hàng'}
              </p>
              <p className="text-slate-300 flex items-center gap-1.5 truncate">
                <Mail className="size-3.5 text-slate-400 shrink-0" />
                {item.customer?.email || item.order?.buyer_email || 'N/A'}
              </p>
              {(item.customer?.phone || item.order?.buyer_phone) && (
                <p className="text-slate-300 flex items-center gap-1.5">
                  <Phone className="size-3.5 text-slate-400 shrink-0" />
                  {item.customer?.phone || item.order?.buyer_phone}
                </p>
              )}
            </div>

            {/* Refund Reason */}
            <div className="rounded-xl border border-white/5 bg-[#121c33] p-3.5 space-y-1 text-xs">
              <span className="text-slate-400">Lý do yêu cầu:</span>
              <p className="font-semibold text-slate-200 break-words">{item.reason}</p>
            </div>

            {/* Information Header / Tóm tắt tính toán */}
            <div className="rounded-xl border border-white/10 bg-[#111a2e] p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs">
                <span className="text-slate-400 font-medium">Giá vé thực tế đã trả:</span>
                <div className="font-bold text-white">
                  {formatCurrency(actualPaid)}
                  {discountPercent > 0 && (
                    <span className="ml-1.5 text-[11px] font-semibold text-emerald-400">
                      (Đã giảm {discountPercent}%)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/5 pb-2 text-xs">
                <span className="text-slate-400 font-medium">Chính sách áp dụng:</span>
                <div className="inline-flex items-center rounded-md bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/20">
                  {policyText}
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5 text-xs">
                <span className="font-bold text-slate-300">Số tiền hoàn đề xuất:</span>
                <span className="text-base font-black text-emerald-400">
                  {formatCurrency(defaultRefundAmount)}
                </span>
              </div>
            </div>

            {/* Bank Receiving Info */}
            {bankInfo && (
              <div className="rounded-xl border border-white/10 bg-[#1e2a4a] p-3.5 space-y-2 text-xs">
                <p className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Building className="size-4" />
                  Tài khoản ngân hàng nhận tiền:
                </p>
                <div className="space-y-1 text-slate-200 pt-1">
                  <div><span className="text-slate-400">Ngân hàng:</span> <span className="font-semibold text-white">{bankInfo.bank_name || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Số tài khoản:</span> <span className="font-mono font-bold text-amber-300">{bankInfo.account_number || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Chủ tài khoản:</span> <span className="font-bold text-white uppercase">{bankInfo.account_holder || 'N/A'}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
