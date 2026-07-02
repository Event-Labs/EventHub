import { useState, useEffect } from 'react'
import {
  Shield,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Lock,
  Camera,
  UserCircle,
  AlertCircle,
  LogOut,
  Edit,
  X,
  Check,
  Loader2,
} from 'lucide-react'
import {
  Badge,
  Panel,
  AvatarFallback,
  Page,
} from './AdminComponents'
import { getProfile, updateProfile, changePassword } from '@/services/user.service.js'
import { uploadAvatar } from '@/services/uploads.js'

export function AdminProfilePage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('view')
  const [formData, setFormData] = useState({})
  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

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
          city: res.city || '',
          address: res.address || ''
        })
      } catch (err) {
        console.error('Failed to fetch admin profile', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Vui lòng chọn tệp ảnh hợp lệ!')
        return
      }
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleSave = async () => {
    if (!String(formData.full_name || '').trim()) {
      alert('Vui lòng nhập họ và tên.')
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
        city: String(formData.city || '').trim() || null,
        address: String(formData.address || '').trim() || null,
        avatar_url: finalAvatarUrl || null,
      })
      const updated = await getProfile()
      setUser(updated)
      setPreviewUrl(updated.avatar_url || '')
      setSelectedFile(null)
      setMode('view')
      alert('Cập nhật hồ sơ thành công!')
    } catch (err) {
      alert('Lỗi cập nhật hồ sơ: ' + err.message)
    } finally {
      setSaving(false)
      setUploadingAvatar(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.new !== passwordData.confirm) return alert('Mật khẩu xác nhận không khớp!')
    setSaving(true)
    try {
      await changePassword(passwordData.current, passwordData.new)
      setMode('view')
      setPasswordData({ current: '', new: '', confirm: '' })
      alert('Đổi mật khẩu thành công!')
    } catch (err) {
      alert('Lỗi: ' + (err.response?.data?.message || err.message))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <div className="text-center py-20 font-bold text-error">Could not load profile.</div>

  return (
    <Page
      title="Hồ sơ cá nhân"
      description="Quản lý thông tin tài khoản và thiết lập bảo mật của bạn."
      actions={
        <div className="flex gap-2">
           <button 
            onClick={() => { setMode('view'); setPreviewUrl(user.avatar_url || ''); setSelectedFile(null); }}
            className={`admin-secondary px-4 py-2 text-xs ${mode === 'view' ? 'bg-tertiary text-white border-tertiary' : ''}`}
           >
            Xem hồ sơ
           </button>
           <button 
            onClick={() => setMode('edit')}
            className={`admin-secondary px-4 py-2 text-xs ${mode === 'edit' ? 'bg-tertiary text-white border-tertiary' : ''}`}
           >
            Chỉnh sửa
           </button>
           <button 
            onClick={() => setMode('password')}
            className={`admin-secondary px-4 py-2 text-xs ${mode === 'password' ? 'bg-tertiary text-white border-tertiary' : ''}`}
           >
            Đổi mật khẩu
           </button>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <Panel className="text-center py-10">
            <div className="relative mx-auto size-40">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={user.full_name}
                  className="mx-auto size-40 rounded-full object-cover ring-4 ring-primary/20"
                />
              ) : (
                <div className="mx-auto flex size-40 items-center justify-center rounded-full bg-panel-soft ring-4 ring-primary/20">
                  <UserCircle className="size-20 text-subtle" />
                </div>
              )}
              {mode === 'edit' && (
                <div className="absolute -bottom-2 inset-x-0 flex justify-center gap-2">
                   <label className="grid size-10 cursor-pointer place-items-center rounded-full bg-tertiary text-white shadow-lg hover:scale-110 transition border-4 border-surface">
                    <Camera className="size-5" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                  </label>
                   {selectedFile && (
                    <button 
                      onClick={() => { setSelectedFile(null); setPreviewUrl(user.avatar_url || ''); }}
                      className="grid size-10 place-items-center rounded-full bg-error text-white shadow-lg hover:scale-110 transition border-4 border-surface"
                    >
                      <X className="size-5" />
                    </button>
                  )}
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-[2px]">
                   <Loader2 className="size-8 animate-spin text-white" />
                </div>
              )}
            </div>
            <h2 className="mt-8 font-display text-2xl font-extrabold text-content">
              {user.full_name}
            </h2>
            <div className="mt-2 flex justify-center gap-2">
              {user.roles?.map(role => (
                <Badge key={role} tone="purple" className="px-3">{role}</Badge>
              ))}
            </div>
          </Panel>

          <Panel className="border-border-soft/40 p-6">
             <div className="flex items-center gap-3 mb-4">
                <Shield className="size-5 text-primary" />
                <h4 className="font-bold text-sm text-content">Trạng thái bảo mật</h4>
             </div>
             <p className="text-xs text-subtle mb-4">Tài khoản của bạn được bảo vệ với mức truy cập cao nhất.</p>
             <button className="w-full rounded-xl bg-panel-soft border border-border-soft/30 py-2.5 text-xs font-bold text-subtle hover:text-tertiary transition flex items-center justify-center gap-2">
                <Lock className="size-3" /> Kiểm tra bảo mật
             </button>
          </Panel>
        </aside>

        <div className="space-y-6">
           {mode === 'view' && (
             <Panel className="p-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between mb-8 border-b border-border-soft/30 pb-4">
                   <h3 className="font-display text-xl font-extrabold text-content">Thông tin cá nhân</h3>
                   <button onClick={() => setMode('edit')} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                      <Edit className="size-4" /> Chỉnh sửa
                   </button>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                   <InfoField icon={Mail} label="Email" value={user.email} />
                   <InfoField icon={Phone} label="Số điện thoại" value={user.phone || 'Chưa cập nhật'} />
                   <InfoField icon={Calendar} label="Ngày sinh" value={user.dob ? new Date(user.dob).toLocaleDateString('vi-VN') : 'Chưa cập nhật'} />
                   <InfoField icon={MapPin} label="Thành phố" value={user.city || 'Chưa cập nhật'} />
                   <InfoField icon={MapPin} label="Địa chỉ" value={user.address || 'Chưa cập nhật'} className="md:col-span-2" />
                </div>
             </Panel>
           )}

           {mode === 'edit' && (
             <Panel className="p-8 animate-in fade-in zoom-in-95 duration-300">
                <h3 className="font-display text-xl font-extrabold text-content mb-8 border-b border-border-soft/30 pb-4">
                   Chỉnh sửa hồ sơ
                </h3>
                <div className="grid gap-5 md:grid-cols-2">
                   <InputField label="Họ và tên" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                   <InputField label="Số điện thoại" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                   <InputField label="Ngày sinh" type="date" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                   <InputField label="Thành phố" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                   <InputField label="Địa chỉ" className="md:col-span-2" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="mt-8 flex justify-end gap-3">
                   <button onClick={() => { setMode('view'); setPreviewUrl(user.avatar_url || ''); setSelectedFile(null); }} className="admin-secondary px-6">Hủy</button>
                   <button onClick={handleSave} disabled={saving || uploadingAvatar} className="admin-primary flex items-center gap-2">
                     {saving ? (
                       <><Loader2 className="size-4 animate-spin" /> Đang lưu...</>
                     ) : (
                       <><Check className="size-4" /> Lưu thay đổi</>
                     )}
                   </button>
                </div>
             </Panel>
           )}

           {mode === 'password' && (
             <Panel className="p-8 max-w-2xl mx-auto">
                <h3 className="font-display text-xl font-extrabold text-content mb-4 text-center">
                   Đổi mật khẩu
                </h3>
                <p className="text-center text-sm text-subtle mb-8">
                   Sử dụng mật khẩu mạnh để bảo vệ tài khoản quản trị của bạn.
                </p>
                <div className="space-y-5">
                   <InputField label="Mật khẩu hiện tại" type="password" value={passwordData.current} onChange={e => setPasswordData({...passwordData, current: e.target.value})} />
                   <InputField label="Mật khẩu mới" type="password" value={passwordData.new} onChange={e => setPasswordData({...passwordData, new: e.target.value})} />
                   <InputField label="Xác nhận mật khẩu" type="password" value={passwordData.confirm} onChange={e => setPasswordData({...passwordData, confirm: e.target.value})} />
                </div>
                <div className="mt-10 flex flex-col gap-3">
                   <button onClick={handleChangePassword} disabled={saving} className="admin-primary w-full py-4 text-sm font-extrabold text-slate-950 bg-tertiary hover:bg-orange-600">{saving ? 'Đang thực hiện...' : 'Cập nhật mật khẩu'}</button>
                   <button onClick={() => setMode('view')} className="text-sm font-bold text-subtle hover:text-content">Hủy bỏ</button>
                </div>
             </Panel>
           )}
        </div>
      </div>
    </Page>
  )
}

function InfoField({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={`p-5 rounded-xl border border-border-soft/30 bg-panel-soft transition hover:border-tertiary/30 ${className}`}>
      <div className="flex items-center gap-2 text-subtle mb-2">
        <Icon className="size-4" />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-bold text-content text-lg">{value}</p>
    </div>
  )
}

function InputField({ label, className = '', type = 'text', ...props }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-xs font-bold text-subtle uppercase tracking-wider">{label}</label>
      <input
        type={type}
        className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-3 text-sm font-semibold text-content outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder:text-muted"
        {...props}
      />
    </div>
  )
}
