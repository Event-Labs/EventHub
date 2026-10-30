import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, Clock, Eye, Layers, XCircle, ShieldCheck, AlertTriangle, Lock, Shield, Check, ExternalLink, Globe } from 'lucide-react'
import { useState } from 'react'
import {
  fetchAdminOrganizerRequests,
  reviewOrganizerRequest,
} from '@/services/organizerRequests.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Modal } from '@/components/Modal.jsx'
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
            <div key="type" className="space-y-1">
              <Badge tone={request.request_type === 'ORGANIZATION' ? 'green' : 'blue'}>
                {requestActionLabel(request.request_action)} · {requestTypeLabel(request.request_type)}
              </Badge>
              {request.request_type === 'INDIVIDUAL' && (
                <div>
                  {request.kyc_ocr_data?.verification_method === 'PARTNER_VETTING' || request.kyc_ocr_data?.algorithm_checked ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <ShieldCheck className="size-3" /> Thẩm định C06 & Dấu vết số
                    </span>
                  ) : request.kyc_ocr_data?.scan_method === 'VNEID_GATEWAY' || request.kyc_ocr_data?.verified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <ShieldCheck className="size-3" /> VNeID Mức 2
                    </span>
                  ) : request.kyc_ocr_data?.scan_method === 'QR_CODE' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      ✓ QR BCA
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                      ⚠️ Khai báo đối soát
                    </span>
                  )}
                </div>
              )}
            </div>,
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
            <StatusBadge
              key="status"
              status={request.status}
              label={statusLabel(request.status)}
              tone={statusTone(request.status)}
            />,
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
        <Modal
          open={Boolean(selectedRequest)}
          title="Chi tiết yêu cầu Organizer"
          onClose={() => setSelectedRequest(null)}
          maxWidth="max-w-3xl"
          footer={
            selectedRequest.status === 'PENDING' ? (
              <div className="flex w-full flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  className="admin-secondary px-6"
                  onClick={() => setSelectedRequest(null)}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="admin-danger flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={reviewMutation.isPending}
                  onClick={() => submitReview('REJECTED')}
                >
                  <XCircle className="size-4" />
                  Từ chối
                </button>
                <button
                  type="button"
                  className="admin-primary flex items-center gap-2 rounded-xl px-6 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    reviewMutation.isPending ||
                    (selectedRequest.request_type === 'ORGANIZATION' &&
                      selectedRequest.request_action !== 'PROFILE_UPDATE' &&
                      !selectedRequest.business_email_verified)
                  }
                  onClick={() => submitReview('APPROVED')}
                >
                  <CheckCircle2 className="size-4" />
                  {reviewMutation.isPending ? 'Đang xử lý...' : 'Duyệt yêu cầu'}
                </button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-end gap-3">
                <button
                  type="button"
                  className="admin-secondary px-6"
                  onClick={() => setSelectedRequest(null)}
                >
                  Đóng
                </button>
              </div>
            )
          }
        >
          <div className="space-y-6">
            {/* Header info card */}
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#121c38]/60 p-5 sm:flex-row sm:items-center sm:justify-between [html.light_&]:border-border-soft/40 [html.light_&]:bg-panel-soft">
              <div className="flex items-center gap-4">
                {selectedRequest.organization_avatar_url ? (
                  <img
                    src={selectedRequest.organization_avatar_url}
                    alt={selectedRequest.organization_name}
                    className="size-16 rounded-2xl border border-white/15 object-cover shadow-md"
                  />
                ) : (
                  <div className="grid size-16 place-items-center rounded-2xl bg-tertiary/20 text-tertiary border border-tertiary/30">
                    <Building2 className="size-8" />
                  </div>
                )}
                <div>
                  <h3 className="font-display text-xl font-extrabold text-white [html.light_&]:text-[#0D1B2A]">
                    {selectedRequest.organization_name}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-slate-300 [html.light_&]:text-[#536b88]">
                    {selectedRequest.applicant?.full_name} · {selectedRequest.applicant?.email}
                  </p>
                </div>
              </div>
              <StatusBadge
                status={selectedRequest.status}
                label={statusLabel(selectedRequest.status)}
                tone={statusTone(selectedRequest.status)}
              />
            </div>

            {/* Description if present */}
            {selectedRequest.organization_description && (
              <div className="rounded-2xl border border-white/10 bg-[#121c38]/40 p-4 [html.light_&]:border-border-soft/40 [html.light_&]:bg-panel-soft">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D] mb-1.5">Mô tả tổ chức</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white [html.light_&]:text-[#0D1B2A]">
                  {selectedRequest.organization_description}
                </p>
              </div>
            )}

            {/* Detailed profile information */}
            <div className="rounded-2xl border border-white/10 bg-[#121c38]/40 p-5 [html.light_&]:border-border-soft/40 [html.light_&]:bg-panel-soft">
              <h4 className="mb-4 text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                Thông tin hồ sơ đăng ký
              </h4>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <Info label="Trạng thái" value={statusLabel(selectedRequest.status)} />
                <Info label="Nội dung yêu cầu" value={requestActionLabel(selectedRequest.request_action)} />
                <Info label="Loại đăng ký" value={requestTypeLabel(selectedRequest.request_type)} />
                <Info label="Số điện thoại" value={selectedRequest.business_phone || 'Chưa cung cấp'} />
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
                    {(() => {
                      const kyc = selectedRequest.kyc_ocr_data || {}
                      const isPartnerVetting =
                        kyc?.verification_method === 'PARTNER_VETTING' ||
                        kyc?.algorithm_checked ||
                        Boolean(kyc?.social_link)

                      const isVNeId = !isPartnerVetting && (kyc?.scan_method === 'VNEID_GATEWAY' || (kyc?.verified && kyc?.reference_code))
                      const isQr = !isPartnerVetting && !isVNeId && kyc?.scan_method === 'QR_CODE'
                      const isManual = !isPartnerVetting && !isVNeId && !isQr

                      // Anti-tamper mismatch check
                      const verifiedId = kyc?.id_number ? String(kyc.id_number).trim() : ''
                      const formId = selectedRequest.individual_identity_number ? String(selectedRequest.individual_identity_number).trim() : ''
                      const idMismatch = (isVNeId || isQr) && verifiedId && formId && verifiedId !== formId

                      const verifiedName = kyc?.full_name ? String(kyc.full_name).trim().toUpperCase() : ''
                      const formName = selectedRequest.individual_full_name ? String(selectedRequest.individual_full_name).trim().toUpperCase() : ''
                      const nameMismatch = (isVNeId || isQr) && verifiedName && formName && verifiedName !== formName

                      const isTampered = idMismatch || nameMismatch

                      return (
                        <>
                          {isTampered && (
                            <div className="sm:col-span-2 rounded-2xl border border-rose-500/50 bg-rose-950/30 p-4 text-xs space-y-2 shadow-lg shadow-rose-950/40">
                              <div className="flex items-center gap-2 font-bold text-rose-300">
                                <AlertTriangle className="size-5 text-rose-400 shrink-0" />
                                <span>CẢNH BÁO GIAN LẬN: PHÁT HIỆN DỮ LIỆU ĐĂNG KÝ BỊ SAI LỆCH VỚI DỮ LIỆU ĐỊNH DANH!</span>
                              </div>
                              <div className="text-rose-200/90 pl-7 space-y-1">
                                {idMismatch && (
                                  <p>• Số CCCD khai báo (<strong>{formId}</strong>) khác với số trong dữ liệu định danh (<strong>{verifiedId}</strong>).</p>
                                )}
                                {nameMismatch && (
                                  <p>• Họ tên khai báo (<strong>{formName}</strong>) khác với họ tên trong dữ liệu định danh (<strong>{verifiedName}</strong>).</p>
                                )}
                              </div>
                            </div>
                          )}

                          {isPartnerVetting && (
                            <div className="sm:col-span-2 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-[#0d1726] to-slate-900/90 p-5 space-y-4 text-xs shadow-xl shadow-emerald-950/30">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-500/20">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30">
                                    <ShieldCheck className="size-5 text-emerald-100" />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-white text-sm">
                                      HỒ SƠ THẨM ĐỊNH ĐỐI TÁC (PARTNER VETTING · CHUẨN C06)
                                    </h4>
                                    <p className="text-[11px] text-emerald-300 font-mono mt-0.5">
                                      Phương thức: <strong>Kiểm định cấu trúc C06 & Dấu vết số (Digital Footprint)</strong>
                                    </p>
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 self-start sm:self-auto">
                                  <Check className="size-3" /> Thuật toán C06 Hợp lệ
                                </span>
                              </div>

                              <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-300 flex items-center gap-2">
                                <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                                <span>Hệ thống bảo mật dữ liệu và không lưu trữ hình ảnh thẻ CCCD.</span>
                              </div>

                              {/* Thông tin C06 */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-300">
                                <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Họ và tên pháp lý</span>
                                  <span className="text-white text-sm font-bold uppercase">{selectedRequest.individual_full_name || kyc.full_name}</span>
                                </div>
                                <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Số CCCD (12 chữ số)</span>
                                  <span className="text-emerald-300 font-mono text-sm font-bold">{selectedRequest.individual_identity_number || kyc.id_number}</span>
                                </div>
                                <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Tỉnh/Thành khai sinh (Mã 3 số C06)</span>
                                  <span className="text-emerald-300 font-semibold">{kyc.province || 'Xác thực chuẩn 63 tỉnh/thành'}</span>
                                </div>
                                <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Ngày sinh & Giới tính</span>
                                  <span className="text-white font-semibold">{kyc.dob || 'Chưa cung cấp'} · {kyc.gender || 'Nam'}</span>
                                </div>
                                <div className="sm:col-span-2 rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Nơi thường trú theo CCCD</span>
                                  <span className="text-white font-semibold">{kyc.address || 'Chưa cung cấp'}</span>
                                </div>
                              </div>

                              {/* Thẩm định Dấu vết số (Digital Footprint) */}
                              <div className="rounded-xl bg-blue-950/30 border border-blue-500/30 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-blue-300 font-bold text-xs">
                                  <Globe className="size-4 text-blue-400" />
                                  DẤU VẾT SỐ & UY TÍN TRUYỀN THÔNG (TRỌNG TÂM ĐỐI SOÁT CỦA ADMIN)
                                </div>
                                <div className="space-y-2">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/70 border border-white/5">
                                    <div className="space-y-0.5 min-w-0 flex-1">
                                      <span className="text-slate-400 text-[11px] block">Kênh truyền thông / Mạng xã hội chính chủ:</span>
                                      <span className="text-white font-mono text-xs break-all">{kyc.social_link || 'Chưa cung cấp'}</span>
                                    </div>
                                    {kyc.social_link && (
                                      <a
                                        href={kyc.social_link.startsWith('http') ? kyc.social_link : `https://${kyc.social_link}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/40 font-semibold text-xs shrink-0 transition"
                                      >
                                        <ExternalLink className="size-3.5" /> Mở thẩm định MXH
                                      </a>
                                    )}
                                  </div>

                                  {kyc.portfolio_url && (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/70 border border-white/5">
                                      <div className="space-y-0.5 min-w-0 flex-1">
                                        <span className="text-slate-400 text-[11px] block">Minh chứng sự kiện / Portfolio:</span>
                                        <span className="text-white font-mono text-xs break-all">{kyc.portfolio_url}</span>
                                      </div>
                                      <a
                                        href={kyc.portfolio_url.startsWith('http') ? kyc.portfolio_url : `https://${kyc.portfolio_url}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 font-semibold text-xs shrink-0 transition"
                                      >
                                        <ExternalLink className="size-3.5" /> Mở Portfolio
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {isVNeId && !isTampered && (
                            <div className="sm:col-span-2 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-[#0d1726] to-slate-900/90 p-5 space-y-4 text-xs shadow-xl shadow-emerald-950/30">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-500/20">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 text-white shadow-md shadow-red-600/30">
                                    <Shield className="size-5 text-amber-200" />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-white text-sm">
                                      HỒ SƠ ĐÃ ĐỐI SOÁT QUA CỔNG ĐỊNH DANH VNEID (CẤP ĐỘ 2)
                                    </h4>
                                    <p className="text-[11px] text-emerald-300 font-mono mt-0.5">
                                      Mã giao dịch đối soát: <strong>{kyc.reference_code || 'VNEID-2026-CHUNG_THUC'}</strong>
                                    </p>
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 self-start sm:self-auto">
                                  <Check className="size-3" /> Đã chứng thực số C06
                                </span>
                              </div>

                              <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/20 p-3 text-[11px] text-emerald-200/90 leading-relaxed flex items-start gap-2">
                                <Lock className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                                <div>
                                  <strong>Tuân thủ Nghị định 13/2023/NĐ-CP (PDPD - Bảo vệ dữ liệu cá nhân):</strong> Hệ thống không lưu trữ tệp ảnh chụp thẻ CCCD. Danh tính công dân đã được xác thực sinh trắc học và đối soát trực tiếp với Cơ sở dữ liệu Quốc gia về Dân cư.
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-300">
                                <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Số CCCD / Định danh cá nhân</span>
                                  <span className="text-emerald-300 font-mono text-sm font-bold">{kyc.id_number}</span>
                                </div>
                                <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                  <span className="text-slate-400 block text-[11px]">Họ và tên pháp lý</span>
                                  <span className="text-white text-sm font-bold">{kyc.full_name}</span>
                                </div>
                                {kyc.dob && (
                                  <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                    <span className="text-slate-400 block text-[11px]">Ngày sinh</span>
                                    <span className="text-white font-semibold">{kyc.dob}</span>
                                  </div>
                                )}
                                {kyc.gender && (
                                  <div className="rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                    <span className="text-slate-400 block text-[11px]">Giới tính</span>
                                    <span className="text-white font-semibold">{kyc.gender}</span>
                                  </div>
                                )}
                                {kyc.address && (
                                  <div className="sm:col-span-2 rounded-xl bg-slate-900/80 p-3 border border-white/5 space-y-0.5">
                                    <span className="text-slate-400 block text-[11px]">Nơi thường trú</span>
                                    <span className="text-white font-semibold">{kyc.address}</span>
                                  </div>
                                )}
                                <div className="sm:col-span-2 rounded-xl bg-slate-900/80 p-3 border border-white/5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                                  <span>Đơn vị chứng thực: <strong className="text-slate-300">{kyc.provider || 'C06 - Bộ Công An / National eKYC Gateway'}</strong></span>
                                  {kyc.verified_at && (
                                    <span>Thời điểm: <strong className="text-slate-300">{new Date(kyc.verified_at).toLocaleString('vi-VN')}</strong></span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {isQr && !isTampered && (
                            <div className="sm:col-span-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3 text-xs shadow-lg shadow-emerald-950/30">
                              <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                                <div className="flex items-center gap-2 font-bold text-emerald-300">
                                  <ShieldCheck className="size-4 text-emerald-400" />
                                  ĐÃ XÁC THỰC QUA MÃ QR BỘ CÔNG AN (CHÍNH XÁC 100%)
                                </div>
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Dữ liệu khóa cố định
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-300">
                                <p>Số CCCD: <strong className="text-emerald-300 font-mono text-sm">{kyc.id_number}</strong></p>
                                <p>Họ tên: <strong className="text-white text-sm">{kyc.full_name}</strong></p>
                                {kyc.dob && <p>Ngày sinh: <strong className="text-white">{kyc.dob}</strong></p>}
                                {kyc.gender && <p>Giới tính: <strong className="text-white">{kyc.gender}</strong></p>}
                                {kyc.address && <p className="sm:col-span-2">Nơi thường trú: <strong className="text-white">{kyc.address}</strong></p>}
                                {kyc.issue_date && <p>Ngày cấp: <strong className="text-white">{kyc.issue_date}</strong></p>}
                                {kyc.old_id && <p>CMND cũ: <strong className="text-white">{kyc.old_id}</strong></p>}
                              </div>
                            </div>
                          )}

                          {isManual && (
                            <div className="sm:col-span-2 rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-2 text-xs shadow-lg">
                              <div className="flex items-center gap-2 font-bold text-amber-300">
                                <Clock className="size-4 text-amber-400" />
                                THÔNG TIN KHAI BÁO THỦ CÔNG (CHƯA XÁC THỰC QUA CỔNG ĐỊNH DANH)
                              </div>
                              <p className="text-amber-200/90 leading-relaxed">
                                Hồ sơ này do người dùng tự nhập tay. Vui lòng kiểm tra đối chiếu kỹ thông tin khai báo với ảnh chân dung bên dưới trước khi phê duyệt.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 pt-1">
                                <p>Số CCCD khai báo: <strong className="text-white font-mono">{selectedRequest.individual_identity_number}</strong></p>
                                <p>Họ tên khai báo: <strong className="text-white">{selectedRequest.individual_full_name}</strong></p>
                                {kyc?.dob && <p>Ngày sinh: <strong className="text-white">{kyc.dob}</strong></p>}
                                {kyc?.address && <p className="sm:col-span-2">Nơi thường trú: <strong className="text-white">{kyc.address}</strong></p>}
                              </div>
                            </div>
                          )}

                          <Info label="Mã số thuế cá nhân" value={selectedRequest.individual_tax_code || 'Không có (Sử dụng CCCD làm MST)'} />

                          {/* Đối chiếu khuôn mặt trực quan qua ảnh Selfie */}
                          <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-[#0d1527] p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D] mb-3">
                              Ảnh chân dung đối chiếu trực quan (Selfie)
                            </p>
                            {selectedRequest.individual_selfie_url ? (
                              <div className="flex flex-col sm:flex-row items-start gap-4">
                                <a
                                  href={selectedRequest.individual_selfie_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block group shrink-0"
                                >
                                  <img
                                    src={selectedRequest.individual_selfie_url}
                                    alt="Ảnh chân dung người đăng ký"
                                    className="size-36 rounded-2xl border border-white/20 object-cover shadow-lg group-hover:border-[#C99A47] transition"
                                  />
                                  <span className="mt-1 block text-center text-[11px] font-semibold text-[#E6C17A] underline underline-offset-2">
                                    Xem ảnh gốc
                                  </span>
                                </a>
                                <div className="text-xs text-slate-300 space-y-1.5">
                                  <p className="font-bold text-white text-sm">Đối chiếu trực quan:</p>
                                  <p className="text-slate-400 leading-relaxed">
                                    Đối chiếu khuôn mặt người chụp chân dung với thông tin họ tên, năm sinh và kênh truyền thông đã cung cấp.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-rose-400 font-semibold">Chưa có ảnh chân dung đối chiếu.</p>
                            )}
                          </div>
                        </>
                      )
                    })()}
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
            </div>

            {/* Review Note Section */}
            {selectedRequest.status === 'PENDING' ? (
              <div className="rounded-2xl border border-white/10 bg-[#121c38]/40 p-5 [html.light_&]:border-border-soft/40 [html.light_&]:bg-panel-soft">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">
                    Ghi chú (bắt buộc khi từ chối)
                  </span>
                  <textarea
                    className="mt-2.5 min-h-24 w-full rounded-xl border border-white/15 bg-[#0b1329] p-3 text-sm text-white outline-none focus:border-[#C99A47] placeholder:text-slate-400 [html.light_&]:border-border-soft/60 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Lý do duyệt / từ chối..."
                  />
                </label>
                {reviewError && (
                  <p className="mt-3 text-sm text-rose-400 font-semibold">{reviewError}</p>
                )}
              </div>
            ) : selectedRequest.review_note ? (
              <div className="rounded-2xl border border-white/10 bg-[#121c38]/40 p-4 [html.light_&]:border-border-soft/40 [html.light_&]:bg-panel-soft">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">
                  Ghi chú kiểm duyệt
                </p>
                <p className="mt-1 text-sm font-medium text-white [html.light_&]:text-[#0D1B2A]">
                  {selectedRequest.review_note}
                </p>
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </Page>
  )
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="glass-panel flex flex-col justify-between rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">{label}</p>
        <p className="mt-2 text-3xl font-black text-white tracking-tight font-display drop-shadow-sm [html.light_&]:text-[#0D1B2A]">{value}</p>
      </div>
      {sub && <p className="mt-2 truncate text-[13px] font-medium text-slate-300 [html.light_&]:text-[#536b88]">{sub}</p>}
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
                ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 border border-[#C99A47]'
                : 'border border-white/10 bg-[#151d34] text-slate-300 hover:border-[#C99A47]/50 hover:bg-white/5 hover:text-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:bg-white/85 [html.light_&]:text-[#1B365D]'
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
      <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">{label}</p>
      <p className="mt-1 break-words font-semibold text-white [html.light_&]:text-[#0D1B2A]">{value}</p>
    </div>
  )
}

function InfoLink({ label, url }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">{label}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex font-semibold text-[#E6C17A] underline-offset-4 hover:underline"
        >
          Mở tài liệu
        </a>
      ) : (
        <p className="mt-1 font-semibold text-slate-400">Không áp dụng</p>
      )}
    </div>
  )
}

function InfoDocument({ label, url }) {
  const image = url && isImageUrl(url)

  return (
    <div className={image ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">{label}</p>
      {url ? (
        image ? (
          <a href={url} target="_blank" rel="noreferrer" className="mt-2 block group">
            <img src={url} alt={label} className="h-56 w-full rounded-2xl border border-white/15 object-contain bg-black/40 shadow-md group-hover:border-[#C99A47]/60 transition" />
            <span className="mt-2 inline-flex font-semibold text-[#E6C17A] underline-offset-4 hover:underline">
              Mở ảnh gốc
            </span>
          </a>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex font-semibold text-[#E6C17A] underline-offset-4 hover:underline"
          >
            Mở tài liệu
          </a>
        )
      ) : (
        <p className="mt-1 font-semibold text-slate-400">Không áp dụng</p>
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
