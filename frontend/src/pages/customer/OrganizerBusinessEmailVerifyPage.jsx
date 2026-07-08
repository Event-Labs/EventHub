import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyOrganizerBusinessEmail } from '@/services/organizerRequests.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function OrganizerBusinessEmailVerifyPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState('verifying')
  const [error, setError] = useState('')
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
        await verifyOrganizerBusinessEmail(token)
        setStatus('success')
        toast.success('Email tổ chức đã được xác thực.')
      } catch (err) {
        const message = getApiMessage(err, 'Xác thực email tổ chức thất bại.')
        setStatus('error')
        setError(message)
        toast.error(message)
      }
    }

    verify()
  }, [token, toast])

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <div className="glass-panel rounded-lg p-8">
        {status === 'verifying' && (
          <>
            <Loader2 className="mx-auto size-14 animate-spin text-primary" />
            <h1 className="mt-5 font-display text-2xl font-extrabold text-content">
              Đang xác thực email tổ chức
            </h1>
            <p className="mt-2 text-muted">Vui lòng đợi trong giây lát.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="mx-auto size-14 text-success" />
            <h1 className="mt-5 font-display text-2xl font-extrabold text-content">
              Email tổ chức đã được xác thực
            </h1>
            <p className="mt-2 text-muted">
              Admin hiện có thể xét duyệt yêu cầu Organizer của bạn.
            </p>
            <Link
              to="/organizer-request"
              className="mt-6 inline-flex rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400"
            >
              Về trang đăng ký Organizer
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto size-14 text-error" />
            <h1 className="mt-5 font-display text-2xl font-extrabold text-content">
              Xác thực thất bại
            </h1>
            <p className="mt-2 text-muted">{error}</p>
            <Link
              to="/organizer-request"
              className="mt-6 inline-flex rounded-md border border-border-soft px-5 py-3 text-sm font-bold text-content transition hover:border-primary"
            >
              Về trang đăng ký Organizer
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
