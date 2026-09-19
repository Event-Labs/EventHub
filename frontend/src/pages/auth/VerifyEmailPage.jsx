import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '@/services/auth.service.js'
import { AuthShell } from './LoginPage.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function VerifyEmailPage() {
    const toast = useToast()
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
                const message = 'Mã xác thực không hợp lệ hoặc đã hết hạn.'
                setStatus('error')
                setError(message)
                toast.error(message)
                return
            }

            try {
                await authService.verifyEmail(token)
                setStatus('success')
                toast.success('Email xác thực thành công.')
            } catch (err) {
                const message = getApiMessage(err, 'Xác thực email thất bại. Vui lòng thử lại sau.')
                setStatus('error')
                setError(message)
                toast.error(message)
            }
        }

        verify()
    }, [token, toast])

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
            <div className="glass-panel relative overflow-hidden mx-auto w-full max-w-lg rounded-[24px] border-primary/20 p-10 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] text-center">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-20%,_var(--color-primary)_0%,_transparent_50%)] opacity-20" />
                
                {status === 'verifying' && (
                    <div className="py-10">
                        <Loader2 className="mx-auto size-16 animate-spin text-primary" />
                        <h2 className="mt-6 text-2xl font-bold text-white drop-shadow-lg">Đang xác thực email...</h2>
                        <p className="mt-2 text-slate-300 text-lg">Vui lòng đợi trong giây lát.</p>
                    </div>
                )}

                {status === 'success' && (
                    <div>
                        <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-success/20 text-success shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <CheckCircle className="size-10" />
                        </div>
                        <h1 className="font-display text-3xl font-extrabold text-primary drop-shadow-lg">
                            Email xác thực thành công!
                        </h1>
                        <p className="mt-4 text-slate-300 text-lg">
                            Tài khoản của bạn đã được kích hoạt. Bạn hiện có thể đăng nhập để sử dụng tất cả tính năng của EventHub.
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
                )}

                {status === 'error' && (
                    <div>
                        <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-error/20 text-error shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                            <XCircle className="size-10" />
                        </div>
                        <h1 className="font-display text-3xl font-extrabold text-error drop-shadow-lg">
                            Xác thực thất bại
                        </h1>
                        <p className="mt-4 text-slate-300 text-lg">
                            {error}
                        </p>
                        <div className="mt-8 flex flex-col gap-4">
                            <Link
                                to="/register"
                                className="inline-flex w-full items-center justify-center rounded-full border border-border-soft bg-surface py-3.5 font-bold text-white hover:bg-panel-soft transition-colors"
                            >
                                Đăng ký lại
                            </Link>
                            <Link
                                to="/login"
                                className="cosmic-btn-primary w-full py-3.5 text-[15px]"
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
