import { CheckCircle, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '@/services/auth.service.js'
import { AuthShell, Field } from './LoginPage.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function ResetPasswordPage() {
    const toast = useToast()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const token = searchParams.get('token')

    const [form, setForm] = useState({
        password: '',
        confirmPassword: '',
    })
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState(() =>
        token ? '' : 'Mã đặt lại mật khẩu không tồn tại.',
    )
    const [countdown, setCountdown] = useState(5)

    useEffect(() => {
        if (success && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
            return () => clearTimeout(timer)
        } else if (success && countdown === 0) {
            navigate('/login')
        }
    }, [success, countdown, navigate])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!token) return

        if (form.password !== form.confirmPassword) {
            const message = 'Mật khẩu xác nhận không khớp.'
            setError(message)
            toast.error(message)
            return
        }

        setLoading(true)
        setError('')
        try {
            await authService.resetPassword(token, form.password)
            setSuccess(true)
            toast.success('Đặt lại mật khẩu thành công.')
        } catch (err) {
            const message = getApiMessage(err, 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.')
            setError(message)
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <AuthShell>
                <div className="glass-panel relative overflow-hidden mx-auto w-full max-w-md rounded-[24px] border-primary/20 p-10 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] text-center">
                    <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_50%)] opacity-20" />
                    <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-success/20 text-success shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                        <CheckCircle className="size-10" />
                    </div>
                    <h1 className="font-display text-3xl font-extrabold text-primary drop-shadow-lg">
                        Đặt lại mật khẩu thành công!
                    </h1>
                    <p className="mt-4 text-slate-300 text-lg">
                        Mật khẩu của bạn đã được thay đổi. Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.
                    </p>
                    <p className="mt-6 text-slate-400 italic">
                        Tự động chuyển về trang đăng nhập sau <span className="font-bold text-primary">{countdown}s</span>...
                    </p>
                    <div className="mt-8">
                        <Link
                            to="/login"
                            className="cosmic-btn-primary w-full py-3.5 text-[15px]"
                        >
                            Về trang Login
                        </Link>
                    </div>
                </div>
            </AuthShell>
        )
    }

    return (
        <AuthShell>
            <div className="glass-panel relative overflow-hidden mx-auto w-full max-w-md rounded-[24px] border-primary/20 p-8 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)]">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_50%)] opacity-20" />
                <div className="text-center">
                    <h1 className="font-display text-3xl font-extrabold text-primary drop-shadow-lg">
                        Đặt lại mật khẩu
                    </h1>
                    <p className="mt-3 text-sm font-medium text-slate-300">
                        Vui lòng nhập mật khẩu mới cho tài khoản của bạn.
                    </p>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                    <Field
                        icon={Lock}
                        label="Mật khẩu mới"
                        placeholder="••••••••"
                        type="password"
                        required
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                    <Field
                        icon={Lock}
                        label="Xác nhận mật khẩu mới"
                        placeholder="••••••••"
                        type="password"
                        required
                        value={form.confirmPassword}
                        onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    />



                    <button
                        type="submit"
                        disabled={loading || !token}
                        className="cosmic-btn-primary w-full py-3.5 text-[15px]"
                    >
                        {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
                    </button>
                </form>

                <p className="mt-6 text-center">
                    <Link to="/login" className="font-bold text-primary hover:underline">
                        Quay lại đăng nhập
                    </Link>
                </p>
            </div>
        </AuthShell>
    )
}
