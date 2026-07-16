import { http } from './http'

export const adminProfileApi = {
  getSecurityStatus: () => http.get('/admin/profile/security-status'),
  checkSecurity: () => http.get('/admin/profile/security-check'),
  listSessions: () => http.get('/admin/profile/sessions'),
}
