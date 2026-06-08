import { useState, useEffect } from 'react'
import {
  Actions,
  Badge,
  FilterBar,
  KpiGrid,
  Page,
  Status,
  Table,
  UserCell,
} from './AdminComponents.jsx'
import adminUserService from '@/services/adminUser'
import { UserDetailView, LockUserModal } from './UserManagementComponents'
import { Modal } from '@/components/Modal'
import { Search, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react'

export function AdminAccountsPage() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
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

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await adminUserService.listUsers(filters)
      setUsers(res.data.data.users)
      setTotal(res.data.data.total)
      if (res.data.data.stats) {
        setStats(res.data.data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch users', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
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
    } catch (err) {
      console.error('Failed to unlock user', err)
    }
  }

  if (selectedUserId) {
    return (
      <UserDetailView 
        userId={selectedUserId} 
        onBack={() => setSelectedUserId(null)} 
        onStatusChange={handleAction}
      />
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
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc email..."
              className="h-10 w-full rounded-md border border-[#c3c6d7] bg-white pl-10 pr-3 text-sm text-[#191c1e] outline-none focus:border-primary transition focus:ring-2 focus:ring-primary/10"
              value={filters.search}
              onChange={handleSearchChange}
            />
          </div>
          
          <select 
            className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm text-[#191c1e] hover:border-primary transition focus:outline-none focus:ring-2 focus:ring-primary/10"
            value={filters.role}
            onChange={handleRoleChange}
          >
            <option value="">Tất cả vai trò</option>
            <option value="ADMIN">Admin</option>
            <option value="ORGANIZER">Organizer</option>
            <option value="CUSTOMER">Customer</option>
            <option value="STAFF">Staff</option>
          </select>

          <select 
            className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm text-[#191c1e] hover:border-primary transition focus:outline-none focus:ring-2 focus:ring-primary/10"
            value={filters.status}
            onChange={handleStatusChange}
          >
            <option value="">Mọi trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
            <option value="PENDING">Chờ xác nhận</option>
          </select>

          <button 
            onClick={resetFilters}
            className="flex items-center gap-1 text-sm font-bold text-[#737686] hover:text-primary transition"
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
          <span key="date" className="text-[#434655] font-medium">
            {new Date(user.created_at).toLocaleDateString('vi-VN')}
          </span>,
          <Status key="status" value={user.status} />,
          <div key="actions" className="flex items-center gap-4 text-[#737686]">
            <button onClick={() => handleAction('VIEW', user)} title="Xem chi tiết" className="hover:text-primary transition">
               <ShieldCheck className="size-5" />
            </button>
            {user.status === 'LOCKED' ? (
              <button onClick={() => handleAction('UNLOCK', user)} title="Mở khóa" className="hover:text-success transition">
                <ShieldCheck className="size-5 text-success" />
              </button>
            ) : (
              <button onClick={() => handleAction('LOCK', user)} title="Khóa tài khoản" className="hover:text-error transition">
                <AlertTriangle className="size-5 text-error" />
              </button>
            )}
          </div>,
        ])}
      />

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-[#5c647a]">
          Showing <span className="font-bold">{(filters.page - 1) * filters.limit + 1}</span> to <span className="font-bold">{Math.min(filters.page * filters.limit, total)}</span> of <span className="font-bold">{total}</span> users
        </p>
        <div className="flex gap-2">
           <button 
            disabled={filters.page === 1}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
            className="admin-secondary py-2 px-4 text-xs disabled:opacity-50"
           >
            Previous
           </button>
           <button 
            disabled={filters.page * filters.limit >= total}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
            className="admin-secondary py-2 px-4 text-xs disabled:opacity-50"
           >
            Next
           </button>
        </div>
      </div>

      {lockModalOpen && (
        <LockUserModal 
          user={targetUser} 
          open={lockModalOpen} 
          onClose={() => setLockModalOpen(false)} 
          onSuccess={fetchUsers}
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
              <button className="admin-primary bg-success border-none text-white hover:bg-green-700" onClick={handleUnlock}>Xác nhận mở khóa</button>
            </>
          }
        >
          <div className="py-2">
            <p className="text-sm text-[#434655]">
              Bạn có chắc chắn muốn mở khóa tài khoản cho <span className="font-bold text-[#111827]">{targetUser?.full_name}</span>?
            </p>
            <p className="mt-2 text-sm text-[#434655]">
              Sau khi mở khóa, người dùng có thể đăng nhập và sử dụng hệ thống bình thường.
            </p>
          </div>
        </Modal>
      )}
    </Page>
  )
}
