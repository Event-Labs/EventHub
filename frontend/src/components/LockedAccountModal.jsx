import { useState, useEffect } from 'react';
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-[440px] max-h-[90vh] overflow-y-auto flex flex-col items-center rounded-[24px] border border-border-soft/50 bg-surface p-7 shadow-[0_25px_70px_-18px_rgba(0,0,0,0.7)]">

        {/* Icon */}
        <div className="mb-4 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-error/30 bg-error/15 ring-8 ring-error/5">
          <ShieldX className="h-7 w-7 text-error" />
        </div>

        {/* Title */}
        <h2 className="mb-1 text-center text-2xl font-black leading-tight tracking-tight text-content">
          Tài khoản bị khóa
        </h2>
        <p className="mb-5 text-center text-sm font-medium text-subtle">
          Tài khoản của bạn đã bị quản trị viên khóa.
        </p>

        <div className="mb-5 w-full space-y-4">
          {/* REASON */}
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Lý do khóa</p>
            <div className="rounded-xl border border-border-soft/40 bg-panel-soft p-4">
              <p className="text-sm font-semibold leading-relaxed text-content">
                {lockData.lockReason || lockData.lock_reason || 'Vi phạm điều khoản cộng đồng và quy định sử dụng hệ thống.'}
              </p>
            </div>
          </div>

          {/* DATES */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Ngày khóa</p>
              <p className="text-sm font-bold text-content">
                {formatDate(lockData.lockedAt || lockData.locked_at)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Dự kiến mở</p>
              <p className={`text-sm font-bold ${isPermanent ? 'text-error' : 'text-primary'}`}>
                {isPermanent ? 'Vĩnh viễn' : formatDate(lockData.lockedUntil || lockData.locked_until)}
              </p>
            </div>
          </div>

          {/* COUNTDOWN */}
          {!isPermanent && (lockData.lockedUntil || lockData.locked_until) && (
            <div className="rounded-2xl border border-primary/20 bg-panel-soft p-5 text-center">
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.25em] text-subtle">Thời gian còn lại</p>
              <p className="text-xl font-black leading-none tracking-wider text-primary tabular-nums">
                {timeLeft}
              </p>
            </div>
          )}

          {/* PERMANENT BADGE */}
          {isPermanent && (
            <div className="rounded-xl border border-error/25 bg-error/10 p-4 text-center">
              <p className="text-xs font-black uppercase tracking-wider text-error">Tài khoản này bị khóa vĩnh viễn</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onLogout}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-slate-950 shadow-md transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          Quay lại trang đăng nhập
        </button>
      </div>
    </div>
  );
}
