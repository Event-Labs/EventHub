import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Calendar,
  History,
  Lock,
  Mail,
  MapPin,
  Phone,
  Unlock,
  User,
  Info,
} from 'lucide-react'
import {
  Badge,
  Panel,
  Status,
  KpiGrid,
} from './AdminComponents'
import { Modal } from '@/components/Modal'
import adminUserService from '@/services/adminUser'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'

export function UserDetailView({ userId, onBack, onStatusChange, refreshKey }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await adminUserService.getUserDetails(userId)
        setUser(res.data.data)
      } catch (err) {
        console.error('Failed to fetch user details', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDetails()
  }, [userId, refreshKey])

  if (loading) {
    return <div className="py-20 text-center font-bold text-subtle">Đang tải hồ sơ người dùng...</div>
  }

  if (!user) {
    return <div className="py-20 text-center font-bold text-error">Không tìm thấy người dùng</div>
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-subtle hover:text-tertiary transition"
      >
        <ArrowLeft className="size-4" /> Quay lại danh sách
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Panel className="text-center">
            <div className="flex justify-center">
              <ProfileAvatar
                sources={user.avatar_url}
                name={user.full_name}
                alt={user.full_name || 'Avatar'}
                className="size-32 border-4 border-border-soft/40 shadow-lg"
                fallbackClassName="text-3xl"
              />
            </div>
            <h3 className="mt-4 font-display text-2xl font-extrabold text-content">{user.full_name}</h3>
            <div className="mt-2 flex justify-center gap-2">
              {user.roles && user.roles.filter(Boolean).length > 0 ? (
                user.roles.filter(Boolean).map(role => (
                  <Badge key={role} tone={role === 'ADMIN' ? 'purple' : 'blue'}>{role}</Badge>
                ))
              ) : (
                <Badge tone="gray">CHƯA XÁC THỰC</Badge>
              )}
            </div>
            <div className="mt-6 border-t border-border-soft/30 pt-6 flex justify-around">
               <div className="text-center">
                  <p className="text-[10px] font-extrabold text-subtle uppercase tracking-wider">Ngày tạo</p>
                  <p className="mt-1 font-extrabold text-content">{new Date(user.created_at).toLocaleDateString('vi-VN')}</p>
               </div>
               <div className="text-center">
                  <p className="text-[10px] font-extrabold text-subtle uppercase tracking-wider">Trạng thái</p>
                  <div className="mt-1 flex justify-center"><Status value={user.status} /></div>
               </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
               {user.status === 'LOCKED' ? (
                 <button 
                  onClick={() => onStatusChange('UNLOCK', user)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-extrabold text-slate-950 hover:bg-success/90 transition shadow-lg shadow-success/15"
                >
                   <Unlock className="size-4" /> Mở khóa tài khoản
                 </button>
               ) : (
                 <button 
                  onClick={() => onStatusChange('LOCK', user)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-error py-3 text-sm font-extrabold text-white hover:bg-error/90 transition shadow-lg shadow-error/15"
                >
                   <Lock className="size-4" /> Khóa tài khoản
                 </button>
               )}
            </div>
          </Panel>

          <Panel>
            <h4 className="font-bold text-content mb-4">Thông tin liên hệ</h4>
            <div className="space-y-4 text-sm">
               <div className="flex items-start gap-3">
                  <Mail className="size-4 text-subtle mt-0.5" />
                  <div>
                    <p className="font-bold text-content">Email</p>
                    <p className="text-subtle mt-0.5">{user.email}</p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <Phone className="size-4 text-subtle mt-0.5" />
                  <div>
                    <p className="font-bold text-content">Số điện thoại</p>
                    <p className="text-subtle mt-0.5">{user.phone || 'Chưa cung cấp'}</p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <MapPin className="size-4 text-subtle mt-0.5" />
                  <div>
                    <p className="font-bold text-content">Địa chỉ</p>
                    <p className="text-subtle mt-0.5">
                      {user.address ? `${user.address}, ${user.city}` : 'Chưa cung cấp địa chỉ'}
                    </p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <Calendar className="size-4 text-subtle mt-0.5" />
                  <div>
                    <p className="font-bold text-content">Ngày sinh</p>
                    <p className="text-subtle mt-0.5">{user.dob ? new Date(user.dob).toLocaleDateString('vi-VN') : 'Chưa cung cấp'}</p>
                  </div>
               </div>
            </div>
          </Panel>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          <KpiGrid 
            items={[
               ['Sự kiện đã tạo', user.events_created || 0, 'Organizer'],
               ['Vé đã mua', user.tickets_bought || 0, 'Customer'],
               ['Tổng giao dịch', `${(user.total_spent || 0).toLocaleString('vi-VN')} VNĐ`, 'Finance'],
               ['Cập nhật gần nhất', new Date(user.updated_at).toLocaleDateString('vi-VN'), 'System'],
            ]}
          />

          {user.status === 'LOCKED' && (
            <Panel className="border-error/30 bg-error/[0.06]">
               <div className="flex items-start gap-4">
                  <div className="rounded-full bg-error/15 p-2 text-error">
                    <Info className="size-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-error">Chi tiết khóa tài khoản</h4>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm">
                       <div>
                          <p className="text-[10px] font-extrabold text-subtle uppercase tracking-wider">Lý do</p>
                          <p className="mt-1 font-semibold text-content">{user.lock_reason}</p>
                       </div>
                       <div>
                          <p className="text-[10px] font-extrabold text-subtle uppercase tracking-wider">Khóa đến</p>
                          <p className="mt-1 font-semibold text-content">{user.locked_until ? new Date(user.locked_until).toLocaleString('vi-VN') : 'Vĩnh viễn'}</p>
                       </div>
                       <div>
                          <p className="text-[10px] font-extrabold text-subtle uppercase tracking-wider">Khóa bởi</p>
                          <p className="mt-1 font-semibold text-content">{user.locked_by_name || 'Hệ thống'}</p>
                       </div>
                       <div>
                          <p className="text-[10px] font-extrabold text-subtle uppercase tracking-wider">Thời gian khóa</p>
                          <p className="mt-1 font-semibold text-content">{new Date(user.locked_at).toLocaleString('vi-VN')}</p>
                       </div>
                    </div>
                  </div>
               </div>
            </Panel>
          )}

          <Panel className="min-h-[300px]">
             <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-content">Hoạt động tài khoản</h4>
                <div className="flex gap-2">
                   <button className="rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-1.5 text-xs font-bold text-subtle hover:border-tertiary hover:text-tertiary transition">Xem tất cả nhật ký</button>
                </div>
             </div>
             
             {/* Mock activity timeline */}
             <div className="relative space-y-6 before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-border-soft/30 pl-8">
                <div className="relative">
                   <span className="absolute -left-8 top-1.5 size-4 rounded-full bg-primary border-4 border-surface shadow-sm ring-1 ring-primary/20" />
                   <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-content">Tài khoản đã xác thực qua email</p>
                      <span className="text-xs text-subtle font-semibold">12 phút trước</span>
                   </div>
                   <p className="text-xs text-muted mt-1">Xác thực tự động bởi hệ thống</p>
                </div>
                <div className="relative">
                   <span className="absolute -left-8 top-1.5 size-4 rounded-full bg-border-soft border-4 border-surface shadow-sm" />
                   <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-content">Đăng ký tài khoản</p>
                      <span className="text-xs text-subtle font-semibold">24 Thg 10, 2023</span>
                   </div>
                   <p className="text-xs text-muted mt-1">Đăng ký nền tảng qua {user.email || 'alex@gmail.com'}</p>
                </div>
             </div>
             
             <div className="mt-12 text-center py-10 border-2 border-dashed border-border-soft/30 rounded-2xl flex flex-col items-center gap-3">
                <div className="size-12 rounded-full bg-panel-soft grid place-items-center text-subtle">
                   <History className="size-6" />
                </div>
                <p className="text-sm font-bold text-subtle">Không có hoạt động nào gần đây</p>
             </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

export function LockUserModal({ user, open, onClose, onSuccess }) {
  const [reason, setReason] = useState('Vi phạm điều khoản sử dụng')
  const [duration, setDuration] = useState('7')
  const [customReason, setCustomReason] = useState('')
  const [customDate, setCustomDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await adminUserService.lockUser(user.id, {
        reason: reason === 'Khác' ? customReason : reason,
        duration: duration,
        customDuration: duration === 'CUSTOM' ? customDate : undefined
      })
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to lock user', err)
    } finally {
      setLoading(false)
    }
  }

  const reasons = [
    'Vi phạm điều khoản sử dụng',
    'Spam hoặc hành vi gây ảnh hưởng hệ thống',
    'Nghi ngờ gian lận',
    'Nội dung không phù hợp',
    'Tài khoản giả mạo',
    'Khác'
  ]

  const durations = [
    { label: '1 ngày', value: '1' },
    { label: '3 ngày', value: '3' },
    { label: '7 ngày', value: '7' },
    { label: '30 ngày', value: '30' },
    { label: '90 ngày', value: '90' },
    { label: 'Vĩnh viễn', value: 'PERMANENT' },
    { label: 'Tùy chỉnh', value: 'CUSTOM' },
  ]

  return (
    <Modal
      open={open}
      title="Khóa tài khoản người dùng"
      onClose={onClose}
      footer={
        <>
          <button className="admin-secondary px-6 shrink-0" onClick={onClose}>Hủy bỏ</button>
          <button 
            className="admin-primary bg-error border-none text-white hover:bg-error/90 w-full font-extrabold rounded-xl" 
            onClick={handleSubmit} 
            disabled={loading}
          >
            {loading ? 'Đang thực hiện...' : 'Xác nhận khóa tài khoản'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 rounded-xl bg-error/[0.07] p-4 border border-error/20">
          <div className="size-12 rounded-full bg-error/15 grid place-items-center text-error">
             <User className="size-6" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-error uppercase tracking-wider">Khóa tài khoản cho</p>
            <p className="font-extrabold text-content">{user?.full_name}</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-subtle">Lý do khóa tài khoản</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {reasons.map(r => (
               <label key={r} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition cursor-pointer ${reason === r ? 'border-primary bg-tertiary/10 text-tertiary' : 'border-border-soft/40 bg-panel-soft text-subtle hover:bg-panel-soft/80'}`}>
                  <input 
                    type="radio" 
                    name="reason" 
                    value={r} 
                    checked={reason === r} 
                    onChange={(e) => setReason(e.target.value)}
                    className="accent-primary"
                  />
                  {r}
               </label>
            ))}
          </div>
          {reason === 'Khác' && (
            <textarea
              className="mt-3 w-full rounded-xl border border-border-soft/40 bg-panel-soft p-3 text-sm font-medium text-content outline-none focus:border-primary placeholder:text-muted"
              placeholder="Nhập lý do cụ thể..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              rows={3}
            />
          )}
        </div>

        <div>
           <label className="text-xs font-bold uppercase text-subtle">Thời gian khóa</label>
           <div className="mt-3 flex flex-wrap gap-2">
              {durations.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${duration === d.value ? 'bg-tertiary text-white shadow-sm' : 'bg-panel-soft border border-border-soft/30 text-subtle hover:border-tertiary hover:text-tertiary'}`}
                >
                  {d.label}
                </button>
              ))}
           </div>
           {duration === 'CUSTOM' && (
             <input
               type="datetime-local"
               className="mt-3 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-medium text-content outline-none focus:border-primary"
               value={customDate}
               onChange={(e) => setCustomDate(e.target.value)}
             />
           )}
        </div>
      </div>
    </Modal>
  )
}
