import { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Monitor,
  PencilLine,
  Phone,
  Shield,
  ShieldCheck,
  Smartphone,
  UserCircle,
  X,
  Info,
} from 'lucide-react'
import { Page } from './AdminComponents'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { adminProfileApi } from '@/services/adminProfile.js'
import { getProfile, updateProfile, changePassword } from '@/services/user.service.js'
import { uploadAvatar } from '@/services/uploads.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function AdminProfilePage() {
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('view')
  const [formData, setFormData] = useState({})
  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [securityResult, setSecurityResult] = useState(() => createEmptySecurityResult())
  const [securityItems, setSecurityItems] = useState(() => createInitialSecurityItems())
  const [checkingSecurity, setCheckingSecurity] = useState(false)
  const [checkingIndex, setCheckingIndex] = useState(-1)
  const [loginSessions, setLoginSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getProfile()
        setUser(res)
        setPreviewUrl(res.avatar_url || '')
        setFormData({
          full_name: res.full_name || '',
          phone: res.phone || '',
          dob: res.dob?.split('T')[0] || '',
          address: res.address || '',
        })
        try {
          const securityResponse = await adminProfileApi.getSecurityStatus()
          const rawSecurity = securityResponse?.data?.data || securityResponse?.data || {}
          applySecuritySnapshot(rawSecurity)
        } catch (securityErr) {
          console.warn('Failed to fetch saved security status', securityErr)
        }
      } catch (err) {
        console.error('Failed to fetch admin profile', err)
        toast.error('Không thể tải hồ sơ quản trị. Vui lòng thử lại.')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [toast])

  const applySecuritySnapshot = (rawResult) => {
    const mappedItems = mapSecurityItemsToVietnamese(rawResult?.items || [])
    if (!mappedItems.length && !rawResult?.lastCheckedAt) return

    setSecurityResult({
      score: Number.isFinite(Number(rawResult?.score)) ? Number(rawResult.score) : mappedItems.filter((item) => item.status === 'passed').length,
      total: Number.isFinite(Number(rawResult?.total)) ? Number(rawResult.total) : mappedItems.length,
      level: rawResult?.level || '',
      levelText: mapLevelToVietnamese(rawResult?.level, rawResult?.levelText),
      lastCheckedAt: rawResult?.lastCheckedAt || null,
      items: mappedItems,
    })

    if (mappedItems.length) {
      setSecurityItems(mappedItems)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tệp ảnh hợp lệ.')
      return
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!String(formData.full_name || '').trim()) {
      toast.error('Vui lòng nhập họ và tên.')
      return
    }

    setSaving(true)
    try {
      let finalAvatarUrl = user.avatar_url

      if (selectedFile) {
        setUploadingAvatar(true)
        const uploadRes = await uploadAvatar(selectedFile)
        finalAvatarUrl = uploadRes.secure_url
        setUploadingAvatar(false)
      }

      await updateProfile({
        full_name: formData.full_name.trim(),
        phone: String(formData.phone || '').trim() || null,
        dob: formData.dob || null,
        address: String(formData.address || '').trim() || null,
        avatar_url: finalAvatarUrl || null,
      })
      const updated = await getProfile()
      setUser(updated)
      setPreviewUrl(updated.avatar_url || '')
      setSelectedFile(null)
      setMode('view')
      toast.success('Cập nhật hồ sơ thành công.')
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể cập nhật hồ sơ. Vui lòng thử lại.'))
    } finally {
      setSaving(false)
      setUploadingAvatar(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.new !== passwordData.confirm) {
      toast.error('Mật khẩu xác nhận không khớp.')
      return
    }

    setSaving(true)
    try {
      await changePassword(passwordData.current, passwordData.new)
      setMode('view')
      setPasswordData({ current: '', new: '', confirm: '' })
      toast.success('Đổi mật khẩu thành công.')
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể đổi mật khẩu. Vui lòng thử lại.'))
    } finally {
      setSaving(false)
    }
  }

  const handleSecurityCheck = async () => {
    setCheckingSecurity(true)
    setCheckingIndex(0)

    try {
      const response = await adminProfileApi.checkSecurity()
      const rawResult = response?.data?.data || response?.data || {}
      const mappedItems = mapSecurityItemsToVietnamese(rawResult.items || [])
      const loadingItems = (mappedItems.length ? mappedItems : createInitialSecurityItems()).map((item) => ({
        ...item,
        uiStatus: 'loading',
        uiMessage: 'Đang kiểm tra...',
      }))

      setSecurityResult((current) => ({
        ...current,
        score: rawResult.score ?? current.score,
        total: rawResult.total ?? loadingItems.length,
        level: rawResult.level || current.level,
        levelText: 'Đang kiểm tra',
      }))
      setSecurityItems(loadingItems)

      const revealedItems = []
      for (let index = 0; index < mappedItems.length; index += 1) {
        setCheckingIndex(index)
        await delay(400)
        revealedItems.push(mappedItems[index])
        setSecurityItems([
          ...revealedItems,
          ...loadingItems.slice(revealedItems.length),
        ])
      }

      const finalResult = {
        score: Number.isFinite(Number(rawResult.score)) ? Number(rawResult.score) : mappedItems.filter((item) => item.status === 'passed').length,
        total: Number.isFinite(Number(rawResult.total)) ? Number(rawResult.total) : mappedItems.length,
        level: rawResult.level || '',
        levelText: mapLevelToVietnamese(rawResult.level, rawResult.levelText),
        lastCheckedAt: rawResult.lastCheckedAt || new Date().toISOString(),
        items: mappedItems,
      }

      setSecurityResult(finalResult)
      setSecurityItems(mappedItems)
      toast.success('Kiểm tra bảo mật hoàn tất')
    } catch (err) {
      toast.error('Không thể kiểm tra bảo mật, vui lòng thử lại.')
      setSecurityItems((current) => current.map((item) => (
        item.uiStatus === 'loading'
          ? { ...item, uiStatus: item.status || 'disabled', uiMessage: item.message || getDefaultSecurityMessage(item.key, item.status || 'disabled') }
          : item
      )))
    } finally {
      setCheckingSecurity(false)
      setCheckingIndex(-1)
    }
  }

  const handleViewSessions = async (force = false) => {
    setMode('sessions')

    if (!force && loginSessions.length > 0) return

    setLoadingSessions(true)
    try {
      const response = await adminProfileApi.listSessions()
      const sessions = response?.data?.data || response?.data || []
      setLoginSessions(Array.isArray(sessions) ? sessions : [])
      setExpandedSessionId((current) => current || sessions?.[0]?.id || null)
    } catch (err) {
      toast.error('Không thể tải danh sách phiên đăng nhập. Vui lòng thử lại.')
    } finally {
      setLoadingSessions(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return <div className="py-20 text-center font-bold text-error">Không thể tải hồ sơ. Vui lòng thử lại.</div>
  }

  const displayName = user.full_name || user.email || 'Quản trị viên'
  const joinedDate = formatDate(user.created_at || user.createdAt)

  const actionButtonClass = (active) =>
    `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-extrabold transition ${
      active
        ? 'border-primary/70 bg-primary/15 text-primary shadow-[0_14px_30px_rgba(37,99,235,0.18)]'
        : 'border-border-soft/50 bg-surface/60 text-content hover:border-primary/60 hover:bg-panel-soft hover:text-primary'
    }`

  return (
    <Page
      title="Hồ sơ cá nhân"
      description="Quản lý thông tin tài khoản và bảo mật để bảo vệ tài khoản của bạn."
      actions={
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setMode('edit')} className={actionButtonClass(mode === 'edit')}>
            <PencilLine className="size-4" />
            Chỉnh sửa thông tin
          </button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="customer-profile-hero relative overflow-hidden rounded-2xl border p-6 text-content sm:p-8">
            <div className="customer-profile-hero-bg absolute inset-0" />
            <div className="customer-profile-hero-wave absolute inset-0" />
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="relative mx-auto size-36 shrink-0 sm:mx-0 sm:size-40">
                  <ProfileAvatar
                    sources={previewUrl || user.avatar_url}
                    name={displayName}
                    alt={displayName}
                    className="size-full ring-4 ring-primary/25"
                    fallbackClassName="bg-panel-soft text-5xl text-primary"
                  />
                  <span className="absolute bottom-1 right-1 grid size-11 place-items-center rounded-full border-4 border-[#0b1230] bg-primary/20 text-primary shadow-xl">
                    <ShieldCheck className="size-5" />
                  </span>
                  {mode === 'edit' && (
                    <div className="absolute inset-x-0 -bottom-4 flex justify-center gap-2">
                      <label className="grid size-10 cursor-pointer place-items-center rounded-full border-4 border-[#0b1230] bg-tertiary text-white shadow-lg transition hover:scale-105">
                        <Camera className="size-5" />
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                      </label>
                      {selectedFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null)
                            setPreviewUrl(user.avatar_url || '')
                          }}
                          className="grid size-10 place-items-center rounded-full border-4 border-[#0b1230] bg-error text-white shadow-lg transition hover:scale-105"
                        >
                          <X className="size-5" />
                        </button>
                      )}
                    </div>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/55 backdrop-blur-[2px]">
                      <Loader2 className="size-8 animate-spin text-white" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 text-center sm:text-left">
                  <h2 className="customer-profile-title break-words font-display text-3xl font-extrabold sm:text-4xl">
                    {displayName}
                  </h2>
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    {(user.roles || ['ADMIN']).map((role) => (
                      <span key={role} className="customer-role-badge inline-flex items-center rounded-md px-3 py-1 text-sm font-extrabold ring-1">
                        {String(role).toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <div className="customer-profile-meta mt-5 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-semibold sm:justify-start">
                    <span className="inline-flex items-center gap-2">
                      <Mail className="size-5" />
                      {user.email || 'Chưa cập nhật'}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="size-5" />
                      Tham gia: {joinedDate}
                    </span>
                  </div>
                </div>
              </div>

              <span className="mx-auto inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-4 py-2 text-sm font-bold text-success lg:mx-0">
                <span className="size-2 rounded-full bg-success" />
                Tài khoản đang hoạt động
              </span>
            </div>
          </section>

          {mode === 'view' && (
            <>
              <ProfilePanel icon={UserCircle} title="Thông tin cá nhân">
                <div className="rounded-2xl border border-border-soft/30 bg-background/30 px-5">
                  <InfoRow icon={Mail} label="Email" value={user.email} status="Đã xác minh" />
                  <InfoRow icon={Phone} label="Số điện thoại" value={user.phone || 'Chưa cập nhật'} status={user.phone ? 'Đã xác minh' : null} />
                  <InfoRow icon={Calendar} label="Ngày sinh" value={formatDate(user.dob)} />
                  <InfoRow icon={MapPin} label="Địa chỉ" value={user.address || 'Chưa cập nhật'} last />
                </div>
              </ProfilePanel>

              <ProfilePanel icon={ShieldCheck} title="Bảo mật tài khoản">
                <div className="rounded-2xl border border-border-soft/30 bg-background/30 px-5">
                  <ActionRow icon={Lock} label="Mật khẩu" description="Cập nhật định kỳ để bảo vệ tài khoản." action="Đổi mật khẩu" onClick={() => setMode('password')} />
                  <ActionRow icon={Smartphone} label="Phiên đăng nhập" description="Quản lý thiết bị và phiên đăng nhập của bạn." action="Xem" onClick={handleViewSessions} last />
                </div>
              </ProfilePanel>
            </>
          )}

          {mode === 'edit' && (
            <ProfilePanel icon={Camera} title="Chỉnh sửa hồ sơ">
              <div className="grid gap-5 md:grid-cols-2">
                <InputField label="Họ và tên" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
                <InputField label="Số điện thoại" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                <InputField label="Ngày sinh" type="date" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
                <InputField label="Địa chỉ" className="md:col-span-2" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <FormActions
                saving={saving || uploadingAvatar}
                onCancel={() => {
                  setMode('view')
                  setPreviewUrl(user.avatar_url || '')
                  setSelectedFile(null)
                }}
                onSave={handleSave}
                saveText={uploadingAvatar ? 'Đang tải ảnh...' : 'Lưu thay đổi'}
              />
            </ProfilePanel>
          )}

          {mode === 'sessions' && (
            <ProfilePanel icon={Smartphone} title="Phiên đăng nhập">
              {loadingSessions ? (
                <div className="flex min-h-40 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              ) : loginSessions.length > 0 ? (
                <div className="space-y-3">
                  {loginSessions.map((session) => {
                    const isExpanded = expandedSessionId === session.id
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        className="w-full rounded-2xl border border-border-soft/30 bg-background/30 p-4 text-left transition hover:border-primary/50 hover:bg-panel-soft"
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Monitor className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="break-words text-sm font-extrabold text-content">{session.device_name || 'Thiết bị không xác định'}</p>
                              <span className="text-xs font-semibold text-subtle">{formatDateTime(session.created_at)}</span>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-subtle">
                              Hết hạn: {formatDateTime(session.expires_at)}
                            </p>
                            {isExpanded && (
                              <div className="mt-4 grid gap-3 rounded-xl border border-border-soft/20 bg-surface/60 p-3 text-xs text-subtle">
                                <div>
                                  <span className="font-extrabold text-content">IP: </span>
                                  {session.ip_address || 'Chưa ghi nhận'}
                                </div>
                                <div>
                                  <span className="font-extrabold text-content">Thiết bị: </span>
                                  {session.device_name || 'Thiết bị không xác định'}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-border-soft/30 bg-background/30 p-5 text-sm font-semibold text-subtle">
                  Chưa có phiên đăng nhập đang hoạt động.
                </div>
              )}
              <FormActions saving={false} onCancel={() => setMode('view')} onSave={handleViewSessions} saveText="Tải lại phiên" />
            </ProfilePanel>
          )}

          {mode === 'password' && (
            <ProfilePanel icon={Lock} title="Đổi mật khẩu">
              <p className="mb-6 text-sm leading-6 text-subtle">
                Sử dụng mật khẩu mạnh để tăng cường bảo mật cho tài khoản quản trị của bạn.
              </p>
              <div className="space-y-5">
                <InputField label="Mật khẩu hiện tại" type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} />
                <InputField label="Mật khẩu mới" type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} />
                <InputField label="Xác nhận mật khẩu" type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} />
              </div>
              <FormActions saving={saving} onCancel={() => setMode('view')} onSave={handleChangePassword} saveText="Cập nhật mật khẩu" />
            </ProfilePanel>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <SecuritySummary
            result={securityResult}
            items={securityItems}
            checking={checkingSecurity}
            checkingIndex={checkingIndex}
            onCheck={handleSecurityCheck}
          />
          <section className="rounded-2xl border border-warning/30 bg-warning/[0.07] p-5 text-content shadow-[0_18px_46px_rgba(3,8,24,0.18)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-base font-extrabold text-content">Gợi ý cải thiện</h3>
                  <p className="mt-1 text-sm leading-6 text-subtle">Bật xác thực 2 lớp để tăng cường bảo vệ tài khoản.</p>
                </div>
              </div>
              <button type="button" className="rounded-xl border border-warning/40 px-4 py-2 text-sm font-extrabold text-content transition hover:bg-warning/10 hover:text-warning">
                Thiết lập 2FA
              </button>
            </div>
          </section>
        </aside>
      </div>
    </Page>
  )
}

function SecuritySummary({ result, items, checking, checkingIndex, onCheck }) {
  const score = Number(result?.score || 0)
  const total = Number(result?.total || items.length || DEFAULT_SECURITY_KEYS.length)
  const levelText = checking ? 'Đang kiểm tra' : mapLevelToVietnamese(result?.level, result?.levelText)
  const percent = total > 0 ? Math.min(Math.max((score / total) * 100, 0), 100) : 0

  return (
    <section className="customer-profile-panel rounded-2xl border p-5 text-content">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="customer-section-icon customer-tone-blue grid size-12 shrink-0 place-items-center rounded-xl">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h2 className="customer-panel-title font-display text-xl font-extrabold">Tình trạng bảo mật</h2>
            <p className="mt-2 text-sm text-subtle">
              Mức độ an toàn: <span className={getLevelClassName(result?.level, levelText)}>{levelText}</span>
            </p>
            <p className="mt-1 text-sm text-subtle">Bạn đã hoàn thành {score}/{total} hạng mục bảo mật.</p>
          </div>
        </div>
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full border-[6px] bg-background/40 text-xl font-extrabold text-content shadow-[inset_0_0_0_6px_rgba(59,130,246,0.18)]"
          style={{ borderColor: getProgressColor(result?.level, percent) }}
        >
          {score}/{total}
        </div>
      </div>

      <div className="mb-5 h-2 overflow-hidden rounded-full bg-background/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <SecurityCheck key={item.key || item.label} item={item} active={checking && index === checkingIndex} />
        ))}
      </div>

      <button
        type="button"
        onClick={onCheck}
        disabled={checking}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-950/20 transition hover:from-blue-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {checking ? 'Đang kiểm tra...' : 'Kiểm tra bảo mật'}
      </button>
      <p className="mt-3 text-center text-xs text-subtle">
        Lần kiểm tra gần nhất: {formatDateTime(result?.lastCheckedAt)}
      </p>
    </section>
  )
}

function SecurityCheck({ item, active }) {
  const config = getSecurityStatusConfig(item.uiStatus || item.status)
  const Icon = item.icon || config.icon
  const BadgeIcon = config.badgeIcon

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-3 transition-all ${config.rowClassName} ${active ? 'animate-pulse' : ''}`}>
      {config.loading ? (
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
      ) : (
        <Icon className={`mt-0.5 size-5 shrink-0 ${config.iconClassName}`} />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 break-words text-sm font-bold leading-5 text-content">{item.label}</p>
          <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${config.badgeClassName}`}>
            {config.label}
            {config.loading ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeIcon className="size-3.5" />}
          </span>
        </div>
        <p className="break-words text-xs leading-5 text-subtle">{item.uiMessage || item.message}</p>
      </div>
    </div>
  )
}

const DEFAULT_SECURITY_KEYS = [
  'email_verified',
  'phone_exists',
  'password_recent',
  'two_factor',
  'last_login',
  'account_status',
]

const SECURITY_LABELS = {
  email_verified: 'Email đã xác minh',
  phone_exists: 'Số điện thoại',
  password_recent: 'Mật khẩu',
  two_factor: 'Xác thực 2 lớp',
  last_login: 'Phiên đăng nhập gần nhất',
  account_status: 'Trạng thái tài khoản',
}

const SECURITY_ICONS = {
  email_verified: Mail,
  phone_exists: Phone,
  password_recent: KeyRound,
  two_factor: Shield,
  last_login: Clock3,
  account_status: ShieldCheck,
}

const SECURITY_MESSAGES = {
  email_verified: {
    passed: 'Email của bạn đã được xác minh.',
    warning: 'Email của bạn chưa được xác minh.',
    danger: 'Email của bạn đang có vấn đề cần kiểm tra.',
    disabled: 'Chưa có thông tin xác minh email.',
  },
  phone_exists: {
    passed: 'Tài khoản đã có số điện thoại.',
    warning: 'Bạn nên bổ sung số điện thoại.',
    danger: 'Số điện thoại đang có vấn đề cần kiểm tra.',
    disabled: 'Chưa hỗ trợ kiểm tra số điện thoại.',
  },
  password_recent: {
    passed: 'Mật khẩu được cập nhật gần đây.',
    warning: 'Bạn nên đổi mật khẩu nếu đã quá lâu chưa cập nhật.',
    danger: 'Mật khẩu đang có vấn đề cần kiểm tra ngay.',
    disabled: 'Chưa có thông tin lần đổi mật khẩu gần nhất.',
  },
  two_factor: {
    passed: 'Tài khoản đã bật xác thực 2 lớp.',
    warning: 'Bạn chưa bật xác thực 2 lớp.',
    danger: 'Xác thực 2 lớp đang có vấn đề cần kiểm tra.',
    disabled: 'Tính năng xác thực 2 lớp chưa được hỗ trợ.',
  },
  last_login: {
    passed: 'Tài khoản có ghi nhận phiên đăng nhập gần nhất.',
    warning: 'Chưa có thông tin phiên đăng nhập gần nhất.',
    danger: 'Phiên đăng nhập gần nhất có dấu hiệu cần kiểm tra.',
    disabled: 'Chưa hỗ trợ kiểm tra phiên đăng nhập.',
  },
  account_status: {
    passed: 'Tài khoản đang hoạt động bình thường.',
    warning: 'Tài khoản cần được kiểm tra thêm.',
    danger: 'Tài khoản đang có vấn đề cần kiểm tra ngay.',
    disabled: 'Chưa hỗ trợ kiểm tra trạng thái tài khoản.',
  },
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function createEmptySecurityResult() {
  return {
    score: 0,
    total: DEFAULT_SECURITY_KEYS.length,
    level: '',
    levelText: 'Chưa kiểm tra',
    lastCheckedAt: null,
    items: [],
  }
}

function createInitialSecurityItems() {
  return DEFAULT_SECURITY_KEYS.map((key) => ({
    key,
    label: SECURITY_LABELS[key],
    status: 'disabled',
    message: 'Chưa kiểm tra.',
    icon: SECURITY_ICONS[key] || Info,
  }))
}

function normalizeSecurityStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (['passed', 'warning', 'danger', 'disabled', 'loading'].includes(normalized)) {
    return normalized
  }
  return 'warning'
}

function containsVietnamese(text) {
  return /[À-ỹĐđ]/.test(String(text || ''))
}

function getDefaultSecurityMessage(key, status) {
  const normalizedStatus = normalizeSecurityStatus(status)
  return SECURITY_MESSAGES[key]?.[normalizedStatus]
    || SECURITY_MESSAGES[key]?.warning
    || 'Cần kiểm tra thêm hạng mục này.'
}

function mapSecurityItemsToVietnamese(items) {
  if (!Array.isArray(items)) return []

  return items.map((item) => {
    const key = item?.key || 'unknown'
    const status = normalizeSecurityStatus(item?.status)
    const apiMessage = String(item?.message || '').trim()
    const apiLabel = String(item?.label || '').trim()

    return {
      key,
      label: SECURITY_LABELS[key] || (containsVietnamese(apiLabel) ? apiLabel : 'Hạng mục bảo mật'),
      status,
      message: containsVietnamese(apiMessage) ? apiMessage : getDefaultSecurityMessage(key, status),
      icon: SECURITY_ICONS[key] || Info,
    }
  })
}

function mapLevelToVietnamese(level, levelText) {
  const text = String(levelText || '').trim()
  if (containsVietnamese(text)) return text

  const normalized = String(level || text || '').toLowerCase()
  if (normalized === 'good') return 'Tốt'
  if (normalized === 'medium') return 'Trung bình'
  if (normalized === 'weak') return 'Yếu'
  if (normalized === 'checking') return 'Đang kiểm tra'
  return 'Chưa kiểm tra'
}

function getLevelClassName(level, levelText) {
  const normalized = String(level || '').toLowerCase()
  const text = String(levelText || '').toLowerCase()
  if (normalized === 'weak' || text.includes('yếu')) return 'font-extrabold text-error'
  if (normalized === 'medium' || text.includes('trung')) return 'font-extrabold text-warning'
  if (normalized === 'good' || text.includes('tốt')) return 'font-extrabold text-success'
  return 'font-extrabold text-primary'
}

function getProgressColor(level, percent) {
  const normalized = String(level || '').toLowerCase()
  if (normalized === 'weak' || percent < 50) return 'rgba(239, 68, 68, 0.72)'
  if (normalized === 'medium' || percent < 80) return 'rgba(245, 158, 11, 0.78)'
  if (normalized === 'good') return 'rgba(34, 197, 94, 0.72)'
  return 'rgba(59, 130, 246, 0.72)'
}

function getSecurityStatusConfig(status) {
  const normalized = normalizeSecurityStatus(status)
  const configs = {
    passed: {
      label: 'Đạt',
      icon: CheckCircle2,
      badgeIcon: CheckCircle2,
      iconClassName: 'text-success',
      badgeClassName: 'bg-success/15 text-success',
      rowClassName: 'border-success/20 bg-success/[0.06]',
    },
    warning: {
      label: 'Cần chú ý',
      icon: AlertTriangle,
      badgeIcon: AlertTriangle,
      iconClassName: 'text-warning',
      badgeClassName: 'bg-warning/15 text-warning',
      rowClassName: 'border-warning/20 bg-warning/[0.06]',
    },
    danger: {
      label: 'Nguy hiểm',
      icon: AlertCircle,
      badgeIcon: AlertCircle,
      iconClassName: 'text-error',
      badgeClassName: 'bg-error/15 text-error',
      rowClassName: 'border-error/20 bg-error/[0.06]',
    },
    disabled: {
      label: 'Chưa hỗ trợ',
      icon: Info,
      badgeIcon: Info,
      iconClassName: 'text-muted',
      badgeClassName: 'bg-panel-soft text-muted',
      rowClassName: 'border-border-soft/20 bg-background/25',
    },
    loading: {
      label: 'Đang kiểm tra',
      icon: Loader2,
      badgeIcon: Loader2,
      loading: true,
      iconClassName: 'text-primary',
      badgeClassName: 'bg-primary/15 text-primary',
      rowClassName: 'border-primary/30 bg-primary/[0.06]',
    },
  }

  return configs[normalized] || configs.warning
}

function ProfilePanel({ icon: Icon, title, children }) {
  return (
    <section className="customer-profile-panel rounded-2xl border p-5 text-content sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="customer-section-icon customer-tone-blue grid size-10 place-items-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <h2 className="customer-panel-title font-display text-xl font-extrabold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function InfoRow({ icon: Icon, label, value, status, last = false }) {
  return (
    <div className={`grid gap-3 py-4 text-sm sm:grid-cols-[240px_minmax(0,1fr)_auto] sm:items-center ${last ? '' : 'border-b border-border-soft/20'}`}>
      <div className="customer-profile-label flex items-center gap-3 font-semibold">
        <Icon className="size-5" />
        {label}
      </div>
      <p className="customer-info-value break-words font-extrabold">{value || 'Chưa cập nhật'}</p>
      {status && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success/10 px-3 py-1 text-xs font-extrabold text-success">
          {status}
          <CheckCircle2 className="size-3.5" />
        </span>
      )}
    </div>
  )
}

function ActionRow({ icon: Icon, label, description, action, onClick, last = false }) {
  return (
    <div className={`flex items-center gap-4 py-4 ${last ? '' : 'border-b border-border-soft/20'}`}>
      <Icon className="size-5 shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-content">{label}</p>
        <p className="mt-1 text-sm text-subtle">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border-soft/40 px-4 py-2 text-sm font-bold text-content transition hover:border-primary/60 hover:bg-panel-soft hover:text-primary"
      >
        {action || <ChevronRight className="size-4" />}
        {action && <ChevronRight className="size-4" />}
      </button>
    </div>
  )
}

function FormActions({ saving, onCancel, onSave, saveText }) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} disabled={saving} className="admin-secondary bg-surface px-6 text-content hover:bg-panel-soft">
        Hủy
      </button>
      <button type="button" onClick={onSave} disabled={saving} className="admin-primary flex items-center justify-center gap-2 px-6">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {saving ? 'Đang lưu...' : saveText}
      </button>
    </div>
  )
}

function InputField({ label, className = '', type = 'text', ...props }) {
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</span>
      <input
        type={type}
        className="h-12 w-full rounded-xl border border-border-soft/40 bg-background/35 px-4 text-sm font-semibold text-content shadow-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
        {...props}
      />
    </label>
  )
}

function formatDateTime(value) {
  if (!value) return 'Chưa kiểm tra'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa kiểm tra'

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value) {
  if (!value) return 'Chưa cập nhật'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật'

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
