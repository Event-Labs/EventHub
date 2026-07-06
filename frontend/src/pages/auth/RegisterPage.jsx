import { Lock, Mail, Phone, User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '@/services/auth.service.js'
import { AuthLogo, AuthShell, Field } from './LoginPage.jsx'
import { GoogleLogin } from '@react-oauth/google'
import { getPostLoginPath, setAuthSession } from '@/lib/auth.js'

export function RegisterPage() {
    const [form, setForm] = useState({
        full_name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    })
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleRegister = async (e) => {
        e.preventDefault()
        setError('')

        if (form.password !== form.confirmPassword) {
            setError('Mật khẩu xác nhận không khớp.')
            return
        }

        if (form.password.length < 8 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password) || !/[^a-zA-Z\d]/.test(form.password)) {
            setError('Mật khẩu chưa đủ mạnh. Yêu cầu ít nhất 8 ký tự, bao gồm chữ hoa, thường, số và ký tự đặc biệt.')
            return
        }

        setLoading(true)
        try {
            // BE validation: full_name (required), email, password, phone (optional)
            await authService.register({
                full_name: form.full_name,
                email: form.email,
                password: form.password,
                phone: form.phone || undefined,
            })
            setSuccess(true)
        } catch (err) {
            const apiError = err.response?.data
            // Handle Zod validation errors (array of issues)
            if (apiError?.errors && Array.isArray(apiError.errors)) {
                setError(apiError.errors.map(e => e.message).join(', '))
            } else {
                setError(apiError?.message || 'Đăng ký không thành công. Vui lòng thử lại.')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleSuccess = async (credentialResponse) => {
        setError('')
        setLoading(true)
        try {
            const res = await authService.googleLogin(credentialResponse.credential)
            const { accessToken, user } = res.data
            setAuthSession({ accessToken, user, remember: true })
            window.location.href = getPostLoginPath(user)
        } catch (err) {
            setError(err.response?.data?.message || 'Đăng ký bằng Google thất bại.')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <AuthShell>
                <div className="glass-panel mx-auto w-full max-w-lg rounded-lg p-7 shadow-2xl text-center">
                    <AuthLogo />
                    <div className="mb-6 mt-6 inline-flex size-20 items-center justify-center rounded-full bg-success/20 text-success">
                        <Mail className="size-10" />
                    </div>
                    <h1 className="font-display text-3xl font-extrabold text-primary">
                        Đăng ký thành công!
                    </h1>
                    <p className="mt-4 text-muted text-lg">
                        Một email xác thực đã được gửi đến <strong>{form.email}</strong>.
                        Vui lòng kiểm tra hộp thư và click vào link để kích hoạt tài khoản.
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
            <div className="glass-panel mx-auto w-full max-w-lg rounded-lg p-7 shadow-2xl">
                <div className="text-center">
                    <AuthLogo />
                    <h1 className="mt-3 font-display text-3xl font-extrabold text-primary">
                        Tạo tài khoản
                    </h1>
                    <p className="mt-2 text-muted">
                        Tài khoản khách hàng để mua vé, lưu yêu thích và theo dõi đơn.
                    </p>
                </div>
                <div className="mt-6 flex w-full justify-center overflow-hidden rounded-sm">
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError('Đăng nhập Google thất bại.')}
                        useOneTap
                        width="100%"
                        theme="outline"
                        size="large"
                        text="continue_with"
                        shape="rectangular"
                        locale="vi"
                    />
                </div>
                <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
                    <span className="h-px flex-1 bg-border-soft" />
                    hoặc email
                    <span className="h-px flex-1 bg-border-soft" />
                </div>
                <form className="space-y-4" onSubmit={handleRegister}>
                    <Field
                        icon={User}
                        label="Họ và tên"
                        placeholder="Nguyễn Văn A"
                        required
                        value={form.full_name}
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                    <Field
                        icon={Mail}
                        label="Email"
                        placeholder="alex@example.com"
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                    <Field
                        icon={Phone}
                        label="Số điện thoại"
                        placeholder="0901 234 567"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Field
                                icon={Lock}
                                label="Mật khẩu"
                                placeholder="••••••••"
                                type="password"
                                required
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                            <PasswordStrength password={form.password} />
                        </div>
                        <Field
                            icon={Lock}
                            label="Xác nhận mật khẩu"
                            placeholder="••••••••"
                            type="password"
                            required
                            value={form.confirmPassword}
                            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                        />
                    </div>

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
                        {loading ? 'Đang xử lý...' : 'Đăng ký'}
                    </button>
                </form>
                <p className="mt-6 text-center">
                    Đã có tài khoản?{' '}
                    <Link to="/login" className="font-bold text-primary hover:underline">
                        Đăng nhập
                    </Link>
                </p>
            </div>
        </AuthShell>
    )
}

export function PasswordStrength({ password }) {
    if (!password) return null

    let score = 0
    if (password.length >= 8) score++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[^a-zA-Z\d]/.test(password)) score++

    const getStrengthLabel = () => {
        if (score === 0 || score === 1) return { text: 'Yếu', color: 'bg-error', textColor: 'text-error' }
        if (score === 2) return { text: 'Trung bình', color: 'bg-orange-500', textColor: 'text-orange-500' }
        if (score === 3) return { text: 'Khá', color: 'bg-blue-500', textColor: 'text-blue-500' }
        return { text: 'Mạnh', color: 'bg-success', textColor: 'text-success' }
    }

    const strength = getStrengthLabel()

    return (
        <div className="mt-3 space-y-2">
            <div className="flex gap-1">
                {[1, 2, 3, 4].map((step) => (
                    <div
                        key={step}
                        className={`h-1 w-full rounded-full transition-colors ${score >= step ? strength.color : 'bg-border-soft'
                            }`}
                    />
                ))}
            </div>
            <p className={`text-xs font-medium ${strength.textColor}`}>
                Mức độ: {strength.text}
            </p>
        </div>
    )
}
