import { translateEventTitle, translateEventHtmlDescription } from '../i18n/eventTranslations.js'
import { translatePhrase } from '../i18n/phraseDictionary.js'

const DAYS_MAP = {
  'Thứ Hai': 'Monday',
  'Thứ hai': 'Monday',
  'Thứ Ba': 'Tuesday',
  'Thứ ba': 'Tuesday',
  'Thứ Tư': 'Wednesday',
  'Thứ tư': 'Wednesday',
  'Thứ Năm': 'Thursday',
  'Thứ năm': 'Thursday',
  'Thứ Sáu': 'Friday',
  'Thứ sáu': 'Friday',
  'Thứ Bảy': 'Saturday',
  'Thứ bảy': 'Saturday',
  'Chủ Nhật': 'Sunday',
  'Chủ nhật': 'Sunday',
}

function translateDateString(str) {
  if (!str) return ''
  let res = str
  for (const [vi, en] of Object.entries(DAYS_MAP)) {
    res = res.replace(new RegExp(vi, 'g'), en)
  }
  return res
}

export function parseNotificationContent(content) {
  if (!content || typeof content !== 'string' || !content.trim().startsWith('{')) return {}
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

export function translateNotificationTitle(title, isEnglish = false) {
  if (!title || typeof title !== 'string' || !isEnglish) return title || ''

  const t = title.trim()

  const EXACT_TITLES = {
    'Hoàn tiền vé thành công': 'Ticket Refund Successful',
    'Yêu cầu hoàn tiền vé đã bị từ chối': 'Ticket Refund Request Rejected',
    'Yêu cầu hoàn tiền vé mới': 'New Ticket Refund Request',
    'Khiếu nại hoàn tiền: Khách hàng chưa nhận được tiền': 'Refund Dispute: Customer has not received refund',
    'Khách hàng đã nhận được tiền hoàn': 'Customer Confirmed Refund Receipt',
    'Thanh toán thành công': 'Payment Successful',
    'Sự kiện đã bị hủy cưỡng chế': 'Event Forcefully Cancelled',
    'Yêu cầu hủy sự kiện đã được duyệt': 'Event Cancellation Request Approved',
    'Yêu cầu hủy sự kiện bị từ chối': 'Event Cancellation Request Rejected',
    'Bản sửa đổi sự kiện đã được phê duyệt': 'Event Revision Approved',
    'Bản sửa đổi sự kiện bị từ chối': 'Event Revision Rejected',
    'Hồ sơ Organizer đã được duyệt': 'Organizer Profile Approved',
    'Hồ sơ Organizer chưa được duyệt': 'Organizer Profile Not Approved',
    'Lời mời làm nhân sự': 'Staff Invitation',
    'Lời mời làm staff': 'Staff Invitation',
    'STAFF_INVITATION': 'Staff Invitation',
    'Thông báo': 'Notification',
  }

  if (EXACT_TITLES[t]) return EXACT_TITLES[t]

  // Reminder 2h: Nhắc lịch: "..." sắp diễn ra trong 2 giờ tới!
  const rem2hMatch = t.match(/^Nhắc lịch:\s*"(.*?)"\s*sắp diễn ra trong 2 giờ tới!?$/i)
  if (rem2hMatch) {
    const eventName = translateEventTitle(rem2hMatch[1], true)
    return `Reminder: "${eventName}" is starting in the next 2 hours!`
  }

  // Reminder 24h: Nhắc lịch: "..." diễn ra trong 24 giờ tới (...)
  const rem24hMatch = t.match(/^Nhắc lịch:\s*"(.*?)"\s*diễn ra trong 24 giờ tới\s*\((.*?)\)$/i)
  if (rem24hMatch) {
    const eventName = translateEventTitle(rem24hMatch[1], true)
    const translatedDate = translateDateString(rem24hMatch[2])
    return `Reminder: "${eventName}" takes place in the next 24 hours (${translatedDate})`
  }

  if (t.startsWith('Nhắc lịch:')) {
    return t.replace(/^Nhắc lịch:\s*/, 'Reminder: ')
  }

  // Sự kiện "..." đã bị hủy
  const cancelMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã bị hủy$/i)
  if (cancelMatch) {
    const eventName = translateEventTitle(cancelMatch[1], true)
    return `Event "${eventName}" has been cancelled`
  }

  // Cập nhật thông tin sự kiện "..."
  const updateMatch = t.match(/^Cập nhật thông tin sự kiện\s*"(.*?)"$/i)
  if (updateMatch) {
    const eventName = translateEventTitle(updateMatch[1], true)
    return `Important update for event "${eventName}"`
  }

  // Đánh giá sự kiện: "..."
  const feedbackMatch = t.match(/^Đánh giá sự kiện:\s*"(.*?)"$/i)
  if (feedbackMatch) {
    const eventName = translateEventTitle(feedbackMatch[1], true)
    return `Event Review: "${eventName}"`
  }

  // Sự kiện "..." đã bị ẩn
  const hideMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã bị ẩn$/i)
  if (hideMatch) {
    const eventName = translateEventTitle(hideMatch[1], true)
    return `Event "${eventName}" has been hidden`
  }

  // Sự kiện "..." đã được khôi phục
  const restoreMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã được khôi phục$/i)
  if (restoreMatch) {
    const eventName = translateEventTitle(restoreMatch[1], true)
    return `Event "${eventName}" has been restored`
  }

  // Sự kiện "..." đã được phê duyệt
  const approveMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã được phê duyệt$/i)
  if (approveMatch) {
    const eventName = translateEventTitle(approveMatch[1], true)
    return `Event "${eventName}" has been approved`
  }

  // Sự kiện "..." đã bị từ chối
  const rejectMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã bị từ chối$/i)
  if (rejectMatch) {
    const eventName = translateEventTitle(rejectMatch[1], true)
    return `Event "${eventName}" has been rejected`
  }

  return translatePhrase(t, 'en') || t
}

export function translateNotificationContent(text, isEnglish = false) {
  if (!text || typeof text !== 'string' || !isEnglish) return text || ''

  let t = text.trim()

  // 1. Refunds:
  // "Yêu cầu hoàn tiền vé EH-64B6645415 đã hoàn tất. Số tiền: 100.000 VND."
  const refundDoneMatch = t.match(/^Yêu cầu hoàn tiền (vé|đơn)\s+([^\s]+)\s+đã hoàn tất\.\s*Số tiền:\s*(.*?)\.?$/i)
  if (refundDoneMatch) {
    const itemType = refundDoneMatch[1].toLowerCase() === 'vé' ? 'ticket' : 'order'
    const code = refundDoneMatch[2]
    const amount = refundDoneMatch[3]
    return `Refund request for ${itemType} ${code} has been completed. Amount: ${amount}.`
  }

  // "Yêu cầu hoàn tiền cho vé ... đã bị từ chối. Lý do: ..."
  const refundRejectMatch = t.match(/^Yêu cầu hoàn tiền cho vé\s+(.*?)\s+đã bị từ chối\.\s*Lý do:\s*(.*?)\.?$/i)
  if (refundRejectMatch) {
    return `Refund request for ticket ${refundRejectMatch[1]} was rejected. Reason: ${refundRejectMatch[2]}.`
  }

  // "Có yêu cầu hoàn vé mới cho sự kiện "..."..."
  const refundNewMatch = t.match(/^Có yêu cầu hoàn vé mới cho sự kiện\s*"(.*?)"\.\s*Mã vé:\s*(.*?),\s*số tiền:\s*(.*?)\.?$/i)
  if (refundNewMatch) {
    const eventName = translateEventTitle(refundNewMatch[1], true)
    return `New ticket refund request for event "${eventName}". Ticket code: ${refundNewMatch[2]}, amount: ${refundNewMatch[3]}.`
  }

  // "Khách hàng khiếu nại chưa nhận được tiền hoàn đơn ..."
  const refundDisputeMatch = t.match(/^Khách hàng khiếu nại chưa nhận được tiền hoàn đơn\s+(.*?)\.\s*Lý do:\s*(.*?)\.\s*Vui lòng kiểm tra lại đối soát\.?$/i)
  if (refundDisputeMatch) {
    return `Customer disputed not receiving refund for order ${refundDisputeMatch[1]}. Reason: ${refundDisputeMatch[2]}. Please review reconciliation.`
  }

  // "Khách hàng đã xác nhận nhận đủ tiền hoàn ... cho đơn hàng ..."
  const refundConfirmMatch = t.match(/^Khách hàng đã xác nhận nhận đủ tiền hoàn\s+(.*?)\s+cho đơn hàng\s+(.*?)\.?$/i)
  if (refundConfirmMatch) {
    return `Customer confirmed receiving the full refund of ${refundConfirmMatch[1]} for order ${refundConfirmMatch[2]}.`
  }

  // 2. Reminders:
  // "Sự kiện "NGÔI NHÀ KHÔNG CÓ ĐÀN ÔNG" sẽ bắt đầu lúc 01:00 - 05:00, Thứ Sáu, 06/11/2026 tại Quoc Thao Stage. Hãy chuẩn bị vé điện tử để check-in đúng giờ."
  const reminderMatch = t.match(/^Sự kiện\s*"(.*?)"\s*sẽ bắt đầu lúc\s*(.*?),\s*([^\.]+?)(?:\s+tại\s+([^\.]+?)|(?:\s*\(Trực tuyến\)))?\.\s*Hãy chuẩn bị vé điện tử để check-in đúng giờ\.?$/i)
  if (reminderMatch) {
    const eventName = translateEventTitle(reminderMatch[1], true)
    const timeStr = reminderMatch[2]
    const rawDateStr = reminderMatch[3]
    const venueStr = reminderMatch[4]
    const translatedDate = translateDateString(rawDateStr)
    const venuePart = venueStr ? ` at ${venueStr}` : (t.includes('Trực tuyến') ? ' (Online)' : '')
    return `Event "${eventName}" will start at ${timeStr}, ${translatedDate}${venuePart}. Please have your e-ticket ready for on-time check-in.`
  }

  // 3. Orders:
  // "Đơn hàng ... cho sự kiện "..." đã được thanh toán thành công. Vé của bạn đã sẵn sàng trong mục Vé của tôi."
  const orderPaidMatch = t.match(/^Đơn hàng\s+(.*?)\s+cho sự kiện\s*"(.*?)"\s*đã được thanh toán thành công\.\s*Vé của bạn đã sẵn sàng trong mục Vé của tôi\.?$/i)
  if (orderPaidMatch) {
    const eventName = translateEventTitle(orderPaidMatch[2], true)
    return `Order ${orderPaidMatch[1]} for event "${eventName}" was paid successfully. Your tickets are ready in My Tickets.`
  }

  // 4. Cancellation:
  // "Sự kiện "..." đã chính thức bị hủy... Hệ thống đã tự động tạo yêu cầu hoàn tiền 100%. Vui lòng vào mục "Vé của tôi"..."
  const cancelAttMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã chính thức bị hủy(.*?)\.\s*Hệ thống đã tự động tạo yêu cầu hoàn tiền 100%\.\s*Vui lòng vào mục "Vé của tôi" để kiểm tra và cung cấp thông tin tài khoản ngân hàng nhận tiền hoàn\.?$/i)
  if (cancelAttMatch) {
    const eventName = translateEventTitle(cancelAttMatch[1], true)
    const reason = cancelAttMatch[2].replace(/^\s*\(Lý do:\s*(.*?)\)/i, ' (Reason: $1)')
    return `Event "${eventName}" has been officially cancelled${reason}. A 100% refund request has been automatically created. Please go to "My Tickets" to check and provide bank account information for your refund.`
  }

  // "Sự kiện "..." đã bị Quản trị viên hủy cưỡng chế..."
  const forceCancelMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã bị Quản trị viên hủy cưỡng chế sau thời gian chờ Cooling-off\.\s*Tiến trình hoàn tiền 100% cho khách hàng đã được kích hoạt\.?$/i)
  if (forceCancelMatch) {
    const eventName = translateEventTitle(forceCancelMatch[1], true)
    return `Event "${eventName}" was forcefully cancelled by Admin after the cooling-off period. The 100% refund process has been activated.`
  }

  // "Yêu cầu hủy sự kiện "..." đã được Quản trị viên phê duyệt..."
  const cancelApprovedMatch = t.match(/^Yêu cầu hủy sự kiện\s*"(.*?)"\s*đã được Quản trị viên phê duyệt\.\s*Tiến trình hoàn tiền 100% cho khách hàng đã được khởi tạo\.\s*Vui lòng vào mục Quản lý yêu cầu Hoàn vé để kiểm tra và thực hiện hoàn tiền cho người mua\.?$/i)
  if (cancelApprovedMatch) {
    const eventName = translateEventTitle(cancelApprovedMatch[1], true)
    return `Cancellation request for event "${eventName}" has been approved by Admin. The 100% refund process has been initialized. Please visit Refund Management to review and process refunds.`
  }

  // "Yêu cầu hủy sự kiện "..." đã bị Quản trị viên từ chối..."
  const cancelRejectMatch = t.match(/^Yêu cầu hủy sự kiện\s*"(.*?)"\s*đã bị Quản trị viên từ chối(.*?)\.\s*Trạng thái bán vé của sự kiện được chuyển về Tạm dừng bán vé\.\s*Bạn có thể mở bán lại vé khi đã sẵn sàng\.?$/i)
  if (cancelRejectMatch) {
    const eventName = translateEventTitle(cancelRejectMatch[1], true)
    const reasonPart = cancelRejectMatch[2].replace(/với lý do:\s*"(.*?)"/i, 'with reason: "$1"')
    return `Cancellation request for event "${eventName}" was rejected by Admin${reasonPart}. Ticket sales status is set to Paused. You can reopen sales when ready.`
  }

  // 5. Updates & Revisions:
  // "Sự kiện "..." vừa có cập nhật thông tin quan trọng..."
  const updateAttMatch = t.match(/^Sự kiện\s*"(.*?)"\s*vừa có cập nhật thông tin quan trọng(.*?)\.\s*Quý khách vui lòng kiểm tra lại vé và lịch trình tham dự trong mục "Vé của tôi"\.?$/i)
  if (updateAttMatch) {
    const eventName = translateEventTitle(updateAttMatch[1], true)
    return `Event "${eventName}" has an important update${updateAttMatch[2]}. Please check your tickets and schedule in "My Tickets".`
  }

  // "Bản sửa đổi cho sự kiện "..." đã được Quản trị viên phê duyệt thành công."
  const revisionApproveMatch = t.match(/^Bản sửa đổi cho sự kiện\s*"(.*?)"\s*đã được Quản trị viên phê duyệt thành công\.?$/i)
  if (revisionApproveMatch) {
    const eventName = translateEventTitle(revisionApproveMatch[1], true)
    return `Event revision for "${eventName}" has been successfully approved by Admin.`
  }

  // "Bản sửa đổi cho sự kiện "..." đã bị Quản trị viên từ chối..."
  const revisionRejectMatch = t.match(/^Bản sửa đổi cho sự kiện\s*"(.*?)"\s*đã bị Quản trị viên từ chối(.*?)\.?$/i)
  if (revisionRejectMatch) {
    const eventName = translateEventTitle(revisionRejectMatch[1], true)
    const reasonPart = revisionRejectMatch[2].replace(/với lý do:\s*"(.*?)"/i, 'with reason: "$1"')
    return `Event revision for "${eventName}" was rejected by Admin${reasonPart}.`
  }

  // "Sự kiện "..." của bạn đã bị Admin ẩn..."
  const hideEventMatch = t.match(/^Sự kiện\s*"(.*?)"\s*của bạn đã bị Admin ẩn khỏi nền tảng do phát hiện vi phạm hoặc vấn đề cần xem xét\.(.*)$/is)
  if (hideEventMatch) {
    const eventName = translateEventTitle(hideEventMatch[1], true)
    const rest = hideEventMatch[2]
      .replace(/Lý do:\s*(.*)/i, 'Reason: $1')
      .replace(/Vui lòng liên hệ hỗ trợ để biết thêm thông tin\./i, 'Please contact support for more details.')
    return `Your event "${eventName}" has been hidden by Admin due to detected policy violations or issues under review.${rest}`
  }

  // "Sự kiện "..." của bạn đã được Admin khôi phục..."
  const restoreEventMatch = t.match(/^Sự kiện\s*"(.*?)"\s*của bạn đã được Admin khôi phục và hiện đang hiển thị công khai trên nền tảng\.?$/i)
  if (restoreEventMatch) {
    const eventName = translateEventTitle(restoreEventMatch[1], true)
    return `Your event "${eventName}" has been restored by Admin and is now publicly visible on the platform.`
  }

  // "Sự kiện "..." của bạn đã được Admin phê duyệt..."
  const approveEventMatch = t.match(/^Sự kiện\s*"(.*?)"\s*của bạn đã được Admin phê duyệt thành công\.?$/i)
  if (approveEventMatch) {
    const eventName = translateEventTitle(approveEventMatch[1], true)
    return `Your event "${eventName}" has been successfully approved by Admin.`
  }

  // 6. Feedback:
  // "Sự kiện "..." đã đi qua 2/3 thời gian..."
  const feedbackMatch = t.match(/^Sự kiện\s*"(.*?)"\s*đã đi qua 2\/3 thời gian\.\s*Hãy chia sẻ cảm nhận và phản hồi của bạn để ban tổ chức ngày càng hoàn thiện hơn nhé!?$/i)
  if (feedbackMatch) {
    const eventName = translateEventTitle(feedbackMatch[1], true)
    return `Event "${eventName}" has completed 2/3 of its duration. Please share your thoughts and feedback to help the organizer improve!`
  }

  // 7. Organizer application:
  // "Chúc mừng! Hồ sơ đăng ký Organizer của bạn cho "..." đã được phê duyệt..."
  const orgApproveMatch = t.match(/^Chúc mừng!\s*Hồ sơ đăng ký Organizer của bạn cho\s*"(.*?)"\s*đã được phê duyệt\.\s*Bạn có thể đăng xuất và đăng nhập lại để bắt đầu tạo sự kiện\.?$/i)
  if (orgApproveMatch) {
    return `Congratulations! Your Organizer application for "${orgApproveMatch[1]}" has been approved. Please log out and log back in to start creating events.`
  }

  const orgApproveOrgMatch = t.match(/^Hồ sơ đăng ký của tổ chức\s*"(.*?)"\s*đã được phê duyệt\.\s*Thông tin tài khoản đã được gửi đến email\s*(.*?)\.?$/i)
  if (orgApproveOrgMatch) {
    return `Application for organization "${orgApproveOrgMatch[1]}" has been approved. Account details have been sent to email ${orgApproveOrgMatch[2]}.`
  }

  const orgRejectMatch = t.match(/^Rất tiếc,\s*hồ sơ đăng ký Organizer của bạn cho\s*"(.*?)"\s*chưa được phê duyệt\.(.*)$/is)
  if (orgRejectMatch) {
    const rest = orgRejectMatch[2]
      .replace(/Lý do:\s*(.*)/i, 'Reason: $1')
      .replace(/Bạn có thể cập nhật thông tin và gửi lại yêu cầu\./i, 'You can update your information and resubmit.')
    return `Unfortunately, your Organizer application for "${orgRejectMatch[1]}" was not approved.${rest}`
  }

  // If HTML, translate inner phrases
  if (/<[a-z][\s\S]*>/i.test(t)) {
    return translateEventHtmlDescription(t, true)
  }

  return translatePhrase(t, 'en') || t
}

export function formatNotificationDisplay(notification, isEnglish = false) {
  if (!notification) return { title: isEnglish ? 'Notification' : 'Thông báo', content: '' }

  let title = notification.title || (isEnglish ? 'Notification' : 'Thông báo')
  let content = notification.content || ''

  const meta = parseNotificationContent(content)

  if (title === 'STAFF_INVITATION' || meta?.status) {
    title = isEnglish ? 'Staff Invitation' : 'Lời mời làm nhân sự'
    const orgName = meta?.organization_name || meta?.organizer_name || (isEnglish ? 'Organizer' : 'Ban tổ chức')
    const rawEventTitle = meta?.event_title || notification.event?.title
    const eventTitle = isEnglish ? translateEventTitle(rawEventTitle, true) : rawEventTitle
    const eventName = eventTitle ? `"${eventTitle}"` : (isEnglish ? 'event' : 'sự kiện')
    const roleName = meta?.staff_role ? ` (${meta.staff_role})` : ''

    if (meta?.status === 'ACCEPTED') {
      content = isEnglish
        ? `You agreed to join as staff for ${eventName}.`
        : `Bạn đã đồng ý tham gia làm nhân sự cho ${eventName}.`
    } else if (meta?.status === 'DECLINED') {
      content = isEnglish
        ? `You declined the staff invitation for ${eventName}.`
        : `Bạn đã từ chối lời mời làm nhân sự cho ${eventName}.`
    } else if (meta?.status === 'CANCELLED') {
      content = isEnglish
        ? `The staff invitation for ${eventName} was cancelled.`
        : `Lời mời làm nhân sự cho ${eventName} đã bị hủy.`
    } else {
      content = isEnglish
        ? `${orgName} invited you to join as staff${roleName} for ${eventName}.`
        : `${orgName} đã gửi lời mời bạn làm nhân sự${roleName} cho ${eventName}.`
    }
  } else if (isEnglish) {
    title = translateNotificationTitle(title, true)
    content = translateNotificationContent(content, true)
  }

  return { title, content }
}
