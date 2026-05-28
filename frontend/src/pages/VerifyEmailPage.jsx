import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '@/services/auth.service.js'
import { AuthShell } from './LoginPage.jsx'

export function VerifyEmailPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const token = searchParams.get('token')

    const [status, setStatus] = useState('verifying') // verifying, success, error
    const [error, setError] = useState('')
    const [countdown, setCountdown] = useState(5)
    const hasFired = useRef(false)

    useEffect(() => {
        if (hasFired.current) return
        hasFired.current = true

        const verify = async () => {
            if (!token) {
                setStatus('error')
                setError('Mã xác thực không hợp lệ hoặc đã hết hạn.')
                return
            }

            try {
                await authService.verifyEmail(token)
                setStatus('success')
            } catch (err) {
                setStatus('error')
                setError(err.response?.data?.message || 'Xác thực email thất bại. Vui lòng thử lại sau.')
            }
        }

        verify()
    }, [token])

    useEffect(() => {
        if (status === 'success' && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
            return () => clearTimeout(timer)
        } else if (status === 'success' && countdown === 0) {
            navigate('/login')
        }
    }, [status, countdown, navigate])

    return (
        <AuthShell>
            <div className="glass-panel mx-auto w-full max-w-lg rounded-lg p-10 shadow-2xl text-center">
                {status === 'verifying' && (
                    <div className="py-10">
                        <Loader2 className="mx-auto size-16 animate-spin text-primary" />
                        <h2 className="mt-6 text-2xl font-bold text-white">Đang xác thực email...</h2>
                        <p className="mt-2 text-muted text-lg">Vui lòng đợi trong giây lát.</p>
                    </div>
                )}

                {status === 'success' && (
                    <div>
                        <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-success/20 text-success">
                            <CheckCircle className="size-10" />
                        </div>
                        <h1 className="font-display text-3xl font-extrabold text-primary">
                            Email xác thực thành công!
                        </h1>
                        <p className="mt-4 text-muted text-lg">
                            Tài khoản của bạn đã được kích hoạt. Bạn hiện có thể đăng nhập để sử dụng tất cả tính năng của EventHub.
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
                )}

                {status === 'error' && (
                    <div>
                        <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-error/20 text-error">
                            <XCircle className="size-10" />
                        </div>
                        <h1 className="font-display text-3xl font-extrabold text-error">
                            Xác thực thất bại
                        </h1>
                        <p className="mt-4 text-muted text-lg">
                            {error}
                        </p>
                        <div className="mt-8 flex flex-col gap-3">
                            <Link
                                to="/register"
                                className="w-full rounded-md bg-surface border border-border-soft py-4 font-bold text-white hover:bg-panel-soft transition-colors"
                            >
                                Đăng ký lại
                            </Link>
                            <Link
                                to="/login"
                                className="w-full rounded-md bg-primary py-4 font-bold text-slate-950 hover:bg-primary/90 transition-colors"
                            >
                                Về trang Login
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </AuthShell>
    )
}
