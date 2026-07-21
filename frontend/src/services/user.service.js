import { http } from '@/services/http.js'

export async function getProfile() {
  const response = await http.get('/users/me')
  return response.data.data
}

export async function updateProfile(data) {
  const response = await http.patch('/users/me', data)
  return response.data.data
}

export async function changePassword(currentPassword, newPassword) {
  const response = await http.patch('/users/me/password', {
    currentPassword,
    newPassword,
  })
  return response.data
}

export async function getSecurityStatus() {
  const response = await http.get('/users/me/security-status')
  return response.data.data
}

export async function checkSecurity() {
  const response = await http.get('/users/me/security-check')
  return response.data.data
}

export async function startTwoFactor(enabled) {
  const response = await http.post('/users/me/2fa/start', { enabled })
  return response.data.data
}

export async function verifyTwoFactor({ challengeId, otp }) {
  const response = await http.post('/users/me/2fa/verify', { challengeId, otp })
  return response.data.data
}
