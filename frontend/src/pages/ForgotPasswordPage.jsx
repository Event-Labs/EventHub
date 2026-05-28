import { CheckCircle, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '@/services/auth.service.js'
import { AuthShell, Field } from './LoginPage.jsx'

export function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await authService.forgotPassword(email)
            setSuccess(true)
        } catch (err) {
            setError(err.response?.data?.message || 'Không thể gửi yêu cầu đặt lại mật khẩu.')
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
                        Yêu cầu đã gửi!
                    </h1>
                    <p className="mt-4 text-muted text-lg">
                        Nếu email <strong>{email}</strong> tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu cho bạn.
                        Vui lòng kiểm tra hộp thư.
                    </p>
                    <div className="mt-8">
                        <Link
                            to="/login"
                            className="inline-block w-full rounded-md bg-primary py-4 font-bold text-slate-950 hover:bg-primary/90 transition-colors"
                        >
                            Quay lại đăng nhập
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
                        Quên mật khẩu
                    </h1>
                    <p className="mt-2 text-muted">
                        Nhập email để nhận liên kết đặt lại mật khẩu.
                    </p>
                </div>

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                    <Field
                        icon={Mail}
                        label="Email"
                        placeholder="ban@example.com"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    {error && (
                        <div className="rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-md bg-primary py-4 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {loading ? 'Đang xử lý...' : 'Gửi email đặt lại'}
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
