import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, Plus, Power, Trash2 } from 'lucide-react'
import {
  createAdminEventCategory,
  deleteAdminEventCategory,
  fetchAdminEventCategories,
  updateAdminEventCategory,
} from '@/services/events.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Modal } from '@/components/Modal.jsx'
import { Badge, Page, Panel, StatusBadge, Table, TableActionButton } from './AdminComponents.jsx'

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  is_active: true,
}

export function AdminEventCategoriesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [modalMode, setModalMode] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const categoriesQuery = useQuery({
    queryKey: ['admin-event-categories'],
    queryFn: fetchAdminEventCategories,
  })

  const categories = categoriesQuery.data || []

  const refreshCategories = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-event-categories'] })
    queryClient.invalidateQueries({ queryKey: ['event-categories'] })
  }

  const createMutation = useMutation({
    mutationFn: createAdminEventCategory,
    onSuccess: () => {
      toast.success('Đã tạo loại sự kiện.')
      closeModal()
      refreshCategories()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể tạo loại sự kiện.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAdminEventCategory(id, payload),
    onSuccess: (_data, variables) => {
      toast.success(variables?.payload?.is_active === false ? 'Đã tạm ẩn loại sự kiện.' : 'Đã cập nhật loại sự kiện.')
      closeModal()
      refreshCategories()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể cập nhật loại sự kiện.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminEventCategory,
    onSuccess: () => {
      toast.success('Đã xóa loại sự kiện.')
      setDeleteTarget(null)
      refreshCategories()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, 'Không thể xóa loại sự kiện.'))
    },
  })

  const openCreate = () => {
    setSelectedCategory(null)
    setForm(emptyForm)
    setModalMode('create')
  }

  const openEdit = (category) => {
    setSelectedCategory(category)
    setForm({
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      is_active: Boolean(category.is_active),
    })
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedCategory(null)
    setForm(emptyForm)
  }

  const submitForm = (event) => {
    event.preventDefault()

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
    }

    if (modalMode === 'edit' && selectedCategory) {
      updateMutation.mutate({ id: selectedCategory.id, payload })
      return
    }

    createMutation.mutate(payload)
  }

  const toggleActive = (category) => {
    updateMutation.mutate({
      id: category.id,
      payload: { is_active: !category.is_active },
    })
  }

  const deleteCategory = (category) => {
    setDeleteTarget(category)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const mutationError =
    createMutation.error || updateMutation.error || deleteMutation.error

  return (
    <Page
      title="Loại Sự kiện"
      description="Quản lý các nhóm phân loại sự kiện trên nền tảng"
      action="Thêm loại"
      actionClassName="admin-primary shrink-0"
      actionIcon={Plus}
      onAction={openCreate}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Tổng loại sự kiện"
          value={categories.length}
          accent="bg-tertiary"
        />
        <MetricCard
          label="Đang hoạt động"
          value={categories.filter((category) => category.is_active).length}
          accent="bg-success"
        />
        <MetricCard
          label="Chưa dùng"
          value={categories.filter((category) => Number(category.event_count) === 0).length}
          accent="bg-tertiary"
        />
      </div>

      <div className="mt-6">
        {mutationError && (
          <Panel className="mb-4">
            <p className="text-sm font-semibold text-error">
              Không thể lưu thay đổi. Vui lòng kiểm tra dữ liệu và thử lại.
            </p>
          </Panel>
        )}

        {categoriesQuery.isLoading && (
          <Panel>
            <p className="text-sm font-semibold text-subtle">Đang tải loại sự kiện...</p>
          </Panel>
        )}

        {categoriesQuery.isError && (
          <Panel>
            <p className="text-sm font-semibold text-error">
              Không thể tải danh sách loại sự kiện.
            </p>
          </Panel>
        )}

        {!categoriesQuery.isLoading && !categoriesQuery.isError && (
          <Table
            headers={['Tên loại', 'Slug', 'Mô tả', 'Số sự kiện', 'Trạng thái', 'Hành động']}
            rows={categories.map((category) => [
              <span key="name" className="text-sm font-extrabold text-content">{category.name}</span>,
              <span key="slug" className="text-sm font-semibold text-subtle">{category.slug}</span>,
              <span key="description" className="text-sm line-clamp-2 text-subtle">
                {category.description || 'Chưa có mô tả'}
              </span>,
              <span key="count" className="text-sm font-extrabold text-content block text-center">
                {category.event_count ?? 0}
              </span>,
              <StatusBadge key="status" status={category.is_active ? 'ACTIVE' : 'INACTIVE'} />,
              <div key="actions" className="flex items-center justify-center gap-2">
                <TableActionButton
                  title="Sửa"
                  icon={Edit3}
                  tone="primary"
                  onClick={() => openEdit(category)}
                />
                <TableActionButton
                  title={category.is_active ? 'Tạm ẩn' : 'Kích hoạt'}
                  icon={Power}
                  tone={category.is_active ? 'warning' : 'success'}
                  disabled={updateMutation.isPending}
                  onClick={() => toggleActive(category)}
                />
                <TableActionButton
                  title="Xóa"
                  icon={Trash2}
                  tone="danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteCategory(category)}
                />
              </div>,
            ])}
          />
        )}
      </div>

      {modalMode && (
        <Modal
          open={Boolean(modalMode)}
          title={modalMode === 'edit' ? 'Cập nhật loại sự kiện' : 'Thêm loại sự kiện'}
          onClose={closeModal}
          maxWidth="max-w-lg"
          footer={
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="admin-secondary px-6"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="event-category-form"
                disabled={isSaving}
                className="admin-primary px-6 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          }
        >
          <form id="event-category-form" onSubmit={submitForm} className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">
                Tên loại
              </span>
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value
                  setForm((current) => ({
                    ...current,
                    name,
                    slug: modalMode === 'create' && !current.slug ? slugifyText(name) : current.slug,
                  }))
                }}
                placeholder="Nhập tên loại sự kiện..."
                className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#121c38]/60 px-3.5 text-sm font-semibold text-white outline-none focus:border-[#C99A47] placeholder:text-slate-400 [html.light_&]:border-slate-300 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">
                Slug
              </span>
              <input
                required
                maxLength={150}
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: slugifyText(event.target.value) })}
                placeholder="am-nhac-bieu-dien"
                className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-[#121c38]/60 px-3.5 text-sm font-semibold text-white outline-none focus:border-[#C99A47] placeholder:text-slate-400 [html.light_&]:border-slate-300 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-[#1B365D]">
                Mô tả
              </span>
              <textarea
                rows={4}
                maxLength={1000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Nhập mô tả cho loại sự kiện..."
                className="mt-2 w-full resize-none rounded-xl border border-white/15 bg-[#121c38]/60 px-3.5 py-3 text-sm text-white outline-none focus:border-[#C99A47] placeholder:text-slate-400 [html.light_&]:border-slate-300 [html.light_&]:bg-white [html.light_&]:text-[#0D1B2A]"
              />
            </label>

            <label className="flex items-center gap-3 pt-1 text-sm font-semibold text-white [html.light_&]:text-[#0D1B2A] cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                className="size-4.5 rounded accent-[#C99A47] cursor-pointer"
              />
              <span>Đang hoạt động</span>
            </label>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          open={Boolean(deleteTarget)}
          title="Xóa loại sự kiện?"
          onClose={() => setDeleteTarget(null)}
          maxWidth="max-w-md"
          footer={
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="admin-secondary px-6"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-error px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          }
        >
          <div className="py-1">
            <p className="text-sm font-medium leading-relaxed text-slate-200 [html.light_&]:text-[#0D1B2A]">
              Loại <span className="font-bold text-[#E6C17A] [html.light_&]:text-[#1B365D]">{deleteTarget.name}</span> sẽ bị ẩn khỏi hệ thống nhưng dữ liệu vẫn được giữ trong database.
            </p>
          </div>
        </Modal>
      )}
    </Page>
  )
}

function MetricCard({ label, value, accent }) {
  return (
    <Panel className="group relative min-h-32 overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-tertiary/60 hover:shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-white [html.light_&]:text-[#0D1B2A]">{label}</p>
        <p className="mt-5 text-4xl font-display font-extrabold leading-none text-content tracking-tight">{value}</p>
      </div>
    </Panel>
  )
}

function slugifyText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
