import { Circle, Eye, Lock, Mail, User } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { heroImage } from '@/data/events.js'
import { http } from '@/services/http.js'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    setError('')
    setLoading(true)
    try {
      const response = await http.post('/auth/login', form)
      const { accessToken, user } = response.data.data
      localStorage.setItem('eventhub-token', accessToken)
      localStorage.setItem('eventhub-user', JSON.stringify(user))
      localStorage.setItem('eventhub-auth', 'true')
      window.dispatchEvent(new Event('eventhub-auth'))
      navigate(searchParams.get('redirect') || '/')
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập không thành công.')
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
            Đăng nhập để tiếp tục đặt vé và quản lý sự kiện.
          </p>
        </div>
        <button className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-border-soft bg-white py-3 font-bold text-slate-900">
          <Circle className="size-5" />
          Đăng nhập bằng Google
        </button>
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
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <Field
            icon={Lock}
            label="Mật khẩu"
            placeholder="••••••••"
            type="password"
            trailing={Eye}
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

export function RegisterPage() {
  const navigate = useNavigate()
  const register = () => {
    localStorage.setItem('eventhub-auth', 'true')
    window.dispatchEvent(new Event('eventhub-auth'))
    navigate('/')
  }

  return (
    <AuthShell>
      <div className="glass-panel mx-auto w-full max-w-lg rounded-lg p-7 shadow-2xl">
        <div className="text-center">
          <h1 className="font-display text-3xl font-extrabold text-primary">
            Tạo tài khoản
          </h1>
          <p className="mt-2 text-muted">
            Tài khoản khách hàng để mua vé, lưu yêu thích và theo dõi đơn.
          </p>
        </div>
        <button className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-border-soft bg-white py-3 font-bold text-slate-900">
          <Circle className="size-5" />
          Đăng ký bằng Google
        </button>
        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
          <span className="h-px flex-1 bg-border-soft" />
          hoặc email
          <span className="h-px flex-1 bg-border-soft" />
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field icon={User} label="Họ và tên" placeholder="Alex Rivers" />
          <Field
            icon={Mail}
            label="Email"
            placeholder="alex@example.com"
            type="email"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              icon={Lock}
              label="Mật khẩu"
              placeholder="••••••••"
              type="password"
            />
            <Field
              icon={Lock}
              label="Xác nhận mật khẩu"
              placeholder="••••••••"
              type="password"
            />
          </div>
          <button
            type="button"
            onClick={register}
            className="w-full rounded-md bg-primary py-4 font-bold text-slate-950"
          >
            Đăng ký
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

function AuthShell({ children }) {
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

function Field({ icon: Icon, trailing: Trailing, label, ...props }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          {...props}
          className="w-full rounded-md border border-border-soft bg-surface py-3 pl-10 pr-10 text-content outline-none focus:border-primary"
        />
        {Trailing && (
          <Trailing className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        )}
      </div>
    </label>
  )
}
