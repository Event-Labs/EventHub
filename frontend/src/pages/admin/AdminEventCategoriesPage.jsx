import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Edit3, Plus, Power, Trash2, X } from 'lucide-react'
import {
  createAdminEventCategory,
  deleteAdminEventCategory,
  fetchAdminEventCategories,
  updateAdminEventCategory,
} from '@/services/events.js'
import { Badge, Page, Panel, Table } from './AdminComponents.jsx'

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  is_active: true,
}

export function AdminEventCategoriesPage() {
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
      closeModal()
      refreshCategories()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAdminEventCategory(id, payload),
    onSuccess: () => {
      closeModal()
      refreshCategories()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAdminEventCategory,
    onSuccess: () => {
      setDeleteTarget(null)
      refreshCategories()
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
      title="Loại sự kiện"
      description="Quản lý các nhóm phân loại sự kiện trên nền tảng"
      action="Thêm loại"
      actionClassName="inline-flex items-center justify-center gap-2 rounded-md bg-tertiary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-tertiary/25 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-tertiary/30 active:translate-y-0"
      actionIcon={Plus}
      onAction={openCreate}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Tổng loại sự kiện"
          value={categories.length}
          accent="bg-[#0057c2]"
        />
        <MetricCard
          label="Đang hoạt động"
          value={categories.filter((category) => category.is_active).length}
          accent="bg-green-600"
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
            <p className="text-sm font-semibold text-[#434655]">Đang tải loại sự kiện...</p>
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
              <span key="name" className="font-extrabold text-[#111827]">{category.name}</span>,
              <span key="slug" className="font-semibold text-[#434655]">{category.slug}</span>,
              <span key="description" className="line-clamp-2 text-[#434655]">
                {category.description || 'Chưa có mô tả'}
              </span>,
              <span key="count" className="font-extrabold text-[#111827]">
                {category.event_count ?? 0}
              </span>,
              <Badge key="status" tone={category.is_active ? 'green' : 'blue'}>
                {category.is_active ? 'Đang hoạt động' : 'Tạm ẩn'}
              </Badge>,
              <div key="actions" className="flex items-center gap-2">
                <button
                  type="button"
                  title="Sửa"
                  onClick={() => openEdit(category)}
                  className="grid size-9 place-items-center rounded-md border border-[#c3c6d7] text-[#434655] transition duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-[#f1fbff] hover:text-primary"
                >
                  <Edit3 className="size-4" />
                </button>
                <button
                  type="button"
                  title={category.is_active ? 'Tạm ẩn' : 'Kích hoạt'}
                  onClick={() => toggleActive(category)}
                  disabled={updateMutation.isPending}
                  className="grid size-9 place-items-center rounded-md border border-[#c3c6d7] text-[#434655] transition duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-[#f1fbff] hover:text-primary disabled:opacity-60"
                >
                  <Power className="size-4" />
                </button>
                <button
                  type="button"
                  title="Xóa mềm"
                  onClick={() => deleteCategory(category)}
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
            className="w-full max-w-lg rounded-md border border-[#c3c6d7] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-[#111827]">
                  {modalMode === 'edit' ? 'Cập nhật loại sự kiện' : 'Thêm loại sự kiện'}
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

            <label className="mt-5 block">
              <span className="text-xs font-bold text-[#434655]">Tên loại</span>
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
                className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 text-sm font-semibold text-[#191c1e] outline-none focus:border-primary"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-bold text-[#434655]">Slug</span>
              <input
                required
                maxLength={150}
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: slugifyText(event.target.value) })}
                placeholder="am-nhac-bieu-dien"
                className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 text-sm font-semibold text-[#191c1e] outline-none focus:border-primary"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-bold text-[#434655]">Mô tả</span>
              <textarea
                rows={4}
                maxLength={1000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-2 w-full resize-none rounded border border-[#c3c6d7] bg-[#f7f9fb] px-3 py-3 text-sm text-[#191c1e] outline-none focus:border-primary"
              />
            </label>

            <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-[#434655]">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                className="size-4 accent-primary"
              />
              Đang hoạt động
            </label>

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
                <h3 className="mt-1 text-xl font-extrabold text-[#111827]">
                  Xóa mềm loại sự kiện?
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#434655]">
                  Loại <span className="font-bold text-[#111827]">{deleteTarget.name}</span> sẽ
                  bị ẩn khỏi hệ thống nhưng dữ liệu vẫn được giữ trong database.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="admin-secondary"
              >
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
      <div>
        <p className="text-sm font-extrabold text-[#434655]">{label}</p>
        <p className="mt-5 text-4xl font-black leading-none text-[#111827]">{value}</p>
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
