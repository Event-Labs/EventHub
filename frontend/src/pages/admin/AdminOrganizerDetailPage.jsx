import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchAdminOrganizerDetails,
  updateAdminOrganizerStatus,
} from '@/services/adminOrganizers.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Badge, Page, Panel, Status, Table, UserCell } from './AdminComponents.jsx'

const EVENT_STATUS_LABEL = {
  DRAFT: 'Bản nháp',
  PENDING_REVIEW: 'Chờ duyệt',
  PUBLISHED: 'Đã public',
  COMPLETED: 'Đã duyệt',
  CANCELLED: 'Đã hủy',
  HIDDEN: 'Đã ẩn',
}

const REQUEST_STATUS_LABEL = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
}

export function AdminOrganizerDetailPage() {
  const { organizerId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const detailQuery = useQuery({
    queryKey: ['admin-organizers', 'detail', organizerId],
    queryFn: () => fetchAdminOrganizerDetails(organizerId),
    enabled: Boolean(organizerId),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateAdminOrganizerStatus(id, status),
    onSuccess: (_data, variables) => {
      toast.success(variables.status === 'ACTIVE' ? 'Đã kích hoạt lại organizer.' : 'Đã tạm ngưng organizer.')
      queryClient.invalidateQueries({ queryKey: ['admin-organizers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-organizers', 'detail', organizerId] })
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật trạng thái organizer.'))
    },
  })

  const data = detailQuery.data || {}
  const organizer = data.organizer
  const nextStatus = organizer?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'

  if (detailQuery.isLoading) {
    return (
      <Page title="Chi tiết Organizer" description="Đang tải dữ liệu hồ sơ nhà tổ chức...">
        <Panel><p className="text-sm text-subtle">Đang tải chi tiết organizer...</p></Panel>
      </Page>
    )
  }

  if (detailQuery.isError || !organizer) {
    return (
      <Page title="Chi tiết Organizer" description="Không thể tải dữ liệu organizer.">
        <Panel>
          <p className="text-sm text-error">Không thể tải chi tiết organizer. Vui lòng thử lại.</p>
          <button type="button" onClick={() => navigate('/admin/organizers')} className="admin-secondary mt-4">
            Quay lại danh sách
          </button>
        </Panel>
      </Page>
    )
  }

  return (
    <Page
      title={organizer.organization_name}
      description="Toàn bộ thông tin hồ sơ Organizer, chủ tài khoản, gói dịch vụ, thanh toán, yêu cầu đăng ký và sự kiện."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/organizers" className="admin-secondary">
            <ArrowLeft className="size-4" /> Quay lại
          </Link>
          <button
            type="button"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate({ id: organizer.id, status: nextStatus })}
            className={
              organizer.status === 'ACTIVE'
                ? 'admin-primary border-none bg-error text-white hover:bg-error/90 disabled:opacity-50'
                : 'admin-primary disabled:opacity-50'
            }
          >
            {organizer.status === 'ACTIVE' ? <AlertTriangle className="size-4" /> : <ShieldCheck className="size-4" />}
            {nextStatus === 'ACTIVE' ? 'Kích hoạt lại' : 'Tạm ngưng'}
          </button>
        </div>
      }
    >
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-tertiary/15 text-tertiary">
              <Building2 className="size-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-extrabold text-content">{organizer.organization_name}</h2>
                <Status value={organizer.status} />
                {organizer.plan_name ? <Badge tone="blue">{organizer.plan_name}</Badge> : <Badge tone="gray">Chưa có gói</Badge>}
              </div>
              <p className="mt-3 text-sm leading-6 text-subtle">{organizer.description || 'Organizer chưa cập nhật mô tả.'}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="Email doanh nghiệp" value={organizer.business_email || 'Chưa cập nhật'} />
            <Info label="Số điện thoại doanh nghiệp" value={organizer.business_phone || 'Chưa cập nhật'} />
            <Info label="Ngày tạo hồ sơ" value={formatDateTime(organizer.created_at)} />
            <Info label="Cập nhật gần nhất" value={formatDateTime(organizer.updated_at)} />
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-subtle">Chủ tài khoản</h3>
          <div className="mt-4">
            <UserCell
              name={organizer.owner_name || organizer.owner_email}
              email={organizer.owner_email}
              image={organizer.owner_avatar_url}
            />
          </div>
          <div className="mt-5 grid gap-3">
            <Info label="Trạng thái tài khoản" value={organizer.owner_status || 'Không rõ'} />
            <Info label="Email đã xác thực" value={organizer.owner_email_verified ? 'Đã xác thực' : 'Chưa xác thực'} />
            <Info label="Số điện thoại" value={organizer.owner_phone || 'Chưa cập nhật'} />
            <Info label="Địa chỉ" value={[organizer.owner_address, organizer.owner_city].filter(Boolean).join(', ') || 'Chưa cập nhật'} />
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="Tổng sự kiện" value={organizer.total_events} />
        <MiniStat label="Đã public" value={organizer.published_events} />
        <MiniStat label="Đã duyệt chưa public" value={organizer.approved_unpublished_events} />
        <MiniStat label="Đơn đã thanh toán" value={organizer.paid_orders} />
        <MiniStat label="Doanh thu" value={formatCurrency(organizer.gross_revenue)} highlight />
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <Panel>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-subtle">Gói dịch vụ hiện tại</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Tên gói" value={organizer.plan_name || 'Chưa đăng ký gói'} />
            <Info label="Giá gói" value={organizer.plan_price != null ? formatCurrency(organizer.plan_price) : 'Chưa có'} />
            <Info label="Ngày hết hạn" value={formatDateTime(organizer.plan_end_date)} />
            <Info label="Tổng giảm giá đơn hàng" value={formatCurrency(organizer.total_discount)} />
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-subtle">Kênh thanh toán</h3>
          <div className="mt-4 space-y-3">
            {(data.payment_channels || []).length === 0 && <p className="text-sm text-subtle">Chưa cấu hình kênh thanh toán.</p>}
            {(data.payment_channels || []).map((channel) => (
              <div key={channel.id} className="rounded-xl border border-border-soft/30 bg-panel-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-content">{channel.provider || 'PAYOS'}</p>
                  <Badge tone={channel.status === 'ACTIVE' ? 'green' : 'amber'}>{channel.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-subtle">{channel.bank_name || 'Chưa có ngân hàng'} - {channel.bank_account_holder || 'Chưa có chủ tài khoản'}</p>
                <p className="text-xs text-subtle">Số TK: {maskAccount(channel.bank_account_number)}</p>
                <p className="text-xs text-subtle">API key: {channel.has_api_key ? 'Đã cấu hình' : 'Chưa cấu hình'} · Checksum: {channel.has_checksum_key ? 'Đã cấu hình' : 'Chưa cấu hình'}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel className="mt-5">
        <h3 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-subtle">Toàn bộ sự kiện</h3>
        {(data.events || []).length === 0 ? (
          <p className="text-sm text-subtle">Organizer chưa tạo sự kiện nào.</p>
        ) : (
          <Table
            compact
            headers={['Sự kiện', 'Danh mục', 'Thời gian', 'Đơn trả tiền', 'Doanh thu', 'Trạng thái']}
            rows={(data.events || []).map((event) => [
              <div key="event">
                <p className="font-bold text-content">{event.title}</p>
                <p className="text-xs text-subtle">{event.slug}</p>
              </div>,
              <span key="category" className="text-subtle">{event.category_name || 'Chưa phân loại'}</span>,
              <span key="time" className="text-subtle">{formatDate(event.start_time)} - {formatDate(event.end_time)}</span>,
              <span key="orders" className="font-bold text-content">{event.paid_orders || 0}</span>,
              <span key="revenue" className="font-bold text-success">{formatCurrency(event.gross_revenue)}</span>,
              <Badge key="status" tone={event.status === 'PUBLISHED' ? 'green' : 'gray'}>
                {EVENT_STATUS_LABEL[event.status] || event.status}
              </Badge>,
            ])}
          />
        )}
      </Panel>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <Panel>
          <h3 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-subtle">Lịch sử gói dịch vụ</h3>
          <Timeline
            empty="Chưa có lịch sử gói dịch vụ."
            items={(data.subscription_history || []).map((item) => ({
              id: item.id,
              title: item.plan_name,
              badge: item.status,
              meta: `${formatDate(item.start_date)} - ${formatDate(item.end_date)}`,
              description: formatCurrency(item.plan_price),
            }))}
          />
        </Panel>

        <Panel>
          <h3 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-subtle">Lịch sử yêu cầu Organizer</h3>
          <div className="space-y-3">
            {(data.request_history || []).length === 0 && <p className="text-sm text-subtle">Chưa có lịch sử yêu cầu.</p>}
            {(data.request_history || []).map((request) => (
              <div key={request.id} className="rounded-xl border border-border-soft/30 bg-panel-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-content">{request.organization_name}</p>
                  <Badge tone={request.status === 'APPROVED' ? 'green' : request.status === 'REJECTED' ? 'red' : 'amber'}>
                    {REQUEST_STATUS_LABEL[request.status] || request.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-subtle">{request.request_type} · {formatDateTime(request.created_at)}</p>
                <p className="mt-2 text-sm text-subtle">{request.review_note || 'Không có ghi chú duyệt.'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {request.legal_document_url && <DocLink href={request.legal_document_url} label="Đăng ký kinh doanh" />}
                  {request.business_license_url && <DocLink href={request.business_license_url} label="Giấy phép" />}
                  {request.legal_representative_id_url && <DocLink href={request.legal_representative_id_url} label="Đại diện pháp lý" />}
                  {request.individual_id_front_url && <DocLink href={request.individual_id_front_url} label="CCCD mặt trước" />}
                  {request.individual_id_back_url && <DocLink href={request.individual_id_back_url} label="CCCD mặt sau" />}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </Page>
  )
}

function Info({ label, value, strong = false }) {
  return (
    <div className="rounded-xl border border-border-soft/30 bg-panel-soft p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className={`mt-1 break-words text-sm ${strong ? 'font-extrabold text-success' : 'font-semibold text-content'}`}>
        {value || 'Chưa cập nhật'}
      </p>
    </div>
  )
}

function MiniStat({ label, value, highlight = false }) {
  return (
    <Panel className="p-4">
      <p className={`text-xl font-extrabold ${highlight ? 'text-success' : 'text-content'}`}>
        {typeof value === 'string' ? value : Number(value || 0).toLocaleString('vi-VN')}
      </p>
      <p className="mt-1 text-xs font-semibold text-subtle">{label}</p>
    </Panel>
  )
}

function Timeline({ items, empty }) {
  if (!items.length) return <p className="text-sm text-subtle">{empty}</p>
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-border-soft/30 bg-panel-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-content">{item.title}</p>
            <Badge tone={item.badge === 'ACTIVE' ? 'green' : 'gray'}>{item.badge}</Badge>
          </div>
          <p className="mt-1 text-xs text-subtle">{item.meta}</p>
          <p className="mt-2 text-sm font-semibold text-content">{item.description}</p>
        </div>
      ))}
    </div>
  )
}

function DocLink({ href, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border-soft/30 px-2.5 py-1 text-xs font-bold text-tertiary hover:border-tertiary">
      {label} <ExternalLink className="size-3" />
    </a>
  )
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  })
}

function formatDate(value) {
  if (!value) return 'Chưa có'
  return new Date(value).toLocaleDateString('vi-VN')
}

function formatDateTime(value) {
  if (!value) return 'Chưa có'
  return new Date(value).toLocaleString('vi-VN')
}

function maskAccount(value) {
  if (!value) return 'Chưa cập nhật'
  const text = String(value)
  if (text.length <= 4) return text
  return `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`
}
