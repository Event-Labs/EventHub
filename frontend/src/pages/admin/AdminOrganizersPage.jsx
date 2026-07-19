import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Eye, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAdminOrganizers,
  updateAdminOrganizerStatus,
} from '@/services/adminOrganizers.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, KpiGrid, Page, Panel, Status, Table, UserCell } from './AdminComponents.jsx'

export function AdminOrganizersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    page: 1,
    limit: 10,
    sortBy: 'created_at',
    sortOrder: 'DESC',
  })

  const organizersQuery = useQuery({
    queryKey: ['admin-organizers', filters],
    queryFn: () => fetchAdminOrganizers(filters),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateAdminOrganizerStatus(id, status),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === 'ACTIVE'
          ? 'Đã kích hoạt lại organizer.'
          : 'Đã tạm ngưng organizer. Các phiên đăng nhập hiện tại đã được làm mới.',
      )
      queryClient.invalidateQueries({ queryKey: ['admin-organizers'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật trạng thái organizer.'))
    },
  })

  const data = organizersQuery.data || {}
  const organizers = data.organizers || []
  const stats = data.stats || {}
  const total = data.total || 0
  const totalPages = Math.max(1, Math.ceil(total / filters.limit))
  const startItem = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1
  const endItem = Math.min(filters.page * filters.limit, total)
  const pageItems = useMemo(() => getPageItems(filters.page, totalPages), [filters.page, totalPages])

  const updateFilter = (updates) => {
    setFilters((prev) => ({ ...prev, ...updates, page: updates.page || 1 }))
  }

  const resetFilters = () => {
    setFilters({
      search: '',
      status: '',
      page: 1,
      limit: 10,
      sortBy: 'created_at',
      sortOrder: 'DESC',
    })
  }

  const handleToggleStatus = (organizer) => {
    const nextStatus = organizer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    statusMutation.mutate({ id: organizer.id, status: nextStatus })
  }

  return (
    <Page
      title="Quản lý Organizer"
      description="Theo dõi hồ sơ nhà tổ chức, gói dịch vụ, hiệu suất sự kiện và trạng thái hoạt động."
    >
      <KpiGrid
        items={[
          ['Tổng organizer', stats.total || 0, ''],
          ['Đang hoạt động', stats.active || 0, ''],
          ['Tạm ngưng', stats.suspended || 0, Number(stats.suspended || 0) > 0 ? 'Urgent' : ''],
          ['Có sự kiện public', stats.has_published_events || 0, ''],
        ]}
      />

      <Panel className="my-6 flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            placeholder="Tìm theo tên, email, người sở hữu..."
            className="h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft pl-10 pr-3 text-sm text-content outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>

        <select
          value={filters.status}
          onChange={(e) => updateFilter({ status: e.target.value })}
          className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none transition hover:border-tertiary focus:border-primary focus:ring-2 focus:ring-primary/10"
        >
          <option value="" className="bg-surface text-content">Mọi trạng thái</option>
          <option value="ACTIVE" className="bg-surface text-content">Hoạt động</option>
          <option value="SUSPENDED" className="bg-surface text-content">Tạm ngưng</option>
        </select>

        <select
          value={filters.sortBy}
          onChange={(e) => updateFilter({ sortBy: e.target.value })}
          className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content outline-none transition hover:border-tertiary focus:border-primary focus:ring-2 focus:ring-primary/10"
        >
          <option value="created_at" className="bg-surface text-content">Mới nhất</option>
          <option value="organization_name" className="bg-surface text-content">Tên organizer</option>
          <option value="gross_revenue" className="bg-surface text-content">Doanh thu</option>
          <option value="total_events" className="bg-surface text-content">Số sự kiện</option>
        </select>

        <button
          type="button"
          onClick={resetFilters}
          className="flex items-center gap-1 text-sm font-bold text-subtle transition hover:text-tertiary"
        >
          <RotateCcw className="size-3" /> Đặt lại
        </button>
      </Panel>

      {organizersQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-subtle">Đang tải danh sách organizer...</p>
        </Panel>
      ) : organizersQuery.isError ? (
        <Panel>
          <p className="text-sm text-error">Không thể tải danh sách organizer. Vui lòng thử lại.</p>
        </Panel>
      ) : (
        <Table
          headers={['Organizer', 'Người sở hữu', 'Gói hiện tại', 'Hiệu suất', 'Trạng thái', 'Thao tác']}
          rows={organizers.map((organizer) => [
            <div key="organizer" className="min-w-[220px]">
              <button
                type="button"
                onClick={() => navigate(`/admin/organizers/${organizer.id}`)}
                className="text-left font-bold text-content transition hover:text-tertiary"
              >
                {organizer.organization_name}
              </button>
              <p className="mt-1 text-xs text-subtle">{organizer.business_email || 'Chưa có email doanh nghiệp'}</p>
              <p className="text-xs text-subtle">{organizer.business_phone || 'Chưa có số điện thoại'}</p>
            </div>,
            <UserCell
              key="owner"
              name={organizer.owner_name || organizer.owner_email}
              email={organizer.owner_email}
              image={organizer.owner_avatar_url}
            />,
            <div key="plan">
              {organizer.plan_name ? (
                <>
                  <p className="font-bold text-content">{organizer.plan_name}</p>
                  <p className="text-xs text-subtle">Hết hạn {formatDate(organizer.plan_end_date)}</p>
                </>
              ) : (
                <Badge tone="gray">Chưa có gói</Badge>
              )}
            </div>,
            <div key="performance" className="space-y-1 text-sm">
              <p><span className="font-bold text-content">{organizer.total_events}</span> sự kiện</p>
              <p><span className="font-bold text-success">{formatCurrency(organizer.gross_revenue)}</span></p>
            </div>,
            <Status key="status" value={organizer.status} />,
            <div key="actions" className="flex items-center gap-3 text-subtle">
              <button
                type="button"
                onClick={() => navigate(`/admin/organizers/${organizer.id}`)}
                title="Xem chi tiết"
                className="grid size-9 place-items-center rounded-full text-white transition hover:-translate-y-0.5 hover:bg-white/15"
              >
                <Eye className="size-5" />
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => handleToggleStatus(organizer)}
                title={organizer.status === 'ACTIVE' ? 'Tạm ngưng organizer' : 'Kích hoạt organizer'}
                className={`grid size-9 place-items-center rounded-full transition hover:-translate-y-0.5 disabled:opacity-50 ${
                  organizer.status === 'ACTIVE'
                    ? 'text-error hover:bg-error/20'
                    : 'text-success hover:bg-success/20'
                }`}
              >
                {organizer.status === 'ACTIVE' ? <AlertTriangle className="size-5" /> : <ShieldCheck className="size-5" />}
              </button>
            </div>,
          ])}
        />
      )}

      {!organizersQuery.isLoading && organizers.length === 0 && (
        <Panel className="mt-4">
          <p className="text-sm text-subtle">Chưa có organizer nào phù hợp với bộ lọc hiện tại.</p>
        </Panel>
      )}

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm font-medium text-subtle">
          Hiển thị <span className="font-bold">{startItem}</span> đến <span className="font-bold">{endItem}</span> trong tổng số <span className="font-bold">{total}</span> organizer
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={filters.page === 1}
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
            className="admin-secondary px-4 py-2 text-xs disabled:opacity-50"
          >
            Trước
          </button>
          {pageItems.map((item, index) => (
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-sm font-bold text-subtle">...</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, page: item }))}
                className={`grid h-9 min-w-9 place-items-center rounded-xl border px-3 text-xs font-extrabold transition ${
                  item === filters.page
                    ? 'border-tertiary bg-tertiary text-white'
                    : 'border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:text-tertiary'
                }`}
              >
                {item}
              </button>
            )
          ))}
          <button
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            className="admin-secondary px-4 py-2 text-xs disabled:opacity-50"
          >
            Sau
          </button>
        </div>
      </div>

    </Page>
  )
}

function getPageItems(currentPage, totalPages) {
  const pages = new Set([1, totalPages])
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page)
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b)
  return sortedPages.flatMap((page, index) => {
    const previousPage = sortedPages[index - 1]
    if (index > 0 && page - previousPage > 1) {
      return ['ellipsis', page]
    }
    return [page]
  })
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  })
}

function formatDate(value) {
  if (!value) return 'Chưa có'
  return new Date(value).toLocaleDateString('vi-VN')
}
