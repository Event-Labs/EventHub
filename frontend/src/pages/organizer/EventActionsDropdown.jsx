import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  MoreHorizontal,
  ChevronDown,
  Edit,
  Archive,
  ArchiveRestore,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  AlertTriangle,
  Globe,
  Trash2,
  BarChart3,
  Users,
  QrCode,
  ExternalLink,
} from 'lucide-react'
import { useToast } from '@/providers/ToastProvider.jsx'
import { isEventEnded } from './eventStatusUtil.js'

export function EventActionsDropdown({
  event,
  variant = 'icon', // 'icon' or 'button'
  label = 'Tác vụ',
  includeEdit = true,
  onEdit,
  onToggleHide,
  onToggleSales,
  onWithdrawCancel,
  onCancel,
  onPublish,
  onDelete,
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  if (!event) return null

  const isCancelPending = event?.cancel_request?.status === 'PENDING'
  const isCancelled = event?.status === 'CANCELLED'
  const isSuspended = event?.display_state === 'SUSPENDED_BY_ADMIN'
  const ended = isEventEnded(event) || (event?.status === 'COMPLETED' && event?.approval_status !== 'APPROVED')
  const isDraft = event?.status === 'DRAFT'
  const isPendingReview = event?.status === 'PENDING_REVIEW'
  const isApprovedAwaitingPublish = !ended && (
    (event?.status === 'COMPLETED' && event?.approval_status === 'APPROVED') ||
    event?.status === 'APPROVED'
  )
  const isHidden = event?.display_state === 'HIDDEN_BY_ORGANIZER' || event?.status === 'HIDDEN'
  const isPaused = event?.sales_status === 'PAUSED'
  const isLive = !ended && !isCancelled && !isSuspended && !isCancelPending && (
    event?.status === 'PUBLISHED' || isHidden || isPaused
  )

  const eventPublicUrl = `/events/${event.slug || event.id}`

  // Build items list theo thứ bậc ưu tiên và trạng thái sự kiện
  const items = []

  // 1. Mức ưu tiên cao nhất: Đang chờ duyệt hủy -> CHỈ DUY NHẤT "Hoàn tác yêu cầu hủy"
  if (isCancelPending) {
    items.push({
      key: 'withdraw-cancel',
      label: 'Hoàn tác yêu cầu hủy',
      icon: RotateCcw,
      className: 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 [html.light_&]:text-amber-600 [html.light_&]:hover:bg-amber-50',
      onClick: () => onWithdrawCancel && onWithdrawCancel(event),
    })
  } else if (isDraft) {
    // 2. Bản nháp: Chỉnh sửa và Xóa bản nháp
    if (includeEdit) {
      items.push({
        key: 'edit',
        label: 'Chỉnh sửa sự kiện',
        icon: Edit,
        className: 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
        onClick: () => {
          if (onEdit) onEdit(event)
          else navigate(`/organizer/events/${event.id}/edit`)
        },
      })
    }
    items.push({
      key: 'delete-draft',
      label: 'Xóa bản nháp',
      icon: Trash2,
      className: 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 [html.light_&]:text-rose-600 [html.light_&]:hover:bg-rose-50',
      onClick: () => onDelete && onDelete(event),
    })
  } else if (isPendingReview) {
    // 3. Chờ duyệt: Chỉnh sửa sự kiện và Xem trước trang công khai
    if (includeEdit) {
      items.push({
        key: 'edit',
        label: 'Chỉnh sửa sự kiện',
        icon: Edit,
        className: 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
        onClick: () => {
          if (onEdit) onEdit(event)
          else navigate(`/organizer/events/${event.id}/edit`)
        },
      })
    }
    items.push({
      key: 'view-public',
      label: 'Xem trước sự kiện',
      icon: ExternalLink,
      className: 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 [html.light_&]:text-cyan-600 [html.light_&]:hover:bg-cyan-50',
      onClick: () => window.open(eventPublicUrl, '_blank'),
    })
  } else if (isApprovedAwaitingPublish) {
    // 4. Đã duyệt chờ xuất bản: Xuất bản, Chỉnh sửa, Xem trước
    items.push({
      key: 'publish',
      label: 'Xuất bản sự kiện',
      icon: Globe,
      className: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 [html.light_&]:text-emerald-600 [html.light_&]:hover:bg-emerald-50',
      onClick: () => onPublish && onPublish(event),
    })
    if (includeEdit) {
      items.push({
        key: 'edit',
        label: 'Chỉnh sửa sự kiện',
        icon: Edit,
        className: 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
        onClick: () => {
          if (onEdit) onEdit(event)
          else navigate(`/organizer/events/${event.id}/edit`)
        },
      })
    }
    items.push({
      key: 'view-public',
      label: 'Xem trang sự kiện',
      icon: ExternalLink,
      className: 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 [html.light_&]:text-cyan-600 [html.light_&]:hover:bg-cyan-50',
      onClick: () => window.open(eventPublicUrl, '_blank'),
    })
  } else if (ended) {
    // 5. Đã kết thúc: Nghiệp vụ hậu kỳ (Báo cáo vé, Người tham gia, Check-in, Xem lại - Không cho phép chỉnh sửa)
    items.push({
      key: 'reports',
      label: 'Báo cáo doanh thu & vé',
      icon: BarChart3,
      className: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 [html.light_&]:text-emerald-600 [html.light_&]:hover:bg-emerald-50',
      onClick: () => navigate(`/organizer/ticket-sales?eventId=${event.id}`),
    })
    items.push({
      key: 'attendees',
      label: 'Danh sách người tham gia',
      icon: Users,
      className: 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 [html.light_&]:text-sky-600 [html.light_&]:hover:bg-sky-50',
      onClick: () => navigate(`/organizer/attendees?eventId=${event.id}`),
    })
    items.push({
      key: 'checkin',
      label: 'Thống kê Check-in',
      icon: QrCode,
      className: 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 [html.light_&]:text-purple-600 [html.light_&]:hover:bg-purple-50',
      onClick: () => navigate(`/organizer/checkin-dashboard?eventId=${event.id}`),
    })
    items.push({
      key: 'view-public',
      label: 'Xem trang sự kiện',
      icon: ExternalLink,
      className: 'text-slate-300 hover:text-white hover:bg-white/10 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-[#F8F3EA]',
      onClick: () => window.open(eventPublicUrl, '_blank'),
    })
  } else if (isCancelled) {
    // 6. Đã hủy: Xem danh sách đơn hàng / hoàn tiền, Xem trang sự kiện
    items.push({
      key: 'orders',
      label: 'Danh sách đơn hàng',
      icon: Users,
      className: 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 [html.light_&]:text-sky-600 [html.light_&]:hover:bg-sky-50',
      onClick: () => navigate(`/organizer/orders?eventId=${event.id}`),
    })
    items.push({
      key: 'view-public',
      label: 'Xem trang sự kiện',
      icon: ExternalLink,
      className: 'text-slate-300 hover:text-white hover:bg-white/10 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-[#F8F3EA]',
      onClick: () => window.open(eventPublicUrl, '_blank'),
    })
  } else if (isSuspended) {
    // 7. Bị đình chỉ bởi Admin: Chỉnh sửa để điều chỉnh theo yêu cầu, Xem trang sự kiện
    if (includeEdit) {
      items.push({
        key: 'edit',
        label: 'Chỉnh sửa sự kiện',
        icon: Edit,
        className: 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
        onClick: () => {
          if (onEdit) onEdit(event)
          else navigate(`/organizer/events/${event.id}/edit`)
        },
      })
    }
    items.push({
      key: 'view-public',
      label: 'Xem trang sự kiện',
      icon: ExternalLink,
      className: 'text-slate-300 hover:text-white hover:bg-white/10 [html.light_&]:text-slate-700 [html.light_&]:hover:bg-[#F8F3EA]',
      onClick: () => window.open(eventPublicUrl, '_blank'),
    })
  } else if (isLive) {
    // 8. Đang hoạt động: Chỉnh sửa -> Ẩn/Hiện -> Dừng/Mở bán -> Báo cáo -> Danh sách -> Xem trang -> Hủy
    if (includeEdit) {
      items.push({
        key: 'edit',
        label: 'Chỉnh sửa sự kiện',
        icon: Edit,
        className: 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
        onClick: () => {
          if (onEdit) onEdit(event)
          else navigate(`/organizer/events/${event.id}/edit`)
        },
      })
    }

    // Ẩn / Hiện
    items.push({
      key: 'hide',
      label: isHidden ? 'Hiện lại sự kiện' : 'Tạm ẩn sự kiện',
      icon: isHidden ? ArchiveRestore : Archive,
      className: isHidden
        ? 'text-primary hover:text-primary-hover hover:bg-primary/10 [html.light_&]:text-[#C99A47] [html.light_&]:hover:bg-[#FAF4EB]'
        : 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
      onClick: () => onToggleHide && onToggleHide(event),
    })

    // Dừng / Mở bán vé
    items.push({
      key: 'sales',
      label: isPaused ? 'Mở bán lại vé' : 'Tạm dừng bán vé',
      icon: isPaused ? PlayCircle : PauseCircle,
      className: isPaused
        ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 [html.light_&]:text-emerald-600 [html.light_&]:hover:bg-emerald-50'
        : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 [html.light_&]:text-amber-600 [html.light_&]:hover:bg-amber-50',
      onClick: () => {
        if (isPaused && isHidden) {
          toast.warning('Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.')
          return
        }
        if (onToggleSales) onToggleSales(event)
      },
    })

    // Báo cáo bán vé
    items.push({
      key: 'reports',
      label: 'Báo cáo doanh thu & vé',
      icon: BarChart3,
      className: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 [html.light_&]:text-emerald-600 [html.light_&]:hover:bg-emerald-50',
      onClick: () => navigate(`/organizer/ticket-sales?eventId=${event.id}`),
    })

    // Danh sách người tham gia
    items.push({
      key: 'attendees',
      label: 'Danh sách người tham gia',
      icon: Users,
      className: 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 [html.light_&]:text-sky-600 [html.light_&]:hover:bg-sky-50',
      onClick: () => navigate(`/organizer/attendees?eventId=${event.id}`),
    })

    // Xem trang sự kiện
    items.push({
      key: 'view-public',
      label: 'Xem trang sự kiện',
      icon: ExternalLink,
      className: 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 [html.light_&]:text-cyan-600 [html.light_&]:hover:bg-cyan-50',
      onClick: () => window.open(eventPublicUrl, '_blank'),
    })

    // Hủy sự kiện / Yêu cầu hủy sự kiện (xếp cuối cùng)
    const hasPaid = Number(event.paid_orders_count || 0) > 0
    items.push({
      key: 'cancel',
      label: hasPaid ? 'Yêu cầu hủy sự kiện' : 'Hủy sự kiện',
      icon: AlertTriangle,
      className: 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 [html.light_&]:text-rose-600 [html.light_&]:hover:bg-rose-50',
      onClick: () => onCancel && onCancel(event),
    })
  }

  // Nếu không có bất kỳ hành động nào khả dụng, không hiển thị dropdown
  if (items.length === 0) {
    return null
  }

  const toggleDropdown = (e) => {
    e.stopPropagation()
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuWidth = 205
      let left = rect.right - menuWidth
      if (left < 10) left = 10
      if (left + menuWidth > window.innerWidth - 10) {
        left = window.innerWidth - menuWidth - 10
      }

      const menuHeight = items.length * 38 + 16
      let top = rect.bottom + 6
      if (top + menuHeight > window.innerHeight - 10) {
        top = Math.max(10, rect.top - menuHeight - 6)
      }

      setCoords({ top, left })
    }
    setIsOpen((prev) => !prev)
  }

  // Close on scroll or window resize
  useEffect(() => {
    if (!isOpen) return
    const handleClose = () => setIsOpen(false)
    window.addEventListener('resize', handleClose)
    window.addEventListener('scroll', handleClose, true)
    return () => {
      window.removeEventListener('resize', handleClose)
      window.removeEventListener('scroll', handleClose, true)
    }
  }, [isOpen])

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          ref={triggerRef}
          onClick={toggleDropdown}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/20 bg-[#0d172e] px-3.5 text-xs font-bold text-slate-100 shadow-md transition hover:border-[#C99A47]/60 hover:bg-[#132247] hover:text-[#E6C17A] active:scale-95 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/40 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#FAF4EB]"
          title="Tác vụ sự kiện"
        >
          <span>{label}</span>
          <ChevronDown className={`size-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
        </button>
      ) : (
        <button
          type="button"
          ref={triggerRef}
          onClick={toggleDropdown}
          title="Tác vụ"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border-soft/40 bg-panel-soft text-subtle transition-colors hover:border-primary/40 hover:bg-tertiary/15 hover:text-primary active:scale-95"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[999] bg-transparent"
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
              }}
            />
            <div
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
              }}
              className="z-[1000] min-w-[205px] overflow-hidden rounded-xl border border-white/20 bg-[#0d172e] p-1.5 shadow-2xl shadow-black/90 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-xl"
            >
              <div className="py-0.5">
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsOpen(false)
                      item.onClick()
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${item.className}`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
