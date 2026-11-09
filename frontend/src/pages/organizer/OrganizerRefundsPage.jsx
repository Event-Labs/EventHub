import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw,
  Search,
  Eye,
  AlertCircle,
  Zap,
  CheckCircle,
  Loader2,
  Filter,
  Calendar,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrganizerPage, StatusBadge, TableActionButton } from './OrganizerComponents.jsx'
import { fetchOrganizerRefundRequests, batchProcessOrganizerRefunds } from '@/services/refunds.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { CosmicSelect } from '@/components/CosmicSelect.jsx'

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

function formatShortErrorMessage(error) {
  if (!error) return 'Vui lòng chọn phương thức "Chuyển khoản thủ công".'
  const lower = error.toLowerCase()
  if (lower.includes('chi hộ') || lower.includes('601') || lower.includes('api key')) {
    return 'PayOS chưa bật dịch vụ Chi hộ. Vui lòng chọn "Chuyển khoản thủ công".'
  }
  if (lower.includes('ip') || lower.includes('whitelist')) {
    return 'IP chưa có trong Whitelist PayOS. Vui lòng chọn "Chuyển khoản thủ công".'
  }
  if (lower.includes('số dư') || lower.includes('balance')) {
    return 'Số dư ví PayOS không đủ. Vui lòng chọn "Chuyển khoản thủ công".'
  }
  if (lower.includes('idempotency') || lower.includes('606')) {
    return 'Trùng mã giao dịch PayOS. Vui lòng thử lại hoặc chuyển thủ công.'
  }
  if (error.length > 95) {
    return error.slice(0, 92) + '...'
  }
  return error
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'DISPUTED', label: 'Khiếu nại' },
  { value: 'REJECTED', label: 'Từ chối' },
]

export function OrganizerRefundsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [selectedEventId, setSelectedEventId] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Batch action states (Chỉ dành cho Hoàn tiền tự động qua PayOS)
  const [selectedIds, setSelectedIds] = useState([])
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [isProcessingBatch, setIsProcessingBatch] = useState(false)

  const refundsQuery = useQuery({
    queryKey: ['organizer-refunds'],
    queryFn: () => fetchOrganizerRefundRequests(),
  })

  const rawList = Array.isArray(refundsQuery.data)
    ? refundsQuery.data
    : (refundsQuery.data?.data || [])

  // Unique events for the event filter dropdown
  const eventsList = useMemo(() => {
    const map = new Map()
    for (const item of rawList) {
      if (item.event_id && item.event?.title) {
        map.set(item.event_id, item.event.title)
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [rawList])

  const eventOptions = useMemo(() => [
    { value: 'ALL', label: `Tất cả sự kiện (${eventsList.length})` },
    ...eventsList.map((ev) => ({
      value: ev.id,
      label: ev.title,
    })),
  ], [eventsList])

  const filteredList = useMemo(() => {
    return rawList.filter((item) => {
      // 1. Lọc theo trạng thái hoặc khiếu nại
      if (selectedStatus === 'DISPUTED') {
        if (!item.disputed) return false
      } else if (selectedStatus !== 'ALL' && item.status !== selectedStatus) {
        return false
      }
      // 2. Lọc theo sự kiện
      if (selectedEventId !== 'ALL' && item.event_id !== selectedEventId) {
        return false
      }
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
  }, [rawList, selectedStatus, selectedEventId, searchQuery])

  // Items that can be processed (pending approval, approved, processing, or failed/retryable)
  const actionableItems = useMemo(() => {
    return filteredList.filter((item) => ['PENDING', 'APPROVED', 'PROCESSING', 'FAILED'].includes(item.status))
  }, [filteredList])

  const isAllSelected = actionableItems.length > 0 && actionableItems.every((item) => selectedIds.includes(item.id))

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(actionableItems.map((item) => item.id))
    }
  }

  const toggleSelectItem = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const selectedTotalAmount = useMemo(() => {
    return rawList
      .filter((item) => selectedIds.includes(item.id))
      .reduce((sum, item) => sum + Number(item.refund_amount || 0), 0)
  }, [rawList, selectedIds])

  const handleExecuteBatch = async () => {
    if (selectedIds.length === 0) return
    setIsProcessingBatch(true)
    try {
      const res = await batchProcessOrganizerRefunds({
        refund_ids: selectedIds,
        action: 'APPROVE',
        refund_method: 'PAYOS',
        organizer_note: 'Hoàn tiền tự động hàng loạt qua PayOS',
      })
      const failedItems = res.items?.filter((i) => !i.success) || []
      const uniqueErrors = Array.from(
        new Set(failedItems.map((i) => i.error).filter(Boolean))
      )
      const cleanError = formatShortErrorMessage(uniqueErrors[0])

      if (res.successCount > 0 && res.failedCount === 0) {
        // Tất cả thành công
        toast.success(`Hoàn tiền thành công toàn bộ ${res.successCount} yêu cầu qua PayOS!`)
        setSelectedIds([])
      } else if (res.successCount > 0 && res.failedCount > 0) {
        // Một phần thành công
        toast.success(`Đã hoàn tiền ${res.successCount}/${res.total} yêu cầu qua PayOS.`)
        toast.error(`${res.failedCount} yêu cầu lỗi: ${cleanError}`)
        setSelectedIds(failedItems.map((i) => i.id))
      } else {
        // Toàn bộ thất bại (successCount === 0) -> Thông báo ngắn gọn, rõ ý
        toast.error(`Hoàn tiền thất bại: ${cleanError}`)
      }

      setBatchModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['organizer-refunds'] })
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Lỗi xử lý yêu cầu.'
      toast.error(`Thao tác thất bại: ${formatShortErrorMessage(msg)}`)
    } finally {
      setIsProcessingBatch(false)
    }
  }

  // Summary counts
  const counts = useMemo(() => {
    return {
      all: rawList.length,
      pending: rawList.filter((r) => r.status === 'PENDING').length,
      approved: rawList.filter((r) => r.status === 'APPROVED').length,
      processing: rawList.filter((r) => r.status === 'PROCESSING').length,
      refunded: rawList.filter((r) => r.status === 'REFUNDED').length,
      disputed: rawList.filter((r) => Boolean(r.disputed)).length,
      rejected: rawList.filter((r) => r.status === 'REJECTED').length,
    }
  }, [rawList])

  const getStatusBadge = (status, disputed) => {
    if (disputed) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.2)]">
          <AlertCircle className="size-3" /> Khiếu nại
        </span>
      )
    }
    if (status === 'PENDING') {
      return <StatusBadge status={status} label="Chờ duyệt" tone="amber" />
    }
    return <StatusBadge status={status} />
  }

  return (
    <OrganizerPage
      title="Quản lý yêu cầu Hoàn vé"
      description="Xem xét và xử lý các yêu cầu hoàn tiền vé từ người mua theo chính sách sự kiện"
    >
      <div className="space-y-6">

        {/* Summary Cards - Unified Light & Dark */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {/* Card 1: Tổng yêu cầu */}
          <div
            onClick={() => setSelectedStatus('ALL')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl transition-all cursor-pointer ${
              selectedStatus === 'ALL'
                ? 'border-[#C99A47] bg-[#1a2544] ring-2 ring-[#C99A47]/40'
                : 'border-white/15 bg-[#0f172a] hover:border-white/30'
            } [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/90 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">Tổng yêu cầu</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight [html.light_&]:text-[#0D1B2A]">{counts.all}</p>
          </div>

          {/* Card 2: Chờ duyệt */}
          <div
            onClick={() => setSelectedStatus('PENDING')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl shadow-amber-500/10 transition-all cursor-pointer ${
              selectedStatus === 'PENDING'
                ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/40'
                : 'border-amber-500/40 bg-[#0f172a] hover:border-amber-400/80'
            } [html.light_&]:border-amber-500/40 [html.light_&]:bg-amber-50/70 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-amber-300 [html.light_&]:text-amber-800">Chờ duyệt</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-amber-400 tracking-tight [html.light_&]:text-amber-600">{counts.pending}</p>
          </div>

          {/* Card 3: Đã duyệt */}
          <div
            onClick={() => setSelectedStatus('APPROVED')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl shadow-blue-500/10 transition-all cursor-pointer ${
              selectedStatus === 'APPROVED'
                ? 'border-blue-400 bg-blue-500/15 ring-2 ring-blue-400/40'
                : 'border-blue-500/40 bg-[#0f172a] hover:border-blue-400/80'
            } [html.light_&]:border-blue-500/40 [html.light_&]:bg-blue-50/70 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-blue-300 [html.light_&]:text-blue-800">Đã duyệt</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-blue-400 tracking-tight [html.light_&]:text-blue-600">{counts.approved}</p>
          </div>

          {/* Card 4: Đang xử lý */}
          <div
            onClick={() => setSelectedStatus('PROCESSING')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl shadow-orange-500/10 transition-all cursor-pointer ${
              selectedStatus === 'PROCESSING'
                ? 'border-orange-400 bg-orange-500/15 ring-2 ring-orange-400/40'
                : 'border-orange-500/40 bg-[#0f172a] hover:border-orange-400/80'
            } [html.light_&]:border-orange-500/40 [html.light_&]:bg-orange-50/70 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-orange-300 [html.light_&]:text-orange-800">Đang xử lý</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-orange-400 tracking-tight [html.light_&]:text-orange-600">{counts.processing}</p>
          </div>

          {/* Card 5: Đã hoàn tiền (Xanh lá) */}
          <div
            onClick={() => setSelectedStatus('REFUNDED')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl shadow-emerald-500/10 transition-all cursor-pointer ${
              selectedStatus === 'REFUNDED'
                ? 'border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/40'
                : 'border-emerald-500/40 bg-[#0f172a] hover:border-emerald-400/80'
            } [html.light_&]:border-emerald-500/40 [html.light_&]:bg-emerald-50/70 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-emerald-300 [html.light_&]:text-emerald-800">Đã hoàn tiền</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight [html.light_&]:text-emerald-600">{counts.refunded}</p>
          </div>

          {/* Card 6: Khiếu nại (Đỏ / Rose) */}
          <div
            onClick={() => setSelectedStatus('DISPUTED')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl transition-all cursor-pointer ${
              selectedStatus === 'DISPUTED'
                ? 'border-rose-400 bg-rose-500/15 ring-2 ring-rose-400/40'
                : 'border-rose-500/35 bg-[#0f172a] hover:border-rose-400/80'
            } [html.light_&]:border-rose-400/40 [html.light_&]:bg-rose-50/70 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-rose-300 [html.light_&]:text-rose-800 flex items-center justify-between">
              <span>Khiếu nại</span>
              {counts.disputed > 0 && <span className="size-2 rounded-full bg-rose-500 animate-pulse" />}
            </p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-rose-400 tracking-tight [html.light_&]:text-rose-600">{counts.disputed}</p>
          </div>

          {/* Card 7: Từ chối */}
          <div
            onClick={() => setSelectedStatus('REJECTED')}
            className={`rounded-2xl border p-4 sm:p-5 shadow-xl shadow-rose-500/10 transition-all cursor-pointer ${
              selectedStatus === 'REJECTED'
                ? 'border-rose-400 bg-rose-500/15 ring-2 ring-rose-400/40'
                : 'border-rose-500/40 bg-[#0f172a] hover:border-rose-400/80'
            } [html.light_&]:border-rose-500/40 [html.light_&]:bg-rose-50/70 [html.light_&]:shadow-md`}
          >
            <p className="text-sm font-bold uppercase tracking-wider text-rose-300 [html.light_&]:text-rose-800">Từ chối</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-rose-400 tracking-tight [html.light_&]:text-rose-600">{counts.rejected}</p>
          </div>
        </div>

        {/* Filters and Search Bar - Unified Single Row */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 overflow-x-auto pb-1">
          {/* Left: Status Filter Pills (Compact, Single Row flex-nowrap) */}
          <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
            {STATUS_FILTERS.map((f) => {
              const isActive = selectedStatus === f.value
              const isDisputedPill = f.value === 'DISPUTED'
              return (
                <button
                  key={f.value}
                  onClick={() => setSelectedStatus(f.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? isDisputedPill
                        ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30 border border-rose-400'
                        : 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm shadow-[#C99A47]/30 border border-[#C99A47]'
                      : isDisputedPill && counts.disputed > 0
                        ? 'border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 [html.light_&]:bg-rose-50 [html.light_&]:text-rose-800 [html.light_&]:border-rose-300'
                        : 'border border-white/10 bg-[#151d34] text-slate-300 hover:bg-white/5 hover:text-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/85 [html.light_&]:text-[#1B365D] [html.light_&]:shadow-sm [html.light_&]:hover:bg-[#F5EBDD] [html.light_&]:hover:text-[#0D1B2A]'
                  }`}
                >
                  <span>{f.label}</span>
                  {isDisputedPill && counts.disputed > 0 && (
                    <span className="flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white [html.light_&]:bg-rose-600">
                      {counts.disputed}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right: Event Filter Select + Search Input */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Event Filter Select Dropdown (Cosmic UI) */}
            <CosmicSelect
              value={selectedEventId}
              onChange={setSelectedEventId}
              options={eventOptions}
              size="sm"
              minWidth="w-52 sm:w-60"
              icon={Calendar}
              placeholder="Chọn sự kiện..."
            />

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 [html.light_&]:text-[#1B365D]" />
              <input
                type="text"
                placeholder="Tìm mã vé, tên, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-44 sm:w-52 rounded-lg border border-white/15 bg-[#0d172e] py-1.5 pl-8 pr-3 text-xs font-normal text-white placeholder:text-white/40 focus:border-primary focus:outline-none [html.light_&]:border-[#C99A47]/35 [html.light_&]:bg-white/90 [html.light_&]:text-[#0D1B2A] [html.light_&]:placeholder:text-[#536b88] [html.light_&]:focus:border-[#C99A47] [html.light_&]:shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Bulk Action Bar (Hiển thị khi Organizer chọn ít nhất 1 yêu cầu) */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-gradient-to-r from-[#121c38] via-[#1a2952] to-[#121c38] p-4 text-white shadow-xl shadow-primary/10 [html.light_&]:border-[#C99A47]/50 [html.light_&]:bg-gradient-to-r [html.light_&]:from-amber-50 [html.light_&]:via-white [html.light_&]:to-amber-50 [html.light_&]:text-[#0D1B2A]">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-sm [html.light_&]:bg-[#C99A47]/20 [html.light_&]:text-[#C99A47]">
                {selectedIds.length}
              </span>
              <div>
                <p className="font-bold text-sm text-white [html.light_&]:text-[#0D1B2A]">
                  Đã chọn {selectedIds.length} yêu cầu hoàn vé
                </p>
                <p className="text-xs text-amber-300 font-mono font-bold [html.light_&]:text-amber-700">
                  Tổng số tiền hoàn: {formatCurrency(selectedTotalAmount)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBatchModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 transition cursor-pointer"
              >
                <Zap className="size-4 fill-slate-950" />
                Hoàn tiền tự động qua PayOS
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 transition cursor-pointer [html.light_&]:border-slate-300 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700"
              >
                Bỏ chọn
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#121b33] [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/95 [html.light_&]:shadow-md">
          {refundsQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400 [html.light_&]:text-[#536b88]">Đang tải danh sách yêu cầu hoàn vé...</div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center">
              <RotateCcw className="mx-auto size-12 text-slate-600 [html.light_&]:text-[#C99A47]/60" />
              <p className="mt-3 text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">Không tìm thấy yêu cầu hoàn vé nào</p>
              <p className="mt-1 text-xs text-slate-400 [html.light_&]:text-[#536b88]">Tất cả các yêu cầu theo bộ lọc sẽ được hiển thị tại đây.</p>
            </div>
          ) : (
            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-xl">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white [html.light_&]:border-b-[#C99A47]/20 [html.light_&]:bg-[#F5EBDD]/70 [html.light_&]:text-[#1B365D]">
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          disabled={actionableItems.length === 0}
                          className="size-4 rounded border-white/30 bg-white/10 text-primary focus:ring-0 cursor-pointer disabled:opacity-30"
                          title="Chọn tất cả các yêu cầu đang hiển thị để xử lý hàng loạt"
                        />
                      </th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap">Mã YC / Ngày</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap">Sự kiện</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap">Vé / Người mua</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap">Số tiền hoàn</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap">Lý do</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap !text-left" style={{ textAlign: 'left' }}>Trạng thái</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white [html.light_&]:text-[#1B365D] whitespace-nowrap text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-300 [html.light_&]:divide-slate-200 [html.light_&]:text-[#1B365D]">
                    {filteredList.map((item) => {
                      const isActionable = ['PENDING', 'APPROVED', 'PROCESSING', 'FAILED'].includes(item.status)
                      const isSelected = selectedIds.includes(item.id)
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-white/[0.02] [html.light_&]:hover:bg-[#F5EBDD]/40 transition ${
                            isSelected ? 'bg-amber-500/10 [html.light_&]:bg-[#C99A47]/15' : ''
                          }`}
                        >
                          <td className="px-3 py-3 text-center">
                            {isActionable ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectItem(item.id)}
                                className="size-4 rounded border-white/30 bg-white/10 text-primary focus:ring-0 cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-600 text-xs select-none">-</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3">
                            <p className="font-mono text-sm font-bold text-primary [html.light_&]:text-[#C99A47]">#{item.id.slice(0, 8)}</p>
                            <p className="text-xs text-slate-400 [html.light_&]:text-[#536b88] mt-0.5">{formatDateTime(item.created_at)}</p>
                          </td>
                          <td className="max-w-[180px] px-3.5 py-3">
                            <p className="truncate font-bold text-white text-sm [html.light_&]:text-[#0D1B2A]" title={item.event?.title}>
                              {item.event?.title || 'N/A'}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3">
                            <p className="font-mono text-sm font-semibold text-slate-200 [html.light_&]:text-[#0D1B2A]">{item.ticket?.ticket_code || item.order?.order_code}</p>
                            <p className="text-xs text-slate-400 [html.light_&]:text-[#536b88] mt-0.5">
                              {item.customer?.full_name || item.order?.buyer_name || 'Khách hàng'}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 font-mono text-sm font-bold text-amber-400 [html.light_&]:text-[#b45309]">
                            {formatCurrency(item.refund_amount)}
                          </td>
                          <td className="max-w-[200px] px-3.5 py-3">
                            <p className="line-clamp-2 text-slate-300 text-sm [html.light_&]:text-[#1B365D]" title={item.reason}>
                              {item.reason}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 !text-left" style={{ textAlign: 'left' }}>
                            <div className="flex items-center justify-start text-left">
                              {getStatusBadge(item.status, item.disputed)}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <div className="flex items-center justify-center">
                              <TableActionButton
                                icon={Eye}
                                tone={item.status === 'PENDING' ? 'primary' : 'default'}
                                title={item.status === 'PENDING' ? 'Xử lý yêu cầu hoàn tiền' : 'Xem chi tiết'}
                                onClick={() => navigate(`/organizer/refunds/${item.id}`)}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Xử lý hàng loạt (Batch Process Modal) */}
        {batchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f172a] p-6 shadow-2xl text-white [html.light_&]:border-slate-200 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Zap className="size-5 text-amber-400 fill-amber-400" />
                Xử lý hoàn tiền tự động qua PayOS
              </h3>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-xs [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 [html.light_&]:text-slate-600">Số lượng yêu cầu chọn:</span>
                  <span className="font-bold text-white [html.light_&]:text-[#0D1B2A]">{selectedIds.length} yêu cầu</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 [html.light_&]:text-slate-600">Tổng tiền hoàn trả:</span>
                  <span className="font-mono font-bold text-amber-400 text-sm [html.light_&]:text-amber-700">{formatCurrency(selectedTotalAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 [html.light_&]:text-slate-600">Phương thức:</span>
                  <span className="font-semibold text-amber-300 [html.light_&]:text-amber-800">
                    Cổng thanh toán PayOS (Tự động chi tiền)
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-200 [html.light_&]:border-amber-600/30 [html.light_&]:bg-amber-50 [html.light_&]:text-amber-900 leading-relaxed space-y-1.5">
                <p>
                  <strong>Cơ chế tự động:</strong> Hệ thống sẽ gọi API Kênh chi PayOS để chuyển tiền trực tiếp về tài khoản ngân hàng của từng khách hàng và cập nhật đơn thành công.
                </p>
                <p className="text-[11px] opacity-90">
                  * Nếu tài khoản PayOS chưa kết nối dịch vụ Chi hộ, vui lòng mở chi tiết từng yêu cầu để thực hiện <strong>Chuyển khoản thủ công</strong> và tải lên ảnh biên lai đối soát theo đúng quy định.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isProcessingBatch}
                  onClick={() => setBatchModalOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition cursor-pointer [html.light_&]:border-slate-300 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-slate-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isProcessingBatch}
                  onClick={handleExecuteBatch}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-bold text-slate-950 hover:brightness-110 shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessingBatch ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Đang hoàn tiền {selectedIds.length} yêu cầu...
                    </>
                  ) : (
                    <>
                      <Zap className="size-4 fill-slate-950" />
                      Xác nhận hoàn tiền qua PayOS
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OrganizerPage>
  )
}
