import React, { useState, useEffect } from 'react'
import {
  Users,
  Settings,
  Activity,
  Play,
  Pause,
  Save,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
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
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 flex items-center justify-center space-x-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin text-[#E6C17A]" />
        <span>{isEnglish ? 'Loading Waiting Room configuration...' : 'Đang tải cấu hình phòng chờ...'}</span>
      </div>
    )
  }

  return (
    <div className="bg-[#0C1446]/60 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-xl text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>{isEnglish ? 'Virtual Waiting Room Control' : 'Quản Lý Phòng Chờ Ảo'}</span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  enabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {enabled ? (isEnglish ? 'Active' : 'Đang Bật') : isEnglish ? 'Disabled' : 'Đang Tắt'}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {isEnglish
                ? 'High-concurrency queue protection for Mega-events & Concerts'
                : 'Bảo vệ hệ thống chống quá tải cho sự kiện lưu lượng truy cập lớn (Mega-events)'}
            </p>
          </div>
        </div>

        {enabled && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleTogglePause}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
                isPaused
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? (isEnglish ? 'Resume Queue' : 'Mở Lại Hàng Đợi') : isEnglish ? 'Pause Queue' : 'Tạm Dừng Hàng Đợi'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 border border-white/5 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            {isEnglish ? 'Waiting in Queue' : 'Đang Xếp Hàng'}
          </span>
          <span className="text-2xl font-black text-amber-400 font-mono">
            {stats?.waiting_count?.toLocaleString('vi-VN') || 0}
          </span>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            {isEnglish ? 'Active Booking Users' : 'Đang Mua Vé (Active)'}
          </span>
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {stats?.active_count || 0} / {stats?.max_active || maxActive}
          </span>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            {isEnglish ? 'Available Slots' : 'Slot Mua Vé Trống'}
          </span>
          <span className="text-2xl font-black text-blue-400 font-mono">
            {stats?.available_slots || 0}
          </span>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            {isEnglish ? 'Total Admitted' : 'Tổng Lượt Đã Cấp'}
          </span>
          <span className="text-2xl font-black text-purple-400 font-mono">
            {stats?.total_admitted?.toLocaleString('vi-VN') || 0}
          </span>
        </div>
      </div>

      {/* Configuration Form */}
      <form onSubmit={handleSaveConfig} className="space-y-4">
        {/* Toggle Enable */}
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <span className="text-sm font-bold text-white block">
              {isEnglish ? 'Enable Virtual Waiting Room' : 'Kích hoạt Phòng Chờ Ảo cho sự kiện này'}
            </span>
            <span className="text-xs text-slate-400">
              {isEnglish
                ? 'Direct high traffic users into fair FIFO queue before entering booking area'
                : 'Điều hướng khách mua vé vào hàng đợi công bằng FIFO trước khi vào chọn ghế'}
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2B5C92]"></div>
          </label>
        </div>

        {/* Setting Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEnglish ? 'Max Active Sessions (Capacity)' : 'Số người mua vé đồng thời (Max Active)'}
            </label>
            <input
              type="number"
              min="1"
              max="5000"
              value={maxActive}
              onChange={(e) => setMaxActive(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isEnglish ? 'Recommended: 50 - 500' : 'Khuyến nghị: 50 - 500 người'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEnglish ? 'Booking Session Duration (Seconds)' : 'Thời gian phiên giữ chỗ (Giây)'}
            </label>
            <input
              type="number"
              min="60"
              max="3600"
              value={sessionDuration}
              onChange={(e) => setSessionDuration(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isEnglish ? '600s = 10 minutes' : '600s = 10 phút'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isEnglish ? 'Admission Batch Size' : 'Số lượng cấp mỗi nhịp (Batch Size)'}
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isEnglish ? 'Admitted per worker tick' : 'Số người mời vào mỗi đợt'}
            </span>
          </div>
        </div>

        {/* Save button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center space-x-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isEnglish ? 'Save Settings' : 'Lưu Cấu Hình'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

