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

export async function uploadOrganizerAvatar(file) {
  if (!file) return null

  const signatureResponse = await http.post('/uploads/cloudinary/organizer-avatar/signature')
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
    throw new Error(errorData.error?.message || 'Không thể tải ảnh tổ chức lên Cloudinary')
  }

  const data = await uploadResponse.json()

  return {
    public_id: data.public_id,
    url: data.secure_url,
    secure_url: data.secure_url,
  }
}

const ORGANIZER_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const ORGANIZER_IMAGE_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export async function uploadOrganizerDocument(file, options = {}) {
  if (!file) return null

  const allowedTypes = options.imageOnly ? ORGANIZER_IMAGE_DOCUMENT_TYPES : ORGANIZER_DOCUMENT_TYPES
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      options.imageOnly
        ? 'Vui lòng chọn ảnh JPG, PNG hoặc WEBP'
        : 'Vui lòng chọn file PDF, DOCX hoặc ảnh JPG/PNG/WEBP',
    )
  }

  const signatureResponse = await http.post('/uploads/cloudinary/organizer-document/signature')
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
    console.error('Cloudinary organizer document upload error:', errorData)
    throw new Error(errorData.error?.message || 'Không thể tải tài liệu minh chứng lên Cloudinary')
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

const POLICY_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

export async function uploadPolicyDocument(file) {
  if (!file) return null

  if (!POLICY_DOCUMENT_TYPES.includes(file.type)) {
    throw new Error('Vui lòng chọn file PDF, DOCX hoặc TXT')
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
    throw new Error(errorData.error?.message || 'Khong the tai tai lieu len Cloudinary')
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

export const uploadPolicyPdf = uploadPolicyDocument

export function uploadEventThumbnail(file) {
  return uploadEventImage(file, 'thumbnail')
}

export function uploadEventBanner(file) {
  return uploadEventImage(file, 'banner')
}

const ANNOUNCEMENT_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
]

export async function uploadAnnouncementAttachment(file) {
  if (!file) return null

  // Max 25MB file
  const maxSize = 25 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error('Dung lượng tệp đính kèm không được vượt quá 25MB')
  }

  const signatureResponse = await http.post('/uploads/cloudinary/announcement-attachment/signature')
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
    throw new Error(errorData.error?.message || 'Không thể tải tệp đính kèm lên đám mây')
  }

  const data = await uploadResponse.json()

  return {
    public_id: data.public_id,
    filename: file.name,
    path: data.secure_url,
    url: data.secure_url,
    secure_url: data.secure_url,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    format: data.format,
  }
}
