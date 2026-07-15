import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Camera, CheckCircle2, Clock3, History, Loader2, UserCircle, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { getUserRoles, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import {
  fetchMyOrganizerRequests,
  submitOrganizerRequest,
  updateOrganizerRequest,
} from '@/services/organizerRequests.js'
import { uploadOrganizerAvatar, uploadOrganizerDocument } from '@/services/uploads.js'
import { getProfile } from '@/services/user.service.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const emptyForm = {
  request_type: 'INDIVIDUAL',
  organization_name: '',
  organization_description: '',
  business_email: '',
  business_phone: '',
  organization_avatar_url: '',
  tax_code: '',
  legal_document_url: '',
  business_license_url: '',
  legal_representative_name: '',
  legal_representative_position: '',
  legal_representative_id_url: '',
  authorization_letter_url: '',
  individual_full_name: '',
  individual_identity_number: '',
  individual_id_front_url: '',
  individual_id_back_url: '',
  individual_selfie_url: '',
  individual_tax_code: '',
  terms_accepted: false,
}

const requestTypeOptions = [
  {
    value: 'INDIVIDUAL',
    label: 'Cá nhân',
    description: 'Dành cho creator, host độc lập hoặc nhóm nhỏ chưa có pháp nhân.',
  },
  {
    value: 'ORGANIZATION',
    label: 'Tổ chức',
    description: 'Dành cho doanh nghiệp, CLB, trung tâm hoặc pháp nhân có mã số thuế.',
  },
]

const validationLabels = {
  organization_name: 'Tên tổ chức',
  organization_description: 'Mô tả',
  business_email: 'Email tổ chức',
  business_phone: 'Số điện thoại',
  organization_avatar_url: 'Ảnh đại diện',
  tax_code: 'Mã số thuế',
  legal_document_url: 'Giấy ĐKDN/ERC',
  legal_representative_name: 'Người đại diện pháp luật',
  legal_representative_position: 'Chức vụ',
  legal_representative_id_url: 'Giấy tờ tùy thân người đại diện',
  individual_full_name: 'Họ tên pháp lý',
  individual_identity_number: 'Số CCCD/Hộ chiếu',
  individual_id_front_url: 'CCCD mặt trước',
  individual_id_back_url: 'CCCD mặt sau',
  individual_selfie_url: 'Ảnh chân dung/Selfie',
  individual_tax_code: 'Mã số thuế cá nhân',
  terms_accepted: 'Điều khoản',
}

function requestTypeLabel(type) {
  return type === 'ORGANIZATION' ? 'Tổ chức' : 'Cá nhân'
}

function RequestTypeSelector({ value, onChange, disabled = false }) {
  const selectedOption = requestTypeOptions.find((option) => option.value === value) || requestTypeOptions[0]

  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {requestTypeOptions.map((option) => {
          const active = value === option.value
          return (
            <label
              key={option.value}
              className={`inline-flex items-center gap-2 text-sm font-bold ${active ? 'text-content' : 'text-muted'
                } ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name="organizer-request-type"
                value={option.value}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="size-4 accent-orange-500"
              />
              {option.label}
            </label>
          )
        })}
      </div>
      <p className="mt-3 text-sm leading-6 text-subtle">
        {selectedOption.description}
      </p>
    </section>
  )
}

function formatApiValidationError(apiError) {
  const issues = Array.isArray(apiError?.data)
    ? apiError.data
    : Array.isArray(apiError?.errors)
      ? apiError.errors
      : []

  if (!issues.length) return apiError?.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.'

  return issues
    .map((issue) => {
      const field = Array.isArray(issue.path) ? issue.path.join('.') : issue.path
      const label = validationLabels[field] || field || 'Dữ liệu'
      return `${label}: ${issue.message}`
    })
    .join('\n')
}

function EmptyStatus() {
  return (
    <div className="rounded-lg border border-border-soft bg-panel p-5">
      <p className="text-sm text-muted">
        Bạn chưa gửi yêu cầu nào. Điền form bên trái để đăng ký trở thành ban tổ chức.
      </p>
    </div>
  )
}

function StatusSummary({ requests, onEdit }) {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!requests.length) {
    return <EmptyStatus />
  }

  const latestRequest = requests[requests.length - 1]
  const handleHistoryEdit = (request) => {
    setHistoryOpen(false)
    onEdit?.(request)
  }

  return (
    <>
      <div className="space-y-3">
        <StatusCard request={latestRequest} onEdit={onEdit} />
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-soft bg-surface px-4 py-3 text-sm font-bold text-content transition hover:border-primary hover:bg-panel"
        >
          <History className="size-4" />
          Xem lịch sử yêu cầu
        </button>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border-soft bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-soft/40 px-5 py-4">
              <div>
                <p className="font-display text-xl font-extrabold text-content">Lịch sử yêu cầu Organizer</p>
                <p className="text-sm text-muted">{requests.length} yêu cầu đã gửi</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="grid size-9 place-items-center rounded-full text-subtle transition hover:bg-panel hover:text-content"
                aria-label="Đóng lịch sử yêu cầu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-5">
              <StatusList requests={requests} onEdit={handleHistoryEdit} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusList({ requests, onEdit }) {
  return (
    <div className="space-y-4">
      {requests.map((request, index) => (
        <StatusCard
          key={request.id}
          request={request}
          titlePrefix={requests.length > 1 ? `Yêu cầu ${index + 1}` : ''}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

function StatusCard({ request, titlePrefix, onEdit }) {
  const statusConfig = {
    PENDING: {
      icon: Clock3,
      tone: 'text-warning',
      bg: 'bg-warning/10 border-warning/30',
      title: 'Đang chờ duyệt',
      body: 'Admin sẽ xem xét yêu cầu của bạn trong thời gian sớm nhất.',
    },
    APPROVED: {
      icon: CheckCircle2,
      tone: 'text-success',
      bg: 'bg-success/10 border-success/30',
      title: 'Đã được duyệt',
      body: 'Đăng xuất và đăng nhập lại để truy cập khu vực Organizer.',
    },
    REJECTED: {
      icon: XCircle,
      tone: 'text-error',
      bg: 'bg-error/10 border-error/30',
      title: 'Yêu cầu bị từ chối',
      body: request.review_note || 'Bạn có thể gửi lại yêu cầu với thông tin cập nhật.',
    },
  }

  const config = statusConfig[request.status] || statusConfig.PENDING
  const Icon = config.icon

  return (
    <div className={`rounded-lg border p-5 ${config.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${config.tone}`} />
        <div>
          {titlePrefix && (
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-subtle">
              {titlePrefix}
            </p>
          )}
          <p className={`font-bold ${config.tone}`}>{config.title}</p>
          <p className="mt-1 text-sm text-muted">{config.body}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-subtle">Loại đăng ký</dt>
              <dd className="font-semibold">{requestTypeLabel(request.request_type)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Tổ chức</dt>
              <dd className="font-semibold">{request.organization_name}</dd>
            </div>
            {request.request_type === 'ORGANIZATION' && (
              <div>
                <dt className="text-subtle">Email tổ chức</dt>
                <dd className="space-y-1 font-semibold">
                  <span className="block break-all">{request.business_email}</span>
                  <span className={request.business_email_verified ? 'block text-success' : 'block text-warning'}>
                    {request.business_email_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-subtle">Gửi lúc</dt>
              <dd>{new Date(request.created_at).toLocaleString('vi-VN')}</dd>
            </div>
            {request.reviewed_at && (
              <div>
                <dt className="text-subtle">Xử lý lúc</dt>
                <dd>{new Date(request.reviewed_at).toLocaleString('vi-VN')}</dd>
              </div>
            )}
          </dl>
          {request.status !== 'APPROVED' && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(request)}
              className="mt-4 inline-flex rounded-md border border-border-soft px-4 py-2 text-sm font-bold text-content transition hover:border-primary hover:bg-panel"
            >
              Chỉnh sửa
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function OrganizerRequestPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = hasAuthSession()

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: getProfile,
    enabled: isAuthenticated,
  })

  const isOrganizer = getUserRoles(profileQuery.data).includes('organizer')

  const [form, setForm] = useState(emptyForm)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [selectedDocuments, setSelectedDocuments] = useState({})
  const [previewUrl, setPreviewUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingRequest, setEditingRequest] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const requestQuery = useQuery({
    queryKey: ['my-organizer-requests'],
    queryFn: fetchMyOrganizerRequests,
    enabled: isAuthenticated,
  })

  const requests = requestQuery.data || []
  const hasPendingIndividualRequest =
    requests.some((request) => request.status === 'PENDING' && request.request_type === 'INDIVIDUAL')
  const canSubmit =
    !isOrganizer &&
    (!hasPendingIndividualRequest || Boolean(editingRequest))

  const requestMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? updateOrganizerRequest(id, payload) : submitOrganizerRequest(payload),
    onSuccess: (request) => {
      const message =
        request.request_type === 'ORGANIZATION'
          ? 'Yêu cầu đã được gửi. Vui lòng kiểm tra email tổ chức để xác thực trước khi admin duyệt.'
          : editingRequest
            ? 'Yêu cầu đã được cập nhật và gửi lại để admin xét duyệt.'
            : 'Yêu cầu đã được gửi thành công.'
      setSuccess(message)
      toast.success(message)
      setError('')
      setForm(emptyForm)
      setSelectedAvatar(null)
      setSelectedDocuments({})
      setPreviewUrl('')
      setEditingRequest(null)
      queryClient.invalidateQueries({ queryKey: ['my-organizer-requests'] })
    },
    onError: (err) => {
      const apiError = err.response?.data
      const message = formatApiValidationError(apiError)
      setError(message)
      toast.error(message)
      setSuccess('')
    },
  })

  const handleChange = (field) => (event) => {
    const value =
      field === 'individual_full_name'
        ? event.target.value.toLocaleUpperCase('vi-VN')
        : field === 'individual_identity_number'
          ? event.target.value.toUpperCase()
          : event.target.value
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleCheckboxChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.checked }))
  }

  const handleTypeChange = (requestType) => {
    setError('')
    setSuccess('')
    setForm((current) => ({
      ...current,
      request_type: requestType,
      business_email:
        requestType === 'ORGANIZATION'
          ? current.business_email
          : '',
      organization_avatar_url: requestType === 'ORGANIZATION' ? current.organization_avatar_url : '',
      tax_code: requestType === 'ORGANIZATION' ? current.tax_code : '',
    }))

    if (requestType !== 'ORGANIZATION') {
      setSelectedAvatar(null)
      setPreviewUrl('')
    }
  }

  const handleEditRequest = (request) => {
    setEditingRequest(request)
    setError('')
    setSuccess('')
    setSelectedAvatar(null)
    setSelectedDocuments({})
    setPreviewUrl(request.organization_avatar_url || '')
    setForm({
      ...emptyForm,
      request_type: request.request_type || 'INDIVIDUAL',
      organization_name: request.organization_name || '',
      organization_description: request.organization_description || '',
      business_email: request.business_email || '',
      business_phone: request.business_phone || '',
      organization_avatar_url: request.organization_avatar_url || '',
      tax_code: request.tax_code || '',
      legal_document_url: request.legal_document_url || '',
      business_license_url: request.business_license_url || '',
      legal_representative_name: request.legal_representative_name || '',
      legal_representative_position: request.legal_representative_position || '',
      legal_representative_id_url: request.legal_representative_id_url || '',
      authorization_letter_url: request.authorization_letter_url || '',
      individual_full_name: request.individual_full_name || '',
      individual_identity_number: request.individual_identity_number || '',
      individual_id_front_url: request.individual_id_front_url || '',
      individual_id_back_url: request.individual_id_back_url || '',
      individual_selfie_url: request.individual_selfie_url || '',
      individual_tax_code: request.individual_tax_code || '',
      terms_accepted: Boolean(request.terms_accepted),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingRequest(null)
    setForm(emptyForm)
    setSelectedAvatar(null)
    setSelectedDocuments({})
    setPreviewUrl('')
    setError('')
    setSuccess('')
  }

  const handleDocumentChange = (field) => (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const imageOnlyFields = [
      'individual_id_front_url',
      'individual_id_back_url',
      'individual_selfie_url',
    ]

    if (imageOnlyFields.includes(field) && !file.type.startsWith('image/')) {
      event.target.value = ''
      const message = 'Vui lòng chỉ tải ảnh JPG, PNG hoặc WEBP cho tài liệu xác minh cá nhân.'
      setError(message)
      toast.error(message)
      return
    }

    setSelectedDocuments((current) => ({ ...current, [field]: file }))
    setError('')
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      const message = 'Vui lòng chọn tệp ảnh hợp lệ.'
      setError(message)
      toast.error(message)
      return
    }

    setSelectedAvatar(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    let avatarUrl = form.organization_avatar_url.trim()
    const isOrganization = form.request_type === 'ORGANIZATION'

    if (!selectedAvatar && !avatarUrl) {
      const message = 'Vui lòng tải ảnh đại diện.'
      setError(message)
      toast.error(message)
      return
    }

    if (!form.terms_accepted) {
      const message = 'Vui lòng xác nhận đã đọc và đồng ý Điều khoản dành cho Nhà tổ chức.'
      setError(message)
      toast.error(message)
      return
    }

    const requiredDocuments = isOrganization
      ? [
        ['legal_document_url', 'Vui lòng tải Giấy ĐKDN/ERC.'],
        ['legal_representative_id_url', 'Vui lòng tải giấy tờ tùy thân của người đại diện.'],
      ]
      : [
        ['individual_id_front_url', 'Vui lòng tải ảnh CCCD mặt trước.'],
        ['individual_id_back_url', 'Vui lòng tải ảnh CCCD mặt sau.'],
        ['individual_selfie_url', 'Vui lòng tải ảnh chân dung/Selfie.'],
      ]

    const missingDocument = requiredDocuments.find(
      ([field]) => !selectedDocuments[field] && !form[field]?.trim(),
    )

    if (missingDocument) {
      setError(missingDocument[1])
      toast.error(missingDocument[1])
      return
    }

    const uploadDocumentField = async (field) => {
      if (selectedDocuments[field]) {
        const imageOnlyFields = [
          'individual_id_front_url',
          'individual_id_back_url',
          'individual_selfie_url',
        ]
        const uploadResult = await uploadOrganizerDocument(selectedDocuments[field], {
          imageOnly: imageOnlyFields.includes(field),
        })
        return uploadResult.secure_url || uploadResult.url
      }
      return form[field]?.trim() || ''
    }

    try {
      setIsUploading(true)
      if (selectedAvatar) {
        setIsUploading(true)
        const uploadResult = await uploadOrganizerAvatar(selectedAvatar)
        avatarUrl = uploadResult.secure_url || uploadResult.url
      }

      const documentUrls = isOrganization
        ? {
          legal_document_url: await uploadDocumentField('legal_document_url'),
          business_license_url: await uploadDocumentField('business_license_url'),
          legal_representative_id_url: await uploadDocumentField('legal_representative_id_url'),
          authorization_letter_url: await uploadDocumentField('authorization_letter_url'),
        }
        : {
          individual_id_front_url: await uploadDocumentField('individual_id_front_url'),
          individual_id_back_url: await uploadDocumentField('individual_id_back_url'),
          individual_selfie_url: await uploadDocumentField('individual_selfie_url'),
        }

      requestMutation.mutate({
        id: editingRequest?.id,
        payload: {
          request_type: form.request_type,
          organization_name: form.organization_name.trim(),
          organization_description: form.organization_description.trim(),
          business_email: isOrganization ? form.business_email.trim() : '',
          business_phone: form.business_phone.trim(),
          organization_avatar_url: avatarUrl,
          tax_code: isOrganization ? form.tax_code.trim() : '',
          legal_document_url: documentUrls.legal_document_url || '',
          business_license_url: documentUrls.business_license_url || '',
          legal_representative_name: isOrganization ? form.legal_representative_name.trim() : '',
          legal_representative_position: isOrganization ? form.legal_representative_position.trim() : '',
          legal_representative_id_url: documentUrls.legal_representative_id_url || '',
          authorization_letter_url: documentUrls.authorization_letter_url || '',
          individual_full_name: isOrganization ? '' : form.individual_full_name.trim(),
          individual_identity_number: isOrganization ? '' : form.individual_identity_number.trim(),
          individual_id_front_url: documentUrls.individual_id_front_url || '',
          individual_id_back_url: documentUrls.individual_id_back_url || '',
          individual_selfie_url: documentUrls.individual_selfie_url || '',
          individual_tax_code: isOrganization ? '' : form.individual_tax_code.trim(),
          terms_accepted: form.terms_accepted,
        },
      })
    } catch (err) {
      const message = getApiMessage(err, 'Không thể tải tài liệu lên hệ thống.')
      setError(message)
      toast.error(message)
      return
    } finally {
      setIsUploading(false)
    }
  }

  if (!isAuthenticated) return null

  if (profileQuery.isLoading || requestQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <SectionHeader
          title="Đăng ký trở thành ban tổ chức"
          description="Đang tải dữ liệu từ hệ thống..."
        />
        <p className="text-sm text-muted">Vui lòng đợi trong giây lát.</p>
      </div>
    )
  }

  if (isOrganizer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <SectionHeader
          title="Đăng ký trở thành ban tổ chức"
          description="Tài khoản của bạn đã có quyền Organizer"
        />
        <div className="glass-panel rounded-lg p-6 text-center">
          <Building2 className="mx-auto size-10 text-primary" />
          <p className="mt-4 text-muted">
            Bạn có thể quản lý sự kiện tại khu vực Organizer.
          </p>
          <Link
            to="/organizer"
            className="mt-5 inline-flex rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 active:scale-[0.98]"
          >
            Mở Organizer Portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Đăng ký trở thành ban tổ chức"
        description="Gửi thông tin tổ chức để Admin xét duyệt và cấp quyền Organizer"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="glass-panel rounded-lg p-6">
          {editingRequest && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              Bạn đang chỉnh sửa yêu cầu đã gửi. Sau khi lưu, yêu cầu sẽ được đưa về trạng thái chờ duyệt.
            </div>
          )}

          {hasPendingIndividualRequest && !editingRequest && (
            <p className="mb-4 text-sm text-muted">
              Bạn đã có yêu cầu cá nhân đang chờ duyệt. Vui lòng đợi Admin xử lý trước khi gửi yêu cầu mới.
            </p>
          )}

          {canSubmit && (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <FormSection
                title="Loại đăng ký"
                description="Chọn đúng nhóm đăng ký để hệ thống yêu cầu bộ thông tin phù hợp."
              >
                <RequestTypeSelector
                  value={form.request_type}
                  onChange={handleTypeChange}
                  disabled={Boolean(editingRequest)}
                />
              </FormSection>

              <FormSection
                title="Thông tin hiển thị"
                description="Các thông tin này dùng để nhận diện organizer trên hệ thống."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Tên cá nhân/tổ chức"
                    value={form.organization_name}
                    onChange={handleChange('organization_name')}
                    placeholder={
                      form.request_type === 'ORGANIZATION'
                        ? 'EventHub Production JSC'
                        : 'Tên thương hiệu / nhóm tổ chức của bạn'
                    }
                    required
                  />
                  <Field
                    label="Số điện thoại"
                    value={form.business_phone}
                    onChange={handleChange('business_phone')}
                    placeholder="0901234567 hoặc +84901234567"
                    required
                  />
                  {form.request_type === 'ORGANIZATION' && (
                    <Field
                      label="Email tổ chức"
                      type="email"
                      value={form.business_email}
                      onChange={handleChange('business_email')}
                      placeholder="ops@example.com"
                      required
                    />
                  )}
                </div>

                <div>
                  <span className="text-sm font-semibold text-muted">
                    Ảnh đại diện
                    <RequiredMark />
                  </span>
                  <div className="mt-2 flex items-center gap-4 rounded-lg border border-border-soft bg-surface p-4">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Ảnh đại diện"
                        className="size-20 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="grid size-20 place-items-center rounded-lg bg-panel">
                        <UserCircle className="size-10 text-muted" />
                      </div>
                    )}
                    <div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-soft px-4 py-2 text-sm font-bold text-content transition hover:border-primary">
                        <Camera className="size-4" />
                        Chọn ảnh
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                      </label>
                      <p className="mt-2 text-xs text-subtle">
                        Dùng logo, ảnh nhận diện thương hiệu hoặc ảnh đại diện rõ mặt.
                      </p>
                    </div>
                  </div>
                </div>
              </FormSection>

              {form.request_type === 'ORGANIZATION' && (
                <>
                  <FormSection
                    title="Thông tin pháp lý tổ chức"
                    description="Dùng để đối chiếu với giấy đăng ký kinh doanh và hồ sơ đại diện."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Mã số thuế"
                        value={form.tax_code}
                        onChange={handleChange('tax_code')}
                        placeholder="10 hoặc 13 chữ số"
                        required
                      />
                      <Field
                        label="Người đại diện pháp luật"
                        value={form.legal_representative_name}
                        onChange={handleChange('legal_representative_name')}
                        placeholder="NGUYỄN VĂN A"
                        required
                      />
                      <Field
                        label="Chức vụ"
                        value={form.legal_representative_position}
                        onChange={handleChange('legal_representative_position')}
                        placeholder="Giám đốc / Tổng giám đốc"
                        required
                      />
                    </div>
                  </FormSection>

                  <FormSection
                    title="Tài liệu xác minh tổ chức"
                    description="Tải bản scan hoặc ảnh chụp rõ nét để Admin kiểm tra nhanh hơn."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FileField
                        label="Giấy ĐKDN/ERC"
                        required
                        file={selectedDocuments.legal_document_url}
                        existingUrl={form.legal_document_url}
                        onChange={handleDocumentChange('legal_document_url')}
                      />
                      <FileField
                        label="Giấy phép kinh doanh đặc thù"
                        file={selectedDocuments.business_license_url}
                        existingUrl={form.business_license_url}
                        onChange={handleDocumentChange('business_license_url')}
                      />
                      <FileField
                        label="Giấy tờ tùy thân người đại diện"
                        required
                        file={selectedDocuments.legal_representative_id_url}
                        existingUrl={form.legal_representative_id_url}
                        onChange={handleDocumentChange('legal_representative_id_url')}
                      />
                      <FileField
                        label="Giấy ủy quyền"
                        file={selectedDocuments.authorization_letter_url}
                        existingUrl={form.authorization_letter_url}
                        onChange={handleDocumentChange('authorization_letter_url')}
                      />
                    </div>
                  </FormSection>
                </>
              )}

              {form.request_type === 'INDIVIDUAL' && (
                <>
                  <FormSection
                    title="Thông tin định danh cá nhân"
                    description="Thông tin cần trùng khớp với giấy tờ tùy thân dùng để xác minh."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Họ tên pháp lý"
                        value={form.individual_full_name}
                        onChange={handleChange('individual_full_name')}
                        placeholder="NGUYỄN VĂN A"
                        required
                      />
                      <Field
                        label="Số CCCD/Hộ chiếu"
                        value={form.individual_identity_number}
                        onChange={handleChange('individual_identity_number')}
                        placeholder="12 số CCCD hoặc số hộ chiếu"
                        required
                      />
                      <Field
                        label="Mã số thuế cá nhân"
                        value={form.individual_tax_code}
                        onChange={handleChange('individual_tax_code')}
                        placeholder="10 hoặc 13 chữ số"
                        required
                      />
                    </div>
                  </FormSection>

                  <FormSection
                    title="Tài liệu xác minh cá nhân"
                    description="Ảnh chụp cần rõ mặt, rõ số giấy tờ và không bị che khuất."
                  >
                    <div className="grid gap-4 sm:grid-cols-3">
                      <FileField
                        label="CCCD mặt trước"
                        required
                        imageOnly
                        file={selectedDocuments.individual_id_front_url}
                        existingUrl={form.individual_id_front_url}
                        onChange={handleDocumentChange('individual_id_front_url')}
                      />
                      <FileField
                        label="CCCD mặt sau"
                        required
                        imageOnly
                        file={selectedDocuments.individual_id_back_url}
                        existingUrl={form.individual_id_back_url}
                        onChange={handleDocumentChange('individual_id_back_url')}
                      />
                      <FileField
                        label="Ảnh chân dung/Selfie"
                        required
                        imageOnly
                        file={selectedDocuments.individual_selfie_url}
                        existingUrl={form.individual_selfie_url}
                        onChange={handleDocumentChange('individual_selfie_url')}
                      />
                    </div>
                  </FormSection>
                </>
              )}

              <FormSection
                title="Mô tả hoạt động"
                description="Tóm tắt kinh nghiệm tổ chức, loại sự kiện dự kiến và phạm vi hoạt động."
              >
                <label className="block">
                  <span className="text-sm font-semibold text-muted">
                    Mô tả
                    <RequiredMark />
                  </span>
                  <textarea
                    className="mt-2 min-h-32 w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary"
                    value={form.organization_description}
                    onChange={handleChange('organization_description')}
                    placeholder={
                      form.request_type === 'ORGANIZATION'
                        ? 'Giới thiệu ngắn về tổ chức, lĩnh vực hoạt động, quy mô...'
                        : 'Giới thiệu kinh nghiệm tổ chức sự kiện, loại sự kiện dự kiến triển khai...'
                    }
                    required
                    minLength={10}
                  />
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.terms_accepted}
                    onChange={handleCheckboxChange('terms_accepted')}
                    className="mt-1 size-4 shrink-0 accent-orange-500"
                    required
                  />
                  <span className="text-sm leading-6 text-muted">
                    Tôi xác nhận thông tin cung cấp là chính xác và đồng ý với{' '}
                    <PolicyLink to="/policies?policy_type=ORGANIZER_TERMS">
                      Điều khoản dịch vụ dành cho Nhà tổ chức
                    </PolicyLink>
                    ,{' '}
                    <PolicyLink to="/policies?policy_type=EVENT_CREATION_REVIEW">
                      quy chế sự kiện
                    </PolicyLink>
                    ,{' '}
                    <PolicyLink to="/policies?policy_type=TICKET_BOOKING">
                      quy chế bán vé
                    </PolicyLink>
                    {' '}và{' '}
                    <PolicyLink to="/policies?policy_type=REFUND">
                      chính sách hoàn tiền
                    </PolicyLink>
                    {' '}của EventHub.
                    <RequiredMark />
                  </span>
                </label>
              </FormSection>



              <div className="flex flex-wrap justify-end gap-3">
                {editingRequest && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-md border border-border-soft px-5 py-3 text-sm font-bold text-content transition hover:border-primary"
                  >
                    Hủy chỉnh sửa
                  </button>
                )}
                <button
                  type="submit"
                  disabled={requestMutation.isPending || isUploading}
                  className="inline-flex items-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60"
                >
                  {(requestMutation.isPending || isUploading) && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {isUploading
                    ? 'Đang tải tài liệu...'
                    : requestMutation.isPending
                      ? 'Đang lưu...'
                      : editingRequest
                        ? 'Cập nhật yêu cầu'
                        : 'Gửi yêu cầu'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside>
          {requestQuery.isError ? (
            <div className="rounded-lg border border-error/30 bg-error/10 p-5 text-sm text-error">
              Không thể tải yêu cầu từ máy chủ. Vui lòng thử lại sau.
            </div>
          ) : (
            <StatusSummary requests={requests} onEdit={handleEditRequest} />
          )}
        </aside>
      </div>
    </div>
  )
}

function FormSection({ title, description, children }) {
  return (
    <section className="space-y-4 border-t border-border-soft/30 pt-5 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-display text-lg font-extrabold text-content">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-subtle">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </section>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-muted">
        {label}
        {required && <RequiredMark />}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="mt-2 h-11 w-full rounded-md border border-border-soft bg-surface px-3 outline-none focus:border-primary"
      />
    </label>
  )
}

function FileField({ label, file, existingUrl = '', onChange, required = false, imageOnly = false }) {
  return (
    <label className="flex min-h-64 flex-col justify-between rounded-lg border border-border-soft bg-surface p-4">
      <span className="block min-h-12 text-sm font-semibold leading-6 text-muted">
        {label}
        {required && <RequiredMark />}
      </span>
      <DocumentPreview file={file} existingUrl={existingUrl} />
      <div>
        <span className="inline-flex cursor-pointer rounded-md border border-border-soft px-4 py-2 text-sm font-bold text-content transition hover:border-primary">
          Chọn file
          <input
            type="file"
            accept={imageOnly ? 'image/jpeg,image/png,image/webp' : '.pdf,.docx,image/*'}
            className="hidden"
            onChange={onChange}
          />
        </span>
        <span className="mt-3 block truncate text-xs text-subtle">
          {file
            ? file.name
            : existingUrl
              ? 'Đã có tài liệu. Chọn file mới để thay thế.'
              : imageOnly
                ? 'Ảnh JPG/PNG/WEBP'
                : 'PDF, DOCX hoặc ảnh JPG/PNG/WEBP'}
        </span>
      </div>
    </label>
  )
}

function DocumentPreview({ file, existingUrl = '' }) {
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (!file || !file.type?.startsWith('image/')) {
      setPreviewUrl('')
      return undefined
    }

    const nextUrl = URL.createObjectURL(file)
    setPreviewUrl(nextUrl)

    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  if (!file) {
    if (existingUrl) {
      if (isImageUrl(existingUrl)) {
        return (
          <img
            src={existingUrl}
            alt="Tài liệu đã tải"
            className="my-3 h-28 w-full rounded-lg border border-border-soft/60 object-cover"
          />
        )
      }

      return (
        <div className="my-3 grid h-28 place-items-center rounded-lg border border-border-soft/60 bg-panel/60 px-3 text-center text-xs font-semibold text-subtle">
          Đã có tài liệu
        </div>
      )
    }

    return (
      <div className="my-3 grid h-28 place-items-center rounded-lg border border-dashed border-border-soft/60 bg-panel/60 text-xs font-semibold text-subtle">
        Chưa chọn file
      </div>
    )
  }

  if (!previewUrl) {
    return (
      <div className="my-3 grid h-28 place-items-center rounded-lg border border-border-soft/60 bg-panel/60 px-3 text-center text-xs font-semibold text-subtle">
        {file.name}
      </div>
    )
  }

  return (
    <img
      src={previewUrl}
      alt={file.name}
      className="my-3 h-28 w-full rounded-lg border border-border-soft/60 object-cover"
    />
  )
}

function RequiredMark() {
  return <span className="text-error"> *</span>
}

function isImageUrl(url = '') {
  return (
    /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(url) ||
    /\/image\/upload\//i.test(url)
  )
}

function PolicyLink({ to, children }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-tertiary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}
