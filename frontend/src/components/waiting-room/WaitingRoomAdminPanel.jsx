import React, { useState, useEffect } from 'react'
import {
  Play,
  Pause,
  RefreshCw,
  Info,
} from 'lucide-react'
import { waitingRoomService } from '@/services/waitingRoom'
import { useToast } from '@/providers/ToastProvider.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

export function WaitingRoomAdminPanel({ eventId }) {
  const toast = useToast()
  const { isEnglish } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState(null)

  // Form states
  const [enabled, setEnabled] = useState(false)
  const [maxActive, setMaxActive] = useState(100)
  const [sessionDuration, setSessionDuration] = useState(600)
  const [pollInterval, setPollInterval] = useState(3000)
  const [batchSize, setBatchSize] = useState(10)
  const [isPaused, setIsPaused] = useState(false)

  const loadData = async () => {
    if (!eventId) return
    try {
      setLoading(true)
      const data = await waitingRoomService.getAdminStats(eventId)
      setStats(data)
      setEnabled(Boolean(data.enabled))
      setMaxActive(data.max_active || 100)
      setSessionDuration(data.session_duration_seconds || 600)
      setIsPaused(Boolean(data.is_paused))
    } catch (err) {
      console.error('Error fetching waiting room stats:', err)
      toast.error(isEnglish ? 'Failed to fetch waiting room data' : 'Không thể tải thông tin phòng chờ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // Poll stats every 5s while panel is open
    const interval = setInterval(async () => {
      try {
        const live = await waitingRoomService.getAdminStats(eventId)
        setStats(live)
      } catch (_) {}
    }, 5000)
    return () => clearInterval(interval)
  }, [eventId])

  const handleSaveConfig = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      await waitingRoomService.updateConfig(eventId, {
        enabled,
        max_active: Number(maxActive),
        session_duration_seconds: Number(sessionDuration),
        poll_interval_ms: Number(pollInterval),
        admission_batch_size: Number(batchSize),
      })
      toast.success(isEnglish ? 'Waiting room config updated!' : 'Đã cập nhật cấu hình phòng chờ ảo!')
      await loadData()
    } catch (err) {
      toast.error(err.response?.data?.message || (isEnglish ? 'Update failed' : 'Cập nhật thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePause = async () => {
    try {
      if (isPaused) {
        await waitingRoomService.resumeQueue(eventId)
        setIsPaused(false)
        toast.success(isEnglish ? 'Queue resumed' : 'Đã tiếp tục phòng chờ')
      } else {
        await waitingRoomService.pauseQueue(eventId)
        setIsPaused(true)
        toast.info(isEnglish ? 'Queue paused' : 'Đã tạm dừng phòng chờ')
      }
      loadData()
    } catch (err) {
      toast.error(isEnglish ? 'Action failed' : 'Thao tác thất bại')
    }
  }

  if (loading && !stats) {
    return (
      <div className="glass-panel rounded-[24px] border border-border-soft/40 p-8 flex items-center justify-center space-x-3 text-subtle shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <RefreshCw className="size-5 animate-spin text-[#E6C17A]" />
        <span className="text-sm font-medium">{isEnglish ? 'Loading Waiting Room configuration...' : 'Đang tải cấu hình phòng chờ...'}</span>
      </div>
    )
  }

  const availableSlots = stats?.available_slots ?? Math.max(0, (stats?.max_active || maxActive) - (stats?.active_count || 0))

  return (
    <section className="glass-panel rounded-[24px] border border-border-soft/40 p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.2)] text-content transition-all">
      {/* ── 1. Header ── */}
      <div className="flex items-center justify-between pb-5 border-b border-border-soft/40">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-content tracking-tight">
            {isEnglish ? 'Virtual Waiting Room' : 'Quản lý Phòng Chờ Ảo'}
          </h3>
        </div>

        <div>
          {enabled ? (
            isPaused ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <span className="size-1.5 rounded-full bg-amber-400" />
                {isEnglish ? 'Paused' : 'Tạm dừng'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isEnglish ? 'Ready' : 'Sẵn sàng'}
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700/40 text-slate-400 border border-slate-600/30">
              {isEnglish ? 'Disabled' : 'Đang tắt'}
            </span>
          )}
        </div>
      </div>

      {/* ── 2. Trạng thái phòng chờ ── */}
      <div className="py-6 border-b border-border-soft/40">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h4 className="text-sm sm:text-base font-bold text-content">
            {isEnglish ? 'Waiting Room Status' : 'Trạng thái phòng chờ'}
          </h4>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                enabled
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
              }`}
            >
              {enabled ? (isEnglish ? 'Active' : 'Đã bật') : (isEnglish ? 'Disabled' : 'Đã tắt')}
            </span>

            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>

            {enabled && (
              <button
                type="button"
                onClick={handleTogglePause}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPaused
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                }`}
                title={isPaused ? (isEnglish ? 'Resume Queue' : 'Mở lại hàng đợi') : (isEnglish ? 'Pause Queue' : 'Tạm dừng hàng đợi')}
              >
                {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                <span>{isPaused ? (isEnglish ? 'Resume' : 'Tiếp tục') : (isEnglish ? 'Pause' : 'Tạm dừng')}</span>
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-content">
            {isEnglish ? 'Enable waiting room for this event' : 'Sử dụng phòng chờ cho sự kiện'}
          </p>
          <p className="text-xs text-subtle mt-0.5 leading-relaxed">
            {isEnglish
              ? 'The system will automatically regulate the flow of users into the booking area when needed.'
              : 'Hệ thống sẽ tự động điều tiết lượng người vào khu vực đặt vé khi cần thiết.'}
          </p>
        </div>
      </div>

      {/* ── 3. Thống kê hoạt động ── */}
      <div className="py-6 border-b border-border-soft/40">
        <h4 className="text-sm sm:text-base font-bold text-content mb-4">
          {isEnglish ? 'Activity Statistics' : 'Thống kê hoạt động'}
        </h4>
        <div className="grid grid-cols-2 gap-y-6 gap-x-8">
          <div>
            <span className="text-xs font-semibold text-subtle mb-1.5 block">
              {isEnglish ? 'Waiting in Queue' : 'Đang xếp hàng'}
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-content font-mono tracking-tight">
              {stats?.waiting_count?.toLocaleString('vi-VN') || 0}
            </span>
          </div>

          <div>
            <span className="text-xs font-semibold text-subtle mb-1.5 block">
              {isEnglish ? 'Active Booking Users' : 'Đang mua vé'}
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
              {stats?.active_count || 0} / {stats?.max_active || maxActive}
            </span>
          </div>

          <div>
            <span className="text-xs font-semibold text-subtle mb-1.5 block">
              {isEnglish ? 'Available Slots' : 'Slot còn trống'}
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-400 font-mono tracking-tight">
              {availableSlots}
            </span>
          </div>

          <div>
            <span className="text-xs font-semibold text-subtle mb-1.5 block">
              {isEnglish ? 'Total Admitted' : 'Tổng lượt đã cấp'}
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-content font-mono tracking-tight">
              {stats?.total_admitted?.toLocaleString('vi-VN') || 0}
            </span>
          </div>
        </div>
      </div>

      {/* ── 4. Chính sách điều tiết ── */}
      <form onSubmit={handleSaveConfig} className="pt-6">
        <h4 className="text-sm sm:text-base font-bold text-content mb-4">
          {isEnglish ? 'Regulation Policy' : 'Chính sách điều tiết'}
        </h4>

        <div className="space-y-4">
          {/* Row 1: Max Active */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2">
            <div>
              <span className="text-sm font-semibold text-content block">
                {isEnglish ? 'Max Concurrent Sessions' : 'Giới hạn phiên đồng thời'}
              </span>
              <span className="text-xs text-subtle">
                {isEnglish ? 'Recommended: 50 - 500 users' : 'Số người mua vé cùng lúc tối đa (khuyến nghị 50 - 500)'}
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <input
                type="number"
                min="1"
                max="5000"
                value={maxActive}
                onChange={(e) => setMaxActive(e.target.value)}
                className="w-24 sm:w-28 px-3 py-1.5 text-right font-bold font-mono rounded-xl border border-border-soft/60 bg-panel-soft text-content text-sm focus:border-[#C99A47] focus:outline-none transition"
              />
              <span className="text-xs font-bold text-subtle min-w-[45px]">
                {isEnglish ? 'users' : 'người'}
              </span>
            </div>
          </div>

          {/* Row 2: Hold duration */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2">
            <div>
              <span className="text-sm font-semibold text-content block">
                {isEnglish ? 'Booking Hold Duration' : 'Thời gian Booking'}
              </span>
              <span className="text-xs text-subtle">
                {isEnglish ? 'Max hold duration per customer session' : 'Thời gian phiên giữ chỗ của mỗi khách mua vé'}
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <input
                type="number"
                min="60"
                max="3600"
                value={sessionDuration}
                onChange={(e) => setSessionDuration(e.target.value)}
                className="w-24 sm:w-28 px-3 py-1.5 text-right font-bold font-mono rounded-xl border border-border-soft/60 bg-panel-soft text-content text-sm focus:border-[#C99A47] focus:outline-none transition"
              />
              <span className="text-xs font-bold text-subtle min-w-[45px]">
                {isEnglish ? 'seconds' : 'giây'}
              </span>
            </div>
          </div>

          {/* Row 3: Batch size */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2">
            <div>
              <span className="text-sm font-semibold text-content block">
                {isEnglish ? 'Admission Batch Size' : 'Cấp lượt tiếp theo'}
              </span>
              <span className="text-xs text-subtle">
                {isEnglish ? 'Number of customers admitted per dispatch cycle' : 'Số lượng người được mời vào chọn ghế mỗi đợt'}
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <input
                type="number"
                min="1"
                max="100"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                className="w-24 sm:w-28 px-3 py-1.5 text-right font-bold font-mono rounded-xl border border-border-soft/60 bg-panel-soft text-content text-sm focus:border-[#C99A47] focus:outline-none transition"
              />
              <span className="text-xs font-bold text-subtle min-w-[45px]">
                {isEnglish ? 'users' : 'người'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer info & Save Button */}
        <div className="pt-5 mt-4 border-t border-border-soft/30 flex flex-col items-end gap-3">
          <p className="text-xs text-subtle flex items-center gap-1.5 w-full justify-start text-left">
            <Info className="size-3.5 shrink-0 text-subtle" />
            <span>
              {isEnglish
                ? 'Queue limits and traffic controls are governed by EventHub Engine.'
                : 'Các giới hạn được quản lý bởi hệ thống EventHub.'}
            </span>
          </p>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center px-7 py-2.5 rounded-full bg-gradient-to-r from-[#C99A47] to-[#E6C17A] text-[#0D1B2A] font-extrabold text-xs shadow-md shadow-[#C99A47]/20 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {saving && <RefreshCw className="mr-1.5 size-4 animate-spin text-[#0D1B2A]" />}
            <span>{isEnglish ? 'Save Settings' : 'Lưu Cấu Hình'}</span>
          </button>
        </div>
      </form>
    </section>
  )
}


