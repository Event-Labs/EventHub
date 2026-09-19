import { CheckCircle, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '@/services/auth.service.js'
import { AuthShell, Field } from './LoginPage.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function ForgotPasswordPage() {
    const toast = useToast()
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
            toast.success('Yêu cầu đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra email.')
        } catch (err) {
            const message = getApiMessage(err, 'Không thể gửi yêu cầu đặt lại mật khẩu.')
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
                        Yêu cầu đã gửi!
                    </h1>
                    <p className="mt-4 text-slate-300 text-lg">
                        Nếu email <strong>{email}</strong> tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu cho bạn.
                        Vui lòng kiểm tra hộp thư.
                    </p>
                    <div className="mt-8">
                        <Link
                            to="/login"
                            className="cosmic-btn-primary w-full py-3.5 text-[15px]"
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
            <div className="glass-panel relative overflow-hidden mx-auto w-full max-w-md rounded-[24px] border-primary/20 p-8 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)]">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_50%)] opacity-20" />
                <div className="text-center">
                    <h1 className="font-display text-3xl font-extrabold text-primary drop-shadow-lg">
                        Quên mật khẩu
                    </h1>
                    <p className="mt-3 text-sm font-medium text-slate-300">
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



                    <button
                        type="submit"
                        disabled={loading}
                        className="cosmic-btn-primary w-full py-3.5 text-[15px]"
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
