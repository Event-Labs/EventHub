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

  const ended = isEventEnded(event)
  const isHidden = event?.display_state === 'HIDDEN_BY_ORGANIZER' || event?.status === 'HIDDEN'
  const isPaused = event?.sales_status === 'PAUSED'

  // Build items list
  const items = []

  // 1. Chỉnh sửa
  if (includeEdit) {
    items.push({
      key: 'edit',
      label: 'Chỉnh sửa sự kiện',
      icon: Edit,
      className: 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
      onClick: () => {
        if (onEdit) {
          onEdit(event)
        } else {
          navigate(`/organizer/events/${event.id}/edit`)
        }
      },
    })
  }

  // 2. Hide / Unhide, Pause / Resume, Cancel (for published/hidden events)
  if (!ended && (event.status === 'PUBLISHED' || event.status === 'HIDDEN' || event.display_state === 'HIDDEN_BY_ORGANIZER')) {
    // Hide / Unhide
    if (event.display_state !== 'SUSPENDED_BY_ADMIN') {
      items.push({
        key: 'hide',
        label: event.display_state === 'HIDDEN_BY_ORGANIZER' ? 'Hiện lại sự kiện' : 'Tạm ẩn sự kiện',
        icon: event.display_state === 'HIDDEN_BY_ORGANIZER' ? ArchiveRestore : Archive,
        className: event.display_state === 'HIDDEN_BY_ORGANIZER'
          ? 'text-primary hover:text-primary-hover hover:bg-primary/10 [html.light_&]:text-[#C99A47] [html.light_&]:hover:bg-[#FAF4EB]'
          : 'text-slate-200 hover:text-white hover:bg-white/10 [html.light_&]:text-[#1B365D] [html.light_&]:hover:bg-[#F8F3EA]',
        onClick: () => onToggleHide && onToggleHide(event),
      })

      // Pause / Resume Sales
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

      // Cancel / Withdraw
      if (event.cancel_request?.status === 'PENDING') {
        items.push({
          key: 'withdraw-cancel',
          label: 'Rút lại yêu cầu hủy',
          icon: RotateCcw,
          className: 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 [html.light_&]:text-amber-600 [html.light_&]:hover:bg-amber-50',
          onClick: () => onWithdrawCancel && onWithdrawCancel(event),
        })
      } else {
        const hasPaid = Number(event.paid_orders_count || 0) > 0
        items.push({
          key: 'cancel',
          label: hasPaid ? 'Yêu cầu hủy sự kiện' : 'Hủy sự kiện',
          icon: AlertTriangle,
          className: 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 [html.light_&]:text-rose-600 [html.light_&]:hover:bg-rose-50',
          onClick: () => onCancel && onCancel(event),
        })
      }
    }
  }

  // 3. Publish (Approved completed event)
  if (!ended && event.status === 'COMPLETED' && event.approval_status === 'APPROVED') {
    items.push({
      key: 'publish',
      label: 'Xuất bản sự kiện',
      icon: Globe,
      className: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 [html.light_&]:text-emerald-600 [html.light_&]:hover:bg-emerald-50',
      onClick: () => onPublish && onPublish(event),
    })
  }

  // 4. Delete draft
  if (event.status === 'DRAFT') {
    items.push({
      key: 'delete-draft',
      label: 'Xóa bản nháp',
      icon: Trash2,
      className: 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 [html.light_&]:text-rose-600 [html.light_&]:hover:bg-rose-50',
      onClick: () => onDelete && onDelete(event),
    })
  }

  const toggleDropdown = (e) => {
    e.stopPropagation()
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuWidth = 195
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
              className="z-[1000] min-w-[195px] overflow-hidden rounded-xl border border-white/20 bg-[#0d172e] p-1.5 shadow-2xl shadow-black/90 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 [html.light_&]:bg-white [html.light_&]:border-[#C99A47]/30 [html.light_&]:shadow-xl"
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
