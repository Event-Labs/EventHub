import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Mail, Phone, Save, UserCircle, Loader2, CheckCircle2, AlertCircle, MapPin, Calendar, Eye, EyeOff, Check, X } from 'lucide-react'
import { getProfile, updateProfile, changePassword } from '@/services/user.service.js'
import { uploadAvatar } from '@/services/uploads.js'

export function ProfilePage() {
  const [mode, setMode] = useState('view')
  const queryClient = useQueryClient()

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const token = localStorage.getItem('eventhub-token')
      if (!token) {
        throw { response: { status: 401 }, message: 'Vui lòng đăng nhập để xem hồ sơ.' }
      }
      return getProfile()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-muted animate-pulse">Đang tải thông tin hồ sơ...</p>
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
            className="rounded-md bg-surface px-6 py-2 font-bold text-white border border-border-soft hover:bg-panel-soft"
          >
            Thử lại
          </button>
          {error?.response?.status === 401 && (
            <a 
              href="/login"
              className="rounded-md bg-primary px-6 py-2 font-bold text-slate-950 hover:bg-sky-300"
            >
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
            Hồ sơ cá nhân
          </h1>
          <p className="mt-2 text-muted">
            Thông tin tài khoản, bảo mật và lịch sử sử dụng EventHub
          </p>
        </div>
        <div className="flex gap-3">
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
                ? 'bg-primary text-slate-950 border-primary'
                : 'border-border-soft text-subtle hover:text-white'
            }`}
          >
             Đổi mật khẩu
          </button>
        </div>
      </div>

      {mode === 'view' && <ProfileView user={user} />}
      {mode === 'edit' && (
        <ProfileEdit 
          user={user} 
          onDone={() => {
            setMode('view')
            queryClient.invalidateQueries({ queryKey: ['profile'] })
          }} 
        />
      )}
      {mode === 'password' && (
        <ChangePassword 
          user={user}
          onDone={() => setMode('view')} 
        />
      )}
    </div>
  )
}

function ProfileView({ user }) {
  const formatDate = (dateString) => {
    if (!dateString) return 'Chưa cập nhật'
    return new Date(dateString).toLocaleDateString('vi-VN')
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="glass-panel rounded-lg p-6 text-center">
        <div className="relative mx-auto size-36">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.full_name}
              className="mx-auto size-36 rounded-full object-cover ring-4 ring-primary/30"
            />
          ) : (
            <div className="mx-auto flex size-36 items-center justify-center rounded-full bg-surface ring-4 ring-primary/30">
              <UserCircle className="size-20 text-muted" />
            </div>
          )}
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold text-white">
          {user.full_name}
        </h2>
        <p className="text-muted capitalize">{user.roles?.join(', ') || 'Khách hàng'}</p>
      </aside>
      <section className="glass-panel rounded-lg p-6">
        <h2 className="font-display text-2xl font-bold text-white">
          Thông tin cá nhân
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Info icon={UserCircle} label="Họ và tên" value={user.full_name} />
          <Info icon={Mail} label="Email" value={user.email} />
          <Info icon={Phone} label="Số điện thoại" value={user.phone || 'Chưa cập nhật'} />
          <Info icon={Calendar} label="Ngày sinh" value={formatDate(user.dob)} />
          <Info icon={MapPin} label="Thành phố" value={user.city || 'Chưa cập nhật'} />
          <Info icon={MapPin} label="Địa chỉ" value={user.address || 'Chưa cập nhật'} className="md:col-span-2" />
        </div>
      </section>
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
      const storedUser = JSON.parse(localStorage.getItem('eventhub-user') || '{}')
      localStorage.setItem('eventhub-user', JSON.stringify({ ...storedUser, ...updatedUser }))
      window.dispatchEvent(new Event('eventhub-auth'))
      
      setTimeout(onDone, 1500)
    },
    onError: (err) => {
      const errorMsg = err.response?.data?.message || 'Không thể cập nhật hồ sơ.'
      setMessage({ type: 'error', text: errorMsg })
      
      // If it's a validation error from backend, we could try to map it, 
      // but for now we'll just show the main message.
    }
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
            <img
              src={previewUrl}
              alt="Avatar Preview"
              className="size-36 rounded-full object-cover ring-4 ring-primary/30"
            />
          ) : (
            <div className="flex size-36 items-center justify-center rounded-full bg-surface ring-4 ring-primary/30">
              <UserCircle className="size-20 text-muted" />
            </div>
          )}
          <label className="absolute bottom-1 right-1 grid size-10 cursor-pointer place-items-center rounded-full bg-primary text-slate-950 hover:scale-110 transition-transform shadow-lg">
            <Camera className="size-5" />
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        </div>
        <p className="mt-4 text-sm text-subtle">
          JPG, PNG. Đề xuất 400x400px.
        </p>
      </aside>
      <section className="glass-panel rounded-lg p-6">
        <h2 className="font-display text-2xl font-bold text-white">
          Chỉnh sửa hồ sơ
        </h2>
        
        {message.text && (
          <div className={`mt-4 flex items-center gap-2 rounded-md p-3 text-sm ${
            message.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Input 
              label="Họ và tên" 
              value={formData.full_name} 
              error={errors.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required 
            />
            <Input 
              label="Số điện thoại" 
              value={formData.phone} 
              error={errors.phone}
              placeholder="09xxx or +849xxx"
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <Input 
              label="Ngày sinh" 
              type="date" 
              value={formData.dob} 
              error={errors.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
            />
            <Input 
              label="Thành phố" 
              value={formData.city} 
              error={errors.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
            <Input
              label="Địa chỉ"
              value={formData.address}
              error={errors.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="md:col-span-2"
            />
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={onDone}
              className="rounded-md px-5 py-3 font-bold text-muted hover:bg-panel-soft transition-colors"
              disabled={updateMutation.isPending || isUploading}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending || isUploading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-slate-950 disabled:opacity-70 disabled:cursor-not-allowed hover:bg-sky-300 transition-colors"
            >
              {(updateMutation.isPending || isUploading) ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
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

  // Strength checks
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
        localStorage.removeItem('eventhub-token')
        localStorage.removeItem('eventhub-user')
        localStorage.removeItem('eventhub-auth')
        window.location.href = '/login'
      }, 2000)
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Đã có lỗi xảy ra.' })
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    mutation.mutate()
  }

  return (
    <section className="glass-panel mx-auto max-w-xl rounded-lg p-6">
      <h2 className="font-display text-2xl font-bold text-white text-center">
        {hasPassword ? 'Đổi mật khẩu' : 'Thiết lập mật khẩu mới'}
      </h2>
      <p className="mt-2 text-center text-sm text-subtle">
        {hasPassword 
          ? 'Cập nhật mật khẩu của bạn định kỳ để tăng cường bảo mật' 
          : 'Vì bạn đăng nhập bằng Google, hãy thiết lập mật khẩu để có thể đăng nhập trực tiếp bằng email.'}
      </p>
      
      {message.text && (
        <div className={`mt-6 flex items-center gap-2 rounded-md p-3 text-sm ${
          message.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {hasPassword && (
          <Input
            label="Mật khẩu hiện tại"
            type="password"
            placeholder="Nhập mật khẩu hiện tại"
            required
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        )}
        
        <div className="space-y-3">
          <Input
            label="Mật khẩu mới"
            type="password"
            placeholder="Nhập mật khẩu mới"
            required
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
          
          {form.newPassword && (
            <div className="flex flex-col gap-1.5 pl-1">
              <StrengthIndicator label="Tối thiểu 8 ký tự" active={checks.length} />
              <StrengthIndicator label="Có ít nhất 1 chữ in hoa (A-Z)" active={checks.uppercase} />
              <StrengthIndicator label="Có ít nhất 1 ký tự đặc biệt" active={checks.special} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            placeholder="Nhập lại mật khẩu mới"
            required
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
          
          {form.confirmPassword && (
            <div className="pl-1">
              <StrengthIndicator 
                label={isMatch ? "Mật khẩu xác nhận khớp" : "Mật khẩu xác nhận chưa khớp"} 
                active={isMatch} 
              />
            </div>
          )}
        </div>
        
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md px-5 py-3 font-bold text-muted hover:bg-panel-soft transition-colors"
            disabled={mutation.isPending}
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={!canSubmit || mutation.isPending}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sky-300 transition-colors"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {hasPassword ? 'Cập nhật mật khẩu' : 'Lưu mật khẩu'}
          </button>
        </div>
      </form>
    </section>
  )
}

function StrengthIndicator({ label, active }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-medium transition-all duration-300 ${
      active ? 'text-success' : 'text-error'
    }`}>
      {active ? (
        <Check className="size-3.5 animate-in zoom-in duration-300" />
      ) : (
        <span className="inline-block w-3.5 text-center leading-none text-error/60">•</span>
      )}
      <span>{label}</span>
    </div>
  )
}

function Info({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={`rounded-lg border border-border-soft bg-surface p-4 transition-all hover:border-primary/30 ${className}`}>
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="mt-2 font-bold text-white break-words">{value}</p>
    </div>
  )
}

function Input({ label, error, className = '', type, ...props }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className={`block space-y-2 ${className}`}>
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
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
