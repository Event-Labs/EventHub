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
                <div className="glass-panel mx-auto w-full max-w-md rounded-lg p-10 shadow-2xl text-center">
                    <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-success/20 text-success">
                        <CheckCircle className="size-10" />
                    </div>
                    <h1 className="font-display text-3xl font-extrabold text-primary">
                        Đặt lại mật khẩu thành công!
                    </h1>
                    <p className="mt-4 text-muted text-lg">
                        Mật khẩu của bạn đã được thay đổi. Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.
                    </p>
                    <p className="mt-6 text-subtle italic">
                        Tự động chuyển về trang đăng nhập sau <span className="font-bold text-primary">{countdown}s</span>...
                    </p>
                    <div className="mt-8">
                        <Link
                            to="/login"
                            className="inline-block w-full rounded-md bg-primary py-4 font-bold text-slate-950 hover:bg-primary/90 transition-colors"
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
            <div className="glass-panel mx-auto w-full max-w-md rounded-lg p-7 shadow-2xl">
                <div className="text-center">
                    <h1 className="font-display text-3xl font-extrabold text-primary">
                        Đặt lại mật khẩu
                    </h1>
                    <p className="mt-2 text-muted">
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

                    {error && (
                        <div className="rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !token}
                        className="w-full rounded-md bg-primary py-4 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
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
