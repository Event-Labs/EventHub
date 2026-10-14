import { useState, useRef, useMemo } from 'react'
import {
  Sparkles,
  Upload,
  FileText,
  X as CloseIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Ticket,
  FileUp,
  RefreshCw,
  Cpu,
  ArrowRight,
  Plus,
  Armchair,
  HelpCircle,
  Tag,
  Check,
} from 'lucide-react'
import { extractEventFromDocument } from '@/services/organizerEvents.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { VenueFormModal } from './OrganizerVenuesPage.jsx'
import { SeatMapEditor } from './SeatMapEditor.jsx'

export function AiDocumentExtractorModal({ isOpen, onClose, onApply, venues = [], onVenuesUpdated }) {
  const toast = useToast()
  const fileInputRef = useRef(null)

  // Input states
  const [activeTab, setActiveTab] = useState('file') // 'file' | 'text'
  const [selectedFile, setSelectedFile] = useState(null)
  const [rawText, setRawText] = useState('')
  const [userNote, setUserNote] = useState('')

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStep, setProcessStep] = useState(1) // 1: reading, 2: ai extracting, 3: validating
  const [extractedResult, setExtractedResult] = useState(null)

  // Quick Venue creation & Seat Map flow states
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false)
  const [newlyCreatedVenue, setNewlyCreatedVenue] = useState(null)
  const [isSeatMapPromptOpen, setIsSeatMapPromptOpen] = useState(false)
  const [isSeatMapEditorOpen, setIsSeatMapEditorOpen] = useState(false)

  // Venue matching logic
  const currentVenueId = extractedResult?.data?.venue_id || null
  const currentVenueName = (extractedResult?.data?.venue_name || '').trim()

  const matchedVenue = useMemo(() => {
    if (!venues || venues.length === 0) return null
    if (currentVenueId) {
      const found = venues.find((v) => String(v.id) === String(currentVenueId))
      if (found) return found
    }
    if (!currentVenueName) return null
    const clean = currentVenueName.toLowerCase()
    return (
      venues.find((v) => {
        const vName = (v.name || '').trim().toLowerCase()
        return vName === clean || vName.includes(clean) || clean.includes(vName)
      }) || null
    )
  }, [currentVenueId, currentVenueName, venues])

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
        toast.error('Vui lòng chọn file định dạng .pdf, .docx hoặc .txt')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Kích thước file không được vượt quá 10MB')
        return
      }
      setSelectedFile(file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
        toast.error('Vui lòng chọn file định dạng .pdf, .docx hoặc .txt')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Kích thước file không được vượt quá 10MB')
        return
      }
      setSelectedFile(file)
    }
  }

  const handleStartExtraction = async () => {
    if (activeTab === 'file' && !selectedFile) {
      toast.error('Vui lòng chọn hoặc kéo thả file tài liệu sự kiện')
      return
    }
    if (activeTab === 'text' && (!rawText || rawText.trim().length < 20)) {
      toast.error('Vui lòng nhập nội dung kế hoạch sự kiện (tối thiểu 20 ký tự)')
      return
    }

    setIsProcessing(true)
    setProcessStep(1)
    setExtractedResult(null)

    const stepTimer1 = setTimeout(() => setProcessStep(2), 1200)

    try {
      const payload = {
        file: activeTab === 'file' ? selectedFile : null,
        rawText: activeTab === 'text' ? rawText : '',
        note: userNote,
      }

      const res = await extractEventFromDocument(payload)

      clearTimeout(stepTimer1)
      setProcessStep(3)

      setTimeout(() => {
        setIsProcessing(false)
        setExtractedResult(res)
        toast.success('AI đã trích xuất dữ liệu thành công!')
      }, 700)
    } catch (err) {
      clearTimeout(stepTimer1)
      setIsProcessing(false)
      const msg = err.response?.data?.message || err.message || 'Lỗi khi trích xuất dữ liệu tài liệu'
      toast.error(msg)
    }
  }

  const handleApplyToDraft = () => {
    if (!extractedResult || !extractedResult.data) return
    const appliedData = { ...extractedResult.data }
    if (matchedVenue) {
      appliedData.venue_id = matchedVenue.id
      appliedData.venue_name = matchedVenue.name
    }
    onApply(appliedData)
    onClose()
  }

  const handleReset = () => {
    setSelectedFile(null)
    setRawText('')
    setUserNote('')
    setExtractedResult(null)
    setIsProcessing(false)
    setProcessStep(1)
    setNewlyCreatedVenue(null)
    setIsSeatMapPromptOpen(false)
    setIsSeatMapEditorOpen(false)
  }

  // --- Quick Venue & Seat Map Handlers ---
  const handleOpenQuickCreateVenue = () => {
    setIsVenueModalOpen(true)
  }

  const handleVenueSaved = (createdVenue) => {
    setIsVenueModalOpen(false)
    if (createdVenue) {
      setNewlyCreatedVenue(createdVenue)
      onVenuesUpdated?.(createdVenue)
      // Hiện popup hỏi người dùng có muốn tạo sơ đồ ghế cho địa điểm mới này không
      setIsSeatMapPromptOpen(true)
    }
  }

  const handleSkipSeatMap = () => {
    setIsSeatMapPromptOpen(false)
    if (newlyCreatedVenue) {
      setExtractedResult((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          venue_id: newlyCreatedVenue.id,
          venue_name: newlyCreatedVenue.name,
          address_line: newlyCreatedVenue.address_line || prev.data.address_line,
          province: newlyCreatedVenue.city || prev.data.province,
        },
      }))
      toast.success(`Đã cập nhật địa điểm "${newlyCreatedVenue.name}" vào thông tin sự kiện!`)
    }
  }

  const handleOpenSeatMapEditor = () => {
    setIsSeatMapPromptOpen(false)
    setIsSeatMapEditorOpen(true)
  }

  const handleSeatMapEditorClose = () => {
    setIsSeatMapEditorOpen(false)
    if (newlyCreatedVenue) {
      setExtractedResult((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          venue_id: newlyCreatedVenue.id,
          venue_name: newlyCreatedVenue.name,
          address_line: newlyCreatedVenue.address_line || prev.data.address_line,
          province: newlyCreatedVenue.city || prev.data.province,
        },
      }))
      toast.success(`Đã cập nhật địa điểm "${newlyCreatedVenue.name}"!`)
    }
  }

  const handleSeatMapEditorSaved = (savedSeatMap) => {
    setIsSeatMapEditorOpen(false)
    if (newlyCreatedVenue) {
      setExtractedResult((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          venue_id: newlyCreatedVenue.id,
          venue_name: newlyCreatedVenue.name,
          address_line: newlyCreatedVenue.address_line || prev.data.address_line,
          province: newlyCreatedVenue.city || prev.data.province,
          seat_map_id: savedSeatMap?.id || null,
          seating_type: savedSeatMap?.id ? 'ASSIGNED' : 'GENERAL',
        },
      }))
      toast.success(`Đã tạo sơ đồ ghế và cập nhật địa điểm "${newlyCreatedVenue.name}"!`)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-neutral-900 via-neutral-900 to-indigo-950/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Tạo sự kiện bằng AI từ File tài liệu</h3>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Cpu className="w-3 h-3" /> Qwen3 EventHub (Q4_K_M)
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Tự động bóc tách kịch bản, thời gian, check-in, địa điểm, hạng vé & điền vào bản nháp
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            {/* STATE 1: LOADING & PROGRESS */}
            {isProcessing && (
              <div className="py-8 flex flex-col items-center justify-center text-center">
                <div className="relative w-20 h-20 mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-ping" />
                  <div className="w-20 h-20 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-indigo-500/30 border-l-transparent animate-spin flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
                  </div>
                </div>

                <h4 className="text-base font-semibold text-white mb-2">
                  Đang xử lý tài liệu với Qwen3 EventHub AI
                </h4>
                <p className="text-xs text-neutral-400 max-w-sm mb-6">
                  Hệ thống đang phân tích văn bản theo thời gian thực và bóc tách các trường dữ liệu cần thiết.
                </p>

                {/* Step indicator */}
                <div className="w-full max-w-md space-y-3 bg-neutral-950/60 p-4 rounded-xl border border-neutral-800/80 text-left">
                  <div className={`flex items-center gap-3 text-xs transition-colors ${processStep >= 1 ? 'text-white' : 'text-neutral-500'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${processStep > 1 ? 'bg-emerald-500 text-black' : processStep === 1 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400'}`}>
                      {processStep > 1 ? '✓' : '1'}
                    </div>
                    <span>Đọc và trích xuất nội dung văn bản từ tài liệu</span>
                  </div>

                  <div className={`flex items-center gap-3 text-xs transition-colors ${processStep >= 2 ? 'text-white' : 'text-neutral-500'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${processStep > 2 ? 'bg-emerald-500 text-black' : processStep === 2 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400'}`}>
                      {processStep > 2 ? '✓' : '2'}
                    </div>
                    <span>Mô hình Qwen3 EventHub AI đang phân tích văn bản & bóc tách cấu trúc...</span>
                  </div>

                  <div className={`flex items-center gap-3 text-xs transition-colors ${processStep >= 3 ? 'text-white' : 'text-neutral-500'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${processStep === 3 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400'}`}>
                      3
                    </div>
                    <span>Kiểm chứng dữ liệu, đối soát địa điểm & chuẩn hóa thông tin</span>
                  </div>
                </div>
              </div>
            )}

            {/* STATE 2: EXTRACTED RESULT PREVIEW */}
            {!isProcessing && extractedResult && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-400">Trích xuất thông tin thành công!</h4>
                    <p className="text-xs text-neutral-300 mt-0.5">
                      Dưới đây là thông tin sự kiện AI đã bóc tách từ tài liệu. Bạn có thể xem lại và áp dụng vào bản nháp.
                    </p>
                  </div>
                </div>

                {/* Venue matching alert if not in existing venues */}
                {!matchedVenue && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-start gap-2.5 text-amber-300">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="font-semibold text-amber-200">
                          {currentVenueName
                            ? `Địa điểm "${currentVenueName}" chưa có trong danh sách địa điểm của bạn!`
                            : 'Tài liệu chưa có thông tin địa điểm cụ thể!'}
                        </p>
                        <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                          Hệ thống không tự động chọn địa điểm khác để tránh sai lệch thông tin. Vui lòng bấm nút bên cạnh để tạo địa điểm mới nhanh chóng.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenQuickCreateVenue}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tạo địa điểm mới nhanh</span>
                    </button>
                  </div>
                )}

                {/* Warning box if any other warnings */}
                {extractedResult.warnings && extractedResult.warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-300">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                    <div className="space-y-1">
                      {extractedResult.warnings.map((w, idx) => (
                        <p key={idx}>{w}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Preview Card */}
                <div className="bg-neutral-950/80 rounded-xl p-4 border border-neutral-800 space-y-3">
                  <div>
                    <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Tên sự kiện</span>
                    <p className="text-base font-bold text-white mt-0.5">{extractedResult.data.title}</p>
                    {extractedResult.data.require_attendee_information && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 mt-2">
                        <span className="size-1.5 rounded-full bg-sky-400 shrink-0" />
                        <span>Có yêu cầu thu thập thông tin người tham dự</span>
                      </div>
                    )}
                  </div>

                  {extractedResult.data.short_description && (
                    <div className="pt-2 border-t border-neutral-800/80">
                      <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                        Mô tả ngắn ({extractedResult.data.short_description.length} ký tự)
                      </span>
                      <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">{extractedResult.data.short_description}</p>
                    </div>
                  )}

                  {/* Time & Venue Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-2 w-full">
                        <span className="text-[11px] text-neutral-400">
                          Thời gian & Lịch trình ({extractedResult.data.sessions?.length || 1} phiên)
                        </span>
                        {(extractedResult.data.sessions && extractedResult.data.sessions.length > 0
                          ? extractedResult.data.sessions
                          : [extractedResult.data.session || {}]
                        ).map((s, idx) => (
                          <div key={idx} className="space-y-0.5 border-b border-neutral-800/50 pb-1.5 last:border-b-0 last:pb-0">
                            {(extractedResult.data.sessions?.length > 1 || s.session_name) && (
                              <p className="text-[11px] font-bold text-indigo-300">
                                {s.session_name || `Phiên ${idx + 1}`}
                              </p>
                            )}
                            <p className="text-xs font-semibold text-white">
                              {s.start_date || 'Chưa rõ ngày'}
                              {s.start_time ? (
                                ` | ${s.start_time}${s.end_time ? ` - ${s.end_time}` : ''}`
                              ) : (
                                <span className="text-amber-300 font-normal ml-1">· Chưa có giờ trong tài liệu</span>
                              )}
                            </p>
                            {s.checkin_start_time ? (
                              <p className="text-[11px] text-indigo-300/80">
                                Check-in: <strong>{s.checkin_start_time}</strong>
                              </p>
                            ) : (
                              <p className="text-[11px] text-neutral-500 italic">
                                Check-in: Chưa có trong tài liệu
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className={`w-4 h-4 flex-shrink-0 mt-0.5 ${matchedVenue ? 'text-emerald-400' : 'text-amber-400'}`} />
                      <div className="overflow-hidden">
                        <span className="text-[11px] text-neutral-400">Địa điểm</span>
                        <p className="text-xs font-semibold text-white truncate">
                          {matchedVenue ? matchedVenue.name : (currentVenueName || (extractedResult.data.province ? `Khu vực ${extractedResult.data.province}` : 'Chưa xác định'))}
                        </p>
                        {matchedVenue ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 mt-0.5">
                            <Check className="w-3 h-3" /> Đã khớp: {matchedVenue.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 mt-0.5">
                            <AlertCircle className="w-3 h-3" /> {currentVenueName ? 'Chưa có trong danh sách' : 'Chưa có trong tài liệu'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Seat Map badge if created */}
                  {extractedResult.data.seat_map_id && (
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
                      <Armchair className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Đã gắn sơ đồ ghế vừa thiết kế cho sự kiện này.</span>
                    </div>
                  )}

                  {/* Tickets with description */}
                  <div className="pt-2 border-t border-neutral-800/80">
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-2">
                      <Ticket className="w-3.5 h-3.5 text-amber-400" />
                      <span>Hạng vé tìm thấy ({extractedResult.data.ticket_types?.length || 0})</span>
                    </div>
                    <div className="space-y-1.5">
                      {extractedResult.data.ticket_types?.map((t, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-200">{t.name}</span>
                              <span className="text-emerald-400 font-bold">
                                {Number(t.price) === 0 ? 'Miễn phí' : `${Number(t.price).toLocaleString('vi-VN')} đ`}
                              </span>
                              {t.quantity_total ? (
                                <span className="text-neutral-400 text-[10px]">({t.quantity_total} vé)</span>
                              ) : (
                                <span className="text-amber-400 text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium">Chưa có số lượng</span>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-[11px] text-neutral-400 mt-0.5 italic">
                                {t.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  {extractedResult.data.tags && extractedResult.data.tags.length > 0 && (
                    <div className="pt-2 border-t border-neutral-800/80">
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-1.5">
                        <Tag className="w-3.5 h-3.5 text-violet-400" />
                        <span>Tags sự kiện ({extractedResult.data.tags.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {extractedResult.data.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-700/60 text-[11px] font-medium text-neutral-300"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800/60 text-xs text-neutral-400">
                  💡 <strong className="text-neutral-300">Lưu ý:</strong> Khi bấm &quot;Áp dụng vào bản nháp&quot;, AI sẽ điền toàn bộ dữ liệu trên vào các bước của form. Ban tổ chức có thể xem lại, sửa đổi và bổ sung hình ảnh trước khi gửi duyệt.
                </div>
              </div>
            )}

            {/* STATE 3: INPUT FORM */}
            {!isProcessing && !extractedResult && (
              <div className="space-y-4">
                {/* Tab selector */}
                <div className="flex items-center gap-2 p-1 bg-neutral-950 rounded-xl border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${activeTab === 'file'
                        ? 'bg-neutral-800 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                      }`}
                  >
                    <FileUp className="w-4 h-4" />
                    <span>Tải lên File (.pdf, .docx, .txt)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${activeTab === 'text'
                        ? 'bg-neutral-800 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                      }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Dán nội dung kế hoạch</span>
                  </button>
                </div>

                {/* Tab 1: File Upload */}
                {activeTab === 'file' && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    {!selectedFile ? (
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-neutral-700 hover:border-indigo-500/60 hover:bg-neutral-800/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-neutral-800 group-hover:bg-indigo-600/20 group-hover:text-indigo-400 text-neutral-400 flex items-center justify-center mb-3 transition-colors">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-white mb-1">
                          Kéo thả file vào đây hoặc <span className="text-indigo-400 underline">duyệt từ máy</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          Hỗ trợ PDF, Word (.docx) hoặc Text (.txt) — Tối đa 10MB
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium text-white truncate">{selectedFile.name}</p>
                            <p className="text-[11px] text-neutral-500">
                              {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedFile(null)}
                          className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                          title="Xóa file"
                        >
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Text Paste */}
                {activeTab === 'text' && (
                  <div>
                    <textarea
                      rows={7}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Dán nội dung kế hoạch sự kiện, kịch bản, thông cáo báo chí hoặc ghi chú tổ chức vào đây..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all resize-none"
                    />
                    <div className="text-right text-[11px] text-neutral-500 mt-1">
                      {rawText.length} ký tự
                    </div>
                  </div>
                )}

                {/* Optional user note */}
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Ghi chú thêm cho AI <span className="text-neutral-500">(Tùy chọn)</span>
                  </label>
                  <input
                    type="text"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="Ví dụ: Ưu tiên sự kiện bắt đầu lúc 19:00, địa điểm tại TP.HCM..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/60 transition-all"
                  />
                </div>

                {/* Security & Anti-hallucination banner */}
                <div className="p-3 bg-neutral-950/40 rounded-xl border border-neutral-800/60 flex items-start gap-2.5 text-[11px] text-neutral-400">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Bảo mật & Chuẩn xác:</strong> Mô hình AI <strong>qwen3-eventhub-Q4_K_M.gguf</strong> xử lý nội bộ hoàn toàn trên máy chủ, bóc tách chính xác theo tài liệu và <strong>không tự động gửi duyệt sự kiện</strong>.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
            {!isProcessing && extractedResult ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Chọn tài liệu khác</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyToDraft}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>Áp dụng vào bản nháp & Chỉnh sửa</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleStartExtraction}
                  disabled={isProcessing || (activeTab === 'file' && !selectedFile) || (activeTab === 'text' && !rawText.trim())}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Bắt đầu trích xuất bằng AI</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* QUICK CREATE VENUE MODAL */}
      {isVenueModalOpen && (
        <VenueFormModal
          open={isVenueModalOpen}
          editVenue={{
            name: extractedResult?.data?.venue_name || '',
            address_line: extractedResult?.data?.address_line || '',
            city: extractedResult?.data?.province || '',
            district: extractedResult?.data?.district || '',
            ward: extractedResult?.data?.ward || '',
            country: 'Vietnam',
          }}
          onClose={() => setIsVenueModalOpen(false)}
          onSaved={handleVenueSaved}
        />
      )}

      {/* SEAT MAP CREATION PROMPT MODAL */}
      {isSeatMapPromptOpen && newlyCreatedVenue && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Armchair className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Tạo sơ đồ ghế cho sự kiện?</h4>
                <p className="text-xs text-neutral-400">
                  Địa điểm: <span className="text-amber-300 font-semibold">{newlyCreatedVenue.name}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Bạn có muốn tạo sơ đồ ghế cho sự kiện tại địa điểm mới <strong>&quot;{newlyCreatedVenue.name}&quot;</strong> này không?
            </p>

            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-neutral-300">Lưu ý:</strong> Nếu cần thiết cho khách hàng chọn vị trí ghế ngồi trực quan khi mua vé, bạn có thể tạo sơ đồ ghế ngay bây giờ.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleSkipSeatMap}
                className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Không, quay lại xem thông tin
              </button>
              <button
                type="button"
                onClick={handleOpenSeatMapEditor}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Armchair className="w-4 h-4" />
                <span>Có, tạo sơ đồ ghế ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEAT MAP EDITOR MODAL */}
      {isSeatMapEditorOpen && newlyCreatedVenue && (
        <div className="fixed inset-0 z-[70]">
          <SeatMapEditor
            venueId={newlyCreatedVenue.id}
            seatMapId={null}
            onSave={handleSeatMapEditorSaved}
            onClose={handleSeatMapEditorClose}
          />
        </div>
      )}
    </>
  )
}
