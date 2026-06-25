import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  Pencil,
  Plus,
  Power,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { fetchAdminEventCategories } from '@/services/events.js'
import {
  createPlatformFee,
  createPlatformPolicy,
  createPolicyDocument,
  deletePlatformFee,
  deletePlatformPolicy,
  deletePolicyDocument,
  fetchPlatformFees,
  fetchPlatformPolicies,
  fetchPolicyDocuments,
  updatePlatformFee,
  updatePlatformPolicy,
} from '@/services/platformFinance.js'
import { uploadPolicyDocument } from '@/services/uploads.js'
import { Badge, Page, Panel, Row, Table } from './AdminComponents.jsx'

const primaryActionClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0'

const PAGE_SIZE = 10

const feeTypes = [
  ['PERCENTAGE', 'Theo phần trăm'],
  ['FIXED', 'Số tiền cố định'],
  ['COMBINED', 'Kết hợp'],
]

const policyTypes = [
  ['TERMS_CUSTOMER', '1. Điều khoản sử dụng dành cho Khách hàng'],
  ['TERMS_ORGANIZER', '2. Điều khoản sử dụng dành cho Nhà tổ chức'],
  ['TERMS_STAFF', '3. Điều khoản sử dụng dành cho Staff'],
  ['PRIVACY_POLICY', '4. Chính sách bảo mật thông tin cá nhân'],
  ['PAYMENT_SECURITY_POLICY', '5. Chính sách bảo mật thanh toán'],
  ['PAYMENT_POLICY', '6. Chính sách thanh toán'],
  ['REFUND_POLICY', '7. Chính sách hoàn tiền'],
  ['EVENT_POLICY', '8. Chính sách sự kiện'],
  ['TICKET_POLICY', '9. Chính sách đặt vé và sử dụng vé'],
  ['CHECKIN_POLICY', '10. Chính sách check-in và chống vé giả'],
  ['SUBSCRIPTION_POLICY', '11. Chính sách gói dịch vụ Organizer'],
  ['FEE_POLICY', '12. Chính sách phí nền tảng'],
  ['COMPLAINT_POLICY', '13. Chính sách khiếu nại và giải quyết tranh chấp'],
  ['AI_POLICY', '14. Chính sách sử dụng AI'],
  ['SYSTEM_POLICY', '15. Chính sách hệ thống'],
]

const policyConfigFields = {
  default: [
    ['priority', 'Thứ tự ưu tiên', 'number'],
    ['review_cycle_days', 'Chu kỳ rà soát định kỳ (ngày)', 'number'],
    ['requires_acceptance', 'Yêu cầu người dùng xác nhận đồng ý', 'boolean'],
    ['applies_to', 'Đối tượng áp dụng', 'text'],
    ['summary', 'Tóm tắt điều khoản/chính sách', 'textarea'],
    ['public_note', 'Ghi chú công khai', 'textarea'],
  ],
}

const emptyFeeForm = {
  name: '',
  fee_type: 'COMBINED',
  percentage_value: 0,
  fixed_amount: 0,
  event_category_id: '',
  is_active: true,
  effective_from: '',
  effective_to: '',
}

const emptyPolicyForm = {
  policy_type: 'TERMS_CUSTOMER',
  title: '',
  description: '',
  config: {},
  is_active: true,
  effective_from: '',
  effective_to: '',
}

export function AdminFinancePage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('fees')
  const [feeModal, setFeeModal] = useState(null)
  const [policyModal, setPolicyModal] = useState(null)
  const [documentPolicy, setDocumentPolicy] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [actionError, setActionError] = useState('')
  const [feePage, setFeePage] = useState(1)
  const [policyPage, setPolicyPage] = useState(1)
  const [feeForm, setFeeForm] = useState(emptyFeeForm)
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm)

  const feesQuery = useQuery({ queryKey: ['platform-fees'], queryFn: fetchPlatformFees })
  const policiesQuery = useQuery({
    queryKey: ['platform-policies-admin'],
    queryFn: fetchPlatformPolicies,
  })
  const categoriesQuery = useQuery({
    queryKey: ['admin-event-categories'],
    queryFn: fetchAdminEventCategories,
  })

  const fees = feesQuery.data || []
  const policies = policiesQuery.data || []
  const categories = categoriesQuery.data || []
  const activeFee = fees.find((fee) => fee.is_active)
  const activePolicies = policies.filter((policy) => policy.is_active)
  const feePagination = getPagination(fees.length, feePage, PAGE_SIZE)
  const policyPagination = getPagination(policies.length, policyPage, PAGE_SIZE)
  const paginatedFees = fees.slice(feePagination.startIndex, feePagination.endIndex)
  const paginatedPolicies = policies.slice(policyPagination.startIndex, policyPagination.endIndex)

  const refreshFees = () => queryClient.invalidateQueries({ queryKey: ['platform-fees'] })
  const refreshPolicies = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-policies-admin'] })
    queryClient.invalidateQueries({ queryKey: ['platform-policy-documents'] })
  }

  const feeMutation = useMutation({
    mutationFn: ({ id, payload }) => (id ? updatePlatformFee(id, payload) : createPlatformFee(payload)),
    onSuccess: () => {
      setFeeModal(null)
      setFeeForm(emptyFeeForm)
      refreshFees()
    },
  })

  const feeDeleteMutation = useMutation({
    mutationFn: deletePlatformFee,
    onSuccess: () => {
      setActionError('')
      setDeleteTarget(null)
      refreshFees()
    },
    onError: (error) => {
      setActionError(getApiErrorMessage(error, 'Không thể xóa cấu hình phí. Vui lòng thử lại.'))
    },
  })

  const policyMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? updatePlatformPolicy(id, payload) : createPlatformPolicy(payload),
    onSuccess: () => {
      setPolicyModal(null)
      setPolicyForm(emptyPolicyForm)
      refreshPolicies()
    },
  })

  const policyDeleteMutation = useMutation({
    mutationFn: deletePlatformPolicy,
    onSuccess: () => {
      setActionError('')
      setDeleteTarget(null)
      refreshPolicies()
    },
    onError: (error) => {
      setActionError(getApiErrorMessage(error, 'Không thể xóa chính sách. Vui lòng thử lại.'))
    },
  })

  const summary = useMemo(
    () => [
      ['Phí đang áp dụng', activeFee ? formatFee(activeFee) : 'Chưa thiết lập'],
      ['Cấu hình phí', fees.length],
      ['Chính sách hiệu lực', activePolicies.length],
      ['Tài liệu PDF/DOCX', policies.reduce((total, policy) => total + Number(policy.document_count || 0), 0)],
    ],
    [activeFee, activePolicies.length, fees.length, policies],
  )

  const openCreateFee = () => {
    setFeeForm(emptyFeeForm)
    setFeeModal({ mode: 'create' })
  }

  const openEditFee = (fee) => {
    setFeeForm({
      name: fee.name || '',
      fee_type: fee.fee_type || 'COMBINED',
      percentage_value: fee.percentage_value || 0,
      fixed_amount: fee.fixed_amount || 0,
      event_category_id: fee.event_category_id || '',
      is_active: Boolean(fee.is_active),
      effective_from: toDateTimeInput(fee.effective_from),
      effective_to: toDateTimeInput(fee.effective_to),
    })
    setFeeModal({ mode: 'edit', item: fee })
  }

  const submitFee = (event) => {
    event.preventDefault()
    feeMutation.mutate({
      id: feeModal?.item?.id,
      payload: cleanFeePayload(feeForm),
    })
  }

  const openCreatePolicy = () => {
    setPolicyForm({ ...emptyPolicyForm, config: createDefaultPolicyConfig(emptyPolicyForm.policy_type) })
    setPolicyModal({ mode: 'create' })
  }

  const openEditPolicy = (policy) => {
    setPolicyForm({
      policy_type: policy.policy_type || 'TERMS_CUSTOMER',
      title: policy.title || '',
      description: policy.description || '',
      config: createDefaultPolicyConfig(policy.policy_type || 'TERMS_CUSTOMER', policy.config || {}),
      is_active: Boolean(policy.is_active),
      effective_from: toDateTimeInput(policy.effective_from),
      effective_to: toDateTimeInput(policy.effective_to),
    })
    setPolicyModal({ mode: 'edit', item: policy })
  }

  const submitPolicy = (event) => {
    event.preventDefault()
    policyMutation.mutate({
      id: policyModal?.item?.id,
      payload: cleanPolicyPayload(policyForm),
    })
  }

  const requestDelete = (type, item) => {
    setActionError('')
    setDeleteTarget({ type, item })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return

    if (deleteTarget.type === 'fee') {
      feeDeleteMutation.mutate(deleteTarget.item.id)
      return
    }

    policyDeleteMutation.mutate(deleteTarget.item.id)
  }

  const isBusy =
    feeMutation.isPending ||
    feeDeleteMutation.isPending ||
    policyMutation.isPending ||
    policyDeleteMutation.isPending

  return (
    <Page
      title="Tài chính nền tảng"
      description="Quản lý phí giao dịch, chính sách nền tảng và tài liệu PDF đang áp dụng cho hệ thống"
      actions={
        <div className="flex items-center gap-2">
          <TabButton active={activeTab === 'fees'} onClick={() => setActiveTab('fees')}>
            Phí
          </TabButton>
          <TabButton active={activeTab === 'policies'} onClick={() => setActiveTab('policies')}>
            Chính sách
          </TabButton>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(([label, value], index) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            accent={['bg-[#0057c2]', 'bg-green-600', 'bg-tertiary', 'bg-[#6a1edb]'][index]}
          />
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          className={primaryActionClass}
          onClick={activeTab === 'fees' ? openCreateFee : openCreatePolicy}
        >
          <Plus className="size-4" />
          {activeTab === 'fees' ? 'Thêm phí' : 'Thêm chính sách'}
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'fees' ? (
          <>
            <FeeTable
              fees={paginatedFees}
              isLoading={feesQuery.isLoading}
              isError={feesQuery.isError}
              isBusy={isBusy}
              onEdit={openEditFee}
              onDelete={(fee) => requestDelete('fee', fee)}
              onToggle={(fee) =>
                feeMutation.mutate({
                  id: fee.id,
                  payload: { is_active: !fee.is_active },
                })
              }
            />
            {!feesQuery.isLoading && !feesQuery.isError && (
              <PaginationControls
                page={feePagination.page}
                pageSize={PAGE_SIZE}
                total={fees.length}
                label="cấu hình phí"
                onPageChange={setFeePage}
              />
            )}
          </>
        ) : (
          <>
            <PolicyTable
              policies={paginatedPolicies}
              isLoading={policiesQuery.isLoading}
              isError={policiesQuery.isError}
              isBusy={isBusy}
              onEdit={openEditPolicy}
              onDocuments={setDocumentPolicy}
              onDelete={(policy) => requestDelete('policy', policy)}
              onToggle={(policy) =>
                policyMutation.mutate({
                  id: policy.id,
                  payload: { is_active: !policy.is_active },
                })
              }
            />
            {!policiesQuery.isLoading && !policiesQuery.isError && (
              <PaginationControls
                page={policyPagination.page}
                pageSize={PAGE_SIZE}
                total={policies.length}
                label="chính sách"
                onPageChange={setPolicyPage}
              />
            )}
          </>
        )}
      </div>

      {feeModal && (
        <Modal title={feeModal.mode === 'edit' ? 'Cập nhật phí nền tảng' : 'Thêm phí nền tảng'} onClose={() => setFeeModal(null)}>
          <form onSubmit={submitFee} className="space-y-4">
            <TextInput label="Tên cấu hình" value={feeForm.name} onChange={(name) => setFeeForm({ ...feeForm, name })} required />
            <SelectInput label="Loại phí" value={feeForm.fee_type} options={feeTypes} onChange={(fee_type) => setFeeForm({ ...feeForm, fee_type })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="Giá trị phần trăm" value={feeForm.percentage_value} onChange={(percentage_value) => setFeeForm({ ...feeForm, percentage_value })} />
              <NumberInput label="Số tiền cố định" value={feeForm.fixed_amount} onChange={(fixed_amount) => setFeeForm({ ...feeForm, fixed_amount })} />
            </div>
            <SelectInput
              label="Loại sự kiện"
              value={feeForm.event_category_id}
              options={[['', 'Toàn hệ thống'], ...categories.map((category) => [category.id, category.name])]}
              onChange={(event_category_id) => setFeeForm({ ...feeForm, event_category_id })}
            />
            <DateInputs form={feeForm} setForm={setFeeForm} />
            <ActiveInput checked={feeForm.is_active} onChange={(is_active) => setFeeForm({ ...feeForm, is_active })} />
            <FormActions isSaving={feeMutation.isPending} onCancel={() => setFeeModal(null)} />
          </form>
        </Modal>
      )}

      {policyModal && (
        <Modal title={policyModal.mode === 'edit' ? 'Cập nhật chính sách nền tảng' : 'Thêm chính sách nền tảng'} onClose={() => setPolicyModal(null)}>
          <form onSubmit={submitPolicy} className="space-y-4">
            <SelectInput label="Loại chính sách" value={policyForm.policy_type} options={policyTypes} onChange={(policy_type) => setPolicyForm({ ...policyForm, policy_type, config: createDefaultPolicyConfig(policy_type, policyForm.config) })} />
            <TextInput label="Tiêu đề" value={policyForm.title} onChange={(title) => setPolicyForm({ ...policyForm, title })} required />
            <TextareaInput label="Mô tả" value={policyForm.description} onChange={(description) => setPolicyForm({ ...policyForm, description })} />
            <PolicyConfigFields form={policyForm} setForm={setPolicyForm} />
            <DateInputs form={policyForm} setForm={setPolicyForm} />
            <ActiveInput checked={policyForm.is_active} onChange={(is_active) => setPolicyForm({ ...policyForm, is_active })} />
            <FormActions isSaving={policyMutation.isPending} onCancel={() => setPolicyModal(null)} />
          </form>
        </Modal>
      )}

      {documentPolicy && (
        <PolicyDocumentsModal
          policy={documentPolicy}
          onClose={() => setDocumentPolicy(null)}
          onChanged={refreshPolicies}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          error={actionError}
          isDeleting={feeDeleteMutation.isPending || policyDeleteMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </Page>
  )
}

function FeeTable({ fees, isLoading, isError, isBusy, onEdit, onDelete, onToggle }) {
  if (isLoading) return <Panel><p className="text-sm font-semibold">Đang tải cấu hình phí...</p></Panel>
  if (isError) return <Panel><p className="text-sm font-semibold text-error">Không thể tải cấu hình phí.</p></Panel>

  return (
    <Table
      headers={['Tên cấu hình', 'Loại phí', 'Loại sự kiện', 'Mức phí', 'Hiệu lực', 'Trạng thái', 'Hành động']}
      rows={fees.map((fee) => [
        <span key="name" className="font-extrabold">{fee.name}</span>,
        labelFrom(feeTypes, fee.fee_type),
        fee.event_category_name || 'Toàn hệ thống',
        formatFee(fee),
        formatRange(fee.effective_from, fee.effective_to),
        <Badge key="status" tone={fee.is_active ? 'green' : 'blue'}>{fee.is_active ? 'Đang áp dụng' : 'Tạm ẩn'}</Badge>,
        <ActionButtons key="actions" isBusy={isBusy} toggleTitle={fee.is_active ? 'Tạm ẩn' : 'Hiện lại'} onEdit={() => onEdit(fee)} onToggle={() => onToggle(fee)} onDelete={() => onDelete(fee)} />,
      ])}
    />
  )
}

function PolicyTable({ policies, isLoading, isError, isBusy, onEdit, onDocuments, onDelete, onToggle }) {
  if (isLoading) return <Panel><p className="text-sm font-semibold">Đang tải chính sách...</p></Panel>
  if (isError) return <Panel><p className="text-sm font-semibold text-error">Không thể tải chính sách.</p></Panel>

  return (
    <Table
      headers={['Loại chính sách', 'Tiêu đề', 'Tài liệu', 'Hiệu lực', 'Trạng thái', 'Hành động']}
      rows={policies.map((policy) => [
        labelFrom(policyTypes, policy.policy_type),
        <span key="title" className="font-extrabold">{policy.title}</span>,
        <button key="docs" type="button" onClick={() => onDocuments(policy)} className="inline-flex items-center gap-2 text-sm font-bold text-primary">
          <Upload className="size-4" /> Upload/Xem file ({policy.document_count || 0})
        </button>,
        formatRange(policy.effective_from, policy.effective_to),
        <Badge key="status" tone={policy.is_active ? 'green' : 'blue'}>{policy.is_active ? 'Đang áp dụng' : 'Tạm ẩn'}</Badge>,
        <ActionButtons key="actions" isBusy={isBusy} toggleTitle={policy.is_active ? 'Tạm ẩn' : 'Hiện lại'} onEdit={() => onEdit(policy)} onToggle={() => onToggle(policy)} onDelete={() => onDelete(policy)} />,
      ])}
    />
  )
}

function PaginationControls({ page, pageSize, total, label, onPageChange }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-subtle font-medium">
        Hiển thị <span className="font-bold">{start}</span> đến <span className="font-bold">{end}</span> trong tổng số <span className="font-bold">{total}</span> {label}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="admin-secondary px-4 py-2 text-xs disabled:opacity-50"
        >
          Trước
        </button>
        <button
          type="button"
          disabled={page * pageSize >= total}
          onClick={() => onPageChange(page + 1)}
          className="admin-secondary px-4 py-2 text-xs disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ target, error, isDeleting, onClose, onConfirm }) {
  const isFee = target.type === 'fee'
  const itemName = target.item.name || target.item.title

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-soft/40 bg-surface p-5 text-content shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-content">{isFee ? 'Xóa cấu hình phí?' : 'Xóa chính sách?'}</h3>
            <p className="mt-2 text-sm font-semibold text-subtle">
              {isFee
                ? `Cấu hình phí "${itemName}" sẽ được xóa khỏi danh sách quản lý.`
                : `Chính sách "${itemName}" sẽ được xóa khỏi danh sách quản lý.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-subtle hover:bg-panel-soft">
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-border-soft/30 pt-4">
          <button type="button" onClick={onClose} className="admin-secondary">
            Hủy
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-error px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? 'Đang xóa...' : 'Xóa'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PolicyConfigFields({ form, setForm }) {
  const fields = policyConfigFields[form.policy_type] || policyConfigFields.default
  const updateConfig = (key, value) => {
    setForm({
      ...form,
      config: {
        ...(form.config || {}),
        [key]: value,
      },
    })
  }

  return (
    <div className="rounded-xl border border-border-soft/30 bg-panel-soft/50 p-4">
      <p className="text-sm font-extrabold text-content">Cấu hình chi tiết</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label, type]) => {
          const value = form.config?.[key]

          if (type === 'boolean') {
            return (
              <label key={key} className="flex items-center gap-3 rounded-xl border border-border-soft/40 bg-surface px-3 py-3 text-sm font-semibold text-subtle">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => updateConfig(key, event.target.checked)}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            )
          }

          if (type === 'textarea') {
            return (
              <div key={key} className="sm:col-span-2">
                <TextareaInput
                  label={label}
                  value={value || ''}
                  rows={3}
                  onChange={(nextValue) => updateConfig(key, nextValue)}
                />
              </div>
            )
          }

          if (type === 'text') {
            return (
              <TextInput
                key={key}
                label={label}
                value={value || ''}
                onChange={(nextValue) => updateConfig(key, nextValue)}
              />
            )
          }

          return (
            <NumberInput
              key={key}
              label={label}
              value={value ?? 0}
              onChange={(nextValue) => updateConfig(key, nextValue)}
            />
          )
        })}
      </div>
    </div>
  )
}

function PolicyDocumentsModal({ policy, onClose, onChanged }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    description: '',
    version: '1.0',
    is_public: true,
    file: null,
  })

  const documentsQuery = useQuery({
    queryKey: ['platform-policy-documents', policy.id],
    queryFn: () => fetchPolicyDocuments(policy.id),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-policy-documents', policy.id] })
    onChanged()
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const uploaded = await uploadPolicyDocument(form.file)
      return createPolicyDocument(policy.id, {
        title: form.title,
        description: form.description || null,
        file_url: uploaded.secure_url,
        file_name: uploaded.file_name,
        file_size: uploaded.file_size,
        mime_type: uploaded.mime_type,
        version: form.version || '1.0',
        is_public: form.is_public,
      })
    },
    onSuccess: () => {
      setForm({ title: '', description: '', version: '1.0', is_public: true, file: null })
      refresh()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePolicyDocument,
    onSuccess: refresh,
  })

  const documents = documentsQuery.data || []

  return (
    <Modal title={`Tài liệu chính sách - ${policy.title}`} onClose={onClose} wide>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          uploadMutation.mutate()
        }}
        className="grid gap-4 border-b border-border-soft/30 pb-5 lg:grid-cols-[minmax(320px,1.5fr)_minmax(120px,0.55fr)_minmax(260px,0.95fr)]"
      >
        <TextInput label="Tiêu đề tài liệu" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
        <TextInput label="Phiên bản" value={form.version} onChange={(version) => setForm({ ...form, version })} />
        <label className="block">
          <span className="text-xs font-bold text-subtle">File PDF hoặc DOCX</span>
          <input
            required
            type="file"
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
            onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })}
            className="mt-2 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-2 text-sm font-semibold text-content file:mr-3 file:rounded-lg file:border-0 file:bg-secondary/20 file:px-3 file:py-1 file:text-sm file:font-bold file:text-primary placeholder:text-muted"
          />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold text-subtle lg:col-span-2">
          <input type="checkbox" checked={form.is_public} onChange={(event) => setForm({ ...form, is_public: event.target.checked })} className="size-4 accent-primary" />
          Công khai tài liệu
        </label>
        <button type="submit" disabled={uploadMutation.isPending} className={`${primaryActionClass} lg:justify-self-end`}>
          <Upload className="size-4" /> {uploadMutation.isPending ? 'Đang tải lên...' : 'Tải lên'}
        </button>
      </form>

      <div className="mt-5 space-y-3">
        {documentsQuery.isLoading && <p className="text-sm font-semibold text-subtle">Đang tải tài liệu...</p>}
        {documents.map((document) => (
          <div key={document.id} className="flex flex-col gap-3 rounded-xl border border-border-soft/30 bg-panel-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-content">{document.title}</p>
              <p className="text-xs font-semibold text-subtle">
                {document.file_name || 'policy-document'} · phiên bản {document.version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={document.file_url}
                target="_blank"
                rel="noreferrer"
                title="Xem file"
                aria-label="Xem file"
                className="grid size-9 place-items-center rounded-xl border border-border-soft/40 text-subtle transition hover:border-primary hover:bg-surface hover:text-primary"
              >
                <Eye className="size-4" />
              </a>
              <button type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(document.id)} className="grid size-9 place-items-center rounded-xl border border-error/30 text-error hover:bg-error/10">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {!documentsQuery.isLoading && documents.length === 0 && (
          <p className="text-sm font-semibold text-subtle">Chưa có tài liệu chính sách.</p>
        )}
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-border-soft/40 bg-surface shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-soft/30 bg-surface px-5 py-4">
          <h3 className="text-xl font-extrabold text-content">{title}</h3>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-subtle hover:bg-panel-soft transition">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-content">
          {children}
        </div>
      </div>
    </div>
  )
}

function ActionButtons({ isBusy, toggleTitle, onEdit, onToggle, onDelete }) {
  return (
    <div className="flex items-center gap-2">
      <IconButton title="Sửa" onClick={onEdit} disabled={isBusy} icon={Pencil} />
      <IconButton title={toggleTitle || 'Bật/tắt trạng thái'} onClick={onToggle} disabled={isBusy} icon={Power} />
      <IconButton title="Xóa" onClick={onDelete} disabled={isBusy} icon={Trash2} danger />
    </div>
  )
}

function IconButton({ icon: Icon, danger = false, ...props }) {
  return (
    <button
      type="button"
      className={`grid size-9 place-items-center rounded-xl border transition hover:-translate-y-0.5 disabled:opacity-60 ${danger ? 'border-error/30 text-error hover:bg-error/10' : 'border-border-soft/40 text-subtle hover:border-primary hover:bg-panel-soft hover:text-primary'}`}
      {...props}
    >
      <Icon className="size-4" />
    </button>
  )
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex min-w-20 items-center justify-center rounded-full px-4 py-2 text-sm font-extrabold shadow-sm transition duration-200 hover:-translate-y-0.5 ${
        active
          ? 'bg-primary text-slate-950 shadow-primary/20 hover:bg-primary/95'
          : 'border border-border-soft/40 bg-panel-soft text-subtle hover:border-primary hover:bg-surface hover:text-content'
      }`}
      {...props}
    >
      {children}
    </button>
  )
}

function TextInput({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-subtle">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-content placeholder:text-muted outline-none focus:border-primary" {...props} />
    </label>
  )
}

function NumberInput({ label, value, onChange }) {
  return <TextInput type="number" min="0" step="0.01" label={label} value={value} onChange={onChange} />
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-subtle">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm font-semibold text-content outline-none focus:border-primary">
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue || 'empty'} value={optionValue} className="bg-surface text-content">{labelText}</option>
        ))}
      </select>
    </label>
  )
}

function TextareaInput({ label, value, onChange, rows = 4 }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-subtle">{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-border-soft/40 bg-panel-soft px-3 py-3 text-sm font-semibold text-content placeholder:text-muted outline-none focus:border-primary" />
    </label>
  )
}

function DateInputs({ form, setForm }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput type="datetime-local" label="Hiệu lực từ" value={form.effective_from} onChange={(effective_from) => setForm({ ...form, effective_from })} />
      <TextInput type="datetime-local" label="Hiệu lực đến" value={form.effective_to} onChange={(effective_to) => setForm({ ...form, effective_to })} />
    </div>
  )
}

function ActiveInput({ checked, onChange }) {
  return (
    <label className="flex items-center gap-3 text-sm font-semibold text-subtle cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" />
      Đang áp dụng
    </label>
  )
}

function FormActions({ isSaving, onCancel }) {
  return (
    <div className="flex justify-end gap-3 border-t border-border-soft/30 pt-4">
      <button type="button" onClick={onCancel} className="admin-secondary">Hủy</button>
      <button type="submit" disabled={isSaving} className={primaryActionClass}>{isSaving ? 'Đang lưu...' : 'Lưu'}</button>
    </div>
  )
}

function MetricCard({ label, value, accent }) {
  return (
    <Panel className="group relative min-h-32 overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</p>
        <p className="mt-5 text-3xl font-display font-extrabold leading-none text-content tracking-tight">{value}</p>
      </div>
    </Panel>
  )
}

function cleanFeePayload(form) {
  return {
    name: form.name.trim(),
    fee_type: form.fee_type,
    percentage_value: Number(form.percentage_value || 0),
    fixed_amount: Number(form.fixed_amount || 0),
    event_category_id: form.event_category_id || null,
    is_active: form.is_active,
    effective_from: form.effective_from || null,
    effective_to: form.effective_to || null,
  }
}

function createDefaultPolicyConfig(policyType, existing = {}) {
  const nextConfig = { ...existing }
  ;(policyConfigFields[policyType] || []).forEach(([key, , type]) => {
    if (nextConfig[key] !== undefined && nextConfig[key] !== null) return
    nextConfig[key] = type === 'boolean' ? false : type === 'number' ? 0 : ''
  })
  return nextConfig
}

function normalizePolicyConfig(policyType, config = {}) {
  return (policyConfigFields[policyType] || []).reduce((result, [key, , type]) => {
    const value = config[key]

    if (type === 'number') {
      result[key] = Number(value || 0)
      return result
    }

    if (type === 'boolean') {
      result[key] = Boolean(value)
      return result
    }

    result[key] = typeof value === 'string' ? value.trim() : ''
    return result
  }, {})
}

function cleanPolicyPayload(form) {
  return {
    policy_type: form.policy_type,
    title: form.title.trim(),
    description: form.description.trim() || null,
    config: normalizePolicyConfig(form.policy_type, form.config),
    is_active: form.is_active,
    effective_from: form.effective_from || null,
    effective_to: form.effective_to || null,
  }
}

function formatFee(fee) {
  const parts = []
  if (Number(fee.percentage_value) > 0) parts.push(`${Number(fee.percentage_value)}%`)
  if (Number(fee.fixed_amount) > 0) parts.push(formatMoney(fee.fixed_amount))
  return parts.join(' + ') || formatMoney(0)
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value || 0))
}

function formatRange(from, to) {
  if (!from && !to) return 'Luôn áp dụng'
  return (
    <div className="text-xs font-semibold text-subtle">
      <Row label="Từ" value={from ? new Date(from).toLocaleString('vi-VN') : 'Không giới hạn'} />
      <Row label="Đến" value={to ? new Date(to).toLocaleString('vi-VN') : 'Không giới hạn'} />
    </div>
  )
}

function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function labelFrom(options, value) {
  return options.find(([optionValue]) => optionValue === value)?.[1] || value
}

function getPagination(total, page, pageSize) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), maxPage)

  return {
    page: safePage,
    startIndex: (safePage - 1) * pageSize,
    endIndex: safePage * pageSize,
  }
}

function getApiErrorMessage(error, fallback) {
  const data = error?.response?.data
  if (Array.isArray(data?.data) && data.data[0]?.message) {
    return data.data[0].message
  }
  return data?.message || data?.error || fallback
}
