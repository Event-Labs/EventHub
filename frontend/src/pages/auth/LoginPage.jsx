import { Eye, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import heroImage from '@/assets/hero.png'
import { clearAuthSession, getAuthToken, getPostLoginPath, getRememberLoginPreference, getStoredUser, setAuthSession } from '@/lib/auth.js'
import { authService } from '@/services/auth.service.js'
import { GoogleLogin } from '@react-oauth/google'
import { LockedAccountModal } from '@/components/LockedAccountModal'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const logoSrc = '/images/LogoEH.png'

export function LoginPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [rememberLogin, setRememberLogin] = useState(getRememberLoginPreference)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [lockData, setLockData] = useState(null)
  const [otpStep, setOtpStep] = useState(null)
  const [otp, setOtp] = useState('')
  const loginPendingRef = useRef(false)
  const otpPendingRef = useRef(false)

  useEffect(() => {
    const handleLockEvent = (e) => {
      setLockData(e.detail);
      setLockModalOpen(true);
    };
    window.addEventListener('account-locked', handleLockEvent);

    const storedLockInfo = sessionStorage.getItem('eventhub-lock-info')
    if (storedLockInfo) {
      try {
        const parsed = JSON.parse(storedLockInfo)
        if (parsed) {
          setLockData(parsed)
          setLockModalOpen(true)
        }
      } catch (err) {
        sessionStorage.removeItem('eventhub-lock-info')
      }
    }

    return () => window.removeEventListener('account-locked', handleLockEvent);
  }, []);

  useEffect(() => {
    const token = getAuthToken()
    if (!token) return

    try {
      const user = getStoredUser()
      navigate(getPostLoginPath(user, searchParams.get('redirect') || '/'), {
        replace: true,
      })
    } catch {
      clearAuthSession()
    }
  }, [navigate, searchParams])

  const login = async () => {
    if (loginPendingRef.current) return
    loginPendingRef.current = true
    setError('')
    setLoading(true)
    try {
      const res = await authService.login(form)
      if (res.data?.requiresTwoFactor) {
        setOtpStep(res.data)
        setOtp('')
        toast.success(`Mã OTP đã được gửi đến ${res.data.email || 'email quản trị'}.`)
        return
      }
      const { accessToken, user } = res.data
      setAuthSession({ accessToken, user, remember: rememberLogin })
      toast.success('Đăng nhập thành công.')
      navigate(getPostLoginPath(user, searchParams.get('redirect') || '/'))
    } catch (err) {
      const errorData = err.response?.data;
      if (err.response?.status === 403 && (errorData?.errorCode === 'ACCOUNT_LOCKED' || errorData?.error === 'ACCOUNT_LOCKED')) {
        setLockData(errorData.data || errorData);
        setLockModalOpen(true);
        return
      }
      const message = getApiMessage(err, 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.')
      setError(message)
      toast.error(message)
    } finally {
      loginPendingRef.current = false
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    if (!otpStep?.challengeId) return
    if (otpPendingRef.current) return
    otpPendingRef.current = true

    setError('')
    setLoading(true)
    try {
      const res = await authService.verifyAdminOtp({
        challengeId: otpStep.challengeId,
        otp,
      })
      const { accessToken, user } = res.data
      setAuthSession({ accessToken, user, remember: rememberLogin })
      setOtpStep(null)
      setOtp('')
      toast.success('Xác thực OTP thành công.')
      navigate(getPostLoginPath(user, searchParams.get('redirect') || '/'))
    } catch (err) {
      const message = getApiMessage(err, 'Mã OTP không hợp lệ hoặc đã hết hạn.')
      setError(message)
      toast.error(message)
    } finally {
      otpPendingRef.current = false
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('')
    setLoading(true)
    try {
      const res = await authService.googleLogin(credentialResponse.credential)
      const { accessToken, user } = res.data
      setAuthSession({ accessToken, user, remember: rememberLogin })
      toast.success('Đăng nhập Google thành công.')
      navigate(getPostLoginPath(user, searchParams.get('redirect') || '/'))
    } catch (err) {
      const errorData = err.response?.data;
      if (err.response?.status === 403 && (errorData?.errorCode === 'ACCOUNT_LOCKED' || errorData?.error === 'ACCOUNT_LOCKED')) {
        // Ưu tiên lấy data chi tiết từ response
        const lockInfo = errorData.data || errorData;
        setLockData(lockInfo);
        setLockModalOpen(true);
        // Xoá thông báo lỗi thông thường để không bị hiển thị cùng lúc
        setError('');
        return;
      }
      const message = getApiMessage(err, 'Đăng nhập Google thất bại.')
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="glass-panel mx-auto w-full max-w-md rounded-lg p-7 shadow-2xl">
        <div className="text-center">
          <AuthLogo />
          <p className="mt-2 text-muted">
            Đăng nhập để tiếp tục đặt vé và quản lý sự kiện
          </p>
        </div>
        <div className="mt-6 flex w-full justify-center overflow-hidden rounded-sm">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              const message = 'Đăng nhập Google thất bại. Vui lòng thử lại.'
              setError(message)
              toast.error(message)
            }}
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
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (otpStep) {
              verifyOtp()
            } else {
              login()
            }
          }}
        >
          {otpStep ? (
            <>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-4 text-sm text-content">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-bold">Xác thực 2 lớp</p>
                    <p className="mt-1 text-muted">Nhập mã OTP 6 số đã gửi đến {otpStep.email || 'email quản trị'}.</p>
                  </div>
                </div>
              </div>
              <Field
                icon={ShieldCheck}
                label="Mã OTP"
                placeholder="123456"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button
                type="button"
                onClick={() => {
                  setOtpStep(null)
                  setOtp('')
                  setError('')
                }}
                className="text-sm font-bold text-primary hover:underline"
              >
                Đăng nhập bằng tài khoản khác
              </button>
            </>
          ) : (
            <>
          <Field
            icon={Mail}
            label="Email"
            placeholder="alex@example.com"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <Field
            icon={Lock}
            label="Mật khẩu"
            placeholder="••••••••"
            type="password"
            trailing={Eye}
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(event) => setRememberLogin(event.target.checked)}
                className="size-4 rounded border-border-soft bg-surface accent-tertiary"
              />
              <span>Ghi nhớ đăng nhập</span>
            </label>
            <Link
              to="/forgot-password"
              className="text-sm font-bold text-primary hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>
            </>
          )}
          {error && (
            <div className="rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || (otpStep && otp.length !== 6)}
            className="w-full rounded-md bg-tertiary py-4 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Đang đăng nhập...' : (otpStep ? 'Xác thực OTP' : 'Đăng nhập')}
          </button>
        </form>
        <p className="mt-6 text-center text-muted">
          Chưa có tài khoản?
          <Link
            to="/register"
            className="ml-2 font-bold text-primary hover:underline"
          >
            Đăng ký
          </Link>
        </p>
      </div>
      <LockedAccountModal
        open={lockModalOpen}
        lockData={lockData}
        onLogout={() => {
          setLockModalOpen(false);
          setLockData(null);
          sessionStorage.removeItem('eventhub-lock-info');
        }}
      />
    </AuthShell>
  )
}

export function AuthLogo() {
  return (
    <img
      src={logoSrc}
      alt="EventHub"
      className="mx-auto h-12 w-[212px] object-cover object-center mix-blend-screen"
    />
  )
}

export function AuthShell({ children }) {
  return (
    <div className="relative flex min-h-[calc(100vh-64px)] items-center justify-center overflow-hidden px-4 py-12">
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-background/88 backdrop-blur-sm" />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  )
}

export function Field({ icon: Icon, trailing: Trailing, label, ...props }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = props.type === 'password'

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          {...props}
          type={isPassword ? (showPassword ? 'text' : 'password') : props.type}
          className="w-full rounded-md border border-border-soft bg-surface py-3 pl-10 pr-10 text-content outline-none focus:border-primary"
        />
        {isPassword && Trailing && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary outline-none"
          >
            <Trailing className="size-4" />
          </button>
        )}
      </div>
    </label>
  )
}
