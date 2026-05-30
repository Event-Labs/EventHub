import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Edit3, Plus, Power, Trash2, X } from 'lucide-react'
import {
  createAdminSubscription,
  deleteAdminSubscription,
  fetchAdminSubscriptions,
  updateAdminSubscription,
} from '@/services/subscriptions.js'
import { Badge, Page, Panel, Table } from './AdminComponents.jsx'

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

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatDuration(days) {
  if (Number(days) === 30) return '30 ngày'
  if (Number(days) === 365) return '1 năm'
  return `${days} ngày`
}

export function AdminPlansPage() {
  const queryClient = useQueryClient()
  const [modalMode, setModalMode] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const plansQuery = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: fetchAdminSubscriptions,
  })

  const plans = plansQuery.data || []
  const activePlans = plans.filter((plan) => plan.is_active)
  const totalSubscribers = plans.reduce((sum, plan) => sum + Number(plan.subscriber_count || 0), 0)
  const monthlyRevenue = plans.reduce(
    (sum, plan) => sum + Number(plan.price || 0) * Number(plan.subscriber_count || 0),
    0,
  )

  const refreshPlans = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
  }

  const createMutation = useMutation({
    mutationFn: createAdminSubscription,
    onSuccess: () => {
      closeModal()
      refreshPlans()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAdminSubscription(id, payload),
    onSuccess: () => {
      closeModal()
      refreshPlans()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminSubscription,
    onSuccess: () => {
      setDeleteTarget(null)
      refreshPlans()
    },
  })

  const openCreate = () => {
    setSelectedPlan(null)
    setForm(emptyForm)
    setModalMode('create')
  }

  const openEdit = (plan) => {
    setSelectedPlan(plan)
    setForm({
      name: plan.name || '',
      description: plan.description || '',
      price: Number(plan.price || 0),
      duration_days: Number(plan.duration_days || 30),
      event_limit: Number(plan.event_limit || 0),
      staff_limit: Number(plan.staff_limit || 0),
      analytics_enabled: Boolean(plan.analytics_enabled),
      priority_support: Boolean(plan.priority_support),
      is_active: Boolean(plan.is_active),
      featuresText: (plan.features || []).join('\n'),
    })
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedPlan(null)
    setForm(emptyForm)
  }

  const buildPayload = () => ({
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
  })

  const submitForm = (event) => {
    event.preventDefault()

    const payload = buildPayload()
    if (modalMode === 'edit' && selectedPlan) {
      updateMutation.mutate({ id: selectedPlan.id, payload })
      return
    }

    createMutation.mutate(payload)
  }

  const toggleActive = (plan) => {
    updateMutation.mutate({
      id: plan.id,
      payload: { is_active: !plan.is_active },
    })
  }

  const mutationError = createMutation.error || updateMutation.error || deleteMutation.error
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <Page
      title="Gói dịch vụ"
      description="Quản lý các subscription plan, giá, thời hạn và quyền lợi."
      action="Thêm gói"
      actionClassName="inline-flex items-center justify-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0"
      actionIcon={Plus}
      onAction={openCreate}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Tổng số gói" value={plans.length} accent="bg-[#0057c2]" />
        <MetricCard label="Đang hoạt động" value={activePlans.length} accent="bg-green-600" />
        <MetricCard label="Người đăng ký" value={totalSubscribers} accent="bg-tertiary" />
      </div>

      <Panel className="mt-6 transition duration-200 hover:border-primary/60 hover:shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase text-[#737686]">Doanh thu ước tính</p>
            <p className="mt-2 text-3xl font-black text-[#111827]">
              {formatCurrency(monthlyRevenue)}
            </p>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#434655]">
            Tính theo giá gói nhân với số organizer đang ACTIVE trong dữ liệu hiện tại.
          </p>
        </div>
      </Panel>

      <div className="mt-6">
        {mutationError && (
          <Panel className="mb-4">
            <p className="text-sm font-semibold text-error">
              Không thể lưu thay đổi. Vui lòng kiểm tra dữ liệu và thử lại.
            </p>
          </Panel>
        )}

        {plansQuery.isLoading && (
          <Panel>
            <p className="text-sm font-semibold text-[#434655]">Đang tải gói dịch vụ...</p>
          </Panel>
        )}

        {plansQuery.isError && (
          <Panel>
            <p className="text-sm font-semibold text-error">
              Không thể tải danh sách gói dịch vụ.
            </p>
          </Panel>
        )}

        {!plansQuery.isLoading && !plansQuery.isError && (
          <Table
            headers={['Gói', 'Giá', 'Thời hạn', 'Giới hạn', 'Quyền lợi', 'Trạng thái', 'Hành động']}
            rows={plans.map((plan) => [
              <div key="name">
                <p className="font-extrabold text-[#111827]">{plan.name}</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-[#737686]">
                  {plan.description || 'Chưa có mô tả'}
                </p>
              </div>,
              <span key="price" className="font-extrabold text-[#111827]">
                {formatCurrency(plan.price)}
              </span>,
              <span key="duration" className="font-bold text-[#434655]">
                {formatDuration(plan.duration_days)}
              </span>,
              <div key="limits" className="text-sm font-semibold text-[#434655]">
                <p>{Number(plan.event_limit) === 0 ? 'Không giới hạn' : `${plan.event_limit} sự kiện`}</p>
                <p>{Number(plan.staff_limit) === 0 ? 'Không giới hạn' : `${plan.staff_limit} nhân sự`}</p>
              </div>,
              <FeatureList key="features" plan={plan} />,
              <Badge key="status" tone={plan.is_active ? 'green' : 'blue'}>
                {plan.is_active ? 'Đang hoạt động' : 'Tạm ẩn'}
              </Badge>,
              <div key="actions" className="flex items-center gap-2">
                <IconButton title="Sửa" onClick={() => openEdit(plan)}>
                  <Edit3 className="size-4" />
                </IconButton>
                <IconButton
                  title={plan.is_active ? 'Tạm ẩn' : 'Kích hoạt'}
                  onClick={() => toggleActive(plan)}
                  disabled={updateMutation.isPending}
                >
                  <Power className="size-4" />
                </IconButton>
                <button
                  type="button"
                  title="Xóa mềm"
                  onClick={() => setDeleteTarget(plan)}
                  disabled={deleteMutation.isPending}
                  className="grid size-9 place-items-center rounded-md border border-[#f3b8b8] text-error transition duration-200 hover:-translate-y-0.5 hover:bg-[#fff1f1] disabled:opacity-60"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>,
            ])}
          />
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
          <form
            onSubmit={submitForm}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-md border border-[#c3c6d7] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-[#737686]">Subscription</p>
                <h3 className="mt-1 text-xl font-extrabold text-[#111827]">
                  {modalMode === 'edit' ? 'Cập nhật gói dịch vụ' : 'Thêm gói dịch vụ'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="grid size-9 place-items-center rounded-md text-[#434655] transition hover:bg-[#f2f4f6]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Tên gói">
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="admin-input"
                />
              </Field>
              <Field label="Giá">
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                  className="admin-input"
                />
              </Field>
              <Field label="Thời hạn (ngày)">
                <input
                  type="number"
                  min="1"
                  value={form.duration_days}
                  onChange={(event) => setForm({ ...form, duration_days: event.target.value })}
                  className="admin-input"
                />
              </Field>
              <Field label="Giới hạn sự kiện">
                <input
                  type="number"
                  min="0"
                  value={form.event_limit}
                  onChange={(event) => setForm({ ...form, event_limit: event.target.value })}
                  className="admin-input"
                />
              </Field>
              <Field label="Giới hạn nhân sự">
                <input
                  type="number"
                  min="0"
                  value={form.staff_limit}
                  onChange={(event) => setForm({ ...form, staff_limit: event.target.value })}
                  className="admin-input"
                />
              </Field>
              <div className="grid content-end gap-3">
                <label className="flex items-center gap-3 text-sm font-semibold text-[#434655]">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                    className="size-4 accent-primary"
                  />
                  Đang hoạt động
                </label>
                <label className="flex items-center gap-3 text-sm font-semibold text-[#434655]">
                  <input
                    type="checkbox"
                    checked={form.analytics_enabled}
                    onChange={(event) => setForm({ ...form, analytics_enabled: event.target.checked })}
                    className="size-4 accent-primary"
                  />
                  Bật analytics
                </label>
                <label className="flex items-center gap-3 text-sm font-semibold text-[#434655]">
                  <input
                    type="checkbox"
                    checked={form.priority_support}
                    onChange={(event) => setForm({ ...form, priority_support: event.target.checked })}
                    className="size-4 accent-primary"
                  />
                  Hỗ trợ ưu tiên
                </label>
              </div>
            </div>

            <Field label="Mô tả" className="mt-4">
              <textarea
                rows={3}
                maxLength={1000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="admin-input min-h-24 py-3"
              />
            </Field>

            <Field label="Quyền lợi thêm (mỗi dòng một quyền lợi)" className="mt-4">
              <textarea
                rows={4}
                value={form.featuresText}
                onChange={(event) => setForm({ ...form, featuresText: event.target.value })}
                className="admin-input min-h-28 py-3"
              />
            </Field>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeModal} className="admin-secondary">
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/20 transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-[#f3b8b8] bg-white p-5 shadow-2xl">
            <div className="flex gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-md bg-[#fff1f1] text-error">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-[#737686]">Xác nhận xóa</p>
                <h3 className="mt-1 text-xl font-extrabold text-[#111827]">Xóa mềm gói dịch vụ?</h3>
                <p className="mt-2 text-sm leading-6 text-[#434655]">
                  Gói <span className="font-bold text-[#111827]">{deleteTarget.name}</span> sẽ
                  được tạm ẩn và giữ lại trong database.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="admin-secondary">
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-error px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#9f1111] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Trash2 className="size-4" />
                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa mềm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}

function MetricCard({ label, value, accent }) {
  return (
    <Panel className="group relative min-h-32 overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <p className="text-sm font-extrabold text-[#434655]">{label}</p>
      <p className="mt-5 text-4xl font-black leading-none text-[#111827]">{value}</p>
    </Panel>
  )
}

function FeatureList({ plan }) {
  const items = [
    plan.analytics_enabled && 'Analytics',
    plan.priority_support && 'Hỗ trợ ưu tiên',
    ...(plan.features || []),
  ].filter(Boolean)

  if (!items.length) return <span className="text-sm text-[#737686]">Chưa có quyền lợi</span>

  return (
    <div className="grid gap-1 text-sm text-[#434655]">
      {items.slice(0, 3).map((item) => (
        <span key={item} className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-600" />
          {item}
        </span>
      ))}
      {items.length > 3 && (
        <span className="text-xs font-bold text-[#737686]">+{items.length - 3} quyền lợi khác</span>
      )}
    </div>
  )
}

function IconButton({ children, title, onClick, disabled }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-md border border-[#c3c6d7] text-[#434655] transition duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-[#f1fbff] hover:text-primary disabled:opacity-60"
    >
      {children}
    </button>
  )
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      {children}
    </label>
  )
}
