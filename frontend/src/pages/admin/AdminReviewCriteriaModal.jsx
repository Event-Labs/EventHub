import React, { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  FileText,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Info,
  CheckCircle2,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import {
  fetchAdminReviewCriteria,
  createAdminReviewCriteria,
  updateAdminReviewCriteria,
  deleteAdminReviewCriteria,
  resetAdminDefaultReviewCriteria,
} from '@/services/adminEvents.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'

const CATEGORY_MAP = {
  LEGAL: { label: 'Pháp lý & Giấy phép', color: 'border-blue-500/40 bg-blue-500/10 text-blue-400' },
  CONTENT: { label: 'Nội dung & Chính tả', color: 'border-purple-500/40 bg-purple-500/10 text-purple-400' },
  MEDIA: { label: 'Hình ảnh & Banner', color: 'border-pink-500/40 bg-pink-500/10 text-pink-400' },
  TICKETS: { label: 'Vé & Giá vé', color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  SCHEDULE: { label: 'Lịch trình phiên', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' },
  REFUND: { label: 'Chính sách hoàn vé', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  GENERAL: { label: 'Quy định chung', color: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400' },
}

const SEVERITY_MAP = {
  CRITICAL: {
    label: 'Bắt buộc (Từ chối nếu vi phạm)',
    tag: 'BẮT BUỘC',
    badge: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
  },
  WARNING: {
    label: 'Cảnh báo (Xem xét thêm)',
    tag: 'CẢNH BÁO',
    badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  },
  INFO: {
    label: 'Khuyến nghị (Góp ý hoàn thiện)',
    tag: 'GỢI Ý',
    badge: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
  },
}

export function AdminReviewCriteriaModal({ isOpen, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  // Form State for Add / Edit
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    category: 'GENERAL',
    severity: 'CRITICAL',
    rule_content: '',
    order_index: 0,
    is_active: true,
  })

  // Confirm state for delete or reset
  const [confirmDialog, setConfirmDialog] = useState(null)

  // Fetch criteria list
  const { data: criteria = [], isLoading } = useQuery({
    queryKey: ['admin-review-criteria'],
    queryFn: () => fetchAdminReviewCriteria(),
    enabled: isOpen,
  })

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => updateAdminReviewCriteria(id, { is_active }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-review-criteria'] })
      toast.success(variables.is_active ? 'Đã kích hoạt điều khoản cho AI' : 'Đã tạm dừng điều khoản')
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật trạng thái điều khoản'))
    },
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload) => createAdminReviewCriteria(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-review-criteria'] })
      toast.success('Đã thêm điều khoản mới thành công')
      closeForm()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể tạo điều khoản'))
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAdminReviewCriteria(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-review-criteria'] })
      toast.success('Đã cập nhật điều khoản thành công')
      closeForm()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật điều khoản'))
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminReviewCriteria(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-review-criteria'] })
      toast.success('Đã xóa điều khoản thành công')
      setConfirmDialog(null)
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể xóa điều khoản'))
    },
  })

  // Reset defaults mutation
  const resetMutation = useMutation({
    mutationFn: () => resetAdminDefaultReviewCriteria(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-review-criteria'] })
      toast.success('Đã khôi phục bộ điều khoản mặc định của EventHub')
      setConfirmDialog(null)
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể khôi phục điều khoản mặc định'))
    },
  })

  const openAddForm = () => {
    setEditingItem(null)
    setFormData({
      code: '',
      title: '',
      category: 'GENERAL',
      severity: 'CRITICAL',
      rule_content: '',
      order_index: criteria.length + 1,
      is_active: true,
    })
    setIsFormOpen(true)
  }

  const openEditForm = (item) => {
    setEditingItem(item)
    setFormData({
      code: item.code || '',
      title: item.title || '',
      category: item.category || 'GENERAL',
      severity: item.severity || 'CRITICAL',
      rule_content: item.rule_content || '',
      order_index: item.order_index ?? 0,
      is_active: item.is_active ?? true,
    })
    setIsFormOpen(true)
  }

  const closeForm = () => {
    setIsFormOpen(false)
    setEditingItem(null)
  }

  const handleSubmitForm = (e) => {
    e.preventDefault()
    if (!formData.code.trim() || !formData.title.trim() || !formData.rule_content.trim()) {
      toast.error('Vui lòng điền đầy đủ Mã điều khoản, Tiêu đề và Nội dung quy tắc.')
      return
    }

    const payload = {
      ...formData,
      code: formData.code.trim().toUpperCase(),
      title: formData.title.trim(),
      rule_content: formData.rule_content.trim(),
      order_index: Number(formData.order_index) || 0,
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  // Filtered criteria list
  const filteredCriteria = useMemo(() => {
    return criteria.filter((item) => {
      if (showActiveOnly && !item.is_active) return false
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        const matchCode = item.code?.toLowerCase().includes(term)
        const matchTitle = item.title?.toLowerCase().includes(term)
        const matchContent = item.rule_content?.toLowerCase().includes(term)
        if (!matchCode && !matchTitle && !matchContent) return false
      }

      return true
    })
  }, [criteria, showActiveOnly, selectedCategory, searchTerm])

  const activeCount = useMemo(() => criteria.filter((c) => c.is_active).length, [criteria])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md animate-fadeIn">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-indigo-500/30 bg-[#0F172A] shadow-2xl shadow-indigo-950/80">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-black text-white">
                  Cấu hình Điều khoản & Tiêu chí Duyệt Sự kiện AI
                </h3>
                <span className="rounded-full border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300">
                  {activeCount} / {criteria.length} Đang áp dụng
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Thêm, sửa, xóa tiêu chí kiểm duyệt. AI sẽ tự động đọc trực tiếp bộ điều khoản này mỗi khi thẩm định sự kiện.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-3.5 py-2 text-xs font-black text-white shadow-md shadow-indigo-600/30 transition duration-200 hover:from-indigo-500 hover:to-indigo-400"
            >
              <Plus className="size-4" />
              <span>Thêm điều khoản mới</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Real-time Notice */}
        <div className="flex items-center gap-3 border-b border-indigo-500/20 bg-indigo-950/30 px-6 py-2.5 text-xs text-indigo-200">
          <Sparkles className="size-4 shrink-0 text-indigo-400" />
          <p className="leading-relaxed">
            <strong>Cơ chế tự động nạp thời gian thực:</strong> Khi bạn thêm mới, sửa đổi hoặc bật/tắt bất kỳ điều khoản nào, hệ thống AI sẽ đọc trực tiếp dữ liệu mới nhất vào prompt khi quét sự kiện, đảm bảo quyết định luôn chuẩn xác theo quy định hiện hành.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/50 px-6 py-3">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Tìm mã, tiêu đề, nội dung điều khoản..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs font-bold text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">Tất cả nhóm tiêu chí</option>
              {Object.entries(CATEGORY_MAP).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>

            {/* Active Only Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
                className="size-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Chỉ hiện điều khoản đang bật</span>
            </label>
          </div>

          {/* Reset to Defaults button */}
          <button
            type="button"
            onClick={() =>
              setConfirmDialog({
                type: 'RESET',
                title: 'Khôi phục điều khoản mặc định',
                description:
                  'Thao tác này sẽ đặt lại bộ 7 điều khoản chuẩn của EventHub (Giấy phép PDF, Hình ảnh, Cơ cấu vé, Lịch trình phiên, Chống gian lận...). Bạn có chắc chắn muốn tiếp tục?',
                action: () => resetMutation.mutate(),
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:border-amber-500/40 hover:bg-slate-800 hover:text-amber-300"
          >
            <RotateCcw className="size-3.5" />
            <span>Khôi phục mặc định</span>
          </button>
        </div>

        {/* Criteria List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-slate-400">Đang tải danh sách điều khoản...</div>
          ) : filteredCriteria.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center">
              <ShieldCheck className="mx-auto size-12 text-slate-600" />
              <p className="mt-3 text-sm font-bold text-slate-300">Không tìm thấy điều khoản phù hợp</p>
              <p className="mt-1 text-xs text-slate-500">Hãy thử thay đổi từ khóa tìm kiếm hoặc bấm &quot;Thêm điều khoản mới&quot;.</p>
            </div>
          ) : (
            filteredCriteria.map((item) => {
              const categoryCfg = CATEGORY_MAP[item.category] || CATEGORY_MAP.GENERAL
              const severityCfg = SEVERITY_MAP[item.severity] || SEVERITY_MAP.CRITICAL
              const isExpanded = expandedId === item.id

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border transition duration-200 ${
                    item.is_active
                      ? 'border-slate-800 bg-slate-900/60 hover:border-indigo-500/40'
                      : 'border-slate-800/60 bg-slate-950/40 opacity-70'
                  }`}
                >
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Active Status Badge / Toggle */}
                      <button
                        type="button"
                        disabled={toggleActiveMutation.isPending}
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: item.id, is_active: !item.is_active })
                        }
                        title={item.is_active ? 'Bấm để tắt điều khoản này' : 'Bấm để kích hoạt điều khoản này cho AI'}
                        className="mt-0.5 shrink-0 transition hover:scale-105"
                      >
                        {item.is_active ? (
                          <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <Check className="size-4" />
                          </span>
                        ) : (
                          <span className="flex size-6 items-center justify-center rounded-lg bg-slate-800 text-slate-500 border border-slate-700">
                            <X className="size-3.5" />
                          </span>
                        )}
                      </button>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black tracking-wider text-indigo-400">
                            {item.code}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${categoryCfg.color}`}
                          >
                            {categoryCfg.label}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${severityCfg.badge}`}
                          >
                            {severityCfg.tag}
                          </span>
                          {!item.is_active && (
                            <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                              Đang tắt
                            </span>
                          )}
                        </div>

                        <h4 className="mt-1 text-sm font-black text-white">{item.title}</h4>

                        {/* Collapsed Preview */}
                        {!isExpanded && (
                          <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {item.rule_content}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 sm:self-center">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white transition"
                      >
                        {isExpanded ? (
                          <span className="flex items-center gap-1">
                            Thu gọn <ChevronUp className="size-3.5" />
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            Chi tiết <ChevronDown className="size-3.5" />
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(item)}
                        title="Chỉnh sửa điều khoản"
                        className="grid size-8 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:border-indigo-500/50 hover:bg-indigo-950/40 hover:text-indigo-300 transition"
                      >
                        <Edit2 className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDialog({
                            type: 'DELETE',
                            title: `Xóa điều khoản [${item.code}]`,
                            description: `Bạn có chắc chắn muốn xóa vĩnh viễn điều khoản "${item.title}"? AI sẽ không còn kiểm tra tiêu chí này nữa.`,
                            action: () => deleteMutation.mutate(item.id),
                          })
                        }
                        title="Xóa điều khoản"
                        className="grid size-8 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:border-rose-500/50 hover:bg-rose-950/40 hover:text-rose-400 transition"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded full details */}
                  {isExpanded && (
                    <div className="border-t border-slate-800/80 bg-slate-950/60 p-4 rounded-b-2xl">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                          Nội dung hướng dẫn chi tiết nạp cho AI:
                        </label>
                        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                          {item.rule_content}
                        </div>
                        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                          <span>Thứ tự ưu tiên: <strong>#{item.order_index}</strong></span>
                          <span>Cập nhật gần nhất: {new Date(item.updated_at || item.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-6 py-3.5">
          <div className="text-xs text-slate-400">
            Tổng cộng: <strong className="text-white">{filteredCriteria.length}</strong> điều khoản
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            Đóng
          </button>
        </div>

        {/* ============================================================ */}
        {/* ADD / EDIT CRITERION SUB-MODAL */}
        {/* ============================================================ */}
        {isFormOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-indigo-500/50 bg-[#0F172A] shadow-2xl shadow-indigo-950">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 place-items-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <FileText className="size-4" />
                  </div>
                  <h4 className="font-display text-base font-black text-white">
                    {editingItem ? 'Chỉnh sửa Điều khoản duyệt AI' : 'Thêm Điều khoản duyệt AI mới'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Code & Title Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">
                      Mã điều khoản <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: LEGAL_PERMIT"
                      value={formData.code}
                      onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-indigo-300 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-300">
                      Tên điều khoản / Tiêu đề <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Giấy phép tổ chức bắt buộc (PDF)"
                      value={formData.title}
                      onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Category & Severity & Order Index Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Nhóm tiêu chí</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      {Object.entries(CATEGORY_MAP).map(([key, item]) => (
                        <option key={key} value={key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Mức độ nghiêm trọng</label>
                    <select
                      value={formData.severity}
                      onChange={(e) => setFormData((prev) => ({ ...prev, severity: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      {Object.entries(SEVERITY_MAP).map(([key, item]) => (
                        <option key={key} value={key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Thứ tự ưu tiên</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.order_index}
                      onChange={(e) => setFormData((prev) => ({ ...prev, order_index: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Active switch */}
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div>
                    <label className="text-xs font-bold text-white">Kích hoạt áp dụng vào AI ngay</label>
                    <p className="text-[11px] text-slate-400">Nếu bật, AI sẽ lập tức đưa điều khoản này vào prompt để thẩm định các sự kiện tiếp theo.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="size-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Rule Content Textarea */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Nội dung hướng dẫn chi tiết cho AI <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-500">Viết rõ ràng, mạch lạc, dễ hiểu</span>
                  </div>
                  <textarea
                    rows={6}
                    required
                    placeholder="Mô tả chi tiết những gì AI cần kiểm tra. Ví dụ: Sự kiện phải có giấy phép định dạng PDF; nếu thiếu hoặc file sai định dạng thì phân loại vào critical_violations để từ chối..."
                    value={formData.rule_content}
                    onChange={(e) => setFormData((prev) => ({ ...prev, rule_content: e.target.value }))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none leading-relaxed"
                  />
                </div>

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2 text-xs font-black text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 transition disabled:opacity-50"
                  >
                    <Check className="size-4" />
                    <span>{editingItem ? 'Lưu thay đổi' : 'Thêm điều khoản'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* CONFIRMATION DIALOG */}
        {/* ============================================================ */}
        {confirmDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <h4 className="font-display text-base font-black text-white">{confirmDialog.title}</h4>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">{confirmDialog.description}</p>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.action}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
