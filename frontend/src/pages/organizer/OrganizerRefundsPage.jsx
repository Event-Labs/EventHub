import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  CheckCircle,
  Filter,
  Hourglass,
  RotateCcw,
  Search,
  XCircle,
  Eye,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
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

const STATUS_FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'REJECTED', label: 'Từ chối' },
]

export function OrganizerRefundsPage() {
  const navigate = useNavigate()
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

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
                          onClick={() => navigate(`/organizer/refunds/${item.id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#1c2747] px-3 py-1.5 text-xs font-bold text-white transition hover:border-primary hover:text-primary"
                        >
                          Xử lý
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/organizer/refunds/${item.id}`)}
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
    </div>
  )
}
