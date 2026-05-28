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
