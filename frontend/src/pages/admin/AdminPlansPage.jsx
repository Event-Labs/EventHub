import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, Plus, Power, Trash2, X } from 'lucide-react'
import {
  createAdminSubscription,
  deleteAdminSubscription,
  fetchAdminSubscriptions,
  updateAdminSubscription,
} from '@/services/subscriptions.js'
import { Page, Panel, Table } from './AdminComponents.jsx'

const primaryActionClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0'

const emptyForm = {
  name: '',
  price: '',
  event_limit: '',
  staff_limit: '',
  max_active_events: '',
  max_tickets_per_event: '',
  max_staff_per_event: '',
  max_ticket_types_per_event: '',
  max_promo_codes_per_event: '',
  promo_code_enabled: false,
  seat_map_enabled: false,
  manual_checkin_enabled: false,
  attendee_export_enabled: false,
  analytics_enabled: false,
  advanced_analytics_enabled: false,
  ai_report_enabled: false,
  custom_branding_enabled: false,
  priority_support: false,
  is_active: true,
}

const booleanFields = [
  ['promo_code_enabled', 'Hỗ trợ mã giảm giá'],
  ['seat_map_enabled', 'Sơ đồ ghế'],
  ['manual_checkin_enabled', 'Check-in thủ công'],
  ['attendee_export_enabled', 'Xuất danh sách tham dự'],
  ['analytics_enabled', 'Thống kê cơ bản'],
  ['advanced_analytics_enabled', 'Phân tích nâng cao'],
  ['ai_report_enabled', 'Báo cáo AI'],
  ['custom_branding_enabled', 'Tùy chỉnh thương hiệu'],
  ['priority_support', 'Hỗ trợ ưu tiên'],
]

export function AdminPlansPage() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const plansQuery = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: fetchAdminSubscriptions,
  })

  const plans = plansQuery.data || []

  const refreshPlans = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? updateAdminSubscription(id, payload) : createAdminSubscription(payload),
    onSuccess: () => {
      setModal(null)
      setForm(emptyForm)
      setFormError('')
      setActionError('')
      refreshPlans()
    },
    onError: (error) => {
      const message = getApiErrorMessage(error, 'Không thể lưu gói dịch vụ. Vui lòng kiểm tra lại thông tin.')
      if (modal) {
        setFormError(message)
      } else {
        setActionError(message)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminSubscription,
    onSuccess: () => {
      setActionError('')
      setDeleteTarget(null)
      refreshPlans()
    },
    onError: (error) => {
      setActionError(getApiErrorMessage(error, 'Không thể xóa gói dịch vụ. Vui lòng thử lại.'))
    },
  })

  const busy = plansQuery.isFetching || saveMutation.isPending || deleteMutation.isPending

  const openCreate = () => {
    setForm(emptyForm)
    setFormError('')
    setModal({ mode: 'create' })
  }

  const openEdit = (plan) => {
    setForm({
      name: plan.name || '',
      price: String(plan.price ?? ''),
      event_limit: String(plan.event_limit ?? ''),
      staff_limit: String(plan.staff_limit ?? ''),
      max_active_events: String(plan.max_active_events ?? ''),
      max_tickets_per_event: String(plan.max_tickets_per_event ?? ''),
      max_staff_per_event: String(plan.max_staff_per_event ?? ''),
      max_ticket_types_per_event: String(plan.max_ticket_types_per_event ?? ''),
      max_promo_codes_per_event: String(plan.max_promo_codes_per_event ?? ''),
      promo_code_enabled: Boolean(plan.promo_code_enabled),
      seat_map_enabled: Boolean(plan.seat_map_enabled),
      manual_checkin_enabled: Boolean(plan.manual_checkin_enabled),
      attendee_export_enabled: Boolean(plan.attendee_export_enabled),
      analytics_enabled: Boolean(plan.analytics_enabled),
      advanced_analytics_enabled: Boolean(plan.advanced_analytics_enabled),
      ai_report_enabled: Boolean(plan.ai_report_enabled),
      custom_branding_enabled: Boolean(plan.custom_branding_enabled),
      priority_support: Boolean(plan.priority_support),
      is_active: Boolean(plan.is_active),
    })
    setFormError('')
    setModal({ mode: 'edit', item: plan })
  }

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submitForm = (event) => {
    event.preventDefault()
    setFormError('')
    saveMutation.mutate({
      id: modal?.item?.id,
      payload: toPayload(form),
    })
  }

  const handleDelete = (plan) => {
    setActionError('')
    setDeleteTarget(plan)
  }

  return (
    <Page
      title="Gói dịch vụ"
      description="Quản lý quota và quyền tính năng dành cho Organizer"
      action="Thêm gói"
      actionClassName={primaryActionClass}
      actionIcon={Plus}
      onAction={openCreate}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Tổng số gói" value={plans.length} accent="bg-[#0057c2]" />
        <Metric
          label="Người đăng ký"
          value={plans.reduce((total, plan) => total + Number(plan.subscriber_count || 0), 0)}
          accent="bg-green-600"
        />
        <Metric
          label="Gói đang hiển thị"
          value={plans.filter((plan) => plan.is_active).length}
          accent="bg-tertiary"
        />
      </div>

      <div className="mt-6">
        {actionError && (
          <Panel className="mb-4 border-error/30 bg-error/10">
            <p className="text-sm font-semibold text-error">{actionError}</p>
          </Panel>
        )}

        {plansQuery.isLoading && (
          <Panel>
            <p className="text-sm font-semibold text-[#434655]">Đang tải gói dịch vụ...</p>
          </Panel>
        )}

        {plansQuery.isError && (
          <Panel>
            <p className="text-sm font-semibold text-error">Không thể tải danh sách gói dịch vụ.</p>
          </Panel>
        )}

        {!plansQuery.isLoading && !plansQuery.isError && (
          <Table
            headers={['Tên gói', 'Giá', 'Giới hạn tổng', 'Giới hạn/sự kiện', 'Tính năng', 'Trạng thái', 'Người đăng ký', 'Hành động']}
            rows={plans.map((plan) => [
              <span key="name" className="font-extrabold">{plan.name}</span>,
              formatMoney(plan.price),
              <Stack key="total" items={[
                `${limitText(plan.event_limit)} sự kiện`,
                `${limitText(plan.max_active_events)} sự kiện hoạt động`,
                `${limitText(plan.staff_limit)} staff tổng`,
              ]} />,
              <Stack key="event" items={[
                `${limitText(plan.max_tickets_per_event)} vé`,
                `${limitText(plan.max_staff_per_event)} staff`,
                `${limitText(plan.max_ticket_types_per_event)} loại vé`,
                plan.promo_code_enabled
                  ? `${limitText(plan.max_promo_codes_per_event)} mã giảm giá`
                  : 'Không hỗ trợ mã giảm giá',
              ]} />,
              <FeatureList key="features" plan={plan} />,
              <StatusPill key="status" active={plan.is_active} />,
              Number(plan.subscriber_count || 0),
              <div key="actions" className="flex items-center gap-2">
                <IconButton title="Sửa" icon={Edit3} disabled={busy} onClick={() => openEdit(plan)} />
                <IconButton
                  title={plan.is_active ? 'Tạm ẩn' : 'Hiện lại'}
                  icon={Power}
                  disabled={busy}
                  onClick={() => {
                    setActionError('')
                    saveMutation.mutate({ id: plan.id, payload: { is_active: !plan.is_active } })
                  }}
                />
                <IconButton title="Xóa" icon={Trash2} danger disabled={busy} onClick={() => handleDelete(plan)} />
              </div>,
            ])}
          />
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
          <form
            onSubmit={submitForm}
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-[#c3c6d7] bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e0e3e5] bg-white px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold text-[#111827]">
                  {modal.mode === 'edit' ? 'Cập nhật gói dịch vụ' : 'Thêm gói dịch vụ'}
                </h3>
              </div>
              <button type="button" onClick={() => setModal(null)} className="grid size-9 place-items-center rounded-md text-[#434655] hover:bg-[#f2f4f6]">
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <FormSection title="Thông tin gói">
                <TextInput label="Tên gói" value={form.name} onChange={(name) => updateField('name', name)} required />
                <TextInput inputMode="numeric" label="Giá gói" value={form.price} onChange={(price) => updateField('price', onlyNumberText(price))} placeholder="0" />
              </FormSection>

              <FormSection title="Giới hạn tổng của organizer">
                <TextInput inputMode="numeric" label="Tổng số sự kiện" value={form.event_limit} onChange={(value) => updateField('event_limit', onlyNumberText(value))} placeholder="0" />
                <TextInput inputMode="numeric" label="Sự kiện hoạt động cùng lúc" value={form.max_active_events} onChange={(value) => updateField('max_active_events', onlyNumberText(value))} placeholder="0" />
                <TextInput inputMode="numeric" label="Tổng staff" value={form.staff_limit} onChange={(value) => updateField('staff_limit', onlyNumberText(value))} placeholder="0" />
              </FormSection>

              <FormSection title="Giới hạn cho mỗi sự kiện">
                <TextInput inputMode="numeric" label="Vé/sự kiện" value={form.max_tickets_per_event} onChange={(value) => updateField('max_tickets_per_event', onlyNumberText(value))} placeholder="0" />
                <TextInput inputMode="numeric" label="Staff/sự kiện" value={form.max_staff_per_event} onChange={(value) => updateField('max_staff_per_event', onlyNumberText(value))} placeholder="0" />
                <TextInput inputMode="numeric" label="Loại vé/sự kiện" value={form.max_ticket_types_per_event} onChange={(value) => updateField('max_ticket_types_per_event', onlyNumberText(value))} placeholder="0" />
                <TextInput inputMode="numeric" label="Mã giảm giá/sự kiện" value={form.max_promo_codes_per_event} onChange={(value) => updateField('max_promo_codes_per_event', onlyNumberText(value))} placeholder="0" disabled={!form.promo_code_enabled} />
              </FormSection>

              <section className="rounded-md border border-[#e0e3e5] bg-[#f7f9fb] p-4">
                <h4 className="text-sm font-extrabold uppercase text-[#434655]">Tính năng</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {booleanFields.map(([field, label]) => (
                    <Checkbox
                      key={field}
                      label={label}
                      checked={form[field]}
                      onChange={(checked) => updateField(field, checked)}
                    />
                  ))}
                </div>
              </section>

              {formError && (
                <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-[#e0e3e5] bg-white px-5 py-4">
              <button type="button" onClick={() => setModal(null)} className="admin-secondary">
                Hủy
              </button>
              <button type="submit" disabled={saveMutation.isPending} className={primaryActionClass}>
                {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-[#c3c6d7] bg-white p-5 text-[#111827] shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold">Xóa gói dịch vụ?</h3>
                <p className="mt-2 text-sm font-semibold text-[#434655]">
                  Gói "{deleteTarget.name}" sẽ được đánh dấu đã xóa và ẩn khỏi danh sách quản lý.
                </p>
              </div>
              <button type="button" onClick={() => setDeleteTarget(null)} className="grid size-9 place-items-center rounded-md text-[#434655] hover:bg-[#f2f4f6]">
                <X className="size-4" />
              </button>
            </div>

            {actionError && (
              <p className="mt-4 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error">
                {actionError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t border-[#e0e3e5] pt-4">
              <button type="button" onClick={() => setDeleteTarget(null)} className="admin-secondary">
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-error px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}

function Metric({ label, value, accent }) {
  return (
    <Panel className="group relative min-h-32 overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div>
        <p className="text-sm font-extrabold text-[#434655]">{label}</p>
        <p className="mt-5 text-4xl font-black leading-none text-[#111827]">{value}</p>
      </div>
    </Panel>
  )
}

function FormSection({ title, children }) {
  return (
    <section className="rounded-md border border-[#e0e3e5] bg-white p-4">
      <h4 className="text-sm font-extrabold uppercase text-[#434655]">{title}</h4>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

function TextInput({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 text-sm font-semibold text-[#111827] placeholder:text-[#737686] outline-none disabled:cursor-not-allowed disabled:bg-[#e9edf2] disabled:text-[#737686] focus:border-primary"
        {...props}
      />
    </label>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 text-sm font-semibold text-[#434655]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  )
}

function IconButton({ icon: Icon, danger = false, ...props }) {
  return (
    <button
      type="button"
      className={`grid size-9 place-items-center rounded-md border transition duration-200 hover:-translate-y-0.5 disabled:opacity-60 ${
        danger
          ? 'border-[#f3b8b8] text-error hover:bg-[#fff1f1]'
          : 'border-[#c3c6d7] text-[#434655] hover:border-primary hover:bg-[#f1fbff] hover:text-primary'
      }`}
      {...props}
    >
      <Icon className="size-4" />
    </button>
  )
}

function Stack({ items }) {
  return (
    <div className="space-y-1 text-xs font-semibold text-[#434655]">
      {items.map((item) => <p key={item}>{item}</p>)}
    </div>
  )
}

function FeatureList({ plan }) {
  const enabled = booleanFields
    .filter(([field]) => Boolean(plan[field]))
    .map(([, label]) => label)

  if (!enabled.length) return <span className="text-sm font-semibold text-[#737686]">Chưa bật tính năng</span>

  return (
    <div className="flex max-w-xs flex-wrap gap-2">
      {enabled.slice(0, 4).map((feature) => (
        <span key={feature} className="rounded-full bg-[#e8f7ff] px-2 py-1 text-xs font-bold text-[#0057c2]">
          {feature}
        </span>
      ))}
      {enabled.length > 4 && (
        <span className="rounded-full bg-[#f2f4f6] px-2 py-1 text-xs font-bold text-[#434655]">
          +{enabled.length - 4}
        </span>
      )}
    </div>
  )
}

function StatusPill({ active }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${
      active ? 'bg-[#e7f8ed] text-[#0f7a3b]' : 'bg-[#f2f4f6] text-[#737686]'
    }`}>
      {active ? 'Đang hiển thị' : 'Tạm ẩn'}
    </span>
  )
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    price: toNumber(form.price, 0),
    event_limit: toNumber(form.event_limit, 0),
    staff_limit: toNumber(form.staff_limit, 0),
    max_active_events: toNumber(form.max_active_events, 0),
    max_tickets_per_event: toNumber(form.max_tickets_per_event, 0),
    max_staff_per_event: toNumber(form.max_staff_per_event, 0),
    max_ticket_types_per_event: toNumber(form.max_ticket_types_per_event, 0),
    max_promo_codes_per_event: form.promo_code_enabled ? toNumber(form.max_promo_codes_per_event, 0) : 0,
    promo_code_enabled: form.promo_code_enabled,
    seat_map_enabled: form.seat_map_enabled,
    manual_checkin_enabled: form.manual_checkin_enabled,
    attendee_export_enabled: form.attendee_export_enabled,
    analytics_enabled: form.analytics_enabled,
    advanced_analytics_enabled: form.advanced_analytics_enabled,
    ai_report_enabled: form.ai_report_enabled,
    custom_branding_enabled: form.custom_branding_enabled,
    priority_support: form.priority_support,
    is_active: form.is_active,
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value || 0))
}

function limitText(value) {
  const number = Number(value || 0)
  return number > 0 ? number.toLocaleString('vi-VN') : 'Không giới hạn'
}

function onlyNumberText(value) {
  return String(value).replace(/[^\d]/g, '')
}

function toNumber(value, fallback) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  const number = Number(normalized)
  return Number.isFinite(number) ? number : fallback
}

function getApiErrorMessage(error, fallback) {
  const data = error?.response?.data
  if (Array.isArray(data?.data) && data.data[0]?.message) {
    return data.data[0].message
  }
  return data?.message || data?.error || fallback
}
