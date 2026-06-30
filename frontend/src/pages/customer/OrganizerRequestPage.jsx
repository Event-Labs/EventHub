import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Camera, CheckCircle2, Clock3, History, Loader2, UserCircle, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { getUserRoles, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import {
  fetchMyOrganizerRequests,
  submitOrganizerRequest,
} from '@/services/organizerRequests.js'
import { uploadOrganizerAvatar } from '@/services/uploads.js'
import { getProfile } from '@/services/user.service.js'

const emptyForm = {
  request_type: 'INDIVIDUAL',
  organization_name: '',
  organization_description: '',
  business_email: '',
  business_phone: '',
  organization_avatar_url: '',
  tax_code: '',
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

function requestTypeLabel(type) {
  return type === 'ORGANIZATION' ? 'Tổ chức' : 'Cá nhân'
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

function StatusSummary({ requests }) {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!requests.length) {
    return <EmptyStatus />
  }

  const latestRequest = requests[requests.length - 1]

  return (
    <>
      <div className="space-y-3">
        <StatusCard request={latestRequest} />
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
              <StatusList requests={requests} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusList({ requests }) {
  return (
    <div className="space-y-4">
      {requests.map((request, index) => (
        <StatusCard
          key={request.id}
          request={request}
          titlePrefix={requests.length > 1 ? `Yêu cầu ${index + 1}` : ''}
        />
      ))}
    </div>
  )
}

function StatusCard({ request, titlePrefix }) {
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
        </div>
      </div>
    </div>
  )
}

export function OrganizerRequestPage() {
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
  const [previewUrl, setPreviewUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
    !hasPendingIndividualRequest

  const submitMutation = useMutation({
    mutationFn: submitOrganizerRequest,
    onSuccess: (request) => {
      setSuccess(
        request.request_type === 'ORGANIZATION'
          ? 'Yêu cầu đã được gửi. Vui lòng kiểm tra email tổ chức để xác thực trước khi admin duyệt.'
          : 'Yêu cầu đã được gửi thành công.',
      )
      setError('')
      setForm(emptyForm)
      setSelectedAvatar(null)
      setPreviewUrl('')
      queryClient.invalidateQueries({ queryKey: ['my-organizer-requests'] })
    },
    onError: (err) => {
      const apiError = err.response?.data
      if (apiError?.errors && Array.isArray(apiError.errors)) {
        setError(apiError.errors.map((item) => item.message).join(', '))
      } else {
        setError(apiError?.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.')
      }
      setSuccess('')
    },
  })

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
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

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn tệp ảnh hợp lệ.')
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

    if (isOrganization && !selectedAvatar && !avatarUrl) {
      setError('Vui lòng tải ảnh đại diện của tổ chức.')
      return
    }

    try {
      if (isOrganization && selectedAvatar) {
        setIsUploading(true)
        const uploadResult = await uploadOrganizerAvatar(selectedAvatar)
        avatarUrl = uploadResult.secure_url || uploadResult.url
      }
    } catch (err) {
      setError(err.message || 'Không thể tải ảnh đại diện lên hệ thống.')
      return
    } finally {
      setIsUploading(false)
    }

    submitMutation.mutate({
      request_type: form.request_type,
      organization_name: form.organization_name.trim(),
      organization_description: form.organization_description.trim(),
      business_email: isOrganization ? form.business_email.trim() : '',
      business_phone: form.business_phone.trim(),
      organization_avatar_url: isOrganization ? avatarUrl : '',
      tax_code: isOrganization ? form.tax_code.trim() : '',
    })
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
          {hasPendingIndividualRequest && (
            <p className="mb-4 text-sm text-muted">
              Bạn đã có yêu cầu cá nhân đang chờ duyệt. Vui lòng đợi Admin xử lý trước khi gửi yêu cầu mới.
            </p>
          )}

          {canSubmit && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <span className="text-sm font-semibold text-muted">Loại đăng ký</span>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {requestTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleTypeChange(option.value)}
                      className={`rounded-lg border p-4 text-left transition ${
                        form.request_type === option.value
                          ? 'border-primary bg-primary/10 text-content'
                          : 'border-border-soft bg-surface text-muted hover:border-primary/60'
                      }`}
                    >
                      <span className="font-bold">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-subtle">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label="Tên tổ chức"
                value={form.organization_name}
                onChange={handleChange('organization_name')}
                placeholder={
                  form.request_type === 'ORGANIZATION'
                    ? 'EventHub Production JSC'
                    : 'Tên thương hiệu / nhóm tổ chức của bạn'
                }
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
              <Field
                label="Số điện thoại"
                value={form.business_phone}
                onChange={handleChange('business_phone')}
                placeholder="0901234567 hoặc +84901234567"
                required
              />
              {form.request_type === 'ORGANIZATION' && (
                <>
                  <Field
                    label="Mã số thuế"
                    value={form.tax_code}
                    onChange={handleChange('tax_code')}
                    placeholder="10 hoặc 13 chữ số"
                    required
                  />
                  <div>
                    <span className="text-sm font-semibold text-muted">
                      Ảnh đại diện tổ chức
                    </span>
                    <div className="mt-2 flex items-center gap-4 rounded-lg border border-border-soft bg-surface p-4">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Ảnh đại diện tổ chức"
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
                          JPG, PNG. Nên dùng logo hoặc ảnh nhận diện chính thức.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <label className="block">
                <span className="text-sm font-semibold text-muted">Mô tả</span>
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

              {error && <p className="text-sm text-error">{error}</p>}
              {success && <p className="text-sm text-success">{success}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitMutation.isPending || isUploading}
                  className="inline-flex items-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60"
                >
                  {(submitMutation.isPending || isUploading) && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {isUploading ? 'Đang tải ảnh...' : submitMutation.isPending ? 'Đang gửi...' : 'Gửi yêu cầu'}
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
            <StatusSummary requests={requests} />
          )}
        </aside>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-muted">{label}</span>
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
