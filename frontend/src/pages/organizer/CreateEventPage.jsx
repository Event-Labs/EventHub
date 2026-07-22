import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchEventCategories } from '@/services/events.js'
import {
  createOrganizerEvent,
  fetchOrganizerEvent,
  fetchOrganizerVenues,
  submitOrganizerEvent,
  updateOrganizerEvent,
} from '@/services/organizerEvents.js'
import { getVenueSeatMaps } from '@/services/organizerVenues.js'
import { assignZones, getSeatMap } from '@/services/organizerSeatMaps.js'
import { SeatMapPreview } from './SeatMapEditor.jsx'
import { ConfirmModal } from './OrganizerComponents.jsx'
import { uploadEventBanner, uploadEventThumbnail } from '@/services/uploads.js'
import { fetchCurrentPlan } from '@/services/subscriptions.js'
import RichTextEditor from '@/components/RichTextEditor.jsx'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const STEP_LABELS = [
  'Thông tin sự kiện',
  'Ngày giờ & Địa điểm',
  'Hạng vé & Sơ đồ ghế',
  'Chính sách & Cài đặt',
  'Xem trước & Gửi duyệt',
]

const INITIAL_FORM = {
  title: '',
  category_id: '',
  tags: [],
  format: 'OFFLINE',
  visibility: 'PUBLIC',
  short_description: '',
  description: `<p><strong>[Tóm tắt ngắn gọn về sự kiện:</strong> Nội dung chính của sự kiện, điểm đặc sắc nhất và lý do khiến người tham gia không nên bỏ lỡ]</p><br/><p><strong>Chi tiết sự kiện:</strong></p><ul><li>Chương trình chính: [Liệt kê những hoạt động nổi bật trong sự kiện: các phần trình diễn, khách mời đặc biệt, lịch trình các tiết mục cụ thể nếu có.]</li><li>Khách mời: [Thông tin về các khách mời đặc biệt, nghệ sĩ, diễn giả sẽ tham gia sự kiện. Có thể bao gồm phần mô tả ngắn gọn về họ và những gì họ sẽ mang lại cho sự kiện.]</li><li>Trải nghiệm đặc biệt: [Nếu có các hoạt động đặc biệt khác như workshop, khu trải nghiệm, photo booth, khu vực check-in hay các phần quà/ưu đãi dành riêng cho người tham dự.]</li></ul><br/><p><strong>[Chèn ảnh sơ đồ chỗ ngồi tại đây]</strong></p><br/><p><strong>Điều khoản và điều kiện:</strong></p><p>[TnC] sự kiện</p><p>Lưu ý về điều khoản trẻ em</p><p>Lưu ý về điều khoản VAT</p>`,
  thumbnail_url: '',
  banner_url: '',
  sessions: [],
  ticketTypes: [],
  seating_rules: {
    require_adjacent_seats: false,
    require_same_row: false,
    disallow_single_seat_left: false,
  },
  refund_policy: { allow_refunds: false, deadline_days: 7 },
  additional_terms: '',
  require_attendee_info: false,
}

function Icon({ name, className = '', style = {} }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={style}>
      {name}
    </span>
  )
}

function combineDateTime(date, time) {
  if (!date || !time) return null
  return new Date(`${date}T${time}`).toISOString()
}

function splitDateTime(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const date = d.toISOString().slice(0, 10)
  const time = d.toTimeString().slice(0, 5)
  return { date, time }
}

function newClientKey() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function WizardStepper({ currentStep, maxCompletedStep, onStepClick }) {
  const progress = ((currentStep - 1) / (STEP_LABELS.length - 1)) * 100

  return (
    <div className="mb-10 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between relative">
        <div className="absolute top-5 left-0 w-full h-[2px] bg-border-soft/30 -z-10" />
        <div
          className="absolute top-5 left-0 h-[2px] bg-tertiary -z-10 transition-all"
          style={{ width: `${progress}%` }}
        />
        {STEP_LABELS.map((label, index) => {
          const step = index + 1
          const isActive = step === currentStep
          const isCompleted = step < currentStep
          const isClickable = step <= maxCompletedStep

          return (
            <button
              key={label}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step)}
              className={`flex flex-col items-center gap-2 relative ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm transition-all z-10 ${isActive
                  ? 'bg-tertiary text-white shadow-md'
                  : isCompleted
                    ? 'bg-tertiary text-white'
                    : 'bg-panel-soft border-2 border-border-soft/50 text-content/80'
                  }`}
              >
                {isCompleted && !isActive ? (
                  <Icon name="check" className="text-[20px]" />
                ) : (
                  step
                )}
              </div>
              <span
                className={`font-medium text-[13px] leading-[18px] text-center max-w-[120px] ${isActive || isCompleted ? 'text-primary font-bold' : 'text-subtle'
                  }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Step1EventInfo({
  formData,
  setFormData,
  categories,
  tagInput,
  setTagInput,
  onThumbnailUpload,
  onBannerUpload,
  uploadingThumb,
  uploadingBanner,
}) {
  const addTag = () => {
    const tag = tagInput.trim()
    if (!tag || formData.tags.includes(tag)) return
    setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
    setTagInput('')
  }

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-8">
        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 hover:border-border-soft/60 transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="info" className="text-tertiary" />
            Thông tin cơ bản
          </h3>
          <div className="space-y-6">
            <div>
              <label className="block text-[13px] font-medium mb-2 text-subtle">Tên sự kiện*</label>
              <input
                className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 focus:border-tertiary outline-none transition"
                placeholder="Ví dụ: Hội nghị Công nghệ Toàn cầu 2024"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium mb-2 text-subtle">Danh mục*</label>
                <select
                  className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 outline-none"
                  value={formData.category_id}
                  onChange={(e) => setFormData((p) => ({ ...p, category_id: e.target.value }))}
                >
                  <option value="">Chọn danh mục</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2 text-subtle">Tags</label>
                <div className="flex flex-wrap gap-2 items-center p-1.5 border border-border-soft/40 rounded-lg bg-panel-soft">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-1 bg-tertiary/15 text-tertiary rounded text-xs font-semibold"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            tags: p.tags.filter((t) => t !== tag),
                          }))
                        }
                      >
                        <Icon name="close" className="text-[14px] hover:text-error" />
                      </button>
                    </span>
                  ))}
                  <input
                    className="border-none bg-transparent outline-none p-1 text-sm flex-1 min-w-[80px] text-content placeholder:text-muted"
                    placeholder="Thêm tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="description" className="text-tertiary" />
            Mô tả
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[13px] font-medium text-subtle">Mô tả ngắn*</label>
                <span className="text-xs text-muted">{formData.short_description.length} / 150</span>
              </div>
              <textarea
                className="w-full px-4 py-2.5 border border-border-soft/40 rounded-lg text-sm bg-panel-soft text-content focus:ring-2 focus:ring-secondary/30 outline-none resize-none placeholder:text-muted"
                placeholder="Tóm tắt ngắn gọn về sự kiện của bạn..."
                rows={2}
                maxLength={150}
                value={formData.short_description}
                onChange={(e) => setFormData((p) => ({ ...p, short_description: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-2 text-subtle">* Thông tin sự kiện</label>
              <RichTextEditor
                value={formData.description}
                onChange={(val) => setFormData((p) => ({ ...p, description: val }))}
              />
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-content">
            <Icon name="image" className="text-tertiary" />
            Ảnh sự kiện
          </h3>
          <div className="flex flex-col md:flex-row gap-6 h-auto md:h-[240px]">
            <div className="w-full md:w-1/3 flex flex-col">
              <label className="block text-[13px] font-medium mb-2 text-subtle shrink-0">Ảnh đại diện (1:1)*</label>
              <label className="flex-1 w-full rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-border-soft/40 hover:border-tertiary cursor-pointer overflow-hidden transition bg-panel-soft">
                {formData.thumbnail_url ? (
                  <img src={formData.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="cloud_upload" className="text-muted mb-2" style={{ fontSize: 32 }} />
                    <p className="text-xs font-semibold mb-1 text-subtle">{uploadingThumb ? 'Đang tải lên...' : 'Nhấn để tải lên'}</p>
                    <p className="text-[10px] text-muted">Khuyên dùng: 1080x1080px</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingThumb}
                  onChange={(e) => onThumbnailUpload(e.target.files?.[0])}
                />
              </label>
            </div>
            <div className="w-full md:w-2/3 flex flex-col">
              <label className="block text-[13px] font-medium mb-2 text-subtle shrink-0">Ảnh bìa (16:9)*</label>
              <label className="flex-1 w-full rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-border-soft/40 hover:border-tertiary cursor-pointer overflow-hidden transition bg-panel-soft">
                {formData.banner_url ? (
                  <img src={formData.banner_url} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="landscape" className="text-muted mb-2" style={{ fontSize: 40 }} />
                    <p className="text-xs font-semibold mb-1 text-subtle">{uploadingBanner ? 'Đang tải lên...' : 'Kéo thả hoặc nhấn để chọn file'}</p>
                    <p className="text-[10px] text-muted">Khuyên dùng: 1920x1080px. JPG, PNG (Tối đa 5MB)</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingBanner}
                  onChange={(e) => onBannerUpload(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </section>
      </div >

      <div className="col-span-12 lg:col-span-4 space-y-6 sticky top-24">
        <div className="bg-surface border border-border-soft/30 rounded-xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="relative aspect-video bg-panel-soft">
            {formData.banner_url ? (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <Icon name="image" className="text-muted" style={{ fontSize: 48 }} />
              </div>
            )}
            <div className="absolute top-3 left-3 px-2 py-1 bg-panel-soft/80 backdrop-blur-md rounded text-[10px] font-bold uppercase text-subtle">
              Xem trước
            </div>
          </div>
          <div className="p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className={`text-[20px] font-semibold leading-tight ${formData.title ? 'text-content' : 'text-muted italic'}`}>
                  {formData.title || 'Sự kiện không tiêu đề'}
                </h4>
                <p className="text-xs text-muted mt-1 italic">
                  {categories.find((c) => c.id === formData.category_id)?.name || 'Chưa chọn danh mục'}
                </p>
              </div>
              <span className="px-2 py-1 bg-panel-soft text-subtle rounded text-xs font-semibold border border-border-soft/30">Bản nháp</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="location_on" className="text-tertiary text-[18px]" />
              <span className="text-sm text-content">{formData.format === 'ONLINE' ? 'Sự kiện trực tuyến' : formData.format === 'HYBRID' ? 'Sự kiện kết hợp' : 'Sự kiện trực tiếp'}</span>
            </div>
            <div className="mt-6">
              <div className="flex justify-between mb-2">
                <span className="text-[13px] font-medium text-subtle">Tiến độ thiết lập</span>
                <span className="text-[13px] text-tertiary font-bold">20%</span>
              </div>
              <div className="w-full h-2 bg-panel-soft rounded-full overflow-hidden border border-border-soft/20">
                <div className="w-1/5 h-full bg-tertiary rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  )
}

function Step2ScheduleVenue({ formData, setFormData, venues }) {
  const currentDate = new Date()
  const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
  const [expandedSessions, setExpandedSessions] = useState(() => {
    return formData.sessions.reduce((acc, s) => ({ ...acc, [s.id || s.clientKey]: true }), {})
  })

  const toggleSession = (key) => setExpandedSessions((p) => ({ ...p, [key]: !p[key] }))

  const addSession = () => {
    const key = newClientKey()
    setFormData((p) => ({
      ...p,
      sessions: [
        ...p.sessions,
        {
          clientKey: key,
          session_name: '',
          start_date: '',
          start_time: '',
          end_date: '',
          end_time: '',
          venue_id: '',
          checkin_start_time: '',
          seat_map_id: null,
          seating_type: 'GENERAL',
          zone_assignments: [],
        },
      ],
    }))
    setExpandedSessions((p) => ({ ...p, [key]: true }))
  }

  const updateSession = (key, field, value) => {
    setFormData((p) => {
      let nextTickets = p.ticketTypes;
      const nextSessions = p.sessions.map((s) => {
        if (String(s.id || s.clientKey) === String(key)) {
          if (field === 'venue_id' && s.venue_id !== value) {
            nextTickets = nextTickets.filter(tt => String(tt.session_key) !== String(key) || !tt.is_seated);
            return { ...s, [field]: value, seat_map_id: null, zone_assignments: [] };
          }
          return { ...s, [field]: value };
        }
        return s;
      });
      return { ...p, sessions: nextSessions, ticketTypes: nextTickets };
    })
  }

  const updateSessionFields = (key, fieldsObj) => {
    setFormData((p) => {
      let nextTickets = p.ticketTypes;
      const nextSessions = p.sessions.map((s) => {
        if (String(s.id || s.clientKey) === String(key)) {
          let updated = { ...s, ...fieldsObj };
          if (fieldsObj.venue_id !== undefined && s.venue_id !== fieldsObj.venue_id) {
            nextTickets = nextTickets.filter(tt => String(tt.session_key) !== String(key) || !tt.is_seated);
            updated = { ...updated, seat_map_id: null, zone_assignments: [] };
          }
          return updated;
        }
        return s;
      });
      return { ...p, sessions: nextSessions, ticketTypes: nextTickets };
    })
  }

  const removeSession = (key) => {
    setFormData((p) => ({
      ...p,
      sessions: p.sessions.filter((s) => String(s.id || s.clientKey) !== String(key)),
      ticketTypes: p.ticketTypes.filter((tt) => String(tt.session_key) !== String(key)),
    }))
  }

  const selectedVenue = venues.find((v) => v.id === formData.sessions[0]?.venue_id)

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-8">
        <section className="bg-surface rounded-xl border border-border-soft/30 p-8 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Icon name="calendar_today" className="text-tertiary" />
              <h2 className="text-[20px] font-semibold text-content">Lịch sự kiện</h2>
            </div>
            <button
              type="button"
              onClick={addSession}
              className="flex items-center gap-2 px-4 py-2 text-primary font-medium text-sm hover:bg-tertiary/10 rounded-lg transition"
            >
              <Icon name="add" className="text-[18px]" />
              Thêm phiên
            </button>
          </div>
          <div className="space-y-6">
            {formData.sessions.map((session, index) => {
              const key = session.id || session.clientKey
              const isExpanded = expandedSessions[key]
              return (
                <div key={key} className="border border-border-soft/40 rounded-xl relative bg-panel-soft/30 overflow-hidden mb-4 shadow-sm transition-colors">
                  <div
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-surface/70 transition-colors"
                    onClick={() => toggleSession(key)}
                  >
                    <div className="flex items-center gap-3 w-1/2">
                      <div className="text-tertiary flex items-center justify-center">
                        <Icon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-[24px]" />
                      </div>
                      <input
                        type="text"
                        value={session.session_name || ''}
                        placeholder={`Phiên ${index + 1}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateSession(key, 'session_name', e.target.value)}
                        className="font-bold text-content text-[15px] bg-transparent border-b border-transparent focus:border-tertiary focus:outline-none focus:ring-0 px-2 py-1 w-full"
                      />
                    </div>
                    {formData.sessions.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeSession(key); }}
                        className="text-muted hover:text-error transition p-2"
                        title="Xóa phiên"
                      >
                        <Icon name="delete" />
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="p-6 pt-4 border-t border-border-soft/30 bg-panel-soft/10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div>
                          <label className="text-[13px] text-subtle block mb-2 font-medium">Thời gian bắt đầu*</label>
                          <input
                            type="datetime-local"
                            className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none"
                            value={session.start_date && session.start_time ? `${session.start_date}T${session.start_time}` : ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (!val) {
                                updateSessionFields(key, { start_date: '', start_time: '' })
                              } else {
                                const [d, t] = val.split('T')
                                updateSessionFields(key, { start_date: d || '', start_time: t || '' })
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[13px] text-subtle block mb-2 font-medium">Thời gian kết thúc*</label>
                          <input
                            type="datetime-local"
                            className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary focus:ring-1 focus:ring-secondary/30 outline-none"
                            value={session.end_date && session.end_time ? `${session.end_date}T${session.end_time}` : ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (!val) {
                                updateSessionFields(key, { end_date: '', end_time: '' })
                              } else {
                                const [d, t] = val.split('T')
                                updateSessionFields(key, { end_date: d || '', end_time: t || '' })
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="text-[13px] text-subtle block mb-2 font-medium">Thời gian check-in (Tùy chọn)</label>
                        <input
                          type="datetime-local"
                          className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary outline-none"
                          value={session.checkin_start_date && session.checkin_start_time ? `${session.checkin_start_date}T${session.checkin_start_time}` : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (!val) {
                              updateSessionFields(key, { checkin_start_date: '', checkin_start_time: '' })
                            } else {
                              const [d, t] = val.split('T')
                              updateSessionFields(key, { checkin_start_date: d || '', checkin_start_time: t || '' })
                            }
                          }}
                        />
                      </div>

                      {(() => {
                        if (!session.start_date || !session.start_time) return null
                        const startMs = new Date(`${session.start_date}T${session.start_time}`).getTime()
                        const nowMs = Date.now()
                        const hoursDiff = (startMs - nowMs) / (60 * 60 * 1000)
                        if (hoursDiff <= 48 && hoursDiff > 0) {
                          return (
                            <div className="mb-4 p-4 rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs space-y-1.5">
                              <div className="flex items-center gap-1.5 font-bold">
                                <Icon name="warning" className="text-sm text-warning" />
                                <span>Cảnh báo tạo phiên sát giờ ({Math.round(hoursDiff * 10) / 10} giờ tới):</span>
                              </div>
                              <p className="leading-relaxed">
                                Phiên này sẽ bắt đầu trong vòng 48h tới. Khi sự kiện được Admin phê duyệt, hệ thống sẽ tự động bật chế độ <strong>Khóa thời gian (Time-Lock 48h)</strong>. Lúc đó bạn sẽ không thể tự do chỉnh sửa thông tin/suất diễn trừ khi liên hệ Admin trợ giúp.
                              </p>
                            </div>
                          )
                        }
                        return null
                      })()}

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-[13px] text-subtle block font-medium">Chọn địa điểm*</label>
                          <button
                            type="button"
                            onClick={() => window.open('/organizer/venues', '_blank')}
                            className="text-[13px] text-primary hover:underline font-semibold"
                          >
                            + Tạo địa điểm mới
                          </button>
                        </div>
                        <select
                          className="w-full h-11 px-4 rounded-lg border border-border-soft/40 bg-panel-soft text-content text-sm focus:border-tertiary outline-none"
                          value={session.venue_id || ''}
                          onChange={(e) => updateSession(key, 'venue_id', e.target.value)}
                        >
                          <option value="">Chọn địa điểm</option>
                          {venues.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}{v.city ? ` (${v.city})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {!formData.sessions.length && (
              <button
                type="button"
                onClick={addSession}
                className="w-full py-8 border-2 border-dashed border-border-soft/40 rounded-xl text-subtle hover:border-tertiary hover:text-tertiary transition"
              >
                + Thêm phiên đầu tiên
              </button>
            )}
          </div>
        </section>

        {
          selectedVenue && (
            <section className="bg-surface rounded-xl border border-border-soft/30 p-8 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <div className="flex items-center gap-3 mb-6">
                <Icon name="location_on" className="text-tertiary" />
                <h2 className="text-[20px] font-semibold text-content">Chi tiết địa điểm</h2>
              </div>
              <div className="p-6 bg-panel-soft rounded-xl border border-border-soft/30">
                <h3 className="text-[20px] font-semibold text-content">{selectedVenue.name}</h3>
                <p className="text-sm text-subtle flex items-center gap-1 mt-2">
                  <Icon name="pin_drop" className="text-[16px]" />
                  {[selectedVenue.address_line, selectedVenue.district, selectedVenue.city].filter(Boolean).join(', ')}
                </p>
                {(selectedVenue.max_seats > 0 || selectedVenue.seat_count > 0) && (
                  <p className="text-sm mt-2 text-subtle">
                    Sức chứa tối đa: <span className="font-bold text-content">{selectedVenue.max_seats || selectedVenue.seat_count} chỗ</span> (Sơ đồ lớn nhất)
                  </p>
                )}
              </div>
            </section>
          )
        }
      </div >

      <div className="col-span-12 lg:col-span-4 sticky top-24">
        <div className="bg-surface rounded-xl border border-border-soft/30 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="bg-tertiary/15 p-6 border-b border-border-soft/30">
            <h3 className="text-[20px] font-semibold text-content mb-4">{formData.title || 'Sự kiện nháp'}</h3>
            <div className="space-y-3 text-sm text-subtle">
              <div className="flex items-center gap-2">
                <Icon name="calendar_month" className="text-sm" />
                <span>{formData.sessions.length} phiên</span>
              </div>
              {selectedVenue && (
                <div className="flex items-center gap-2">
                  <Icon name="location_on" className="text-sm" />
                  <span>{selectedVenue.name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="p-6">
            <div className="flex justify-between mb-2">
              <span className="text-[13px] font-medium text-subtle">Tiến độ thiết lập</span>
              <span className="text-xs text-tertiary font-bold">45%</span>
            </div>
            <div className="w-full h-2 bg-panel-soft rounded-full overflow-hidden border border-border-soft/20">
              <div className="w-[45%] h-full bg-tertiary rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div >
  )
}

function formatPriceString(val) {
  if (val === '' || val === null || val === undefined) return ''
  const num = typeof val === 'number' ? val : Number(String(val).replace(/\D/g, ''))
  if (isNaN(num)) return ''
  return num.toLocaleString('vi-VN')
}

function parsePriceNumber(str) {
  if (!str) return ''
  const cleaned = String(str).replace(/\D/g, '')
  return cleaned === '' ? '' : Number(cleaned)
}

function getGroupedMapItems(seatMap) {
  if (!seatMap) return []

  const countsByZoneId = (seatMap.seats || []).reduce((acc, s) => {
    if (s.is_disabled) return acc
    if (!s.zone_id) return acc
    acc[s.zone_id] = (acc[s.zone_id] || 0) + 1
    return acc
  }, {})

  const groupsMap = new Map()

  ;(seatMap.zones || []).forEach((zone) => {
    const normName = (zone.name || 'Khu vực').trim()
    const key = `seated:${normName.toLowerCase()}`
    const seatCount = countsByZoneId[zone.id] || 0
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        groupKey: key,
        name: normName,
        isSeated: true,
        zoneIds: [zone.id],
        standingAreaIds: [],
        totalQuantity: seatCount,
        colors: [zone.color || '#3B82F6'],
        blockCount: 1,
      })
    } else {
      const g = groupsMap.get(key)
      g.zoneIds.push(zone.id)
      g.totalQuantity += seatCount
      g.blockCount += 1
      if (zone.color && !g.colors.includes(zone.color)) g.colors.push(zone.color)
    }
  })

  ;(seatMap.config?.standingAreas || []).forEach((area) => {
    const normName = (area.name || 'Vùng đứng').trim()
    const key = `standing:${normName.toLowerCase()}`
    const cap = Number(area.capacity || 0)
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        groupKey: key,
        name: normName,
        isSeated: false,
        zoneIds: [],
        standingAreaIds: [area.id],
        totalQuantity: cap,
        colors: [area.color || '#EF4444'],
        blockCount: 1,
      })
    } else {
      const g = groupsMap.get(key)
      g.standingAreaIds.push(area.id)
      g.totalQuantity += cap
      g.blockCount += 1
      if (area.color && !g.colors.includes(area.color)) g.colors.push(area.color)
    }
  })

  return Array.from(groupsMap.values())
}

function TicketDescriptionModal({ isOpen, ticketName, initialDescription, onSave, onClose }) {
  const [desc, setDesc] = useState(initialDescription || '')

  useEffect(() => {
    setDesc(initialDescription || '')
  }, [initialDescription, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/40 bg-surface p-6 shadow-2xl space-y-4 text-content">
        <div className="flex items-center justify-between border-b border-border-soft/30 pb-3">
          <h3 className="text-base font-extrabold text-content">
            Mô tả loại vé: <span className="text-tertiary">{ticketName}</span>
          </h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-content text-sm font-bold">✕</button>
        </div>
        <div>
          <label className="text-xs text-subtle font-semibold mb-1.5 block">Nội dung mô tả vé (quyền lợi, lối đi, quà tặng...):</label>
          <textarea
            rows={4}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="VD: Bao gồm nước ngọt + snack miễn phí, vị trí gần sân khấu..."
            className="w-full rounded-xl border border-border-soft/40 bg-panel-soft p-3 text-xs text-content outline-none focus:border-tertiary shadow-inner leading-relaxed"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-subtle hover:bg-panel-soft hover:text-content transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(desc)
            }}
            className="org-btn-primary px-5 py-2 text-xs"
          >
            Lưu mô tả
          </button>
        </div>
      </div>
    </div>
  )
}

function Step3TicketsSeats({ formData, setFormData, venues }) {
  const [activeTab, setActiveTab] = useState(0)
  const [seatMapOptions, setSeatMapOptions] = useState({})
  const [loadedSeatMap, setLoadedSeatMap] = useState(null)
  const [loadingMaps, setLoadingMaps] = useState(false)
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const [descModalState, setDescModalState] = useState({
    isOpen: false,
    ticketName: '',
    initialDescription: '',
    onSave: null,
  })

  const sessions = formData.sessions
  const activeSession = sessions[activeTab]
  const sessionKey = activeSession ? activeSession.id || activeSession.clientKey : null
  const seatingType = activeSession?.seating_type || 'GENERAL'
  const venue = venues.find((v) => v.id === activeSession?.venue_id)

  const handleSyncSessionConfig = () => {
    if (!activeSession) return
    setFormData((p) => {
      let copiedCount = 0;
      const newSessions = p.sessions.map((s) => {
        if (String(s.id || s.clientKey) === String(sessionKey)) return s;
        if (s.venue_id !== activeSession.venue_id) return s;
        copiedCount++;
        return {
          ...s,
          seating_type: activeSession.seating_type,
          seat_map_id: activeSession.seat_map_id,
          zone_assignments: activeSession.zone_assignments ? [...activeSession.zone_assignments] : []
        }
      });

      if (copiedCount === 0 && p.sessions.length > 1) {
        window.dispatchEvent(new CustomEvent('eventhub:toast', { detail: { type: 'warning', message: 'Không có phiên nào khác cùng địa điểm để đồng bộ.' } }))
        return p;
      }

      const newTicketTypes = p.ticketTypes.filter((t) => String(t.session_key) === String(sessionKey))
      for (const s of newSessions) {
        if (String(s.id || s.clientKey) === String(sessionKey) || s.venue_id !== activeSession.venue_id) continue
        const cloned = newTicketTypes.map(t => {
          const idStr = String(t.id || t.clientKey);
          return {
            ...t,
            id: idStr.startsWith('tmp-') ? null : undefined,
            clientKey: newClientKey(),
            session_key: s.id || s.clientKey
          };
        })
        newTicketTypes.push(...cloned)
      }

      const untouchedTicketTypes = p.ticketTypes.filter((t) => {
        const sess = p.sessions.find(x => String(x.id || x.clientKey) === String(t.session_key));
        return sess && sess.venue_id !== activeSession.venue_id && String(sess.id || sess.clientKey) !== String(sessionKey);
      });

      return { ...p, sessions: newSessions, ticketTypes: [...newTicketTypes, ...untouchedTicketTypes] }
    })
    window.dispatchEvent(new CustomEvent('eventhub:toast', { detail: { type: 'success', message: 'Đã áp dụng cấu hình cho các phiên cùng địa điểm.' } }))
    setShowSyncConfirm(false)
  }

  const sessionTickets = formData.ticketTypes.filter((tt) => tt.session_key === sessionKey)

  useEffect(() => {
    if (!activeSession?.venue_id) return
    let cancelled = false
    setSeatMapOptions((prev) => {
      if (prev[activeSession.venue_id]) return prev
      return prev
    })
    if (seatMapOptions[activeSession.venue_id]) return
    getVenueSeatMaps(activeSession.venue_id)
      .then((maps) => {
        if (cancelled) return
        setSeatMapOptions((prev) => (prev[activeSession.venue_id] ? prev : { ...prev, [activeSession.venue_id]: maps }))
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [activeSession?.venue_id])

  useEffect(() => {
    if (!activeSession?.seat_map_id) {
      setLoadedSeatMap(null)
      return
    }
    setLoadingMaps(true)
    getSeatMap(activeSession.seat_map_id)
      .then((sm) => {
        setLoadedSeatMap(sm)
        if (sessionKey) {
          const groups = getGroupedMapItems(sm)
          setFormData((p) => {
            const currentSessionTickets = p.ticketTypes.filter((tt) => String(tt.session_key) === String(sessionKey))
            const missingGroups = groups.filter(
              (g) => !currentSessionTickets.some((tt) => tt.name?.trim().toLowerCase() === g.name.trim().toLowerCase())
            )
            if (missingGroups.length === 0) return p

            const newTickets = missingGroups.map((g) => ({
              clientKey: newClientKey(),
              session_key: sessionKey,
              name: g.name,
              description: '',
              price: '',
              quantity: g.totalQuantity,
              is_seated: g.isSeated,
              zone_ids: g.zoneIds,
              standing_area_ids: g.standingAreaIds,
              zone_id: g.zoneIds[0] || null,
              standing_area_id: g.standingAreaIds[0] || null,
            }))

            return {
              ...p,
              ticketTypes: [...p.ticketTypes, ...newTickets],
            }
          })
        }
      })
      .catch(console.error)
      .finally(() => setLoadingMaps(false))
  }, [activeSession?.seat_map_id, sessionKey])

  const updateActiveSession = (updates) => {
    setFormData((p) => ({
      ...p,
      sessions: p.sessions.map((s, i) => (i === activeTab ? { ...s, ...updates } : s)),
    }))
  }

  const setSeatingType = (type) => {
    if (!sessionKey) return
    updateActiveSession({
      seating_type: type,
      seat_map_id: type === 'ASSIGNED' ? activeSession.seat_map_id : null,
      zone_assignments: type === 'ASSIGNED' ? activeSession.zone_assignments || [] : [],
    })
    if (type === 'GENERAL') {
      setLoadedSeatMap(null)
      setFormData((p) => ({
        ...p,
        ticketTypes: p.ticketTypes
          .filter((tt) => tt.session_key !== sessionKey)
          .concat(
            p.ticketTypes.filter((tt) => tt.session_key === sessionKey).length
              ? []
              : [
                {
                  clientKey: newClientKey(),
                  session_key: sessionKey,
                  name: '',
                  description: '',
                  price: '',
                  quantity: 1,
                  is_seated: false,
                },
              ],
          ),
      }))
    } else {
      setFormData((p) => ({
        ...p,
        ticketTypes: p.ticketTypes.filter((tt) => tt.session_key !== sessionKey),
      }))
    }
  }

  const handleSeatMapSelect = async (seatMapId) => {
    if (!sessionKey || !seatMapId) return
    try {
      const sm = await getSeatMap(seatMapId)
      setLoadedSeatMap(sm)
      const groups = getGroupedMapItems(sm)
      const allNewTickets = []
      const zoneAssignments = []

      groups.forEach((group) => {
        const clientKey = newClientKey()
        allNewTickets.push({
          clientKey,
          session_key: sessionKey,
          name: group.name,
          description: '',
          price: '',
          quantity: group.totalQuantity,
          is_seated: group.isSeated,
          zone_ids: group.zoneIds,
          standing_area_ids: group.standingAreaIds,
          zone_id: group.zoneIds[0] || null,
          standing_area_id: group.standingAreaIds[0] || null,
        })

        group.zoneIds.forEach((zId) => {
          zoneAssignments.push({
            zone_id: zId,
            ticket_type_local_id: clientKey,
          })
        })
      })

      updateActiveSession({ seat_map_id: seatMapId, zone_assignments: zoneAssignments })
      setFormData((p) => ({
        ...p,
        ticketTypes: [...p.ticketTypes.filter((tt) => tt.session_key !== sessionKey), ...allNewTickets],
      }))
    } catch (err) {
      console.error(err)
    }
  }

  const addTicketType = () => {
    if (!sessionKey) return
    setFormData((p) => ({
      ...p,
      ticketTypes: [
        ...p.ticketTypes,
        {
          clientKey: newClientKey(),
          session_key: sessionKey,
          name: '',
          description: '',
          price: '',
          quantity: 1,
          is_seated: false,
        },
      ],
    }))
  }

  const updateTicket = (key, field, value) => {
    setFormData((p) => ({
      ...p,
      ticketTypes: p.ticketTypes.map((tt) =>
        String(tt.id || tt.clientKey) === String(key) ? { ...tt, [field]: value } : tt,
      ),
    }))
  }

  const removeTicket = (key) => {
    setFormData((p) => ({
      ...p,
      ticketTypes: p.ticketTypes.filter((tt) => String(tt.id || tt.clientKey) !== String(key)),
    }))
  }

  const totalQty = formData.ticketTypes.reduce((sum, tt) => sum + Number(tt.quantity || 0), 0)
  const totalRevenue = formData.ticketTypes.reduce(
    (sum, tt) => sum + Number(tt.price || 0) * Number(tt.quantity || 0),
    0,
  )

  const venueSeatMaps = seatMapOptions[activeSession?.venue_id] || []
  const unassignedCount = loadedSeatMap
    ? (loadedSeatMap.seats || []).filter((s) => !s.zone_id && !s.is_disabled).length
    : 0

  return (
    <div className="grid grid-cols-12 items-start gap-6">
      <div className="col-span-12 space-y-6 pb-24 lg:col-span-8">
        {sessions.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft/30 pb-4">
            <div className="flex flex-wrap gap-2">
              {sessions.map((s, i) => (
                <button
                  key={s.id || s.clientKey}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeTab === i
                    ? 'border-tertiary bg-tertiary/10 text-primary'
                    : 'border-border-soft/40 text-subtle hover:border-tertiary/50'
                    }`}
                >
                  {s.session_name || `Phiên ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <h2 className="mb-4 text-[20px] font-semibold text-content">Loại tổ chức</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSeatingType('GENERAL')}
              className={`rounded-xl border-2 p-5 text-left transition ${seatingType === 'GENERAL'
                ? 'border-tertiary bg-tertiary/10'
                : 'border-border-soft/40 hover:border-tertiary/50'
                }`}
            >
              <p className="mt-2 font-bold text-content">Không chỗ ngồi</p>
              <p className="text-sm text-subtle">Vé phổ thông / Không chọn chỗ</p>
            </button>
            <button
              type="button"
              onClick={() => setSeatingType('ASSIGNED')}
              className={`rounded-xl border-2 p-5 text-left transition ${seatingType === 'ASSIGNED'
                ? 'border-tertiary bg-tertiary/10'
                : 'border-border-soft/40 hover:border-tertiary/50'
                }`}
            >

              <p className="mt-2 font-bold text-content">Có chỗ ngồi</p>
              <p className="text-sm text-subtle">Chọn chỗ ngồi trên sơ đồ ghế</p>
            </button>
          </div>
        </section>

        {seatingType === 'ASSIGNED' && (
          <>
            <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <h2 className="mb-2 text-[20px] font-semibold text-content">Cấu hình quy tắc chỗ ngồi</h2>
              <p className="mb-4 text-sm text-subtle">
                Cấu hình quy tắc khi người dùng chọn ghế (áp dụng cho các session có chỗ ngồi).
              </p>
              <div className="space-y-3">
                {[
                  {
                    key: 'require_adjacent_seats',
                    label: 'Bắt buộc chọn ghế liền kề',
                  },
                  { key: 'require_same_row', label: 'Bắt buộc cùng một hàng' },
                  { key: 'disallow_single_seat_left', label: 'Không cho phép để lại ghế lẻ' },
                ].map((rule) => (
                  <label
                    key={rule.key}
                    className="flex items-center gap-3 rounded-lg border border-border-soft/30 bg-panel-soft/40 px-4 py-3 text-sm text-content hover:border-border-soft/60 transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-tertiary"
                      checked={Boolean(formData.seating_rules?.[rule.key])}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          seating_rules: {
                            ...(p.seating_rules || {}),
                            [rule.key]: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span className="font-semibold">{rule.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
              <h2 className="mb-2 text-[20px] font-semibold text-content">Sơ đồ ghế</h2>
              <p className="mb-4 text-sm text-subtle">
                Chọn sơ đồ cho địa điểm &quot;{venue?.name || '...'}&quot;
              </p>
              <select
                className="h-11 w-full rounded-lg border border-border-soft/40 bg-panel-soft text-content px-4 text-sm focus:border-tertiary outline-none"
                value={activeSession?.seat_map_id || ''}
                onChange={(e) => handleSeatMapSelect(e.target.value)}
              >
                <option value="">-- Chọn sơ đồ --</option>
                {venueSeatMaps.map((sm) => (
                  <option key={sm.id} value={sm.id}>
                    {sm.name} ({sm.seat_count || 0} ghế, {sm.zone_count || 0} khu vực)
                  </option>
                ))}
              </select>
              {loadingMaps && (
                <p className="mt-2 text-sm text-muted">Đang tải sơ đồ...</p>
              )}
              {loadedSeatMap && (
                <div className="mt-4 w-full">
                  <SeatMapPreview
                    seatMap={loadedSeatMap}
                    seats={loadedSeatMap.seats}
                    zones={loadedSeatMap.zones}
                    height={380}
                  />
                </div>
              )}
            </section>

            {loadedSeatMap && (() => {
              const groupedItems = getGroupedMapItems(loadedSeatMap)

              return (
                <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)] space-y-4">
                  <div>
                    <h2 className="text-[20px] font-semibold text-content">Gán giá & mô tả vé theo nhóm khu vực</h2>
                    <p className="text-sm text-subtle mt-1">
                      Các khu vực hoặc vùng đứng có cùng tên sẽ được tự động gộp lại để thiết lập 1 mức giá và mô tả chung.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-soft/30 text-left text-xs uppercase tracking-wider text-muted">
                          <th className="py-3 pr-4">Nhóm Khu vực / Vùng</th>
                          <th className="py-3 pr-4">Hình thức</th>
                          <th className="py-3 pr-4">Sức chứa</th>
                          <th className="py-3 pr-4">Tên loại vé & Mô tả</th>
                          <th className="py-3">Giá vé (VND)*</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft/20">
                        {groupedItems.map((group) => {
                          const ticket = sessionTickets.find((tt) => {
                            if (group.isSeated) {
                              return (
                                tt.is_seated &&
                                (group.zoneIds.some((id) => id === tt.zone_id) ||
                                  group.zoneIds.some((id) => (tt.zone_ids || []).includes(id)) ||
                                  tt.name?.trim().toLowerCase() === group.name.trim().toLowerCase())
                              )
                            } else {
                              return (
                                !tt.is_seated &&
                                (group.standingAreaIds.some((id) => id === tt.standing_area_id) ||
                                  group.standingAreaIds.some((id) => (tt.standing_area_ids || []).includes(id)) ||
                                  tt.name?.trim().toLowerCase() === group.name.trim().toLowerCase())
                              )
                            }
                          })

                          const ticketKey = ticket ? ticket.id || ticket.clientKey : null

                          const ensureGroupTicket = (extraFields = {}) => {
                            if (ticketKey) {
                              setFormData((p) => ({
                                ...p,
                                ticketTypes: p.ticketTypes.map((tItem) => {
                                  const currentKey = tItem.id || tItem.clientKey
                                  if (currentKey === ticketKey) {
                                    return { ...tItem, ...extraFields }
                                  }
                                  return tItem
                                }),
                              }))
                              return ticketKey
                            }

                            const newKey = newClientKey()
                            const newTicket = {
                              clientKey: newKey,
                              session_key: sessionKey,
                              name: group.name,
                              description: '',
                              price: '',
                              quantity: group.totalQuantity,
                              is_seated: group.isSeated,
                              zone_ids: group.zoneIds,
                              standing_area_ids: group.standingAreaIds,
                              zone_id: group.zoneIds[0] || null,
                              standing_area_id: group.standingAreaIds[0] || null,
                              ...extraFields,
                            }
                            setFormData((p) => ({
                              ...p,
                              ticketTypes: [...p.ticketTypes, newTicket],
                            }))
                            return newKey
                          }

                          return (
                            <tr key={group.groupKey} className="hover:bg-panel-soft/30 transition text-content border-b border-border-soft/20">
                              <td className="py-4 pr-4 align-top">
                                <div className="flex items-center gap-2">
                                  <div className="flex -space-x-1">
                                    {group.colors.map((c, i) => (
                                      <span key={i} className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0" style={{ background: c }} />
                                    ))}
                                  </div>
                                  <span className="font-extrabold text-sm">{group.name}</span>
                                </div>
                                {group.blockCount > 1 && (
                                  <span className="text-[11px] font-semibold text-tertiary block mt-1">
                                    Gộp {group.blockCount} {group.isSeated ? 'khu vực' : 'vùng đứng'}
                                  </span>
                                )}
                              </td>

                              <td className="py-4 pr-4 align-top">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${group.isSeated ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'}`}>
                                  {group.isSeated ? 'Ghế ngồi' : 'Vé đứng (GA)'}
                                </span>
                              </td>

                              <td className="py-4 pr-4 font-bold text-sm align-top">
                                {group.totalQuantity.toLocaleString('vi-VN')} {group.isSeated ? 'ghế' : 'chỗ'}
                              </td>

                              <td className="py-4 pr-4 align-top space-y-2">
                                <div>
                                  <input
                                    type="text"
                                    className="h-9 w-full max-w-[240px] rounded-lg border border-border-soft/40 bg-panel-soft px-3 text-xs font-bold text-content outline-none focus:border-tertiary shadow-inner"
                                    value={ticket?.name ?? group.name}
                                    onChange={(e) => {
                                      ensureGroupTicket({ name: e.target.value })
                                    }}
                                    placeholder="Tên loại vé..."
                                  />
                                </div>
                                <div>
                                  {ticket?.description?.trim() ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDescModalState({
                                          isOpen: true,
                                          ticketName: ticket?.name || group.name,
                                          initialDescription: ticket.description || '',
                                          onSave: (newDesc) => {
                                            ensureGroupTicket({ description: newDesc })
                                            setDescModalState({ isOpen: false })
                                          },
                                        })
                                      }}
                                      className="flex items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/10 px-2.5 py-1 text-xs font-semibold text-tertiary hover:bg-tertiary/20 transition max-w-[280px] text-left truncate"
                                      title={ticket.description}
                                    >
                                      <span className="truncate">{ticket.description}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDescModalState({
                                          isOpen: true,
                                          ticketName: ticket?.name || group.name,
                                          initialDescription: '',
                                          onSave: (newDesc) => {
                                            ensureGroupTicket({ description: newDesc })
                                            setDescModalState({ isOpen: false })
                                          },
                                        })
                                      }}
                                      className="flex items-center gap-1 rounded-lg border border-border-soft/40 bg-panel-soft px-2.5 py-1 text-xs font-semibold text-subtle hover:text-tertiary hover:border-tertiary/50 transition"
                                    >
                                      <span>+ Thêm mô tả</span>
                                    </button>
                                  )}
                                </div>
                              </td>

                              <td className="py-4 align-top">
                                <input
                                  type="text"
                                  placeholder="VD: 500.000"
                                  className="h-9 w-36 rounded-lg border border-border-soft/40 bg-panel-soft px-3 text-sm font-extrabold text-content outline-none focus:border-tertiary shadow-inner"
                                  value={ticket?.price !== undefined && ticket?.price !== null ? formatPriceString(ticket.price) : ''}
                                  onChange={(e) => {
                                    const rawNum = parsePriceNumber(e.target.value)
                                    ensureGroupTicket({ price: rawNum })
                                  }}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })()}
          </>
        )}

        {seatingType === 'GENERAL' && (
          <section className="rounded-xl border border-border-soft/30 bg-surface p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-semibold text-content">Cơ cấu loại vé</h2>
                <p className="text-sm text-subtle">Thiết lập các mức giá vé và số lượng bán ra.</p>
              </div>
              <button
                type="button"
                onClick={addTicketType}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-tertiary/10 transition"
              >
                <Icon name="add" />
                Thêm loại vé
              </button>
            </div>
            <div className="space-y-4">
              {sessionTickets.map((tt) => {
                const key = tt.id || tt.clientKey
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-border-soft/30 bg-panel-soft p-4 hover:border-tertiary/50 transition"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-muted">Tên vé*</label>
                        <input
                          className="w-full rounded-lg border border-border-soft/40 bg-surface text-content px-3 py-2 text-sm focus:border-tertiary outline-none font-bold"
                          value={tt.name}
                          onChange={(e) => updateTicket(key, 'name', e.target.value)}
                          placeholder="VD: Early Bird, VIP"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Giá vé (VND)*</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-border-soft/40 bg-surface text-content px-3 py-2 text-sm focus:border-tertiary outline-none font-extrabold"
                          value={formatPriceString(tt.price)}
                          onChange={(e) => updateTicket(key, 'price', parsePriceNumber(e.target.value))}
                          placeholder="VD: 500.000"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted">Số lượng*</label>
                        <input
                          type="number"
                          min="1"
                          className="w-full rounded-lg border border-border-soft/40 bg-surface text-content px-3 py-2 text-sm focus:border-tertiary outline-none font-bold"
                          value={tt.quantity}
                          onChange={(e) => updateTicket(key, 'quantity', Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-2 border-t border-border-soft/20">
                      {tt.description?.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDescModalState({
                              isOpen: true,
                              ticketName: tt.name || 'Loại vé',
                              initialDescription: tt.description || '',
                              onSave: (newDesc) => {
                                updateTicket(key, 'description', newDesc)
                                setDescModalState({ isOpen: false })
                              },
                            })
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/10 px-3 py-1.5 text-xs font-semibold text-tertiary hover:bg-tertiary/20 transition max-w-[400px] truncate"
                        >
                          <span className="truncate">Mô tả: {tt.description}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDescModalState({
                              isOpen: true,
                              ticketName: tt.name || 'Loại vé',
                              initialDescription: '',
                              onSave: (newDesc) => {
                                updateTicket(key, 'description', newDesc)
                                setDescModalState({ isOpen: false })
                              },
                            })
                          }}
                          className="flex items-center gap-1 rounded-lg border border-border-soft/40 bg-surface px-3 py-1.5 text-xs font-semibold text-subtle hover:text-tertiary hover:border-tertiary/50 transition"
                        >
                          <span>+ Thêm mô tả vé</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTicket(key)}
                        className="text-muted hover:text-error transition"
                      >
                        <Icon name="delete" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {!sessionTickets.length && (
                <p className="py-6 text-center text-sm text-subtle">
                  Chưa có loại vé. Nhấn &quot;Thêm loại vé&quot;.
                </p>
              )}
            </div>
          </section>
        )}
        {sessions.length > 1 && (
          <div className="pt-8 border-t border-border-soft/30 w-full mt-4">
            <button
              type="button"
              onClick={() => setShowSyncConfirm(true)}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-tertiary/10 text-tertiary shadow-sm px-6 py-4 text-sm font-bold border border-tertiary/30 hover:bg-tertiary hover:text-white transition-all transform hover:scale-[1.01]"
            >
              <Icon name="content_copy" className="text-[20px]" />
              Sao chép Bố cục Sơ đồ & Vé cho TẤT CẢ các phiên khác cùng địa điểm
            </button>
            <p className="text-center text-xs text-subtle mt-3 font-medium">Thay vì phải làm lại thủ công, bạn có thể đồng bộ cấu hình hiện tại sang tất cả các phiên cùng sự kiện.</p>
          </div>
        )}

        <ConfirmModal
          open={showSyncConfirm}
          title="Đồng bộ cấu hình phiên"
          message="Bạn có chắc chắn muốn áp dụng cấu hình sơ đồ ghế và vé của phiên này cho các phiên khác CÙNG ĐỊA ĐIỂM? Đối với các phiên khác địa điểm, cấu hình sẽ không được áp dụng."
          confirmText="Đồng bộ ngay"
          cancelText="Hủy"
          tone="primary"
          onConfirm={handleSyncSessionConfig}
          onCancel={() => setShowSyncConfirm(false)}
        />

        <TicketDescriptionModal
          {...descModalState}
          onClose={() => setDescModalState({ isOpen: false, ticketName: '', initialDescription: '', onSave: null })}
        />
      </div>

      <div className="col-span-12 space-y-6 lg:col-span-4 lg:sticky lg:top-20">
        <div className="overflow-hidden rounded-2xl border border-border-soft/30 bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="border-b border-border-soft/30 bg-panel-soft/60 px-6 py-4">
            <h3 className="text-xs font-extrabold text-content uppercase tracking-wider">Tóm tắt sự kiện</h3>
          </div>
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-subtle font-medium">Loại vé</span>
              <span className="font-extrabold text-content bg-panel-soft px-3 py-1 rounded-xl border border-border-soft/20">{formData.ticketTypes.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-subtle font-medium">Tổng số lượng</span>
              <span className="font-extrabold text-content bg-panel-soft px-3 py-1 rounded-xl border border-border-soft/20">{totalQty.toLocaleString('vi-VN')}</span>
            </div>
            <div className="border-t border-border-soft/30 pt-4 space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-subtle block">Tổng Doanh Thu</span>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-tertiary tracking-tight">
                  {totalRevenue.toLocaleString('vi-VN')}
                </span>
                <span className="text-xs font-extrabold text-tertiary uppercase">VND</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step4PoliciesSettings({ formData, setFormData }) {
  const { refund_policy: rp } = formData

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-6 pb-8">
        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Icon name="contacts" />
              </div>
              <h3 className="text-[20px] font-semibold text-content">Thông tin người tham dự</h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={Boolean(formData.require_attendee_info)}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    require_attendee_info: e.target.checked,
                  }))
                }
              />
              <div className="w-11 h-6 bg-border-soft/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-tertiary" />
              <span className="ml-3 text-sm font-medium text-content">Yêu cầu thu thập</span>
            </label>
          </div>
          <p className="mt-4 text-sm text-subtle">
            Bật tính năng này để yêu cầu người mua cung cấp thông tin (như số điện thoại, ngày sinh, hoặc theo các trường tùy chỉnh) cho <b>TỪNG</b> vé họ mua.
          </p>
        </section>

        <section className="bg-surface rounded-xl border border-border-soft/30 p-6 hover:shadow-md transition-shadow shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
              <Icon name="gavel" />
            </div>
            <h3 className="text-[20px] font-semibold text-content">Điều khoản bổ sung</h3>
          </div>

          {/* 
          // TẠM ẨN CHÍNH SÁCH HOÀN TIỀN
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Icon name="payments" />
              </div>
              <h3 className="text-[20px] font-semibold text-content">Chính sách hoàn tiền</h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={Boolean(rp.allow_refunds)}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    refund_policy: { ...p.refund_policy, allow_refunds: e.target.checked },
                  }))
                }
              />
              <div className="w-11 h-6 bg-border-soft/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-tertiary" />
              <span className="ml-3 text-sm font-medium text-content">Cho phép hoàn tiền</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[13px] text-subtle block mb-1">Hạn chót yêu cầu hoàn tiền</label>
              <select
                className="w-full border border-border-soft/40 rounded-lg px-4 py-2 text-sm outline-none bg-panel-soft text-content focus:ring-2 focus:ring-secondary/20"
                value={rp.deadline_days || 7}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    refund_policy: { ...p.refund_policy, deadline_days: Number(e.target.value) },
                  }))
                }
              >
                <option value={7}>Trước sự kiện 7 ngày</option>
                <option value={14}>Trước sự kiện 14 ngày</option>
                <option value={0}>Không có hạn chót (Bất cứ lúc nào)</option>
              </select>
            </div>
          </div>
          */}

          <div>
            <label className="text-[13px] text-subtle block mb-2 font-medium">Điều khoản & quy định cho người giữ vé</label>
            <textarea
              className="w-full border border-border-soft/40 rounded-xl px-4 py-3 text-sm h-32 resize-none outline-none bg-panel-soft text-content placeholder:text-muted focus:border-tertiary"
              placeholder="Thêm các điều khoản, quy định độ tuổi, hoặc hướng dẫn bổ sung cho người giữ vé..."
              value={formData.additional_terms}
              onChange={(e) => setFormData((p) => ({ ...p, additional_terms: e.target.value }))}
            />
          </div>
        </section>
      </div>

      <div className="col-span-12 lg:col-span-4 sticky top-24">
        <div className="bg-surface rounded-xl border border-border-soft/30 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
          <div className="bg-panel-soft p-4 border-b border-border-soft/30">
            <h3 className="font-bold flex items-center gap-2 text-content">
              <Icon name="description" className="text-tertiary" />
              Tóm tắt cài đặt & chính sách
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Icon name="check_circle" className="text-success text-lg mt-0.5" />
              <div>
                <p className="text-sm font-bold text-content">Thông tin người tham dự</p>
                <p className="text-xs text-muted">
                  {formData.require_attendee_info
                    ? 'Yêu cầu nhập thông tin từng vé'
                    : 'Không bắt buộc nhập thông tin'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Icon name={formData.additional_terms?.trim() ? 'check_circle' : 'info'} className={formData.additional_terms?.trim() ? 'text-success text-lg mt-0.5' : 'text-muted text-lg mt-0.5'} />
              <div>
                <p className="text-sm font-bold text-content">Điều khoản bổ sung</p>
                <p className="text-xs text-muted">
                  {formData.additional_terms?.trim()
                    ? 'Đã thiết lập điều khoản tham dự'
                    : 'Chưa nhập điều khoản bổ sung'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border-soft/30">
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold uppercase text-subtle">Tiến độ bản nháp</span>
                <span className="text-xs font-bold text-tertiary">80%</span>
              </div>
              <div className="w-full h-2 bg-panel-soft rounded-full overflow-hidden border border-border-soft/20">
                <div className="h-full bg-tertiary rounded-full" style={{ width: '80%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step5ReviewSubmit({ formData, categories, venues }) {
  const categoryName = categories.find((c) => c.id === formData.category_id)?.name
  const firstSession = formData.sessions[0]
  const venue = venues.find((v) => v.id === firstSession?.venue_id)

  const groupedTickets = []
  formData.ticketTypes.forEach((tt) => {
    const key = `${tt.name}_${tt.price}_${tt.is_seated}`
    let group = groupedTickets.find((g) => g.key === key)
    if (!group) {
      group = { key, name: tt.name, price: tt.price, is_seated: tt.is_seated, totalQty: 0, sessions: [] }
      groupedTickets.push(group)
    }
    group.totalQty += Number(tt.quantity || 0)
    const session = formData.sessions.find((s) => (s.id || s.clientKey) === tt.session_key)
    if (session) {
      const ms = new Date(`${session.start_date}T${session.start_time}`).getTime() || 0
      group.sessions.push({
        name: session.session_name || `Phiên ${formData.sessions.indexOf(session) + 1}`,
        qty: tt.quantity,
        timeMs: ms
      })
    }
  })

  // Sort sessions inside each group chronologically
  groupedTickets.forEach(group => {
    group.sessions.sort((a, b) => a.timeMs - b.timeMs)
  })

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8 space-y-6 pb-8">
        <section className="bg-surface border border-border-soft/30 rounded-xl overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="h-[280px] relative bg-panel-soft">
            {formData.banner_url && (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-6 left-6 flex items-end gap-5">
              {formData.thumbnail_url && (
                <div className="w-28 h-28 bg-surface p-1 rounded-xl border-2 border-tertiary shadow-2xl z-10 shrink-0">
                  <img src={formData.thumbnail_url} alt="" className="w-full h-full object-cover rounded-[8px]" />
                </div>
              )}
              <div className="mb-2 text-white pb-1">
                <h3 className="text-[26px] leading-[32px] font-extrabold shadow-sm">{formData.title || 'Chưa nhập tên sự kiện'}</h3>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {formData.tags.map((tag) => (
                    <span key={tag} className="bg-tertiary/15 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold uppercase border border-white/20">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm text-subtle">{formData.short_description}</p>
            <p className="text-xs text-muted mt-2">{categoryName} · {formData.format}</p>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="calendar_today" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Lịch trình & Địa điểm</h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_minmax(0,1fr)_140px] sm:gap-3">
            <div>
              <label className="block text-xs text-muted mb-1 uppercase">Phiên</label>
              <p className="font-semibold text-content">{formData.sessions.length} phiên</p>
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-muted mb-1 uppercase">Địa điểm</label>
              <p className="whitespace-nowrap font-semibold text-content" title={venue?.name}>{venue?.name || '—'}</p>
            </div>
            <div className="sm:justify-self-end sm:text-left">
              <label className="block text-xs text-muted mb-1 uppercase">Hiển thị</label>
              <p className="font-semibold text-content">{formData.visibility}</p>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="confirmation_number" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Vé & Chỗ ngồi</h4>
          </div>
          <div className="space-y-4">
            {groupedTickets.map((group, index) => {
              const TICKET_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500']
              const colorClass = TICKET_COLORS[index % TICKET_COLORS.length]

              return (
                <div key={group.key} className="flex flex-col p-4 bg-panel-soft rounded-xl border border-border-soft/40 shadow-sm relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 opacity-80 ${colorClass}`} />
                  <div className="flex justify-between items-start pl-1">
                    <div>
                      <p className="font-bold text-sm text-content mb-1">{group.name}</p>
                      <p className="text-xs text-subtle font-medium">Tổng số lượng: {group.totalQty} vé · {group.is_seated ? 'Có chỗ ngồi' : 'Không chỗ ngồi'}</p>
                    </div>
                    <p className="font-bold text-sm text-tertiary mt-0.5">{Number(group.price).toLocaleString('vi-VN')} đ</p>
                  </div>
                  {formData.sessions.length > 1 && group.sessions.length > 0 && (
                    <div className="mt-4 pl-1 pt-3 border-t border-border-soft/30 flex flex-wrap gap-2">
                      {group.sessions.map((s, idx) => (
                        <span key={idx} className="text-[11px] bg-background/50 border border-border-soft/30 px-2 py-1 rounded-md text-subtle font-medium">
                          {s.name}: <strong className="text-content">{s.qty} vé</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-surface border border-border-soft/30 rounded-xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="policy" className="text-tertiary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-content">Cài đặt & Điều khoản</h4>
          </div>
          <p className="text-sm text-subtle">
            {formData.require_attendee_info
              ? 'Yêu cầu thu thập thông tin người tham dự cho từng vé.'
              : 'Không bắt buộc nhập thông tin người tham dự.'}
          </p>
          {formData.additional_terms && (
            <p className="text-sm text-subtle mt-2"><strong>Điều khoản bổ sung:</strong> {formData.additional_terms}</p>
          )}
        </section>
      </div>

      <aside className="col-span-12 lg:col-span-4">
        <div className="sticky top-6 bg-surface border border-border-soft/30 border-t-tertiary border-t-4 rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex justify-between mb-4">
            <span className="text-sm font-bold text-content">Độ hoàn thiện 100%</span>
            <span className="px-2 py-0.5 bg-tertiary/10 rounded text-[11px] font-bold uppercase text-tertiary border border-tertiary/20">Tuyệt vời</span>
          </div>
          <div className="w-full bg-panel-soft h-2 rounded-full mb-6 overflow-hidden border border-border-soft/20">
            <div className="bg-tertiary h-full w-full rounded-full" />
          </div>
          <div className="p-4 bg-tertiary/5 border border-tertiary/20 rounded-xl">
            <p className="text-xs text-tertiary text-center font-medium leading-relaxed">
              Sự kiện của bạn đã sẵn sàng! Ban quản trị sẽ sớm duyệt sự kiện này.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

export function CreateEventPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { eventId: routeEventId } = useParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [maxCompletedStep, setMaxCompletedStep] = useState(1)
  const [eventId, setEventId] = useState(routeEventId || null)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [categories, setCategories] = useState([])
  const [venues, setVenues] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(Boolean(routeEventId))
  const [error, setError] = useState('')
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [eventStatus, setEventStatus] = useState('DRAFT')
  const [editPermissions, setEditPermissions] = useState(null)
  const [paymentSetupRequired, setPaymentSetupRequired] = useState(false)
  const [subscriptionRequired, setSubscriptionRequired] = useState(false)

  const isEditMode = Boolean(routeEventId)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
    document.head.appendChild(link)
    const style = document.createElement('style')
    style.textContent = `.material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;vertical-align:middle;line-height:1}`
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(link)
      document.head.removeChild(style)
    }
  }, [])

  useEffect(() => {
    setInitialLoading(true)
    Promise.all([fetchEventCategories(), fetchOrganizerVenues(), fetchCurrentPlan()])
      .then(([cats, vns, plan]) => {
        setCategories(cats)
        setVenues(vns)
        if (!plan) setSubscriptionRequired(true)
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải dữ liệu ban đầu. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!routeEventId) setInitialLoading(false)
      })
  }, [routeEventId, toast])

  const populateFromEvent = useCallback((event) => {
    const sessions = (event.sessions || []).map((s) => {
      const start = splitDateTime(s.start_time)
      const end = splitDateTime(s.end_time)
      const checkin = splitDateTime(s.checkin_start_time)
      return {
        id: s.id,
        clientKey: s.id,
        session_name: s.session_name,
        start_date: start.date,
        start_time: start.time,
        end_date: end.date,
        end_time: end.time,
        venue_id: s.venue_id,
        seat_map_id: s.seat_map_id,
        seating_type: s.seat_map_id ? 'ASSIGNED' : 'GENERAL',
        zone_assignments: [],
        checkin_start_date: checkin.date,
        checkin_start_time: checkin.time,
      }
    })

    const ticketTypes = (event.ticket_types || []).map((tt) => ({
      id: tt.id,
      clientKey: tt.id,
      session_key: tt.event_session_id,
      name: tt.name,
      description: tt.description || '',
      price: tt.price,
      quantity: tt.quantity,
      is_seated: tt.is_seated,
      zone_id: tt.zone_id || null,
    }))

    setFormData({
      title: event.title || '',
      category_id: event.category_id || '',
      tags: event.tags || [],
      format: event.format || 'OFFLINE',
      visibility: event.visibility || 'PUBLIC',
      short_description: event.short_description || '',
      description: event.description || '',
      thumbnail_url: event.thumbnail_url || '',
      banner_url: event.banner_url || '',
      sessions,
      ticketTypes,
      seating_rules: event.seating_rules || { require_adjacent_seats: false, require_same_row: false, disallow_single_seat_left: false },
      refund_policy: event.refund_policy || { allow_refunds: false, deadline_days: 7 },
      additional_terms: event.additional_terms || '',
      require_attendee_info: Boolean(event.require_attendee_info),
    })
  }, [])

  useEffect(() => {
    if (!routeEventId) return
    setInitialLoading(true)
    fetchOrganizerEvent(routeEventId)
      .then((event) => {
        setEventId(event.id)
        setEventStatus(event.status || 'DRAFT')
        setEditPermissions(event.edit_permissions || null)
        populateFromEvent(event)
        setCurrentStep(1)
        setMaxCompletedStep(5)
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải sự kiện.')
      })
      .finally(() => setInitialLoading(false))
  }, [routeEventId, populateFromEvent, toast])

  const validateStep = (step) => {
    if (step === 1) {
      if (!formData.title.trim()) return 'Vui lòng nhập tên sự kiện.'
      if (!formData.category_id) return 'Vui lòng chọn danh mục.'
      if (!formData.short_description.trim()) return 'Vui lòng nhập mô tả ngắn.'
      const descriptionTextOnly = (formData.description || '').replace(/<[^>]*>/g, '').trim()
      const hasImage = (formData.description || '').includes('<img')
      if (!descriptionTextOnly && !hasImage) return 'Vui lòng nhập mô tả đầy đủ.'
      if (!formData.thumbnail_url) return 'Vui lòng tải ảnh thumbnail.'
      if (!formData.banner_url) return 'Vui lòng tải ảnh banner.'
    }
    if (step === 2) {
      if (!formData.sessions.length) return 'Cần ít nhất 1 phiên sự kiện.'
      for (const s of formData.sessions) {
        if (!s.start_date || !s.start_time || !s.end_date || !s.end_time) {
          return 'Mỗi phiên sự kiện cần thời gian bắt đầu và kết thúc đầy đủ.'
        }
        if (!s.venue_id) return 'Mỗi phiên sự kiện cần chọn địa điểm.'

        const startTime = new Date(`${s.start_date}T${s.start_time}`)
        const endTime = new Date(`${s.end_date}T${s.end_time}`)
        const now = new Date()

        if (startTime < now) {
          return 'Thời gian bắt đầu sự kiện không được trong quá khứ.'
        }
        if (endTime <= startTime) {
          return 'Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.'
        }

        if (s.checkin_start_date || s.checkin_start_time) {
          if (!s.checkin_start_date || !s.checkin_start_time) {
            return 'Vui lòng nhập đầy đủ cả ngày và giờ check-in.'
          }
          const checkinTime = new Date(`${s.checkin_start_date}T${s.checkin_start_time}`)
          if (checkinTime > startTime) {
            return 'Thời gian check-in phải trước hoặc bằng thời gian bắt đầu sự kiện.'
          }
        }
      }
    }
    if (step === 3) {
      for (const s of formData.sessions) {
        const key = s.id || s.clientKey
        const seatingType = s.seating_type || 'GENERAL'
        if (seatingType === 'ASSIGNED') {
          if (!s.seat_map_id) {
            return `Phiên sự kiện "${s.session_name || 'chưa đặt tên'}" cần chọn sơ đồ ghế.`
          }
        }
        const tickets = formData.ticketTypes.filter((tt) => tt.session_key === key)
        if (!tickets.length) return `Phiên sự kiện "${s.session_name || 'chưa đặt tên'}" cần ít nhất 1 loại vé.`
        for (const tt of tickets) {
          if (!tt.name?.trim()) return 'Tên loại vé không được để trống.'
          if (tt.price === '' || tt.price === null || tt.price === undefined) return 'Giá vé không được để trống.'
          if (Number(tt.price) < 0) return 'Giá vé phải >= 0.'
          if (!tt.quantity || tt.quantity <= 0) return 'Số lượng vé phải > 0.'
        }
      }
    }
    return ''
  }

  const isValidAllSteps = () => {
    for (let step = 1; step <= 4; step++) {
      if (validateStep(step)) return false
    }
    return true
  }

  const buildSessionsPayload = () =>
    formData.sessions.map((s) => ({
      id: s.id,
      session_name: s.session_name,
      start_time: combineDateTime(s.start_date, s.start_time),
      end_time: combineDateTime(s.end_date, s.end_time),
      venue_id: s.venue_id,
      seat_map_id: s.seating_type === 'ASSIGNED' ? s.seat_map_id : null,
      checkin_start_time: combineDateTime(s.checkin_start_date, s.checkin_start_time),
    }))

  const buildTicketTypesPayload = () => {
    const sessionIdMap = new Map()
    formData.sessions.forEach((s) => {
      sessionIdMap.set(s.id || s.clientKey, s.id)
    })
    return formData.ticketTypes
      .map((tt) => ({
        id: tt.id,
        event_session_id: sessionIdMap.get(tt.session_key) || tt.session_key,
        name: tt.name,
        description: tt.description || null,
        price: tt.price,
        quantity: tt.quantity,
        is_seated: Boolean(tt.is_seated),
      }))
      .filter((tt) => tt.event_session_id && !String(tt.event_session_id).startsWith('tmp-'))
  }

  const handleThumbnailUpload = async (file) => {
    if (!file) return
    try {
      setUploadingThumb(true)
      const result = await uploadEventThumbnail(file)
      setFormData((p) => ({ ...p, thumbnail_url: result.url }))
    } catch (err) {
      console.error(err)
      toast.error('Không thể tải thumbnail.')
    } finally {
      setUploadingThumb(false)
    }
  }

  const handleBannerUpload = async (file) => {
    if (!file) return
    try {
      setUploadingBanner(true)
      const result = await uploadEventBanner(file)
      setFormData((p) => ({ ...p, banner_url: result.url }))
    } catch (err) {
      console.error(err)
      toast.error('Không thể tải banner.')
    } finally {
      setUploadingBanner(false)
    }
  }

  const syncZoneAssignments = async () => {
    const refreshed = await fetchOrganizerEvent(eventId)
    for (const s of formData.sessions) {
      if (s.seating_type !== 'ASSIGNED' || !s.seat_map_id) continue
      const refreshedSession = refreshed.sessions?.find((rs) => rs.id === s.id)
      if (!refreshedSession) continue
      const oldTickets = formData.ticketTypes.filter(
        (tt) => tt.session_key === s.id && tt.zone_id,
      )
      const savedTickets = (refreshed.ticket_types || []).filter(
        (tt) => tt.event_session_id === refreshedSession.id,
      )
      const assignments = oldTickets
        .map((ot) => {
          const saved = savedTickets.find((st) => st.name === ot.name)
          return saved ? { zone_id: ot.zone_id, ticket_type_id: saved.id } : null
        })
        .filter(Boolean)
      if (assignments.length) {
        await assignZones(eventId, refreshedSession.id, assignments)
      }
    }
  }

  const handleNext = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }
    setError('')
    setLoading(true)
    try {
      if (currentStep === 1) {
        const payload = {
          title: formData.title,
          category_id: formData.category_id,
          tags: formData.tags,
          format: formData.format,
          visibility: formData.visibility,
          short_description: formData.short_description,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url,
          banner_url: formData.banner_url,
        }
        if (eventId) {
          await updateOrganizerEvent(eventId, payload)
        } else {
          const created = await createOrganizerEvent(payload)
          setEventId(created.id)
        }
      } else if (currentStep === 2) {
        const updated = await updateOrganizerEvent(eventId, { sessions: buildSessionsPayload() })
        const sessions = (updated.sessions || []).map((s) => {
          const start = splitDateTime(s.start_time)
          const end = splitDateTime(s.end_time)
          const old = formData.sessions.find(
            (os) => os.session_name === s.session_name && os.venue_id === s.venue_id,
          )
          return {
            id: s.id,
            clientKey: s.id,
            session_name: s.session_name,
            start_date: start.date,
            start_time: start.time,
            end_date: end.date,
            end_time: end.time,
            venue_id: s.venue_id,
            seat_map_id: s.seat_map_id,
            seating_type: old?.seating_type || (s.seat_map_id ? 'ASSIGNED' : 'GENERAL'),
            zone_assignments: old?.zone_assignments || [],
            checkin_start_date: start.date,
            checkin_start_time: start.time,
          }
        })
        setFormData((p) => {
          const ticketTypes = p.ticketTypes.map((tt) => {
            const oldSession = formData.sessions.find(
              (s) => (s.id || s.clientKey) === tt.session_key,
            )
            if (!oldSession) return tt
            const newSession = sessions.find(
              (s) => s.session_name === oldSession.session_name && s.venue_id === oldSession.venue_id,
            )
            return newSession ? { ...tt, session_key: newSession.id } : tt
          })
          return { ...p, sessions, ticketTypes }
        })
      } else if (currentStep === 3) {
        await updateOrganizerEvent(eventId, {
          sessions: buildSessionsPayload(),
          ticket_types: buildTicketTypesPayload(),
          seating_rules: formData.seating_rules,
        })
        await syncZoneAssignments()
        const finalEvent = await fetchOrganizerEvent(eventId)
        populateFromEvent(finalEvent)
      } else if (currentStep === 4) {
        await updateOrganizerEvent(eventId, {
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
        })
      }
      const next = Math.min(currentStep + 1, 5)
      setCurrentStep(next)
      setMaxCompletedStep((prev) => Math.max(prev, next))
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Đã xảy ra lỗi. Vui lòng thử lại.'))
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateEvent = async () => {
    for (let step = 1; step <= 4; step += 1) {
      const validationError = validateStep(step)
      if (validationError) {
        setError(validationError)
        toast.error(validationError)
        setCurrentStep(step)
        return
      }
    }

    setLoading(true)
    setError('')
    try {
      await updateOrganizerEvent(eventId, {
        title: formData.title,
        category_id: formData.category_id,
        tags: formData.tags,
        format: formData.format,
        visibility: formData.visibility,
        short_description: formData.short_description,
        description: formData.description,
        thumbnail_url: formData.thumbnail_url,
        banner_url: formData.banner_url,
        seating_rules: formData.seating_rules,
        refund_policy: formData.refund_policy,
        additional_terms: formData.additional_terms,
        require_attendee_info: formData.require_attendee_info,
        sessions: buildSessionsPayload(),
        ticket_types: buildTicketTypesPayload(),
      })
      await syncZoneAssignments()
      navigate('/organizer/events', {
        state: { message: 'Đã cập nhật sự kiện thành công.' },
      })
    } catch (err) {
      console.error(err)
      toast.error(getApiMessage(err, 'Không thể cập nhật sự kiện.'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    // Validate everything first
    for (let step = 1; step <= 4; step += 1) {
      const validationError = validateStep(step)
      if (validationError) {
        setError(validationError)
        toast.error(validationError)
        setCurrentStep(step)
        return
      }
    }

    setLoading(true)
    setError('')
    setPaymentSetupRequired(false)

    try {
      if (isEditMode) {
        await updateOrganizerEvent(eventId, {
          title: formData.title,
          category_id: formData.category_id,
          tags: formData.tags,
          format: formData.format,
          visibility: formData.visibility,
          short_description: formData.short_description,
          description: formData.description,
          thumbnail_url: formData.thumbnail_url,
          banner_url: formData.banner_url,
          seating_rules: formData.seating_rules,
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
          require_attendee_info: formData.require_attendee_info,
          sessions: buildSessionsPayload(),
          ticket_types: buildTicketTypesPayload(),
        })
        await syncZoneAssignments()
      }

      await submitOrganizerEvent(eventId)
      navigate('/organizer/events', {
        state: { message: 'Đã gửi sự kiện để duyệt.' },
      })
    } catch (err) {
      console.error(err)
      const errorCode = err.response?.data?.errorCode
      if (errorCode === 'PAYOS_NOT_CONFIGURED') {
        setPaymentSetupRequired(true)
        navigate('/organizer/settings/payment', {
          state: {
            returnTo: eventId ? `/organizer/events/${eventId}/edit` : '/organizer/events/create',
            error: err.response?.data?.message || 'Vui lòng hoàn tất thiết lập thanh toán trước khi gửi duyệt sự kiện có phí.',
          },
        })
        return
      }
      toast.error(getApiMessage(err, 'Không thể gửi sự kiện.'))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setError('')
    setCurrentStep((s) => Math.max(1, s - 1))
  }

  const nextLabel = useMemo(() => {
    if (currentStep === 4) {
      return isEditMode ? 'Tiếp: Xem lại & cập nhật' : 'Tiếp theo: Xem lại & Gửi duyệt'
    }
    if (currentStep === 3) return 'Tiếp theo: Chính sách & Thiết lập'
    if (currentStep === 2) return 'Tiếp theo: Vé & Sơ đồ ghế'
    return 'Tiếp theo'
  }, [currentStep, isEditMode])

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-tertiary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="pb-20 max-w-6xl mx-auto">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-content">
            {isEditMode ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện'}
          </h1>
          <p className="mt-1 text-sm text-subtle">
            {isEditMode
              ? 'Cập nhật thông tin sự kiện qua 5 bước.'
              : 'Thiết lập sự kiện của bạn trong 5 bước đơn giản.'}
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.06)] border border-border-soft/40 overflow-hidden flex flex-col min-h-[600px]">
        {/* Header containing Stepper */}
        <div className="bg-panel-soft/50 p-6 pt-10 border-b border-border-soft/40 relative">
          <WizardStepper
            currentStep={currentStep}
            maxCompletedStep={maxCompletedStep}
            onStepClick={(step) => {
              if (step <= maxCompletedStep) {
                setError('')
                setCurrentStep(step)
              }
            }}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 lg:p-10 bg-background/30">

          {paymentSetupRequired && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <Icon name="warning" />
              <span>Vui lòng cài đặt thanh toán nhận tiền trước khi đăng sự kiện bán vé.</span>
              <button
                type="button"
                onClick={() => navigate('/organizer/settings/payment')}
                className="ml-auto rounded-md border border-warning/30 bg-surface px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/10 transition"
              >
                Đến cài đặt thanh toán
              </button>
            </div>
          )}
          {subscriptionRequired && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning font-medium">
              <div className="flex items-center gap-3">
                <Icon name="warning" className="text-xl" />
                <span>Tài khoản của bạn chưa đăng ký gói dịch vụ. Vui lòng Nâng cấp tài khoản để có thể phát hành sự kiện.</span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/organizer/subscriptions')}
                className="rounded-md border border-warning/30 bg-surface px-4 py-2 font-bold bg-warning text-white shadow-sm hover:opacity-90 transition"
              >
                Đăng ký gói ngay
              </button>
            </div>
          )}
          <fieldset disabled={Boolean(editPermissions?.is_time_locked)} className={editPermissions?.is_time_locked ? 'opacity-60' : ''}>
          {currentStep === 1 && (
            /* Locked events are read-only; backend enforces the same rule. */
            <Step1EventInfo
              formData={formData}
              setFormData={setFormData}
              categories={categories}
              tagInput={tagInput}
              setTagInput={setTagInput}
              onThumbnailUpload={handleThumbnailUpload}
              onBannerUpload={handleBannerUpload}
              uploadingThumb={uploadingThumb}
              uploadingBanner={uploadingBanner}
            />
          )}
          {currentStep === 2 && (
            <Step2ScheduleVenue formData={formData} setFormData={setFormData} venues={venues} />
          )}
          {currentStep === 3 && (
            <Step3TicketsSeats formData={formData} setFormData={setFormData} venues={venues} />
          )}
          {currentStep === 4 && (
            <Step4PoliciesSettings formData={formData} setFormData={setFormData} />
          )}
          {currentStep === 5 && (
            <Step5ReviewSubmit formData={formData} categories={categories} venues={venues} />
          )}
          </fieldset>

        </div>

        {/* Universal Footer Action Bar inside card */}
        <footer className="bg-panel-soft/30 border-t border-border-soft/40 p-4 px-6 lg:px-8 flex items-center justify-between mt-auto">
          <button
            type="button"
            onClick={() => navigate('/organizer/events')}
            className="px-6 py-2.5 rounded-lg border border-border-soft/40 text-content text-sm font-medium hover:bg-panel-soft transition"
          >
            Hủy
          </button>
          <div className="flex gap-3">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading || editPermissions?.is_time_locked}
                className="px-6 py-2.5 rounded-lg border border-border-soft/40 text-sm font-medium hover:bg-panel-soft transition flex items-center gap-2 text-content disabled:opacity-50"
              >
                <Icon name="arrow_back" className="text-[18px]" />
                Quay lại
              </button>
            )}
            {currentStep < 5 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={loading || editPermissions?.is_time_locked}
                className="flex items-center gap-2 rounded-lg bg-tertiary px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {loading ? 'Đang lưu...' : (currentStep === 4 ? 'Tiếp theo' : nextLabel)}
                {!loading && <Icon name="arrow_forward" className="text-[18px]" />}
              </button>
            )}

            {currentStep === 5 && (!isEditMode ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || editPermissions?.is_time_locked || !isValidAllSteps()}
                title={!isValidAllSteps() ? 'Bạn cần nhập đầy đủ và chuẩn xác tất cả các bước' : ''}
                className="flex items-center gap-2 rounded-lg bg-success px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-success/80 disabled:opacity-50 disabled:cursor-not-allowed transition ml-2"
              >
                {loading ? 'Đang gửi...' : 'Gửi để duyệt'}
              </button>
            ) : (isEditMode && ['DRAFT', 'HIDDEN'].includes(eventStatus)) ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || editPermissions?.is_time_locked || !isValidAllSteps()}
                title={!isValidAllSteps() ? 'Bạn cần nhập đầy đủ và chuẩn xác tất cả các bước' : ''}
                className="rounded-lg border border-tertiary/50 px-6 py-2.5 text-sm font-bold text-tertiary hover:bg-tertiary/10 disabled:opacity-50 disabled:cursor-not-allowed transition ml-2"
              >
                {loading ? 'Đang xử lý...' : 'Gửi duyệt'}
              </button>
            ) : null)}

            {isEditMode && (
              <button
                type="button"
                onClick={handleUpdateEvent}
                disabled={loading || editPermissions?.is_time_locked || !isValidAllSteps()}
                title={!isValidAllSteps() ? 'Thông tin sự kiện còn thiếu hoặc không hợp lệ' : ''}
                className="flex items-center gap-2 rounded-lg bg-tertiary px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition ml-2"
              >
                {loading ? 'Đang lưu...' : 'Lưu lại'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
