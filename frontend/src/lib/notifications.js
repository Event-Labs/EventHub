export function parseNotificationContent(content) {
  if (!content || typeof content !== 'string' || !content.trim().startsWith('{')) return {}
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

export function formatNotificationDisplay(notification) {
  if (!notification) return { title: 'Thông báo', content: '' }

  let title = notification.title || 'Thông báo'
  let content = notification.content || ''

  const meta = parseNotificationContent(content)

  if (title === 'STAFF_INVITATION' || meta?.status) {
    title = 'Lời mời làm nhân sự'
    const orgName = meta?.organization_name || meta?.organizer_name || 'Ban tổ chức'
    const eventTitle = meta?.event_title || notification.event?.title
    const eventName = eventTitle ? `"${eventTitle}"` : 'sự kiện'
    const roleName = meta?.staff_role ? ` (${meta.staff_role})` : ''

    if (meta?.status === 'ACCEPTED') {
      content = `Bạn đã đồng ý tham gia làm nhân sự cho ${eventName}.`
    } else if (meta?.status === 'DECLINED') {
      content = `Bạn đã từ chối lời mời làm nhân sự cho ${eventName}.`
    } else if (meta?.status === 'CANCELLED') {
      content = `Lời mời làm nhân sự cho ${eventName} đã bị hủy.`
    } else {
      content = `${orgName} đã gửi lời mời bạn làm nhân sự${roleName} cho ${eventName}.`
    }
  }

  return { title, content }
}
