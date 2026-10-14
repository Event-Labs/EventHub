import { useQuery } from '@tanstack/react-query'
import {
  RotateCcw,
  Search,
  Eye,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrganizerPage, StatusBadge, TableActionButton } from './OrganizerComponents.jsx'
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Card 1: Tổng yêu cầu */}
          <div className="rounded-2xl border border-white/15 bg-[#0f172a] p-4 sm:p-5 shadow-xl transition-all [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/90 [html.light_&]:shadow-md">
            <p className="text-sm font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">Tổng yêu cầu</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight [html.light_&]:text-[#0D1B2A]">{counts.all}</p>
          </div>

          {/* Card 2: Cần xử lý (Chờ duyệt) */}
          <div className="rounded-2xl border border-amber-500/40 bg-[#0f172a] p-4 sm:p-5 shadow-xl shadow-amber-500/10 transition-all [html.light_&]:border-amber-500/40 [html.light_&]:bg-amber-50/70 [html.light_&]:shadow-md">
            <p className="text-sm font-bold uppercase tracking-wider text-amber-300 [html.light_&]:text-amber-800">Cần xử lý (Chờ duyệt)</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-amber-400 tracking-tight [html.light_&]:text-amber-600">{counts.pending}</p>
          </div>

          {/* Card 3: Đã hoàn tiền (Xanh lá) */}
          <div className="rounded-2xl border border-emerald-500/40 bg-[#0f172a] p-4 sm:p-5 shadow-xl shadow-emerald-500/10 transition-all [html.light_&]:border-emerald-500/40 [html.light_&]:bg-emerald-50/70 [html.light_&]:shadow-md">
            <p className="text-sm font-bold uppercase tracking-wider text-emerald-300 [html.light_&]:text-emerald-800">Đã hoàn tiền</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight [html.light_&]:text-emerald-600">{counts.refunded}</p>
          </div>

          {/* Card 4: Từ chối */}
          <div className="rounded-2xl border border-rose-500/40 bg-[#0f172a] p-4 sm:p-5 shadow-xl shadow-rose-500/10 transition-all [html.light_&]:border-rose-500/40 [html.light_&]:bg-rose-50/70 [html.light_&]:shadow-md">
            <p className="text-sm font-bold uppercase tracking-wider text-rose-300 [html.light_&]:text-rose-800">Từ chối</p>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black text-rose-400 tracking-tight [html.light_&]:text-rose-600">{counts.rejected}</p>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setSelectedStatus(f.value)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${selectedStatus === f.value
                  ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 border border-[#C99A47]'
                  : 'border border-white/10 bg-[#151d34] text-slate-300 hover:bg-white/5 hover:text-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/85 [html.light_&]:text-[#1B365D] [html.light_&]:shadow-sm [html.light_&]:hover:bg-[#F5EBDD] [html.light_&]:hover:text-[#0D1B2A] [html.light_&]:hover:border-[#C99A47]'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white [html.light_&]:text-[#1B365D]" />
            <input
              type="text"
              placeholder="Tìm theo mã vé, tên, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-[#0d172e] py-2 pl-9 pr-4 text-xs font-normal text-white placeholder:text-white/50 focus:border-primary focus:outline-none [html.light_&]:border-[#C99A47]/35 [html.light_&]:bg-white/90 [html.light_&]:text-[#0D1B2A] [html.light_&]:placeholder:text-[#536b88] [html.light_&]:focus:border-[#C99A47] [html.light_&]:shadow-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#121b33]">
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
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-[#172242] text-xs font-bold uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Mã YC / Ngày</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Sự kiện</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Vé / Người mua</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Số tiền hoàn</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Lý do</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap">Trạng thái</th>
                      <th className="px-3.5 py-3 font-bold uppercase tracking-wider text-white whitespace-nowrap text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                    {filteredList.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.02]">
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
                        <td className="whitespace-nowrap px-3.5 py-3">
                          {getStatusBadge(item.status)}
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </OrganizerPage>
  )
}
