import { http } from './http'

export const adminProfileApi = {
  getSecurityStatus: () => http.get('/admin/profile/security-status'),
  checkSecurity: () => http.get('/admin/profile/security-check'),
  listSessions: () => http.get('/admin/profile/sessions'),
  startTwoFactor: (enabled) => http.post('/admin/profile/2fa/start', { enabled }),
  verifyTwoFactor: ({ challengeId, otp }) => http.post('/admin/profile/2fa/verify', { challengeId, otp }),
}
