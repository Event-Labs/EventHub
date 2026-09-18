import { AlertTriangle, Building2, ShieldCheck } from 'lucide-react'
import { Modal } from '@/components/Modal.jsx'

export function ConfirmSuspendOrganizerModal({
  open,
  organizer,
  targetStatus = 'SUSPENDED',
  isPending = false,
  onClose,
  onConfirm,
}) {
  if (!organizer) return null

  const isSuspending = targetStatus === 'SUSPENDED'

  return (
    <Modal
      open={open}
      title={isSuspending ? 'Tạm ngưng tài khoản Organizer' : 'Kích hoạt lại tài khoản Organizer'}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            className="admin-secondary px-6 shrink-0"
            onClick={onClose}
            disabled={isPending}
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            className={`admin-primary font-extrabold rounded-xl px-6 transition disabled:opacity-50 ${
              isSuspending
                ? 'bg-error border-none text-white hover:bg-error/90'
                : 'bg-success border-none text-white hover:bg-success/90'
            }`}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending
              ? 'Đang xử lý...'
              : isSuspending
                ? 'Xác nhận tạm ngưng'
                : 'Xác nhận kích hoạt'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div
          className={`flex items-start gap-4 rounded-xl p-4 border ${
            isSuspending
              ? 'bg-error/[0.08] border-error/25 text-error'
              : 'bg-success/[0.08] border-success/25 text-success'
          }`}
        >
          <div
            className={`grid size-11 shrink-0 place-items-center rounded-xl ${
              isSuspending ? 'bg-error/20 text-error' : 'bg-success/20 text-success'
            }`}
          >
            {isSuspending ? <AlertTriangle className="size-6" /> : <ShieldCheck className="size-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider">
              {isSuspending ? 'Cảnh báo tạm ngưng' : 'Khôi phục hoạt động'}
            </p>
            <p className="mt-0.5 text-base font-bold text-content truncate">
              {organizer.organization_name}
            </p>
            {(organizer.owner_name || organizer.owner_email || organizer.business_email) && (
              <p className="mt-1 text-xs text-subtle truncate">
                Chủ sở hữu: {organizer.owner_name ? `${organizer.owner_name} (${organizer.owner_email || organizer.business_email})` : (organizer.owner_email || organizer.business_email)}
              </p>
            )}
          </div>
        </div>

        {isSuspending ? (
          <div className="rounded-xl border border-border-soft/40 bg-panel-soft p-4 space-y-2 text-sm text-subtle">
            <p className="font-semibold text-content">Khi tạm ngưng tài khoản này:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-subtle leading-5">
              <li>Nhà tổ chức <strong className="text-content">không thể tạo mới</strong> hoặc chỉnh sửa các sự kiện.</li>
              <li>Hoạt động mở bán vé và tính năng quản trị của organizer sẽ bị tạm dừng.</li>
              <li>Các phiên đăng nhập hiện tại của nhà tổ chức sẽ được làm mới.</li>
              <li>Bạn có thể kích hoạt lại tài khoản bất kỳ lúc nào khi cần.</li>
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-border-soft/40 bg-panel-soft p-4 text-sm text-subtle leading-6">
            Nhà tổ chức sẽ được khôi phục trạng thái <strong className="text-success">Hoạt động</strong> và có thể tiếp tục tạo sự kiện, quản lý bán vé và sử dụng toàn bộ tính năng của nền tảng.
          </div>
        )}
      </div>
    </Modal>
  )
}
