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
import { uploadEventBanner, uploadEventThumbnail } from '@/services/uploads.js'

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
  description: '',
  thumbnail_url: '',
  banner_url: '',
  sessions: [],
  ticketTypes: [],
  refund_policy: { allow_refunds: false, deadline_days: 7 },
  additional_terms: '',
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
        <div className="absolute top-5 left-0 w-full h-[2px] bg-[#e0e3e5] -z-10" />
        <div
          className="absolute top-5 left-0 h-[2px] bg-[#2563eb] -z-10 transition-all"
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
              className={`flex flex-col items-center gap-2 bg-[#f7f9fb] px-2 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-md transition-all ${
                  isActive
                    ? 'bg-[#2563eb] text-white'
                    : isCompleted
                      ? 'bg-[#2563eb] text-white'
                      : 'bg-[#e0e3e5] text-[#434655]'
                }`}
              >
                {isCompleted && !isActive ? (
                  <Icon name="check" className="text-[20px]" />
                ) : (
                  step
                )}
              </div>
              <span
                className={`font-medium text-[13px] leading-[18px] text-center max-w-[120px] ${
                  isActive || isCompleted ? 'text-[#004ac6] font-bold' : 'text-[#434655]'
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
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-24">
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 hover:border-[#CBD5E1] transition-shadow">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2 text-[#191c1e]">
            <Icon name="info" className="text-[#004ac6]" />
            Thông tin cơ bản
          </h3>
          <div className="space-y-6">
            <div>
              <label className="block text-[13px] font-medium mb-2 text-[#191c1e]">Tên sự kiện*</label>
              <input
                className="w-full px-4 py-2.5 border border-[#c3c6d7] rounded-lg text-sm focus:ring-2 focus:ring-[#004ac6] focus:border-[#004ac6] outline-none"
                placeholder="e.g. Global Tech Summit 2024"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium mb-2 text-[#191c1e]">Danh mục*</label>
                <select
                  className="w-full px-4 py-2.5 border border-[#c3c6d7] rounded-lg text-sm focus:ring-2 focus:ring-[#004ac6] outline-none bg-white"
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
                <label className="block text-[13px] font-medium mb-2 text-[#191c1e]">Tags</label>
                <div className="flex flex-wrap gap-2 items-center p-1.5 border border-[#c3c6d7] rounded-lg bg-white">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-1 bg-[#dae2fd] text-[#5c647a] rounded text-xs font-semibold"
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
                        <Icon name="close" className="text-[14px] hover:text-[#ba1a1a]" />
                      </button>
                    </span>
                  ))}
                  <input
                    className="border-none bg-transparent outline-none p-1 text-sm flex-1 min-w-[80px]"
                    placeholder="Add tag..."
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
            <div>
              <label className="block text-[13px] font-medium mb-3 text-[#191c1e]">Hình thức sự kiện*</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: 'OFFLINE', icon: 'location_on', label: 'Offline' },
                  { value: 'ONLINE', icon: 'laptop_mac', label: 'Online' },
                  { value: 'HYBRID', icon: 'sync_alt', label: 'Hybrid' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, format: opt.value }))}
                    className={`p-4 border-2 rounded-xl flex flex-col items-center text-center gap-2 transition-all ${
                      formData.format === opt.value
                        ? 'border-[#2563eb] bg-[#eeefff]/10'
                        : 'border-[#c3c6d7] hover:border-[#2563eb]'
                    }`}
                  >
                    <Icon
                      name={opt.icon}
                      className={formData.format === opt.value ? 'text-[#004ac6]' : 'text-[#434655]'}
                      style={{ fontSize: 32 }}
                    />
                    <span className={`text-[13px] font-medium ${formData.format === opt.value ? 'font-bold' : ''}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-3 text-[#191c1e]">Hiển thị sự kiện*</label>
              <div className="flex gap-4">
                {[
                  { value: 'PUBLIC', icon: 'public', title: 'Công khai', desc: 'Hiển thị cho mọi người trên nền tảng' },
                  { value: 'PRIVATE', icon: 'lock', title: 'Riêng tư', desc: 'Chỉ truy cập qua liên kết mời' },
                ].map((opt) => (
                  <label key={opt.value} className="flex-1 relative cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      className="peer sr-only"
                      checked={formData.visibility === opt.value}
                      onChange={() => setFormData((p) => ({ ...p, visibility: opt.value }))}
                    />
                    <div className="p-4 border-2 border-[#c3c6d7] rounded-xl peer-checked:border-[#004ac6] peer-checked:bg-[#2563eb]/5 transition-all">
                      <div className="flex items-center gap-3">
                        <Icon name={opt.icon} className="text-[#434655]" />
                        <div>
                          <p className="text-[13px] font-bold">{opt.title}</p>
                          <p className="text-xs opacity-70">{opt.desc}</p>
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2">
            <Icon name="description" className="text-[#004ac6]" />
            Mô tả
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[13px] font-medium text-[#191c1e]">Mô tả ngắn*</label>
                <span className="text-xs text-[#737686]">{formData.short_description.length} / 150</span>
              </div>
              <textarea
                className="w-full px-4 py-2.5 border border-[#c3c6d7] rounded-lg text-sm focus:ring-2 focus:ring-[#004ac6] outline-none resize-none"
                placeholder="Briefly explain what your event is about..."
                rows={2}
                maxLength={150}
                value={formData.short_description}
                onChange={(e) => setFormData((p) => ({ ...p, short_description: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-2 text-[#191c1e]">Mô tả chi tiết*</label>
              <textarea
                className="w-full px-4 py-4 border border-[#c3c6d7] rounded-lg text-sm focus:ring-2 focus:ring-[#004ac6] outline-none resize-y"
                placeholder="Write the full details of your event..."
                rows={6}
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h3 className="text-[20px] font-semibold mb-6 flex items-center gap-2">
            <Icon name="image" className="text-[#004ac6]" />
            Ảnh sự kiện
          </h3>
          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-4">
              <label className="block text-[13px] font-medium mb-2">Ảnh đại diện (1:1)*</label>
              <label className="upload-dashed aspect-square rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-[#CBD5E1] hover:border-[#2563eb] cursor-pointer overflow-hidden">
                {formData.thumbnail_url ? (
                  <img src={formData.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="cloud_upload" className="text-[#737686] mb-2" style={{ fontSize: 32 }} />
                    <p className="text-xs font-semibold mb-1">{uploadingThumb ? 'Uploading...' : 'Click to Upload'}</p>
                    <p className="text-[10px] text-[#737686]">Recommended: 1080x1080px</p>
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
            <div className="md:col-span-8">
              <label className="block text-[13px] font-medium mb-2">Ảnh bìa (16:9)*</label>
              <label className="upload-dashed aspect-video rounded-xl flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-[#CBD5E1] hover:border-[#2563eb] cursor-pointer overflow-hidden">
                {formData.banner_url ? (
                  <img src={formData.banner_url} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Icon name="landscape" className="text-[#737686] mb-2" style={{ fontSize: 40 }} />
                    <p className="text-xs font-semibold mb-1">{uploadingBanner ? 'Uploading...' : 'Drag and drop or click to browse'}</p>
                    <p className="text-[10px] text-[#737686]">Recommended: 1920x1080px. JPG, PNG (Max 5MB)</p>
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
      </div>

      <div className="col-span-12 lg:col-span-4 space-y-6 sticky top-24">
        <div className="bg-white border border-[#c3c6d7] rounded-xl overflow-hidden shadow-sm">
          <div className="relative aspect-video bg-[#f2f4f6]">
            {formData.banner_url ? (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <Icon name="image" style={{ fontSize: 48 }} />
              </div>
            )}
            <div className="absolute top-3 left-3 px-2 py-1 bg-[#d8dadc]/80 backdrop-blur-md rounded text-[10px] font-bold uppercase text-[#434655]">
              Xem trước
            </div>
          </div>
          <div className="p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className={`text-[20px] font-semibold leading-tight ${formData.title ? 'text-[#191c1e]' : 'text-[#737686] italic'}`}>
                  {formData.title || 'Untitled Event'}
                </h4>
                <p className="text-xs text-[#737686] mt-1 italic">
                  {categories.find((c) => c.id === formData.category_id)?.name || 'Category not selected'}
                </p>
              </div>
              <span className="px-2 py-1 bg-[#e0e3e5] text-[#434655] rounded text-xs font-semibold">Draft</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="location_on" className="text-[#004ac6] text-[18px]" />
              <span className="text-sm">{formData.format === 'ONLINE' ? 'Sự kiện trực tuyến' : formData.format === 'HYBRID' ? 'Sự kiện kết hợp' : 'Sự kiện trực tiếp'}</span>
            </div>
            <div className="mt-6">
              <div className="flex justify-between mb-2">
                <span className="text-[13px] font-medium">Tiến độ thiết lập</span>
                <span className="text-[13px] text-[#004ac6] font-bold">20%</span>
              </div>
              <div className="w-full h-2 bg-[#e0e3e5] rounded-full overflow-hidden">
                <div className="w-1/5 h-full bg-[#2563eb]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step2ScheduleVenue({ formData, setFormData, venues }) {
  const addSession = () => {
    setFormData((p) => ({
      ...p,
      sessions: [
        ...p.sessions,
        {
          clientKey: newClientKey(),
          session_name: `Session ${p.sessions.length + 1}`,
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
  }

  const updateSession = (key, field, value) => {
    setFormData((p) => ({
      ...p,
      sessions: p.sessions.map((s) =>
        (s.id || s.clientKey) === key ? { ...s, [field]: value } : s,
      ),
    }))
  }

  const removeSession = (key) => {
    setFormData((p) => ({
      ...p,
      sessions: p.sessions.filter((s) => (s.id || s.clientKey) !== key),
    }))
  }

  const selectedVenue = venues.find((v) => v.id === formData.sessions[0]?.venue_id)

  return (
    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-24">
        <section className="bg-white rounded-xl border border-[#c3c6d7] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Icon name="calendar_today" className="text-[#004ac6]" />
              <h2 className="text-[20px] font-semibold">Lịch sự kiện</h2>
            </div>
            <button
              type="button"
              onClick={addSession}
              className="flex items-center gap-2 px-4 py-2 text-[#004ac6] font-medium text-sm hover:bg-[#004ac6]/5 rounded-lg"
            >
              <Icon name="add" className="text-[18px]" />
              Thêm phiên
            </button>
          </div>
          <div className="space-y-6">
            {formData.sessions.map((session, index) => {
              const key = session.id || session.clientKey
              return (
                <div key={key} className="border border-[#c3c6d7] rounded-xl p-6 relative">
                  {formData.sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSession(key)}
                      className="absolute top-4 right-4 text-[#737686] hover:text-[#ba1a1a]"
                    >
                      <Icon name="close" />
                    </button>
                  )}
                  <p className="text-sm font-bold mb-4 text-[#434655]">Phiên {index + 1}</p>
                  <div className="grid grid-cols-2 gap-6 mb-4">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[13px] text-[#434655] block mb-2">Ngày bắt đầu</label>
                        <input
                          type="date"
                          className="w-full h-11 px-4 rounded-lg border border-[#c3c6d7] text-sm focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6] outline-none"
                          value={session.start_date || ''}
                          onChange={(e) => updateSession(key, 'start_date', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[#434655] block mb-2">Thời gian bắt đầu</label>
                        <input
                          type="time"
                          className="w-full h-11 px-4 rounded-lg border border-[#c3c6d7] text-sm focus:border-[#004ac6] outline-none"
                          value={session.start_time || ''}
                          onChange={(e) => updateSession(key, 'start_time', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[13px] text-[#434655] block mb-2">Ngày kết thúc</label>
                        <input
                          type="date"
                          className="w-full h-11 px-4 rounded-lg border border-[#c3c6d7] text-sm focus:border-[#004ac6] outline-none"
                          value={session.end_date || ''}
                          onChange={(e) => updateSession(key, 'end_date', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[#434655] block mb-2">Thời gian kết thúc</label>
                        <input
                          type="time"
                          className="w-full h-11 px-4 rounded-lg border border-[#c3c6d7] text-sm focus:border-[#004ac6] outline-none"
                          value={session.end_time || ''}
                          onChange={(e) => updateSession(key, 'end_time', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[13px] text-[#434655] block mb-2">Chọn địa điểm*</label>
                    <select
                      className="w-full h-11 px-4 rounded-lg border border-[#c3c6d7] text-sm focus:border-[#004ac6] outline-none bg-white"
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
              )
            })}
            {!formData.sessions.length && (
              <button
                type="button"
                onClick={addSession}
                className="w-full py-8 border-2 border-dashed border-[#c3c6d7] rounded-xl text-[#434655] hover:border-[#2563eb] hover:text-[#004ac6]"
              >
                + Thêm phiên đầu tiên
              </button>
            )}
          </div>
        </section>

        {selectedVenue && (
          <section className="bg-white rounded-xl border border-[#c3c6d7] p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <Icon name="location_on" className="text-[#004ac6]" />
              <h2 className="text-[20px] font-semibold">Chi tiết địa điểm</h2>
            </div>
            <div className="p-6 bg-[#f7f9fb] rounded-xl border border-[#c3c6d7]">
              <h3 className="text-[20px] font-semibold">{selectedVenue.name}</h3>
              <p className="text-sm text-[#434655] flex items-center gap-1 mt-2">
                <Icon name="pin_drop" className="text-[16px]" />
                {[selectedVenue.address_line, selectedVenue.district, selectedVenue.city].filter(Boolean).join(', ')}
              </p>
              {selectedVenue.seat_count > 0 && (
                <p className="text-sm mt-2 text-[#434655]">Sức chứa: {selectedVenue.seat_count} chỗ</p>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="col-span-12 lg:col-span-4 sticky top-24">
        <div className="bg-white rounded-xl border border-[#c3c6d7] overflow-hidden shadow-md">
          <div className="bg-[#2d3133] p-6 text-white">
            <h3 className="text-[20px] font-semibold mb-4">{formData.title || 'Event Draft'}</h3>
            <div className="space-y-3 text-sm text-[#e0e3e5]">
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
              <span className="text-[13px] font-medium">Tiến độ thiết lập</span>
              <span className="text-xs text-[#004ac6] font-bold">45%</span>
            </div>
            <div className="w-full h-2 bg-[#eceef0] rounded-full overflow-hidden">
              <div className="w-[45%] h-full bg-[#004ac6] rounded-full" />
            </div>
          </div>
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

  const sessions = formData.sessions
  const activeSession = sessions[activeTab]
  const sessionKey = activeSession ? activeSession.id || activeSession.clientKey : null
  const seatingType = activeSession?.seating_type || 'GENERAL'
  const venue = venues.find((v) => v.id === activeSession?.venue_id)

  const sessionTickets = formData.ticketTypes.filter((tt) => tt.session_key === sessionKey)

  useEffect(() => {
    if (!activeSession?.venue_id) return
    if (seatMapOptions[activeSession.venue_id]) return
    getVenueSeatMaps(activeSession.venue_id)
      .then((maps) => {
        setSeatMapOptions((prev) => ({ ...prev, [activeSession.venue_id]: maps }))
      })
      .catch(console.error)
  }, [activeSession?.venue_id, seatMapOptions])

  useEffect(() => {
    if (!activeSession?.seat_map_id) {
      setLoadedSeatMap(null)
      return
    }
    setLoadingMaps(true)
    getSeatMap(activeSession.seat_map_id)
      .then(setLoadedSeatMap)
      .catch(console.error)
      .finally(() => setLoadingMaps(false))
  }, [activeSession?.seat_map_id])

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
                    price: 0,
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
      const newTickets = (sm.zones || []).map((zone) => {
        const seatCount = (sm.seats || []).filter(
          (s) => s.zone_id === zone.id && !s.is_disabled,
        ).length
        const clientKey = newClientKey()
        return {
          clientKey,
          session_key: sessionKey,
          name: zone.name,
          price: 0,
          quantity: seatCount,
          is_seated: true,
          zone_id: zone.id,
        }
      })
      const zoneAssignments = newTickets.map((tt) => ({
        zone_id: tt.zone_id,
        ticket_type_local_id: tt.clientKey,
      }))
      updateActiveSession({ seat_map_id: seatMapId, zone_assignments: zoneAssignments })
      setFormData((p) => ({
        ...p,
        ticketTypes: [...p.ticketTypes.filter((tt) => tt.session_key !== sessionKey), ...newTickets],
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
          price: 0,
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
        (tt.id || tt.clientKey) === key ? { ...tt, [field]: value } : tt,
      ),
    }))
  }

  const removeTicket = (key) => {
    setFormData((p) => ({
      ...p,
      ticketTypes: p.ticketTypes.filter((tt) => (tt.id || tt.clientKey) !== key),
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
          <div className="flex flex-wrap gap-2">
            {sessions.map((s, i) => (
              <button
                key={s.id || s.clientKey}
                type="button"
                onClick={() => setActiveTab(i)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  activeTab === i
                    ? 'border-[#2563eb] bg-[#2563eb]/10 text-[#004ac6]'
                    : 'border-[#c3c6d7] text-[#434655]'
                }`}
              >
                {s.session_name || `Session ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        <section className="rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[20px] font-semibold">Loại tổ chức</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSeatingType('GENERAL')}
              className={`rounded-xl border-2 p-5 text-left transition ${
                seatingType === 'GENERAL'
                  ? 'border-[#2563eb] bg-[#2563eb]/5'
                  : 'border-[#c3c6d7] hover:border-[#2563eb]/50'
              }`}
            >
              <span className="text-2xl">🎟</span>
              <p className="mt-2 font-bold">Không chỗ ngồi</p>
              <p className="text-sm text-[#434655]">General Admission</p>
            </button>
            <button
              type="button"
              onClick={() => setSeatingType('ASSIGNED')}
              className={`rounded-xl border-2 p-5 text-left transition ${
                seatingType === 'ASSIGNED'
                  ? 'border-[#2563eb] bg-[#2563eb]/5'
                  : 'border-[#c3c6d7] hover:border-[#2563eb]/50'
              }`}
            >
              <span className="text-2xl">💺</span>
              <p className="mt-2 font-bold">Có chỗ ngồi</p>
              <p className="text-sm text-[#434655]">Có chỗ ngồi</p>
            </button>
          </div>
        </section>

        {seatingType === 'ASSIGNED' && (
          <>
            <section className="rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-[20px] font-semibold">Sơ đồ ghế</h2>
              <p className="mb-4 text-sm text-[#434655]">
                Chọn sơ đồ cho địa điểm &quot;{venue?.name || '...'}&quot;
              </p>
              <select
                className="h-11 w-full rounded-lg border border-[#c3c6d7] bg-white px-4 text-sm"
                value={activeSession?.seat_map_id || ''}
                onChange={(e) => handleSeatMapSelect(e.target.value)}
              >
                <option value="">-- Chọn sơ đồ --</option>
                {venueSeatMaps.map((sm) => (
                  <option key={sm.id} value={sm.id}>
                    {sm.name} ({sm.seat_count || 0} ghế, {sm.zone_count || 0} zones)
                  </option>
                ))}
              </select>
              {loadingMaps && (
                <p className="mt-2 text-sm text-[#737686]">Đang tải sơ đồ...</p>
              )}
              {loadedSeatMap && (
                <div className="mt-4">
                  <SeatMapPreview
                    seats={loadedSeatMap.seats}
                    zones={loadedSeatMap.zones}
                    width={360}
                    height={220}
                  />
                </div>
              )}
            </section>

            {loadedSeatMap && (
              <section className="rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-[20px] font-semibold">Gán zone → ticket type</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#c3c6d7] text-left text-xs uppercase text-[#737686]">
                        <th className="py-2 pr-4">Zone</th>
                        <th className="py-2 pr-4">Ghế</th>
                        <th className="py-2 pr-4">Ticket Type</th>
                        <th className="py-2">Giá (VND)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(loadedSeatMap.zones || []).map((zone) => {
                        const seatCount = (loadedSeatMap.seats || []).filter(
                          (s) => s.zone_id === zone.id && !s.is_disabled,
                        ).length
                        const ticket = sessionTickets.find((tt) => tt.zone_id === zone.id)
                        const ticketKey = ticket ? ticket.id || ticket.clientKey : null
                        return (
                          <tr key={zone.id} className="border-b border-[#e0e3e5]">
                            <td className="py-3 pr-4">
                              <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ background: zone.color }} />
                              {zone.name}
                            </td>
                            <td className="py-3 pr-4">{seatCount}</td>
                            <td className="py-3 pr-4">
                              <select
                                className="h-9 w-full rounded border border-[#c3c6d7] px-2 text-sm"
                                value={ticketKey || ''}
                                onChange={(e) => {
                                  const selected = sessionTickets.find(
                                    (tt) => (tt.id || tt.clientKey) === e.target.value,
                                  )
                                  if (!selected) return
                                  setFormData((p) => ({
                                    ...p,
                                    sessions: p.sessions.map((s, i) =>
                                      i === activeTab
                                        ? {
                                            ...s,
                                            zone_assignments: (s.zone_assignments || []).map((za) =>
                                              za.zone_id === zone.id
                                                ? {
                                                    zone_id: zone.id,
                                                    ticket_type_local_id:
                                                      selected.clientKey || selected.id,
                                                  }
                                                : za,
                                            ),
                                          }
                                        : s,
                                    ),
                                    ticketTypes: p.ticketTypes.map((tt) =>
                                      (tt.id || tt.clientKey) === (selected.id || selected.clientKey)
                                        ? { ...tt, zone_id: zone.id, name: zone.name, quantity: seatCount }
                                        : tt,
                                    ),
                                  }))
                                }}
                              >
                                {sessionTickets.map((tt) => (
                                  <option key={tt.id || tt.clientKey} value={tt.id || tt.clientKey}>
                                    {tt.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3">
                              {ticketKey && (
                                <input
                                  type="number"
                                  min="0"
                                  className="h-9 w-32 rounded border border-[#c3c6d7] px-2 text-sm"
                                  value={ticket?.price ?? 0}
                                  onChange={(e) =>
                                    updateTicket(ticketKey, 'price', Number(e.target.value))
                                  }
                                />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {unassignedCount > 0 && (
                        <tr>
                          <td className="py-3 pr-4 text-[#737686]">Chưa gán</td>
                          <td className="py-3 pr-4">{unassignedCount}</td>
                          <td className="py-3 pr-4 text-[#737686]">—</td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {seatingType === 'GENERAL' && (
          <section className="rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-semibold">Ticket Types</h2>
                <p className="text-sm text-[#434655]">Define your pricing tiers and availability.</p>
              </div>
              <button
                type="button"
                onClick={addTicketType}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#004ac6] hover:bg-[#dbe1ff]"
              >
                <Icon name="add" />
                Add Ticket Type
              </button>
            </div>
            <div className="space-y-4">
              {sessionTickets.map((tt) => {
                const key = tt.id || tt.clientKey
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-[#c3c6d7] bg-[#f7f9fb] p-4 hover:border-[#004ac6]"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-[#737686]">Name*</label>
                        <input
                          className="w-full rounded-lg border border-[#c3c6d7] px-3 py-2 text-sm"
                          value={tt.name}
                          onChange={(e) => updateTicket(key, 'name', e.target.value)}
                          placeholder="Early Bird"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#737686]">Price*</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full rounded-lg border border-[#c3c6d7] px-3 py-2 text-sm"
                          value={tt.price}
                          onChange={(e) => updateTicket(key, 'price', Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#737686]">Quantity*</label>
                        <input
                          type="number"
                          min="1"
                          className="w-full rounded-lg border border-[#c3c6d7] px-3 py-2 text-sm"
                          value={tt.quantity}
                          onChange={(e) => updateTicket(key, 'quantity', Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeTicket(key)}
                        className="text-[#737686] hover:text-[#ba1a1a]"
                      >
                        <Icon name="delete" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {!sessionTickets.length && (
                <p className="py-6 text-center text-sm text-[#434655]">
                  No ticket types yet. Click &quot;Add Ticket Type&quot;.
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="col-span-12 space-y-6 lg:col-span-4 lg:sticky lg:top-20">
        <div className="overflow-hidden rounded-xl border border-[#c3c6d7] bg-white shadow-sm">
          <div className="border-b border-[#c3c6d7] bg-[#e6e8ea] px-6 py-4">
            <h3 className="text-sm font-bold">Tóm tắt sự kiện</h3>
          </div>
          <div className="space-y-4 p-6">
            <div className="flex justify-between">
              <span className="text-sm text-[#434655]">Loại vé</span>
              <span className="font-bold">{formData.ticketTypes.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#434655]">Tổng số lượng</span>
              <span className="font-bold">{totalQty}</span>
            </div>
            <div className="flex justify-between border-t border-[#c3c6d7] pt-4">
              <span className="text-sm font-bold">Tổng Doanh Thu</span>
              <span className="text-[20px] font-bold text-[#004ac6]">
                {totalRevenue.toLocaleString('vi-VN')} VND
              </span>
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
      <div className="col-span-12 lg:col-span-8 space-y-6 pb-24">
        <section className="bg-white rounded-xl border border-[#c3c6d7] p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#004ac6]/10 flex items-center justify-center text-[#004ac6]">
                <Icon name="payments" />
              </div>
              <h3 className="text-[20px] font-semibold">Chính sách hoàn tiền</h3>
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
              <div className="w-11 h-6 bg-[#c3c6d7] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2563eb]" />
              <span className="ml-3 text-sm font-medium">Cho phép hoàn tiền</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[13px] text-[#434655] block mb-1">Hạn chót yêu cầu hoàn tiền</label>
              <select
                className="w-full border border-[#c3c6d7] rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]/20"
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
          <div>
            <label className="text-[13px] text-[#434655] block mb-1">Điều khoản bổ sung</label>
            <textarea
              className="w-full border border-[#c3c6d7] rounded-lg px-4 py-2 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-[#004ac6]/20"
              placeholder="Thêm các điều khoản hoặc hướng dẫn bổ sung cho người giữ vé..."
              value={formData.additional_terms}
              onChange={(e) => setFormData((p) => ({ ...p, additional_terms: e.target.value }))}
            />
          </div>
        </section>
      </div>

      <div className="col-span-12 lg:col-span-4 sticky top-24">
        <div className="bg-white rounded-xl border border-[#c3c6d7] overflow-hidden shadow-sm">
          <div className="bg-[#e6e8ea] p-4 border-b border-[#c3c6d7]">
            <h3 className="font-bold flex items-center gap-2">
              <Icon name="description" className="text-[#004ac6]" />
              Tóm tắt chính sách
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Icon name="check_circle" className="text-green-600" />
              <div>
                <p className="text-sm font-bold">Chính sách hoàn tiền</p>
                <p className="text-xs text-[#737686]">
                  {rp.allow_refunds
                    ? `${rp.deadline_days || 7}-day refund enabled`
                    : 'Refunds disabled'}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-[#c3c6d7]">
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold uppercase">Tiến độ bản nháp</span>
                <span className="text-xs font-bold text-[#004ac6]">80%</span>
              </div>
              <div className="w-full h-2 bg-[#eceef0] rounded-full overflow-hidden">
                <div className="h-full bg-[#2563eb] rounded-full" style={{ width: '80%' }} />
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

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-8 space-y-4 pb-24">
        <section className="bg-white border border-[#c3c6d7] rounded-xl overflow-hidden shadow-sm">
          <div className="h-48 relative">
            {formData.banner_url && (
              <img src={formData.banner_url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-6 flex items-end gap-4">
              {formData.thumbnail_url && (
                <div className="w-20 h-20 bg-white p-1 rounded-lg border-2 border-[#004ac6] shadow-xl">
                  <img src={formData.thumbnail_url} alt="" className="w-full h-full object-cover rounded-md" />
                </div>
              )}
              <div className="mb-1 text-white">
                <h3 className="text-[20px] font-bold">{formData.title}</h3>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {formData.tags.map((tag) => (
                    <span key={tag} className="bg-[#004ac6]/20 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold uppercase border border-white/20">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm text-[#434655]">{formData.short_description}</p>
            <p className="text-xs text-[#737686] mt-2">{categoryName} · {formData.format}</p>
          </div>
        </section>

        <section className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="calendar_today" className="text-[#004ac6]" />
            <h4 className="text-sm font-bold uppercase tracking-wider">Lịch trình & Địa điểm</h4>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-xs text-[#737686] mb-1 uppercase">Phiên</label>
              <p className="font-semibold">{formData.sessions.length} phiên</p>
            </div>
            <div>
              <label className="block text-xs text-[#737686] mb-1 uppercase">Địa điểm</label>
              <p className="font-semibold">{venue?.name || '—'}</p>
            </div>
            <div>
              <label className="block text-xs text-[#737686] mb-1 uppercase">Hiển thị</label>
              <p className="font-semibold">{formData.visibility}</p>
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="confirmation_number" className="text-[#004ac6]" />
            <h4 className="text-sm font-bold uppercase tracking-wider">Vé & Chỗ ngồi</h4>
          </div>
          <div className="space-y-3">
            {formData.ticketTypes.map((tt) => (
              <div key={tt.id || tt.clientKey} className="flex justify-between p-3 bg-[#f2f4f6] rounded-lg border border-[#c3c6d7]/50">
                <div>
                  <p className="font-bold text-sm">{tt.name}</p>
                  <p className="text-xs text-[#434655]">{tt.quantity} vé · {tt.is_seated ? 'Có chỗ ngồi' : 'Không chỗ ngồi'}</p>
                </div>
                <p className="font-bold text-sm">{Number(tt.price).toLocaleString('vi-VN')} VND</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="policy" className="text-[#004ac6]" />
            <h4 className="text-sm font-bold uppercase tracking-wider">Chính sách</h4>
          </div>
          <p className="text-sm text-[#434655]">
            {formData.refund_policy.allow_refunds
              ? `Hoàn tiền trước sự kiện ${formData.refund_policy.deadline_days} ngày.`
              : 'Không hoàn tiền.'}
          </p>
          {formData.additional_terms && (
            <p className="text-sm text-[#434655] mt-2">{formData.additional_terms}</p>
          )}
        </section>
      </div>

      <aside className="col-span-12 lg:col-span-4">
        <div className="sticky top-24 bg-white border border-[#c3c6d7] rounded-xl p-6 shadow-md border-t-4 border-t-[#004ac6]">
          <div className="flex justify-between mb-4">
            <span className="text-sm font-bold">Tiến độ 100%</span>
            <span className="px-2 py-0.5 bg-[#e6e8ea] rounded text-xs font-bold uppercase">Bản nháp</span>
          </div>
          <div className="w-full bg-[#e6e8ea] h-2 rounded-full mb-6 overflow-hidden">
            <div className="bg-[#004ac6] h-full w-full" />
          </div>
          <p className="text-xs text-[#434655] text-center">
            Gửi để gửi sự kiện của bạn để ban tổ chức xem xét.
          </p>
        </div>
      </aside>
    </div>
  )
}

export function CreateEventPage() {
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
  const [successMessage, setSuccessMessage] = useState('')

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
    Promise.all([fetchEventCategories(), fetchOrganizerVenues()])
      .then(([cats, vns]) => {
        setCategories(cats)
        setVenues(vns)
      })
      .catch((err) => {
        console.error(err)
        setError('Không thể tải dữ liệu danh mục hoặc địa điểm.')
      })
  }, [])

  const populateFromEvent = useCallback((event) => {
    const sessions = (event.sessions || []).map((s) => {
      const start = splitDateTime(s.start_time)
      const end = splitDateTime(s.end_time)
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
        checkin_start_time: s.checkin_start_time,
      }
    })

    const ticketTypes = (event.ticket_types || []).map((tt) => ({
      id: tt.id,
      clientKey: tt.id,
      session_key: tt.event_session_id,
      name: tt.name,
      price: tt.price,
      quantity: tt.quantity,
      is_seated: tt.is_seated,
      zone_id: null,
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
      refund_policy: event.refund_policy || { allow_refunds: false, deadline_days: 7 },
      additional_terms: event.additional_terms || '',
    })
  }, [])

  useEffect(() => {
    if (!routeEventId) return
    setInitialLoading(true)
    fetchOrganizerEvent(routeEventId)
      .then((event) => {
        setEventId(event.id)
        setEventStatus(event.status || 'DRAFT')
        populateFromEvent(event)
        setCurrentStep(1)
        setMaxCompletedStep(5)
      })
      .catch((err) => {
        console.error(err)
        setError('Không thể tải sự kiện.')
      })
      .finally(() => setInitialLoading(false))
  }, [routeEventId, populateFromEvent])

  const validateStep = (step) => {
    if (step === 1) {
      if (!formData.title.trim()) return 'Vui lòng nhập tên sự kiện.'
      if (!formData.category_id) return 'Vui lòng chọn danh mục.'
      if (!formData.short_description.trim()) return 'Vui lòng nhập mô tả ngắn.'
      if (!formData.description.trim()) return 'Vui lòng nhập mô tả đầy đủ.'
      if (!formData.thumbnail_url) return 'Vui lòng tải ảnh thumbnail.'
      if (!formData.banner_url) return 'Vui lòng tải ảnh banner.'
    }
    if (step === 2) {
      if (!formData.sessions.length) return 'Cần ít nhất 1 session.'
      for (const s of formData.sessions) {
        if (!s.start_date || !s.start_time || !s.end_date || !s.end_time) {
          return 'Mỗi session cần thời gian bắt đầu và kết thúc.'
        }
        if (!s.venue_id) return 'Mỗi session cần chọn địa điểm.'
      }
    }
    if (step === 3) {
      for (const s of formData.sessions) {
        const key = s.id || s.clientKey
        const seatingType = s.seating_type || 'GENERAL'
        if (seatingType === 'ASSIGNED') {
          if (!s.seat_map_id) {
            return `Session "${s.session_name || 'unnamed'}" cần chọn sơ đồ ghế.`
          }
        }
        const tickets = formData.ticketTypes.filter((tt) => tt.session_key === key)
        if (!tickets.length) return `Session "${s.session_name || 'unnamed'}" cần ít nhất 1 loại vé.`
        for (const tt of tickets) {
          if (!tt.name?.trim()) return 'Tên loại vé không được để trống.'
          if (tt.price < 0) return 'Giá vé phải >= 0.'
          if (!tt.quantity || tt.quantity <= 0) return 'Số lượng vé phải > 0.'
        }
      }
    }
    return ''
  }

  const buildSessionsPayload = () =>
    formData.sessions.map((s) => ({
      id: s.id,
      session_name: s.session_name,
      start_time: combineDateTime(s.start_date, s.start_time),
      end_time: combineDateTime(s.end_date, s.end_time),
      venue_id: s.venue_id,
      seat_map_id: s.seating_type === 'ASSIGNED' ? s.seat_map_id : null,
      checkin_start_time: s.checkin_start_time || null,
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
        price: tt.price,
        quantity: tt.quantity,
        is_seated:
          formData.sessions.find((s) => (s.id || s.clientKey) === tt.session_key)?.seating_type ===
          'ASSIGNED'
            ? true
            : tt.is_seated,
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
      setError('Không thể tải thumbnail.')
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
      setError('Không thể tải banner.')
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
            checkin_start_time: s.checkin_start_time,
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
        })
        await syncZoneAssignments()
        const finalEvent = await fetchOrganizerEvent(eventId)
        populateFromEvent(finalEvent)
      } else if (currentStep === 4) {
        await updateOrganizerEvent(eventId, {
          refund_policy: formData.refund_policy,
          additional_terms: formData.additional_terms,
        })
      }
      const next = Math.min(currentStep + 1, 5)
      setCurrentStep(next)
      setMaxCompletedStep((prev) => Math.max(prev, next))
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateEvent = async () => {
    for (let step = 1; step <= 4; step += 1) {
      const validationError = validateStep(step)
      if (validationError) {
        setError(validationError)
        setCurrentStep(step)
        return
      }
    }

    setLoading(true)
    setError('')
    setSuccessMessage('')
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
        refund_policy: formData.refund_policy,
        additional_terms: formData.additional_terms,
        sessions: buildSessionsPayload(),
        ticket_types: buildTicketTypesPayload(),
      })
      await syncZoneAssignments()
      navigate('/organizer/events', {
        state: { message: 'Đã cập nhật sự kiện thành công.' },
      })
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Không thể cập nhật sự kiện.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setSuccessMessage('')
    try {
      await submitOrganizerEvent(eventId)
      navigate('/organizer/events', {
        state: { message: 'Đã gửi sự kiện để duyệt.' },
      })
    } catch (err) {
      console.error(err)
      const errorCode = err.response?.data?.errorCode
      if (errorCode === 'PAYOS_NOT_CONFIGURED') {
        navigate('/organizer/settings/payment', {
          state: { error: 'Bạn cần cấu hình kênh thanh toán PayOS trước khi mở bán vé cho sự kiện này.' },
        })
        return
      }
      setError(err.response?.data?.message || 'Không thể gửi sự kiện.')
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
      return isEditMode ? 'Tiếp: Xem lại & cập nhật' : 'Next: Review & Submit'
    }
    if (currentStep === 3) return 'Next: Policies & Settings'
    if (currentStep === 2) return 'Next: Tickets & Seats'
    return 'Next Step'
  }, [currentStep, isEditMode])

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-[#2563eb] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="pb-28">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold text-[#111827]">
          {isEditMode ? 'Chỉnh sửa sự kiện' : 'Create Event'}
        </h1>
        <p className="mt-1 text-sm text-[#434655]">
          {isEditMode
            ? 'Cập nhật thông tin sự kiện qua 5 bước.'
            : 'Set up your event in 5 simple steps.'}
        </p>
      </div>

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

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#ba1a1a]/20 bg-[#ffdad6] p-4 text-sm text-[#ba1a1a]">
          <Icon name="error" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <Icon name="check_circle" />
          {successMessage}
        </div>
      )}

      {currentStep === 1 && (
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

      <footer className="fixed bottom-0 right-0 left-0 lg:left-[240px] bg-white/80 backdrop-blur-md border-t border-[#c3c6d7] p-4 px-8 flex justify-between items-center z-40">
        <button
          type="button"
          onClick={() => navigate('/organizer/events')}
          className="px-6 py-2.5 rounded-lg border border-[#c3c6d7] text-[#191c1e] text-sm font-medium hover:bg-[#f2f4f6]"
        >
          Cancel
        </button>
        <div className="flex gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg border border-[#c3c6d7] text-sm font-medium hover:bg-[#f2f4f6] flex items-center gap-2"
            >
              <Icon name="arrow_back" className="text-[18px]" />
              Back
            </button>
          )}
          {currentStep < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[#2563eb] px-8 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
            >
              {loading ? 'Saving...' : nextLabel}
              {!loading && <Icon name="arrow_forward" className="text-[18px]" />}
            </button>
          ) : isEditMode ? (
            <>
              {eventStatus === 'DRAFT' && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="rounded-lg border border-[#c3c6d7] px-6 py-2.5 text-sm font-medium hover:bg-[#f2f4f6] disabled:opacity-50"
                >
                  {loading ? 'Đang xử lý...' : 'Gửi duyệt'}
                </button>
              )}
              <button
                type="button"
                onClick={handleUpdateEvent}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-[#2563eb] px-8 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
              >
                {loading ? 'Đang cập nhật...' : 'Cập nhật sự kiện'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[#2563eb] px-8 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
