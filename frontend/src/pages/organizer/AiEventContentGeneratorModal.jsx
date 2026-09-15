import { useEffect, useState } from 'react'
import {
  Sparkles,
  Wand2,
  X as CloseIcon,
  Check,
  RefreshCw,
  Tag,
  FileText,
  Type,
  Eye,
  Code,
  CheckCircle2,
  Layers,
} from 'lucide-react'
import {
  generateAiEventContent,
  fetchLatestAiContentGeneration,
} from '@/services/organizerEvents.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const TONE_OPTIONS = [
  'Chuyên nghiệp',
  'Hào hứng / Sôi động',
  'Trang trọng / Học thuật',
  'Thân thiện / Gần gũi',
  'Truyền cảm hứng',
]

export function AiEventContentGeneratorModal({
  isOpen,
  onClose,
  onApply,
  categories = [],
  initialCategory = '',
  eventId = null,
}) {
  const toast = useToast()

  // Form input state
  const [topic, setTopic] = useState('')
  const [categoryName, setCategoryName] = useState(initialCategory || '')
  const [targetAudience, setTargetAudience] = useState('')
  const [keyHighlights, setKeyHighlights] = useState('')
  const [tone, setTone] = useState('Chuyên nghiệp')

  // Generated state
  const [isLoading, setIsLoading] = useState(false)
  const [generatedData, setGeneratedData] = useState(null)

  // Editable output state
  const [selectedTitle, setSelectedTitle] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [shortDesc, setShortDesc] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [previewTab, setPreviewTab] = useState('preview') // 'preview' | 'code'

  // Load latest generation on open (persists across reloads & logins)
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    const loadSaved = async () => {
      try {
        const saved = await fetchLatestAiContentGeneration(eventId)
        if (saved && isMounted) {
          if (saved.prompt_data) {
            setTopic(saved.prompt_data.topic || '')
            if (saved.prompt_data.category_name) setCategoryName(saved.prompt_data.category_name)
            setTargetAudience(saved.prompt_data.target_audience || '')
            setKeyHighlights(saved.prompt_data.key_highlights || '')
            if (saved.prompt_data.tone) setTone(saved.prompt_data.tone)
          }

          if (saved.generated_content) {
            const gen = saved.generated_content
            setGeneratedData(gen)
            const chosen = gen.selected_title || gen.suggested_titles?.[0] || ''
            setSelectedTitle(chosen)
            setCustomTitle(chosen)
            setShortDesc(gen.short_description || '')
            setContentHtml(gen.content_html || '')
            setSelectedTags(gen.tags || [])
          }
        }
      } catch (_err) {
        // ignore
      }
    }

    loadSaved()
    return () => {
      isMounted = false
    }
  }, [isOpen, eventId])

  if (!isOpen) return null

  const handleGenerate = async (e) => {
    e?.preventDefault()
    if (!topic.trim()) {
      toast.error('Vui lòng nhập chủ đề hoặc tên ý tưởng sự kiện.')
      return
    }

    setIsLoading(true)
    try {
      const result = await generateAiEventContent({
        topic: topic.trim(),
        category_name: categoryName,
        target_audience: targetAudience.trim(),
        key_highlights: keyHighlights.trim(),
        tone,
        event_id: eventId || null,
      })

      const content = result.generated_content || result
      setGeneratedData(content)
      const primaryTitle = content.selected_title || content.suggested_titles?.[0] || topic.trim()
      setSelectedTitle(primaryTitle)
      setCustomTitle(primaryTitle)
      setShortDesc(content.short_description || '')
      setContentHtml(content.content_html || '')
      setSelectedTags(content.tags || [])

      toast.success('Đã tạo đề xuất nội dung sự kiện thành công!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tạo nội dung bằng AI.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectTitleOption = (t) => {
    setSelectedTitle(t)
    setCustomTitle(t)
  }

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const handleApplyToEvent = () => {
    if (!customTitle && !shortDesc && !contentHtml) {
      toast.error('Chưa có nội dung để áp dụng.')
      return
    }

    onApply({
      title: customTitle.trim() || selectedTitle,
      short_description: shortDesc.trim(),
      description: contentHtml,
      tags: selectedTags,
    })

    toast.success('Đã áp dụng nội dung AI vào form sự kiện!')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] max-h-[850px] w-full max-w-5xl flex-col rounded-3xl border border-indigo-500/30 bg-[#0c1224] text-slate-100 shadow-2xl shadow-indigo-950/50 overflow-hidden">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                Trợ lý AI Tạo Nội dung Sự kiện
                <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300 border border-indigo-500/30">
                  Local AI Ready
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Nhập thông tin cơ bản để AI đề xuất tiêu đề, mô tả và nội dung sự kiện hoàn chỉnh
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {/* Modal Body: Split 2 Columns */}
        <div className="grid flex-1 overflow-hidden md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-white/10">
          {/* Left Column: Input Form */}
          <div className="flex flex-col md:col-span-5 overflow-y-auto p-6 bg-[#0e162b]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-4">
              <Wand2 className="size-3.5" /> Thông tin đầu vào
            </h4>

            <form onSubmit={handleGenerate} className="space-y-4">
              {/* Topic / Idea */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Chủ đề / Tên ý tưởng sự kiện <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ví dụ: Đêm nhạc Acoustic Mùa Thu, Hội thảo Khởi nghiệp Công nghệ..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Thể loại / Danh mục
                </label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-[#131d38] px-3.5 py-2.5 text-xs text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                >
                  <option value="">-- Chọn hoặc để AI tự xác định --</option>
                  {categories.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Đối tượng tham gia
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                  placeholder="Ví dụ: Sinh viên, Người làm IT, Gia đình trẻ, Doanh nhân..."
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                />
              </div>

              {/* Key Highlights */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Điểm nhấn / Khách mời đặc biệt
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                  placeholder="Ví dụ: Ca sĩ Vũ, Diễn giả Tony, Minigame tặng quà..."
                  value={keyHighlights}
                  onChange={(e) => setKeyHighlights(e.target.value)}
                />
              </div>

              {/* Tone */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Phong cách / Tone giọng
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        tone === t
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !topic.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-xs font-extrabold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'AI đang tạo nội dung...' : 'Tạo nội dung với AI'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Output Proposal & Review */}
          <div className="flex flex-col md:col-span-7 overflow-y-auto p-6 bg-[#0a0f1f]">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Layers className="size-3.5" /> Đề xuất nội dung từ AI
              </h4>
              {generatedData && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Đã sẵn sàng xem xét
                </span>
              )}
            </div>

            {!generatedData ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-500">
                <div className="grid size-14 place-items-center rounded-2xl bg-white/5 text-indigo-400 mb-3">
                  <Wand2 className="size-6 opacity-60" />
                </div>
                <p className="text-sm font-semibold text-slate-300">Chưa có nội dung đề xuất</p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Nhập thông tin ý tưởng ở cột bên trái và nhấn &quot;Tạo nội dung với AI&quot; để nhận đề xuất.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Title Proposals */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-2">
                    <Type className="size-3.5 text-indigo-400" /> Gợi ý tiêu đề sự kiện (Chọn 1 hoặc chỉnh sửa)
                  </label>
                  <div className="space-y-2">
                    {generatedData.suggested_titles?.map((t, i) => (
                      <label
                        key={i}
                        onClick={() => handleSelectTitleOption(t)}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs transition ${
                          selectedTitle === t
                            ? 'border-indigo-500 bg-indigo-500/10 text-white font-bold'
                            : 'border-white/5 bg-[#121930] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`grid size-4 place-items-center rounded-full border ${
                              selectedTitle === t
                                ? 'border-indigo-500 bg-indigo-500 text-white'
                                : 'border-slate-500'
                            }`}
                          >
                            {selectedTitle === t && <Check className="size-2.5" />}
                          </span>
                          <span>{t}</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="mt-3">
                    <span className="text-[11px] text-slate-400">Tiêu đề bạn chọn/chỉnh sửa:</span>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#121930] px-3 py-2 text-xs font-semibold text-white outline-none focus:border-indigo-500"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Short Description */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className="text-xs font-bold text-slate-200 flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5">
                      <FileText className="size-3.5 text-indigo-400" /> Mô tả ngắn
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {shortDesc.length}/160 ký tự
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-xl border border-white/10 bg-[#121930] p-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                    value={shortDesc}
                    onChange={(e) => setShortDesc(e.target.value)}
                  />
                </div>

                {/* Detailed Description HTML */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <FileText className="size-3.5 text-indigo-400" /> Nội dung chi tiết sự kiện
                    </label>
                    <div className="flex rounded-lg bg-white/10 p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('preview')}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${
                          previewTab === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        <Eye className="size-3" /> Trực quan
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('code')}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${
                          previewTab === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        <Code className="size-3" /> Mã HTML
                      </button>
                    </div>
                  </div>

                  {previewTab === 'preview' ? (
                    <div
                      className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#121930] p-3 text-xs leading-relaxed text-slate-300 prose prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                  ) : (
                    <textarea
                      rows={6}
                      className="w-full font-mono text-[11px] rounded-xl border border-white/10 bg-[#121930] p-2.5 text-slate-200 outline-none focus:border-indigo-500"
                      value={contentHtml}
                      onChange={(e) => setContentHtml(e.target.value)}
                    />
                  )}
                </div>

                {/* Suggested Tags */}
                {generatedData.tags?.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-2">
                      <Tag className="size-3.5 text-indigo-400" /> Tags đề xuất (Nhấn để bật/tắt)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {generatedData.tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50'
                                : 'bg-white/5 text-slate-500 border border-white/5 hover:text-slate-300'
                            }`}
                          >
                            {isSelected && <Check className="size-3" />}
                            #{tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between border-t border-white/10 bg-white/5 px-6 py-4">
          <p className="text-[11px] text-slate-400">
            💾 Đề xuất được lưu tự động trên hệ thống, không bị mất khi tải lại trang.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={!generatedData}
              onClick={handleApplyToEvent}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="size-4" />
              Áp dụng vào Sự kiện
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
