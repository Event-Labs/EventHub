import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  ShieldAlert,
  Ticket,
} from 'lucide-react'
import { renderCosmicTitle } from '@/lib/formatTitle.jsx'
import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import {
  fetchMyComplaints,
  getCategoryLabel,
  getCategoryBadgeClass,
  getStatusLabel,
  getStatusBadgeClass,
} from '@/services/complaints.js'
import { CustomerComplaintModal } from '@/components/CustomerComplaintModal.jsx'

function formatDateTime(value, isEnglish = false) {
  if (!value) return 'N/A'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return String(value)
    return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return String(value)
  }
}

export function CustomerComplaintsPage() {
  const { isEnglish } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = hasAuthSession()

  const [isModalOpen, setIsModalOpen] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
    }
  }, [isAuthenticated, location.pathname, location.search, navigate])

  // Automatically open modal if ?new=true
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('new') === 'true') {
      setIsModalOpen(true)
    }
  }, [location.search])

  const complaintsQuery = useQuery({
    queryKey: ['my-complaints'],
    queryFn: fetchMyComplaints,
    enabled: Boolean(isAuthenticated),
    refetchInterval: 30_000,
  })

  if (!isAuthenticated) {
    return null
  }

  const complaints = Array.isArray(complaintsQuery.data) ? complaintsQuery.data : []

  return (
    <div className="force-dark mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 pt-1 sm:pt-2 pb-8 sm:pb-12 text-slate-100">
      {/* Compact Header: Title + Action Button on ONE line */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight" style={{ color: '#ffffff' }}>
            {renderCosmicTitle(isEnglish ? 'Complaints & Inquiries' : 'Khiếu nại & Phản ánh')}
          </h1>
          {complaints.length > 0 && (
            <span
              className="rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-xs font-bold"
              style={{ color: '#fcd34d' }}
            >
              {complaints.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold shadow-md transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
          style={{
            background: 'linear-gradient(135deg, #C99A47, #E6C17A)',
            color: '#081126',
          }}
        >
          <Plus className="size-4" style={{ color: '#081126' }} />
          <span style={{ color: '#081126' }}>{isEnglish ? 'New Complaint' : 'Gửi khiếu nại mới'}</span>
        </button>
      </div>

      {complaintsQuery.isLoading ? (
        <div className="glass-panel rounded-2xl border border-white/15 bg-slate-900/80 backdrop-blur-xl p-8 text-center shadow-xl">
          <Loader2 className="size-6 animate-spin mx-auto text-amber-400 mb-2.5" style={{ color: '#f59e0b' }} />
          <p className="text-sm font-semibold text-slate-200" style={{ color: '#e2e8f0' }}>
            {isEnglish ? 'Loading your complaints...' : 'Đang tải danh sách khiếu nại...'}
          </p>
        </div>
      ) : complaints.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-white/15 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 text-center space-y-3.5 shadow-xl">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white" style={{ color: '#ffffff' }}>
              {isEnglish ? 'You have no active complaints' : 'Bạn chưa có khiếu nại nào'}
            </h3>
            <p
              className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed"
              style={{ color: '#cbd5e1' }}
            >
              {isEnglish
                ? 'If you encounter any issues with ticket verification, event cancellations, or organizer conduct, feel free to file a report directly to Admin.'
                : 'Nếu bạn gặp sự cố khi tham gia sự kiện, sự cố check-in, hủy hoãn hoặc thái độ Ban tổ chức không minh bạch, hãy gửi phản ánh để Admin hỗ trợ ngay.'}
            </p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition cursor-pointer"
              style={{ color: '#fcd34d' }}
            >
              <Plus className="size-4" style={{ color: '#fcd34d' }} />
              <span>{isEnglish ? 'File a complaint now' : 'Tạo khiếu nại ngay'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {complaints.map((item) => (
              <div
                key={item.id}
                className="glass-panel rounded-3xl border border-white/15 bg-slate-900/80 backdrop-blur-xl p-5 sm:p-6 shadow-xl space-y-4 hover:border-amber-400/40 transition"
              >
                {/* Header Row: ID, Date, Category & Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-white/10 pb-3.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-black text-sky-400" style={{ color: '#38bdf8' }}>
                      #{String(item.id || '').slice(0, 8)}
                    </span>
                    <span className="text-slate-500 text-xs">•</span>
                    <span className="text-xs text-slate-300 flex items-center gap-1" style={{ color: '#cbd5e1' }}>
                      <Clock className="size-3.5 text-slate-400" />
                      {formatDateTime(item.created_at, isEnglish)}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${getCategoryBadgeClass(item.category)}`}>
                      {getCategoryLabel(item.category)}
                    </span>
                  </div>

                  <div>
                    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${getStatusBadgeClass(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                </div>

                {/* Event or Target Context */}
                {(item.event_title || item.organizer_name || item.ticket_code) && (
                  <div className="flex items-center gap-3 text-xs flex-wrap bg-white/5 border border-white/10 rounded-2xl p-3 text-slate-200">
                    {item.event_title && (
                      <div className="flex items-center gap-1.5 font-semibold text-white" style={{ color: '#ffffff' }}>
                        <Calendar className="size-3.5 text-amber-400 shrink-0" style={{ color: '#fbbf24' }} />
                        <span>{item.event_title}</span>
                      </div>
                    )}
                    {item.organizer_name && (
                      <div className="flex items-center gap-1.5 text-slate-300" style={{ color: '#cbd5e1' }}>
                        <Building2 className="size-3.5 text-purple-400 shrink-0" style={{ color: '#c084fc' }} />
                        <span>BTC: {item.organizer_name}</span>
                      </div>
                    )}
                    {item.ticket_code && (
                      <div className="flex items-center gap-1.5 font-mono text-sky-400" style={{ color: '#38bdf8' }}>
                        <Ticket className="size-3.5 shrink-0" />
                        <span>Vé: {item.ticket_code}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Complaint Body */}
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-white" style={{ color: '#ffffff' }}>
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line" style={{ color: '#e2e8f0' }}>
                    {item.description}
                  </p>
                </div>

                {/* Attached Evidence Preview */}
                {Array.isArray(item.evidence_urls) && item.evidence_urls.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1" style={{ color: '#fda4af' }}>
                      <ImageIcon className="size-3.5" />
                      {isEnglish ? 'Attached Evidence:' : 'Ảnh minh chứng:'}
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      {item.evidence_urls.map((imgUrl, idx) => (
                        <a
                          key={idx}
                          href={imgUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="size-16 rounded-xl overflow-hidden border border-white/20 bg-black block group relative"
                        >
                          <img
                            src={imgUrl}
                            alt={`Evidence ${idx + 1}`}
                            className="size-full object-cover group-hover:scale-105 transition"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Resolution Feedback Banner */}
                {item.admin_note && (
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-1.5 text-xs text-slate-100">
                    <div className="flex items-center gap-2 font-bold text-emerald-400" style={{ color: '#34d399' }}>
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>{isEnglish ? 'Admin Resolution Feedback:' : 'Phản hồi từ Ban Quản trị EventHub:'}</span>
                    </div>
                    <p className="text-xs text-slate-100 pl-6 leading-relaxed" style={{ color: '#f1f5f9' }}>
                      &ldquo;{item.admin_note}&rdquo;
                    </p>
                    {item.resolved_at && (
                      <p className="text-[11px] text-slate-300 pl-6 pt-0.5" style={{ color: '#cbd5e1' }}>
                        {isEnglish ? 'Handled at: ' : 'Thời gian xử lý: '}
                        {formatDateTime(item.resolved_at, isEnglish)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {/* Complaint Modal (mounted only when opened) */}
      {isModalOpen && (
        <CustomerComplaintModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['my-complaints'] })
          }}
        />
      )}
    </div>
  )
}

export default CustomerComplaintsPage
