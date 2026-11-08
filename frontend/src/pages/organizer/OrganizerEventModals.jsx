import { useState, useEffect } from 'react'
import {
  Globe,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  PlayCircle,
  PauseCircle,
  Trash2,
  RotateCcw,
  ShieldAlert,
  Ticket,
} from 'lucide-react'
import { fetchOrganizerEvent } from '@/services/organizerEvents.js'

export function formatModalDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// 1. Publish Confirm Modal
// ---------------------------------------------------------------------------
export function PublishConfirmModal({ event, onConfirm, onClose, loading }) {
  if (!event) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Globe className="size-5" />
          </span>
          <div>
            <h3 className="text-xl font-black text-white">Xác nhận xuất bản</h3>
            <p className="mt-1 text-sm text-slate-300">
              Sự kiện sẽ hiển thị công khai ngay sau khi xuất bản.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
            Ngày diễn ra: {formatModalDate(event.start_time)}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-[#C99A47]/30 bg-[#C99A47]/10 p-3 text-xs text-[#E6C17A]">
          <ul className="list-inside list-disc space-y-1">
            <li>Sự kiện sẽ xuất hiện trong danh sách tìm kiếm và trang chủ.</li>
            <li>Người dùng có thể mua vé ngay sau khi xuất bản.</li>
            <li>Bạn vẫn có thể chỉnh sửa thông tin sau khi xuất bản.</li>
          </ul>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                Đang xuất bản...
              </span>
            ) : (
              'Xuất bản ngay'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Toggle Hide / Unhide Confirm Modal
// ---------------------------------------------------------------------------
export function ToggleHideConfirmModal({ event, onConfirm, onClose, loading }) {
  if (!event) return null
  const isCurrentlyHidden = event?.display_state === 'HIDDEN_BY_ORGANIZER'
  const [reasonNote, setReasonNote] = useState('')

  const handleConfirm = () => {
    onConfirm({ reason: isCurrentlyHidden ? '' : (reasonNote.trim() || 'Tạm ẩn theo yêu cầu của ban tổ chức') })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isCurrentlyHidden ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-400'}`}>
            {isCurrentlyHidden ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {isCurrentlyHidden ? 'Xác nhận hiện lại sự kiện' : 'Xác nhận tạm ẩn sự kiện'}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isCurrentlyHidden
                ? 'Sự kiện sẽ được hiển thị công khai trở lại trên trang chủ và tìm kiếm.'
                : 'Sự kiện sẽ bị ẩn khỏi trang chủ và kết quả tìm kiếm của khách hàng.'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
            Ngày diễn ra: {formatModalDate(event.start_time)}
          </p>
        </div>

        {!isCurrentlyHidden && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Lý do tạm ẩn (Tùy chọn)
            </label>
            <input
              type="text"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Nhập lý do tạm ẩn sự kiện..."
              className="w-full rounded-xl border border-white/15 bg-[#121c38] p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Warning / Note */}
        <div className={`mt-4 rounded-xl border p-3 text-xs ${isCurrentlyHidden ? 'border-primary/30 bg-primary/10 text-primary-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {isCurrentlyHidden ? (
            <p>💡 Người dùng có thể tìm thấy sự kiện và tiếp tục xem thông tin bình thường sau khi mở lại.</p>
          ) : (
            <div className="space-y-1">
              <p>⚠️ <strong>Lưu ý:</strong> Khi tạm ẩn sự kiện, tính năng bán vé sẽ <strong>tự động tạm dừng</strong>.</p>
              <p className="text-amber-300/80">Bạn cần hiện lại sự kiện trước nếu muốn tiếp tục mở bán vé cho khách hàng.</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                Đang xử lý...
              </span>
            ) : isCurrentlyHidden ? (
              'Hiện lại ngay'
            ) : (
              'Tạm ẩn sự kiện'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Toggle Sales Confirm Modal
// ---------------------------------------------------------------------------
export function ToggleSalesConfirmModal({ event, onConfirm, onClose, loading }) {
  if (!event) return null

  const [currentEvent, setCurrentEvent] = useState(event)
  useEffect(() => {
    setCurrentEvent(event)
  }, [event])

  const isCurrentlyPaused = currentEvent?.sales_status === 'PAUSED'
  const isHidden = currentEvent?.display_state === 'HIDDEN_BY_ORGANIZER' || currentEvent?.status === 'HIDDEN'

  const [scope, setScope] = useState('ALL') // 'ALL' or 'SPECIFIC'
  const [selectedTicketTypeIds, setSelectedTicketTypeIds] = useState([])
  const [reasonNote, setReasonNote] = useState('')
  const [ticketTypes, setTicketTypes] = useState(() => {
    if (Array.isArray(event?.ticket_types) && event.ticket_types.length > 0) {
      return event.ticket_types
    }
    if (Array.isArray(event?.sessions) && event.sessions.length > 0) {
      return event.sessions.flatMap((s) => s.ticket_types || [])
    }
    return []
  })
  const [loadingTickets, setLoadingTickets] = useState(false)

  // Fetch full event details & ticket types if not loaded or to ensure freshness
  useEffect(() => {
    if (event?.id) {
      setLoadingTickets(true)
      fetchOrganizerEvent(event.id)
        .then((detail) => {
          if (detail) {
            setCurrentEvent(detail)
            const list = detail?.ticket_types?.length
              ? detail.ticket_types
              : (detail?.sessions?.flatMap((s) => s.ticket_types || []) || [])
            setTicketTypes(list)
          }
        })
        .catch((err) => {
          console.error('Failed to load event details for pause modal:', err)
        })
        .finally(() => setLoadingTickets(false))
    }
  }, [event?.id])

  // Find active specific ticket blocks
  const activeSpecificBlocks = (currentEvent?.sales_blocks || []).filter(
    (b) => !b.released_at && (b.metadata?.scope === 'SPECIFIC' || b.metadata?.ticket_type_id)
  )
  const pausedTicketIds = new Set(
    activeSpecificBlocks.map((b) => String(b.metadata?.ticket_type_id || '')).filter(Boolean)
  )

  const formatCurrency = (val) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0)

  const handleConfirm = () => {
    if (isCurrentlyPaused) {
      onConfirm({ action: 'RESUME_ALL', scope: 'ALL' })
    } else if (scope === 'SPECIFIC') {
      const selectedTickets = ticketTypes.filter((t) => selectedTicketTypeIds.includes(String(t.id)))
      onConfirm({
        scope: 'SPECIFIC',
        ticketTypeIds: selectedTicketTypeIds,
        ticketTypes: selectedTickets,
        reason: reasonNote.trim(),
      })
    } else {
      onConfirm({
        scope: 'ALL',
        reason: reasonNote.trim(),
      })
    }
  }

  const isSubmitDisabled =
    loading ||
    (isCurrentlyPaused && isHidden) ||
    (!isCurrentlyPaused && scope === 'SPECIFIC' && selectedTicketTypeIds.length === 0)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white my-8">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isCurrentlyPaused ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {isCurrentlyPaused ? <PlayCircle className="size-5" /> : <PauseCircle className="size-5" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {isCurrentlyPaused ? 'Xác nhận mở bán lại vé' : 'Tạm dừng bán vé'}
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              {isCurrentlyPaused
                ? 'Khách hàng có thể tiếp tục mua vé sau khi mở bán lại.'
                : 'Tạm dừng bán toàn bộ sự kiện hoặc một số loại ghế / hạng vé cụ thể.'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3.5">
          <p className="text-sm font-bold text-white">{event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
            Ngày diễn ra: {formatModalDate(event.start_time)}
          </p>
        </div>

        {/* If event is hidden, explain that sales cannot resume until unhidden */}
        {isCurrentlyPaused && isHidden ? (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3.5 text-xs text-rose-200">
            <p className="font-bold flex items-center gap-1.5 text-rose-300 mb-1">
              <AlertTriangle className="size-4 shrink-0" /> Sự kiện đang ở trạng thái TẠM ẨN
            </p>
            <p>
              Không thể kích hoạt bán vé khi sự kiện đang bị ẩn khỏi hệ thống. Vui lòng sử dụng tính năng <strong>&quot;Hiện lại sự kiện&quot;</strong> trước.
            </p>
          </div>
        ) : !isCurrentlyPaused ? (
          <>
            {/* Scope selection: Toàn bộ sự kiện vs loại ghế / hạng vé cụ thể */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Phạm vi tạm dừng bán <span className="text-amber-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('ALL')}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    scope === 'ALL'
                      ? 'border-[#C99A47] bg-[#C99A47]/15 text-white ring-1 ring-[#C99A47]'
                      : 'border-white/10 bg-[#121c38] text-slate-300 hover:border-white/20'
                  }`}
                >
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${scope === 'ALL' ? 'bg-[#C99A47]' : 'bg-slate-500'}`} />
                    Toàn bộ sự kiện
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tất cả loại ghế / hạng vé</p>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('SPECIFIC')}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    scope === 'SPECIFIC'
                      ? 'border-[#C99A47] bg-[#C99A47]/15 text-white ring-1 ring-[#C99A47]'
                      : 'border-white/10 bg-[#121c38] text-slate-300 hover:border-white/20'
                  }`}
                >
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${scope === 'SPECIFIC' ? 'bg-[#C99A47]' : 'bg-slate-500'}`} />
                    Từng loại vé / ghế
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Chọn 1 hoặc nhiều loại vé</p>
                </button>
              </div>
            </div>

            {/* If specific ticket type selected */}
            {scope === 'SPECIFIC' && (
              <div className="mt-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Chọn các loại ghế / hạng vé tạm dừng <span className="text-amber-400">*</span>
                  </label>
                  {ticketTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const availableIds = ticketTypes
                          .filter((t) => !pausedTicketIds.has(String(t.id)))
                          .map((t) => String(t.id))
                        if (selectedTicketTypeIds.length === availableIds.length) {
                          setSelectedTicketTypeIds([])
                        } else {
                          setSelectedTicketTypeIds(availableIds)
                        }
                      }}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition"
                    >
                      {selectedTicketTypeIds.length > 0 &&
                      selectedTicketTypeIds.length === ticketTypes.filter((t) => !pausedTicketIds.has(String(t.id))).length
                        ? 'Bỏ chọn tất cả'
                        : 'Chọn tất cả'}
                    </button>
                  )}
                </div>

                {loadingTickets ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <span className="size-3.5 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                    Đang tải danh sách hạng vé...
                  </div>
                ) : ticketTypes.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs text-slate-400">
                    Sự kiện chưa có thông tin hạng vé nào để tạm dừng.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {ticketTypes.map((tt) => {
                      const isTtPaused = pausedTicketIds.has(String(tt.id))
                      const isChecked = selectedTicketTypeIds.includes(String(tt.id))
                      return (
                        <div
                          key={tt.id}
                          onClick={() => {
                            if (isTtPaused) return
                            setSelectedTicketTypeIds((prev) =>
                              prev.includes(String(tt.id))
                                ? prev.filter((id) => id !== String(tt.id))
                                : [...prev, String(tt.id)]
                            )
                          }}
                          className={`flex items-center justify-between rounded-xl border p-2.5 transition select-none ${
                            isTtPaused
                              ? 'border-amber-500/20 bg-amber-500/5 opacity-60 cursor-not-allowed'
                              : isChecked
                                ? 'border-[#C99A47] bg-[#C99A47]/15 ring-1 ring-[#C99A47] cursor-pointer'
                                : 'border-white/10 bg-[#121c38] hover:border-white/20 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              disabled={isTtPaused}
                              checked={isChecked}
                              onChange={() => {}}
                              className="size-4 rounded border-white/20 text-[#C99A47] focus:ring-[#C99A47] cursor-pointer"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{tt.name}</p>
                              <p className="text-[10px] text-slate-400">
                                {tt.is_seated ? 'Ghế ngồi' : 'Vé đứng'}
                                {tt.quantity ? ` • Tổng ${tt.quantity} vé` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 pl-2">
                            <p className="text-xs font-bold text-amber-300">{formatCurrency(tt.price)}</p>
                            {isTtPaused && (
                              <span className="text-[10px] font-semibold text-amber-400 block">Đang tạm dừng</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* List of currently paused ticket types */}
            {activeSpecificBlocks.length > 0 && (
              <div className="mt-3.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <PauseCircle className="size-3.5 shrink-0" /> Các loại vé đang tạm dừng ({activeSpecificBlocks.length}):
                  </p>
                  {activeSpecificBlocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        onConfirm({
                          action: 'RESUME_ALL_TICKETS',
                          ticketTypeIds: activeSpecificBlocks.map((b) => b.metadata?.ticket_type_id || b.id).filter(Boolean),
                        })
                      }
                      disabled={loading}
                      className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
                    >
                      Mở bán lại tất cả
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {activeSpecificBlocks.map((b) => (
                    <div
                      key={b.id || b.metadata?.ticket_type_id}
                      className="flex items-center justify-between rounded-lg bg-[#0b1329]/80 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-200 truncate">
                          {b.metadata?.ticket_type_name || 'Hạng vé cụ thể'}
                        </p>
                        {b.metadata?.reason && (
                          <p className="text-[11px] text-slate-400 truncate">Lý do: {b.metadata.reason}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onConfirm({
                            action: 'RESUME_TICKET_TYPE',
                            ticketTypeId: b.metadata?.ticket_type_id,
                            ticketTypeName: b.metadata?.ticket_type_name,
                          })
                        }
                        disabled={loading}
                        className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25 transition disabled:opacity-50"
                      >
                        Mở bán lại
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reason input */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Lý do tạm dừng bán (Tùy chọn)
              </label>
              <input
                type="text"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Ví dụ: Kiểm tra số lượng vé, bảo trì thông tin..."
                className="w-full rounded-xl border border-white/15 bg-[#121c38] p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
              />
            </div>
          </>
        ) : null}

        {!isHidden && (
          <div className={`mt-4 rounded-xl border p-3 text-xs ${isCurrentlyPaused ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
            {isCurrentlyPaused ? (
              <p>💡 Các loại vé còn số lượng sẽ ngay lập tức mở cho khách hàng đặt mua.</p>
            ) : (
              <p>⚠️ Các giao dịch thanh toán hoặc giữ chỗ đang diễn ra sẽ không bị ảnh hưởng. Người mua mới sẽ thấy trạng thái &quot;Tạm dừng bán&quot; đối với loại vé đã chọn.</p>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitDisabled}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                Đang xử lý...
              </span>
            ) : isCurrentlyPaused ? (
              'Mở bán lại toàn bộ vé'
            ) : scope === 'SPECIFIC' ? (
              selectedTicketTypeIds.length > 0
                ? `Tạm dừng bán ${selectedTicketTypeIds.length} loại vé đã chọn`
                : 'Chọn loại vé để tạm dừng'
            ) : (
              'Tạm dừng toàn bộ sự kiện'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. Cancel / Request Cancel Modal
// ---------------------------------------------------------------------------
export function CancelOrRequestCancelModal({ event, onConfirm, onClose, loading, error }) {
  if (!event) return null
  const hasPaidOrders = Number(event.paid_orders_count || 0) > 0
  const [reasonCode, setReasonCode] = useState('ORGANIZER_REASON')
  const [reasonNote, setReasonNote] = useState('')
  const [refundMode, setRefundMode] = useState('MODE_B')
  const [commitmentAccepted, setCommitmentAccepted] = useState(false)

  const isFormValid = !hasPaidOrders || (reasonNote.trim().length >= 20 && commitmentAccepted)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!isFormValid || loading) return

    if (hasPaidOrders) {
      onConfirm({
        is_request: true,
        reason_code: reasonCode,
        reason_note: reasonNote.trim(),
        refund_mode: refundMode,
        commitment_accepted: commitmentAccepted,
      })
    } else {
      onConfirm({
        is_request: false,
        reason: reasonNote.trim() || 'Hủy sự kiện theo yêu cầu của ban tổ chức',
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white my-8">
        <div className="flex items-start gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${hasPaidOrders ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
            {hasPaidOrders ? <ShieldAlert className="size-6" /> : <AlertTriangle className="size-6" />}
          </span>
          <div>
            <h3 className="text-xl font-black text-white">
              {hasPaidOrders ? 'Gửi yêu cầu hủy sự kiện' : 'Xác nhận hủy sự kiện'}
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              {hasPaidOrders
                ? 'Sự kiện đã phát sinh đơn hàng. Cần gửi yêu cầu và cam kết hoàn tiền để Admin phê duyệt.'
                : 'Sự kiện chưa bán được vé nào. Bạn có thể hủy trực tiếp ngay lập tức.'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span>Ngày diễn ra: {formatModalDate(event.start_time)}</span>
            <span>•</span>
            <span>Đơn đã thanh toán: <strong className={hasPaidOrders ? 'text-amber-400 font-bold' : 'text-slate-400'}>{event.paid_orders_count || 0} đơn</strong></span>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {hasPaidOrders ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nhóm lý do hủy <span className="text-rose-400">*</span>
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#121c38] px-3 py-2 text-sm text-white outline-none focus:border-primary"
                >
                  <option value="ORGANIZER_REASON">Lý do từ Ban tổ chức (Kế hoạch, lịch trình, tài chính)</option>
                  <option value="FORCE_MAJEURE">Lý do bất khả kháng (Thiên tai, dịch bệnh, pháp lý)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Giải trình chi tiết lý do hủy <span className="text-rose-400">*</span>
                  </label>
                  <span className={`text-[11px] ${reasonNote.trim().length >= 20 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {reasonNote.trim().length}/20 ký tự
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Nêu rõ lý do hủy và phương án giải quyết để Admin xem xét phê duyệt (tối thiểu 20 ký tự)..."
                  className="w-full rounded-xl border border-white/15 bg-[#121c38] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Phương thức hoàn tiền cho người mua vé <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${refundMode === 'MODE_B' ? 'border-primary bg-primary/10 text-white' : 'border-white/10 bg-[#121c38] text-slate-300'}`}>
                    <input
                      type="radio"
                      name="refundMode"
                      value="MODE_B"
                      checked={refundMode === 'MODE_B'}
                      onChange={() => setRefundMode('MODE_B')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-bold">Chuyển khoản VietQR</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">BTC tự chuyển tiền theo danh sách đối soát hoàn tiền.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${refundMode === 'MODE_A' ? 'border-primary bg-primary/10 text-white' : 'border-white/10 bg-[#121c38] text-slate-300'}`}>
                    <input
                      type="radio"
                      name="refundMode"
                      value="MODE_A"
                      checked={refundMode === 'MODE_A'}
                      onChange={() => setRefundMode('MODE_A')}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-bold">Tự động qua payOS</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Yêu cầu đã kích hoạt Payout API trong cài đặt thanh toán.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs leading-relaxed text-amber-200">
                  <input
                    type="checkbox"
                    checked={commitmentAccepted}
                    onChange={(e) => setCommitmentAccepted(e.target.checked)}
                    className="mt-1 size-4 rounded border-amber-500 text-primary focus:ring-primary shrink-0"
                  />
                  <span>
                    <strong>Cam kết nghĩa vụ hoàn tiền (Bắt buộc):</strong> Tôi cam kết sẽ thực hiện hoàn trả 100% tiền vé cho người mua trong vòng tối đa 7 ngày làm việc. Tôi hiểu rõ EventHub là nền tảng trung gian không giữ tiền vé, và toàn bộ nghĩa vụ tài chính hoàn tiền thuộc về Ban tổ chức.
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Lý do hủy (Tùy chọn)
              </label>
              <textarea
                rows={2}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Nhập lý do hủy sự kiện..."
                className="w-full rounded-xl border border-white/15 bg-[#121c38] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary resize-none"
              />
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="font-semibold">⚠️ Lưu ý:</p>
                <p className="mt-0.5">Sự kiện sẽ bị hủy ngay lập tức và chuyển sang trạng thái đã hủy. Hành động này không thể hoàn tác.</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Giữ lại
            </button>
            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2.5 text-sm font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />
                  Đang xử lý...
                </span>
              ) : hasPaidOrders ? (
                'Gửi yêu cầu hủy'
              ) : (
                'Xác nhận hủy ngay'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Withdraw Cancel Modal
// ---------------------------------------------------------------------------
export function WithdrawCancelConfirmModal({ event, onConfirm, onClose, loading }) {
  if (!event) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl text-white">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
            <RotateCcw className="size-6" />
          </span>
          <div>
            <h3 className="text-lg font-black text-white">Rút lại yêu cầu hủy sự kiện</h3>
            <p className="mt-1 text-xs text-slate-300">
              Bạn có chắc chắn muốn hủy yêu cầu này? Yêu cầu gửi Admin sẽ bị hủy bỏ và trạng thái bán vé của sự kiện sẽ được khôi phục.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-3 text-xs text-slate-300">
          Sự kiện: <strong className="text-white">{event.title}</strong>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-r from-[#C99A47] to-[#E6C17A] px-4 py-2 text-xs font-black text-[#0D1B2A] shadow-md shadow-[#C99A47]/30 transition hover:brightness-110 active:scale-95 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading && <span className="size-3 animate-spin rounded-full border-2 border-[#0D1B2A] border-t-transparent" />}
            Xác nhận rút lại
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 6. Delete Draft Modal
// ---------------------------------------------------------------------------
export function DeleteDraftConfirmModal({ event, onConfirm, onClose, loading }) {
  if (!event) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1329] p-6 shadow-2xl shadow-black/90 text-white">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-400">
            <Trash2 className="size-5" />
          </span>
          <div>
            <h3 className="text-xl font-black text-white">Xác nhận xóa bản nháp</h3>
            <p className="mt-1 text-sm text-slate-300">
              Bản nháp sẽ bị xóa vĩnh viễn và không thể khôi phục.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121c38] p-4">
          <p className="text-base font-bold text-white">{event.title}</p>
          <p className="mt-1 text-xs text-slate-300">
            Cập nhật lần cuối: {formatModalDate(event.updated_at)}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          ⚠️ Hành động này sẽ xóa hoàn toàn thông tin sự kiện và các hạng vé dự thảo khỏi hệ thống.
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Đang xóa...
              </span>
            ) : (
              'Xóa vĩnh viễn'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

