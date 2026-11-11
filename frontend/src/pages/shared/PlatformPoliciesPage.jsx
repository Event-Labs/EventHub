import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  HelpCircle,
  Layers,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchActivePlatformPolicies,
  fetchOrganizerPlatformPolicies,
} from '@/services/platformFinance.js'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'
import staticPoliciesData from './platformPoliciesData.json'
import staticPoliciesDataEn from './platformPoliciesDataEn.json'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

// Category groupings matching the Footer navigation
function getPolicyGroups(isEnglish) {
  return [
    {
      key: 'about',
      title: isEnglish ? 'About Our Platform' : 'Về nền tảng chúng tôi',
      icon: Shield,
      color: 'from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-[#E6C17A]',
      types: ['SYSTEM_POLICY', 'PRIVACY_POLICY', 'AI_POLICY', 'COMPLAINT_POLICY'],
    },
    {
      key: 'customer',
      title: isEnglish ? 'For Customers' : 'Dành cho Khách hàng',
      icon: Users,
      color: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-300',
      types: ['TERMS_CUSTOMER', 'TICKET_POLICY', 'PAYMENT_POLICY', 'PAYMENT_SECURITY_POLICY', 'REFUND_POLICY'],
    },
    {
      key: 'organizer',
      title: isEnglish ? 'For Organizers' : 'Dành cho BTC',
      icon: Layers,
      color: 'from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300',
      types: ['TERMS_ORGANIZER', 'EVENT_POLICY', 'SUBSCRIPTION_POLICY', 'FEE_POLICY'],
    },
    {
      key: 'staff',
      title: isEnglish ? 'For Staff' : 'Dành cho Nhân sự',
      icon: CheckCircle2,
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300',
      types: ['TERMS_STAFF', 'CHECKIN_POLICY'],
    },
  ]
}

function getPolicyLabels(isEnglish) {
  return isEnglish
    ? {
        SYSTEM_POLICY: 'System Policy',
        PRIVACY_POLICY: 'Privacy Policy',
        AI_POLICY: 'AI Usage Policy',
        COMPLAINT_POLICY: 'Complaints & Disputes',
        TERMS_CUSTOMER: 'Customer Terms of Service',
        TICKET_POLICY: 'Ticket Policy',
        PAYMENT_POLICY: 'Payment Policy',
        PAYMENT_SECURITY_POLICY: 'Payment Security',
        REFUND_POLICY: 'Refund Policy',
        TERMS_ORGANIZER: 'Organizer Terms of Service',
        EVENT_POLICY: 'Event Policy',
        SUBSCRIPTION_POLICY: 'Organizer Subscription Policy',
        FEE_POLICY: 'Platform Fee Policy',
        TERMS_STAFF: 'Staff Terms of Service',
        CHECKIN_POLICY: 'Check-in & Anti-fraud Policy',
        GENERAL_TERMS: 'General Terms of Service',
      }
    : {
        SYSTEM_POLICY: 'Chính sách hệ thống',
        PRIVACY_POLICY: 'Bảo mật thông tin cá nhân',
        AI_POLICY: 'Chính sách sử dụng AI',
        COMPLAINT_POLICY: 'Khiếu nại và tranh chấp',
        TERMS_CUSTOMER: 'Điều khoản dành cho Khách hàng',
        TICKET_POLICY: 'Chính sách vé',
        PAYMENT_POLICY: 'Chính sách thanh toán',
        PAYMENT_SECURITY_POLICY: 'Bảo mật thanh toán',
        REFUND_POLICY: 'Chính sách hoàn tiền',
        TERMS_ORGANIZER: 'Điều khoản dành cho Nhà tổ chức',
        EVENT_POLICY: 'Chính sách sự kiện',
        SUBSCRIPTION_POLICY: 'Gói dịch vụ Organizer',
        FEE_POLICY: 'Chính sách phí nền tảng',
        TERMS_STAFF: 'Điều khoản dành cho Nhân sự',
        CHECKIN_POLICY: 'Soát vé và chống vé giả',
        GENERAL_TERMS: 'Điều khoản sử dụng chung',
      }
}

const POLICY_ALIASES = {
  GENERAL_TERMS: 'SYSTEM_POLICY',
  CUSTOMER_TERMS: 'TERMS_CUSTOMER',
  ORGANIZER_TERMS: 'TERMS_ORGANIZER',
  STAFF_TERMS: 'TERMS_STAFF',
  PRIVACY_PERSONAL_DATA: 'PRIVACY_POLICY',
  PAYMENT_SECURITY: 'PAYMENT_SECURITY_POLICY',
  PAYMENT: 'PAYMENT_POLICY',
  REFUND: 'REFUND_POLICY',
  EVENT_CREATION_REVIEW: 'EVENT_POLICY',
  EVENT_POSTPONEMENT_CANCELLATION: 'EVENT_POLICY',
  TICKET_BOOKING: 'TICKET_POLICY',
  ELECTRONIC_TICKET_USAGE: 'TICKET_POLICY',
  CHECKIN_ANTI_FRAUD: 'CHECKIN_POLICY',
  ORGANIZER_SERVICE_PLAN: 'SUBSCRIPTION_POLICY',
  SERVICE_FEE: 'FEE_POLICY',
  COMPLAINT_DISPUTE_RESOLUTION: 'COMPLAINT_POLICY',
}

export function PlatformPoliciesPage({ audience = 'public' }) {
  const { isEnglish, t } = useLanguage()
  const policyGroups = useMemo(() => getPolicyGroups(isEnglish), [isEnglish])
  const policyLabels = useMemo(() => getPolicyLabels(isEnglish), [isEnglish])
  const [searchParams, setSearchParams] = useSearchParams()
  const rawType = searchParams.get('policy_type') || (audience === 'organizer' ? 'TERMS_ORGANIZER' : 'SYSTEM_POLICY')
  const activeType = POLICY_ALIASES[rawType] || rawType
  const [viewMode, setViewMode] = useState('text') // 'text' | 'pdf'

  const policiesQuery = useQuery({
    queryKey: ['active-platform-policies', audience],
    queryFn: () =>
      audience === 'organizer'
        ? fetchOrganizerPlatformPolicies()
        : fetchActivePlatformPolicies(),
    staleTime: 5 * 60 * 1000,
  })

  // Merge static fallback policies with live API policies
  const policiesMap = useMemo(() => {
    const map = new Map()
    const sourceData = isEnglish ? staticPoliciesDataEn : staticPoliciesData

    // 1. Populate with static fallback first
    for (const item of sourceData) {
      map.set(item.policy_type, {
        id: item.policy_type,
        policy_type: item.policy_type,
        title: item.title,
        description: item.description,
        markdown: item.markdown,
        file_url: item.file_url,
        file_name: item.file_name,
        effective_from: '2026-06-10T13:00:00.000Z',
      })
    }

    // 2. Override with live API data if available
    const apiData = Array.isArray(policiesQuery.data) ? policiesQuery.data : []
    for (const item of apiData) {
      const existing = map.get(item.policy_type) || {}
      const doc = Array.isArray(item.documents) && item.documents.length > 0 ? item.documents[0] : null
      map.set(item.policy_type, {
        ...existing,
        ...item,
        title: isEnglish ? (existing.title || item.title) : (item.title || existing.title),
        description: isEnglish ? (existing.description || item.description) : (item.description || existing.description),
        markdown: isEnglish ? (existing.markdown || item.config?.content_markdown || '') : (item.config?.content_markdown || existing.markdown || ''),
        file_url: doc?.file_url || existing.file_url || '',
        file_name: doc?.file_name || doc?.title || existing.file_name || '',
        effective_from: item.effective_from || existing.effective_from,
      })
    }

    return map
  }, [policiesQuery.data, isEnglish])

  const activePolicy = useMemo(() => {
    return (
      policiesMap.get(activeType) ||
      policiesMap.get('SYSTEM_POLICY') ||
      policiesMap.values().next().value
    )
  }, [policiesMap, activeType])

  const policyContentRef = useRef(null)

  // Select a policy
  const handleSelectPolicy = (type) => {
    setSearchParams({ policy_type: type })
    setViewMode('text')
    if (policyContentRef.current) {
      policyContentRef.current.scrollTop = 0
    }
  }

  // Scroll to top of content reader when active policy changes
  useEffect(() => {
    if (policyContentRef.current) {
      policyContentRef.current.scrollTop = 0
    }
  }, [activeType])

  // If audience is organizer, filter groups to relevant BTC policies
  const visibleGroups = useMemo(() => {
    if (audience !== 'organizer') return policyGroups
    return policyGroups.filter((g) => g.key === 'organizer')
  }, [audience, policyGroups])

  return (
    <div className={`mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 ${audience === 'organizer' ? 'pt-2 pb-4' : 'pt-2 sm:pt-4 pb-12'}`}>
      {/* Page Header */}
      <div className="mb-4 sm:mb-5 text-center sm:text-left">
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black text-white [html.light_&]:text-[#0D1B2A] tracking-tight">
          {renderCosmicTitle(isEnglish ? 'EventHub Policies & Terms' : 'Chính sách & Quy định EventHub', 'gold')}
        </h1>
      </div>

      {/* Main Layout: 2-columns (Sidebar Navigation + Policy Reader) */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-stretch ${
          audience === 'organizer'
            ? 'lg:h-[calc(100vh-185px)] lg:min-h-[580px]'
            : 'lg:h-[calc(100vh-210px)] lg:min-h-[620px]'
        }`}
      >
        {/* Navigation Sidebar */}
        <aside
          className={`space-y-4 flex flex-col h-full ${
            visibleGroups.length > 1
              ? 'overflow-y-auto pr-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]'
              : 'overflow-hidden'
          }`}
        >
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon
            return (
              <div
                key={group.key}
                className={`rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-3 sm:p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] flex flex-col [html.light_&]:bg-white [html.light_&]:border-slate-200 [html.light_&]:shadow-md ${
                  visibleGroups.length === 1 ? 'h-full' : 'shrink-0'
                }`}
              >
                <div className="flex items-center gap-2 px-2 pb-2.5 mb-1.5 border-b border-white/5 [html.light_&]:border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-300 [html.light_&]:text-slate-700 shrink-0">
                  <GroupIcon className="size-4 text-[#E6C17A] [html.light_&]:text-[#C99A47]" />
                  <span>{group.title}</span>
                </div>
                <div className="space-y-1 overflow-y-auto flex-1 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
                  {group.types.map((type) => {
                    const policy = policiesMap.get(type)
                    const isSelected = activePolicy?.policy_type === type
                    const label = policyLabels[type] || policy?.title || type

                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleSelectPolicy(type)}
                        className={`w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl text-xs sm:text-[13px] font-semibold transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-extrabold shadow-md shadow-[#C99A47]/30 scale-[1.01]'
                            : 'text-slate-400 hover:text-white hover:bg-white/5 [html.light_&]:text-slate-600 [html.light_&]:hover:text-[#0D1B2A] [html.light_&]:hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate pr-2">{label}</span>
                        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${isSelected ? 'translate-x-0.5 text-[#0D1B2A]' : 'opacity-40 [html.light_&]:opacity-60'}`} />
                      </button>
                    )
                  })}
                </div>

                {visibleGroups.length === 1 && (
                  <div className="mt-auto pt-3 border-t border-white/5 [html.light_&]:border-slate-200 shrink-0">
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 [html.light_&]:bg-slate-50 [html.light_&]:border-slate-200 p-3 text-[11px] text-slate-400 [html.light_&]:text-slate-600 leading-relaxed flex items-start gap-2">
                      <Shield className="size-3.5 text-[#E6C17A] [html.light_&]:text-[#C99A47] shrink-0 mt-0.5" />
                      <span>
                        {isEnglish
                          ? 'All policies are officially issued by EventHub and apply to all organizers on the platform.'
                          : 'Tất cả các điều khoản được ban hành chính thức bởi EventHub và áp dụng cho toàn bộ BTC.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </aside>

        {/* Policy Content Viewer */}
        <main className="rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-2xl p-5 sm:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.45)] flex flex-col h-full overflow-hidden [html.light_&]:bg-white [html.light_&]:border-slate-200 [html.light_&]:shadow-lg">
          {activePolicy ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Policy Header Bar */}
              <div className="flex flex-col gap-4 pb-4 border-b border-white/10 [html.light_&]:border-slate-200 sm:flex-row sm:items-start sm:justify-between shrink-0">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-[11px] font-bold text-[#E6C17A] [html.light_&]:bg-amber-50 [html.light_&]:text-amber-800 [html.light_&]:border-amber-300">
                      {policyLabels[activePolicy.policy_type] || activePolicy.policy_type}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 [html.light_&]:text-slate-500">
                      <Calendar className="size-3 text-[#E6C17A] [html.light_&]:text-[#C99A47]" />
                      {isEnglish ? 'Effective from:' : 'Hiệu lực từ:'}{' '}
                      {activePolicy.effective_from
                        ? new Date(activePolicy.effective_from).toLocaleDateString(isEnglish ? 'en-US' : 'vi-VN')
                        : (isEnglish ? 'Current' : 'Hiện tại')}
                    </span>
                  </div>

                  <h2 className="font-display text-xl sm:text-2xl font-black text-white [html.light_&]:text-[#0D1B2A] leading-snug">
                    {activePolicy.title}
                  </h2>

                  {activePolicy.description && (
                    <p className="mt-2 text-xs sm:text-sm text-slate-400 [html.light_&]:text-slate-600 leading-relaxed max-w-2xl">
                      {activePolicy.description}
                    </p>
                  )}
                </div>

                {/* View Actions (Text vs PDF, Open in New Tab) */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                  {activePolicy.file_url && (
                    <div className="flex rounded-xl bg-slate-950/80 p-1 border border-white/10 [html.light_&]:bg-slate-100 [html.light_&]:border-slate-300">
                      <button
                        type="button"
                        onClick={() => setViewMode('text')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'text'
                            ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                            : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600 [html.light_&]:hover:text-[#0D1B2A]'
                        }`}
                      >
                        <BookOpen className="size-3.5" />
                        <span>{isEnglish ? 'Text' : 'Văn bản'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('pdf')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'pdf'
                            ? 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] shadow-sm'
                            : 'text-slate-400 hover:text-white [html.light_&]:text-slate-600 [html.light_&]:hover:text-[#0D1B2A]'
                        }`}
                      >
                        <Eye className="size-3.5" />
                        <span>{isEnglish ? 'View PDF' : 'Xem PDF'}</span>
                      </button>
                    </div>
                  )}

                  {activePolicy.file_url && (
                    <a
                      href={activePolicy.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#C99A47]/40 bg-[#C99A47]/10 px-3.5 py-2 text-xs font-bold text-[#E6C17A] [html.light_&]:text-amber-800 [html.light_&]:bg-amber-50 [html.light_&]:border-amber-300 transition-all hover:bg-[#C99A47]/20 hover:border-[#E6C17A] [html.light_&]:hover:bg-amber-100 hover:shadow-[0_0_15px_rgba(201,154,71,0.3)] active:scale-95"
                    >
                      <ExternalLink className="size-3.5" />
                      <span>{isEnglish ? 'Open PDF in new tab' : 'Mở PDF tab mới'}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* View Mode: PDF Frame or Formatted Text */}
              {viewMode === 'pdf' && activePolicy.file_url ? (
                <div className="mt-4 flex flex-col flex-1 min-h-0 space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 [html.light_&]:bg-amber-50 [html.light_&]:border-amber-200 px-4 py-2 text-xs text-[#E6C17A] [html.light_&]:text-amber-800 shrink-0">
                    <span className="flex items-center gap-2 font-medium">
                      <FileText className="size-4 shrink-0" />
                      {isEnglish ? 'Original document:' : 'Tài liệu gốc:'} {activePolicy.file_name || `${activePolicy.policy_type}.pdf`}
                    </span>
                    <a
                      href={activePolicy.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-bold hover:text-white [html.light_&]:hover:text-amber-900"
                    >
                      {isEnglish ? 'Download / View separate' : 'Tải / Xem riêng'}
                    </a>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-white/10 [html.light_&]:border-slate-200 bg-[#1a1e29] shadow-inner">
                    <iframe
                      title={activePolicy.title}
                      src={`${activePolicy.file_url}#toolbar=1&navpanes=1&view=FitH`}
                      className="h-full w-full bg-[#1a1e29]"
                    />
                  </div>
                </div>
              ) : (
                /* Formatted Text Reader */
                <div
                  ref={policyContentRef}
                  className="mt-5 flex-1 min-h-0 overflow-y-auto pr-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]"
                >
                  {activePolicy.markdown ? (
                    <PolicyMarkdownViewer content={activePolicy.markdown} />
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
                      <p className="text-sm text-slate-400">
                        {isEnglish
                          ? 'Detailed contents of this policy are provided in the attached PDF document.'
                          : 'Nội dung chi tiết của điều khoản này được cung cấp dưới dạng văn bản PDF đính kèm.'}
                      </p>
                      {activePolicy.file_url && (
                        <a
                          href={activePolicy.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold text-[#0D1B2A] transition-all hover:brightness-110"
                          style={{ background: 'linear-gradient(135deg, #C99A47, #E6C17A)' }}
                        >
                          <FileDown className="size-4" />
                          {isEnglish ? 'View full PDF document' : 'Xem toàn bộ tài liệu PDF'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400">
              <HelpCircle className="size-10 mx-auto text-slate-500 mb-3" />
              <p className="text-sm font-semibold">{isEnglish ? 'Please select a policy from the list on the left.' : 'Vui lòng chọn một điều khoản từ danh sách bên trái.'}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/**
 * Lightweight, high-contrast, beautiful Markdown renderer for policy text
 */
function PolicyMarkdownViewer({ content = '' }) {
  const blocks = useMemo(() => {
    return parseMarkdownToBlocks(content)
  }, [content])

  return (
    <article className="space-y-5 text-slate-200 [html.light_&]:text-slate-700 leading-relaxed text-[14px] sm:text-[15px]">
      {blocks.map((block, index) => {
        if (block.type === 'h1') {
          return null // Skip top h1 since page header already shows title
        }
        if (block.type === 'h2') {
          return (
            <div key={index} className="pt-3 pb-1 border-b border-white/10 [html.light_&]:border-slate-200 first:pt-0">
              <h3 className="font-display text-base sm:text-lg font-bold text-[#E6C17A] [html.light_&]:text-[#B45309] tracking-tight">
                {block.text}
              </h3>
            </div>
          )
        }
        if (block.type === 'h3') {
          return (
            <h4 key={index} className="font-bold text-white [html.light_&]:text-[#0D1B2A] text-sm sm:text-base mt-3">
              {block.text}
            </h4>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="space-y-2 pl-4 sm:pl-5 list-disc marker:text-[#E6C17A] [html.light_&]:marker:text-[#B45309]">
              {block.items.map((item, idx) => (
                <li key={idx} className="text-slate-300 [html.light_&]:text-slate-600 leading-normal pl-1">
                  <FormattedInlineText text={item} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index} className="text-slate-300 [html.light_&]:text-slate-600 leading-relaxed">
            <FormattedInlineText text={block.text} />
          </p>
        )
      })}
    </article>
  )
}

function parseMarkdownToBlocks(markdown = '') {
  const lines = markdown.split(/\r?\n/)
  const blocks = []
  let currentList = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) {
      if (currentList) {
        blocks.push(currentList)
        currentList = null
      }
      continue
    }

    if (line.startsWith('# ')) {
      if (currentList) {
        blocks.push(currentList)
        currentList = null
      }
      blocks.push({ type: 'h1', text: line.replace(/^#\s+/, '') })
      continue
    }

    if (line.startsWith('## ')) {
      if (currentList) {
        blocks.push(currentList)
        currentList = null
      }
      blocks.push({ type: 'h2', text: line.replace(/^##\s+/, '') })
      continue
    }

    if (line.startsWith('### ')) {
      if (currentList) {
        blocks.push(currentList)
        currentList = null
      }
      blocks.push({ type: 'h3', text: line.replace(/^###\s+/, '') })
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const itemText = line.replace(/^[-*]\s+/, '')
      if (!currentList) {
        currentList = { type: 'list', items: [itemText] }
      } else {
        currentList.items.push(itemText)
      }
      continue
    }

    if (currentList) {
      blocks.push(currentList)
      currentList = null
    }

    blocks.push({ type: 'p', text: line })
  }

  if (currentList) {
    blocks.push(currentList)
  }

  return blocks
}

function FormattedInlineText({ text = '' }) {
  // Support bold **text** and *italic*
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-bold text-white [html.light_&]:text-[#0D1B2A]">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return part
      })}
    </>
  )
}
