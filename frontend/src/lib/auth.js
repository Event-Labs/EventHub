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
