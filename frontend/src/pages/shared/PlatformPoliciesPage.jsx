import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileText } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchActivePlatformPolicies,
  fetchOrganizerPlatformPolicies,
} from '@/services/platformFinance.js'

const policyLabels = {
  TERMS_CUSTOMER: 'Điều khoản sử dụng dành cho Khách hàng',
  TERMS_ORGANIZER: 'Điều khoản sử dụng dành cho Nhà tổ chức',
  TERMS_STAFF: 'Điều khoản sử dụng dành cho Staff',
  PRIVACY_POLICY: 'Chính sách bảo mật thông tin cá nhân',
  PAYMENT_SECURITY_POLICY: 'Chính sách bảo mật thanh toán',
  PAYMENT_POLICY: 'Chính sách thanh toán',
  REFUND_POLICY: 'Chính sách hoàn tiền',
  EVENT_POLICY: 'Chính sách sự kiện',
  TICKET_POLICY: 'Chính sách đặt vé và sử dụng vé',
  CHECKIN_POLICY: 'Chính sách check-in và chống vé giả',
  SUBSCRIPTION_POLICY: 'Chính sách gói dịch vụ Organizer',
  FEE_POLICY: 'Chính sách phí nền tảng',
  COMPLAINT_POLICY: 'Chính sách khiếu nại và giải quyết tranh chấp',
  AI_POLICY: 'Chính sách sử dụng AI',
  SYSTEM_POLICY: 'Chính sách hệ thống',
  GENERAL_TERMS: 'Điều khoản sử dụng chung',
}

const policyAliases = {
  GENERAL_TERMS: ['SYSTEM_POLICY', 'TERMS_CUSTOMER'],
  CUSTOMER_TERMS: ['TERMS_CUSTOMER'],
  ORGANIZER_TERMS: ['TERMS_ORGANIZER'],
  STAFF_TERMS: ['TERMS_STAFF'],
  PRIVACY_PERSONAL_DATA: ['PRIVACY_POLICY'],
  PAYMENT_SECURITY: ['PAYMENT_SECURITY_POLICY'],
  PAYMENT: ['PAYMENT_POLICY'],
  REFUND: ['REFUND_POLICY'],
  EVENT_CREATION_REVIEW: ['EVENT_POLICY'],
  EVENT_POSTPONEMENT_CANCELLATION: ['EVENT_POLICY'],
  TICKET_BOOKING: ['TICKET_POLICY'],
  ELECTRONIC_TICKET_USAGE: ['TICKET_POLICY'],
  CHECKIN_ANTI_FRAUD: ['CHECKIN_POLICY'],
  ORGANIZER_SERVICE_PLAN: ['SUBSCRIPTION_POLICY'],
  SERVICE_FEE: ['FEE_POLICY'],
  COMPLAINT_DISPUTE_RESOLUTION: ['COMPLAINT_POLICY'],
  AI_POLICY: ['AI_POLICY'],
  SYSTEM_POLICY: ['SYSTEM_POLICY'],
}

const policyKeywords = {
  TERMS_CUSTOMER: ['khach hang'],
  TERMS_ORGANIZER: ['nha to chuc', 'organizer'],
  TERMS_STAFF: ['staff'],
  PRIVACY_POLICY: ['bao mat', 'ca nhan'],
  PAYMENT_SECURITY_POLICY: ['bao mat', 'thanh toan'],
  PAYMENT_POLICY: ['thanh toan'],
  REFUND_POLICY: ['hoan tien'],
  EVENT_POLICY: ['su kien'],
  TICKET_POLICY: ['ve'],
  CHECKIN_POLICY: ['check in'],
  SUBSCRIPTION_POLICY: ['goi', 'dich vu'],
  FEE_POLICY: ['phi'],
  COMPLAINT_POLICY: ['khieu nai', 'tranh chap'],
  AI_POLICY: ['ai'],
  SYSTEM_POLICY: ['he thong'],
  GENERAL_TERMS: ['chung'],
  CUSTOMER_TERMS: ['khach hang'],
  ORGANIZER_TERMS: ['nha to chuc'],
  STAFF_TERMS: ['staff'],
  PRIVACY_PERSONAL_DATA: ['bao mat', 'ca nhan'],
  PAYMENT_SECURITY: ['bao mat thanh toan'],
  PAYMENT: ['thanh toan'],
  REFUND: ['hoan tien'],
  EVENT_CREATION_REVIEW: ['su kien'],
  EVENT_POSTPONEMENT_CANCELLATION: ['su kien'],
  TICKET_BOOKING: ['ve'],
  ELECTRONIC_TICKET_USAGE: ['ve'],
  CHECKIN_ANTI_FRAUD: ['check in'],
  ORGANIZER_SERVICE_PLAN: ['goi dich vu'],
  COMPLAINT_DISPUTE_RESOLUTION: ['khieu nai', 'tranh chap'],
}

const configLabels = {
  priority: 'Thứ tự ưu tiên',
  review_cycle_days: 'Chu kỳ rà soát định kỳ (ngày)',
  requires_acceptance: 'Yêu cầu người dùng xác nhận đồng ý',
  applies_to: 'Đối tượng áp dụng',
  summary: 'Tóm tắt điều khoản/chính sách',
  public_note: 'Ghi chú công khai',
}

export function PlatformPoliciesPage({ audience = 'public' }) {
  const [searchParams] = useSearchParams()
  const selectedPolicyType = searchParams.get('policy_type') || undefined
  const policiesQuery = useQuery({
    queryKey: ['active-platform-policies', audience],
    queryFn: () =>
      audience === 'organizer'
        ? fetchOrganizerPlatformPolicies()
        : fetchActivePlatformPolicies(),
  })

  const allPolicies = policiesQuery.data || []
  let policies = selectedPolicyType
    ? filterPolicies(allPolicies, selectedPolicyType)
    : allPolicies

  if (audience === 'organizer') {
    const allowed = ['TERMS_ORGANIZER', 'EVENT_POLICY', 'SUBSCRIPTION_POLICY', 'FEE_POLICY']
    policies = policies
      .filter((p) => allowed.includes(p.policy_type))
      .sort((a, b) => allowed.indexOf(a.policy_type) - allowed.indexOf(b.policy_type))
  }
  const selectedPdfPolicy = selectedPolicyType
    ? policies.find((policy) => (policy.documents || []).some(isPdfDocument))
    : null
  const selectedPdf = selectedPdfPolicy?.documents?.find(isPdfDocument)

  if (!policiesQuery.isLoading && !policiesQuery.isError && selectedPdfPolicy && selectedPdf) {
    return (
      <div className={audience === 'organizer' ? '' : 'mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8'}>
        <PolicyPdfViewer policy={selectedPdfPolicy} document={selectedPdf} />
      </div>
    )
  }

  return (
    <div className={audience === 'organizer' ? '' : 'mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8'}>
      <div className="mb-6">
        <h1 className={`mt-1 font-display text-3xl font-extrabold ${audience === 'organizer' ? 'text-[#111827]' : 'text-white'}`}>
          {selectedPolicyType ? policyLabels[selectedPolicyType] || 'Chính sách' : 'Chính sách đang áp dụng'}
        </h1>
        <p className={`mt-2 max-w-2xl text-sm leading-6 ${audience === 'organizer' ? 'text-[#434655]' : 'text-muted'}`}>
          Các điều khoản và tài liệu PDF/DOCX chính thức được EventHub công khai
        </p>
      </div>

      {policiesQuery.isLoading && (
        <PolicyPanel>
          <p className="text-sm font-semibold text-[#434655]">Đang tải chính sách...</p>
        </PolicyPanel>
      )}

      {policiesQuery.isError && (
        <PolicyPanel>
          <p className="text-sm font-semibold text-error">Không thể tải chính sách đang áp dụng.</p>
        </PolicyPanel>
      )}

      {!policiesQuery.isLoading && !policiesQuery.isError && policies.length === 0 && (
        <PolicyPanel>
          <p className="text-sm font-semibold text-[#434655]">Chưa có chính sách công khai cho mục này.</p>
        </PolicyPanel>
      )}

      <div className="grid gap-6">
        {policies.map((policy) => {
          if (audience === 'organizer') {
            const primaryPdf = (policy.documents || []).find(isPdfDocument)
            if (!primaryPdf) return null
            return (
              <div key={policy.id} className="flex flex-col gap-2">
                <PolicyPdfViewer policy={policy} document={primaryPdf} />
              </div>
            )
          }

          return (
            <PolicyPanel key={policy.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <span className="inline-flex rounded bg-[#dbe1ff] px-2 py-1 text-xs font-bold uppercase text-[#003ea8]">
                    {policyLabels[policy.policy_type] || policy.policy_type}
                  </span>
                  <h2 className="mt-3 text-xl font-extrabold text-[#111827]">{policy.title}</h2>
                  {policy.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#434655]">
                      {policy.description}
                    </p>
                  )}
                </div>
                <p className="text-xs font-semibold text-[#737686]">
                  Hiệu lực từ {policy.effective_from ? new Date(policy.effective_from).toLocaleDateString('vi-VN') : 'hiện tại'}
                </p>
              </div>

              {Object.keys(policy.config || {}).length > 0 && (
                <dl className="mt-4 grid gap-3 rounded-md bg-[#f2f4f6] p-4 sm:grid-cols-2">
                  {Object.entries(policy.config).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs font-bold uppercase text-[#737686]">
                        {configLabels[key] || key}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-[#191c1e]">
                        {formatConfigValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <PolicyDocuments documents={policy.documents || []} />
            </PolicyPanel>
          )
        })}
      </div>
    </div>
  )
}

function PolicyPdfViewer({ policy, document }) {
  return (
    <section className="overflow-hidden rounded-md border border-[#30363d] bg-[#262626] shadow-2xl">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[#3d3d3d] bg-[#333] px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">
            {document.file_name || document.title || policy.title}
          </p>
          <p className="mt-1 truncate text-xs text-white/70">
            {policy.title}
          </p>
        </div>
        <a
          href={document.file_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/10"
        >
          <ExternalLink className="size-4" />
          Mở tab mới
        </a>
      </div>
      <iframe
        title={document.title || document.file_name || policy.title}
        src={withPdfViewerOptions(document.file_url)}
        className="h-[82vh] min-h-[720px] w-full bg-[#2a2a2a]"
      />
    </section>
  )
}

function PolicyDocuments({ documents }) {
  const primaryPdf = documents.find((document) => isPdfDocument(document))

  if (documents.length === 0) {
    return <p className="mt-4 text-sm font-semibold text-[#737686]">Chính sách này chưa có file công khai.</p>
  }

  return (
    <div className="mt-4 space-y-4">
      {primaryPdf && (
        <div className="overflow-hidden rounded-md border border-[#c3c6d7] bg-[#f7f9fb]">
          <iframe
            title={primaryPdf.title || primaryPdf.file_name || 'Tài liệu chính sách'}
            src={withPdfViewerOptions(primaryPdf.file_url)}
            className="h-[70vh] min-h-[520px] w-full bg-white"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {documents.map((document) => (
          <a
            key={document.id}
            href={document.file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-[#c3c6d7] px-3 py-2 text-sm font-bold text-primary transition hover:bg-[#f1fbff]"
          >
            {isPdfDocument(document) ? <FileText className="size-4" /> : <ExternalLink className="size-4" />}
            {document.title || document.file_name || 'Xem tài liệu'}
          </a>
        ))}
      </div>
    </div>
  )
}

function filterPolicies(policies, selectedPolicyType) {
  const acceptedTypes = new Set(policyAliases[selectedPolicyType] || [selectedPolicyType])
  const exactMatches = policies.filter((policy) => acceptedTypes.has(policy.policy_type))
  if (exactMatches.length > 0) return exactMatches

  const keywords = policyKeywords[selectedPolicyType] || []
  return policies.filter((policy) => {
    const title = normalizeText(`${policy.title || ''} ${policy.description || ''}`)
    const type = normalizeText(policy.policy_type || '')
    return (
      type.includes(normalizeText(selectedPolicyType)) ||
      (keywords.length > 0 && keywords.every((keyword) => title.includes(normalizeText(keyword))))
    )
  })
}

function isPdfDocument(document) {
  return document.mime_type === 'application/pdf' || /\.pdf($|\?)/i.test(document.file_url || document.file_name || '')
}

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function withPdfViewerOptions(url = '') {
  if (!url) return ''
  const separator = url.includes('#') ? '&' : '#'
  return `${url}${separator}toolbar=1&navpanes=1&view=FitH`
}

function formatConfigValue(value) {
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (value === null || value === undefined || value === '') return 'Chưa thiết lập'
  return String(value)
}

function PolicyPanel({ children }) {
  return (
    <section className="rounded-md border border-[#c3c6d7] bg-white p-5 shadow-sm">
      {children}
    </section>
  )
}
