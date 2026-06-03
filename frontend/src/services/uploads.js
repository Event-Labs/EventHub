import { http } from '@/services/http.js'

export async function uploadEventImage(file, type = 'banner') {
  if (!file) return null

  const signatureResponse = await http.post('/uploads/cloudinary/event-image/signature', {
    type,
  })
  const { upload_url: uploadUrl, fields } = signatureResponse.data.data
  const formData = new FormData()

  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  })

  if (!uploadResponse.ok) {
    throw new Error('Không thể tải ảnh sự kiện lên Cloudinary')
  }

  const data = await uploadResponse.json()

  return {
    public_id: data.public_id,
    type,
    url: data.secure_url,
    secure_url: data.secure_url,
    width: data.width,
    height: data.height,
    format: data.format,
  }
}

export async function uploadAvatar(file) {
  if (!file) return null

  const signatureResponse = await http.post('/uploads/cloudinary/avatar/signature')
  const { upload_url: uploadUrl, fields } = signatureResponse.data.data
  const formData = new FormData()

  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  })

  if (!uploadResponse.ok) {
    const errorData = await uploadResponse.json().catch(() => ({}))
    console.error('Cloudinary upload error:', errorData)
    throw new Error(errorData.error?.message || 'Không thể tải ảnh đại diện lên Cloudinary')
  }

  const data = await uploadResponse.json()

  return {
    public_id: data.public_id,
    url: data.secure_url,
    secure_url: data.secure_url,
  }
}

export async function uploadPolicyPdf(file) {
  if (!file) return null

  if (file.type !== 'application/pdf') {
    throw new Error('Vui long chon file PDF')
  }

  const signatureResponse = await http.post('/uploads/cloudinary/policy-pdf/signature')
  const { upload_url: uploadUrl, fields } = signatureResponse.data.data
  const formData = new FormData()

  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  })

  if (!uploadResponse.ok) {
    const errorData = await uploadResponse.json().catch(() => ({}))
    throw new Error(errorData.error?.message || 'Khong the tai PDF len Cloudinary')
  }

  const data = await uploadResponse.json()

  return {
    public_id: data.public_id,
    url: data.secure_url,
    secure_url: data.secure_url,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    format: data.format,
  }
}

export function uploadEventThumbnail(file) {
  return uploadEventImage(file, 'thumbnail')
}

export function uploadEventBanner(file) {
  return uploadEventImage(file, 'banner')
}
