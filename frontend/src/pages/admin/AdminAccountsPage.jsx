import { useState, useEffect } from 'react'
import {
  Badge,
  KpiGrid,
  Page,
  Status,
  Table,
  UserCell,
} from './AdminComponents.jsx'
import adminUserService from '@/services/adminUser'
import { UserDetailView, LockUserModal } from './UserManagementComponents'
import { Modal } from '@/components/Modal'
import { Search, RotateCcw, AlertTriangle, Eye, Unlock } from 'lucide-react'

export function AdminAccountsPage() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
    page: 1,
    limit: 10,
    sortBy: 'created_at',
    sortOrder: 'DESC'
  })

  // BIẾN TRẠNG THÁI UI
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [targetUser, setTargetUser] = useState(null)
  const [stats, setStats] = useState({ total: 0, active: 0, locked: 0, organizers: 0 })
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const totalPages = Math.max(1, Math.ceil(total / filters.limit))
  const pageItems = getPageItems(filters.page, totalPages)
  const startItem = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1
  const endItem = Math.min(filters.page * filters.limit, total)

  const fetchUsers = async () => {
    try {
      const res = await adminUserService.listUsers(filters)
      setUsers(res.data.data.users)
      setTotal(res.data.data.total)
      if (res.data.data.stats) {
        setStats(res.data.data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch users', err)
    }
  }

  useEffect(() => {
    let ignore = false

    adminUserService.listUsers(filters)
      .then((res) => {
        if (ignore) return
        setUsers(res.data.data.users)
        setTotal(res.data.data.total)
        if (res.data.data.stats) {
          setStats(res.data.data.stats)
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error('Failed to fetch users', err)
        }
      })

    return () => {
      ignore = true
    }
  }, [filters])

  const handleSearchChange = (e) => {
    setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))
  }

  const handleRoleChange = (e) => {
    setFilters(prev => ({ ...prev, role: e.target.value, page: 1 }))
  }

  const handleStatusChange = (e) => {
    setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))
  }

  const resetFilters = () => {
    setFilters({
      search: '',
      role: '',
      status: '',
      page: 1,
      limit: 10,
      sortBy: 'created_at',
      sortOrder: 'DESC'
    })
  }

  const handleAction = (type, user) => {
    setTargetUser(user)
    if (type === 'VIEW') {
      setSelectedUserId(user.id)
    } else if (type === 'LOCK') {
      setLockModalOpen(true)
    } else if (type === 'UNLOCK') {
      setUnlockModalOpen(true)
    }
  }

  const handleUnlock = async () => {
    try {
      await adminUserService.unlockUser(targetUser.id)
      setUnlockModalOpen(false)
      fetchUsers()
      setDetailRefreshKey(prev => prev + 1)
    } catch (err) {
      console.error('Failed to unlock user', err)
    }
  }

  if (selectedUserId) {
    return (
      <>
        <UserDetailView 
          userId={selectedUserId} 
          onBack={() => setSelectedUserId(null)} 
          onStatusChange={handleAction}
          refreshKey={detailRefreshKey}
        />
        {lockModalOpen && (
          <LockUserModal 
            user={targetUser} 
            open={lockModalOpen} 
            onClose={() => setLockModalOpen(false)} 
            onSuccess={() => {
              fetchUsers() // This updates stats, causing refreshKey to change (hopefully) or we add a specific refresh trigger
            }}
          />
        )}
        {unlockModalOpen && (
          <Modal
            open={unlockModalOpen}
            title="Mở khóa tài khoản"
            onClose={() => setUnlockModalOpen(false)}
            footer={
              <>
                <button className="admin-secondary" onClick={() => setUnlockModalOpen(false)}>Hủy bỏ</button>
                <button className="admin-primary bg-success border-none text-slate-950 font-extrabold hover:bg-success/90" onClick={handleUnlock}>Xác nhận mở khóa</button>
              </>
            }
          >
            <div className="py-2">
              <p className="text-sm text-subtle">
                Bạn có chắc chắn muốn mở khóa tài khoản cho <span className="font-bold text-content">{targetUser?.full_name}</span>?
              </p>
              <p className="mt-2 text-sm text-subtle">
                Sau khi mở khóa, người dùng có thể đăng nhập và sử dụng hệ thống bình thường.
              </p>
            </div>
          </Modal>
        )}
      </>
    )
  }

  return (
    <Page
      title="Quản lý người dùng"
      description="Quản lý tài khoản, vai trò và tuân thủ bảo mật hệ thống."
    >
      <KpiGrid
        items={[
          ['Tổng người dùng', stats.total, ''],
          ['Đang hoạt động', stats.active, ''],
          ['Tài khoản bị khóa', stats.locked, stats.locked > 0 ? 'Urgent' : ''],
          ['Ban tổ chức', stats.organizers, ''],
          ['Nhân viên', stats.staff, ''],
        ]}
      />

      <div className="my-6 grid gap-4 lg:flex lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc email..."
              className="h-10 w-full rounded-xl border border-border-soft/40 bg-panel-soft pl-10 pr-3 text-sm text-content outline-none focus:border-primary transition focus:ring-2 focus:ring-primary/10 placeholder:text-muted"
              value={filters.search}
              onChange={handleSearchChange}
            />
          </div>
          
          <select 
            className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content hover:border-tertiary transition focus:outline-none focus:ring-2 focus:ring-primary/10"
            value={filters.role}
            onChange={handleRoleChange}
          >
            <option value="" className="bg-surface text-content">Tất cả vai trò</option>
            <option value="ADMIN" className="bg-surface text-content">Admin</option>
            <option value="ORGANIZER" className="bg-surface text-content">Organizer</option>
            <option value="CUSTOMER" className="bg-surface text-content">Customer</option>
            <option value="STAFF" className="bg-surface text-content">Staff</option>
          </select>

          <select 
            className="h-10 rounded-xl border border-border-soft/40 bg-panel-soft px-3 text-sm text-content hover:border-tertiary transition focus:outline-none focus:ring-2 focus:ring-primary/10"
            value={filters.status}
            onChange={handleStatusChange}
          >
            <option value="" className="bg-surface text-content">Mọi trạng thái</option>
            <option value="ACTIVE" className="bg-surface text-content">Hoạt động</option>
            <option value="LOCKED" className="bg-surface text-content">Đã khóa</option>
            <option value="PENDING" className="bg-surface text-content">Chờ xác nhận</option>
          </select>

          <button 
            onClick={resetFilters}
            className="flex items-center gap-1 text-sm font-bold text-subtle hover:text-tertiary transition"
          >
            <RotateCcw className="size-3" /> Đặt lại
          </button>
        </div>
      </div>

      <Table
        headers={['Người dùng', 'Vai trò', 'Ngày đăng ký', 'Trạng thái', 'Thao tác']}
        rows={users.map((user) => [
          <UserCell 
            key="user"
            name={user.full_name}
            email={user.email}
            image={user.avatar_url}
            onClick={() => handleAction('VIEW', user)}
          />,
          <div key="roles" className="flex flex-wrap gap-1">
            {user.roles && user.roles.filter(Boolean).length > 0 ? (
              user.roles.filter(Boolean).map(role => (
                <Badge key={role} tone={role === 'ADMIN' ? 'purple' : 'blue'}>
                  {role}
                </Badge>
              ))
            ) : (
              <Badge tone="gray">CHƯA XÁC THỰC</Badge>
            )}
          </div>,
          <span key="date" className="text-subtle font-medium">
            {new Date(user.created_at).toLocaleDateString('vi-VN')}
          </span>,
          <Status key="status" value={user.status} />,
          <div key="actions" className="flex items-center gap-4 text-subtle">
            <button
              onClick={() => handleAction('VIEW', user)}
              title="Xem chi tiết"
              className="grid size-9 place-items-center rounded-full text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-lg hover:shadow-white/20 hover:ring-1 hover:ring-white/50"
            >
               <Eye className="size-5" />
            </button>
            {user.status === 'LOCKED' ? (
              <button
                onClick={() => handleAction('UNLOCK', user)}
                title="Mở khóa"
                className="grid size-9 place-items-center rounded-full text-success transition duration-200 hover:-translate-y-0.5 hover:bg-success/25 hover:shadow-lg hover:shadow-success/35 hover:ring-1 hover:ring-success/50"
              >
                <Unlock className="size-5 text-success" />
              </button>
            ) : (
              <button
                onClick={() => handleAction('LOCK', user)}
                title="Khóa tài khoản"
                className="grid size-9 place-items-center rounded-full text-error transition duration-200 hover:-translate-y-0.5 hover:bg-error/25 hover:shadow-lg hover:shadow-error/35 hover:ring-1 hover:ring-error/50"
              >
                <AlertTriangle className="size-5 text-error" />
              </button>
            )}
          </div>,
        ])}
      />

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-subtle font-medium">
          Hiển thị <span className="font-bold">{startItem}</span> đến <span className="font-bold">{endItem}</span> trong tổng số <span className="font-bold">{total}</span> người dùng
        </p>
        <div className="flex flex-wrap items-center gap-2">
           <button 
            disabled={filters.page === 1}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
            className="admin-secondary py-2 px-4 text-xs disabled:opacity-50"
           >
            Trước
           </button>
           {pageItems.map((item, index) => (
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-sm font-bold text-subtle">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setFilters(prev => ({ ...prev, page: item }))}
                className={`grid h-9 min-w-9 place-items-center rounded-xl border px-3 text-xs font-extrabold transition ${
                  item === filters.page
                    ? 'border-tertiary bg-tertiary text-white'
                    : 'border-border-soft/40 bg-panel-soft text-subtle hover:border-tertiary hover:text-tertiary'
                }`}
                aria-current={item === filters.page ? 'page' : undefined}
              >
                {item}
              </button>
            )
           ))}
           <button 
            disabled={filters.page >= totalPages}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
            className="admin-secondary py-2 px-4 text-xs disabled:opacity-50"
           >
            Sau
           </button>
        </div>
      </div>

      {lockModalOpen && (
        <LockUserModal 
          user={targetUser} 
          open={lockModalOpen} 
          onClose={() => setLockModalOpen(false)} 
          onSuccess={() => {
            fetchUsers()
            setDetailRefreshKey(prev => prev + 1)
          }}
        />
      )}

      {unlockModalOpen && (
        <Modal
          open={unlockModalOpen}
          title="Mở khóa tài khoản"
          onClose={() => setUnlockModalOpen(false)}
          footer={
            <>
              <button className="admin-secondary" onClick={() => setUnlockModalOpen(false)}>Hủy bỏ</button>
              <button className="admin-primary bg-success border-none text-slate-950 font-extrabold hover:bg-success/90" onClick={handleUnlock}>Xác nhận mở khóa</button>
            </>
          }
        >
          <div className="py-2">
            <p className="text-sm text-subtle">
              Bạn có chắc chắn muốn mở khóa tài khoản cho <span className="font-bold text-content">{targetUser?.full_name}</span>?
            </p>
            <p className="mt-2 text-sm text-subtle">
              Sau khi mở khóa, người dùng có thể đăng nhập và sử dụng hệ thống bình thường.
            </p>
          </div>
        </Modal>
      )}
    </Page>
  )
}

function getPageItems(currentPage, totalPages) {
  const pages = new Set([1, totalPages])
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page)
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b)
  return sortedPages.flatMap((page, index) => {
    const previousPage = sortedPages[index - 1]
    if (index > 0 && page - previousPage > 1) {
      return ['ellipsis', page]
    }
    return [page]
  })
}
