import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Building2, Camera, Check, CheckCircle2, Clock3, History, Loader2, Lock, UserCircle, X, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { getStoredUserKey, getUserRoles, isAdminUser, isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import {
  fetchMyOrganizerRequests,
  submitOrganizerRequest,
  updateOrganizerRequest,
} from '@/services/organizerRequests.js'
import { uploadOrganizerAvatar, uploadOrganizerDocument } from '@/services/uploads.js'
import { getProfile } from '@/services/user.service.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export const CCCD_PROVINCE_CODES = {
  '001': 'Hà Nội', '002': 'Hà Giang', '004': 'Cao Bằng', '006': 'Bắc Kạn',
  '008': 'Tuyên Quang', '010': 'Lào Cai', '011': 'Điện Biên', '012': 'Lai Châu',
  '014': 'Sơn La', '015': 'Yên Bái', '017': 'Hòa Bình', '019': 'Thái Nguyên',
  '020': 'Lạng Sơn', '022': 'Quảng Ninh', '024': 'Bắc Giang', '025': 'Phú Thọ',
  '026': 'Vĩnh Phúc', '027': 'Bắc Ninh', '030': 'Hải Dương', '031': 'Hải Phòng',
  '033': 'Hưng Yên', '034': 'Thái Bình', '035': 'Hà Nam', '036': 'Nam Định',
  '037': 'Ninh Bình', '038': 'Thanh Hóa', '040': 'Nghệ An', '042': 'Hà Tĩnh',
  '044': 'Quảng Bình', '045': 'Quảng Trị', '046': 'Thừa Thiên Huế', '048': 'Đà Nẵng',
  '049': 'Quảng Nam', '051': 'Quảng Ngãi', '052': 'Bình Định', '054': 'Phú Yên',
  '056': 'Khánh Hòa', '058': 'Ninh Thuận', '060': 'Bình Thuận', '062': 'Kon Tum',
  '064': 'Gia Lai', '066': 'Đắk Lắk', '067': 'Đắk Nông', '068': 'Lâm Đồng',
  '070': 'Bình Phước', '072': 'Tây Ninh', '074': 'Bình Dương', '075': 'Đồng Nai',
  '077': 'Bà Rịa - Vũng Tàu', '079': 'TP. Hồ Chí Minh', '080': 'Long An',
  '082': 'Tiền Giang', '083': 'Bến Tre', '084': 'Trà Vinh', '086': 'Vĩnh Long',
  '087': 'Đồng Tháp', '089': 'An Giang', '091': 'Kiên Giang', '092': 'Cần Thơ',
  '093': 'Hậu Giang', '094': 'Sóc Trăng', '095': 'Bạc Liêu', '096': 'Cà Mau',
}

export function validateCccdStructure(idNumber, dob = '', gender = '') {
  if (!idNumber || !/^\d{12}$/.test(idNumber)) {
    return { valid: false, message: 'Số CCCD phải bao gồm đúng 12 chữ số theo quy chuẩn Bộ Công An.' }
  }

  // 1. Kiểm tra 3 số đầu - Mã tỉnh/thành phố khai sinh
  const provinceCode = idNumber.slice(0, 3)
  const province = CCCD_PROVINCE_CODES[provinceCode]
  if (!province) {
    return {
      valid: false,
      message: `Mã tỉnh/thành '${provinceCode}' không thuộc 63 tỉnh/thành Việt Nam.`,
    }
  }

  // 2. Kiểm tra chữ số thứ 4 - Thế kỷ sinh & Giới tính
  const genderDigit = parseInt(idNumber.charAt(3), 10)
  if (![0, 1, 2, 3].includes(genderDigit)) {
    return {
      valid: false,
      message: `Chữ số thứ 4 ('${genderDigit}') không hợp lệ. Quy chuẩn C06 chỉ chấp nhận 0-1 (thế kỷ 20) hoặc 2-3 (thế kỷ 21).`,
    }
  }

  const century = genderDigit === 0 || genderDigit === 1 ? 1900 : 2000
  const cccdGender = genderDigit === 0 || genderDigit === 2 ? 'Nam' : 'Nữ'

  // 3. Kiểm tra 2 số tiếp theo (thứ 5 & 6) - Năm sinh
  const yearSuffix = parseInt(idNumber.slice(4, 6), 10)
  const cccdBirthYear = century + yearSuffix
  const currentYear = new Date().getFullYear()

  if (cccdBirthYear > currentYear - 15) {
    return {
      valid: false,
      message: `Năm sinh trích xuất từ CCCD (${cccdBirthYear}) chưa đủ tuổi đại diện tổ chức sự kiện.`,
    }
  }
  if (cccdBirthYear < 1920) {
    return {
      valid: false,
      message: `Năm sinh trích xuất từ CCCD (${cccdBirthYear}) không hợp lệ.`,
    }
  }

  // 4. Kiểm tra dãy 6 số cuối (không được là 000000)
  const randomPart = idNumber.slice(6)
  if (randomPart === '000000') {
    return {
      valid: false,
      message: 'Dãy 6 số cuối không hợp lệ (kho số C06 Bộ Công An bắt đầu từ 000001).',
    }
  }

  // 5. Đối chiếu chéo với Ngày sinh (nếu người dùng đã nhập)
  if (dob) {
    let year = null
    const parts = dob.includes('/') ? dob.split('/') : dob.includes('-') ? dob.split('-') : null
    if (parts) {
      if (parts[2]?.length === 4) year = parseInt(parts[2], 10)
      else if (parts[0]?.length === 4) year = parseInt(parts[0], 10)
    }

    if (year && !isNaN(year) && year !== cccdBirthYear) {
      return {
        valid: false,
        message: `Năm sinh khai báo (${year}) không khớp với năm sinh trích xuất từ CCCD (${cccdBirthYear}).`,
      }
    }
  }

  // 6. Đối chiếu chéo với Giới tính (nếu người dùng đã chọn)
  if (gender) {
    const isMale = gender.toLowerCase().includes('nam') || gender.toLowerCase() === 'm'
    const isFemale = gender.toLowerCase().includes('nữ') || gender.toLowerCase() === 'f'
    const selectedGender = isMale ? 'Nam' : isFemale ? 'Nữ' : gender

    if (selectedGender !== cccdGender) {
      return {
        valid: false,
        message: `Giới tính chọn (${selectedGender}) không khớp với chữ số giới tính trong CCCD (${cccdGender}).`,
      }
    }
  }

  return {
    valid: true,
    province,
    gender: cccdGender,
    birthYear: cccdBirthYear,
  }
}

const emptyForm = {
  request_type: 'INDIVIDUAL',
  organization_name: '',
  organization_description: '',
  business_email: '',
  business_phone: '',
  organization_avatar_url: '',
  tax_code: '',
  legal_document_url: '',
  business_license_url: '',
  legal_representative_name: '',
  legal_representative_position: '',
  legal_representative_id_url: '',
  authorization_letter_url: '',
  individual_full_name: '',
  individual_identity_number: '',
  individual_id_front_url: '',
  individual_id_back_url: '',
  individual_selfie_url: '',
  individual_tax_code: '',
  individual_dob: '',
  individual_address: '',
  individual_gender: 'Nam',
  individual_social_link: '',
  individual_portfolio_url: '',
  kyc_ocr_data: null,
  terms_accepted: false,
}

const requestTypeOptions = [
  {
    value: 'INDIVIDUAL',
    label: 'Cá nhân',
    description: 'Dành cho creator, host độc lập, workshop hoặc nhóm tổ chức chưa thành lập pháp nhân.',
  },
  {
    value: 'ORGANIZATION',
    label: 'Tổ chức / Doanh nghiệp',
    description: 'Dành cho doanh nghiệp, công ty, câu lạc bộ có tư cách pháp nhân và mã số thuế.',
  },
]

const validationLabels = {
  organization_name: 'Tên ban tổ chức / Thương hiệu',
  organization_description: 'Mô tả hoạt động',
  business_email: 'Email liên hệ',
  business_phone: 'Số điện thoại liên hệ',
  organization_avatar_url: 'Ảnh đại diện / Logo',
  tax_code: 'Mã số thuế doanh nghiệp',
  legal_document_url: 'Giấy chứng nhận đăng ký doanh nghiệp',
  legal_representative_name: 'Người đại diện pháp luật',
  legal_representative_position: 'Chức vụ người đại diện',
  legal_representative_id_url: 'Giấy tờ tùy thân người đại diện',
  authorization_letter_url: 'Giấy ủy quyền',
  business_license_url: 'Giấy phép kinh doanh đặc thù',
  individual_full_name: 'Họ tên pháp lý',
  individual_identity_number: 'Số CCCD/Định danh cá nhân',
  individual_selfie_url: 'Ảnh chân dung/Selfie đối chiếu',
  individual_tax_code: 'Mã số thuế cá nhân',
  individual_social_link: 'Liên kết mạng xã hội / Kênh truyền thông',
  terms_accepted: 'Điều khoản dịch vụ',
}

function requestTypeLabel(type) {
  return type === 'ORGANIZATION' ? 'Tổ chức' : 'Cá nhân'
}

function RequestTypeSelector({ value, onChange, disabled = false }) {
  const selectedOption = requestTypeOptions.find((option) => option.value === value) || requestTypeOptions[0]

  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {requestTypeOptions.map((option) => {
          const active = value === option.value
          return (
            <label
              key={option.value}
              className={`inline-flex items-center gap-2 text-sm font-bold ${active ? 'text-content' : 'text-muted'
                } ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name="organizer-request-type"
                value={option.value}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="size-4 accent-orange-500"
              />
              {option.label}
            </label>
          )
        })}
      </div>
      <p className="mt-3 text-sm leading-6 text-subtle">
        {selectedOption.description}
      </p>
    </section>
  )
}

function formatApiValidationError(apiError) {
  const issues = Array.isArray(apiError?.data)
    ? apiError.data
    : Array.isArray(apiError?.errors)
      ? apiError.errors
      : []

  if (!issues.length) return apiError?.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.'

  return issues
    .map((issue) => {
      const field = Array.isArray(issue.path) ? issue.path.join('.') : issue.path
      const label = validationLabels[field] || field || 'Dữ liệu'
      return `${label}: ${issue.message}`
    })
    .join('\n')
}

function EmptyStatus() {
  return (
    <div className="glass-panel rounded-[24px] border-primary/20 p-8 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)] text-center text-slate-400">
      <p className="text-sm font-medium">
        Bạn chưa gửi yêu cầu nào. Điền form bên trái để đăng ký trở thành ban tổ chức.
      </p>
    </div>
  )
}

function StatusSummary({ requests, onEdit }) {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!requests.length) {
    return <EmptyStatus />
  }

  const latestRequest = requests[requests.length - 1]
  const handleHistoryEdit = (request) => {
    setHistoryOpen(false)
    onEdit?.(request)
  }

  return (
    <>
      <div className="space-y-3">
        <StatusCard request={latestRequest} onEdit={onEdit} />
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="w-full py-3.5 text-[13px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-slate-400 transition-colors hover:text-primary hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]"
        >
          <History className="size-4" />
          Xem lịch sử yêu cầu
        </button>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border-soft bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-soft/40 px-5 py-4">
              <div>
                <p className="font-display text-xl font-extrabold text-content">Lịch sử yêu cầu Organizer</p>
                <p className="text-sm text-muted">{requests.length} yêu cầu đã gửi</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="grid size-9 place-items-center rounded-full text-subtle transition hover:bg-panel hover:text-content"
                aria-label="Đóng lịch sử yêu cầu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-5">
              <StatusList requests={requests} onEdit={handleHistoryEdit} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusList({ requests, onEdit }) {
  return (
    <div className="space-y-4">
      {requests.map((request, index) => (
        <StatusCard
          key={request.id}
          request={request}
          titlePrefix={requests.length > 1 ? `Yêu cầu ${index + 1}` : ''}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

function StatusCard({ request, titlePrefix, onEdit }) {
  const statusConfig = {
    PENDING: {
      icon: Clock3,
      tone: 'text-warning',
      bg: 'bg-warning/10 border-warning/30 shadow-[inset_0_0_20px_rgba(245,158,11,0.1)]',
      title: 'Đang chờ duyệt',
      body: 'Admin sẽ xem xét yêu cầu của bạn trong thời gian sớm nhất.',
    },
    APPROVED: {
      icon: CheckCircle2,
      tone: 'text-success',
      bg: 'bg-success/10 border-success/30 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]',
      title: 'Đã được duyệt',
      body: 'Đăng xuất và đăng nhập lại để truy cập khu vực Organizer.',
    },
    REJECTED: {
      icon: XCircle,
      tone: 'text-error',
      bg: 'bg-error/10 border-error/30 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]',
      title: 'Yêu cầu bị từ chối',
      body: request.review_note || 'Bạn có thể gửi lại yêu cầu với thông tin cập nhật.',
    },
  }

  const config = statusConfig[request.status] || statusConfig.PENDING
  const Icon = config.icon

  return (
    <div className={`glass-panel rounded-[24px] border-white/5 p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] ${config.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${config.tone}`} />
        <div>
          {titlePrefix && (
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-subtle">
              {titlePrefix}
            </p>
          )}
          <p className={`font-bold ${config.tone}`}>{config.title}</p>
          <p className="mt-1 text-sm text-muted">{config.body}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-subtle">Loại đăng ký</dt>
              <dd className="font-semibold">{requestTypeLabel(request.request_type)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Tổ chức</dt>
              <dd className="font-semibold">{request.organization_name}</dd>
            </div>
            {request.request_type === 'ORGANIZATION' && (
              <div>
                <dt className="text-subtle">Email tổ chức</dt>
                <dd className="space-y-1 font-semibold">
                  <span className="block break-all">{request.business_email}</span>
                  <span className={request.business_email_verified ? 'block text-success' : 'block text-warning'}>
                    {request.business_email_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-subtle">Gửi lúc</dt>
              <dd>{new Date(request.created_at).toLocaleString('vi-VN')}</dd>
            </div>
            {request.reviewed_at && (
              <div>
                <dt className="text-subtle">Xử lý lúc</dt>
                <dd>{new Date(request.reviewed_at).toLocaleString('vi-VN')}</dd>
              </div>
            )}
          </dl>
          {request.status !== 'APPROVED' && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(request)}
              className="mt-5 inline-flex rounded-full border border-[#C99A47]/40 bg-[#C99A47]/15 px-6 py-2.5 text-sm font-bold text-[#E6C17A] transition-all hover:bg-[#C99A47]/30 hover:border-[#E6C17A]"
            >
              Cập nhật hồ sơ
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function OrganizerRequestPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = hasAuthSession()
  const currentUserKey = getStoredUserKey()

  const profileQuery = useQuery({
    queryKey: ['user-profile', currentUserKey],
    queryFn: getProfile,
    enabled: isAuthenticated,
  })

  const isOrganizer = getUserRoles(profileQuery.data).includes('organizer')

  const [form, setForm] = useState(emptyForm)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [selectedDocuments, setSelectedDocuments] = useState({})
  const [previewUrl, setPreviewUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingRequest, setEditingRequest] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
      return
    }
    if (isAdminUser()) {
      navigate('/admin/organizer-requests', { replace: true })
    }
  }, [isAuthenticated, location.pathname, navigate])

  const requestQuery = useQuery({
    queryKey: ['my-organizer-requests', currentUserKey],
    queryFn: fetchMyOrganizerRequests,
    enabled: isAuthenticated,
  })

  const requests = requestQuery.data || []
  const hasPendingIndividualRequest =
    requests.some((request) => request.status === 'PENDING' && request.request_type === 'INDIVIDUAL')
  const canSubmit =
    !isOrganizer &&
    (!hasPendingIndividualRequest || Boolean(editingRequest))

  const requestMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? updateOrganizerRequest(id, payload) : submitOrganizerRequest(payload),
    onSuccess: (request) => {
      const message =
        request.request_type === 'ORGANIZATION'
          ? 'Yêu cầu đã được gửi. Vui lòng kiểm tra email tổ chức để xác thực trước khi admin duyệt.'
          : editingRequest
            ? 'Yêu cầu đã được cập nhật và gửi lại để admin xét duyệt.'
            : 'Yêu cầu đã được gửi thành công.'
      setSuccess(message)
      toast.success(message)
      setError('')
      setForm(emptyForm)
      setSelectedAvatar(null)
      setSelectedDocuments({})
      setPreviewUrl('')
      setEditingRequest(null)
      queryClient.invalidateQueries({ queryKey: ['my-organizer-requests'] })
    },
    onError: (err) => {
      const apiError = err.response?.data
      const message = formatApiValidationError(apiError)
      setError(message)
      toast.error(message)
      setSuccess('')
    },
  })

  const handleChange = (field) => (event) => {
    const value =
      field === 'individual_full_name'
        ? event.target.value.toLocaleUpperCase('vi-VN')
        : field === 'individual_identity_number'
          ? event.target.value.toUpperCase()
          : event.target.value
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleCheckboxChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.checked }))
  }

  const handleTypeChange = (requestType) => {
    setError('')
    setSuccess('')
    setForm((current) => ({
      ...current,
      request_type: requestType,
      business_email:
        requestType === 'ORGANIZATION'
          ? current.business_email
          : '',
      organization_avatar_url: requestType === 'ORGANIZATION' ? current.organization_avatar_url : '',
      tax_code: requestType === 'ORGANIZATION' ? current.tax_code : '',
    }))

    if (requestType !== 'ORGANIZATION') {
      setSelectedAvatar(null)
      setPreviewUrl('')
    }
  }

  const handleEditRequest = (request) => {
    setEditingRequest(request)
    setError('')
    setSuccess('')
    setSelectedAvatar(null)
    setSelectedDocuments({})
    setPreviewUrl(request.organization_avatar_url || '')
    const kyc = request.kyc_ocr_data || null
    setForm({
      ...emptyForm,
      request_type: request.request_type || 'INDIVIDUAL',
      organization_name: request.organization_name || '',
      organization_description: request.organization_description || '',
      business_email: request.business_email || '',
      business_phone: request.business_phone || '',
      organization_avatar_url: request.organization_avatar_url || '',
      tax_code: request.tax_code || '',
      legal_document_url: request.legal_document_url || '',
      business_license_url: request.business_license_url || '',
      legal_representative_name: request.legal_representative_name || '',
      legal_representative_position: request.legal_representative_position || '',
      legal_representative_id_url: request.legal_representative_id_url || '',
      authorization_letter_url: request.authorization_letter_url || '',
      individual_full_name: request.individual_full_name || '',
      individual_identity_number: request.individual_identity_number || '',
      individual_id_front_url: '',
      individual_id_back_url: '',
      individual_selfie_url: request.individual_selfie_url || '',
      individual_tax_code: request.individual_tax_code || '',
      individual_dob: kyc?.dob || '',
      individual_address: kyc?.address || '',
      individual_gender: kyc?.gender || 'Nam',
      individual_social_link: kyc?.social_link || '',
      individual_portfolio_url: kyc?.portfolio_url || '',
      kyc_ocr_data: kyc,
      terms_accepted: Boolean(request.terms_accepted),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const autoEditTriggeredRef = useRef(false)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const isEditMode = searchParams.get('mode') === 'edit' || searchParams.get('edit') === 'latest' || location.state?.editLatest
    if (isEditMode && requests.length > 0 && !editingRequest && !autoEditTriggeredRef.current) {
      const candidate = [...requests].reverse().find((r) => r.status === 'REJECTED' || r.status === 'PENDING') || requests[requests.length - 1]
      if (candidate && candidate.status !== 'APPROVED') {
        autoEditTriggeredRef.current = true
        handleEditRequest(candidate)
      }
    }
  }, [location.search, location.state, requests, editingRequest])

  const cancelEdit = () => {
    autoEditTriggeredRef.current = true
    setEditingRequest(null)
    setForm(emptyForm)
    setSelectedAvatar(null)
    setSelectedDocuments({})
    setPreviewUrl('')
    setError('')
    setSuccess('')
  }

  const handleDocumentChange = (field) => (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const imageOnlyFields = [
      'individual_id_front_url',
      'individual_id_back_url',
      'individual_selfie_url',
    ]

    if (imageOnlyFields.includes(field) && !file.type.startsWith('image/')) {
      event.target.value = ''
      const message = 'Vui lòng chỉ tải ảnh JPG, PNG hoặc WEBP cho tài liệu xác minh cá nhân.'
      setError(message)
      toast.error(message)
      return
    }

    setSelectedDocuments((current) => ({ ...current, [field]: file }))
    setError('')
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      const message = 'Vui lòng chọn tệp ảnh hợp lệ.'
      setError(message)
      toast.error(message)
      return
    }

    setSelectedAvatar(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    let avatarUrl = form.organization_avatar_url.trim()
    const isOrganization = form.request_type === 'ORGANIZATION'

    if (!selectedAvatar && !avatarUrl) {
      const message = 'Vui lòng tải ảnh đại diện.'
      setError(message)
      toast.error(message)
      return
    }

    if (!isOrganization) {
      if (!form.individual_full_name?.trim()) {
        const message = 'Vui lòng nhập Họ và tên pháp lý.'
        setError(message)
        toast.error(message)
        return
      }

      if (!form.individual_identity_number?.trim() || form.individual_identity_number.trim().length !== 12) {
        const message = 'Vui lòng nhập đúng 12 chữ số CCCD.'
        setError(message)
        toast.error(message)
        return
      }

      const cccdCheck = validateCccdStructure(
        form.individual_identity_number.trim(),
        form.individual_dob?.trim(),
        form.individual_gender
      )
      if (!cccdCheck.valid) {
        setError(cccdCheck.message)
        toast.error(cccdCheck.message)
        return
      }

      if (!form.individual_dob?.trim()) {
        const message = 'Vui lòng nhập ngày sinh.'
        setError(message)
        toast.error(message)
        return
      }

      if (!form.individual_address?.trim()) {
        const message = 'Vui lòng nhập nơi thường trú theo CCCD.'
        setError(message)
        toast.error(message)
        return
      }

      if (!form.individual_social_link?.trim()) {
        const message = 'Vui lòng cung cấp link mạng xã hội hoặc kênh truyền thông chính chủ để Admin thẩm định.'
        setError(message)
        toast.error(message)
        return
      }
    }

    if (!form.terms_accepted) {
      const message = 'Vui lòng xác nhận đã đọc và đồng ý Điều khoản dành cho Nhà tổ chức.'
      setError(message)
      toast.error(message)
      return
    }

    const requiredDocuments = isOrganization
      ? [
        ['legal_document_url', 'Vui lòng tải Giấy chứng nhận đăng ký doanh nghiệp.'],
        ['legal_representative_id_url', 'Vui lòng tải giấy tờ tùy thân của người đại diện.'],
      ]
      : [
        ['individual_selfie_url', 'Vui lòng tải ảnh chân dung/Selfie để đối chiếu trực quan.'],
      ]

    const missingDocument = requiredDocuments.find(
      ([field]) => !selectedDocuments[field] && !form[field]?.trim(),
    )

    if (missingDocument) {
      setError(missingDocument[1])
      toast.error(missingDocument[1])
      return
    }

    const uploadDocumentField = async (field) => {
      // Security rule: NEVER upload CCCD front/back to Cloudinary!
      if (field === 'individual_id_front_url' || field === 'individual_id_back_url') {
        return ''
      }
      if (selectedDocuments[field]) {
        const imageOnlyFields = [
          'individual_selfie_url',
        ]
        const uploadResult = await uploadOrganizerDocument(selectedDocuments[field], {
          imageOnly: imageOnlyFields.includes(field),
        })
        return uploadResult.secure_url || uploadResult.url
      }
      return form[field]?.trim() || ''
    }

    try {
      setIsUploading(true)
      if (selectedAvatar) {
        setIsUploading(true)
        const uploadResult = await uploadOrganizerAvatar(selectedAvatar)
        avatarUrl = uploadResult.secure_url || uploadResult.url
      }

      const documentUrls = isOrganization
        ? {
          legal_document_url: await uploadDocumentField('legal_document_url'),
          business_license_url: await uploadDocumentField('business_license_url'),
          legal_representative_id_url: await uploadDocumentField('legal_representative_id_url'),
          authorization_letter_url: await uploadDocumentField('authorization_letter_url'),
        }
        : {
          individual_id_front_url: '',
          individual_id_back_url: '',
          individual_selfie_url: await uploadDocumentField('individual_selfie_url'),
        }

      const validation = !isOrganization
        ? validateCccdStructure(
            form.individual_identity_number.trim(),
            form.individual_dob?.trim(),
            form.individual_gender
          )
        : null

      const finalKycData = !isOrganization
        ? {
            verification_method: 'PARTNER_VETTING',
            id_number: form.individual_identity_number.trim(),
            full_name: form.individual_full_name.trim().toLocaleUpperCase('vi-VN'),
            dob: form.individual_dob?.trim() || '',
            gender: form.individual_gender || 'Nam',
            address: form.individual_address?.trim() || '',
            social_link: form.individual_social_link?.trim() || '',
            portfolio_url: form.individual_portfolio_url?.trim() || '',
            province: validation?.province || '',
            birth_year: validation?.birthYear || '',
            algorithm_checked: true,
            submitted_at: new Date().toISOString(),
          }
        : null

      requestMutation.mutate({
        id: editingRequest?.id,
        payload: {
          request_type: form.request_type,
          organization_name: form.organization_name.trim(),
          organization_description: form.organization_description.trim(),
          business_email: isOrganization ? form.business_email.trim() : (form.business_email?.trim() || ''),
          business_phone: form.business_phone.trim(),
          organization_avatar_url: avatarUrl,
          tax_code: isOrganization ? form.tax_code.trim() : '',
          legal_document_url: documentUrls.legal_document_url || '',
          business_license_url: documentUrls.business_license_url || '',
          legal_representative_name: isOrganization ? form.legal_representative_name.trim() : '',
          legal_representative_position: isOrganization ? form.legal_representative_position.trim() : '',
          legal_representative_id_url: documentUrls.legal_representative_id_url || '',
          authorization_letter_url: documentUrls.authorization_letter_url || '',
          individual_full_name: isOrganization ? '' : form.individual_full_name.trim(),
          individual_identity_number: isOrganization ? '' : form.individual_identity_number.trim(),
          individual_id_front_url: '', // Not stored for security
          individual_id_back_url: '',  // Not stored for security
          individual_selfie_url: documentUrls.individual_selfie_url || '',
          individual_tax_code: isOrganization ? '' : form.individual_tax_code.trim(),
          kyc_ocr_data: isOrganization ? null : finalKycData,
          terms_accepted: form.terms_accepted,
        },
      })
    } catch (err) {
      const message = getApiMessage(err, 'Không thể tải tài liệu lên hệ thống.')
      setError(message)
      toast.error(message)
      return
    } finally {
      setIsUploading(false)
    }
  }

  if (!isAuthenticated) return null

  if (profileQuery.isLoading || requestQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-8 pb-10">
        <SectionHeader
          title="Đăng ký trở thành ban tổ chức"
          description="Đang tải dữ liệu từ hệ thống..."
        />
        <p className="text-sm text-muted">Vui lòng đợi trong giây lát.</p>
      </div>
    )
  }

  if (isOrganizer) {
    return (
      <div className="mx-auto max-w-3xl px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-8 pb-10">
        <SectionHeader
          title="Đăng ký trở thành ban tổ chức"
          description="Tài khoản của bạn đã có quyền Organizer"
        />
        <div className="glass-panel rounded-lg p-6 text-center">
          <Building2 className="mx-auto size-10 text-primary" />
          <p className="mt-4 text-muted">
            Bạn có thể quản lý sự kiện tại khu vực Organizer.
          </p>
          <Link
            to="/organizer"
            className="mt-5 inline-flex rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 active:scale-[0.98]"
          >
            Mở Organizer Portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-8 pb-10">
      <SectionHeader
        title="Đăng ký trở thành ban tổ chức"
        description="Gửi thông tin tổ chức để Admin xét duyệt và cấp quyền Organizer"
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] relative">
        <section className="glass-panel rounded-[32px] border-primary/20 p-8 lg:p-10 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_var(--color-primary)_0%,_transparent_60%)] opacity-5 pointer-events-none" />
          {editingRequest && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              Bạn đang chỉnh sửa yêu cầu đã gửi. Sau khi lưu, yêu cầu sẽ được đưa về trạng thái chờ duyệt.
            </div>
          )}

          {hasPendingIndividualRequest && !editingRequest && (
            <p className="mb-4 text-sm text-muted">
              Bạn đã có yêu cầu cá nhân đang chờ duyệt. Vui lòng đợi Admin xử lý trước khi gửi yêu cầu mới.
            </p>
          )}

          {canSubmit && (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <FormSection
                title="Loại đăng ký"
                description="Chọn đúng nhóm đăng ký để hệ thống yêu cầu bộ thông tin phù hợp."
              >
                <RequestTypeSelector
                  value={form.request_type}
                  onChange={handleTypeChange}
                  disabled={Boolean(editingRequest)}
                />
              </FormSection>

              <FormSection
                title="Thông tin hiển thị"
                description="Các thông tin này dùng để nhận diện organizer trên hệ thống."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Tên cá nhân/tổ chức"
                    value={form.organization_name}
                    onChange={handleChange('organization_name')}
                    placeholder={
                      form.request_type === 'ORGANIZATION'
                        ? 'VD: Công ty Sự Kiện Việt'
                        : 'VD: CLB Âm Nhạc Sài Gòn'
                    }
                    required
                  />
                  <Field
                    label="Số điện thoại"
                    value={form.business_phone}
                    onChange={handleChange('business_phone')}
                    placeholder="VD: 0901234567"
                    required
                  />
                  {form.request_type === 'ORGANIZATION' ? (
                    <Field
                      label="Email tổ chức"
                      type="email"
                      value={form.business_email}
                      onChange={handleChange('business_email')}
                      placeholder="contact@company.com"
                      required
                    />
                  ) : (
                    <Field
                      label="Email liên hệ (Tùy chọn)"
                      type="email"
                      value={form.business_email}
                      onChange={handleChange('business_email')}
                      placeholder="contact@example.com"
                    />
                  )}
                </div>

                <div>
                  <span className="text-sm font-semibold text-muted">
                    Ảnh đại diện
                    <RequiredMark />
                  </span>
                  <div className="mt-3 glass-panel flex items-center gap-5 rounded-[24px] border-white/10 p-5 shadow-inner">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Ảnh đại diện"
                        className="size-24 rounded-[16px] object-cover shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                      />
                    ) : (
                      <div className="grid size-24 place-items-center rounded-[16px] bg-slate-900/50 shadow-inner">
                        <UserCircle className="size-12 text-slate-500" />
                      </div>
                    )}
                    <div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white/20">
                        <Camera className="size-4" />
                        Chọn ảnh
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                      </label>
                      <p className="mt-3 text-xs text-slate-400 max-w-[200px]">
                        Dùng logo, ảnh nhận diện thương hiệu hoặc ảnh đại diện rõ mặt.
                      </p>
                    </div>
                  </div>
                </div>
              </FormSection>

              {form.request_type === 'ORGANIZATION' && (
                <>
                  <FormSection
                    title="Thông tin pháp lý tổ chức"
                    description="Dùng để đối chiếu với giấy đăng ký kinh doanh và hồ sơ đại diện."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Mã số thuế"
                        value={form.tax_code}
                        onChange={handleChange('tax_code')}
                        placeholder="10 hoặc 13 chữ số"
                        required
                      />
                      <Field
                        label="Người đại diện pháp luật"
                        value={form.legal_representative_name}
                        onChange={handleChange('legal_representative_name')}
                        placeholder="NGUYỄN VĂN A"
                        required
                      />
                      <Field
                        label="Chức vụ"
                        value={form.legal_representative_position}
                        onChange={handleChange('legal_representative_position')}
                        placeholder="Giám đốc / Tổng giám đốc"
                        required
                      />
                    </div>
                  </FormSection>

                  <FormSection
                    title="Tài liệu xác minh tổ chức"
                    description="Tải bản scan hoặc ảnh chụp rõ nét để Admin kiểm tra nhanh hơn."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FileField
                        label="Giấy chứng nhận đăng ký doanh nghiệp"
                        required
                        file={selectedDocuments.legal_document_url}
                        existingUrl={form.legal_document_url}
                        onChange={handleDocumentChange('legal_document_url')}
                      />
                      <FileField
                        label="Giấy phép kinh doanh đặc thù"
                        file={selectedDocuments.business_license_url}
                        existingUrl={form.business_license_url}
                        onChange={handleDocumentChange('business_license_url')}
                      />
                      <FileField
                        label="Giấy tờ tùy thân người đại diện"
                        required
                        file={selectedDocuments.legal_representative_id_url}
                        existingUrl={form.legal_representative_id_url}
                        onChange={handleDocumentChange('legal_representative_id_url')}
                      />
                      <FileField
                        label="Giấy ủy quyền"
                        file={selectedDocuments.authorization_letter_url}
                        existingUrl={form.authorization_letter_url}
                        onChange={handleDocumentChange('authorization_letter_url')}
                      />
                    </div>
                  </FormSection>
                </>
              )}

              {form.request_type === 'INDIVIDUAL' && (
                <>
                  <FormSection
                    title="Thông tin cá nhân"
                    description="Vui lòng nhập đúng theo giấy tờ tùy thân để hồ sơ được xét duyệt nhanh nhất."
                  >
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-950/30 border border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-300">
                      <Lock className="size-4 shrink-0 text-emerald-400" />
                      <span>Dữ liệu định danh được bảo mật an toàn theo tiêu chuẩn riêng tư.</span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Field
                          label="Họ và tên"
                          value={form.individual_full_name}
                          onChange={handleChange('individual_full_name')}
                          placeholder="NGUYỄN VĂN A"
                          required
                        />
                      </div>

                      <div>
                        <Field
                          label="Số CCCD (12 chữ số)"
                          value={form.individual_identity_number}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 12)
                            setForm((prev) => ({ ...prev, individual_identity_number: val }))
                          }}
                          placeholder="Nhập 12 số CCCD"
                          required
                        />
                        {/* Real-time C06 feedback */}
                        {form.individual_identity_number && (
                          <div className="mt-1.5">
                            {form.individual_identity_number.length < 12 && (
                              <div className="text-[11px]">
                                {form.individual_identity_number.length >= 3 && CCCD_PROVINCE_CODES[form.individual_identity_number.slice(0, 3)] ? (
                                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                                    <Check className="size-3" /> Nơi cấp: {CCCD_PROVINCE_CODES[form.individual_identity_number.slice(0, 3)]}
                                  </span>
                                ) : form.individual_identity_number.length >= 3 ? (
                                  <span className="text-rose-400 font-medium flex items-center gap-1">
                                    <AlertTriangle className="size-3" /> Mã tỉnh '{form.individual_identity_number.slice(0, 3)}' không hợp lệ
                                  </span>
                                ) : null}
                              </div>
                            )}

                            {form.individual_identity_number.length === 12 && (
                              (() => {
                                const check = validateCccdStructure(
                                  form.individual_identity_number,
                                  form.individual_dob,
                                  form.individual_gender
                                )
                                if (!check.valid) {
                                  return (
                                    <div className="mt-2 rounded-xl bg-rose-950/40 border border-rose-500/40 p-2.5 text-xs text-rose-300 flex items-start gap-2">
                                      <AlertTriangle className="size-4 text-rose-400 shrink-0 mt-0.5" />
                                      <span>{check.message}</span>
                                    </div>
                                  )
                                }
                                return (
                                  <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-xs space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                                      <Check className="size-3.5" />
                                      <span>Thông tin giải mã chuẩn C06 Bộ Công An:</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 pt-0.5 text-[11px] text-slate-300">
                                      <div>
                                        <span className="text-slate-400 block text-[10px]">Nơi khai sinh:</span>
                                        <strong className="text-white text-xs">{check.province}</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 block text-[10px]">Giới tính:</span>
                                        <strong className="text-white text-xs">{check.gender}</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 block text-[10px]">Năm sinh:</span>
                                        <strong className="text-white text-xs">{check.birthYear}</strong>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Field
                            label="Ngày sinh"
                            type="text"
                            value={form.individual_dob}
                            onChange={handleChange('individual_dob')}
                            placeholder="DD/MM/YYYY"
                            required
                          />
                        </div>
                        <div>
                          <label className="block">
                            <span className="text-sm font-semibold text-muted">
                              Giới tính <RequiredMark />
                            </span>
                            <select
                              value={form.individual_gender}
                              onChange={handleChange('individual_gender')}
                              className="cosmic-input w-full mt-2"
                            >
                              <option value="Nam">Nam</option>
                              <option value="Nữ">Nữ</option>
                            </select>
                          </label>
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <Field
                          label="Nơi thường trú"
                          value={form.individual_address}
                          onChange={handleChange('individual_address')}
                          placeholder="Địa chỉ theo CCCD"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Field
                          label="Mã số thuế cá nhân (Tùy chọn)"
                          value={form.individual_tax_code}
                          onChange={handleChange('individual_tax_code')}
                          placeholder="Mã số thuế (nếu có)"
                        />
                      </div>
                    </div>
                  </FormSection>

                  <FormSection
                    title="Kênh truyền thông & Mạng xã hội"
                    description="Cung cấp liên kết để ban quản trị đối chiếu và duyệt tài khoản nhanh hơn."
                  >
                    <div className="space-y-4">
                      <div>
                        <Field
                          label="Link Mạng xã hội / Kênh truyền thông"
                          value={form.individual_social_link}
                          onChange={handleChange('individual_social_link')}
                          placeholder="https://facebook.com/..."
                          required
                        />
                        <p className="mt-1.5 text-xs text-slate-400">
                          Link Facebook, Fanpage hoặc LinkedIn chính chủ của bạn.
                        </p>
                      </div>

                      <div>
                        <Field
                          label="Minh chứng sự kiện / Portfolio (Tùy chọn)"
                          value={form.individual_portfolio_url}
                          onChange={handleChange('individual_portfolio_url')}
                          placeholder="https://drive.google.com/..."
                        />
                        <p className="mt-1.5 text-xs text-slate-400">
                          Link hình ảnh, bài viết hoặc video các sự kiện đã từng tham gia tổ chức.
                        </p>
                      </div>
                    </div>
                  </FormSection>

                  <FormSection
                    title="Ảnh chân dung"
                    description="Tải ảnh chân dung rõ mặt để đối chiếu với thông tin khai báo."
                  >
                    <div className="max-w-xs">
                      <FileField
                        label="Ảnh chân dung / Selfie"
                        required
                        imageOnly
                        file={selectedDocuments.individual_selfie_url}
                        existingUrl={form.individual_selfie_url}
                        onChange={handleDocumentChange('individual_selfie_url')}
                      />
                    </div>
                  </FormSection>
                </>
              )}

              <FormSection
                title="Mô tả hoạt động"
                description="Tóm tắt kinh nghiệm tổ chức, loại sự kiện dự kiến và phạm vi hoạt động."
              >
                <label className="block">
                  <span className="text-sm font-semibold text-muted">
                    Mô tả
                    <RequiredMark />
                  </span>
                  <textarea
                    className="cosmic-input min-h-32 w-full mt-2"
                    value={form.organization_description}
                    onChange={handleChange('organization_description')}
                    placeholder={
                      form.request_type === 'ORGANIZATION'
                        ? 'Giới thiệu ngắn về tổ chức, lĩnh vực hoạt động, quy mô...'
                        : 'Giới thiệu kinh nghiệm tổ chức sự kiện, loại sự kiện dự kiến triển khai...'
                    }
                    required
                    minLength={10}
                  />
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.terms_accepted}
                    onChange={handleCheckboxChange('terms_accepted')}
                    className="mt-1 size-4 shrink-0 accent-orange-500"
                    required
                  />
                  <span className="text-sm leading-6 text-muted">
                    Tôi xác nhận thông tin cung cấp là chính xác và đồng ý với{' '}
                    <PolicyLink to="/policies?policy_type=ORGANIZER_TERMS">
                      Điều khoản dịch vụ dành cho Nhà tổ chức
                    </PolicyLink>
                    ,{' '}
                    <PolicyLink to="/policies?policy_type=EVENT_CREATION_REVIEW">
                      quy chế sự kiện
                    </PolicyLink>
                    ,{' '}
                    <PolicyLink to="/policies?policy_type=TICKET_BOOKING">
                      quy chế bán vé
                    </PolicyLink>
                    {' '}và{' '}
                    <PolicyLink to="/policies?policy_type=REFUND">
                      chính sách hoàn tiền
                    </PolicyLink>
                    {' '}của EventHub.
                    <RequiredMark />
                  </span>
                </label>
              </FormSection>



              <div className="flex flex-wrap justify-end gap-4 mt-8">
                {editingRequest && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-8 py-3.5 font-bold text-white transition-all hover:bg-white/10 hover:border-white/20"
                  >
                    Hủy chỉnh sửa
                  </button>
                )}
                <button
                  type="submit"
                  disabled={requestMutation.isPending || isUploading}
                  className="btn-gold-primary px-8 py-3.5 text-[15px] flex items-center gap-2 font-bold cursor-pointer transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(201,154,71,0.6)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)', color: '#0D1B2A' }}
                >
                  {(requestMutation.isPending || isUploading) && (
                    <Loader2 className="size-5 animate-spin" />
                  )}
                  {isUploading
                    ? 'Đang tải tài liệu...'
                    : requestMutation.isPending
                      ? 'Đang lưu...'
                      : editingRequest
                        ? 'Cập nhật yêu cầu'
                        : 'Gửi yêu cầu'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside>
          {requestQuery.isError ? (
            <div className="rounded-lg border border-error/30 bg-error/10 p-5 text-sm text-error">
              Không thể tải yêu cầu từ máy chủ. Vui lòng thử lại sau.
            </div>
          ) : (
            <StatusSummary requests={requests} onEdit={handleEditRequest} />
          )}
        </aside>
      </div>
    </div>
  )
}

function FormSection({ title, description, children }) {
  return (
    <section className="space-y-6 border-t-2 border-dashed border-white/10 pt-8 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-display text-lg font-extrabold text-content">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-subtle">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </section>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-muted">
        {label}
        {required && <RequiredMark />}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="cosmic-input w-full mt-2"
      />
    </label>
  )
}

function FileField({ label, file, existingUrl = '', onChange, required = false, imageOnly = false }) {
  return (
    <label className="glass-panel flex min-h-64 flex-col justify-between rounded-[24px] border-white/10 p-6 shadow-inner">
      <span className="block min-h-12 text-sm font-semibold leading-6 text-muted">
        {label}
        {required && <RequiredMark />}
      </span>
      <DocumentPreview file={file} existingUrl={existingUrl} imageOnly={imageOnly} />
      <div>
        <span className="inline-flex cursor-pointer rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white/20">
          Chọn file
          <input
            type="file"
            accept={imageOnly ? 'image/jpeg,image/png,image/webp' : '.pdf,.docx,image/*'}
            className="hidden"
            onChange={onChange}
          />
        </span>
        <span className="mt-3 block truncate text-xs text-subtle">
          {file
            ? file.name
            : existingUrl
              ? 'Đã có tài liệu. Chọn file mới để thay thế.'
              : imageOnly
                ? 'Ảnh JPG/PNG/WEBP'
                : 'PDF, DOCX hoặc ảnh JPG/PNG/WEBP'}
        </span>
      </div>
    </label>
  )
}

function DocumentPreview({ file, existingUrl = '', imageOnly = false }) {
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (!file || !file.type?.startsWith('image/')) {
      setPreviewUrl('')
      return undefined
    }

    const nextUrl = URL.createObjectURL(file)
    setPreviewUrl(nextUrl)

    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  if (!file) {
    if (existingUrl) {
      if (isImageUrl(existingUrl)) {
        return (
          <img
            src={existingUrl}
            alt="Tài liệu đã tải"
            className="my-4 h-32 w-full rounded-2xl border border-white/10 object-cover shadow-[0_0_15px_rgba(255,255,255,0.05)]"
          />
        )
      }

      return (
        <div className="my-4 grid h-32 place-items-center rounded-2xl border border-white/10 bg-slate-900/50 px-3 text-center text-xs font-semibold text-slate-400 shadow-inner">
          Đã có tài liệu
        </div>
      )
    }

    return (
      <div className="my-4 grid h-32 place-items-center rounded-2xl border-2 border-dashed border-white/10 bg-slate-900/50 text-xs font-medium text-slate-500 shadow-inner">
        Chưa chọn file
      </div>
    )
  }

  if (!previewUrl) {
    return (
      <div className="my-4 grid h-32 place-items-center rounded-2xl border border-white/10 bg-slate-900/50 px-3 text-center text-xs font-semibold text-slate-400 shadow-inner">
        {file.name}
      </div>
    )
  }

  return (
    <img
      src={previewUrl}
      alt={file.name}
      className="my-4 h-32 w-full rounded-2xl border border-white/10 object-cover shadow-[0_0_15px_rgba(255,255,255,0.05)]"
    />
  )
}

function RequiredMark() {
  return <span className="text-error"> *</span>
}

function isImageUrl(url = '') {
  return (
    /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(url) ||
    /\/image\/upload\//i.test(url)
  )
}

function PolicyLink({ to, children }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-tertiary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}
