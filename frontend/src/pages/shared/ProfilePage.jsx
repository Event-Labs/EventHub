import { clearAuthSession, getAuthToken, getStoredUserKey, getUserRoles, updateStoredUser } from '@/lib/auth.js'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CalendarCheck2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  History,
  IdCard,
  ImageIcon,
  InfoIcon,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  Ticket,
  UserCircle,
  Users,
  X,
} from 'lucide-react'
import {
  getProfile,
  updateProfile,
  changePassword,
  getSecurityStatus,
  checkSecurity,
  startTwoFactor,
  verifyTwoFactor,
} from '@/services/user.service.js'
import { uploadAvatar, uploadOrganizerDocument } from '@/services/uploads.js'
import { fetchOrganizerProfile, updateOrganizerProfile } from '@/services/organizerEvents.js'
import { submitOrganizerProfileUpdateRequest } from '@/services/organizerRequests.js'
import { fetchMyTickets } from '@/services/tickets.js'
import { ProfileAvatar } from '@/pages/shared/ProfileAvatar.jsx'
import { Modal } from '@/components/Modal.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const EMPTY_TEXT = 'Chưa cập nhật'

export function ProfilePage() {
  const [mode, setMode] = useState('view')
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const currentUserKey = getStoredUserKey()

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['profile', currentUserKey],
    queryFn: async () => {
      const token = getAuthToken()
      if (!token) {
        throw { response: { status: 401 }, message: 'Vui lòng đăng nhập để xem hồ sơ.' }
      }
      return getProfile()
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const roles = getUserRoles(user)
  const isOrganizerProfileRoute = pathname.startsWith('/organizer')
  const isOrganizer = isOrganizerProfileRoute && roles.includes('organizer')
  const organizerQuery = useQuery({
    queryKey: ['organizer-profile', currentUserKey],
    queryFn: fetchOrganizerProfile,
    enabled: Boolean(user && isOrganizer),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const customerTicketsQuery = useQuery({
    queryKey: ['my-tickets', 'profile-summary', currentUserKey],
    queryFn: () => fetchMyTickets('ALL'),
    enabled: Boolean(user && !isOrganizer),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="animate-pulse text-muted">Đang tải thông tin hồ sơ...</p>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-error/10">
          <AlertCircle className="size-10 text-error" />
        </div>
        <h2 className="font-display text-2xl font-bold text-content">
          {error?.response?.status === 401 ? 'Phiên làm việc hết hạn' : 'Đã có lỗi xảy ra'}
        </h2>
        <p className="mt-3 text-muted">
          {error?.response?.data?.message || error?.message || 'Không thể tải thông tin hồ sơ của bạn.'}
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['profile'] })}
            className="admin-secondary px-6 py-2 text-content hover:bg-panel-soft"
          >
            Thử lại
          </button>
          {error?.response?.status === 401 && (
            <a href="/login" className="rounded-md bg-primary px-6 py-2 font-bold text-white transition hover:bg-primary/90">
              Đăng nhập ngay
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`mx-auto px-4 py-10 sm:px-6 lg:px-8 ${isOrganizer ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold text-content">
            {isOrganizer ? 'Hồ sơ nhà tổ chức' : 'Hồ sơ cá nhân'}
          </h1>
          <p className="mt-2 text-muted">
            {isOrganizer
              ? 'Xem lại toàn bộ thông tin đã gửi khi đăng ký làm nhà tổ chức.'
              : 'Thông tin tài khoản, bảo mật và lịch sử sử dụng EventHub.'}
          </p>
        </div>
        {isOrganizer && (
          <div className="flex flex-wrap gap-3">
            {mode !== 'edit' && (
              <button
                onClick={() => setMode('edit')}
                className="inline-flex items-center gap-2 rounded-md border border-sky-300/40 bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-3 font-bold text-white shadow-lg shadow-sky-900/20 transition-all hover:-translate-y-0.5 hover:from-sky-400 hover:to-indigo-500"
              >
                <Pencil className="size-4" />
                Chỉnh sửa hồ sơ
              </button>
            )}
            <button
              onClick={() => setMode('password')}
              className={`inline-flex items-center gap-2 rounded-md border px-5 py-3 font-bold transition-all ${
                mode === 'password'
                  ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                  : 'border-border-soft bg-surface/40 text-content hover:border-primary/50 hover:bg-panel-soft hover:text-primary'
              }`}
            >
              <Lock className="inline size-4" />
              Đổi mật khẩu
            </button>
          </div>
        )}
      </div>

      {isOrganizer && (
        <OrganizerProfileView
          user={user}
          organizer={organizerQuery.data}
          isLoading={organizerQuery.isLoading}
          error={organizerQuery.error}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['organizer-profile'] })}
        />
      )}
      {!isOrganizer && (
        <ProfileView
          user={user}
          tickets={customerTicketsQuery.data || []}
          ticketsLoading={customerTicketsQuery.isLoading}
          onEdit={() => setMode('edit')}
          onChangePassword={() => setMode('password')}
        />
      )}
      {false && mode === 'edit' && isOrganizer && organizerQuery.isLoading && (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-border-soft/50 bg-surface p-6 shadow-sm">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted">Đang tải thông tin chỉnh sửa...</p>
        </div>
      )}
      {false && mode === 'edit' && (!isOrganizer || !organizerQuery.isLoading) && (
        <ProfileEdit
          user={user}
          organizer={organizerQuery.data}
          isOrganizer={isOrganizer}
          onDone={() => {
            setMode('view')
            queryClient.invalidateQueries({ queryKey: ['profile'] })
            queryClient.invalidateQueries({ queryKey: ['organizer-profile'] })
          }}
        />
      )}
      {false && mode === 'password' && <ChangePassword user={user} onDone={() => setMode('view')} />}

      <Modal open={mode === 'edit'} title="Chỉnh sửa hồ sơ" onClose={() => setMode('view')} maxWidth="max-w-5xl">
        {isOrganizer && organizerQuery.isLoading ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-muted">Đang tải thông tin chỉnh sửa...</p>
          </div>
        ) : (
          <ProfileEdit
            user={user}
            organizer={organizerQuery.data}
            isOrganizer={isOrganizer}
            onDone={() => {
              setMode('view')
              queryClient.invalidateQueries({ queryKey: ['profile'] })
              queryClient.invalidateQueries({ queryKey: ['organizer-profile'] })
            }}
          />
        )}
      </Modal>

      <Modal open={mode === 'password'} title="Đổi mật khẩu" onClose={() => setMode('view')} maxWidth="max-w-2xl">
        <ChangePassword user={user} onDone={() => setMode('view')} />
      </Modal>
    </div>
  )
}

function OrganizerProfileView({ user, organizer, isLoading, error, onRetry }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [openSections, setOpenSections] = useState(() => new Set())
  const [verificationModalOpen, setVerificationModalOpen] = useState(false)
  const profileUpdateMutation = useMutation({
    mutationFn: submitOrganizerProfileUpdateRequest,
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu cập nhật hồ sơ xác minh. Vui lòng chờ admin duyệt.')
      setVerificationModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['organizer-profile'] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể gửi yêu cầu cập nhật hồ sơ xác minh.'))
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-border-soft/50 bg-surface p-6 shadow-sm">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-muted">Đang tải thông tin nhà tổ chức...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border-soft/50 bg-surface p-6 text-center shadow-sm">
        <AlertCircle className="mx-auto size-10 text-error" />
        <h2 className="mt-3 font-display text-2xl font-bold text-content">Không thể tải hồ sơ nhà tổ chức</h2>
        <p className="mt-2 text-muted">{error?.response?.data?.message || 'Vui lòng thử lại sau.'}</p>
        <button onClick={onRetry} className="mt-5 rounded-md bg-primary px-5 py-3 font-bold text-white transition hover:bg-primary/90">
          Tải lại
        </button>
      </div>
    )
  }

  const history = Array.isArray(organizer?.request_history) ? organizer.request_history : []
  const request = organizer?.source_request || history[history.length - 1] || {}
  const type = normalizeOrganizerType(firstValue(request.request_type, organizer?.request_type))
  const isPersonal = type === 'personal'
  const displayName = firstValue(
    request.organization_name,
    organizer?.organization_name,
    isPersonal ? request.individual_full_name : '',
    user.full_name,
  )
  const avatarUrl = firstValue(request.organization_avatar_url, organizer?.organization_avatar_url, user.avatar_url)
  const phone = firstValue(request.business_phone, organizer?.business_phone, user.phone)
  const businessEmail = firstValue(request.business_email, organizer?.business_email)
  const description = firstValue(organizer?.description, request.organization_description, user.bio)
  const address = formatProfileAddress(user, organizer)
  const pendingProfileUpdate = history.find(
    (item) =>
      String(item.request_action || '').toUpperCase() === 'PROFILE_UPDATE' &&
      String(item.status || '').toUpperCase() === 'PENDING',
  )
  const toggleSection = (sectionId) => {
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  return (
    <div className="space-y-3">
      <section className="organizer-profile-hero relative overflow-hidden rounded-lg border p-5 text-white sm:p-7">
        <div className="organizer-profile-hero-bg absolute inset-0" />
        <div className="organizer-profile-hero-wave absolute inset-0" />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center">
          <ProfileAvatar
            sources={[avatarUrl, user.avatar_url]}
            name={displayName}
            alt={displayName || 'Ảnh đại diện nhà tổ chức'}
            className="organizer-profile-avatar size-28 text-5xl sm:size-32"
            fallbackClassName="bg-gradient-to-br from-fuchsia-500 to-purple-700 text-white ring-4 ring-sky-400/25"
          />

          <div className="min-w-0 flex-1">
            <h2 className="organizer-profile-title break-words font-display text-3xl font-extrabold sm:text-4xl">
              {valueOrEmpty(displayName)}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusPill status={request.status || organizer?.status} />
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-2">
        <AccountSecurityPanel user={user} />

        <AccordionSection
          id="overview"
          title="Thông tin tổng quan"
          icon={InfoIcon}
          isOpen={openSections.has('overview')}
          onToggle={toggleSection}
        >
          <div className="organizer-info-grid organizer-info-grid-3">
            <Info icon={isPersonal ? UserCircle : Building2} label="Tên cá nhân/tổ chức" value={displayName} />
            <Info icon={Users} label="Loại nhà tổ chức" value={organizerTypeLabel(type)} />
            <Info icon={ShieldCheck} label="Trạng thái xác minh" value={requestStatusLabel(request.status || organizer?.status)} />
          </div>
          <div className="organizer-info-description border-t">
            <Info icon={FileText} label="Mô tả/giới thiệu" value={description} multiline />
          </div>
        </AccordionSection>

        <AccordionSection
          id="public"
          title="Thông tin liên hệ"
          icon={Phone}
          isOpen={openSections.has('public')}
          onToggle={toggleSection}
        >
          <div className="organizer-info-grid organizer-info-grid-3">
            <Info icon={Mail} label="Email" value={firstValue(businessEmail, user.email)} linkType="email" />
            <Info icon={Phone} label="Số điện thoại" value={phone} />
            <Info icon={MapPin} label="Địa chỉ" value={address} />
            <Info icon={ImageIcon} label="Trang web/mạng xã hội" value={firstValue(organizer?.website_url, organizer?.social_url)} linkType="url" />
          </div>
        </AccordionSection>

        <AccordionSection
          id="legal"
          title="Thông tin pháp lý và xác minh"
          icon={IdCard}
          isOpen={openSections.has('legal')}
          onToggle={toggleSection}
        >
          <VerificationUpdateHeader
            pending={pendingProfileUpdate}
            onOpen={() => setVerificationModalOpen(true)}
          />
          <div className="organizer-info-grid organizer-info-grid-3">
            {isPersonal ? (
              <>
                <Info icon={UserCircle} label="Họ tên pháp lý" value={organizer?.individual_full_name} />
                <Info icon={IdCard} label="Số CCCD/Hộ chiếu" value={organizer?.individual_identity_number} />
                <Info icon={IdCard} label="Mã số thuế cá nhân" value={organizer?.individual_tax_code} />
              </>
            ) : (
              <>
                <Info icon={UserCircle} label="Người đại diện pháp luật" value={organizer?.legal_representative_name} />
                <Info icon={BriefcaseBusiness} label="Chức vụ người đại diện" value={organizer?.legal_representative_position} />
                <Info icon={IdCard} label="Mã số thuế" value={organizer?.tax_code} />
              </>
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          id="documents"
          title="Hồ sơ xác minh"
          icon={FileCheck2}
          isOpen={openSections.has('documents')}
          onToggle={toggleSection}
        >
          <VerificationUpdateHeader
            pending={pendingProfileUpdate}
            onOpen={() => setVerificationModalOpen(true)}
          />
          <div className="organizer-document-list">
            {isPersonal ? (
              <>
                <DocumentCard label="Ảnh CCCD mặt trước" url={organizer?.individual_id_front_url} uploadedAt={organizer?.updated_at || request.created_at} />
                <DocumentCard label="Ảnh CCCD mặt sau" url={organizer?.individual_id_back_url} uploadedAt={organizer?.updated_at || request.created_at} />
                <DocumentCard label="Ảnh chân dung/tự chụp" url={organizer?.individual_selfie_url} uploadedAt={organizer?.updated_at || request.created_at} />
              </>
            ) : (
              <>
                <DocumentCard label="Giấy ĐKDN/ERC" url={organizer?.legal_document_url} uploadedAt={organizer?.updated_at || request.created_at} />
                <DocumentCard label="Giấy phép kinh doanh đặc thù" url={organizer?.business_license_url} uploadedAt={organizer?.updated_at || request.created_at} />
                <DocumentCard label="Giấy tờ tùy thân người đại diện" url={organizer?.legal_representative_id_url} uploadedAt={organizer?.updated_at || request.created_at} />
                <DocumentCard label="Giấy ủy quyền" url={organizer?.authorization_letter_url} uploadedAt={organizer?.updated_at || request.created_at} />
              </>
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          id="commitment"
          title="Cam kết và điều khoản"
          icon={CheckCircle2}
          isOpen={openSections.has('commitment')}
          onToggle={toggleSection}
        >
          <div className="organizer-info-grid organizer-info-grid-3">
            <Info icon={CheckCircle2} label="Trạng thái cam kết pháp lý/điều khoản" value={booleanLabel(firstDefined(request.terms_accepted, organizer?.terms_accepted))} />
            <Info icon={Clock} label="Thời gian gửi yêu cầu" value={formatDateTime(request.created_at)} />
            <Info
              icon={ShieldCheck}
              label="Xác thực email tổ chức"
              value={emailVerificationLabel(request.business_email_verified, request.business_email_verified_at)}
            />
            <Info
              icon={FileCheck2}
              label="Nội dung cam kết"
              value="Nhà tổ chức đã xác nhận thông tin cung cấp là chính xác và đồng ý với điều khoản dịch vụ dành cho nhà tổ chức, quy chế sự kiện, quy chế bán vé và chính sách hoàn tiền của EventHub."
              className="md:col-span-2"
              multiline
            />
          </div>
        </AccordionSection>

        <AccordionSection
          id="history"
          title="Lịch sử xét duyệt"
          icon={History}
          isOpen={openSections.has('history')}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            {history.length ? (
              history.map((item, index) => <ReviewHistoryCard key={item.id || index} request={item} index={index} />)
            ) : (
              <div className="organizer-history-card rounded-lg border p-4 text-sm font-semibold">
                <span className="organizer-info-empty">Chưa cập nhật</span>
              </div>
            )}
          </div>
        </AccordionSection>
      </div>

      <Modal
        open={verificationModalOpen}
        title="Yêu cầu cập nhật hồ sơ xác minh"
        onClose={() => setVerificationModalOpen(false)}
        maxWidth="max-w-4xl"
      >
        <OrganizerVerificationUpdateForm
          organizer={organizer}
          request={request}
          isPersonal={isPersonal}
          pending={pendingProfileUpdate}
          isSubmitting={profileUpdateMutation.isPending}
          onCancel={() => setVerificationModalOpen(false)}
          onSubmit={(payload) => profileUpdateMutation.mutate(payload)}
        />
      </Modal>
    </div>
  )
}

function VerificationUpdateHeader({ pending, onOpen }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border-soft/40 bg-panel-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-content">
          {pending ? 'Yêu cầu cập nhật đang chờ admin duyệt' : 'Thông tin này chỉ thay đổi sau khi admin duyệt'}
        </p>
        <p className="mt-1 text-sm text-subtle">
          {pending
            ? `Nội dung chờ duyệt: ${valueOrEmpty(pending.change_summary)}`
            : 'Bạn có thể gửi yêu cầu cập nhật hồ sơ pháp lý và hồ sơ xác minh tại đây.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={Boolean(pending)}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-300/40 bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-900/20 transition-all hover:-translate-y-0.5 hover:from-sky-400 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        <Pencil className="size-4" />
        Yêu cầu cập nhật
      </button>
    </div>
  )
}

function OrganizerVerificationUpdateForm({
  organizer,
  request,
  isPersonal,
  pending,
  isSubmitting,
  onCancel,
  onSubmit,
}) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({
    individual_full_name: firstValue(organizer?.individual_full_name, request?.individual_full_name, ''),
    individual_identity_number: firstValue(organizer?.individual_identity_number, request?.individual_identity_number, ''),
    individual_tax_code: firstValue(organizer?.individual_tax_code, request?.individual_tax_code, ''),
    individual_id_front_url: firstValue(organizer?.individual_id_front_url, request?.individual_id_front_url, ''),
    individual_id_back_url: firstValue(organizer?.individual_id_back_url, request?.individual_id_back_url, ''),
    individual_selfie_url: firstValue(organizer?.individual_selfie_url, request?.individual_selfie_url, ''),
    legal_representative_name: firstValue(organizer?.legal_representative_name, request?.legal_representative_name, ''),
    legal_representative_position: firstValue(organizer?.legal_representative_position, request?.legal_representative_position, ''),
    tax_code: firstValue(organizer?.tax_code, request?.tax_code, ''),
    legal_document_url: firstValue(organizer?.legal_document_url, request?.legal_document_url, ''),
    business_license_url: firstValue(organizer?.business_license_url, request?.business_license_url, ''),
    legal_representative_id_url: firstValue(organizer?.legal_representative_id_url, request?.legal_representative_id_url, ''),
    authorization_letter_url: firstValue(organizer?.authorization_letter_url, request?.authorization_letter_url, ''),
  }))
  const [selectedDocuments, setSelectedDocuments] = useState({})
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateDocument = (field, file) => {
    setSelectedDocuments((current) => ({ ...current, [field]: file || null }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const requestType = isPersonal ? 'INDIVIDUAL' : 'ORGANIZATION'
    const fields = isPersonal
      ? [
          'individual_full_name',
          'individual_identity_number',
          'individual_tax_code',
          'individual_id_front_url',
          'individual_id_back_url',
          'individual_selfie_url',
        ]
      : [
          'legal_representative_name',
          'legal_representative_position',
          'tax_code',
          'legal_document_url',
          'business_license_url',
          'legal_representative_id_url',
          'authorization_letter_url',
        ]

    const imageOnlyFields = new Set([
      'individual_id_front_url',
      'individual_id_back_url',
      'individual_selfie_url',
      'legal_representative_id_url',
    ])

    try {
      setIsUploadingDocuments(true)
      const documentUrls = {}

      for (const field of fields) {
        const selectedFile = selectedDocuments[field]
        if (selectedFile) {
          const uploaded = await uploadOrganizerDocument(selectedFile, {
            imageOnly: imageOnlyFields.has(field),
          })
          documentUrls[field] = uploaded.secure_url || uploaded.url
        } else {
          documentUrls[field] = String(form[field] || '').trim()
        }
      }

      onSubmit({
        request_type: requestType,
        ...documentUrls,
      })
    } catch (err) {
      toast.error(err.message || 'Không thể tải hồ sơ xác minh lên Cloudinary.')
    } finally {
      setIsUploadingDocuments(false)
    }
  }

  if (pending) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-5 text-content">
        <p className="font-bold">Bạn đã có yêu cầu cập nhật đang chờ duyệt.</p>
        <p className="mt-2 text-sm text-subtle">Nội dung chờ duyệt: {valueOrEmpty(pending.change_summary)}</p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onCancel} className="admin-secondary px-5 py-3 text-content hover:bg-panel-soft">
            Đóng
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-content">
      <div className="rounded-lg border border-border-soft/50 bg-panel-soft p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <IdCard className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-content">Thông tin pháp lý</h3>
            <p className="mt-1 text-sm text-subtle">Thông tin mới sẽ được gửi cho admin duyệt trước khi trở thành chính thức.</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {isPersonal ? (
            <>
              <Input label="Họ tên pháp lý" value={form.individual_full_name} onChange={(event) => updateField('individual_full_name', event.target.value)} />
              <Input label="Số CCCD/Hộ chiếu" value={form.individual_identity_number} onChange={(event) => updateField('individual_identity_number', event.target.value)} />
              <Input label="Mã số thuế cá nhân" value={form.individual_tax_code} onChange={(event) => updateField('individual_tax_code', event.target.value)} />
            </>
          ) : (
            <>
              <Input label="Người đại diện pháp luật" value={form.legal_representative_name} onChange={(event) => updateField('legal_representative_name', event.target.value)} />
              <Input label="Chức vụ người đại diện" value={form.legal_representative_position} onChange={(event) => updateField('legal_representative_position', event.target.value)} />
              <Input label="Mã số thuế" value={form.tax_code} onChange={(event) => updateField('tax_code', event.target.value)} />
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border-soft/50 bg-panel-soft p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileCheck2 className="size-5" />
          </span>
          <h3 className="font-display text-xl font-bold text-content">Hồ sơ xác minh</h3>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {isPersonal ? (
            <>
              <DocumentUploadInput label="Ảnh CCCD mặt trước" file={selectedDocuments.individual_id_front_url} existingUrl={form.individual_id_front_url} imageOnly onChange={(file) => updateDocument('individual_id_front_url', file)} />
              <DocumentUploadInput label="Ảnh CCCD mặt sau" file={selectedDocuments.individual_id_back_url} existingUrl={form.individual_id_back_url} imageOnly onChange={(file) => updateDocument('individual_id_back_url', file)} />
              <DocumentUploadInput label="Ảnh chân dung/tự chụp" file={selectedDocuments.individual_selfie_url} existingUrl={form.individual_selfie_url} imageOnly onChange={(file) => updateDocument('individual_selfie_url', file)} />
            </>
          ) : (
            <>
              <DocumentUploadInput label="Giấy ĐKDN/ERC" file={selectedDocuments.legal_document_url} existingUrl={form.legal_document_url} onChange={(file) => updateDocument('legal_document_url', file)} />
              <DocumentUploadInput label="Giấy phép kinh doanh đặc thù" file={selectedDocuments.business_license_url} existingUrl={form.business_license_url} onChange={(file) => updateDocument('business_license_url', file)} />
              <DocumentUploadInput label="Giấy tờ tùy thân người đại diện" file={selectedDocuments.legal_representative_id_url} existingUrl={form.legal_representative_id_url} imageOnly onChange={(file) => updateDocument('legal_representative_id_url', file)} />
              <DocumentUploadInput label="Giấy ủy quyền" file={selectedDocuments.authorization_letter_url} existingUrl={form.authorization_letter_url} onChange={(file) => updateDocument('authorization_letter_url', file)} />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="admin-secondary px-5 py-3 text-content hover:bg-panel-soft" disabled={isSubmitting || isUploadingDocuments}>
          Hủy
        </button>
        <button type="submit" disabled={isSubmitting || isUploadingDocuments} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70">
          {isSubmitting || isUploadingDocuments ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {isUploadingDocuments ? 'Đang tải file...' : isSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu duyệt'}
        </button>
      </div>
    </form>
  )
}

function DocumentUploadInput({ label, file, existingUrl, imageOnly = false, onChange }) {
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return undefined
    }

    if (!file.type.startsWith('image/')) {
      setPreviewUrl('')
      return undefined
    }

    const nextUrl = URL.createObjectURL(file)
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  const preview = previewUrl || (isImageUrl(existingUrl) ? existingUrl : '')
  const hasExisting = Boolean(existingUrl)

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="rounded-lg border border-border-soft/50 bg-surface p-3">
        {preview ? (
          <img src={preview} alt={file?.name || label} className="mb-3 h-40 w-full rounded-md border border-border-soft/50 object-cover" />
        ) : (
          <div className="mb-3 grid h-40 place-items-center rounded-md border border-dashed border-border-soft/60 bg-panel-soft px-3 text-center text-sm font-semibold text-subtle">
            {file?.name || (hasExisting ? 'Đã có file hồ sơ' : 'Chưa chọn file')}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="file"
            accept={imageOnly ? 'image/png,image/jpeg,image/webp' : '.pdf,.docx,image/png,image/jpeg,image/webp'}
            onChange={(event) => onChange(event.target.files?.[0] || null)}
            className="block min-w-0 flex-1 text-sm text-subtle file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-primary/90"
          />
          {file && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-md border border-border-soft/50 px-3 py-2 text-sm font-bold text-content transition hover:bg-panel-soft"
            >
              Bỏ chọn
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-subtle">
          {imageOnly ? 'Chọn ảnh JPG, PNG hoặc WEBP.' : 'Chọn PDF, DOCX hoặc ảnh JPG/PNG/WEBP.'}
        </p>
      </div>
    </label>
  )
}

function AccordionSection({ id, title, icon: Icon, isOpen, onToggle, children }) {
  return (
    <section className="organizer-profile-panel overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="organizer-panel-trigger flex w-full items-center gap-3 px-5 py-4 text-left transition"
      >
        <span className="organizer-section-icon grid size-9 shrink-0 place-items-center rounded-full">
          <Icon className="size-5" />
        </span>
        <span className="organizer-panel-title min-w-0 flex-1 font-display text-lg font-extrabold">{title}</span>
        <ChevronDown className={`organizer-panel-chevron size-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="organizer-panel-body border-t p-5">
          {children}
        </div>
      )}
    </section>
  )
}

function ProfileView({ user, tickets = [], ticketsLoading = false, onEdit, onChangePassword }) {
  const ticketList = Array.isArray(tickets) ? tickets : []
  const eventIds = new Set(
    ticketList
      .map((ticket) => ticket?.event?.id || ticket?.event_id)
      .filter(Boolean)
      .map(String),
  )
  const displayName = valueOrEmpty(user.full_name)
  const joinedDate = formatDate(user.created_at || user.createdAt)
  const roleText = roleLabel(user.roles)
  const accountActive = user.status ? String(user.status).toUpperCase() !== 'LOCKED' : true
  const accountStatusLabel = accountActive ? 'Hoạt động' : 'Bị khóa'
  const accountStatusTone = accountActive ? 'text-success' : 'text-error'

  return (
    <div className="space-y-5">
      <section className="customer-profile-hero relative overflow-hidden rounded-lg border p-6 text-content sm:p-8">
        <div className="customer-profile-hero-bg absolute inset-0" />
        <div className="customer-profile-hero-wave absolute inset-0" />
        <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="relative mx-auto size-36 shrink-0 sm:mx-0 sm:size-40">
              <ProfileAvatar
                sources={user.avatar_url}
                name={user.full_name || user.email || 'Khách hàng'}
                alt="Ảnh đại diện khách hàng"
                className="size-full ring-4 ring-sky-300/25"
                fallbackClassName="bg-gradient-to-br from-fuchsia-600 to-purple-700 text-6xl text-white ring-sky-300/25"
                fallback="KH"
              />
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <h2 className="customer-profile-title break-words font-display text-3xl font-extrabold sm:text-4xl">
                {displayName}
              </h2>
              <span className="customer-role-badge mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold ring-1">
                <UserCircle className="size-4" />
                {roleText}
              </span>
              <div className="customer-profile-meta mt-4 space-y-2 text-sm font-medium">
                <div className="flex items-center justify-center gap-3 sm:justify-start">
                  <Calendar className="size-4" />
                  <span>Tham gia ngày {joinedDate}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="customer-profile-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-6 py-3 font-bold transition"
            >
              <Pencil className="size-5" />
              Chỉnh sửa hồ sơ
            </button>
            <button
              type="button"
              onClick={onChangePassword}
              className="customer-profile-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-6 py-3 font-bold transition"
            >
              <Lock className="size-5" />
              Đổi mật khẩu
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="customer-profile-panel rounded-lg border p-6 text-content">
          <div className="mb-7 flex items-center gap-3">
            <UserCircle className="customer-section-heading-icon size-7" />
            <h2 className="customer-panel-title font-display text-xl font-extrabold">Tài khoản của tôi</h2>
          </div>
          <div className="space-y-0">
            <ProfileMetric icon={ShieldCheck} label="Trạng thái tài khoản" value={accountStatusLabel} valueClassName={accountStatusTone} />
            <ProfileMetric
              icon={Ticket}
              label="Tổng số vé đã đặt"
              value={ticketsLoading ? 'Đang tải' : ticketList.length}
              valueClassName="text-primary"
            />
            <ProfileMetric
              icon={CalendarCheck2}
              label="Số sự kiện đã tham gia"
              value={ticketsLoading ? 'Đang tải' : eventIds.size}
              valueClassName="text-primary"
              last
            />
          </div>
        </aside>

        <div className="space-y-4">
          <CustomerInfoSection title="Thông tin cơ bản" icon={UserCircle} tone="blue">
            <CustomerInfoCard icon={Calendar} label="Họ và tên" value={user.full_name} />
            <CustomerInfoCard icon={Calendar} label="Ngày sinh" value={formatDate(user.dob)} />
          </CustomerInfoSection>

          <CustomerInfoSection title="Thông tin liên hệ" icon={Phone} tone="purple">
            <CustomerInfoCard icon={Phone} label="Số điện thoại" value={user.phone} />
            <CustomerInfoCard icon={Mail} label="Email" value={user.email} linkType="email" />
            <CustomerInfoCard icon={MapPin} label="Địa chỉ" value={user.address} className="md:col-span-2" />
          </CustomerInfoSection>

          <AccountSecurityPanel user={user} />
        </div>
      </div>
    </div>
  )
}

function ProfileMetric({ icon: Icon, label, value, valueClassName = 'text-content', last = false }) {
  return (
    <div className={`customer-profile-metric flex gap-5 py-5 ${last ? '' : 'border-b'}`}>
      <Icon className="customer-profile-metric-icon mt-1 size-8 shrink-0" />
      <div className="min-w-0">
        <p className="customer-profile-label text-sm font-medium">{label}</p>
        <p className={`mt-1 break-words text-lg font-extrabold ${valueClassName}`}>{valueOrEmpty(value)}</p>
      </div>
    </div>
  )
}

function CustomerInfoSection({ title, icon: Icon, tone = 'blue', children }) {
  const toneClass = {
    blue: 'customer-tone-blue',
    purple: 'customer-tone-purple',
    green: 'customer-tone-green',
  }[tone]

  return (
    <section className="customer-profile-panel rounded-lg border p-5 text-content">
      <div className="mb-5 flex items-center gap-3">
        <span className={`customer-section-icon grid size-10 place-items-center rounded-md ${toneClass}`}>
          <Icon className="size-5" />
        </span>
        <h2 className="customer-panel-title font-display text-xl font-extrabold">{title}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function CustomerInfoCard({ icon: Icon, label, value, className = '', linkType, valueClassName = 'customer-info-value' }) {
  const displayValue = valueOrEmpty(value)
  const isEmpty = displayValue === EMPTY_TEXT
  const href = !isEmpty && linkType === 'email' ? `mailto:${displayValue}` : null

  return (
    <div className={`customer-info-card flex min-h-16 items-center gap-4 rounded-lg border p-3 ${className}`}>
      <span className="customer-info-card-icon grid size-11 shrink-0 place-items-center rounded-md">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="customer-profile-label text-sm font-medium">{label}</p>
        {href ? (
          <a href={href} className={`mt-1 block break-words font-extrabold ${valueClassName} hover:text-primary`}>
            {displayValue}
          </a>
        ) : (
          <p className={`mt-1 break-words font-extrabold ${isEmpty ? 'text-slate-500' : valueClassName}`}>
            {displayValue}
          </p>
        )}
      </div>
    </div>
  )
}

function AccountSecurityPanel({ user }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const userKey = getStoredUserKey(user)
  const [otpFlow, setOtpFlow] = useState(null)
  const [otp, setOtp] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const startPendingRef = useRef(false)
  const verifyPendingRef = useRef(false)

  const securityQuery = useQuery({
    queryKey: ['account-security', userKey],
    queryFn: getSecurityStatus,
    enabled: Boolean(userKey),
    retry: false,
  })

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setTimeout(() => setCooldown((current) => Math.max(current - 1, 0)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const refreshSecurity = async () => {
    try {
      await queryClient.fetchQuery({
        queryKey: ['account-security', userKey],
        queryFn: checkSecurity,
      })
      toast.success('Kiểm tra bảo mật hoàn tất.')
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể kiểm tra bảo mật.'))
    }
  }

  const startOtp = async (enabled = true) => {
    if (startPendingRef.current) return
    startPendingRef.current = true
    setOtp('')
    setCooldown(60)
    setSendingOtp(true)
    setOtpFlow({
      enabled,
      email: user?.email || 'email tài khoản',
      challengeId: null,
      pending: true,
    })

    try {
      const data = await startTwoFactor(enabled)
      if (data.alreadyEnabled !== undefined) {
        toast.success(data.enabled ? 'Xác thực 2 lớp đã được bật.' : 'Xác thực 2 lớp đang tắt.')
        setOtpFlow(null)
        setCooldown(0)
        await queryClient.invalidateQueries({ queryKey: ['account-security', userKey] })
        await queryClient.invalidateQueries({ queryKey: ['profile', userKey] })
        return
      }

      setOtpFlow({ ...data, enabled })
      toast.success(`Mã OTP đã được gửi đến ${data.email || 'email tài khoản'}.`)
    } catch (err) {
      setOtpFlow((current) => current ? { ...current, pending: false, sendFailed: true } : current)
      toast.error(getApiMessage(err, 'Không thể gửi mã OTP. Vui lòng thử lại.'))
    } finally {
      startPendingRef.current = false
      setSendingOtp(false)
    }
  }

  const verifyOtp = async () => {
    if (!otpFlow?.challengeId || otp.length !== 6) return
    if (verifyPendingRef.current) return
    verifyPendingRef.current = true
    setVerifyingOtp(true)

    try {
      const data = await verifyTwoFactor({ challengeId: otpFlow.challengeId, otp })
      setOtpFlow(null)
      setOtp('')
      setCooldown(0)
      toast.success(data.enabled ? 'Đã bật xác thực 2 lớp.' : 'Đã tắt xác thực 2 lớp.')
      await queryClient.invalidateQueries({ queryKey: ['account-security', userKey] })
      await queryClient.invalidateQueries({ queryKey: ['profile', userKey] })
    } catch (err) {
      toast.error(getApiMessage(err, 'Mã OTP không hợp lệ hoặc đã hết hạn.'))
    } finally {
      verifyPendingRef.current = false
      setVerifyingOtp(false)
    }
  }

  const security = securityQuery.data || createEmptyAccountSecurity()
  const items = Array.isArray(security.items) && security.items.length ? security.items : createInitialAccountSecurityItems(user)
  const twoFactorEnabled = Boolean(user?.two_factor_enabled || items.find((item) => item.key === 'two_factor')?.status === 'passed')
  const score = Number(security.score ?? items.filter((item) => item.status === 'passed').length)
  const total = Number(security.total ?? items.length)

  return (
    <section className="customer-profile-panel rounded-lg border p-5 text-content">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="customer-section-icon customer-tone-green grid size-10 place-items-center rounded-md">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="customer-panel-title font-display text-xl font-extrabold">Bảo mật tài khoản</h2>
            <p className="mt-1 text-sm text-subtle">Hoàn thành {score}/{total} hạng mục bảo mật.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshSecurity}
          disabled={securityQuery.isFetching}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-soft/40 px-4 py-2 text-sm font-extrabold text-content transition hover:border-primary/60 hover:bg-panel-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {securityQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Kiểm tra bảo mật
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <SecurityMiniItem key={item.key || item.label} item={item} />
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-border-soft/30 bg-background/30 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-extrabold text-content">Xác thực 2 lớp qua OTP email</p>
            <p className="mt-1 text-sm text-subtle">
              {twoFactorEnabled ? 'Đang bật. Khi đăng nhập, tài khoản sẽ cần nhập OTP email.' : 'Chưa bật. Bật OTP email để tăng bảo vệ tài khoản.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => startOtp(!twoFactorEnabled)}
            disabled={sendingOtp || verifyingOtp}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-primary/40 px-4 py-2 text-sm font-extrabold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {twoFactorEnabled ? 'Tắt 2FA' : 'Bật 2FA'}
          </button>
        </div>

        {otpFlow && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.06] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold">
                  {sendingOtp ? 'Đang gửi mã OTP...' : otpFlow.sendFailed ? 'Chưa gửi được mã OTP' : 'Mã OTP đã được gửi'}
                </p>
                <p className="mt-1 text-sm text-subtle">
                  {cooldown > 0 ? `Nếu chưa nhận được email, bạn có thể gửi lại sau ${cooldown}s.` : 'Nếu chưa nhận được email, bạn có thể gửi lại mã OTP.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startOtp(Boolean(otpFlow.enabled))}
                disabled={sendingOtp || cooldown > 0}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-primary/40 px-4 py-2 text-sm font-extrabold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại OTP'}
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Nhập mã OTP"
                className="h-11 flex-1 rounded-md border border-border-soft/40 bg-background/35 px-4 text-sm font-semibold text-content outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="button"
                onClick={verifyOtp}
                disabled={verifyingOtp || sendingOtp || !otpFlow.challengeId || otp.length !== 6}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-extrabold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifyingOtp && <Loader2 className="size-4 animate-spin" />}
                Xác nhận OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpFlow(null)
                  setOtp('')
                  setCooldown(0)
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-soft/40 px-5 py-2 text-sm font-extrabold text-content transition hover:bg-panel-soft"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function SecurityMiniItem({ item }) {
  const normalized = String(item.status || '').toLowerCase()
  const config = {
    passed: ['Đạt', 'text-success', CheckCircle2],
    warning: ['Cần chú ý', 'text-warning', AlertCircle],
    danger: ['Nguy hiểm', 'text-error', AlertCircle],
    disabled: ['Chưa hỗ trợ', 'text-muted', InfoIcon],
  }[normalized] || ['Cần chú ý', 'text-warning', AlertCircle]
  const [label, className, Icon] = config

  return (
    <div className="rounded-lg border border-border-soft/30 bg-background/30 p-3">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${className}`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-extrabold text-content">{item.label}</p>
            <span className={`text-xs font-extrabold ${className}`}>{label}</span>
          </div>
          <p className="mt-1 break-words text-sm text-subtle">{item.message}</p>
        </div>
      </div>
    </div>
  )
}

function createEmptyAccountSecurity() {
  return { score: 0, total: 6, items: [] }
}

function createInitialAccountSecurityItems(user) {
  return [
    {
      key: 'two_factor',
      label: 'Xác thực 2 lớp',
      status: user?.two_factor_enabled ? 'passed' : 'warning',
      message: user?.two_factor_enabled ? 'Tài khoản đã bật xác thực 2 lớp qua OTP email.' : 'Bạn chưa bật xác thực 2 lớp.',
    },
  ]
}

function ProfileEdit({ user, organizer, isOrganizer, onDone }) {
  const toast = useToast()
  const request = organizer?.source_request || {}
  const initialDescription = firstValue(organizer?.description, request.organization_description, user.bio, '')
  const initialWebsiteUrl = firstValue(organizer?.website_url, '')
  const initialSocialUrl = firstValue(organizer?.social_url, '')
  const [formData, setFormData] = useState({
    full_name: user.full_name || '',
    phone: user.phone || '',
    address: user.address || '',
    dob: user.dob ? user.dob.split('T')[0] : '',
    city: user.city || '',
    avatar_url: user.avatar_url || '',
    description: initialDescription || '',
    website_url: initialWebsiteUrl || '',
    social_url: initialSocialUrl || '',
  })
  const [errors, setErrors] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(user.avatar_url || '')
  const [isUploading, setIsUploading] = useState(false)

  const updateMutation = useMutation({
    mutationFn: async ({ userPayload, organizerPayload }) => {
      const updatedUser = await updateProfile(userPayload)
      if (isOrganizer && organizerPayload) {
        await updateOrganizerProfile(organizerPayload)
      }
      return updatedUser
    },
    onSuccess: (updatedUser) => {
      toast.success('Cập nhật hồ sơ thành công.')
      updateStoredUser(updatedUser)
      onDone()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật hồ sơ.'))
    },
  })

  const validate = () => {
    const newErrors = {}
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Vui lòng nhập họ và tên.'
    }

    if (formData.phone.trim()) {
      const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/
      if (!phoneRegex.test(formData.phone)) {
        newErrors.phone = 'Số điện thoại không đúng định dạng Việt Nam. Ví dụ: 09xxxxxxxx hoặc +849xxxxxxxx.'
      }
    }

    if (formData.description.length > 5000) {
      newErrors.description = 'Mô tả không được vượt quá 5000 ký tự.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Vui lòng chọn tệp ảnh hợp lệ (JPG, PNG).')
        return
      }
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsUploading(true)

    try {
      let finalAvatarUrl = formData.avatar_url
      if (selectedFile) {
        const uploadRes = await uploadAvatar(selectedFile)
        finalAvatarUrl = uploadRes.secure_url
      }

      const userPayload = {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        dob: formData.dob || null,
        city: formData.city.trim() || null,
        avatar_url: finalAvatarUrl,
      }
      const organizerPayload = isOrganizer
        ? {
            description: formData.description,
            website_url: formData.website_url,
            social_url: formData.social_url,
          }
        : null

      updateMutation.mutate({ userPayload, organizerPayload })
    } catch (err) {
      toast.error(getApiMessage(err, 'Không thể tải ảnh lên hệ thống.'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="h-fit rounded-lg border border-border-soft/50 bg-surface p-6 text-center text-content shadow-sm">
        <div className="relative mx-auto size-36">
          {previewUrl ? (
            <img src={previewUrl} alt="Ảnh đại diện xem trước" className="size-36 rounded-full object-cover ring-4 ring-primary/30" />
          ) : (
            <div className="flex size-36 items-center justify-center rounded-full bg-surface ring-4 ring-primary/30">
              <UserCircle className="size-20 text-muted" />
            </div>
          )}
          <label className="absolute bottom-1 right-1 grid size-10 cursor-pointer place-items-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-110">
            <Camera className="size-5" />
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        </div>
        <p className="mt-4 text-sm text-subtle">JPG, PNG. Đề xuất 400x400px.</p>
      </aside>
      <section className="rounded-lg border border-border-soft/50 bg-surface p-6 text-content shadow-sm">
        <h2 className="font-display text-2xl font-bold text-content">Chỉnh sửa hồ sơ</h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="rounded-lg border border-border-soft/50 bg-panel-soft p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserCircle className="size-5" />
              </span>
              <h3 className="font-display text-xl font-bold text-content">Thông tin tài khoản</h3>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
            <Input label="Họ và tên" value={formData.full_name} error={errors.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
            <Input label="Số điện thoại" value={formData.phone} error={errors.phone} placeholder="09xxxxxxxx hoặc +849xxxxxxxx" onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="Ngày sinh" type="date" value={formData.dob} error={errors.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
            <Input label="Thành phố" value={formData.city} error={errors.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
            <Input label="Địa chỉ" value={formData.address} error={errors.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="md:col-span-2" />
            </div>
          </div>

          {isOrganizer && (
            <div className="rounded-lg border border-border-soft/50 bg-panel-soft p-5">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold text-content">Thông tin công khai của nhà tổ chức</h3>
                  <p className="mt-1 text-sm text-subtle">Các nội dung này sẽ được dùng để giới thiệu hồ sơ nhà tổ chức.</p>
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  label="Trang web"
                  value={formData.website_url}
                  error={errors.website_url}
                  placeholder="https://example.com"
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                />
                <Input
                  label="Mạng xã hội"
                  value={formData.social_url}
                  error={errors.social_url}
                  placeholder="https://facebook.com/ten-trang"
                  onChange={(e) => setFormData({ ...formData, social_url: e.target.value })}
                />
                <label className="block space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-muted">Mô tả/giới thiệu</span>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={6}
                    maxLength={5000}
                    placeholder="Giới thiệu ngắn gọn về cá nhân, tổ chức hoặc lĩnh vực sự kiện của bạn."
                    className={`w-full resize-y rounded-md border bg-surface p-3 text-content outline-none transition-all focus:ring-2 focus:ring-primary/20 ${
                      errors.description ? 'border-error ring-error/10' : 'border-border-soft focus:border-primary'
                    }`}
                  />
                  <div className="flex items-center justify-between gap-3 text-xs">
                    {errors.description ? <p className="text-error">{errors.description}</p> : <span className="text-subtle">Tối đa 5000 ký tự.</span>}
                    <span className="text-subtle">{formData.description.length}/5000</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onDone} className="admin-secondary px-5 py-3 text-content hover:bg-panel-soft" disabled={updateMutation.isPending || isUploading}>
              Hủy
            </button>
            <button type="submit" disabled={updateMutation.isPending || isUploading} className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70">
              {updateMutation.isPending || isUploading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isUploading ? 'Đang tải ảnh...' : updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ChangePassword({ user, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const hasPassword = user?.hasPassword
  const checks = {
    length: form.newPassword.length >= 8,
    uppercase: /[A-Z]/.test(form.newPassword),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(form.newPassword),
  }
  const isStrengthValid = Object.values(checks).every(Boolean)
  const isMatch = form.confirmPassword !== '' && form.newPassword === form.confirmPassword
  const canSubmit = isStrengthValid && isMatch && (!hasPassword || form.currentPassword !== '')

  const mutation = useMutation({
    mutationFn: () => changePassword(form.currentPassword, form.newPassword),
    onSuccess: () => {
      toast.success('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.')
      setTimeout(() => {
        clearAuthSession()
        window.location.href = '/login'
      }, 2000)
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể đổi mật khẩu. Vui lòng thử lại.'))
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    mutation.mutate()
  }

  return (
    <div className="text-content">
      <h2 className="sr-only">
        {hasPassword ? 'Đổi mật khẩu' : 'Thiết lập mật khẩu mới'}
      </h2>
      <p className="text-sm leading-6 text-subtle">
        {hasPassword
          ? 'Cập nhật mật khẩu định kỳ để tăng cường bảo mật.'
          : 'Bạn đang đăng nhập bằng Google, hãy thiết lập mật khẩu để có thể đăng nhập trực tiếp bằng email.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {hasPassword && (
          <Input label="Mật khẩu hiện tại" type="password" placeholder="Nhập mật khẩu hiện tại" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        )}

        <div className="space-y-3">
          <Input label="Mật khẩu mới" type="password" placeholder="Nhập mật khẩu mới" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />

          {form.newPassword && (
            <div className="flex flex-col gap-1.5 pl-1">
              <StrengthIndicator label="Tối thiểu 8 ký tự" active={checks.length} />
              <StrengthIndicator label="Có ít nhất 1 chữ in hoa (A-Z)" active={checks.uppercase} />
              <StrengthIndicator label="Có ít nhất 1 ký tự đặc biệt" active={checks.special} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Input label="Xác nhận mật khẩu mới" type="password" placeholder="Nhập lại mật khẩu mới" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />

          {form.confirmPassword && (
            <div className="pl-1">
              <StrengthIndicator label={isMatch ? 'Mật khẩu xác nhận khớp' : 'Mật khẩu xác nhận chưa khớp'} active={isMatch} />
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDone} className="admin-secondary px-5 py-3 text-content hover:bg-panel-soft" disabled={mutation.isPending}>
            Hủy
          </button>
          <button type="submit" disabled={!canSubmit || mutation.isPending} className="flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {hasPassword ? 'Cập nhật mật khẩu' : 'Lưu mật khẩu'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Info({ icon: Icon, label, value, className = '', multiline = false, linkType }) {
  const displayValue = valueOrEmpty(value)
  const isEmpty = displayValue === EMPTY_TEXT
  const href = !isEmpty && linkType === 'email'
    ? `mailto:${displayValue}`
    : !isEmpty && linkType === 'url'
      ? normalizeUrl(displayValue)
      : null

  return (
    <div className={`organizer-info-item min-w-0 p-3 ${className}`}>
      <div className="organizer-profile-label flex items-center gap-2">
        <span className="organizer-info-card-icon grid size-8 shrink-0 place-items-center rounded-full">
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {href ? (
        <a href={href} target={linkType === 'url' ? '_blank' : undefined} rel={linkType === 'url' ? 'noreferrer' : undefined} className="organizer-info-link mt-2 block break-words font-bold">
          {displayValue}
        </a>
      ) : (
        <p className={`mt-2 break-words font-bold ${isEmpty ? 'organizer-info-empty' : 'organizer-info-value'} ${multiline ? 'whitespace-pre-line leading-7' : ''}`}>
          {displayValue}
        </p>
      )}
    </div>
  )
}

function DocumentCard({ label, url, uploadedAt }) {
  const displayUrl = valueOrEmpty(url)
  const hasUrl = displayUrl !== EMPTY_TEXT
  const href = hasUrl ? normalizeUrl(displayUrl) : ''
  const uploadedDate = hasUrl ? formatDateTime(uploadedAt) : EMPTY_TEXT
  const isImage = hasUrl && isImageUrl(displayUrl)

  return (
    <div className={`organizer-document-row ${isImage ? 'items-start' : ''}`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="organizer-document-icon grid size-8 shrink-0 place-items-center rounded-md">
            <FileText className="size-4" />
          </span>
          <span className="organizer-info-value break-words text-sm font-semibold">{label}</span>
        </div>
        {isImage && (
          <a href={href} target="_blank" rel="noreferrer" className="mt-3 block">
            <img src={displayUrl} alt={label} className="h-32 w-52 rounded-lg border border-border-soft/50 object-cover" />
          </a>
        )}
      </div>
      <div className="organizer-document-date hidden text-sm font-medium md:block">
        {uploadedDate}
      </div>
      {hasUrl ? (
        <a href={href} target="_blank" rel="noreferrer" className="organizer-document-status inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Đã tải lên
        </a>
      ) : (
        <p className="organizer-info-empty text-sm font-semibold">Chưa cập nhật</p>
      )}
    </div>
  )
}

function ReviewHistoryCard({ request, index }) {
  const rejected = String(request.status || '').toUpperCase() === 'REJECTED'
  const changeSummary = valueOrEmpty(request.change_summary)

  return (
    <div className={`rounded-lg border p-4 ${rejected ? 'border-error/30 bg-error/10' : 'organizer-history-card'}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="organizer-info-empty text-xs font-bold uppercase tracking-wide">Yêu cầu {index + 1}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={request.status} />
            <span className="organizer-profile-label text-sm font-semibold">{requestActionLabel(request.request_action)}</span>
            <span className="organizer-profile-label text-sm font-semibold">{organizerTypeLabel(request.request_type)}</span>
          </div>
        </div>
        <div className="grid gap-2 text-sm md:min-w-[260px]">
          <CompactLine icon={Calendar} label="Ngày gửi" value={formatDateTime(request.created_at)} />
          <CompactLine icon={Clock} label="Ngày xử lý" value={formatDateTime(request.reviewed_at)} />
        </div>
      </div>
      {changeSummary !== EMPTY_TEXT && (
        <div className="mt-4 rounded-lg border border-border-soft/40 bg-panel-soft p-4">
          <p className="text-sm font-bold text-content">Nội dung xét duyệt</p>
          <p className="organizer-info-value mt-1 whitespace-pre-line text-sm leading-6">{changeSummary}</p>
        </div>
      )}
      {rejected && (
        <div className="mt-4 rounded-lg border border-error/30 bg-error/10 p-4">
          <p className="text-sm font-bold text-error">Lý do từ chối</p>
          <p className="organizer-info-value mt-1 whitespace-pre-line text-sm leading-6">{valueOrEmpty(request.review_note)}</p>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const normalized = String(status || '').toUpperCase()
  const tone = normalized === 'REJECTED'
    ? 'border-error/30 bg-error/10 text-error'
    : normalized === 'PENDING'
      ? 'border-warning/30 bg-warning/10 text-warning'
      : 'border-success/30 bg-success/10 text-success'

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>
      {requestStatusLabel(status)}
    </span>
  )
}

function CompactLine({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="organizer-info-empty text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="organizer-info-value break-words text-sm font-bold">{valueOrEmpty(value)}</p>
      </div>
    </div>
  )
}

function StrengthIndicator({ label, active }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-medium transition-all duration-300 ${active ? 'text-success' : 'text-error'}`}>
      {active ? <Check className="size-3.5 animate-in zoom-in duration-300" /> : <X className="size-3.5 text-error/70" />}
      <span>{label}</span>
    </div>
  )
}

function Input({ label, error, className = '', type, ...props }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={inputType}
          className={`w-full rounded-md border bg-surface p-3 pr-10 text-content outline-none transition-all focus:ring-2 focus:ring-primary/20 ${
            error ? 'border-error ring-error/10' : 'border-border-soft focus:border-primary'
          } disabled:opacity-50`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-content">
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </label>
  )
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function valueOrEmpty(value) {
  if (value === undefined || value === null) return EMPTY_TEXT
  const text = String(value).trim()
  return text || EMPTY_TEXT
}

function formatProfileAddress(user, organizer) {
  const parts = [
    firstValue(organizer?.address, user?.address),
    firstValue(organizer?.city, user?.city),
  ].filter(Boolean)
  return parts.join(', ')
}

function normalizeOrganizerType(type) {
  const normalized = String(type || '').toLowerCase()
  if (['individual', 'personal', 'person'].includes(normalized)) return 'personal'
  if (['organization', 'business', 'company', 'enterprise'].includes(normalized)) return 'organization'
  return normalized || 'unknown'
}

function organizerTypeLabel(type) {
  const normalized = normalizeOrganizerType(type)
  if (normalized === 'personal') return 'Cá nhân'
  if (normalized === 'organization') return 'Tổ chức/Doanh nghiệp'
  return EMPTY_TEXT
}

function requestActionLabel(action) {
  const normalized = String(action || 'APPLICATION').toUpperCase()
  if (normalized === 'PROFILE_UPDATE') return 'Cập nhật hồ sơ pháp lý/xác minh'
  return 'Đăng ký nhà tổ chức'
}

function requestStatusLabel(status) {
  const normalized = String(status || '').toLowerCase()
  const map = {
    pending: 'Đang chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Bị từ chối',
    active: 'Đã duyệt',
    verified: 'Đã xác minh',
    unverified: 'Chưa xác minh',
    inactive: 'Ngừng hoạt động',
    suspended: 'Tạm ngừng',
  }
  return map[normalized] || valueOrEmpty(status)
}

function emailVerificationLabel(verified, verifiedAt) {
  if (verified === true) {
    return verifiedAt ? `Đã xác thực lúc ${formatDateTime(verifiedAt)}` : 'Đã xác thực'
  }
  if (verified === false) return 'Chưa xác thực'
  return EMPTY_TEXT
}

function booleanLabel(value) {
  if (value === true) return 'Đã đồng ý'
  if (value === false) return 'Chưa đồng ý'
  return EMPTY_TEXT
}

function formatDate(dateString) {
  if (!dateString) return EMPTY_TEXT
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return EMPTY_TEXT
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(dateString) {
  if (!dateString) return EMPTY_TEXT
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return EMPTY_TEXT
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeUrl(url) {
  const text = valueOrEmpty(url)
  if (text === EMPTY_TEXT) return undefined
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
}

function isImageUrl(url = '') {
  return (
    /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(url) ||
    /\/image\/upload\//i.test(url) ||
    /\/raw\/upload\/.*\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(url)
  )
}

function roleLabel(roles = []) {
  const labels = {
    organizer: 'Nhà tổ chức',
    admin: 'Quản trị viên',
    super_admin: 'Quản trị viên cấp cao',
    staff: 'Nhân sự',
    customer: 'Khách hàng',
    user: 'Khách hàng',
  }
  const list = Array.isArray(roles) ? roles : []
  return list.map((role) => labels[String(role).toLowerCase()] || role).join(', ') || 'Khách hàng'
}
