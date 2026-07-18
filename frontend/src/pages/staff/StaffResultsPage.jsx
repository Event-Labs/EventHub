import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Search, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchStaffTicket } from '@/services/tickets.js'
import { Badge, StaffPanel } from './StaffComponents.jsx'

const STATUS_CONFIG = {
  VALID: {
    tone: 'green',
    icon: CheckCircle2,
    title: 'Vé hợp lệ',
    subtitle: 'Vé chưa được soát và có thể tiếp tục xử lý.',
    label: 'Chưa soát vé',
    badgeTone: 'blue',
  },
  USED: {
    tone: 'green',
    icon: CheckCircle2,
    title: 'Đã soát vé',
    subtitle: 'Hệ thống đã ghi nhận vé này vào cổng.',
    label: 'Đã soát vé',
    badgeTone: 'green',
  },
  CANCELLED: {
    tone: 'red',
    icon: XCircle,
    title: 'Vé không còn hiệu lực',
    subtitle: 'Vé đã bị hủy hoặc hoàn tiền.',
    label: 'Đã hủy',
    badgeTone: 'red',
  },
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  return new Date(value).toLocaleString('vi-VN')
}

export function TicketResultPage() {
  const [searchParams] = useSearchParams()
  const ticketId = searchParams.get('ticket_id') || ''
  const ticketQuery = useQuery({
    queryKey: ['staff-ticket-result', ticketId],
    queryFn: () => fetchStaffTicket(ticketId),
    enabled: Boolean(ticketId),
  })

  if (!ticketId) {
    return (
      <EmptyResult
        title="Chưa chọn vé"
        message="Hãy quét mã QR hoặc tìm vé thủ công để xem dữ liệu vé."
      />
    )
  }

  if (ticketQuery.isLoading) {
    return <StaffPanel>Đang tải dữ liệu vé...</StaffPanel>
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <EmptyResult
        title="Không thể tải vé"
        message={ticketQuery.error?.response?.data?.message || 'Không tìm thấy vé hoặc bạn không có quyền xem vé này.'}
        error
      />
    )
  }

  const ticket = ticketQuery.data
  const config = STATUS_CONFIG[ticket.status] || {
    tone: 'yellow',
    icon: AlertTriangle,
    title: 'Trạng thái vé chưa xác định',
    subtitle: 'Vui lòng kiểm tra lại với ban tổ chức.',
    label: 'Chưa xác định',
    badgeTone: 'yellow',
  }

  return (
    <ResultShell tone={config.tone} icon={config.icon} title={config.title} subtitle={config.subtitle}>
      <TicketInfo ticket={ticket} statusConfig={config} />
      {ticket.status === 'USED' && (
        <StaffPanel className="mt-5">
          <h3 className="font-bold text-content">Thông tin soát vé</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Info label="Thời gian" value={formatDateTime(ticket.checked_in_at)} />
            <Info label="Nhân sự thực hiện" value={ticket.checked_in_by?.name || ticket.checked_in_by?.email || 'Chưa xác định'} />
          </div>
        </StaffPanel>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/staff/qr-check-in" className="admin-primary">Quét vé khác</Link>
        <Link to="/staff/manual-check-in" className="admin-secondary"><Search className="size-4" />Tìm vé thủ công</Link>
      </div>
    </ResultShell>
  )
}

function EmptyResult({ title, message, error = false }) {
  const Icon = error ? XCircle : Search
  return (
    <StaffPanel className="mx-auto max-w-2xl py-12 text-center">
      <Icon className={`mx-auto size-12 ${error ? 'text-error' : 'text-muted'}`} />
      <h1 className="mt-4 font-display text-2xl font-extrabold text-content">{title}</h1>
      <p className="mt-3 text-sm text-subtle">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/staff/qr-check-in" className="admin-primary">Quét mã QR</Link>
        <Link to="/staff/manual-check-in" className="admin-secondary">Tìm vé thủ công</Link>
      </div>
    </StaffPanel>
  )
}

function ResultShell({ tone, icon: Icon, title, subtitle, children }) {
  const colors = {
    green: 'bg-success text-white',
    red: 'bg-error text-white',
    yellow: 'bg-warning text-slate-950',
  }
  return (
    <div className="mx-auto max-w-5xl">
      <div className={`rounded-t-2xl p-8 text-center ${colors[tone] || colors.yellow}`}>
        <Icon className="mx-auto size-14" />
        <h1 className="mt-4 text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm opacity-90">{subtitle}</p>
      </div>
      <div className="rounded-b-2xl border border-t-0 border-border-soft/30 bg-surface/80 p-6 text-content shadow-[0_4px_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
        {children}
      </div>
    </div>
  )
}

function TicketInfo({ ticket, statusConfig }) {
  return (
    <StaffPanel>
      <div className="grid gap-5 md:grid-cols-2">
        <Info label="Mã vé" value={ticket.ticket_code} />
        <Info label="Trạng thái" value={<Badge tone={statusConfig.badgeTone}>{statusConfig.label}</Badge>} />
        <Info label="Sự kiện" value={ticket.event?.title || 'Chưa cập nhật'} />
        <Info label="Người tham dự" value={ticket.attendee_name || ticket.buyer?.name || 'Chưa cập nhật'} />
        <Info label="Loại vé" value={ticket.ticket_type?.name || 'Chưa cập nhật'} />
        <Info label="Suất diễn" value={ticket.session?.name || formatDateTime(ticket.session?.start_time)} />
        <Info label="Mã đơn hàng" value={ticket.order?.order_code || 'Chưa cập nhật'} />
        <Info label="Email người mua" value={ticket.buyer?.email || 'Chưa cập nhật'} />
      </div>
    </StaffPanel>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <div className="mt-1 font-bold text-content">{value}</div>
    </div>
  )
}
