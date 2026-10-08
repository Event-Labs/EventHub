import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, Clock, Eye, Layers, XCircle } from 'lucide-react'
import { useState } from 'react'
import {
  fetchAdminOrganizerRequests,
  reviewOrganizerRequest,
} from '@/services/organizerRequests.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, Page, Panel, StatusBadge, Table, TableActionButton } from './AdminComponents.jsx'


const statusFilters = [
  { label: 'Tất cả', value: '' },
  { label: 'Chờ duyệt', value: 'PENDING' },
  { label: 'Đã duyệt', value: 'APPROVED' },
  { label: 'Từ chối', value: 'REJECTED' },
]

const requestTypeFilters = [
  { label: 'Tất cả loại', value: '' },
  { label: 'Cá nhân', value: 'INDIVIDUAL' },
  { label: 'Tổ chức', value: 'ORGANIZATION' },
]

function statusTone(status) {
  if (status === 'APPROVED') return 'green'
  if (status === 'REJECTED') return 'red'
  return 'amber'
}

function statusLabel(status) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'REJECTED') return 'Từ chối'
  return 'Chờ duyệt'
}

function requestTypeLabel(type) {
  return type === 'ORGANIZATION' ? 'Tổ chức' : 'Cá nhân'
}

function requestActionLabel(action) {
  return String(action || 'APPLICATION').toUpperCase() === 'PROFILE_UPDATE'
    ? 'Cập nhật hồ sơ'
    : 'Đăng ký organizer'
}

export function AdminOrganizerRequestsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [requestTypeFilter, setRequestTypeFilter] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewError, setReviewError] = useState('')
  const statusFilterLabel = statusFilters.find((filter) => filter.value === statusFilter)?.label || 'Tất cả'
  const requestTypeFilterLabel = requestTypeFilters.find((filter) => filter.value === requestTypeFilter)?.label || 'Tất cả loại'

  const requestsQuery = useQuery({
    queryKey: ['admin-organizer-requests', statusFilter, requestTypeFilter],
    queryFn: () =>
      fetchAdminOrganizerRequests({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(requestTypeFilter ? { request_type: requestTypeFilter } : {}),
      }),
  })

  const pendingCountQuery = useQuery({
    queryKey: ['admin-organizer-requests', 'PENDING'],
    queryFn: () => fetchAdminOrganizerRequests({ status: 'PENDING' }),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }) => reviewOrganizerRequest(id, payload),
    onSuccess: (_data, variables) => {
      toast.success(variables?.payload?.status === 'APPROVED' ? 'Đã duyệt yêu cầu organizer.' : 'Đã từ chối yêu cầu organizer.')
      setSelectedRequest(null)
      setReviewNote('')
      setReviewError('')
      queryClient.invalidateQueries({ queryKey: ['admin-organizer-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-organizer-requests', 'PENDING'] })
    },
    onError: (err) => {
      const apiError = err.response?.data
      let message
      if (apiError?.errors && Array.isArray(apiError.errors)) {
        message = apiError.errors.map((item) => item.message).join(', ')
      } else {
        message = getApiMessage(err, 'Không thể xử lý yêu cầu.')
      }
      setReviewError(message)
      toast.error(message)
    },
  })

  const requests = requestsQuery.data || []
  const pendingCount = (pendingCountQuery.data || []).length

  const openReview = (request) => {
    setSelectedRequest(request)
    setReviewNote(request.review_note || '')
    setReviewError('')
  }

  const submitReview = (status) => {
    if (!selectedRequest) return
    if (
      status === 'APPROVED' &&
      selectedRequest.request_type === 'ORGANIZATION' &&
      selectedRequest.request_action !== 'PROFILE_UPDATE' &&
      !selectedRequest.business_email_verified
    ) {
      const message = 'Email tổ chức chưa được xác thực. Chưa thể duyệt yêu cầu này.'
      setReviewError(message)
      toast.error(message)
      return
    }

    reviewMutation.mutate({
      id: selectedRequest.id,
      payload: {
        status,
        review_note: reviewNote.trim() || null,
      },
    })
  }

  return (
    <Page
      title="Yêu cầu Organizer"
      description="Kiểm tra hồ sơ đăng ký và phê duyệt yêu cầu nâng quyền"
    >
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <FilterGroup
          label="Trạng thái"
          filters={statusFilters}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterGroup
          label="Loại đăng ký"
          filters={requestTypeFilters}
          value={requestTypeFilter}
          onChange={setRequestTypeFilter}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Clock}
          label="Hàng đợi chờ duyệt"
          value={pendingCountQuery.isLoading ? '...' : pendingCount}
          accentBg="bg-warning/15"
          accentColor="text-warning"
          sub="Cần xử lý"
        />
        <MetricCard
          icon={Layers}
          label="Đang hiển thị"
          value={requestsQuery.isLoading ? '...' : requests.length}
          accentBg="bg-primary/15"
          accentColor="text-primary"
          sub="Tổng số trong bộ lọc"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Trạng thái hiện tại"
          value={statusFilterLabel}
          accentBg="bg-tertiary/15"
          accentColor="text-tertiary"
          sub="Bộ lọc trạng thái"
        />
        <MetricCard
          icon={Building2}
          label="Loại hiện tại"
          value={requestTypeFilterLabel}
          accentBg="bg-secondary/15"
          accentColor="text-secondary"
          sub="Bộ lọc loại đăng ký"
        />
      </div>

      {requestsQuery.isLoading && (
        <Panel>Đang tải danh sách yêu cầu...</Panel>
      )}

      {requestsQuery.isError && (
        <Panel className="text-error">Không thể tải danh sách yêu cầu.</Panel>
      )}

      {!requestsQuery.isLoading && !requestsQuery.isError && (
        <Table
          tableClassName="min-w-[900px]"
          headers={[
            'Tổ chức',
            'Loại',
            'Người gửi',
            'Liên hệ',
            'Trạng thái',
            'Ngày tạo/gửi',
            'Thao tác',
          ]}
          rows={requests.map((request) => [
            <div key="org">
              <p className="font-semibold text-content max-w-[150px] truncate" title={request.organization_name}>{request.organization_name}</p>
              <p className="line-clamp-1 text-xs text-subtle max-w-[150px]" title={request.organization_description}>
                {request.organization_description}
              </p>
            </div>,
            <Badge key="type" tone={request.request_type === 'ORGANIZATION' ? 'green' : 'blue'}>
              {requestActionLabel(request.request_action)} · {requestTypeLabel(request.request_type)}
            </Badge>,
            <div key="user">
              <p className="font-semibold text-content">{request.applicant?.full_name}</p>
              <p className="text-xs text-subtle max-w-[150px] truncate" title={request.applicant?.email}>{request.applicant?.email}</p>
            </div>,
            <div key="contact" className="text-sm">
              <p className="text-content font-medium max-w-[200px] truncate" title={request.business_email || request.applicant?.email}>
                {request.business_email || request.applicant?.email}
              </p>
              <p className="text-subtle text-xs mt-0.5">{request.business_phone}</p>
              {request.request_type === 'ORGANIZATION' && (
                <p
                  className={`mt-1 text-xs font-semibold ${
                    request.business_email_verified ? 'text-success' : 'text-warning'
                  }`}
                >
                  {request.business_email_verified ? 'Email đã xác thực' : 'Email chưa xác thực'}
                </p>
              )}
            </div>,
            <StatusBadge key="status" status={request.status} />,
            <span key="date" className="text-subtle font-medium">
              {new Date(request.created_at).toLocaleDateString('vi-VN')}
            </span>,
            <TableActionButton
              key="action"
              icon={Eye}
              tone="default"
              title="Xem chi tiết"
              aria-label={`Xem chi tiết yêu cầu ${request.organization_name}`}
              onClick={() => openReview(request)}
            />,
          ])}
        />
      )}

      {selectedRequest && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <Panel className="admin-review-modal-scroll max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto border-border-soft/60">
            {selectedRequest.organization_avatar_url && (
              <img
                src={selectedRequest.organization_avatar_url}
                alt={selectedRequest.organization_name}
                className="mb-4 size-20 rounded-xl border border-border-soft/40 object-cover"
              />
            )}
            <h3 className="font-display text-2xl font-extrabold text-content">
              {selectedRequest.organization_name}
            </h3>
            <p className="mt-1 text-sm text-subtle font-medium">
              {selectedRequest.applicant?.full_name} · {selectedRequest.applicant?.email}
            </p>
            <div className="mt-4 grid gap-3 rounded-xl border border-border-soft/30 bg-panel-soft p-4 text-sm sm:grid-cols-2">
              <Info label="Trạng thái" value={statusLabel(selectedRequest.status)} />
              <Info label="Nội dung yêu cầu" value={requestActionLabel(selectedRequest.request_action)} />
              <Info label="Loại đăng ký" value={requestTypeLabel(selectedRequest.request_type)} />
              <Info label="Số điện thoại" value={selectedRequest.business_phone} />
              <Info label="SĐT tài khoản" value={selectedRequest.applicant?.phone || 'Chưa cung cấp'} />
              <Info
                label="Email tổ chức"
                value={
                  selectedRequest.business_email
                    ? `${selectedRequest.business_email} · ${
                        selectedRequest.business_email_verified ? 'Đã xác thực' : 'Chưa xác thực'
                      }`
                    : 'Không áp dụng'
                }
              />
              <Info label="Mã số thuế" value={selectedRequest.tax_code || 'Không áp dụng'} />
              {selectedRequest.request_type === 'ORGANIZATION' ? (
                <>
                  <Info label="Người đại diện" value={selectedRequest.legal_representative_name || 'Chưa cung cấp'} />
                  <Info label="Chức vụ" value={selectedRequest.legal_representative_position || 'Chưa cung cấp'} />
                  <InfoDocument label="Giấy chứng nhận đăng ký doanh nghiệp" url={selectedRequest.legal_document_url} />
                  <InfoDocument label="Giấy phép đặc thù" url={selectedRequest.business_license_url} />
                  <InfoDocument label="Giấy tờ người đại diện" url={selectedRequest.legal_representative_id_url} />
                  <InfoDocument label="Giấy ủy quyền" url={selectedRequest.authorization_letter_url} />
                </>
              ) : (
                <>
                  <Info label="Họ tên pháp lý" value={selectedRequest.individual_full_name || 'Chưa cung cấp'} />
                  <Info label="Số CCCD/Hộ chiếu" value={selectedRequest.individual_identity_number || 'Chưa cung cấp'} />
                  <Info label="MST cá nhân" value={selectedRequest.individual_tax_code || 'Chưa cung cấp'} />
                  <InfoDocument label="CCCD mặt trước" url={selectedRequest.individual_id_front_url} />
                  <InfoDocument label="CCCD mặt sau" url={selectedRequest.individual_id_back_url} />
                  <InfoDocument label="Ảnh selfie" url={selectedRequest.individual_selfie_url} />
                </>
              )}
              <Info
                label="Điều khoản Organizer"
                value={selectedRequest.terms_accepted ? 'Đã chấp nhận' : 'Chưa chấp nhận'}
              />
              {selectedRequest.change_summary && (
                <Info label="Duyệt về" value={selectedRequest.change_summary} />
              )}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-subtle leading-relaxed bg-panel-soft p-4 rounded-xl border border-border-soft/30">
              {selectedRequest.organization_description}
            </p>

            {selectedRequest.status === 'PENDING' ? (
              <>
                <label className="mt-5 block">
                  <span className="text-sm font-semibold text-subtle">
                    Ghi chú (bắt buộc khi từ chối)
                  </span>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-xl border border-border-soft/40 bg-panel-soft p-3 text-sm text-content outline-none focus:border-primary placeholder:text-muted"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Lý do duyệt / từ chối..."
                  />
                </label>
                {reviewError && (
                  <p className="mt-3 text-sm text-error font-semibold">{reviewError}</p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="admin-primary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    reviewMutation.isPending ||
                    (selectedRequest.request_type === 'ORGANIZATION' &&
                      selectedRequest.request_action !== 'PROFILE_UPDATE' &&
                      !selectedRequest.business_email_verified)
                  }
                  onClick={() => submitReview('APPROVED')}
                  >
                    <CheckCircle2 className="size-4" />
                    Duyệt
                  </button>
                <button
                  type="button"
                  className="admin-danger disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={reviewMutation.isPending}
                  onClick={() => submitReview('REJECTED')}
                  >
                    <XCircle className="size-4" />
                    Từ chối
                  </button>
                  <button
                    type="button"
                    className="admin-secondary"
                    onClick={() => setSelectedRequest(null)}
                  >
                    Đóng
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                <p className="text-subtle font-medium">
                  <span className="text-content font-bold">Trạng thái: </span>
                  {statusLabel(selectedRequest.status)}
                </p>
                {selectedRequest.review_note && (
                  <p className="text-subtle font-medium">
                    <span className="text-content font-bold">Ghi chú: </span>
                    {selectedRequest.review_note}
                  </p>
                )}
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() => setSelectedRequest(null)}
                >
                  Đóng
                </button>
              </div>
            )}
          </Panel>
        </div>
      )}
    </Page>
  )
}

function MetricCard({ icon: Icon, label, value, accentBg = 'bg-primary/15', accentColor = 'text-primary', sub }) {
  return (
    <div className="glass-panel flex items-start gap-4 rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
      <div className={`glass-panel grid size-12 shrink-0 place-items-center rounded-full border-white/5 shadow-inner ${accentBg}`}>
        {Icon && <Icon className={`size-6 ${accentColor}`} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold uppercase tracking-wider text-subtle">{label}</p>
        <p className="mt-1 text-2xl font-black text-content tracking-tight font-display drop-shadow-sm">{value}</p>
        {sub && <p className="mt-1.5 truncate text-[13px] font-medium text-muted">{sub}</p>}
      </div>
    </div>
  )
}

function FilterGroup({ label, filters, value, onChange }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => onChange(filter.value)}
            className={`inline-flex min-w-24 items-center justify-center rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 ${
              value === filter.value
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30'
                : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-[#C99A47]/50 hover:bg-surface hover:text-[#E6C17A]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 break-words font-semibold text-content">{value}</p>
    </div>
  )
}

function InfoLink({ label, url }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex font-semibold text-tertiary underline-offset-4 hover:underline"
        >
          Mở tài liệu
        </a>
      ) : (
        <p className="mt-1 font-semibold text-content">Không áp dụng</p>
      )}
    </div>
  )
}

function InfoDocument({ label, url }) {
  const image = url && isImageUrl(url)

  return (
    <div className={image ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
      {url ? (
        image ? (
          <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
            <img src={url} alt={label} className="h-48 w-full rounded-xl border border-border-soft/40 object-cover" />
            <span className="mt-2 inline-flex font-semibold text-tertiary underline-offset-4 hover:underline">
              Mở ảnh gốc
            </span>
          </a>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex font-semibold text-tertiary underline-offset-4 hover:underline"
          >
            Mở tài liệu
          </a>
        )
      ) : (
        <p className="mt-1 font-semibold text-content">Không áp dụng</p>
      )}
    </div>
  )
}

function isImageUrl(url = '') {
  return (
    /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(url) ||
    /\/image\/upload\//i.test(url) ||
    /\/raw\/upload\/.*\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(url)
  )
}
