import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Circle,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  KeyRound,
  Loader2,
  ShieldCheck,
  WalletCards,
  Wifi,
} from 'lucide-react'
import payosLoginScreenshot from '@/assets/payos-login.png'
import payosVerifyScreenshot from '@/assets/payos-verify.png'
import payosBankScreenshot from '@/assets/payos-bank.png'
import payosChannelListScreenshot from '@/assets/payos-channel-list.png'
import payosCreateChannelScreenshot from '@/assets/payos-create-channel.png'
import payosKeysScreenshot from '@/assets/payos-keys.png'
import { http as api } from '@/services/http.js'

const STEP_TITLES = [
  'Chọn PayOS',
  'Thông tin ngân hàng',
  'Kết nối PayOS',
  'Kiểm tra kết nối',
  'Hoàn thành',
]

const BANK_OPTIONS = ['MB Bank', 'Vietcombank', 'BIDV', 'VietinBank', 'Techcombank', 'ACB', 'TPBank']

const PAYOS_GUIDE_STEPS = [
  {
    title: 'Đăng nhập payOS',
    detail: 'Bấm nút Mở PayOS, đăng nhập bằng email và mật khẩu tài khoản payOS của bạn.',
    image: payosLoginScreenshot,
  },
  {
    title: 'Xác thực tổ chức',
    detail: 'Trong menu bên trái, chọn Xác thực tổ chức và hoàn tất thông tin theo loại tài khoản phù hợp.',
    image: payosVerifyScreenshot,
  },
  {
    title: 'Liên kết tài khoản ngân hàng',
    detail: 'Vào mục Ngân hàng, bấm Thêm tài khoản và liên kết tài khoản nhận tiền bán vé.',
    image: payosBankScreenshot,
  },
  {
    title: 'Tạo kênh thanh toán',
    detail: 'Vào Kênh thanh toán, bấm Tạo kênh thanh toán.',
    image: payosChannelListScreenshot,
  },
  {
    title: 'Nhập thông tin kênh',
    detail: 'Chọn Website, nhập tên kênh ví dụ EventHub, thêm logo nếu có, chọn ngân hàng chính nhận tiền rồi bấm Tạo kênh thanh toán và tích hợp.',
    image: payosCreateChannelScreenshot,
  },
  {
    title: 'Lấy 3 key',
    detail: 'Sau khi tạo kênh thành công, copy Client ID, API Key và Checksum Key rồi dán vào form bên phải đúng thứ tự.',
    image: payosKeysScreenshot,
  },
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
  const [guideImageIndex, setGuideImageIndex] = useState(0)

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
        setFormData({ client_id: incoming.client_id || '', api_key: '', checksum_key: '' })
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
    formData.api_key.trim() ||
    formData.checksum_key.trim() ||
    formData.client_id.trim() !== (channel?.client_id || '')

  const canAdvanceFromStep3 =
    Boolean(formData.client_id.trim()) &&
    ((hasStoredCredentials && !hasNewCredentialInput) || Boolean(formData.api_key.trim() && formData.checksum_key.trim()))

  const safeChannelMeta = useMemo(
    () => ({
      merchantId: channel?.client_id ? maskValue(channel.client_id, 6) : 'PAYOS_••••••',
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
          throw new Error('Vui lòng cung cấp Client ID, API Key và Checksum Key.')
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
      setChannel(res.data?.data)
      setIsEditing(false)
      setTestState({ status: 'success', message: 'Kênh thanh toán đã được kết nối thành công.' })
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

  const handleEditSettings = () => {
    setError(null)
    setTestState({ status: 'idle', message: '' })
    setProgressIndex(0)
    setConnectionTouched(false)
    setFormData({ client_id: channel?.client_id || '', api_key: '', checksum_key: '' })
    setStep(1)
    setIsEditing(true)
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
    'Đang xác thực thông tin PayOS...',
    'Đang kiểm tra kênh thanh toán...',
    'Đang xác nhận cấu hình ngân hàng...',
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-content">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-primary">Payment Setup</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-content">Cài đặt thanh toán</h1>
        <p className="mt-2 max-w-3xl text-lg text-subtle">
          Kết nối PayOS một lần để nhận tiền bán vé trực tiếp vào tài khoản ngân hàng của ban tổ chức.
        </p>
      </div>

      <div className="rounded-2xl border border-border-soft/30 bg-surface/80 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
        {!showSavedSettings && <StepNav step={step} />}

        {!showSavedSettings && error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-content">Chọn PayOS</h2>
              <p className="mt-2 max-w-2xl text-sm text-subtle">
                EventHub dùng PayOS để tạo mã QR, ghi nhận thanh toán tự động và xuất vé sau khi khách hàng thanh toán.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-2xl border border-tertiary/30 bg-tertiary/10 p-6 text-left transition hover:border-tertiary/60 hover:bg-tertiary/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="grid size-11 place-items-center rounded-xl border border-tertiary/35 bg-tertiary/15 text-primary">
                    <Wifi className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-content">PayOS</h3>
                    <p className="text-sm text-subtle">Khuyến dùng cho bán vé sự kiện tại Việt Nam</p>
                  </div>
                </div>
                {isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/35 bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-3.5" />
                    Đang hoạt động
                  </span>
                )}
              </div>

              <ul className="mt-5 grid gap-2 text-sm text-content sm:grid-cols-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Thanh toán qua mã QR</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Chuyển khoản ngân hàng</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Ghi nhận thanh toán tự động</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Xuất vé sau khi thanh toán</li>
              </ul>
            </button>

            <WizardFooter onNext={() => setStep(2)} nextLabel="Tiếp tục" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-content">Thông tin ngân hàng</h2>
              <p className="mt-2 text-sm text-subtle">
                Nhập tài khoản ngân hàng chính sẽ nhận doanh thu bán vé từ kênh thanh toán PayOS.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="bank" className="mb-1.5 block text-sm font-semibold text-content">Ngân hàng</label>
                <select
                  id="bank"
                  value={bankInfo.bank}
                  onChange={(e) => setBankInfo((prev) => ({ ...prev, bank: e.target.value }))}
                  className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm text-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="" className="bg-surface text-content">Chọn ngân hàng</option>
                  {BANK_OPTIONS.map((bank) => (
                    <option key={bank} value={bank} className="bg-surface text-content">{bank}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="account-number" className="mb-1.5 block text-sm font-semibold text-content">Số tài khoản</label>
                <input
                  id="account-number"
                  value={bankInfo.accountNumber}
                  onChange={(e) => setBankInfo((prev) => ({ ...prev, accountNumber: e.target.value }))}
                  className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm text-content outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="Nhập số tài khoản"
                />
              </div>
              <div>
                <label htmlFor="account-holder" className="mb-1.5 block text-sm font-semibold text-content">Tên chủ tài khoản</label>
                <input
                  id="account-holder"
                  value={bankInfo.accountHolder}
                  onChange={(e) => setBankInfo((prev) => ({ ...prev, accountHolder: e.target.value }))}
                  className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 text-sm text-content outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="Nhập tên chủ tài khoản"
                />
              </div>
            </div>

            <div className="rounded-xl border border-tertiary/20 bg-tertiary/10 p-4 text-sm text-subtle">
              Tên chủ tài khoản nên trùng với thông tin đã xác thực trên payOS để việc đối soát diễn ra thuận lợi.
            </div>

            <WizardFooter
              onBack={() => setStep(1)}
              onNext={() => {
                const message = validateStep2()
                if (message) {
                  setError(message)
                  return
                }
                setError(null)
                setStep(3)
              }}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-content">Kết nối PayOS</h2>
              <p className="mt-2 text-sm text-subtle">
                Làm theo checklist bên trái để tạo kênh thanh toán trên payOS, sau đó copy 3 key và dán vào form bên phải.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <section className="space-y-4 rounded-2xl border border-border-soft/30 bg-panel-soft/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-content">Checklist tạo 3 key</h3>
                    <p className="text-sm text-subtle">Chọn từng bước để xem ảnh hướng dẫn ngay bên dưới bước đó.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open('https://my.payos.vn', '_blank', 'noopener,noreferrer')}
                    className="org-btn-primary"
                  >
                    Mở PayOS
                    <ExternalLink className="size-4" />
                  </button>
                </div>

                <ol className="space-y-2">
                  {PAYOS_GUIDE_STEPS.map((item, index) => {
                    const isSelected = guideImageIndex === index
                    return (
                      <li key={item.title}>
                        <button
                          type="button"
                          onClick={() => setGuideImageIndex(index)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? 'border-tertiary bg-tertiary/10'
                              : 'border-border-soft/25 bg-surface/40 hover:border-tertiary/40'
                          }`}
                        >
                          <span className="flex gap-3">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tertiary text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-content">{item.title}</span>
                              <span className="mt-1 block text-sm leading-6 text-subtle">{item.detail}</span>
                              {isSelected && (
                                <span className="mt-3 block overflow-hidden rounded-lg border border-border-soft/30 bg-surface">
                                  <img src={item.image} alt={item.title} className="w-full object-contain" />
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section className="space-y-4 rounded-2xl border border-border-soft/30 bg-surface p-5">
                <div>
                  <h3 className="text-base font-bold text-content">Nhập 3 key từ payOS</h3>
                  <p className="mt-1 text-sm text-subtle">Dán đúng thứ tự như payOS hiển thị: Client ID, API Key, Checksum Key.</p>
                </div>

                <CredentialField
                  id="client-id"
                  label="Client ID"
                  icon={Copy}
                  value={formData.client_id}
                  placeholder={hasStoredCredentials ? `Hiện tại: ${safeChannelMeta.merchantId}` : 'Dán Client ID'}
                  onChange={(value) => {
                    setConnectionTouched(true)
                    setFormData((prev) => ({ ...prev, client_id: value }))
                  }}
                />
                <CredentialField
                  id="api-key"
                  label="API Key"
                  icon={KeyRound}
                  type="password"
                  value={formData.api_key}
                  placeholder={hasStoredCredentials ? `Hiện tại: ${safeChannelMeta.connectionKey}` : 'Dán API Key'}
                  onChange={(value) => {
                    setConnectionTouched(true)
                    setFormData((prev) => ({ ...prev, api_key: value }))
                  }}
                />
                <CredentialField
                  id="checksum-key"
                  label="Checksum Key"
                  icon={ShieldCheck}
                  type="password"
                  value={formData.checksum_key}
                  placeholder={hasStoredCredentials ? `Hiện tại: ${safeChannelMeta.verificationKey}` : 'Dán Checksum Key'}
                  onChange={(value) => {
                    setConnectionTouched(true)
                    setFormData((prev) => ({ ...prev, checksum_key: value }))
                  }}
                />

                <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  Không chia sẻ 3 key này cho người khác. EventHub chỉ dùng key để tạo và xác minh thanh toán cho sự kiện của bạn.
                </div>

                <button
                  type="button"
                  onClick={runConnectionTest}
                  disabled={testing || !canAdvanceFromStep3}
                  className="org-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Verify
                </button>

                {connectionTouched && !canAdvanceFromStep3 && (
                  <p className="text-xs font-semibold text-warning">
                    Vui lòng điền đủ Client ID, API Key và Checksum Key trước khi kiểm tra kết nối.
                  </p>
                )}
              </section>
            </div>

            <WizardFooter onBack={() => setStep(2)} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-content">Kiểm tra kết nối</h2>

            {testState.status === 'loading' && (
              <div className="rounded-2xl border border-border-soft/30 bg-panel-soft p-5">
                <div className="mb-4 flex items-center gap-2 font-bold text-content">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <p>Đang thử nghiệm kết nối...</p>
                </div>
                <ul className="space-y-2 text-sm text-subtle">
                  {checks.map((text, index) => (
                    <li key={text} className="flex items-center gap-2">
                      {progressIndex >= index ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted opacity-60" />}
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {testState.status === 'success' && (
              <div className="space-y-4 rounded-2xl border border-success/30 bg-success/10 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <CheckCircle2 className="size-5" />
                  Kênh thanh toán đã được kết nối thành công
                </p>
                <div className="grid gap-2 text-sm text-content">
                  <p><span className="font-semibold text-muted">Ngân hàng:</span> {bankInfo.bank || 'Chưa có dữ liệu'}</p>
                  <p><span className="font-semibold text-muted">Số tài khoản:</span> {bankInfo.accountNumber ? `****${bankInfo.accountNumber.slice(-4)}` : 'Chưa có dữ liệu'}</p>
                  <p><span className="font-semibold text-muted">Trạng thái:</span> Đang hoạt động</p>
                </div>
                <button type="button" onClick={() => setStep(5)} className="rounded-xl bg-success px-5 py-2.5 text-sm font-semibold text-slate-950 hover:opacity-90">
                  Lưu và hoàn tất
                </button>
              </div>
            )}

            {testState.status === 'error' && (
              <div className="space-y-4 rounded-2xl border border-error/30 bg-error/10 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-error">
                  <AlertCircle className="size-5" />
                  Không thể kết nối
                </p>
                <p className="text-sm text-error">{testState.message}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setStep(3)
                  }}
                  className="rounded-xl border border-error/35 bg-surface px-4 py-2 text-sm font-medium text-error hover:bg-error/10"
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
              <h2 className="text-2xl font-bold text-content">Hoàn thành</h2>
              <p className="mt-2 text-sm text-subtle">Kênh thanh toán của bạn đã sẵn sàng để nhận tiền bán vé.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryCard icon={CreditCard} title="Bán vé trả phí" text="Có thể xuất bản sự kiện có bán vé." />
              <SummaryCard icon={Banknote} title="Nhận doanh thu" text="Tiền được chuyển về ngân hàng đã cấu hình." />
              <SummaryCard icon={WalletCards} title="Theo dõi giao dịch" text="Giao dịch được ghi nhận trong hệ thống." />
            </div>

            <div className="rounded-xl border border-border-soft/30 bg-panel-soft p-4 text-sm text-content">
              <p className="mb-2 font-bold text-primary">Kết nối đã lưu</p>
              <p><span className="font-medium text-muted">Ngân hàng:</span> {bankInfo.bank || 'Chưa lưu trên thiết bị này'}</p>
              <p><span className="font-medium text-muted">Số tài khoản:</span> {bankInfo.accountNumber ? `****${bankInfo.accountNumber.slice(-4)}` : 'Chưa lưu trên thiết bị này'}</p>
              <p><span className="font-medium text-muted">Chủ tài khoản:</span> {bankInfo.accountHolder || 'Chưa lưu trên thiết bị này'}</p>
              <div className="my-3 border-t border-border-soft/20" />
              <p><span className="font-medium text-muted">Client ID:</span> {safeChannelMeta.merchantId}</p>
              <p><span className="font-medium text-muted">API Key:</span> {safeChannelMeta.connectionKey}</p>
              <p><span className="font-medium text-muted">Checksum Key:</span> {safeChannelMeta.verificationKey}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {showSavedSettings && (
                <button type="button" onClick={handleEditSettings} className="org-btn-primary">
                  <CreditCard className="size-4" />
                  Cập nhật cài đặt
                </button>
              )}
              <button type="button" onClick={() => navigate('/organizer/events')} className="org-btn-secondary">
                Đi tới Quản lý sự kiện
              </button>
              <button type="button" onClick={() => navigate('/organizer/events/create')} className="org-btn-primary">
                <CreditCard className="size-4" />
                Tạo sự kiện
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepNav({ step }) {
  return (
    <div className="mb-6 grid gap-2 sm:grid-cols-5">
      {STEP_TITLES.map((title, index) => {
        const itemStep = index + 1
        const active = itemStep === step
        const completed = itemStep < step
        let stepClass = 'border-border-soft/20 bg-panel-soft text-muted'
        if (active) stepClass = 'border-primary bg-tertiary/10 text-primary'
        else if (completed) stepClass = 'border-tertiary/30 bg-tertiary/10 text-primary opacity-80'
        return (
          <div key={title} className={`rounded-xl border px-3 py-3 text-xs ${stepClass}`}>
            <p className="font-semibold">Step {itemStep}</p>
            <p className="mt-0.5 leading-5">{title}</p>
          </div>
        )
      })}
    </div>
  )
}

function WizardFooter({ onBack, onNext, nextLabel = 'Tiếp tục' }) {
  return (
    <div className="flex items-center justify-between border-t border-border-soft/20 pt-5">
      {onBack ? <button type="button" onClick={onBack} className="org-btn-secondary">Quay lại</button> : <span />}
      {onNext && (
        <button type="button" onClick={onNext} className="org-btn-primary">
          {nextLabel}
          <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  )
}

function CredentialField({ id, label, value, onChange, placeholder, type = 'text', icon: Icon }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-content">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 pr-20 text-sm text-content outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          placeholder={placeholder}
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2 text-muted">
          <Icon className="size-4" />
          {type === 'password' && <Eye className="size-4" />}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-xl border border-tertiary/20 bg-tertiary/10 p-4">
      <Icon className="mb-3 size-5 text-primary" />
      <p className="font-semibold text-content">{title}</p>
      <p className="mt-1 text-sm text-subtle">{text}</p>
    </div>
  )
}
