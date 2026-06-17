import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  CreditCard,
  Loader2,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { http as api } from '@/services/http.js'

const STEP_TITLES = [
  'Phương thức nhận tiền',
  'Tài khoản nhận tiền',
  'Kết nối PayOS',
  'Kiểm tra kết nối',
  'Hoàn thành',
]

const BANK_OPTIONS = [
  'MB Bank',
  'Vietcombank',
  'BIDV',
  'VietinBank',
  'Techcombank',
  'ACB',
  'TPBank',
]

const STORAGE_KEY = 'eventhub_payment_bank_info'

function maskValue(value, visiblePrefix = 5) {
  if (!value) return '••••••••••'
  if (value.length <= visiblePrefix) return `${value}••••`
  return `${value.slice(0, visiblePrefix)}${'•'.repeat(6)}`
}

function loadStoredBankInfo() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.error(err)
    return null
  }
}

export function OrganizerPaymentSettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [channel, setChannel] = useState(null)
  const [step, setStep] = useState(1)
  const [isEditing, setIsEditing] = useState(false)
  const [testState, setTestState] = useState({ status: 'idle', message: '' })
  const [progressIndex, setProgressIndex] = useState(0)

  const [bankInfo, setBankInfo] = useState(() => {
    const stored = loadStoredBankInfo()
    return {
      bank: stored?.bank || '',
      accountNumber: stored?.accountNumber || '',
      accountHolder: stored?.accountHolder || '',
    }
  })

  const [formData, setFormData] = useState({
    client_id: '',
    api_key: '',
    checksum_key: '',
  })
  const [error, setError] = useState(location.state?.error || null)
  const [connectionTouched, setConnectionTouched] = useState(false)

  useEffect(() => {
    fetchChannel()
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bankInfo))
  }, [bankInfo])

  useEffect(() => {
    if (step !== 4 || testState.status !== 'loading') return
    const timer = setInterval(() => {
      setProgressIndex((prev) => (prev < 3 ? prev + 1 : prev))
    }, 900)
    return () => clearInterval(timer)
  }, [step, testState.status])

  const fetchChannel = async () => {
    try {
      setLoading(true)
      const res = await api.get('/organizer/payments/channel')
      const incoming = res.data?.data
      if (incoming) {
        setChannel(incoming)
        setFormData({
          client_id: incoming.client_id || '',
          api_key: '',
          checksum_key: '',
        })
        setBankInfo({
          bank: incoming.bank_name || '',
          accountNumber: incoming.bank_account_number || '',
          accountHolder: incoming.bank_account_holder || '',
        })
        if (incoming.status === 'ACTIVE') {
          setStep(5)
          setIsEditing(false)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const validateStep2 = () => {
    if (!bankInfo.bank) return 'Vui lòng chọn ngân hàng.'
    if (!bankInfo.accountNumber.trim()) return 'Vui lòng nhập số tài khoản.'
    if (!bankInfo.accountHolder.trim()) return 'Vui lòng nhập tên chủ tài khoản.'
    return ''
  }

  const hasStoredCredentials = Boolean(channel?.client_id)
  const hasNewCredentialInput =
    formData.api_key.trim() || formData.checksum_key.trim() || formData.client_id.trim() !== (channel?.client_id || '')

  const canAdvanceFromStep3 =
    Boolean(formData.client_id.trim()) &&
    ((hasStoredCredentials && !hasNewCredentialInput) ||
      Boolean(formData.api_key.trim() && formData.checksum_key.trim()))

  const safeChannelMeta = useMemo(
    () => ({
      merchantId: channel?.client_id ? maskValue(channel.client_id, 6) : 'PAYOS_****123',
      connectionKey: '••••••••••••',
      verificationKey: '••••••••••••',
    }),
    [channel],
  )

  const runConnectionTest = async () => {
    setError(null)
    setTesting(true)
    setStep(4)
    setProgressIndex(0)
    setTestState({ status: 'loading', message: '' })
    try {
      if (!hasStoredCredentials || hasNewCredentialInput) {
        if (!formData.client_id.trim() || !formData.api_key.trim() || !formData.checksum_key.trim()) {
          throw new Error('Vui lòng cung cấp Client ID (Merchant ID), API Key (Connection Key) và Checksum Key (Verification Key).')
        }
      }

      const payload = {
        client_id: formData.client_id.trim(),
        bank_name: bankInfo.bank.trim(),
        bank_account_number: bankInfo.accountNumber.trim(),
        bank_account_holder: bankInfo.accountHolder.trim(),
      }

      if (!hasStoredCredentials || hasNewCredentialInput) {
        payload.api_key = formData.api_key.trim()
        payload.checksum_key = formData.checksum_key.trim()
      }

      await api.post('/organizer/payments/channel', payload)

      const res = await api.post('/organizer/payments/channel/test')
      const updatedChannel = res.data?.data
      setChannel(updatedChannel)
      setIsEditing(false)
      setTestState({ status: 'success', message: 'Kênh thanh toán đã được kết nối thành công' })
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        'Không thể kết nối. Vui lòng kiểm tra lại Client ID, API Key và Checksum Key.'
      setTestState({ status: 'error', message })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  const isActive = channel?.status === 'ACTIVE'
  const showSavedSettings = isActive && !isEditing
  const checks = [
    'Đang xác thực thông tin...',
    'Đang kiểm tra kênh thanh toán...',
    'Đang xác nhận cấu hình ngân hàng...',
  ]

  const handleEditSettings = () => {
    setError(null)
    setTestState({ status: 'idle', message: '' })
    setProgressIndex(0)
    setConnectionTouched(false)
    setFormData({
      client_id: channel?.client_id || '',
      api_key: '',
      checksum_key: '',
    })
    setStep(1)
    setIsEditing(true)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-extrabold text-[#191c1e] tracking-tight">Cài đặt thanh toán</h1>
        <p className="mt-2 text-[#434655] text-lg">
          Kết nối tài khoản nhận tiền một lần và sử dụng cho tất cả các sự kiện.
        </p>
      </div>

      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        {!showSavedSettings && (
        <div className="mb-6 grid grid-cols-5 gap-2">
          {STEP_TITLES.map((title, index) => {
            const itemStep = index + 1
            const active = itemStep === step
            const completed = itemStep < step
            let stepClass = 'border-[#e5e7eb] bg-white text-[#6b7280]'
            if (active) {
              stepClass = 'border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]'
            } else if (completed) {
              stepClass = 'border-[#bfdbfe] bg-[#f8fbff] text-[#1e40af]'
            }
            return (
              <div
                key={title}
                className={`rounded-xl border px-3 py-3 text-xs ${stepClass}`}
              >
                <p className="font-semibold">Bước {itemStep}</p>
                <p className="mt-0.5">{title}</p>
              </div>
            )
          })}
        </div>
        )}

        {!showSavedSettings && error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#111827]">Nhận doanh thu bán vé</h2>
              <p className="mt-2 max-w-2xl text-sm text-[#4b5563]">
                Kết nối kênh thanh toán để khách hàng có thể mua vé và doanh thu được chuyển trực tiếp vào tài khoản của ban tổ chức.
              </p>
            </div>

            <div className="rounded-2xl border border-[#dbeafe] bg-[#f8fbff] p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-[#dbeafe] text-[#1d4ed8]">
                    <Wifi className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#111827]">PayOS</h3>
                    <p className="text-sm text-[#4b5563]">Khuyên dùng cho việc bán vé</p>
                  </div>
                </div>
                {isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3.5" />
                    ĐANG HOẠT ĐỘNG
                  </span>
                )}
              </div>

              <ul className="mt-5 grid gap-2 text-sm text-[#374151]">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Thanh toán qua mã QR</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Chuyển khoản ngân hàng</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Thông báo thanh toán theo thời gian thực</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Xuất vé tự động</li>
              </ul>
            </div>

            <div className="flex items-center justify-between border-t pt-5">
              <div>
                <p className="text-sm text-[#6b7280]">
                  Bạn chỉ cần cấu hình một lần và có thể sử dụng cho tất cả các sự kiện.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                Tiếp tục
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#111827]">Doanh thu bán vé sẽ được chuyển về đâu?</h2>
              <p className="mt-2 text-sm text-[#4b5563]">
                Vui lòng nhập thông tin tài khoản ngân hàng mà bạn muốn dùng để nhận tiền bán vé.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="bank" className="mb-1.5 block text-sm font-semibold text-[#111827]">Ngân hàng</label>
                <select
                  id="bank"
                  value={bankInfo.bank}
                  onChange={(e) => setBankInfo((prev) => ({ ...prev, bank: e.target.value }))}
                  className="w-full rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                >
                  <option value="">Chọn ngân hàng</option>
                  {BANK_OPTIONS.map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="account-number" className="mb-1.5 block text-sm font-semibold text-[#111827]">Số tài khoản</label>
                <input
                  id="account-number"
                  value={bankInfo.accountNumber}
                  onChange={(e) => setBankInfo((prev) => ({ ...prev, accountNumber: e.target.value }))}
                  className="w-full rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                  placeholder="Nhập số tài khoản"
                />
              </div>
              <div>
                <label htmlFor="account-holder" className="mb-1.5 block text-sm font-semibold text-[#111827]">Tên chủ tài khoản</label>
                <input
                  id="account-holder"
                  value={bankInfo.accountHolder}
                  onChange={(e) => setBankInfo((prev) => ({ ...prev, accountHolder: e.target.value }))}
                  className="w-full rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                  placeholder="Nhập tên chủ tài khoản"
                />
              </div>
            </div>

            <p className="text-sm text-[#6b7280]">
              Thông tin này chỉ được sử dụng để xác định tài khoản nhận tiền của bạn.
            </p>

            <div className="flex items-center justify-between border-t pt-5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl border border-[#d1d5db] px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => {
                  const message = validateStep2()
                  if (message) {
                    setError(message)
                    return
                  }
                  setError(null)
                  setStep(3)
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                Tiếp tục
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#111827]">Kết nối tài khoản PayOS của bạn</h2>
              <p className="mt-2 text-sm text-[#4b5563]">
                Để nhận thanh toán an toàn trực tiếp từ khách hàng, hãy kết nối với tài khoản PayOS của bạn.
              </p>
            </div>

            <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm text-[#1e3a8a]">
              <p className="font-semibold">Đừng lo - thao tác này chỉ cần thực hiện một lần duy nhất.</p>
              <p className="mt-1">Nếu bạn đã có tài khoản người bán PayOS: Hãy tiếp tục bên dưới.</p>
              <p>Nếu bạn chưa có: Vui lòng tạo tài khoản PayOS trước rồi quay lại đây.</p>
            </div>

            <button
              type="button"
              onClick={() => window.open('https://my.payos.vn', '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-medium hover:bg-[#f8fafc]"
            >
              Mở Trang quản trị PayOS
            </button>

            <div className="relative py-2 text-center text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
              <span className="bg-white px-2">HOẶC</span>
              <div className="absolute left-0 right-0 top-1/2 -z-10 h-px -translate-y-1/2 bg-[#e5e7eb]" />
            </div>

            <div className="space-y-4 rounded-2xl border border-[#e5e7eb] p-5">
              <h3 className="text-base font-semibold text-[#111827]">Kết nối Thanh toán</h3>

              <div>
                <label htmlFor="merchant-id" className="mb-1.5 block text-sm font-semibold text-[#111827]">Client ID</label>
                <input
                  id="merchant-id"
                  type="text"
                  value={formData.client_id}
                  onChange={(e) => {
                    setConnectionTouched(true)
                    setFormData((prev) => ({ ...prev, client_id: e.target.value }))
                  }}
                  className="w-full rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                  placeholder={hasStoredCredentials ? `Hiện tại: ${safeChannelMeta.merchantId}` : 'Nhập Client ID'}
                />
                <p className="mt-1 text-xs text-[#6b7280]">Định danh người bán PayOS của bạn.</p>
              </div>

              <div>
                <label htmlFor="connection-key" className="mb-1.5 block text-sm font-semibold text-[#111827]">API Key</label>
                <input
                  id="connection-key"
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => {
                    setConnectionTouched(true)
                    setFormData((prev) => ({ ...prev, api_key: e.target.value }))
                  }}
                  className="w-full rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                  placeholder={hasStoredCredentials ? `Hiện tại: ${safeChannelMeta.connectionKey}` : 'Nhập API Key'}
                />
                <p className="mt-1 text-xs text-[#6b7280]">Được sử dụng để tạo link thanh toán.</p>
              </div>

              <div>
                <label htmlFor="verification-key" className="mb-1.5 block text-sm font-semibold text-[#111827]">Checksum Key</label>
                <input
                  id="verification-key"
                  type="password"
                  value={formData.checksum_key}
                  onChange={(e) => {
                    setConnectionTouched(true)
                    setFormData((prev) => ({ ...prev, checksum_key: e.target.value }))
                  }}
                  className="w-full rounded-xl border border-[#d1d5db] px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe]"
                  placeholder={hasStoredCredentials ? `Hiện tại: ${safeChannelMeta.verificationKey}` : 'Nhập Checksum Key'}
                />
                <p className="mt-1 text-xs text-[#6b7280]">Được sử dụng để xác minh kết quả thanh toán một cách an toàn.</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-5">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl border border-[#d1d5db] px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={runConnectionTest}
                disabled={testing || !canAdvanceFromStep3}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Kiểm tra kết nối
              </button>
            </div>
            {connectionTouched && !canAdvanceFromStep3 && (
              <p className="text-xs text-amber-700">
                Vui lòng điền đầy đủ các thông tin xác thực trước khi kiểm tra kết nối.
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-[#111827]">Đang kiểm tra kết nối</h2>

            {testState.status === 'loading' && (
              <div className="rounded-2xl border border-[#e5e7eb] p-5">
                <div className="mb-4 flex items-center gap-2 text-[#1f2937]">
                  <Loader2 className="size-4 animate-spin text-[#2563eb]" />
                  <p className="font-medium">Đang thử nghiệm kết nối...</p>
                </div>
                <ul className="space-y-2 text-sm text-[#4b5563]">
                  {checks.map((text, index) => (
                    <li key={text} className="flex items-center gap-2">
                      {progressIndex >= index ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <Circle className="size-4 text-[#9ca3af]" />
                      )}
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {testState.status === 'success' && (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="size-5" />
                  Kênh thanh toán đã được kết nối thành công
                </p>
                <div className="grid gap-2 text-sm text-emerald-900">
                  <p><span className="font-semibold">Ngân hàng:</span> {bankInfo.bank || 'MB Bank'}</p>
                  <p><span className="font-semibold">Số tài khoản:</span> ****{bankInfo.accountNumber.slice(-4) || '1234'}</p>
                  <p><span className="font-semibold">Trạng thái:</span> ĐANG HOẠT ĐỘNG</p>
                </div>
                <p className="text-sm text-emerald-800">
                  Tổ chức của bạn bây giờ có thể nhận trực tiếp các khoản thanh toán tiền vé.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Lưu & Hoàn tất
                </button>
              </div>
            )}

            {testState.status === 'error' && (
              <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
                  <AlertCircle className="size-5" />
                  Không thể kết nối
                </p>
                <p className="text-sm text-red-700">{testState.message}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                  <li>Client ID</li>
                  <li>API Key</li>
                  <li>Checksum Key</li>
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setStep(3)
                  }}
                  className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Thử lại
                </button>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#111827]">Cài đặt thanh toán đã hoàn tất</h2>
              <p className="mt-2 text-sm text-[#4b5563]">Kênh thanh toán của bạn đang hoạt động.</p>
            </div>

            <div className="rounded-2xl border border-[#dbeafe] bg-[#f8fbff] p-5">
              <p className="mb-3 font-semibold text-[#1e3a8a]">Bây giờ bạn có thể:</p>
              <ul className="space-y-2 text-sm text-[#1f2937]">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Xuất bản các sự kiện có trả phí</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Nhận trực tiếp doanh thu tiền vé</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /> Theo dõi các giao dịch thanh toán</li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#e5e7eb] p-4 text-sm">
              <p className="mb-2 font-semibold text-[#111827]">Kết nối đã lưu</p>
              <p className="text-[#374151]">Ngân hàng: {bankInfo.bank || 'Chưa lưu trên thiết bị này'}</p>
              <p className="text-[#374151]">
                Số tài khoản: {bankInfo.accountNumber ? `****${bankInfo.accountNumber.slice(-4)}` : 'Chưa lưu trên thiết bị này'}
              </p>
              <p className="text-[#374151]">Chủ tài khoản: {bankInfo.accountHolder || 'Chưa lưu trên thiết bị này'}</p>
              <div className="my-3 border-t border-[#e5e7eb]" />
              <p className="text-[#374151]">Client ID: {safeChannelMeta.merchantId}</p>
              <p className="text-[#374151]">API Key: {safeChannelMeta.connectionKey}</p>
              <p className="text-[#374151]">Checksum Key: {safeChannelMeta.verificationKey}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {showSavedSettings && (
                <button
                  type="button"
                  onClick={handleEditSettings}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
                >
                  <CreditCard className="size-4" />
                  Cập nhật cài đặt
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/organizer/events')}
                className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-[#f9fafb]"
              >
                Đi tới Quản lý Sự kiện
              </button>
              <button
                type="button"
                onClick={() => navigate('/organizer/events/create')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                <CreditCard className="size-4" />
                Tạo Sự kiện
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
