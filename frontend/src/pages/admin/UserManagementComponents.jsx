import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Calendar,
  Clock,
  History,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Shield,
  Ticket,
  Unlock,
  User,
  Info,
} from 'lucide-react'
import {
  Badge,
  Panel,
  AvatarFallback,
  Status,
  KpiGrid,
} from './AdminComponents'
import { Modal } from '@/components/Modal'
import adminUserService from '@/services/adminUser'

export function UserDetailView({ userId, onBack, onStatusChange }) {
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
  }, [userId])

  if (loading) {
    return <div className="py-20 text-center font-bold text-[#5c647a]">Loading user profile...</div>
  }

  if (!user) {
    return <div className="py-20 text-center font-bold text-error">User not found</div>
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-[#434655] hover:text-primary transition"
      >
        <ArrowLeft className="size-4" /> Back to User List
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Panel className="text-center">
            <div className="flex justify-center">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="size-32 rounded-full object-cover shadow-lg border-4 border-white" />
              ) : (
                <AvatarFallback name={user.full_name} className="size-32 rounded-full text-3xl" />
              )}
            </div>
            <h3 className="mt-4 font-display text-2xl font-extrabold text-[#111827]">{user.full_name}</h3>
            <div className="mt-2 flex justify-center gap-2">
              {user.roles && user.roles.filter(Boolean).length > 0 ? (
                user.roles.filter(Boolean).map(role => (
                  <Badge key={role} tone={role === 'ADMIN' ? 'purple' : 'blue'}>{role}</Badge>
                ))
              ) : (
                <Badge tone="gray">CHƯA XÁC THỰC</Badge>
              )}
            </div>
            <div className="mt-6 border-t border-[#e0e3e5] pt-6 flex justify-around">
               <div className="text-center">
                  <p className="text-xs font-bold text-[#737686] uppercase">Created At</p>
                  <p className="mt-1 font-bold">{new Date(user.created_at).toLocaleDateString('vi-VN')}</p>
               </div>
               <div className="text-center text-error">
                  <p className="text-xs font-bold text-[#737686] uppercase">Status</p>
                  <div className="mt-1 flex justify-center"><Status value={user.status} /></div>
               </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
               {user.status === 'LOCKED' ? (
                 <button 
                  onClick={() => onStatusChange('UNLOCK', user)}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-[#008a3d] py-3 text-sm font-bold text-white hover:bg-green-700 transition"
                >
                   <Unlock className="size-4" /> Unlock Account
                 </button>
               ) : (
                 <button 
                  onClick={() => onStatusChange('LOCK', user)}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-[#ba1a1a] py-3 text-sm font-bold text-white hover:bg-red-700 transition"
                >
                   <Lock className="size-4" /> Lock Account
                 </button>
               )}
            </div>
          </Panel>

          <Panel>
            <h4 className="font-bold text-[#111827] mb-4">Contact Information</h4>
            <div className="space-y-4 text-sm">
               <div className="flex items-start gap-3">
                  <Mail className="size-4 text-[#737686] mt-0.5" />
                  <div>
                    <p className="font-bold">Email</p>
                    <p className="text-[#434655]">{user.email}</p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <Phone className="size-4 text-[#737686] mt-0.5" />
                  <div>
                    <p className="font-bold">Phone Number</p>
                    <p className="text-[#434655]">{user.phone || 'Not provided'}</p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <MapPin className="size-4 text-[#737686] mt-0.5" />
                  <div>
                    <p className="font-bold">Address</p>
                    <p className="text-[#434655]">
                      {user.address ? `${user.address}, ${user.city}` : 'No address provided'}
                    </p>
                  </div>
               </div>
               <div className="flex items-start gap-3">
                  <Calendar className="size-4 text-[#737686] mt-0.5" />
                  <div>
                    <p className="font-bold">Birthday</p>
                    <p className="text-[#434655]">{user.dob ? new Date(user.dob).toLocaleDateString('vi-VN') : 'Not provided'}</p>
                  </div>
               </div>
            </div>
          </Panel>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          <KpiGrid 
            items={[
               ['Events Created', user.events_created || 0, 'Organizer'],
               ['Tickets Bought', user.tickets_bought || 0, 'Customer'],
               ['Total Transactions', `${(user.total_spent || 0).toLocaleString('vi-VN')} VND`, 'Finance'],
               ['Last Update', new Date(user.updated_at).toLocaleDateString('vi-VN'), 'System'],
            ]}
          />

          {user.status === 'LOCKED' && (
            <Panel className="border-error/20 bg-error/5">
               <div className="flex items-start gap-4">
                  <div className="rounded-full bg-error/10 p-2 text-error">
                    <Info className="size-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-[#ba1a1a]">Lock Details</h4>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm">
                       <div>
                          <p className="text-xs font-bold text-[#737686] uppercase">Reason</p>
                          <p className="mt-1 font-semibold">{user.lock_reason}</p>
                       </div>
                       <div>
                          <p className="text-xs font-bold text-[#737686] uppercase">Locked Until</p>
                          <p className="mt-1 font-semibold">{user.locked_until ? new Date(user.locked_until).toLocaleString('vi-VN') : 'Permanent'}</p>
                       </div>
                       <div>
                          <p className="text-xs font-bold text-[#737686] uppercase">Locked By</p>
                          <p className="mt-1 font-semibold">{user.locked_by_name || 'System'}</p>
                       </div>
                       <div>
                          <p className="text-xs font-bold text-[#737686] uppercase">Locked At</p>
                          <p className="mt-1 font-semibold">{new Date(user.locked_at).toLocaleString('vi-VN')}</p>
                       </div>
                    </div>
                  </div>
               </div>
            </Panel>
          )}

          <Panel className="min-h-[300px]">
             <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-[#111827]">Account Activity</h4>
                <div className="flex gap-2">
                   <button className="rounded bg-[#f2f4f6] px-3 py-1.5 text-xs font-bold text-[#434655]">View All Logs</button>
                </div>
             </div>
             
             {/* Mock activity timeline */}
             <div className="relative space-y-6 before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-[#e0e3e5] pl-8">
                <div className="relative">
                   <span className="absolute -left-8 top-1.5 size-4 rounded-full bg-primary border-4 border-white shadow-sm ring-1 ring-primary/20" />
                   <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-[#191c1e]">Account verified via email</p>
                      <span className="text-xs text-[#737686] font-semibold">12 mins ago</span>
                   </div>
                   <p className="text-xs text-[#5c647a] mt-1">System automated verification</p>
                </div>
                <div className="relative">
                   <span className="absolute -left-8 top-1.5 size-4 rounded-full bg-[#c3c6d7] border-4 border-white shadow-sm" />
                   <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-[#191c1e]">Initial registration</p>
                      <span className="text-xs text-[#737686] font-semibold">Oct 24, 2023</span>
                   </div>
                   <p className="text-xs text-[#5c647a] mt-1">Platform signup via alex@gmail.com</p>
                </div>
             </div>
             
             <div className="mt-12 text-center py-10 border-2 border-dashed border-[#e0e3e5] rounded-xl flex flex-col items-center gap-3">
                <div className="size-12 rounded-full bg-[#f2f4f6] grid place-items-center text-[#737686]">
                   <History className="size-6" />
                </div>
                <p className="text-sm font-bold text-[#5c647a]">No more recent activity found</p>
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
            className="admin-primary bg-[#ba1a1a] border-none text-white hover:bg-red-700 w-full" 
            onClick={handleSubmit} 
            disabled={loading}
          >
            {loading ? 'Đang thực hiện...' : 'Xác nhận khóa tài khoản'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 rounded-md bg-[#fdf2f2] p-4 border border-error/10">
          <div className="size-12 rounded-full bg-error/10 grid place-items-center text-error">
             <User className="size-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-error uppercase">Khóa tài khoản cho</p>
            <p className="font-bold text-[#111827]">{user?.full_name}</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase text-[#737686]">Lý do khóa tài khoản</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {reasons.map(r => (
               <label key={r} className={`flex items-center gap-2 rounded-md border p-3 text-sm font-semibold transition cursor-pointer ${reason === r ? 'border-primary bg-primary/5 text-primary' : 'border-[#c3c6d7] text-[#434655] hover:bg-[#f7f9fb]'}`}>
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
              className="mt-3 w-full rounded-md border border-[#c3c6d7] p-3 text-sm font-medium outline-none focus:border-primary"
              placeholder="Nhập lý do cụ thể..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              rows={3}
            />
          )}
        </div>

        <div>
           <label className="text-xs font-bold uppercase text-[#737686]">Thời gian khóa</label>
           <div className="mt-3 flex flex-wrap gap-2">
              {durations.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={`rounded px-3 py-2 text-xs font-bold transition ${duration === d.value ? 'bg-primary text-slate-950 shadow-sm' : 'bg-[#f2f4f6] text-[#434655] hover:bg-[#e0e3e5]'}`}
                >
                  {d.label}
                </button>
              ))}
           </div>
           {duration === 'CUSTOM' && (
             <input
               type="datetime-local"
               className="mt-3 h-11 w-full rounded border border-[#c3c6d7] px-3 text-sm font-medium outline-none focus:border-primary"
               value={customDate}
               onChange={(e) => setCustomDate(e.target.value)}
             />
           )}
        </div>
      </div>
    </Modal>
  )
}
