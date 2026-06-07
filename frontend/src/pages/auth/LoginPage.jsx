import {  Eye, Lock, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { heroImage } from '@/data/events.js'
import { getPostLoginPath } from '@/lib/auth.js'
import { authService } from '@/services/auth.service.js'
import { GoogleLogin } from '@react-oauth/google'

function getCustomerGooglePath(redirectPath = '/') {
  if (
    redirectPath.startsWith('/organizer') ||
    redirectPath.startsWith('/admin') ||
    redirectPath.startsWith('/staff')
  ) {
    return '/'
  }

  return redirectPath || '/'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('eventhub-token')
    if (!token) return

    try {
      const user = JSON.parse(localStorage.getItem('eventhub-user') || 'null')
      navigate(getPostLoginPath(user, searchParams.get('redirect') || '/'), {
        replace: true,
      })
    } catch {
      localStorage.removeItem('eventhub-token')
      localStorage.removeItem('eventhub-user')
      localStorage.removeItem('eventhub-auth')
    }
  }, [navigate, searchParams])

  const login = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await authService.login(form)
      const { accessToken, user } = res.data
      localStorage.setItem('eventhub-token', accessToken)
      localStorage.setItem('eventhub-user', JSON.stringify(user))
      localStorage.setItem('eventhub-auth', 'true')
      window.dispatchEvent(new Event('eventhub-auth'))
      navigate(getCustomerGooglePath(searchParams.get('redirect') || '/'))
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.')
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
      localStorage.setItem('eventhub-token', accessToken)
      localStorage.setItem('eventhub-user', JSON.stringify(user))
      localStorage.setItem('eventhub-auth', 'true')
      window.dispatchEvent(new Event('eventhub-auth'))
      navigate(getPostLoginPath(user, searchParams.get('redirect') || '/'))
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập Google thất bại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="glass-panel mx-auto w-full max-w-md rounded-lg p-7 shadow-2xl">
        <div className="text-center">
          <h1 className="font-display text-3xl font-extrabold text-primary">
            EventHub
          </h1>
          <p className="mt-2 text-muted">
            Đăng nhập để tiếp tục đặt vé và quản lý sự kiện
          </p>
        </div>
        <div className="mt-6 flex w-full justify-center overflow-hidden rounded-sm">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              setError('Đăng nhập Google thất bại. Vui lòng thử lại.')
            }}
            useOneTap
            width="100%"
            theme="outline"
            size="large"
            text="continue_with"
            shape="rectangular"
            locale="en"
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
            login()
          }}
        >
          <Field
            icon={Mail}
            label="Email"
            placeholder="alex@example.com"
            type="email"
            required
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
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm font-bold text-primary hover:underline"
            >
              Quên mật khẩu?
            </Link>
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
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
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
    </AuthShell>
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
