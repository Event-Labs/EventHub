import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { getUserRoles, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import {
  fetchMyOrganizerRequest,
  submitOrganizerRequest,
} from '@/services/organizerRequests.js'
import { getProfile } from '@/services/user.service.js'

const emptyForm = {
  organization_name: '',
  organization_description: '',
  business_email: '',
  business_phone: '',
}

function StatusBanner({ request }) {
  if (!request) {
    return (
      <div className="rounded-lg border border-border-soft bg-panel p-5">
        <p className="text-sm text-muted">
          Bạn chưa gửi yêu cầu nào. Điền form bên trái để đăng ký trở thành ban tổ chức.
        </p>
      </div>
    )
  }

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
          <p className={`font-bold ${config.tone}`}>{config.title}</p>
          <p className="mt-1 text-sm text-muted">{config.body}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-subtle">Tổ chức</dt>
              <dd className="font-semibold">{request.organization_name}</dd>
            </div>
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
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  useEffect(() => {
    const email = profileQuery.data?.email
    if (email && !form.business_email) {
      setForm((current) => ({ ...current, business_email: email }))
    }
  }, [profileQuery.data?.email, form.business_email])

  const requestQuery = useQuery({
    queryKey: ['my-organizer-request'],
    queryFn: fetchMyOrganizerRequest,
    enabled: isAuthenticated,
  })

  const request = requestQuery.data
  const canSubmit =
    !isOrganizer &&
    (!request || request.status === 'REJECTED') &&
    request?.status !== 'PENDING'

  const submitMutation = useMutation({
    mutationFn: submitOrganizerRequest,
    onSuccess: () => {
      setSuccess('Yêu cầu đã được gửi thành công.')
      setError('')
      setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['my-organizer-request'] })
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

  const handleSubmit = (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    submitMutation.mutate({
      organization_name: form.organization_name.trim(),
      organization_description: form.organization_description.trim(),
      business_email: form.business_email.trim(),
      business_phone: form.business_phone.trim(),
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
          {!canSubmit && request?.status === 'PENDING' && (
            <p className="mb-4 text-sm text-muted">
              Bạn đã có yêu cầu đang chờ duyệt. Vui lòng đợi Admin xử lý.
            </p>
          )}

          {canSubmit && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field
                label="Tên tổ chức"
                value={form.organization_name}
                onChange={handleChange('organization_name')}
                placeholder="EventHub Production"
                required
              />
              <Field
                label="Email liên hệ"
                type="email"
                value={form.business_email}
                onChange={handleChange('business_email')}
                placeholder="ops@example.com"
                required
              />
              <Field
                label="Số điện thoại"
                value={form.business_phone}
                onChange={handleChange('business_phone')}
                placeholder="0901234567 hoặc +84901234567"
                required
              />
              <label className="block">
                <span className="text-sm font-semibold text-muted">Mô tả doanh nghiệp</span>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-primary"
                  value={form.organization_description}
                  onChange={handleChange('organization_description')}
                  placeholder="Giới thiệu ngắn về tổ chức, lĩnh vực hoạt động, quy mô..."
                  required
                  minLength={10}
                />
              </label>

              {error && <p className="text-sm text-error">{error}</p>}
              {success && <p className="text-sm text-success">{success}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 active:scale-[0.98] disabled:opacity-60"
                >
                  {submitMutation.isPending ? 'Đang gửi...' : 'Gửi yêu cầu'}
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
            <StatusBanner request={request} />
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
