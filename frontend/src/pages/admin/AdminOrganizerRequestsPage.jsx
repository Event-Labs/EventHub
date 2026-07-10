import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, XCircle } from 'lucide-react'
import { useState } from 'react'
import {
  fetchAdminOrganizerRequests,
  reviewOrganizerRequest,
} from '@/services/organizerRequests.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, Page, Panel, Table } from './AdminComponents.jsx'

const primaryActionClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0'

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
  if (status === 'REJECTED') return 'purple'
  return 'blue'
}

function statusLabel(status) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'REJECTED') return 'Từ chối'
  return 'Chờ duyệt'
}

function requestTypeLabel(type) {
  return type === 'ORGANIZATION' ? 'Tổ chức' : 'Cá nhân'
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
          label="Hàng đợi chờ duyệt"
          value={pendingCountQuery.isLoading ? '...' : pendingCount}
          accent="bg-tertiary"
        />
        <MetricCard
          label="Đang hiển thị"
          value={requestsQuery.isLoading ? '...' : requests.length}
          accent="bg-success"
        />
        <MetricCard
          label="Trạng thái hiện tại"
          value={statusFilterLabel}
          accent="bg-tertiary"
          compact
        />
        <MetricCard
          label="Loại hiện tại"
          value={requestTypeFilterLabel}
          accent="bg-warning"
          compact
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
          headers={[
            'Tổ chức',
            'Loại',
            'Người gửi',
            'Liên hệ',
            'Trạng thái',
            'Ngày tạo/gửi',
            '',
          ]}
          rows={requests.map((request) => [
            <div key="org">
              <p className="font-semibold text-content">{request.organization_name}</p>
              <p className="line-clamp-1 text-xs text-subtle">
                {request.organization_description}
              </p>
            </div>,
            <Badge key="type" tone={request.request_type === 'ORGANIZATION' ? 'green' : 'blue'}>
              {requestTypeLabel(request.request_type)}
            </Badge>,
            <div key="user">
              <p className="font-semibold text-content">{request.applicant?.full_name}</p>
              <p className="text-xs text-subtle">{request.applicant?.email}</p>
            </div>,
            <div key="contact" className="text-sm">
              <p className="text-content font-medium">
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
            <Badge key="status" tone={statusTone(request.status)}>
              {statusLabel(request.status)}
            </Badge>,
            <span key="date" className="text-subtle font-medium">
              {new Date(request.created_at).toLocaleDateString('vi-VN')}
            </span>,
            <button
              key="action"
              type="button"
              className="grid size-9 place-items-center rounded-xl border border-border-soft/40 bg-panel-soft text-subtle transition hover:border-tertiary hover:text-tertiary"
              onClick={() => openReview(request)}
              title="Xem chi tiết"
              aria-label={`Xem chi tiết yêu cầu ${request.organization_name}`}
            >
              <Eye className="size-4" />
            </button>,
          ])}
        />
      )}

      {selectedRequest && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <Panel className="admin-review-modal-scroll max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto border-border-soft/60">
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
                  <InfoLink label="Giấy ĐKDN/ERC" url={selectedRequest.legal_document_url} />
                  <InfoLink label="Giấy phép đặc thù" url={selectedRequest.business_license_url} />
                  <InfoLink label="Giấy tờ người đại diện" url={selectedRequest.legal_representative_id_url} />
                  <InfoLink label="Giấy ủy quyền" url={selectedRequest.authorization_letter_url} />
                </>
              ) : (
                <>
                  <Info label="Họ tên pháp lý" value={selectedRequest.individual_full_name || 'Chưa cung cấp'} />
                  <Info label="Số CCCD/Hộ chiếu" value={selectedRequest.individual_identity_number || 'Chưa cung cấp'} />
                  <Info label="MST cá nhân" value={selectedRequest.individual_tax_code || 'Chưa cung cấp'} />
                  <InfoLink label="CCCD mặt trước" url={selectedRequest.individual_id_front_url} />
                  <InfoLink label="CCCD mặt sau" url={selectedRequest.individual_id_back_url} />
                  <InfoLink label="Ảnh selfie" url={selectedRequest.individual_selfie_url} />
                </>
              )}
              <Info
                label="Điều khoản Organizer"
                value={selectedRequest.terms_accepted ? 'Đã chấp nhận' : 'Chưa chấp nhận'}
              />
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
                  className={`${primaryActionClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  disabled={
                    reviewMutation.isPending ||
                    (selectedRequest.request_type === 'ORGANIZATION' &&
                      !selectedRequest.business_email_verified)
                  }
                  onClick={() => submitReview('APPROVED')}
                  >
                    <CheckCircle2 className="size-4" />
                    Duyệt
                  </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-error/40 px-5 py-3 text-sm font-bold text-error transition duration-200 hover:-translate-y-0.5 hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-70"
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

function MetricCard({ label, value, accent, compact = false }) {
  return (
    <Panel className="group relative min-h-32 overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-tertiary/60 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
        <p className={`mt-5 font-display font-extrabold leading-none text-content tracking-tight ${compact ? 'text-2xl' : 'text-4xl'}`}>
          {value}
        </p>
      </div>
    </Panel>
  )
}

function FilterGroup({ label, filters, value, onChange }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => onChange(filter.value)}
            className={`inline-flex min-w-24 items-center justify-center rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 ${
              value === filter.value
                ? 'bg-tertiary text-white shadow-tertiary/20 hover:bg-orange-600'
                : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:bg-surface hover:text-content'
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
