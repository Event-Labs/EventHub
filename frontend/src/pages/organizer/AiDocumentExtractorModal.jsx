import { useState, useRef } from 'react'
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
} from 'lucide-react'
import { extractEventFromDocument } from '@/services/organizerEvents.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function AiDocumentExtractorModal({ isOpen, onClose, onApply }) {
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

    // Simulate progressive UX transitions
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
    onApply(extractedResult.data)
    onClose()
  }

  const handleReset = () => {
    setSelectedFile(null)
    setRawText('')
    setUserNote('')
    setExtractedResult(null)
    setIsProcessing(false)
    setProcessStep(1)
  }

  return (
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
                  <Cpu className="w-3 h-3" /> Qwen 2.5:3b
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Tự động bóc tách kịch bản, thời gian, địa điểm, hạng vé & điền vào bản nháp
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
                Đang xử lý tài liệu với Qwen 3 Extractor
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
                  <span>Mô hình chuyên trách qwen3-event-extractor-2 phân tích & trích xuất cấu trúc</span>
                </div>

                <div className={`flex items-center gap-3 text-xs transition-colors ${processStep >= 3 ? 'text-white' : 'text-neutral-500'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${processStep === 3 ? 'bg-indigo-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400'}`}>
                    3
                  </div>
                  <span>Kiểm chứng dữ liệu, áp dụng quy tắc 3 tuần & chuẩn hóa</span>
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
                    Dưới đây là thông tin sự kiện AI đã bóc tách từ tài liệu. Bạn có thể áp dụng vào bản nháp để tiếp tục chỉnh sửa.
                  </p>
                </div>
              </div>

              {/* Warning box if any */}
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] text-neutral-400">Thời gian</span>
                      <p className="text-xs font-semibold text-white">
                        {extractedResult.data.sessions?.[0]?.start_date} | {extractedResult.data.sessions?.[0]?.start_time} - {extractedResult.data.sessions?.[0]?.end_time}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] text-neutral-400">Địa điểm</span>
                      <p className="text-xs font-semibold text-white truncate">
                        {extractedResult.data.venue_name || extractedResult.data.province || 'Chưa có thông tin cụ thể'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800/80">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-1.5">
                    <Ticket className="w-3.5 h-3.5 text-amber-400" />
                    <span>Hạng vé tìm thấy ({extractedResult.data.ticket_types?.length || 0})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extractedResult.data.ticket_types?.map((t, idx) => (
                      <div key={idx} className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700/60 text-xs">
                        <span className="font-medium text-neutral-200">{t.name}: </span>
                        <span className="text-emerald-400 font-semibold">
                          {Number(t.price) === 0 ? 'Miễn phí' : `${Number(t.price).toLocaleString('vi-VN')} đ`}
                        </span>
                        <span className="text-neutral-500 text-[10px]"> ({t.quantity_total} vé)</span>
                      </div>
                    ))}
                  </div>
                </div>
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
                        className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 rounded-lg transition-colors"
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
                  <strong>Bảo mật & Chuẩn xác:</strong> Mô hình AI chuyên biệt <strong>qwen3-event-extractor-2</strong> xử lý nội bộ, bóc tách chính xác theo tài liệu và <strong>không tự động gửi duyệt sự kiện</strong>.
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
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Chọn tài liệu khác</span>
              </button>
              <button
                type="button"
                onClick={handleApplyToDraft}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all"
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
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
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
  )
}
