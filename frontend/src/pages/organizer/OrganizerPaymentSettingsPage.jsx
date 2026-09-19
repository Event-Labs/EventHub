import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Circle,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  HelpCircle,
  Info,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'
import { OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
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

const PAYOS_PAYOUT_GUIDE_STEPS = [
  {
    stepNumber: 1,
    title: 'Kích hoạt dịch vụ Kênh chi (Payouts)',
    detail: 'Đăng nhập my.payos.vn bằng tài khoản của Ban tổ chức. Vào menu Thiết lập > chọn Hồ sơ, tìm mục Thay đổi dịch vụ, tick chọn Kênh chi (Payouts) và bấm Hoàn tất.',
    actionLabel: 'Mở trang my.payos.vn',
    actionUrl: 'https://my.payos.vn',
    note: 'Tài khoản payOS cần hoàn tất xác thực danh tính tổ chức/doanh nghiệp để được duyệt dịch vụ Chi hộ.',
    badge: 'Bước quan trọng nhất',
  },
  {
    stepNumber: 2,
    title: 'Liên kết & nạp số dư Ví Bảo Kim',
    detail: 'payOS sử dụng ví điện tử Bảo Kim (Baokim) làm quỹ đảm bảo cho lệnh chi tiền. Hoàn tất liên kết ví Bảo Kim (thông tin định danh trùng khớp với payOS) và nạp tiền ký quỹ để làm nguồn chi hoàn vé.',
    actionLabel: 'Tìm hiểu Ví Bảo Kim',
    actionUrl: 'https://baokim.vn',
    note: 'Số tiền hoàn trả sẽ được trừ trực tiếp từ số dư khả dụng của ví Bảo Kim này.',
    badge: 'Nguồn tiền chi trả',
  },
  {
    stepNumber: 3,
    title: 'Cấu hình Kênh chi & Thêm IP Whitelist',
    detail: 'Trong mục Kênh chi trên PayOS, thiết lập hạn mức chi. Sau đó nhập địa chỉ IP tĩnh (Public IP) của máy chủ backend EventHub vào danh sách IP Whitelist theo chuẩn an toàn bắt buộc của payOS.',
    note: 'payOS sẽ từ chối lệnh chi tiền nếu địa chỉ IP của server gọi API không nằm trong danh sách IP Whitelist.',
    badge: 'Bảo mật IP Server',
  },
  {
    stepNumber: 4,
    title: 'Lấy bộ 3 Key Kênh chi & Dán vào form',
    detail: 'Sau khi kênh chi kích hoạt thành công, copy Client ID, API Key và Checksum Key của Kênh chi và dán vào form bên cạnh, sau đó nhấn "Kiểm tra kết nối Kênh chi".',
    note: 'Nếu kích hoạt Kênh chi trên cùng ứng dụng/kênh hiện tại, bạn có thể chọn "Dùng chung bộ khóa với Kênh thu".',
    badge: 'Kết nối API',
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
  const toast = useToast()
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

  // Active tab: 'inbound' | 'payout'
  const [activeTab, setActiveTab] = useState(() => location.state?.tab || 'inbound')

  // Payout Channel State
  const [payoutMode, setPayoutMode] = useState('same') // 'same' | 'custom'
  const [payoutFormData, setPayoutFormData] = useState({
    client_id: '',
    api_key: '',
    checksum_key: '',
  })
  const [payoutTesting, setPayoutTesting] = useState(false)
  const [payoutTestState, setPayoutTestState] = useState({ status: 'idle', message: '', balance: null })
  const [payoutGuideIndex, setPayoutGuideIndex] = useState(0)
  const [serverIp, setServerIp] = useState('171.231.199.214')

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
  const returnTo = location.state?.returnTo

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

        if (incoming.server_ip) {
          setServerIp(incoming.server_ip)
        }

        if (incoming.payout_client_id) {
          setPayoutFormData({
            client_id: incoming.payout_client_id || '',
            api_key: '',
            checksum_key: '',
          })
          setPayoutMode('custom')
        } else if (incoming.payout_status === 'SAME_AS_INBOUND') {
          setPayoutMode('same')
        }

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

  const isPayoutActive = channel?.payout_status === 'ACTIVE' || channel?.payout_status === 'SAME_AS_INBOUND'
  const hasStoredPayoutCredentials = Boolean(channel?.payout_client_id)

  const safePayoutMeta = useMemo(
    () => ({
      merchantId: channel?.payout_client_id
        ? maskValue(channel.payout_client_id, 6)
        : channel?.payout_status === 'SAME_AS_INBOUND'
        ? safeChannelMeta.merchantId
        : 'PAYOS_••••••',
      connectionKey: '••••••••••••',
      verificationKey: '••••••••••••',
    }),
    [channel, safeChannelMeta],
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
      toast.success('Kênh thanh toán đã được kết nối thành công.')
      if (returnTo) {
        navigate(returnTo, {
          replace: true,
          state: { message: 'Đã kết nối PayOS. Bạn có thể gửi duyệt sự kiện để hệ thống kiểm tra gói dịch vụ.' },
        })
      }
    } catch (err) {
      const message = getApiMessage(err, 'Không thể kết nối. Vui lòng kiểm tra lại Client ID, API Key và Checksum Key.')
      setTestState({ status: 'error', message })
      toast.error(message)
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

  // Payout Actions
  const runPayoutConnectionTest = async () => {
    setPayoutTesting(true)
    setPayoutTestState({ status: 'loading', message: '', balance: null })
    try {
      if (payoutMode === 'same') {
        await api.post('/organizer/payments/channel/payout', {
          use_inbound_for_payout: true,
        })
      } else {
        const hasStored = Boolean(channel?.payout_client_id)
        const hasNewInput =
          payoutFormData.api_key.trim() ||
          payoutFormData.checksum_key.trim() ||
          payoutFormData.client_id.trim() !== (channel?.payout_client_id || '')

        if (!hasStored || hasNewInput) {
          if (!payoutFormData.client_id.trim() || !payoutFormData.api_key.trim() || !payoutFormData.checksum_key.trim()) {
            throw new Error('Vui lòng nhập đầy đủ Client ID, API Key và Checksum Key cho Kênh chi.')
          }
        }

        await api.post('/organizer/payments/channel/payout', {
          use_inbound_for_payout: false,
          payout_client_id: payoutFormData.client_id.trim(),
          payout_api_key: payoutFormData.api_key.trim() || undefined,
          payout_checksum_key: payoutFormData.checksum_key.trim() || undefined,
        })
      }

      const res = await api.post('/organizer/payments/channel/payout/test')
      const data = res.data?.data
      setPayoutTestState({
        status: 'success',
        message: res.data?.message || 'Kết nối Kênh chi PayOS thành công. Kênh chi đã kích hoạt.',
        balance: data?.balance,
      })
      toast.success('Kết nối Kênh chi PayOS thành công!')
      await fetchChannel()
    } catch (err) {
      const msg = getApiMessage(err, 'Không thể kết nối Kênh chi PayOS. Vui lòng kiểm tra lại cấu hình.')
      setPayoutTestState({ status: 'error', message: msg, balance: null })
      toast.error(msg)
    } finally {
      setPayoutTesting(false)
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
    'Đang xác thực thông tin PayOS...',
    'Đang kiểm tra kênh thanh toán...',
    'Đang xác nhận cấu hình ngân hàng...',
  ]

  return (
    <OrganizerPage
      title="Cài đặt Thanh toán & Chi hộ"
      description="Cấu hình Kênh thu để nhận tiền bán vé và Kênh chi để tự động hoàn tiền vé cho khách hàng qua PayOS."
    >
      <div className="mt-6">
        <OrganizerPanel>
      {/* Tabs Switcher */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-soft/30 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('inbound')}
          className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition ${
            activeTab === 'inbound'
              ? 'border border-primary/40 bg-primary/15 text-primary shadow-sm'
              : 'border border-border-soft/20 bg-panel-soft text-subtle hover:border-border-soft hover:text-content'
          }`}
        >
          <ArrowDownLeft className="size-4" />
          Kênh thu (Nhận tiền bán vé)
          {isActive && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
              <CheckCircle2 className="size-3" />
              Đang hoạt động
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payout')}
          className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition ${
            activeTab === 'payout'
              ? 'border border-primary/40 bg-primary/15 text-primary shadow-sm'
              : 'border border-border-soft/20 bg-panel-soft text-subtle hover:border-border-soft hover:text-content'
          }`}
        >
          <ArrowUpRight className="size-4" />
          Kênh chi (Hoàn tiền / Payouts)
          {isPayoutActive ? (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
              <CheckCircle2 className="size-3" />
              {channel?.payout_status === 'SAME_AS_INBOUND' ? 'Dùng chung Kênh thu' : 'Đang hoạt động'}
            </span>
          ) : (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
              <AlertCircle className="size-3" />
              Chưa kích hoạt
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: KÊNH THU (INBOUND PAYMENT CHANNEL)                                  */}
      {/* ========================================================================= */}
      {activeTab === 'inbound' && (
        <div className="rounded-2xl border border-border-soft/30 bg-surface/80 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
          {!showSavedSettings && <StepNav step={step} />}

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
                <p className="mb-2 font-bold text-primary">Kết nối Kênh thu đã lưu</p>
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
                    Cập nhật Kênh thu
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('payout')}
                  className="org-btn-secondary flex items-center gap-2"
                >
                  <ArrowUpRight className="size-4 text-primary" />
                  Cài đặt Kênh chi (Payouts)
                </button>
                <button type="button" onClick={() => navigate(returnTo || '/organizer/events')} className="org-btn-secondary">
                  {returnTo ? 'Quay lại sự kiện' : 'Đi tới Quản lý sự kiện'}
                </button>
                <button type="button" onClick={() => navigate('/organizer/events/create')} className="org-btn-primary">
                  <CreditCard className="size-4" />
                  Tạo sự kiện
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: KÊNH CHI (PAYOUTS / CHI HỘ HOÀN TIỀN)                               */}
      {/* ========================================================================= */}
      {activeTab === 'payout' && (
        <div className="space-y-6">
          {/* Status Alert Banner */}
          <div
            className={`rounded-2xl border p-5 transition ${
              isPayoutActive
                ? 'border-success/30 bg-success/10 text-content'
                : 'border-warning/30 bg-warning/10 text-content'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                {isPayoutActive ? (
                  <CheckCircle2 className="mt-0.5 size-6 text-success shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 size-6 text-warning shrink-0" />
                )}
                <div>
                  <h3 className="font-bold text-content text-base">
                    {isPayoutActive
                      ? 'Kênh chi (Payouts) đang hoạt động'
                      : 'Kênh chi (Payouts) chưa được kích hoạt'}
                  </h3>
                  <p className="mt-1 text-sm text-subtle">
                    {isPayoutActive
                      ? channel?.payout_status === 'SAME_AS_INBOUND'
                        ? 'Hệ thống đang sử dụng bộ khóa Kênh thu để chi hoàn tiền tự động qua PayOS.'
                        : 'Hệ thống đang sử dụng bộ khóa Kênh chi riêng đã xác thực thành công với PayOS.'
                      : 'Khi Ban tổ chức duyệt yêu cầu hoàn tiền, hệ thống sẽ ưu tiên dùng cổng PayOS Payouts tự động nếu đã kích hoạt, hoặc hướng dẫn quét mã VietQR để hoàn tiền.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runPayoutConnectionTest}
                  disabled={payoutTesting}
                  className="flex items-center gap-2 rounded-xl border border-border-soft/40 bg-surface px-4 py-2 text-sm font-semibold text-content hover:bg-surface/80 disabled:opacity-50"
                >
                  <RefreshCw className={`size-4 ${payoutTesting ? 'animate-spin text-primary' : ''}`} />
                  Kiểm tra lại
                </button>
              </div>
            </div>
          </div>

          {/* Configuration Box */}
          <div className="rounded-2xl border border-border-soft/30 bg-surface/80 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-content">Cấu hình Kênh chi (Payouts / Chi hộ)</h2>
              <p className="mt-1 text-sm text-subtle">
                Chọn phương thức cấu hình bộ khóa cho Kênh chi và làm theo hướng dẫn các bước để kích hoạt dịch vụ trên payOS.
              </p>
            </div>

            {/* Mode Selector Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPayoutMode('same')}
                className={`rounded-2xl border p-5 text-left transition ${
                  payoutMode === 'same'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border-soft/30 bg-panel-soft/60 hover:border-border-soft'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/20 text-primary">
                      <WalletCards className="size-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-content text-sm">Dùng chung với Kênh thu</h4>
                      <p className="text-xs text-subtle">Khuyên dùng nếu cùng tài khoản</p>
                    </div>
                  </div>
                  <span
                    className={`size-4 rounded-full border-2 transition ${
                      payoutMode === 'same' ? 'border-primary bg-primary' : 'border-border-soft/50'
                    }`}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  Sử dụng trực tiếp Client ID, API Key và Checksum Key của Kênh thu hiện tại. Phù hợp khi bạn đã bật Kênh chi trên cùng ứng dụng PayOS.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPayoutMode('custom')}
                className={`rounded-2xl border p-5 text-left transition ${
                  payoutMode === 'custom'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border-soft/30 bg-panel-soft/60 hover:border-border-soft'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-tertiary/20 text-tertiary">
                      <KeyRound className="size-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-content text-sm">Nhập bộ khóa Kênh chi riêng</h4>
                      <p className="text-xs text-subtle">Dành cho Kênh chi độc lập</p>
                    </div>
                  </div>
                  <span
                    className={`size-4 rounded-full border-2 transition ${
                      payoutMode === 'custom' ? 'border-primary bg-primary' : 'border-border-soft/50'
                    }`}
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  Nhập riêng bộ 3 thông số Client ID, API Key, Checksum Key được payOS cấp riêng cho Kênh chi / Kênh chuyển tiền.
                </p>
              </button>
            </div>

            {/* Split Grid: Checklist on left, Form on right */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              {/* Left Column: Step by step guide */}
              <section className="space-y-4 rounded-2xl border border-border-soft/30 bg-panel-soft/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-content">Hướng dẫn kích hoạt Kênh chi trên payOS</h3>
                    <p className="text-sm text-subtle">Chọn từng bước bên dưới để xem hướng dẫn chi tiết.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open('https://my.payos.vn', '_blank', 'noopener,noreferrer')}
                    className="org-btn-primary text-xs"
                  >
                    Mở PayOS
                    <ExternalLink className="size-3.5" />
                  </button>
                </div>

                <ol className="space-y-3">
                  {PAYOS_PAYOUT_GUIDE_STEPS.map((stepItem, index) => {
                    const isSelected = payoutGuideIndex === index
                    return (
                      <li key={stepItem.stepNumber}>
                        <button
                          type="button"
                          onClick={() => setPayoutGuideIndex(index)}
                          className={`w-full rounded-xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-primary/60 bg-primary/10 shadow-sm'
                              : 'border-border-soft/25 bg-surface/50 hover:border-primary/30'
                          }`}
                        >
                          <div className="flex gap-3">
                            <span
                              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                                isSelected ? 'bg-primary text-slate-950' : 'bg-border-soft/50 text-content'
                              }`}
                            >
                              {stepItem.stepNumber}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-bold text-content">{stepItem.title}</span>
                                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                  {stepItem.badge}
                                </span>
                              </div>
                              <p className="mt-1.5 text-sm leading-relaxed text-subtle">{stepItem.detail}</p>

                              {isSelected && (
                                <div className="mt-3 space-y-2 border-t border-border-soft/20 pt-3">
                                  <div className="flex items-start gap-2 rounded-lg bg-surface/80 p-3 text-xs text-subtle">
                                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                                    <span>{stepItem.note}</span>
                                  </div>

                                  {stepItem.stepNumber === 3 && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
                                      <span className="text-content">
                                        IP máy chủ cần Whitelist: <strong className="font-mono text-primary font-bold text-sm ml-1">{serverIp}</strong>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          navigator.clipboard.writeText(serverIp)
                                          toast.success(`Đã sao chép IP máy chủ: ${serverIp}`)
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-bold text-slate-950 hover:opacity-90 transition shadow-sm"
                                      >
                                        <Copy className="size-3.5" />
                                        Sao chép IP
                                      </button>
                                    </div>
                                  )}

                                  {stepItem.actionUrl && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        window.open(stepItem.actionUrl, '_blank', 'noopener,noreferrer')
                                      }}
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                                    >
                                      {stepItem.actionLabel}
                                      <ExternalLink className="size-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>

              {/* Right Column: Key Input & Verify Form */}
              <section className="space-y-5 rounded-2xl border border-border-soft/30 bg-surface p-5">
                <div>
                  <h3 className="text-base font-bold text-content">
                    {payoutMode === 'same'
                      ? 'Xác nhận kết nối Kênh chi dùng chung'
                      : 'Nhập 3 key Kênh chi từ payOS'}
                  </h3>
                  <p className="mt-1 text-sm text-subtle">
                    {payoutMode === 'same'
                      ? 'Hệ thống sẽ dùng thông tin kết nối của Kênh thu để xác thực lệnh chi hộ với PayOS.'
                      : 'Dán đúng thứ tự: Client ID, API Key, Checksum Key được cấp riêng cho Kênh chi.'}
                  </p>
                </div>

                {/* Key Separation & Distinction Card */}
                <div className="rounded-xl border border-border-soft/30 bg-panel-soft/60 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-subtle">Khóa Kênh thu (Nhận tiền):</span>
                    <span className="font-mono text-content font-medium">{safeChannelMeta.merchantId}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border-soft/20 pt-1.5">
                    <span className="text-subtle">Khóa Kênh chi (Hoàn tiền):</span>
                    <span className="font-mono text-primary font-bold">
                      {payoutMode === 'same'
                        ? `${safeChannelMeta.merchantId} (Dùng chung)`
                        : hasStoredPayoutCredentials
                        ? safePayoutMeta.merchantId
                        : 'Chưa cấu hình'}
                    </span>
                  </div>
                </div>

                {payoutMode === 'same' ? (
                  <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <div className="flex items-center gap-2 font-semibold text-primary">
                      <ShieldCheck className="size-4" />
                      Thông tin Kênh thu đang liên kết
                    </div>
                    <div className="grid gap-2 text-content">
                      <p><span className="font-medium text-muted">Client ID:</span> {safeChannelMeta.merchantId}</p>
                      <p><span className="font-medium text-muted">API Key:</span> {safeChannelMeta.connectionKey}</p>
                      <p><span className="font-medium text-muted">Trạng thái:</span> {channel?.status === 'ACTIVE' ? 'Đang hoạt động' : 'Chưa kích hoạt'}</p>
                    </div>
                    <p className="text-xs text-subtle leading-relaxed border-t border-primary/20 pt-2">
                      Nhấn nút bên dưới để hệ thống gửi yêu cầu kiểm tra tới API PayOS Payouts xem tài khoản đã được cấp quyền Chi hộ hay chưa.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <CredentialField
                      id="payout-client-id"
                      label="Client ID (Kênh chi)"
                      icon={Copy}
                      value={payoutFormData.client_id}
                      placeholder={hasStoredPayoutCredentials ? `Hiện tại: ${safePayoutMeta.merchantId}` : 'Dán Client ID Kênh chi'}
                      onChange={(value) => setPayoutFormData((prev) => ({ ...prev, client_id: value }))}
                    />
                    <CredentialField
                      id="payout-api-key"
                      label="API Key (Kênh chi)"
                      icon={KeyRound}
                      type="password"
                      value={payoutFormData.api_key}
                      placeholder={hasStoredPayoutCredentials ? `Hiện tại: ${safePayoutMeta.connectionKey}` : 'Dán API Key Kênh chi'}
                      onChange={(value) => setPayoutFormData((prev) => ({ ...prev, api_key: value }))}
                    />
                    <CredentialField
                      id="payout-checksum-key"
                      label="Checksum Key (Kênh chi)"
                      icon={ShieldCheck}
                      type="password"
                      value={payoutFormData.checksum_key}
                      placeholder={hasStoredPayoutCredentials ? `Hiện tại: ${safePayoutMeta.verificationKey}` : 'Dán Checksum Key Kênh chi'}
                      onChange={(value) => setPayoutFormData((prev) => ({ ...prev, checksum_key: value }))}
                    />
                  </div>
                )}

                {/* Test / Verify Action Button */}
                <button
                  type="button"
                  onClick={runPayoutConnectionTest}
                  disabled={payoutTesting || (payoutMode === 'custom' && !payoutFormData.client_id.trim() && !hasStoredPayoutCredentials)}
                  className="org-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50 py-3 font-bold"
                >
                  {payoutTesting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Đang xác thực Kênh chi với PayOS...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" />
                      Kiểm tra kết nối Kênh chi (Verify)
                    </>
                  )}
                </button>

                {/* Feedback Result Display */}
                {payoutTestState.status === 'success' && (
                  <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success space-y-2">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="size-5" />
                      Kết nối thành công!
                    </div>
                    <p className="text-xs leading-relaxed text-content">
                      {payoutTestState.message}
                    </p>
                    {payoutTestState.balance !== undefined && payoutTestState.balance !== null && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-content pt-1">
                        <Coins className="size-4 text-warning" />
                        Số dư ví chi hộ: {Number(payoutTestState.balance).toLocaleString('vi-VN')} VNĐ
                      </div>
                    )}
                  </div>
                )}

                {payoutTestState.status === 'error' && (
                  <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error space-y-2">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle className="size-5" />
                      Không thể kết nối Kênh chi
                    </div>
                    <p className="text-xs leading-relaxed">{payoutTestState.message}</p>
                    <div className="rounded-lg bg-surface/80 p-2.5 text-[12px] text-subtle border border-error/20">
                      💡 <strong>Gợi ý:</strong> Nếu tài khoản PayOS chưa kịp kích hoạt Kênh chi hoặc chưa có ví Bảo Kim, Ban tổ chức hoàn toàn có thể chọn phương thức <strong>"Chuyển khoản thủ công" (quét mã VietQR)</strong> trong trang Hoàn tiền để hoàn tất giao dịch ngay lập tức.
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Manual Transfer Notice Card */}
          <div className="rounded-2xl border border-tertiary/30 bg-tertiary/10 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-bold text-content">Phương án hoàn tiền không cần kích hoạt Kênh chi</h4>
                <p className="mt-1 text-subtle leading-relaxed">
                  Đối với các sự kiện vừa và nhỏ hoặc đang thử nghiệm, việc đăng ký hồ sơ doanh nghiệp và ký quỹ ví Bảo Kim có thể mất thời gian.
                  EventHub đã tích hợp sẵn tính năng <strong>Chuyển khoản thủ công</strong>: khi duyệt hoàn tiền, hệ thống sẽ tự động tạo một mã <strong>VietQR</strong> chứa đúng số tiền, số tài khoản và ngân hàng của khách hàng để Ban tổ chức chỉ cần mở app ngân hàng quét mã chuyển tiền trong 3 giây.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
        </OrganizerPanel>
      </div>
    </OrganizerPage>
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
  const [showPassword, setShowPassword] = useState(false)
  const isPasswordType = type === 'password'
  const actualType = isPasswordType && showPassword ? 'text' : type

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-content">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={actualType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-border-soft/40 bg-panel-soft px-4 py-2.5 pr-20 text-sm text-content outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          placeholder={placeholder}
        />
        <div className="absolute inset-y-0 right-3 flex items-center gap-2 text-muted">
          {isPasswordType && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="p-1 hover:text-content text-muted transition"
              title={showPassword ? 'Ẩn khóa' : 'Hiện khóa'}
            >
              <Eye className="size-4" />
            </button>
          )}
          <Icon className="size-4 pointer-events-none" />
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
