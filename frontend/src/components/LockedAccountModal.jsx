import React, { useState, useEffect } from 'react';
import { ShieldX } from 'lucide-react';

export function LockedAccountModal({ open, lockData, onLogout }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!open || !lockData || (lockData.isPermanentLock || lockData.isPermanent)) return;

    const calculateTimeLeft = () => {
      const targetDate = lockData.lockedUntil || lockData.locked_until;
      const isPermanent = lockData.isPermanentLock || lockData.isPermanent;

      if (isPermanent || !targetDate) return;

      const distance = new Date(targetDate) - new Date();

      if (isNaN(distance) || distance < 0) {
        setTimeLeft('00:00:00');
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days} ngày`);
      parts.push(`${hours.toString().padStart(2, '0')} giờ`);
      parts.push(`${minutes.toString().padStart(2, '0')} phút`);
      parts.push(`${seconds.toString().padStart(2, '0')} giây`);

      setTimeLeft(parts.join(' '));
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [open, lockData]);

  if (!open || !lockData) return null;

  const isPermanent = lockData.isPermanentLock || lockData.isPermanent;

  const formatDate = (dateStr) => {
    if (!dateStr) return '---';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '---';
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-[440px] max-h-[90vh] overflow-y-auto flex flex-col items-center bg-white p-7 rounded-[24px] border border-slate-200 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)]">

        {/* Icon */}
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 border border-red-100 mb-4 flex-shrink-0">
          <ShieldX className="h-7 w-7 text-red-500" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mb-1 text-center">
          Tài khoản bị khóa
        </h2>
        <p className="text-slate-500 text-sm font-medium mb-5 text-center">
          Tài khoản của bạn đã bị quản trị viên khóa.
        </p>

        <div className="w-full space-y-4 mb-5">
          {/* REASON */}
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Lý do khóa</p>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="font-semibold text-slate-800 text-sm leading-relaxed">
                {lockData.lockReason || lockData.lock_reason || 'Vi phạm điều khoản cộng đồng và quy định sử dụng hệ thống.'}
              </p>
            </div>
          </div>

          {/* DATES */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ngày khóa</p>
              <p className="font-bold text-slate-900 text-sm">
                {formatDate(lockData.lockedAt || lockData.locked_at)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Dự kiến mở</p>
              <p className="font-bold text-sm" style={{ color: isPermanent ? '#ef4444' : 'var(--color-primary, #6366f1)' }}>
                {isPermanent ? 'Vĩnh viễn' : formatDate(lockData.lockedUntil || lockData.locked_until)}
              </p>
            </div>
          </div>

          {/* COUNTDOWN */}
          {!isPermanent && (lockData.lockedUntil || lockData.locked_until) && (
            <div className="bg-slate-900 rounded-2xl p-5 text-center">
              <p className="text-[9px] font-black uppercase text-slate-500 mb-2 tracking-[0.25em]">Thời gian còn lại</p>
              <p className="text-xl font-black text-primary tabular-nums tracking-wider leading-none">
                {timeLeft}
              </p>
            </div>
          )}

          {/* PERMANENT BADGE */}
          {isPermanent && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-center">
              <p className="font-black text-red-600 text-xs uppercase tracking-wider">Tài khoản này bị khóa vĩnh viễn</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onLogout}
          className="w-full h-12 flex items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition-all active:scale-[0.98] shadow-md"
        >
          Quay lại trang đăng nhập
        </button>
      </div>
    </div>
  );
}
