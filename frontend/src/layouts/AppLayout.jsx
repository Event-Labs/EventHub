import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Bell, UserCircle } from 'lucide-react'

const centerNavItems = [
  ['Sự kiện', '/events'],
  ['Vé của tôi', '/my-tickets'],
  ['Phản hồi', '/feedback'],
  ['Chinh sach', '/policies'],
]

const navLinkClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-bold transition ${
    isActive ? 'bg-primary/15 text-primary' : 'text-subtle hover:text-primary'
  }`

export function AppLayout() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const syncAuth = () => {
      const isLoggedIn =
        Boolean(localStorage.getItem('eventhub-token')) ||
        localStorage.getItem('eventhub-auth') === 'true'
      const storedUser = localStorage.getItem('eventhub-user')
      let parsedUser = null

      if (isLoggedIn && storedUser) {
        try {
          parsedUser = JSON.parse(storedUser)
        } catch {
          parsedUser = null
        }
      }

      setLoggedIn(isLoggedIn)
      setCurrentUser(parsedUser)
    }

    syncAuth()
    window.addEventListener('storage', syncAuth)
    window.addEventListener('eventhub-auth', syncAuth)
    return () => {
      window.removeEventListener('storage', syncAuth)
      window.removeEventListener('eventhub-auth', syncAuth)
    }
  }, [])

  const logout = () => {
    localStorage.removeItem('eventhub-auth')
    localStorage.removeItem('eventhub-token')
    localStorage.removeItem('eventhub-user')
    window.dispatchEvent(new Event('eventhub-auth'))
    setOpen(false)
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-content">
      <header className="sticky top-0 z-50 border-b border-border-soft bg-[#0d1422]/95 shadow-xl backdrop-blur">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="font-display text-xl font-extrabold text-primary">
              EventHub
            </span>
          </NavLink>

          <nav className="hidden items-center justify-center gap-1 md:flex">
            {centerNavItems.map(([label, to]) => (
              <NavLink key={to} to={to} className={navLinkClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          {!loggedIn ? (
            <div className="flex items-center gap-3">
              <NavLink
                className="rounded-md px-4 py-2 text-sm font-bold text-subtle hover:text-primary"
                to="/login"
              >
                Đăng nhập
              </NavLink>
              <NavLink
                className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-300"
                to="/register"
              >
                Đăng ký
              </NavLink>
            </div>
          ) : (
            <div className="relative flex items-center gap-3">
              <button className="grid size-10 place-items-center rounded-full text-subtle hover:bg-panel-soft hover:text-primary">
                <Bell className="size-5" />
              </button>
              <button
                className="grid size-10 place-items-center overflow-hidden rounded-full border border-primary/40 bg-primary text-slate-950 transition hover:border-primary hover:bg-sky-300"
                onClick={() => setOpen((value) => !value)}
                aria-label="Mở menu tài khoản"
                aria-expanded={open}
              >
                {currentUser?.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name || 'Tài khoản'}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="size-7" />
                )}
              </button>
              {open && (
                <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-lg border border-border-soft bg-panel shadow-2xl">
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/profile"
                    onClick={() => setOpen(false)}
                  >
                    Hồ sơ cá nhân
                  </NavLink>
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/my-tickets"
                    onClick={() => setOpen(false)}
                  >
                    Vé của tôi
                  </NavLink>
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/favorites"
                    onClick={() => setOpen(false)}
                  >
                    Sự kiện yêu thích
                  </NavLink>
                  <NavLink
                    className="block px-4 py-3 text-sm font-semibold text-subtle hover:bg-panel-soft hover:text-primary"
                    to="/organizer-request"
                    onClick={() => setOpen(false)}
                  >
                    Đăng kí làm organizer
                  </NavLink>
                  <button
                    className="block w-full px-4 py-3 text-left text-sm font-semibold text-error hover:bg-error/10"
                    onClick={logout}
                  >
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border-soft bg-[#0d1422]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_2fr] lg:px-8">
          <div>
            <div className="font-display text-2xl font-extrabold text-primary">
              EventHub
            </div>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
              Nền tảng khám phá sự kiện, đặt vé, quản lý vận hành, check-in QR
              và hỗ trợ ban tổ chức bằng AI.
            </p>
            <p className="mt-5 text-xs text-neutral">
              © 2026 EventHub. All rights reserved.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {[
              ['EventHub', 'Về EventHub', 'Liên hệ', 'Chính sách hoàn vé'],
              [
                'Hỗ trợ',
                'Trung tâm trợ giúp',
                'Hướng dẫn ban tổ chức',
                'AI FAQ',
              ],
              ['Pháp lý', 'Điều khoản', 'Bảo mật', 'Phí nền tảng'],
            ].map(([title, ...links]) => (
              <div key={title} className="space-y-3">
                <h3 className="text-sm font-bold text-white">{title}</h3>
                {links.map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="block text-sm text-muted transition hover:text-primary"
                  >
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
