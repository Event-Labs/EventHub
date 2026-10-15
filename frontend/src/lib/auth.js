const AUTH_TOKEN_KEY = 'eventhub-token'
const AUTH_USER_KEY = 'eventhub-user'
const AUTH_FLAG_KEY = 'eventhub-auth'
const REMEMBER_LOGIN_KEY = 'eventhub-remember-login'

function dispatchAuthEvent(detail) {
  window.dispatchEvent(new CustomEvent(AUTH_FLAG_KEY, { detail }))
}

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

export function getStoredUserKey(user = getStoredUser()) {
  return user?.id || user?.user_id || user?._id || user?.email || null
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
  dispatchAuthEvent({ type: 'login', userKey: getStoredUserKey(user) })
}

export function clearAuthSession({ dispatch = true } = {}) {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(AUTH_TOKEN_KEY)
    storage.removeItem(AUTH_USER_KEY)
    storage.removeItem(AUTH_FLAG_KEY)
  }
  localStorage.setItem(AUTH_FLAG_KEY, 'false')
  if (dispatch) dispatchAuthEvent({ type: 'logout' })
}

export function updateStoredUser(userPatch) {
  const currentUser = getStoredUser() || {}
  const nextUser = { ...currentUser, ...userPatch }
  const storage = localStorage.getItem(AUTH_TOKEN_KEY) ? localStorage : sessionStorage
  storage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser))
  dispatchAuthEvent({ type: 'user-updated', userKey: getStoredUserKey(nextUser) })
  return nextUser
}

export function updateAuthToken(newAccessToken) {
  if (!newAccessToken) return
  if (localStorage.getItem(AUTH_TOKEN_KEY)) {
    localStorage.setItem(AUTH_TOKEN_KEY, newAccessToken)
  } else if (sessionStorage.getItem(AUTH_TOKEN_KEY)) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, newAccessToken)
  } else {
    const remember = getRememberLoginPreference()
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(AUTH_TOKEN_KEY, newAccessToken)
  }
}

export function getRememberLoginPreference() {
  return localStorage.getItem(REMEMBER_LOGIN_KEY) !== 'false'
}

export function parseJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function getUserRoles(user = getStoredUser()) {
  const token = getAuthToken()
  const jwtPayload = parseJwtPayload(token)

  const rawRoles = [
    user?.role,
    user?.role?.name,
    user?.role_name,
    user?.roleName,
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(Array.isArray(jwtPayload?.roles) ? jwtPayload.roles : []),
    jwtPayload?.role,
    jwtPayload?.role_name,
    jwtPayload?.roleName,
  ].filter(Boolean)

  return Array.from(
    new Set(
      rawRoles
        .map((role) => (typeof role === 'string' ? role : role?.name || role?.code))
        .filter(Boolean)
        .map((role) => role.toLowerCase()),
    ),
  )
}

export function isAdminUser(user = getStoredUser()) {
  return getUserRoles(user).some((role) =>
    ['admin', 'super_admin', 'superadmin', 'administrator'].includes(role),
  )
}

export function getRoleDefaultPath(user = getStoredUser()) {
  if (isAdminUser(user)) {
    return '/admin'
  }
  const roles = getUserRoles(user)
  if (roles.includes('organizer')) {
    return '/organizer'
  }
  if (roles.includes('staff')) {
    return '/staff'
  }
  return '/'
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

