import { useState, useRef, useMemo, useEffect } from 'react'
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
  Paperclip,
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  Loader2,
  Info,
  Calendar,
  Users,
} from 'lucide-react'
import { extractEventFromDocument } from '@/services/organizerEvents.js'
import { uploadOrganizerDocument, uploadPolicyDocument } from '@/services/uploads.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { VenueFormModal } from './OrganizerVenuesPage.jsx'
import { SeatMapEditor } from './SeatMapEditor.jsx'

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] || 'B'}`
}

export function AiDocumentExtractorModal({ isOpen, onClose, onApply, venues = [], onVenuesUpdated }) {
  const toast = useToast()
  const fileInputRef = useRef(null)
  const aiPermitInputRef = useRef(null)
  const aiPolicyInputRef = useRef(null)

  // Input states
  const [activeTab, setActiveTab] = useState('file') // 'file' | 'text'
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rawText, setRawText] = useState('')
  const [userNote, setUserNote] = useState('')

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStep, setProcessStep] = useState(1) // 1: reading, 2: ai extracting, 3: validating
  const [loadingProgress, setLoadingProgress] = useState(12)
  const [extractedResult, setExtractedResult] = useState(null)

  // Smooth loading progress animation
  useEffect(() => {
    let interval = null
    if (isProcessing) {
      setLoadingProgress(15)
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev < 42) return prev + 5
          if (prev < 76) return prev + 2
          if (prev < 90) return prev + 1
          return prev
        })
      }, 280)
    } else {
      if (interval) clearInterval(interval)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isProcessing])

  // Quick Step 4 Document attachments states
  const [aiPermitFiles, setAiPermitFiles] = useState([])
  const [isUploadingPermit, setIsUploadingPermit] = useState(false)
  const [aiPolicyDoc, setAiPolicyDoc] = useState(null)
  const [isUploadingPolicy, setIsUploadingPolicy] = useState(false)

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
      setLoadingProgress(100)

      setTimeout(() => {
        setIsProcessing(false)
        setExtractedResult(res)
        toast.success('AI đã trích xuất dữ liệu thành công!')
      }, 600)
    } catch (err) {
      clearTimeout(stepTimer1)
      setIsProcessing(false)
      setLoadingProgress(12)
      const msg = err.response?.data?.message || err.message || 'Lỗi khi trích xuất dữ liệu tài liệu'
      toast.error(msg)
    }
  }

  // --- Quick Step 4 Document Upload Handlers ---
  const handleAiPermitChange = async (e) => {
    const rawFiles = Array.from(e.target.files || [])
    if (!rawFiles.length) return

    const invalidFiles = rawFiles.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      return ext !== 'pdf' && f.type !== 'application/pdf'
    })

    if (invalidFiles.length > 0) {
      toast.error(`Chỉ cho phép tải lên file định dạng PDF (.pdf). Đã bỏ qua ${invalidFiles.length} file không hợp lệ.`)
    }

    const files = rawFiles.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      return ext === 'pdf' || f.type === 'application/pdf'
    })

    if (!files.length) {
      if (aiPermitInputRef.current) aiPermitInputRef.current.value = ''
      return
    }

    try {
      setIsUploadingPermit(true)
      const uploadedList = []
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File "${file.name}" vượt quá dung lượng tối đa 10MB`)
          continue
        }
        const res = await uploadOrganizerDocument(file)
        uploadedList.push({
          id: `permit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: res.file_name || file.name,
          url: res.url,
          size: res.file_size || file.size,
          type: res.mime_type || file.type || 'application/pdf',
          uploaded_at: new Date().toISOString(),
        })
      }

      setAiPermitFiles((prev) => [...prev, ...uploadedList])
      if (uploadedList.length > 0) {
        toast.success(`Đã tải lên thành công ${uploadedList.length} giấy phép (PDF)!`)
      }
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Không thể tải lên tài liệu pháp lý.')
    } finally {
      setIsUploadingPermit(false)
      if (aiPermitInputRef.current) aiPermitInputRef.current.value = ''
    }
  }

  const handleRemoveAiPermit = (permitId) => {
    setAiPermitFiles((prev) => prev.filter((f) => f.id !== permitId))
    toast.info('Đã xóa tài liệu khỏi danh sách.')
  }

  const handleAiPolicyChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf' && file.type !== 'application/pdf') {
      toast.error('Chỉ cho phép tải lên file chính sách định dạng PDF (.pdf)')
      if (aiPolicyInputRef.current) aiPolicyInputRef.current.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Kích thước file không được vượt quá 10MB')
      if (aiPolicyInputRef.current) aiPolicyInputRef.current.value = ''
      return
    }

    try {
      setIsUploadingPolicy(true)
      const res = await uploadPolicyDocument(file)
      setAiPolicyDoc({
        url: res.url,
        file_name: res.file_name || file.name,
        file_size: res.file_size || file.size,
      })
      toast.success('Đã tải lên file chính sách sự kiện (PDF)!')
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Không thể tải lên file chính sách.')
    } finally {
      setIsUploadingPolicy(false)
      if (aiPolicyInputRef.current) aiPolicyInputRef.current.value = ''
    }
  }

  const handleRemoveAiPolicy = () => {
    setAiPolicyDoc(null)
    toast.info('Đã xóa file chính sách.')
  }

  const handleApplyToDraft = () => {
    if (!extractedResult || !extractedResult.data) return
    const appliedData = { ...extractedResult.data }
    if (matchedVenue) {
      appliedData.venue_id = matchedVenue.id
      appliedData.venue_name = matchedVenue.name
    }
    if (!appliedData.refund_policy) {
      appliedData.refund_policy = {}
    }
    if (aiPermitFiles.length > 0) {
      appliedData.permit_files = aiPermitFiles
      appliedData.refund_policy.permit_files = aiPermitFiles
    }
    if (aiPolicyDoc?.url) {
      appliedData.policy_file_url = aiPolicyDoc.url
      appliedData.policy_file_name = aiPolicyDoc.file_name
      appliedData.policy_file_size = aiPolicyDoc.file_size
      appliedData.refund_policy.policy_file_url = aiPolicyDoc.url
      appliedData.refund_policy.policy_file_name = aiPolicyDoc.file_name
      appliedData.refund_policy.policy_file_size = aiPolicyDoc.file_size
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
    setLoadingProgress(12)
    setNewlyCreatedVenue(null)
    setIsSeatMapPromptOpen(false)
    setIsSeatMapEditorOpen(false)
    setAiPermitFiles([])
    setAiPolicyDoc(null)
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
        <div className={`relative w-full ${extractedResult ? 'max-w-[560px] sm:max-w-[600px]' : 'max-w-[520px] sm:max-w-[540px]'} bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] transition-all duration-300`}>
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-5 h-5 text-[#E6C17A] shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">Tạo sự kiện bằng AI</h3>
                <p className="text-xs text-neutral-400 mt-0.5 truncate">
                  Tự động đọc kịch bản, lịch trình, địa điểm & hạng vé
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800/80 transition-colors disabled:opacity-40 cursor-pointer shrink-0 ml-2"
              title="Đóng"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body - strictly overflow-hidden when processing to eliminate scrollbars */}
          <div className={`p-4 sm:p-5 flex-1 custom-scrollbar ${isProcessing ? 'overflow-hidden flex flex-col justify-center min-h-[340px]' : 'overflow-y-auto'}`}>
            {/* STATE 1: LOADING & PROGRESS (Compact, No scrollbar) */}
            {isProcessing && (
              <div className="py-2 flex flex-col items-center justify-center text-center animate-in fade-in duration-200 w-full max-w-md mx-auto">
                {/* Glowing AI Orb */}
                <div className="relative flex items-center justify-center my-1.5">
                  <div className="absolute w-16 h-16 rounded-full bg-indigo-500/15 animate-ping" />
                  <div className="absolute w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500/20 via-violet-500/20 to-purple-500/20 blur-lg" />
                  <div className="relative w-14 h-14 rounded-full border-2 border-dashed border-indigo-500/40 animate-spin [animation-duration:8s] flex items-center justify-center" />
                  <div className="absolute w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                </div>

                <div className="text-center mt-1 mb-3">
                  <h4 className="text-sm sm:text-base font-bold text-white mb-0.5">
                    {processStep === 1 && 'Đang đọc và phân tích tệp tài liệu...'}
                    {processStep === 2 && 'AI đang bóc tách cấu trúc dữ liệu sự kiện...'}
                    {processStep === 3 && 'Đang kiểm chứng logic và hoàn tất...'}
                  </h4>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                    Tự động nhận diện thông tin sự kiện, lịch trình, địa điểm và bảng giá vé.
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full mb-3">
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-400 mb-1 px-0.5">
                    <span className="flex items-center gap-1.5 text-indigo-300 text-[11px]">
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                      <span>Tiến trình xử lý</span>
                    </span>
                    <span className="text-neutral-300 font-semibold font-mono text-xs">{loadingProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-400 rounded-full transition-all duration-300 ease-out shadow-sm shadow-indigo-500/50"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                </div>

                {/* Step indicator - compact list */}
                <div className="w-full space-y-1.5 bg-neutral-950/70 p-2.5 rounded-xl border border-neutral-800/80 text-left">
                  <div className={`flex items-center justify-between py-1 px-2.5 rounded-lg text-xs transition-colors ${
                    processStep === 1 ? 'bg-indigo-500/10 text-white' : processStep > 1 ? 'text-neutral-300' : 'text-neutral-500'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        processStep > 1 ? 'bg-emerald-500 text-black' : processStep === 1 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-500'
                      }`}>
                        {processStep > 1 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '1'}
                      </div>
                      <span className="truncate">Đọc và số hóa nội dung tài liệu</span>
                    </div>
                    <span className="text-[10px] font-medium shrink-0 ml-2">
                      {processStep > 1 ? <span className="text-emerald-400 font-semibold">Đã xong</span> : processStep === 1 ? <span className="text-indigo-400 animate-pulse">Đang đọc...</span> : 'Chờ'}
                    </span>
                  </div>

                  <div className={`flex items-center justify-between py-1 px-2.5 rounded-lg text-xs transition-colors ${
                    processStep === 2 ? 'bg-indigo-500/10 text-white' : processStep > 2 ? 'text-neutral-300' : 'text-neutral-500'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        processStep > 2 ? 'bg-emerald-500 text-black' : processStep === 2 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-500'
                      }`}>
                        {processStep > 2 ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '2'}
                      </div>
                      <span className="truncate">AI phân tích kịch bản & bóc tách cấu trúc</span>
                    </div>
                    <span className="text-[10px] font-medium shrink-0 ml-2">
                      {processStep > 2 ? <span className="text-emerald-400 font-semibold">Đã xong</span> : processStep === 2 ? <span className="text-indigo-400 animate-pulse">Đang bóc tách...</span> : 'Chờ'}
                    </span>
                  </div>

                  <div className={`flex items-center justify-between py-1 px-2.5 rounded-lg text-xs transition-colors ${
                    processStep === 3 ? 'bg-indigo-500/10 text-white' : 'text-neutral-500'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        processStep === 3 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-500'
                      }`}>
                        3
                      </div>
                      <span className="truncate">Kiểm chứng logic & chuẩn hóa dữ liệu</span>
                    </div>
                    <span className="text-[10px] font-medium shrink-0 ml-2">
                      {processStep === 3 ? <span className="text-indigo-400 animate-pulse">Hoàn tất...</span> : 'Chờ'}
                    </span>
                  </div>
                </div>

                {/* AI disclaimer during loading */}
                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg w-full">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span><strong>Lưu ý:</strong> Đây là AI nên có thể có sai sót, vui lòng kiểm tra lại thông tin.</span>
                </div>
              </div>
            )}

            {/* STATE 2: EXTRACTED RESULT PREVIEW (Spacious, Clean & Well-Structured) */}
            {!isProcessing && extractedResult && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Hidden File Inputs for Step 4 attachments */}
                <input
                  ref={aiPermitInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  onChange={handleAiPermitChange}
                  className="hidden"
                />
                <input
                  ref={aiPolicyInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleAiPolicyChange}
                  className="hidden"
                />

                {/* 1. Top Success Banner (No duplicate venue button) */}
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white">
                        Trích xuất thông tin thành công!
                      </h4>
                      <p className="text-xs text-neutral-300 mt-0.5">
                        Dưới đây là thông tin sự kiện AI đã bóc tách từ tài liệu. Bạn có thể xem lại và áp dụng vào bản nháp.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {extractedResult.data.require_attendee_information && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        Thu thập thông tin
                      </span>
                    )}
                    {matchedVenue && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/15 px-3 py-1 rounded-lg border border-emerald-500/30">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Đã khớp địa điểm
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Venue Warning Banner if unmatched (Single & Prominent action) */}
                {!matchedVenue && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 text-xs animate-in fade-in">
                    <div className="flex items-start gap-3 text-amber-200">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="font-bold text-sm text-amber-300">
                          {currentVenueName
                            ? `Địa điểm "${currentVenueName}" chưa có trong danh sách địa điểm của bạn!`
                            : 'Tài liệu chưa có thông tin địa điểm cụ thể!'}
                        </p>
                        <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                          Hệ thống không tự động gán địa điểm khác để tránh sai sót. Vui lòng bấm nút bên cạnh để tạo địa điểm mới nhanh chóng.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenQuickCreateVenue}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold shrink-0 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>Tạo địa điểm mới nhanh</span>
                    </button>
                  </div>
                )}

                {/* 3. Event Title & Short Description */}
                <div className="bg-neutral-950/80 rounded-xl p-3.5 sm:p-4 border border-neutral-800 space-y-2.5">
                  <div>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      Tên sự kiện
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white mt-0.5 leading-snug">
                      {extractedResult.data.title || 'Sự kiện chưa đặt tên'}
                    </h3>
                  </div>

                  {extractedResult.data.short_description && (
                    <div className="pt-2.5 border-t border-neutral-800/80">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        Mô tả sự kiện
                      </span>
                      <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed whitespace-pre-line">
                        {extractedResult.data.short_description}
                      </p>
                    </div>
                  )}
                </div>

                {/* 4. Lịch trình sự kiện (Sessions) - Full width, Spacious & No wrap on dates */}
                <div className="bg-neutral-950/80 rounded-xl p-3.5 sm:p-4 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      <span>Thời gian & Lịch trình ({extractedResult.data.sessions?.length || 1} phiên)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(extractedResult.data.sessions && extractedResult.data.sessions.length > 0
                      ? extractedResult.data.sessions
                      : [extractedResult.data.session || {}]
                    ).map((s, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-indigo-300">
                              {s.session_name || (extractedResult.data.sessions?.length > 1 ? `Phiên ${idx + 1}` : 'Toàn sự kiện')}
                            </span>
                            {s.description && (
                              <span className="text-[11px] text-neutral-400 italic">
                                · {s.description}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-neutral-300 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>Giờ: <strong className="text-white font-semibold">{s.start_time || 'Chưa rõ'}{s.end_time ? ` - ${s.end_time}` : ''}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span>Check-in: <strong className="text-sky-300 font-semibold">{s.checkin_start_time || 'Chưa có'}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-xs font-mono font-semibold text-indigo-200 whitespace-nowrap shadow-sm">
                            <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>{s.start_date || 'Chưa rõ ngày'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Địa điểm tổ chức (Dedicated Venue Card) */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      matchedVenue ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                    }`}>
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        Địa điểm tổ chức
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-white mt-0.5 truncate">
                        {matchedVenue ? matchedVenue.name : (currentVenueName || (extractedResult.data.province ? `Khu vực ${extractedResult.data.province}` : 'Chưa xác định'))}
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                        {matchedVenue
                          ? [matchedVenue.address_line, matchedVenue.ward, matchedVenue.district, matchedVenue.city].filter(Boolean).join(', ')
                          : (extractedResult.data.address_line || 'Địa chỉ chi tiết sẽ được tự động cập nhật khi tạo/chọn địa điểm')}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {matchedVenue ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
                        <Check className="w-3.5 h-3.5" />
                        Đã liên kết hệ thống
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Chưa lưu trong danh sách
                      </span>
                    )}
                  </div>
                </div>

                {/* 6. Hạng vé & Bảng giá - Spacious Grid, No Internal Scrollbar */}
                <div className="bg-neutral-950/80 rounded-xl p-3.5 sm:p-4 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
                      <Ticket className="w-4 h-4 text-amber-400" />
                      <span>Bảng giá & Hạng vé ({extractedResult.data.ticket_types?.length || 0} hạng vé)</span>
                    </div>
                    {extractedResult.data.seat_map_id && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20 font-medium">
                        <Armchair className="w-3.5 h-3.5" />
                        Đã gắn sơ đồ ghế
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {extractedResult.data.ticket_types && extractedResult.data.ticket_types.length > 0 ? (
                      extractedResult.data.ticket_types.map((t, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700/80 transition-all flex flex-col justify-between space-y-2"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="text-xs sm:text-sm font-bold text-white leading-snug">
                                {t.name || `Hạng vé ${idx + 1}`}
                              </h5>
                              <span className="text-xs sm:text-sm font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 whitespace-nowrap shrink-0">
                                {Number(t.price) === 0 ? 'Miễn phí' : `${Number(t.price).toLocaleString('vi-VN')} đ`}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1.5">
                              <Users className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                              <span>
                                Số lượng: {t.quantity_total ? (
                                  <strong className="text-neutral-200 font-semibold">{Number(t.quantity_total).toLocaleString('vi-VN')} vé</strong>
                                ) : (
                                  <span className="text-amber-400 font-medium italic">Chưa có số lượng</span>
                                )}
                              </span>
                            </div>
                          </div>

                          {t.description && (
                            <div className="pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-400 leading-relaxed">
                              {t.description}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 text-center text-xs text-neutral-400 italic">
                        Không tìm thấy thông tin vé trong tài liệu.
                      </div>
                    )}
                  </div>
                </div>

                {/* 7. Tags sự kiện - Dedicated Full Width, No Cutoffs */}
                {extractedResult.data.tags && extractedResult.data.tags.length > 0 && (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                      <Tag className="w-3.5 h-3.5 text-violet-400" />
                      <span>Tags sự kiện ({extractedResult.data.tags.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {extractedResult.data.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs font-semibold text-neutral-200 hover:border-violet-500/50 hover:text-white transition-all shadow-sm"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 8. Đính kèm hồ sơ & chính sách (Bước 4) */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-neutral-200">
                      <Paperclip className="w-4 h-4 text-amber-400" />
                      <span>Đính kèm hồ sơ & chính sách (Bước 4)</span>
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      Định dạng <strong className="text-amber-400 font-mono">.pdf</strong> (Tối đa 10MB)
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Bạn có thể tải sẵn 2 tài liệu này tại đây, khi bấm &quot;Áp dụng&quot; hệ thống sẽ tự động chuyển vào Bước 4 mà không cần tải lại.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Document 1: Giấy phép */}
                    <div className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            Giấy phép tổ chức sự kiện
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700/60 font-medium shrink-0">
                            Tùy chọn tải trước
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          Văn bản cấp phép, công văn chấp thuận của cơ quan thẩm quyền.
                        </p>

                        {aiPermitFiles.length > 0 && (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 mt-2.5 custom-scrollbar">
                            {aiPermitFiles.map((f) => (
                              <div
                                key={f.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                  <span className="truncate text-neutral-300 font-medium" title={f.name}>
                                    {f.name}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 shrink-0 font-mono">
                                    ({formatFileSize(f.size)})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAiPermit(f.id)}
                                  className="text-neutral-400 hover:text-rose-400 p-1 shrink-0 transition-colors cursor-pointer"
                                  title="Xóa file"
                                >
                                  <CloseIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isUploadingPermit}
                        onClick={() => aiPermitInputRef.current?.click()}
                        className="w-full py-2 px-3 rounded-xl border border-dashed border-neutral-700 hover:border-amber-400 hover:bg-neutral-800/60 text-xs text-neutral-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isUploadingPermit ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                            <span>Đang tải lên PDF...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-amber-400" />
                            <span>{aiPermitFiles.length > 0 ? '+ Thêm file PDF khác' : 'Tải file Giấy phép (.pdf)'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Document 2: Chính sách */}
                    <div className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                            <FileCheck className="w-4 h-4 text-blue-400 shrink-0" />
                            Tài liệu chính sách sự kiện
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60 font-medium shrink-0">
                            Không bắt buộc
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          Quy định tham gia, chính sách hoàn vé bổ sung...
                        </p>

                        {aiPolicyDoc && (
                          <div className="mt-2.5 p-2 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="truncate text-neutral-300 font-medium" title={aiPolicyDoc.file_name}>
                                {aiPolicyDoc.file_name}
                              </span>
                              <span className="text-[10px] text-neutral-500 shrink-0 font-mono">
                                ({formatFileSize(aiPolicyDoc.file_size)})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveAiPolicy}
                              className="text-neutral-400 hover:text-rose-400 p-1 shrink-0 transition-colors cursor-pointer"
                              title="Xóa file chính sách"
                            >
                              <CloseIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isUploadingPolicy}
                        onClick={() => aiPolicyInputRef.current?.click()}
                        className="w-full py-2 px-3 rounded-xl border border-dashed border-neutral-700 hover:border-blue-400 hover:bg-neutral-800/60 text-xs text-neutral-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isUploadingPolicy ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            <span>Đang tải lên PDF...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-blue-400" />
                            <span>{aiPolicyDoc ? 'Đổi file Chính sách khác' : 'Tải file Chính sách (.pdf)'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 9. AI Disclaimer Banner */}
                <div className="p-3.5 bg-amber-500/10 rounded-xl border border-amber-500/25 flex items-center gap-3 text-xs text-amber-200/90 shadow-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="leading-relaxed">
                    <strong className="text-amber-300 font-semibold">Lưu ý:</strong> Đây là AI nên có thể có sai sót, vui lòng kiểm tra lại thông tin trước khi áp dụng vào bản nháp.
                  </span>
                </div>
              </div>
            )}

            {/* STATE 3: INPUT FORM (Compact, Proportionate & Elegant) */}
            {!isProcessing && !extractedResult && (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                {/* Tab selector */}
                <div className="flex items-center gap-1.5 p-1 bg-neutral-950/90 rounded-xl border border-neutral-800/80">
                  <button
                    type="button"
                    onClick={() => setActiveTab('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 sm:px-3 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'file'
                        ? 'border border-[#C99A47] bg-[#C99A47]/15 text-[#E6C17A] shadow-[0_0_12px_rgba(201,154,71,0.2)] font-bold'
                        : 'border border-transparent text-neutral-400 hover:text-[#E6C17A] hover:bg-[#C99A47]/5 hover:border-[#C99A47]/30 font-medium'
                    }`}
                  >
                    <FileUp className={`w-4 h-4 shrink-0 ${activeTab === 'file' ? 'text-[#E6C17A]' : 'text-neutral-400'}`} />
                    <span className="whitespace-nowrap">Tải file tài liệu</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 sm:px-3 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'text'
                        ? 'border border-[#C99A47] bg-[#C99A47]/15 text-[#E6C17A] shadow-[0_0_12px_rgba(201,154,71,0.2)] font-bold'
                        : 'border border-transparent text-neutral-400 hover:text-[#E6C17A] hover:bg-[#C99A47]/5 hover:border-[#C99A47]/30 font-medium'
                    }`}
                  >
                    <FileText className={`w-4 h-4 shrink-0 ${activeTab === 'text' ? 'text-[#E6C17A]' : 'text-neutral-400'}`} />
                    <span className="whitespace-nowrap">Dán nội dung kịch bản</span>
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
                        onDragEnter={(e) => {
                          e.preventDefault()
                          setIsDragging(true)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setIsDragging(true)
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          setIsDragging(false)
                        }}
                        onDrop={(e) => {
                          setIsDragging(false)
                          handleDrop(e)
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl py-7 px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group ${
                          isDragging
                            ? 'border-[#C99A47] bg-[#C99A47]/10 scale-[1.01]'
                            : 'border-neutral-700/80 hover:border-[#C99A47]/60 bg-gradient-to-b from-neutral-950/60 to-neutral-900/30 hover:bg-neutral-900/50'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-[#C99A47]/10 border border-[#C99A47]/20 text-[#E6C17A] flex items-center justify-center mb-2.5 transition-all shadow-inner group-hover:scale-105 group-hover:bg-[#C99A47]/20">
                          <Upload className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-white mb-1.5">
                          Kéo thả file vào đây hoặc <span className="text-[#E6C17A] hover:text-[#FFF6DC] underline underline-offset-4 decoration-[#C99A47]/40 font-bold">duyệt từ máy</span>
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 flex-wrap justify-center mt-0.5">
                          <span>Hỗ trợ:</span>
                          <span className="px-1.5 py-0.5 rounded bg-neutral-800/80 border border-neutral-700/60 text-[10px] font-mono font-medium text-neutral-300">PDF</span>
                          <span className="px-1.5 py-0.5 rounded bg-neutral-800/80 border border-neutral-700/60 text-[10px] font-mono font-medium text-neutral-300">Word (.docx)</span>
                          <span className="px-1.5 py-0.5 rounded bg-neutral-800/80 border border-neutral-700/60 text-[10px] font-mono font-medium text-neutral-300">TXT</span>
                          <span className="text-neutral-500">· Tối đa 10MB</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-10 h-10 rounded-xl bg-[#C99A47]/10 border border-[#C99A47]/25 text-[#E6C17A] flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs sm:text-sm font-semibold text-white truncate">{selectedFile.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-neutral-400">
                                {formatFileSize(selectedFile.size)}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                <Check className="w-2.5 h-2.5" /> Sẵn sàng trích xuất
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedFile(null)}
                          className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-800/80 rounded-lg transition-colors cursor-pointer"
                          title="Xóa file đã chọn"
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
                      rows={5}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Dán nội dung kế hoạch sự kiện, kịch bản chương trình, thông cáo báo chí hoặc ghi chú chi tiết vào đây..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/30 transition-all resize-none custom-scrollbar leading-relaxed"
                    />
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1 px-1">
                      <span>Tối thiểu 20 ký tự để AI có đủ dữ kiện phân tích</span>
                      <span className="font-mono text-neutral-400">{rawText.length} ký tự</span>
                    </div>
                  </div>
                )}

                {/* Optional user note */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-200 mb-1.5">
                    Ghi chú thêm cho AI <span className="text-neutral-400 font-normal">(Tùy chọn)</span>
                  </label>
                  <input
                    type="text"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="Ví dụ: Ưu tiên sự kiện bắt đầu lúc 19:00, địa điểm tại TP.HCM..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#C99A47] focus:ring-1 focus:ring-[#C99A47]/30 transition-all"
                  />
                </div>

                {/* 1. Thông tin bảo mật an toàn (tách riêng khung) */}
                <div className="flex items-center gap-2.5 p-2.5 bg-neutral-950/80 rounded-xl border border-neutral-800/80 text-[11px] text-neutral-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Dữ liệu xử lý an toàn nội bộ trên máy chủ và <strong className="text-neutral-300">không tự động gửi duyệt sự kiện</strong>.</span>
                </div>

                {/* 2. Câu lưu ý đưa xuống dưới cùng */}
                <div className="flex items-center gap-2 px-1 text-[11px] text-amber-300/95 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span><strong>Lưu ý:</strong> Đây là AI nên có thể có sai sót, vui lòng kiểm tra lại thông tin.</span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="px-5 sm:px-6 py-3.5 border-t border-neutral-800 bg-neutral-950/70 flex items-center justify-between">
            {!isProcessing && extractedResult ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2 text-xs font-bold text-neutral-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer rounded-xl border border-neutral-700/80 bg-neutral-800/40 hover:bg-neutral-800 hover:border-neutral-600 active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Chọn tài liệu khác</span>
                </button>
                <button
                  type="button"
                  disabled={isUploadingPermit || isUploadingPolicy}
                  onClick={handleApplyToDraft}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] hover:brightness-110 active:scale-95 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-[#0D1B2A] text-xs font-bold shadow-lg shadow-[#C99A47]/20 flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  {isUploadingPermit || isUploadingPolicy ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-[#0D1B2A] border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải tệp lên...</span>
                    </>
                  ) : (
                    <>
                      <span>Áp dụng vào bản nháp & Chỉnh sửa</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="flex items-center justify-end gap-3 w-full">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2.5 text-xs font-bold text-neutral-300 hover:text-white rounded-xl border border-neutral-700/80 bg-neutral-800/40 hover:bg-neutral-800 hover:border-neutral-600 transition-all disabled:opacity-40 cursor-pointer active:scale-95"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleStartExtraction}
                  disabled={isProcessing || (activeTab === 'file' && !selectedFile) || (activeTab === 'text' && !rawText.trim())}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    isProcessing || (activeTab === 'file' && !selectedFile) || (activeTab === 'text' && !rawText.trim())
                      ? 'bg-neutral-800 border border-neutral-700/50 text-neutral-500 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] border border-[#E6C17A]/40 shadow-lg shadow-[#C99A47]/25 hover:brightness-110 active:scale-95 cursor-pointer'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-inherit" />
                      <span>Đang bóc tách dữ liệu...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-inherit" />
                      <span>Bắt đầu trích xuất bằng AI</span>
                    </>
                  )}
                </button>
              </div>
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
