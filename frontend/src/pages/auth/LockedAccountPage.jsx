import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Lock, Clock, Info, ArrowLeft } from 'lucide-react'
import { AuthShell } from './LoginPage.jsx'

export function LockedAccountPage() {
  const location = useLocation()
  const navigate = useNavigate()
  
  // Try to get lock info from state first, then sessionStorage
  const [lockInfo, setLockInfo] = useState(() => {
    try {
      if (location.state?.lockInfo) return location.state.lockInfo;
      const stored = sessionStorage.getItem('eventhub-lock-info');
      if (stored && stored !== 'undefined') return JSON.parse(stored);
    } catch (err) {
      console.error('Error parsing lock info', err);
    }
    return null;
  })

  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!lockInfo) {
      navigate('/login', { replace: true })
      return
    }

    if (!lockInfo.lockedUntil) return

    const interval = setInterval(() => {
      const now = new Date()
      const end = new Date(lockInfo.lockedUntil)
      const diff = end - now

      if (diff <= 0) {
        setTimeLeft('Đã hết hạn khóa!')
        clearInterval(interval)
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((diff / (1000 * 60)) % 60)
      const seconds = Math.floor((diff / 1000) % 60)

      const parts = []
      if (days > 0) parts.push(`${days} ngày`)
      parts.push(`${hours.toString().padStart(2, '0')}h`)
      parts.push(`${minutes.toString().padStart(2, '0')}m`)
      parts.push(`${seconds.toString().padStart(2, '0')}s`)

      setTimeLeft(parts.join(' '))
    }, 1000)

    return () => clearInterval(interval)
  }, [lockInfo, navigate])

  const handleBackToLogin = () => {
    sessionStorage.removeItem('eventhub-lock-info')
    navigate('/login', { replace: true })
  }

  if (!lockInfo) return null

  return (
    <AuthShell>
      <div className="glass-panel mx-auto w-full max-w-lg rounded-xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10">
        <div className="text-center">
          <div className="mx-auto mb-6 flex size-24 items-center justify-center rounded-full bg-error/10 ring-8 ring-error/5">
            <Lock className="size-12 text-error" />
          </div>
          <h1 className="font-display text-3xl font-black text-white">
            Tài khoản đã bị khóa
          </h1>
          <p className="mt-4 text-lg font-medium text-slate-300">
            Truy cập của bạn đã bị hạn chế do vi phạm quy tắc hệ thống.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <div className="rounded-xl bg-white/5 border border-white/10 p-6">
            <div className="flex items-start gap-4">
              <div className="mt-1 rounded-full bg-error/20 p-2">
                <Info className="size-5 text-error" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#737686]">Chi tiết vi phạm</p>
                <p className="mt-2 text-lg font-bold text-white leading-relaxed">
                  {lockInfo.lockReason || 'Sử dụng tài khoản trái phép hoặc vi phạm điều khoản dịch vụ.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
             <div className="rounded-xl bg-white/5 border border-white/10 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#737686]">Thời điểm khóa</p>
                <p className="mt-2 font-black text-white text-lg">
                  {new Date(lockInfo.lockedAt).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
             </div>
             <div className="rounded-xl bg-white/5 border border-white/10 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#737686]">Trạng thái</p>
                <p className={`mt-2 font-black text-lg ${lockInfo.isPermanentLock ? 'text-error' : 'text-primary'}`}>
                  {lockInfo.isPermanentLock ? 'Hết hạn: Vĩnh viễn' : 'Bản án: Tạm thời'}
                </p>
             </div>
          </div>

          {!lockInfo.isPermanentLock && lockInfo.lockedUntil ? (
            <div className="rounded-xl bg-slate-950 p-8 text-center ring-1 ring-white/10">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Tự động mở khóa sau</p>
              <p className="font-display text-4xl font-black text-primary tracking-tight tabular-nums">
                {timeLeft}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                <Clock className="size-3" /> Dự kiến: {new Date(lockInfo.lockedUntil).toLocaleString('vi-VN')}
              </div>
            </div>
          ) : (
             <div className="rounded-xl bg-error/10 p-6 text-center border border-error/20">
                <p className="font-black text-error text-lg tracking-wide uppercase">
                  Tài khoản bị khóa vĩnh viễn
                </p>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  Mọi khiếu nại vui lòng liên hệ admin qua email support@eventhub.vn
                </p>
             </div>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-4">
          <button
            onClick={handleBackToLogin}
            className="flex items-center justify-center gap-3 rounded-xl bg-white py-4 font-black text-slate-950 transition hover:bg-slate-200 active:scale-95"
          >
            <ArrowLeft className="size-5" /> Quay lại Đăng nhập
          </button>
          <button className="text-sm font-bold text-slate-400 hover:text-white transition">
            Điều khoản sử dụng & Chính sách bảo mật
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
