import { clearAuthSession, getAuthToken, updateStoredUser, getUserRoles } from '@/lib/auth.js'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  Globe,
  IdCard,
  InfoIcon,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react'
import { getProfile, updateProfile, changePassword } from '@/services/user.service.js'
import { uploadAvatar } from '@/services/uploads.js'
import { fetchOrganizerProfile } from '@/services/organizerEvents.js'

const EMPTY_TEXT = 'Chưa cập nhật'

export function ProfilePage() {
  const [mode, setMode] = useState('view')
  const queryClient = useQueryClient()

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const token = getAuthToken()
      if (!token) {
        throw { response: { status: 401 }, message: 'Vui lòng đăng nhập để xem hồ sơ.' }
      }
      return getProfile()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const roles = getUserRoles(user)
  const isOrganizer = roles.includes('organizer')
  const organizerQuery = useQuery({
    queryKey: ['organizer-profile'],
    queryFn: fetchOrganizerProfile,
    enabled: Boolean(user && isOrganizer && mode === 'view'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="animate-pulse text-muted">Đang tải thông tin hồ sơ...</p>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-error/10">
          <AlertCircle className="size-10 text-error" />
        </div>
        <h2 className="font-display text-2xl font-bold text-white">
          {error?.response?.status === 401 ? 'Phiên làm việc hết hạn' : 'Đã có lỗi xảy ra'}
        </h2>
        <p className="mt-3 text-muted">
          {error?.response?.data?.message || error?.message || 'Không thể tải thông tin hồ sơ của bạn.'}
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['profile'] })}
            className="rounded-md border border-border-soft bg-surface px-6 py-2 font-bold text-white hover:bg-panel-soft"
          >
            Thử lại
          </button>
          {error?.response?.status === 401 && (
            <a href="/login" className="rounded-md bg-primary px-6 py-2 font-bold text-slate-950 hover:bg-sky-300">
              Đăng nhập ngay
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold text-white">
            {isOrganizer ? 'Hồ sơ Organizer' : 'Hồ sơ cá nhân'}
          </h1>
          <p className="mt-2 text-muted">
            {isOrganizer
              ? 'Thông tin định danh, liên hệ và trạng thái hồ sơ organizer của bạn.'
              : 'Thông tin tài khoản, bảo mật và lịch sử sử dụng EventHub.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {mode !== 'edit' && (
            <button
              onClick={() => setMode('edit')}
              className={`rounded-md border px-5 py-3 font-bold transition-all ${
                mode === 'view'
                  ? 'border-primary bg-primary text-slate-950'
                  : 'border-border-soft text-subtle hover:text-white'
              }`}
            >
              Chỉnh sửa hồ sơ
            </button>
          )}
          <button
            onClick={() => setMode('password')}
            className={`rounded-md border px-5 py-3 font-bold transition-all ${
              mode === 'password'
                ? 'border-primary bg-primary text-slate-950'
                : 'border-border-soft text-subtle hover:text-white'
            }`}
          >
            Đổi mật khẩu
          </button>
        </div>
      </div>

      {mode === 'view' && isOrganizer && (
        <OrganizerProfileView
          user={user}
          organizer={organizerQuery.data}
          isLoading={organizerQuery.isLoading}
          error={organizerQuery.error}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['organizer-profile'] })}
        />
      )}
      {mode === 'view' && !isOrganizer && <ProfileView user={user} />}
      {mode === 'edit' && (
        <ProfileEdit
          user={user}
          onDone={() => {
            setMode('view')
            queryClient.invalidateQueries({ queryKey: ['profile'] })
            queryClient.invalidateQueries({ queryKey: ['organizer-profile'] })
          }}
        />
      )}
      {mode === 'password' && <ChangePassword user={user} onDone={() => setMode('view')} />}
    </div>
  )
}

function OrganizerProfileView({ user, organizer, isLoading, error, onRetry }) {
  if (isLoading) {
    return (
      <div className="glass-panel flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg p-6">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-muted">Đang tải thông tin organizer...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-panel rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto size-10 text-error" />
        <h2 className="mt-3 font-display text-2xl font-bold text-white">Không thể tải hồ sơ organizer</h2>
        <p className="mt-2 text-muted">{error?.response?.data?.message || 'Vui lòng thử lại sau.'}</p>
        <button onClick={onRetry} className="mt-5 rounded-md bg-primary px-5 py-3 font-bold text-slate-950">
          Tải lại
        </button>
      </div>
    )
  }

  const type = normalizeOrganizerType(organizer?.request_type)
  const isPersonal = type === 'personal'
  const displayName = isPersonal
    ? firstValue(organizer?.individual_full_name, user.full_name, organizer?.organization_name)
    : firstValue(organizer?.organization_name, user.full_name)
  const logoUrl = firstValue(organizer?.organization_avatar_url, user.avatar_url)

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="glass-panel h-fit rounded-lg p-6">
        <div className="flex flex-col items-center text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={displayName || 'Organizer'}
              className="size-36 rounded-2xl object-cover ring-4 ring-primary/25"
            />
          ) : (
            <div className="flex size-36 items-center justify-center rounded-2xl bg-surface ring-4 ring-primary/25">
              {isPersonal ? <UserCircle className="size-20 text-muted" /> : <Building2 className="size-20 text-muted" />}
            </div>
          )}
          <h2 className="mt-5 break-words font-display text-2xl font-bold text-white">{valueOrEmpty(displayName)}</h2>
          <p className="mt-1 text-sm font-semibold text-primary">{organizerTypeLabel(organizer?.request_type)}</p>
        </div>

        <div className="mt-6 space-y-3 rounded-lg border border-border-soft bg-surface p-4">
          <CompactLine icon={ShieldCheck} label="Trạng thái" value={statusLabel(organizer?.status)} />
          <CompactLine icon={Calendar} label="Ngày tạo" value={formatDateTime(organizer?.created_at)} />
          <CompactLine icon={Clock} label="Cập nhật lần cuối" value={formatDateTime(organizer?.updated_at)} />
        </div>
      </aside>

      <div className="space-y-6">
        <InfoSection title="Thông tin cơ bản" icon={InfoIcon}>
          <Info icon={isPersonal ? UserCircle : Building2} label={isPersonal ? 'Họ và tên' : 'Tên tổ chức/doanh nghiệp'} value={displayName} />
          <Info icon={Users} label="Loại organizer" value={organizerTypeLabel(organizer?.request_type)} />
          <Info icon={Mail} label={isPersonal ? 'Email' : 'Email liên hệ'} value={firstValue(organizer?.business_email, user.email)} linkType="email" />
          <Info icon={Phone} label="Số điện thoại" value={firstValue(organizer?.business_phone, user.phone)} />
        </InfoSection>

        <InfoSection title="Thông tin liên hệ" icon={MapPin}>
          <Info icon={MapPin} label="Địa chỉ" value={formatAddress(user)} className="md:col-span-2" />
          <Info icon={Globe} label="Website" value={organizer?.website_url} linkType="url" />
          <Info icon={Link2} label="Mạng xã hội" value={organizer?.social_url} linkType="url" />
        </InfoSection>

        {!isPersonal && (
          <InfoSection title="Thông tin tổ chức" icon={BriefcaseBusiness}>
            <Info icon={IdCard} label="Mã số thuế" value={organizer?.tax_code} />
            <Info icon={FileCheck2} label="Giấy phép kinh doanh" value={organizer?.business_license_url} linkType="url" />
            <Info icon={UserCircle} label="Người đại diện" value={organizer?.legal_representative_name} />
            <Info icon={BriefcaseBusiness} label="Chức vụ người đại diện" value={organizer?.legal_representative_position} />
            <Info icon={FileCheck2} label="Giấy ủy quyền" value={organizer?.authorization_letter_url} linkType="url" />
            <Info icon={FileCheck2} label="Tài liệu pháp lý" value={organizer?.legal_document_url} linkType="url" />
          </InfoSection>
        )}

        {isPersonal && (
          <InfoSection title="Thông tin cá nhân" icon={UserCircle}>
            <Info icon={UserCircle} label="Họ tên pháp lý" value={organizer?.individual_full_name} />
            <Info icon={IdCard} label="Số giấy tờ cá nhân" value={organizer?.individual_identity_number} />
            <Info icon={IdCard} label="Mã số thuế cá nhân" value={organizer?.individual_tax_code} />
            <Info icon={FileCheck2} label="Giấy tờ mặt trước" value={organizer?.individual_id_front_url} linkType="url" />
            <Info icon={FileCheck2} label="Giấy tờ mặt sau" value={organizer?.individual_id_back_url} linkType="url" />
            <Info icon={FileCheck2} label="Ảnh xác minh" value={organizer?.individual_selfie_url} linkType="url" />
          </InfoSection>
        )}

        <InfoSection title="Giới thiệu" icon={FileCheck2}>
          <Info icon={FileCheck2} label="Mô tả/giới thiệu" value={organizer?.description || user.bio} className="md:col-span-2" multiline />
        </InfoSection>

        <InfoSection title="Trạng thái hồ sơ" icon={ShieldCheck}>
          <Info icon={ShieldCheck} label="Trạng thái xác minh" value={statusLabel(organizer?.status)} />
          <Info icon={CheckCircle2} label="Đã chấp nhận điều khoản" value={booleanLabel(organizer?.terms_accepted)} />
          <Info icon={Calendar} label="Ngày chấp nhận điều khoản" value={formatDateTime(organizer?.terms_accepted_at)} />
          <Info icon={Clock} label="Cập nhật lần cuối" value={formatDateTime(organizer?.updated_at)} />
        </InfoSection>
      </div>
    </div>
  )
}

function ProfileView({ user }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="glass-panel rounded-lg p-6 text-center">
        <div className="relative mx-auto size-36">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.full_name} className="mx-auto size-36 rounded-full object-cover ring-4 ring-primary/30" />
          ) : (
            <div className="mx-auto flex size-36 items-center justify-center rounded-full bg-surface ring-4 ring-primary/30">
              <UserCircle className="size-20 text-muted" />
            </div>
          )}
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold text-white">{valueOrEmpty(user.full_name)}</h2>
        <p className="text-muted">{roleLabel(user.roles)}</p>
      </aside>
      <InfoSection title="Thông tin cá nhân" icon={UserCircle}>
        <Info icon={UserCircle} label="Họ và tên" value={user.full_name} />
        <Info icon={Mail} label="Email" value={user.email} linkType="email" />
        <Info icon={Phone} label="Số điện thoại" value={user.phone} />
        <Info icon={Calendar} label="Ngày sinh" value={formatDate(user.dob)} />
        <Info icon={MapPin} label="Thành phố" value={user.city} />
        <Info icon={MapPin} label="Địa chỉ" value={user.address} className="md:col-span-2" />
      </InfoSection>
    </div>
  )
}

function ProfileEdit({ user, onDone }) {
  const [formData, setFormData] = useState({
    full_name: user.full_name || '',
    phone: user.phone || '',
    address: user.address || '',
    dob: user.dob ? user.dob.split('T')[0] : '',
    city: user.city || '',
    avatar_url: user.avatar_url || '',
  })
  const [errors, setErrors] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(user.avatar_url || '')
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updatedUser) => {
      setMessage({ type: 'success', text: 'Cập nhật hồ sơ thành công!' })
      updateStoredUser(updatedUser)
      setTimeout(onDone, 1500)
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Không thể cập nhật hồ sơ.' })
    },
  })

  const validate = () => {
    const newErrors = {}
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Vui lòng nhập họ và tên.'
    }

    if (formData.phone) {
      const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/
      if (!phoneRegex.test(formData.phone)) {
        newErrors.phone = 'Số điện thoại không đúng định dạng Việt Nam. Ví dụ: 09xxxxxxxx hoặc +849xxxxxxxx.'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Vui lòng chọn tệp ảnh hợp lệ (JPG, PNG).' })
        return
      }
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsUploading(true)
    setMessage({ type: '', text: '' })

    try {
      let finalAvatarUrl = formData.avatar_url
      if (selectedFile) {
        const uploadRes = await uploadAvatar(selectedFile)
        finalAvatarUrl = uploadRes.secure_url
      }

      updateMutation.mutate({ ...formData, avatar_url: finalAvatarUrl })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Lỗi tải ảnh lên Cloudinary.' })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="glass-panel h-fit rounded-lg p-6 text-center">
        <div className="relative mx-auto size-36">
          {previewUrl ? (
            <img src={previewUrl} alt="Ảnh đại diện xem trước" className="size-36 rounded-full object-cover ring-4 ring-primary/30" />
          ) : (
            <div className="flex size-36 items-center justify-center rounded-full bg-surface ring-4 ring-primary/30">
              <UserCircle className="size-20 text-muted" />
            </div>
          )}
          <label className="absolute bottom-1 right-1 grid size-10 cursor-pointer place-items-center rounded-full bg-primary text-slate-950 shadow-lg transition-transform hover:scale-110">
            <Camera className="size-5" />
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        </div>
        <p className="mt-4 text-sm text-subtle">JPG, PNG. Đề xuất 400x400px.</p>
      </aside>
      <section className="glass-panel rounded-lg p-6">
        <h2 className="font-display text-2xl font-bold text-white">Chỉnh sửa hồ sơ</h2>

        {message.text && (
          <div className={`mt-4 flex items-center gap-2 rounded-md p-3 text-sm ${
            message.type === 'success' ? 'border border-success/20 bg-success/10 text-success' : 'border border-error/20 bg-error/10 text-error'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Input label="Họ và tên" value={formData.full_name} error={errors.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
            <Input label="Số điện thoại" value={formData.phone} error={errors.phone} placeholder="09xxxxxxxx hoặc +849xxxxxxxx" onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="Ngày sinh" type="date" value={formData.dob} error={errors.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
            <Input label="Thành phố" value={formData.city} error={errors.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
            <Input label="Địa chỉ" value={formData.address} error={errors.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="md:col-span-2" />
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button type="button" onClick={onDone} className="rounded-md px-5 py-3 font-bold text-muted transition-colors hover:bg-panel-soft" disabled={updateMutation.isPending || isUploading}>
              Hủy
            </button>
            <button type="submit" disabled={updateMutation.isPending || isUploading} className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70">
              {updateMutation.isPending || isUploading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isUploading ? 'Đang tải ảnh...' : updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ChangePassword({ user, onDone }) {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [message, setMessage] = useState({ type: '', text: '' })

  const hasPassword = user?.hasPassword
  const checks = {
    length: form.newPassword.length >= 8,
    uppercase: /[A-Z]/.test(form.newPassword),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(form.newPassword),
  }
  const isStrengthValid = Object.values(checks).every(Boolean)
  const isMatch = form.confirmPassword !== '' && form.newPassword === form.confirmPassword
  const canSubmit = isStrengthValid && isMatch && (!hasPassword || form.currentPassword !== '')

  const mutation = useMutation({
    mutationFn: () => changePassword(form.currentPassword, form.newPassword),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.' })
      setTimeout(() => {
        clearAuthSession()
        window.location.href = '/login'
      }, 2000)
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Đã có lỗi xảy ra.' })
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    mutation.mutate()
  }

  return (
    <section className="glass-panel mx-auto max-w-xl rounded-lg p-6">
      <h2 className="text-center font-display text-2xl font-bold text-white">
        {hasPassword ? 'Đổi mật khẩu' : 'Thiết lập mật khẩu mới'}
      </h2>
      <p className="mt-2 text-center text-sm text-subtle">
        {hasPassword
          ? 'Cập nhật mật khẩu định kỳ để tăng cường bảo mật.'
          : 'Bạn đang đăng nhập bằng Google, hãy thiết lập mật khẩu để có thể đăng nhập trực tiếp bằng email.'}
      </p>

      {message.text && (
        <div className={`mt-6 flex items-center gap-2 rounded-md p-3 text-sm ${
          message.type === 'success' ? 'border border-success/20 bg-success/10 text-success' : 'border border-error/20 bg-error/10 text-error'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {hasPassword && (
          <Input label="Mật khẩu hiện tại" type="password" placeholder="Nhập mật khẩu hiện tại" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        )}

        <div className="space-y-3">
          <Input label="Mật khẩu mới" type="password" placeholder="Nhập mật khẩu mới" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />

          {form.newPassword && (
            <div className="flex flex-col gap-1.5 pl-1">
              <StrengthIndicator label="Tối thiểu 8 ký tự" active={checks.length} />
              <StrengthIndicator label="Có ít nhất 1 chữ in hoa (A-Z)" active={checks.uppercase} />
              <StrengthIndicator label="Có ít nhất 1 ký tự đặc biệt" active={checks.special} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Input label="Xác nhận mật khẩu mới" type="password" placeholder="Nhập lại mật khẩu mới" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />

          {form.confirmPassword && (
            <div className="pl-1">
              <StrengthIndicator label={isMatch ? 'Mật khẩu xác nhận khớp' : 'Mật khẩu xác nhận chưa khớp'} active={isMatch} />
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDone} className="rounded-md px-5 py-3 font-bold text-muted transition-colors hover:bg-panel-soft" disabled={mutation.isPending}>
            Hủy
          </button>
          <button type="submit" disabled={!canSubmit || mutation.isPending} className="flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50">
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {hasPassword ? 'Cập nhật mật khẩu' : 'Lưu mật khẩu'}
          </button>
        </div>
      </form>
    </section>
  )
}

function InfoSection({ title, icon: Icon, children }) {
  return (
    <section className="glass-panel rounded-lg p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Info({ icon: Icon, label, value, className = '', multiline = false, linkType }) {
  const displayValue = valueOrEmpty(value)
  const isEmpty = displayValue === EMPTY_TEXT
  const href = !isEmpty && linkType === 'email'
    ? `mailto:${displayValue}`
    : !isEmpty && linkType === 'url'
      ? normalizeUrl(displayValue)
      : null

  return (
    <div className={`rounded-lg border border-border-soft bg-surface p-4 transition-all hover:border-primary/30 ${className}`}>
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4 shrink-0" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {href ? (
        <a href={href} target={linkType === 'url' ? '_blank' : undefined} rel={linkType === 'url' ? 'noreferrer' : undefined} className="mt-2 block break-words font-bold text-primary hover:underline">
          {displayValue}
        </a>
      ) : (
        <p className={`mt-2 break-words font-bold ${isEmpty ? 'text-subtle' : 'text-white'} ${multiline ? 'whitespace-pre-line leading-7' : ''}`}>
          {displayValue}
        </p>
      )}
    </div>
  )
}

function CompactLine({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="break-words text-sm font-bold text-white">{valueOrEmpty(value)}</p>
      </div>
    </div>
  )
}

function StrengthIndicator({ label, active }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-medium transition-all duration-300 ${active ? 'text-success' : 'text-error'}`}>
      {active ? <Check className="size-3.5 animate-in zoom-in duration-300" /> : <X className="size-3.5 text-error/70" />}
      <span>{label}</span>
    </div>
  )
}

function Input({ label, error, className = '', type, ...props }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={inputType}
          className={`w-full rounded-md border bg-surface p-3 pr-10 text-content outline-none transition-all focus:ring-2 focus:ring-primary/20 ${
            error ? 'border-error ring-error/10' : 'border-border-soft focus:border-primary'
          } disabled:opacity-50`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white">
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </label>
  )
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function valueOrEmpty(value) {
  if (value === undefined || value === null) return EMPTY_TEXT
  const text = String(value).trim()
  return text || EMPTY_TEXT
}

function normalizeOrganizerType(type) {
  const normalized = String(type || '').toLowerCase()
  if (['individual', 'personal', 'person'].includes(normalized)) return 'personal'
  if (['organization', 'business', 'company', 'enterprise'].includes(normalized)) return 'organization'
  return normalized || 'unknown'
}

function organizerTypeLabel(type) {
  const normalized = normalizeOrganizerType(type)
  if (normalized === 'personal') return 'Cá nhân'
  if (normalized === 'organization') return 'Tổ chức/Doanh nghiệp'
  return EMPTY_TEXT
}

function statusLabel(status) {
  const normalized = String(status || '').toLowerCase()
  const map = {
    verified: 'Đã xác minh',
    pending: 'Đang chờ xác minh',
    rejected: 'Bị từ chối',
    active: 'Đang hoạt động',
    inactive: 'Ngừng hoạt động',
    suspended: 'Tạm ngừng',
  }
  return map[normalized] || valueOrEmpty(status)
}

function booleanLabel(value) {
  if (value === true) return 'Đã chấp nhận'
  if (value === false) return 'Chưa chấp nhận'
  return EMPTY_TEXT
}

function formatDate(dateString) {
  if (!dateString) return EMPTY_TEXT
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return EMPTY_TEXT
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(dateString) {
  if (!dateString) return EMPTY_TEXT
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return EMPTY_TEXT
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatAddress(user) {
  return [user?.address, user?.city].filter(Boolean).join(', ')
}

function normalizeUrl(url) {
  const text = valueOrEmpty(url)
  if (text === EMPTY_TEXT) return undefined
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
}

function roleLabel(roles = []) {
  const labels = {
    organizer: 'Organizer',
    admin: 'Quản trị viên',
    super_admin: 'Quản trị viên cấp cao',
    staff: 'Nhân sự',
    customer: 'Khách hàng',
    user: 'Khách hàng',
  }
  const list = Array.isArray(roles) ? roles : []
  return list.map((role) => labels[String(role).toLowerCase()] || role).join(', ') || 'Khách hàng'
}
