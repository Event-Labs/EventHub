import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, XCircle } from 'lucide-react'
import { useState } from 'react'
import {
  fetchAdminOrganizerRequests,
  reviewOrganizerRequest,
} from '@/services/organizerRequests.js'
import { Badge, Page, Panel, Table } from './AdminComponents.jsx'

const primaryActionClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0'

const statusFilters = [
  { label: 'Tất cả', value: '' },
  { label: 'Chờ duyệt', value: 'PENDING' },
  { label: 'Đã duyệt', value: 'APPROVED' },
  { label: 'Từ chối', value: 'REJECTED' },
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

export function AdminOrganizerRequestsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewError, setReviewError] = useState('')

  const requestsQuery = useQuery({
    queryKey: ['admin-organizer-requests', statusFilter],
    queryFn: () =>
      fetchAdminOrganizerRequests(statusFilter ? { status: statusFilter } : {}),
  })

  const pendingCountQuery = useQuery({
    queryKey: ['admin-organizer-requests', 'PENDING'],
    queryFn: () => fetchAdminOrganizerRequests({ status: 'PENDING' }),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }) => reviewOrganizerRequest(id, payload),
    onSuccess: () => {
      setSelectedRequest(null)
      setReviewNote('')
      setReviewError('')
      queryClient.invalidateQueries({ queryKey: ['admin-organizer-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-organizer-requests', 'PENDING'] })
    },
    onError: (err) => {
      const apiError = err.response?.data
      if (apiError?.errors && Array.isArray(apiError.errors)) {
        setReviewError(apiError.errors.map((item) => item.message).join(', '))
      } else {
        setReviewError(apiError?.message || 'Không thể xử lý yêu cầu.')
      }
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
      description="Theo dõi, kiểm tra và phê duyệt các yêu cầu nâng quyền Organizer trên nền tảng"
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {statusFilters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`inline-flex min-w-24 items-center justify-center rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 ${
              statusFilter === filter.value
                ? 'bg-tertiary text-white shadow-tertiary/20 hover:bg-orange-600'
                : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:bg-surface hover:text-content'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
          label="Bộ lọc hiện tại"
          value={statusFilters.find((filter) => filter.value === statusFilter)?.label || 'Tất cả'}
          accent="bg-tertiary"
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
            'Người gửi',
            'Liên hệ',
            'Trạng thái',
            'Ngày gửi',
            '',
          ]}
          rows={requests.map((request) => [
            <div key="org">
              <p className="font-semibold text-content">{request.organization_name}</p>
              <p className="line-clamp-1 text-xs text-subtle">
                {request.organization_description}
              </p>
            </div>,
            <div key="user">
              <p className="font-semibold text-content">{request.applicant?.full_name}</p>
              <p className="text-xs text-subtle">{request.applicant?.email}</p>
            </div>,
            <div key="contact" className="text-sm">
              <p className="text-content font-medium">{request.business_email}</p>
              <p className="text-subtle text-xs mt-0.5">{request.business_phone}</p>
            </div>,
            <Badge key="status" tone={statusTone(request.status)}>
              {statusLabel(request.status)}
            </Badge>,
            <span key="date" className="text-subtle font-medium">
              {new Date(request.created_at).toLocaleDateString('vi-VN')}
            </span>,
            request.status === 'PENDING' ? (
              <button
                key="action"
                type="button"
                className="admin-secondary !px-3 !py-2"
                onClick={() => openReview(request)}
              >
                <Eye className="size-4" />
              </button>
            ) : (
              <button
                key="action"
                type="button"
                className="admin-secondary !px-3 !py-2"
                onClick={() => openReview(request)}
              >
                Xem
              </button>
            ),
          ])}
        />
      )}

      {selectedRequest && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <Panel className="w-full max-w-xl border-border-soft/60">
            <h3 className="font-display text-2xl font-extrabold text-content">
              {selectedRequest.organization_name}
            </h3>
            <p className="mt-1 text-sm text-subtle font-medium">
              {selectedRequest.applicant?.full_name} · {selectedRequest.applicant?.email}
            </p>
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
                  className={primaryActionClass}
                  disabled={reviewMutation.isPending}
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
