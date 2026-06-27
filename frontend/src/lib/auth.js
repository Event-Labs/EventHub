const AUTH_TOKEN_KEY = 'eventhub-token'
const AUTH_USER_KEY = 'eventhub-user'
const AUTH_FLAG_KEY = 'eventhub-auth'
const REMEMBER_LOGIN_KEY = 'eventhub-remember-login'

function getStorageValue(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

export function getAuthToken() {
  return getStorageValue(AUTH_TOKEN_KEY)
}

export function getStoredUser() {
  const raw = getStorageValue(AUTH_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    clearAuthSession()
    return null
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken())
}

export function setAuthSession({ accessToken, user, remember = true }) {
  clearAuthSession({ dispatch: false })
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(AUTH_TOKEN_KEY, accessToken)
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  storage.setItem(AUTH_FLAG_KEY, 'true')
  localStorage.setItem(REMEMBER_LOGIN_KEY, remember ? 'true' : 'false')
  window.dispatchEvent(new Event(AUTH_FLAG_KEY))
}

export function clearAuthSession({ dispatch = true } = {}) {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(AUTH_TOKEN_KEY)
    storage.removeItem(AUTH_USER_KEY)
    storage.removeItem(AUTH_FLAG_KEY)
  }
  localStorage.setItem(AUTH_FLAG_KEY, 'false')
  if (dispatch) window.dispatchEvent(new Event(AUTH_FLAG_KEY))
}

export function updateStoredUser(userPatch) {
  const currentUser = getStoredUser() || {}
  const nextUser = { ...currentUser, ...userPatch }
  const storage = localStorage.getItem(AUTH_TOKEN_KEY) ? localStorage : sessionStorage
  storage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser))
  window.dispatchEvent(new Event(AUTH_FLAG_KEY))
  return nextUser
}

export function getRememberLoginPreference() {
  return localStorage.getItem(REMEMBER_LOGIN_KEY) !== 'false'
}

export function getUserRoles(user) {
  const rawRoles = [
    user?.role,
    user?.role?.name,
    ...(Array.isArray(user?.roles) ? user.roles : []),
  ].filter(Boolean)

  return rawRoles
    .map((role) => (typeof role === 'string' ? role : role?.name || role?.code))
    .filter(Boolean)
    .map((role) => role.toLowerCase())
}

export function isAdminUser(user) {
  return getUserRoles(user).some((role) =>
    ['admin', 'super_admin', 'superadmin', 'administrator'].includes(role),
  )
}

export function getPostLoginPath(user, redirectPath = '/') {
  if (isAdminUser(user)) {
    return redirectPath?.startsWith('/admin') ? redirectPath : '/admin'
  }

  const roles = getUserRoles(user)
  if (roles.includes('organizer')) {
    return redirectPath?.startsWith('/organizer') ? redirectPath : '/organizer'
  }
  if (roles.includes('staff')) {
    return redirectPath?.startsWith('/staff') ? redirectPath : '/staff'
  }

  if (
    redirectPath?.startsWith('/admin') ||
    redirectPath?.startsWith('/organizer') ||
    redirectPath?.startsWith('/staff')
  ) {
    return '/'
  }

  return redirectPath || '/'
}