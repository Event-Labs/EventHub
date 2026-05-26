import { useState } from 'react'
import { Camera, Lock, Mail, Phone, Save, UserCircle } from 'lucide-react'
import { avatarImage } from '@/data/events.js'

export function ProfilePage() {
  const [mode, setMode] = useState('view')

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold text-white">
            Hồ sơ cá nhân
          </h1>
          <p className="mt-2 text-muted">
            Thông tin tài khoản, bảo mật và lịch sử sử dụng EventHub.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('edit')}
            className="rounded-md bg-primary px-5 py-3 font-bold text-slate-950"
          >
            Chỉnh sửa hồ sơ
          </button>
          <button
            onClick={() => setMode('password')}
            className="rounded-md border border-border-soft px-5 py-3 font-bold text-subtle"
          >
            Đổi mật khẩu
          </button>
        </div>
      </div>

      {mode === 'view' && <ProfileView />}
      {mode === 'edit' && <ProfileEdit onDone={() => setMode('view')} />}
      {mode === 'password' && <ChangePassword onDone={() => setMode('view')} />}
    </div>
  )
}

function ProfileView() {
  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="glass-panel rounded-lg p-6 text-center">
        <img
          src={avatarImage}
          alt="Avatar"
          className="mx-auto size-36 rounded-full object-cover ring-4 ring-primary/30"
        />
        <h2 className="mt-5 font-display text-2xl font-bold text-white">
          Alex Henderson
        </h2>
        <p className="text-muted">Khách hàng Premium</p>
      </aside>
      <section className="glass-panel rounded-lg p-6">
        <h2 className="font-display text-2xl font-bold text-white">
          Thông tin cá nhân
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Info icon={UserCircle} label="Họ và tên" value="Alex Henderson" />
          <Info icon={Mail} label="Email" value="alex.h@eventhub.ai" />
          <Info icon={Phone} label="Số điện thoại" value="+1 (555) 902-3412" />
          <Info icon={Lock} label="Vai trò" value="Customer" />
        </div>
      </section>
    </div>
  )
}

function ProfileEdit({ onDone }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="glass-panel rounded-lg p-6 text-center">
        <div className="relative mx-auto size-36">
          <img
            src={avatarImage}
            alt="Avatar"
            className="size-36 rounded-full object-cover"
          />
          <button className="absolute bottom-1 right-1 grid size-10 place-items-center rounded-full bg-primary text-slate-950">
            <Camera className="size-5" />
          </button>
        </div>
        <p className="mt-4 text-sm text-muted">
          JPG, PNG. Kích thước đề xuất 400x400px.
        </p>
      </aside>
      <section className="glass-panel rounded-lg p-6">
        <h2 className="font-display text-2xl font-bold text-white">
          Chỉnh sửa hồ sơ
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Input label="Họ và tên" defaultValue="Alex Henderson" />
          <Input label="Số điện thoại" defaultValue="+1 (555) 902-3412" />
          <Input label="Ngày sinh" type="date" defaultValue="1992-08-14" />
          <Input label="Thành phố" defaultValue="Austin" />
          <Input
            label="Địa chỉ"
            defaultValue="721 Vibe Street, Creative District"
            className="md:col-span-2"
          />
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onDone}
            className="rounded-md px-5 py-3 font-bold text-muted hover:bg-panel-soft"
          >
            Hủy
          </button>
          <button
            onClick={onDone}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-bold text-slate-950"
          >
            <Save className="size-4" />
            Lưu thay đổi
          </button>
        </div>
      </section>
    </div>
  )
}

function ChangePassword({ onDone }) {
  return (
    <section className="glass-panel mx-auto max-w-xl rounded-lg p-6">
      <h2 className="font-display text-2xl font-bold text-white">
        Đổi mật khẩu
      </h2>
      <div className="mt-6 space-y-5">
        <Input
          label="Mật khẩu cũ"
          type="password"
          placeholder="Nhập mật khẩu hiện tại"
        />
        <Input
          label="Mật khẩu mới"
          type="password"
          placeholder="Nhập mật khẩu mới"
        />
        <Input
          label="Xác nhận mật khẩu mới"
          type="password"
          placeholder="Nhập lại mật khẩu mới"
        />
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={onDone}
          className="rounded-md px-5 py-3 font-bold text-muted hover:bg-panel-soft"
        >
          Hủy
        </button>
        <button
          onClick={onDone}
          className="rounded-md bg-primary px-5 py-3 font-bold text-slate-950"
        >
          Cập nhật mật khẩu
        </button>
      </div>
    </section>
  )
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="mt-2 font-bold text-white">{value}</p>
    </div>
  )
}

function Input({ label, className = '', ...props }) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none focus:border-primary"
      />
    </label>
  )
}
