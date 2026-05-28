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

export function uploadEventThumbnail(file) {
  return uploadEventImage(file, 'thumbnail')
}

export function uploadEventBanner(file) {
  return uploadEventImage(file, 'banner')
}
