import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, Plus, Power, Trash2, X } from 'lucide-react'
import {
  createAdminSubscription,
  deleteAdminSubscription,
  fetchAdminSubscriptions,
  updateAdminSubscription,
} from '@/services/subscriptions.js'
import { Badge, Page, Panel, Table } from './AdminComponents.jsx'

const primaryActionClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0'

const emptyForm = {
  name: '',
  description: '',
  price: 0,
  duration_days: 30,
  event_limit: 0,
  staff_limit: 0,
  analytics_enabled: false,
  priority_support: false,
  is_active: true,
  featuresText: '',
}

export function AdminPlansPage() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)

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
      refreshPlans()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminSubscription,
    onSuccess: refreshPlans,
  })

  const openCreate = () => {
    setForm(emptyForm)
    setModal({ mode: 'create' })
  }

  const openEdit = (plan) => {
    setForm({
      name: plan.name || '',
      description: plan.description || '',
      price: plan.price || 0,
      duration_days: plan.duration_days || 30,
      event_limit: plan.event_limit || 0,
      staff_limit: plan.staff_limit || 0,
      analytics_enabled: Boolean(plan.analytics_enabled),
      priority_support: Boolean(plan.priority_support),
      is_active: Boolean(plan.is_active),
      featuresText: Array.isArray(plan.features) ? plan.features.join('\n') : '',
    })
    setModal({ mode: 'edit', item: plan })
  }

  const submitForm = (event) => {
    event.preventDefault()
    saveMutation.mutate({
      id: modal?.item?.id,
      payload: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price || 0),
        duration_days: Number(form.duration_days || 30),
        event_limit: Number(form.event_limit || 0),
        staff_limit: Number(form.staff_limit || 0),
        analytics_enabled: form.analytics_enabled,
        priority_support: form.priority_support,
        is_active: form.is_active,
        features: form.featuresText
          .split('\n')
          .map((feature) => feature.trim())
          .filter(Boolean),
      },
    })
  }

  const isBusy = saveMutation.isPending || deleteMutation.isPending

  return (
    <Page
      title="Gói dịch vụ"
      description="Quản lý các gói đăng ký dành cho Organizer"
      action="Thêm gói"
      actionClassName={primaryActionClass}
      actionIcon={Plus}
      onAction={openCreate}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Tổng số gói" value={plans.length} accent="bg-[#0057c2]" />
        <Metric
          label="Đang hoạt động"
          value={plans.filter((plan) => plan.is_active).length}
          accent="bg-green-600"
        />
        <Metric
          label="Người đăng ký"
          value={plans.reduce((total, plan) => total + Number(plan.subscriber_count || 0), 0)}
          accent="bg-tertiary"
        />
      </div>

      <div className="mt-6">
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
            headers={['Tên gói', 'Giá', 'Giới hạn', 'Tính năng', 'Người đăng ký', 'Trạng thái', 'Hành động']}
            rows={plans.map((plan) => [
              <span key="name" className="font-extrabold">{plan.name}</span>,
              formatMoney(plan.price),
              `${plan.duration_days} ngày / ${plan.event_limit} sự kiện / ${plan.staff_limit} nhân sự`,
              [
                plan.analytics_enabled ? 'Phân tích dữ liệu' : null,
                plan.priority_support ? 'Hỗ trợ ưu tiên' : null,
                ...(Array.isArray(plan.features) ? plan.features : []),
              ].filter(Boolean).join(', ') || 'Chưa có',
              Number(plan.subscriber_count || 0),
              <Badge key="status" tone={plan.is_active ? 'green' : 'blue'}>
                {plan.is_active ? 'Đang hoạt động' : 'Tạm tắt'}
              </Badge>,
              <div key="actions" className="flex items-center gap-2">
                <IconButton title="Sửa" icon={Edit3} disabled={isBusy} onClick={() => openEdit(plan)} />
                <IconButton
                  title="Bật/tắt trạng thái"
                  icon={Power}
                  disabled={isBusy}
                  onClick={() => saveMutation.mutate({ id: plan.id, payload: { is_active: !plan.is_active } })}
                />
                <IconButton
                  title="Xóa"
                  icon={Trash2}
                  danger
                  disabled={isBusy}
                  onClick={() => deleteMutation.mutate(plan.id)}
                />
              </div>,
            ])}
          />
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
          <form
            onSubmit={submitForm}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-[#c3c6d7] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-extrabold text-[#111827]">
                {modal.mode === 'edit' ? 'Cập nhật gói dịch vụ' : 'Thêm gói dịch vụ'}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="grid size-9 place-items-center rounded-md text-[#434655] hover:bg-[#f2f4f6]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextInput label="Tên gói" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
              <TextInput type="number" min="0" step="1000" label="Giá" value={form.price} onChange={(price) => setForm({ ...form, price })} />
              <TextInput type="number" min="1" label="Thời hạn (ngày)" value={form.duration_days} onChange={(duration_days) => setForm({ ...form, duration_days })} />
              <TextInput type="number" min="0" label="Giới hạn sự kiện" value={form.event_limit} onChange={(event_limit) => setForm({ ...form, event_limit })} />
              <TextInput type="number" min="0" label="Giới hạn nhân sự" value={form.staff_limit} onChange={(staff_limit) => setForm({ ...form, staff_limit })} />
            </div>

            <TextareaInput label="Mô tả" value={form.description} onChange={(description) => setForm({ ...form, description })} />
            <TextareaInput label="Tính năng, mỗi dòng một mục" value={form.featuresText} onChange={(featuresText) => setForm({ ...form, featuresText })} />

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Checkbox label="Phân tích dữ liệu" checked={form.analytics_enabled} onChange={(analytics_enabled) => setForm({ ...form, analytics_enabled })} />
              <Checkbox label="Hỗ trợ ưu tiên" checked={form.priority_support} onChange={(priority_support) => setForm({ ...form, priority_support })} />
              <Checkbox label="Đang hoạt động" checked={form.is_active} onChange={(is_active) => setForm({ ...form, is_active })} />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#e0e3e5] pt-4">
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

function TextInput({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 text-sm font-semibold outline-none focus:border-primary"
        {...props}
      />
    </label>
  )
}

function TextareaInput({ label, value, onChange }) {
  return (
    <label className="mt-4 block">
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-none rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 py-3 text-sm outline-none focus:border-primary"
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

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value || 0))
}
