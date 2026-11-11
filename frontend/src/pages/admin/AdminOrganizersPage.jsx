import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAdminOrganizers,
  updateAdminOrganizerStatus,
} from '@/services/adminOrganizers.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, KpiGrid, Page, Panel, Status, Table, TableActionButton, UserCell } from './AdminComponents.jsx'
import { ConfirmSuspendOrganizerModal } from './ConfirmSuspendOrganizerModal.jsx'
import { CosmicSelect } from '@/components/CosmicSelect.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

export function AdminOrganizersPage() {
  const { isEnglish, t } = useLanguage()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusConfirmTarget, setStatusConfirmTarget] = useState(null)
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
          ? (isEnglish ? 'Organizer reactivated.' : 'Đã kích hoạt lại ban tổ chức.')
          : (isEnglish ? 'Organizer suspended. Active sessions have been refreshed.' : 'Đã tạm ngưng ban tổ chức. Các phiên đăng nhập hiện tại đã được làm mới.'),
      )
      setStatusConfirmTarget(null)
      queryClient.invalidateQueries({ queryKey: ['admin-organizers'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to update organizer status.' : 'Không thể cập nhật trạng thái ban tổ chức.'))
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
    setStatusConfirmTarget({ organizer, targetStatus: nextStatus })
  }

  const handleConfirmStatusChange = () => {
    if (!statusConfirmTarget) return
    statusMutation.mutate({
      id: statusConfirmTarget.organizer.id,
      status: statusConfirmTarget.targetStatus,
    })
  }

  return (
    <Page
      title={isEnglish ? 'Organizer Management' : 'Quản lý Ban tổ chức'}
    >
      <KpiGrid
        items={[
          [isEnglish ? 'Total Organizers' : 'Tổng ban tổ chức', stats.total || 0, ''],
          [isEnglish ? 'Active' : 'Đang hoạt động', stats.active || 0, ''],
          [isEnglish ? 'Suspended' : 'Tạm ngưng', stats.suspended || 0, Number(stats.suspended || 0) > 0 ? (isEnglish ? 'Urgent' : 'Cần xử lý') : ''],
          [isEnglish ? 'Public Events' : 'Có sự kiện public', stats.has_published_events || 0, ''],
        ]}
      />

      <div className="my-6 flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            placeholder={isEnglish ? 'Search by name, email, owner...' : 'Tìm theo tên, email, người sở hữu...'}
            className="h-10 w-full rounded-xl border border-white/15 bg-[#0d172e] pl-10 pr-3 text-sm font-normal text-white outline-none transition placeholder:text-white/50 focus:border-[#C99A47] focus:ring-2 focus:ring-[#C99A47]/10"
          />
        </div>

        <CosmicSelect
          value={filters.status}
          onChange={(val) => updateFilter({ status: val })}
          options={[
            { value: '', label: isEnglish ? 'All statuses' : 'Mọi trạng thái' },
            { value: 'ACTIVE', label: isEnglish ? 'Active' : 'Hoạt động' },
            { value: 'SUSPENDED', label: isEnglish ? 'Suspended' : 'Tạm ngưng' },
          ]}
          minWidth="min-w-[150px]"
        />

        <CosmicSelect
          value={filters.sortBy}
          onChange={(val) => updateFilter({ sortBy: val })}
          options={[
            { value: 'created_at', label: isEnglish ? 'Newest' : 'Mới nhất' },
            { value: 'organization_name', label: isEnglish ? 'Organizer Name' : 'Tên ban tổ chức' },
            { value: 'gross_revenue', label: isEnglish ? 'Revenue' : 'Doanh thu' },
            { value: 'total_events', label: isEnglish ? 'Total events' : 'Số sự kiện' },
          ]}
          minWidth="min-w-[160px]"
        />

        <button
          type="button"
          onClick={resetFilters}
          title={isEnglish ? 'Reset filter' : 'Đặt lại bộ lọc'}
          aria-label={isEnglish ? 'Reset' : 'Đặt lại'}
          className="grid size-10 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:border-[#C99A47] hover:text-[#C99A47]"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>

      {organizersQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-subtle">{isEnglish ? 'Loading organizers list...' : 'Đang tải danh sách ban tổ chức...'}</p>
        </Panel>
      ) : organizersQuery.isError ? (
        <Panel>
          <p className="text-sm text-error">{isEnglish ? 'Failed to load organizers list. Please try again.' : 'Không thể tải danh sách ban tổ chức. Vui lòng thử lại.'}</p>
        </Panel>
      ) : (
        <Table
          headers={[
            isEnglish ? 'Organizer' : 'Ban tổ chức',
            isEnglish ? 'Owner' : 'Người sở hữu',
            { label: isEnglish ? 'Current Plan' : 'Gói hiện tại', align: 'center' },
            isEnglish ? 'Performance' : 'Hiệu suất',
            isEnglish ? 'Status' : 'Trạng thái',
            isEnglish ? 'Actions' : 'Thao tác',
          ]}
          rows={organizers.map((organizer) => [
            <div key="organizer" className="min-w-[220px]">
              <button
                type="button"
                onClick={() => navigate(`/admin/organizers/${organizer.id}`)}
                className="text-left font-bold text-content transition hover:text-tertiary"
              >
                {organizer.organization_name}
              </button>
              <p className="mt-1 text-xs text-subtle">{organizer.business_email || (isEnglish ? 'No business email' : 'Chưa có email doanh nghiệp')}</p>
              <p className="text-xs text-subtle">{organizer.business_phone || (isEnglish ? 'No phone number' : 'Chưa có số điện thoại')}</p>
            </div>,
            <UserCell
              key="owner"
              name={organizer.owner_name || organizer.owner_email}
              email={organizer.owner_email}
              image={organizer.owner_avatar_url}
            />,
            <div key="plan" className="flex flex-col items-center justify-center gap-1 text-center">
              {organizer.plan_name ? (
                <>
                  <Badge tone={getPlanTone(organizer.plan_name)}>
                    {formatPlanName(organizer.plan_name, isEnglish)}
                  </Badge>
                  {organizer.plan_end_date && (
                    <span className="text-[11px] font-medium text-subtle">
                      {isEnglish ? 'Expires' : 'Hết hạn'} {formatDate(organizer.plan_end_date)}
                    </span>
                  )}
                </>
              ) : (
                <Badge tone="gray">{isEnglish ? 'No plan' : 'Chưa có gói'}</Badge>
              )}
            </div>,
            <div key="performance" className="space-y-1 text-sm">
              <p><span className="font-bold text-content">{organizer.total_events}</span> {isEnglish ? 'events' : 'sự kiện'}</p>
              <p><span className="font-bold text-success">{formatCurrency(organizer.gross_revenue)}</span></p>
            </div>,
            <Status key="status" value={organizer.status} />,
            <div key="actions" className="flex items-center justify-center gap-2">
              <TableActionButton
                icon={Eye}
                tone="default"
                title={isEnglish ? 'View details' : 'Xem chi tiết'}
                onClick={() => navigate(`/admin/organizers/${organizer.id}`)}
              />
              <TableActionButton
                icon={organizer.status === 'ACTIVE' ? AlertTriangle : ShieldCheck}
                tone={organizer.status === 'ACTIVE' ? 'danger' : 'success'}
                disabled={statusMutation.isPending}
                title={organizer.status === 'ACTIVE' ? (isEnglish ? 'Suspend organizer' : 'Tạm ngưng ban tổ chức') : (isEnglish ? 'Activate organizer' : 'Kích hoạt ban tổ chức')}
                onClick={() => handleToggleStatus(organizer)}
              />
            </div>,
          ])}
        />
      )}

      {!organizersQuery.isLoading && organizers.length === 0 && (
        <Panel className="mt-4">
          <p className="text-sm text-subtle">{isEnglish ? 'No organizers match the current filter.' : 'Chưa có ban tổ chức nào phù hợp với bộ lọc hiện tại.'}</p>
        </Panel>
      )}

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm font-medium text-subtle">
          {isEnglish ? (
            <>Showing <span className="font-bold">{startItem}</span> to <span className="font-bold">{endItem}</span> of <span className="font-bold">{total}</span> organizers</>
          ) : (
            <>Hiển thị <span className="font-bold">{startItem}</span> đến <span className="font-bold">{endItem}</span> trong tổng số <span className="font-bold">{total}</span> ban tổ chức</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filters.page === 1}
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
            className="grid h-9 min-w-9 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:border-[#C99A47] hover:text-[#C99A47] disabled:cursor-not-allowed disabled:opacity-40"
            title={isEnglish ? 'Previous page' : 'Trang trước'}
            aria-label={isEnglish ? 'Previous page' : 'Trang trước'}
          >
            <ChevronLeft className="size-4" />
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
                    ? 'border-[#E6C17A]/40 bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-black shadow-md shadow-[#C99A47]/30'
                    : 'border-border-soft/40 bg-panel-soft text-subtle hover:border-[#C99A47]/60 hover:text-[#E6C17A]'
                }`}
                aria-current={item === filters.page ? 'page' : undefined}
              >
                {item}
              </button>
            )
          ))}
          <button
            type="button"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            className="grid h-9 min-w-9 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:border-[#C99A47] hover:text-[#C99A47] disabled:cursor-not-allowed disabled:opacity-40"
            title={isEnglish ? 'Next page' : 'Trang sau'}
            aria-label={isEnglish ? 'Next page' : 'Trang sau'}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <ConfirmSuspendOrganizerModal
        open={Boolean(statusConfirmTarget)}
        organizer={statusConfirmTarget?.organizer}
        targetStatus={statusConfirmTarget?.targetStatus}
        isPending={statusMutation.isPending}
        onClose={() => setStatusConfirmTarget(null)}
        onConfirm={handleConfirmStatusChange}
      />
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

function formatPlanName(name, isEnglish) {
  if (!name) return ''
  if (!isEnglish) return name
  const lower = String(name).toLowerCase()
  if (lower.includes('doanh nghiệp') || lower === 'enterprise') return 'Enterprise'
  if (lower.includes('chuyên nghiệp') || lower === 'professional' || lower === 'pro') return 'Professional'
  if (lower.includes('khởi nghiệp') || lower === 'starter' || lower === 'startup') return 'Starter'
  return name
}

function getPlanTone(planName) {
  if (!planName) return 'gray'
  const name = String(planName).toLowerCase()
  if (name.includes('doanh nghiệp') || name.includes('enterprise') || name.includes('vip')) return 'primary'
  if (name.includes('chuyên nghiệp') || name.includes('pro')) return 'indigo'
  if (name.includes('khởi nghiệp') || name.includes('starter') || name.includes('cơ bản')) return 'blue'
  return 'blue'
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  })
}

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

function formatDate(value) {
  const isEn = getAutoLocale() === 'en-US'
  if (!value) return isEn ? 'N/A' : 'Chưa có'
  return new Date(value).toLocaleDateString(getAutoLocale())
}
