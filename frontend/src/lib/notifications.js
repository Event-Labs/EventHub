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

const DAYS_MAP_REVERSE = {
  'Monday': 'Thứ Hai',
  'Tuesday': 'Thứ Ba',
  'Wednesday': 'Thứ Tư',
  'Thursday': 'Thứ Năm',
  'Friday': 'Thứ Sáu',
  'Saturday': 'Thứ Bảy',
  'Sunday': 'Chủ Nhật',
}

function translateDateString(str) {
  if (!str) return ''
  let res = str
  for (const [vi, en] of Object.entries(DAYS_MAP)) {
    res = res.replace(new RegExp(vi, 'g'), en)
  }
  return res
}

function translateDateStringToVi(str) {
  if (!str) return ''
  let res = str
  for (const [en, vi] of Object.entries(DAYS_MAP_REVERSE)) {
    res = res.replace(new RegExp(en, 'gi'), vi)
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

const EXACT_TITLES_VI_TO_EN = {
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
  'Thay đổi thời gian check-in': 'Check-in Time Change',
  'Thay đổi thời gian check in': 'Check-in Time Change',
  'Thông báo nho nhỏ': 'Small Announcement',
  'Test thông báo': 'Test Notification',
  'TEST THÔNG BÁO': 'Test Notification',
  'Cập nhật địa điểm': 'Venue Update',
  'Thông báo khẩn': 'Urgent Notification',
  'Thông báo quan trọng': 'Important Announcement',
  'Khiếu nại của bạn đã được tiếp nhận': 'Your dispute has been received',
}

const EXACT_TITLES_EN_TO_VI = {
  'Ticket Refund Successful': 'Hoàn tiền vé thành công',
  'Ticket Refund Request Rejected': 'Yêu cầu hoàn tiền vé đã bị từ chối',
  'New Ticket Refund Request': 'Yêu cầu hoàn tiền vé mới',
  'Refund Dispute: Customer has not received refund': 'Khiếu nại hoàn tiền: Khách hàng chưa nhận được tiền',
  'Customer Confirmed Refund Receipt': 'Khách hàng đã nhận được tiền hoàn',
  'Payment Successful': 'Thanh toán thành công',
  'Event Forcefully Cancelled': 'Sự kiện đã bị hủy cưỡng chế',
  'Event Cancellation Request Approved': 'Yêu cầu hủy sự kiện đã được duyệt',
  'Event Cancellation Request Rejected': 'Yêu cầu hủy sự kiện bị từ chối',
  'Event Revision Approved': 'Bản sửa đổi sự kiện đã được phê duyệt',
  'Event Revision Rejected': 'Bản sửa đổi sự kiện bị từ chối',
  'Organizer Profile Approved': 'Hồ sơ Organizer đã được duyệt',
  'Organizer Profile Not Approved': 'Hồ sơ Organizer chưa được duyệt',
  'Staff Invitation': 'Lời mời làm nhân sự',
  'STAFF_INVITATION': 'Lời mời làm nhân sự',
  'Notification': 'Thông báo',
  'Check-in Time Change': 'Thay đổi thời gian check-in',
  'Check-in Time Update': 'Thay đổi thời gian check-in',
  'Check-in time change': 'Thay đổi thời gian check-in',
  'Small Announcement': 'Thông báo nho nhỏ',
  'A Small Announcement': 'Thông báo nho nhỏ',
  'Test Notification': 'Test thông báo',
  'TEST NOTIFICATION': 'TEST THÔNG BÁO',
  'Venue Update': 'Cập nhật địa điểm',
  'Urgent Notification': 'Thông báo khẩn',
  'Urgent Announcement': 'Thông báo khẩn',
  'Important Announcement': 'Thông báo quan trọng',
  'Important Notification': 'Thông báo quan trọng',
  'Your dispute has been received': 'Khiếu nại của bạn đã được tiếp nhận',
}

export function translateNotificationTitle(title, isEnglish = false) {
  if (!title || typeof title !== 'string') return isEnglish ? 'Notification' : 'Thông báo'
  const t = title.trim()
  if (!t) return isEnglish ? 'Notification' : 'Thông báo'

  if (isEnglish) {
    if (EXACT_TITLES_VI_TO_EN[t]) return EXACT_TITLES_VI_TO_EN[t]

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

  // ----------------------------------------------------
  // VIETNAMESE MODE (isEnglish === false)
  // Revert any English titles to Vietnamese
  // ----------------------------------------------------
  if (EXACT_TITLES_EN_TO_VI[t]) return EXACT_TITLES_EN_TO_VI[t]

  // Reminder 2h: Reminder: "..." is starting in the next 2 hours!
  const rem2hEnMatch = t.match(/^Reminder:\s*"(.*?)"\s*is starting in the next 2 hours!?$/i)
  if (rem2hEnMatch) {
    const eventName = translateEventTitle(rem2hEnMatch[1], false)
    return `Nhắc lịch: "${eventName}" sắp diễn ra trong 2 giờ tới!`
  }

  // Reminder 24h: Reminder: "..." takes place in the next 24 hours (...)
  const rem24hEnMatch = t.match(/^Reminder:\s*"(.*?)"\s*takes place in the next 24 hours\s*\((.*?)\)$/i)
  if (rem24hEnMatch) {
    const eventName = translateEventTitle(rem24hEnMatch[1], false)
    const translatedDate = translateDateStringToVi(rem24hEnMatch[2])
    return `Nhắc lịch: "${eventName}" diễn ra trong 24 giờ tới (${translatedDate})`
  }

  if (/^Reminder:\s*/i.test(t)) {
    const rest = t.replace(/^Reminder:\s*/i, '')
    const matchQuote = rest.match(/^"(.*?)"(.*)$/)
    if (matchQuote) {
      const eventName = translateEventTitle(matchQuote[1], false)
      return `Nhắc lịch: "${eventName}"${matchQuote[2]}`
    }
    return `Nhắc lịch: ${rest}`
  }

  // Event cancelled: Event "..." has been cancelled
  const cancelEnMatch = t.match(/^Event\s*"(.*?)"\s*has been cancelled$/i)
  if (cancelEnMatch) {
    const eventName = translateEventTitle(cancelEnMatch[1], false)
    return `Sự kiện "${eventName}" đã bị hủy`
  }

  // Important update for event "..."
  const updateEnMatch = t.match(/^Important update for event\s*"(.*?)"$/i)
  if (updateEnMatch) {
    const eventName = translateEventTitle(updateEnMatch[1], false)
    return `Cập nhật thông tin sự kiện "${eventName}"`
  }

  // Event Review: "..."
  const feedbackEnMatch = t.match(/^Event Review:\s*"(.*?)"$/i)
  if (feedbackEnMatch) {
    const eventName = translateEventTitle(feedbackEnMatch[1], false)
    return `Đánh giá sự kiện: "${eventName}"`
  }

  // Event "..." has been hidden
  const hideEnMatch = t.match(/^Event\s*"(.*?)"\s*has been hidden$/i)
  if (hideEnMatch) {
    const eventName = translateEventTitle(hideEnMatch[1], false)
    return `Sự kiện "${eventName}" đã bị ẩn`
  }

  // Event "..." has been restored
  const restoreEnMatch = t.match(/^Event\s*"(.*?)"\s*has been restored$/i)
  if (restoreEnMatch) {
    const eventName = translateEventTitle(restoreEnMatch[1], false)
    return `Sự kiện "${eventName}" đã được khôi phục`
  }

  // Event "..." has been approved
  const approveEnMatch = t.match(/^Event\s*"(.*?)"\s*has been approved$/i)
  if (approveEnMatch) {
    const eventName = translateEventTitle(approveEnMatch[1], false)
    return `Sự kiện "${eventName}" đã được phê duyệt`
  }

  // Event "..." has been rejected
  const rejectEnMatch = t.match(/^Event\s*"(.*?)"\s*has been rejected$/i)
  if (rejectEnMatch) {
    const eventName = translateEventTitle(rejectEnMatch[1], false)
    return `Sự kiện "${eventName}" đã bị từ chối`
  }

  return t
}

function translateAnnouncementPhrases(raw, isEnglish = false) {
  if (!raw || typeof raw !== 'string') return ''
  let text = raw

  if (isEnglish) {
    text = text
      .replace(/Xin(?:&nbsp;|\s)*chào(?:&nbsp;|\s)*khách(?:&nbsp;|\s)*hàng(?:&nbsp;|\s)*của(?:&nbsp;|\s)*Art,?(?:&nbsp;|\s)*/gi, "Dear Art's valued customers, ")
      .replace(/Xin(?:&nbsp;|\s)*chào(?:&nbsp;|\s)*các(?:&nbsp;|\s)*bạn,?(?:&nbsp;|\s)*/gi, "Hello everyone, ")
      .replace(/Xin(?:&nbsp;|\s)*chào(?:&nbsp;|\s)*quý(?:&nbsp;|\s)*khách,?(?:&nbsp;|\s)*/gi, "Dear valued guests, ")
      .replace(/Art(?:&nbsp;|\s)*xin(?:&nbsp;|\s)*thông(?:&nbsp;|\s)*báo(?:&nbsp;|\s)*rằng(?:&nbsp;|\s)*thời(?:&nbsp;|\s)*gian(?:&nbsp;|\s)*check-?in(?:&nbsp;|\s)*của(?:&nbsp;|\s)*sự(?:&nbsp;|\s)*kiện(?:&nbsp;|\s)*(.*?)(?:&nbsp;|\s)*sẽ(?:&nbsp;|\s)*diễn(?:&nbsp;|\s)*ra(?:&nbsp;|\s)*sớm(?:&nbsp;|\s)*hơn(?:&nbsp;|\s)*(?:thêm(?:&nbsp;|\s)*)?(\d+)(?:&nbsp;|\s)*phút\.?/gi,
        (m, ev, min) => `Art would like to announce that check-in for the event ${translateEventTitle(ev, true)} will start ${min} minutes earlier.`)
      .replace(/Art(?:&nbsp;|\s)*xin(?:&nbsp;|\s)*thông(?:&nbsp;|\s)*báo(?:&nbsp;|\s)*rằng(?:&nbsp;|\s)*thời(?:&nbsp;|\s)*gian(?:&nbsp;|\s)*check-?in(?:&nbsp;|\s)*sẽ(?:&nbsp;|\s)*diễn(?:&nbsp;|\s)*ra(?:&nbsp;|\s)*sớm(?:&nbsp;|\s)*hơn(?:&nbsp;|\s)*(?:thêm(?:&nbsp;|\s)*)?(\d+)(?:&nbsp;|\s)*phút\.?/gi,
        'Art would like to announce that check-in will start $1 minutes earlier.')
      .replace(/Mong(?:&nbsp;|\s)*các(?:&nbsp;|\s)*khách(?:&nbsp;|\s)*hàng(?:&nbsp;|\s)*thân(?:&nbsp;|\s)*yêu(?:&nbsp;|\s)*của(?:&nbsp;|\s)*Art(?:&nbsp;|\s)*chú(?:&nbsp;|\s)*ý(?:&nbsp;|\s)*thời(?:&nbsp;|\s)*gian(?:&nbsp;|\s)*để(?:&nbsp;|\s)*đến(?:&nbsp;|\s)*tham(?:&nbsp;|\s)*gia(?:&nbsp;|\s)*một(?:&nbsp;|\s)*cách(?:&nbsp;|\s)*trọn(?:&nbsp;|\s)*vẹn(?:&nbsp;|\s)*hơn\.?/gi,
        "We hope Art's dear customers note the time to enjoy a complete experience.")
      .replace(/Art(?:&nbsp;|\s)*cảm(?:&nbsp;|\s)*ơn(?:&nbsp;|\s)*rất(?:&nbsp;|\s)*nhiều!?/gi, "Thank you very much from Art!!!")
      .replace(/Art(?:&nbsp;|\s)*xin(?:&nbsp;|\s)*thông(?:&nbsp;|\s)*báo(?:&nbsp;|\s)*rằng(?:&nbsp;|\s)*khi(?:&nbsp;|\s)*tham(?:&nbsp;|\s)*gia(?:&nbsp;|\s)*workshop(?:&nbsp;|\s)*sẽ(?:&nbsp;|\s)*có(?:&nbsp;|\s)*những(?:&nbsp;|\s)*món(?:&nbsp;|\s)*quà(?:&nbsp;|\s)*bí(?:&nbsp;|\s)*mật(?:&nbsp;|\s)*dành(?:&nbsp;|\s)*cho(?:&nbsp;|\s)*các(?:&nbsp;|\s)*bạn\.?(?:&nbsp;|\s)*Mong(?:&nbsp;|\s)*các(?:&nbsp;|\s)*bạn(?:&nbsp;|\s)*sẽ(?:&nbsp;|\s)*đến(?:&nbsp;|\s)*check-?in(?:&nbsp;|\s)*đúng(?:&nbsp;|\s)*giờ(?:&nbsp;|\s)*và(?:&nbsp;|\s)*đầy(?:&nbsp;|\s)*đủ(?:&nbsp;|\s)*nhé\.?/gi,
        "Art would like to announce that secret gifts await workshop attendees. Hope you will check in on time and join fully.")
      .replace(/Yêu(?:&nbsp;|\s)*cả(?:&nbsp;|\s)*nhà!?/gi, "Love you all!!!")
      .replace(/Link(?:&nbsp;|\s)*sự(?:&nbsp;|\s)*kiện:?/gi, "Event link:")
    return text
  }

  // Revert English phrases back to Vietnamese
  text = text
    .replace(/Dear(?:&nbsp;|\s)*Art's(?:&nbsp;|\s)*(?:valued(?:&nbsp;|\s)*)?customers,?(?:&nbsp;|\s)*/gi, "Xin chào khách hàng của Art, ")
    .replace(/Hello(?:&nbsp;|\s)*everyone,?(?:&nbsp;|\s)*/gi, "Xin chào các bạn, ")
    .replace(/Dear(?:&nbsp;|\s)*valued(?:&nbsp;|\s)*guests,?(?:&nbsp;|\s)*/gi, "Xin chào quý khách, ")
    .replace(/Art(?:&nbsp;|\s)*would(?:&nbsp;|\s)*like(?:&nbsp;|\s)*to(?:&nbsp;|\s)*announce(?:&nbsp;|\s)*that(?:&nbsp;|\s)*check-?in(?:&nbsp;|\s)*for(?:&nbsp;|\s)*the(?:&nbsp;|\s)*event(?:&nbsp;|\s)*(.*?)(?:&nbsp;|\s)*will(?:&nbsp;|\s)*start(?:&nbsp;|\s)*(\d+)(?:&nbsp;|\s)*minutes(?:&nbsp;|\s)*earlier\.?/gi,
      (m, ev, min) => `Art xin thông báo rằng thời gian check-in của sự kiện ${translateEventTitle(ev, false)} sẽ diễn ra sớm hơn thêm ${min} phút.`)
    .replace(/Art(?:&nbsp;|\s)*would(?:&nbsp;|\s)*like(?:&nbsp;|\s)*to(?:&nbsp;|\s)*announce(?:&nbsp;|\s)*that(?:&nbsp;|\s)*check-?in(?:&nbsp;|\s)*will(?:&nbsp;|\s)*start(?:&nbsp;|\s)*(\d+)(?:&nbsp;|\s)*minutes(?:&nbsp;|\s)*earlier\.?/gi,
      'Art xin thông báo rằng thời gian check-in sẽ diễn ra sớm hơn thêm $1 phút.')
    .replace(/We(?:&nbsp;|\s)*hope(?:&nbsp;|\s)*Art's(?:&nbsp;|\s)*dear(?:&nbsp;|\s)*customers(?:&nbsp;|\s)*note(?:&nbsp;|\s)*the(?:&nbsp;|\s)*time(?:&nbsp;|\s)*to(?:&nbsp;|\s)*enjoy(?:&nbsp;|\s)*a(?:&nbsp;|\s)*complete(?:&nbsp;|\s)*experience\.?/gi,
      "Mong các khách hàng thân yêu của Art chú ý thời gian để đến tham gia một cách trọn vẹn hơn.")
    .replace(/Thank(?:&nbsp;|\s)*you(?:&nbsp;|\s)*very(?:&nbsp;|\s)*much(?:&nbsp;|\s)*from(?:&nbsp;|\s)*Art!?/gi, "Art cảm ơn rất nhiều!!!")
    .replace(/Art(?:&nbsp;|\s)*would(?:&nbsp;|\s)*like(?:&nbsp;|\s)*to(?:&nbsp;|\s)*announce(?:&nbsp;|\s)*that(?:&nbsp;|\s)*secret(?:&nbsp;|\s)*gifts(?:&nbsp;|\s)*await(?:&nbsp;|\s)*workshop(?:&nbsp;|\s)*attendees\.?(?:&nbsp;|\s)*Hope(?:&nbsp;|\s)*you(?:&nbsp;|\s)*will(?:&nbsp;|\s)*check(?:&nbsp;|\s)*in(?:&nbsp;|\s)*on(?:&nbsp;|\s)*time(?:&nbsp;|\s)*and(?:&nbsp;|\s)*join(?:&nbsp;|\s)*fully\.?/gi,
      "Art xin thông báo rằng khi tham gia workshop sẽ có những món quà bí mật dành cho các bạn. Mong các bạn sẽ đến checkin đúng giờ và đầy đủ nhé.")
    .replace(/Love(?:&nbsp;|\s)*you(?:&nbsp;|\s)*all!?/gi, "Yêu cả nhà!!!")
    .replace(/Event(?:&nbsp;|\s)*link:?/gi, "Link sự kiện:")

  return text
}

export function translateNotificationContent(text, isEnglish = false) {
  if (!text || typeof text !== 'string') return ''
  let t = text.trim()
  if (!t) return ''

  if (isEnglish) {
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

    // 8. Complaints:
    const disputeMatch = t.match(/^Hệ thống EventHub đã ghi nhận khiếu nại\s*"(.*?)"\s*\(Mã:\s*(.*?)\)\.\s*Ban Quản trị sẽ xem xét và phản hồi trong thời gian sớm nhất\.?$/i)
    if (disputeMatch) {
      return `EventHub recorded dispute "${disputeMatch[1]}" (Code: ${disputeMatch[2]}). Admin will review and respond as soon as possible.`
    }

    // 9. Organizer Announcements (both plain text and HTML)
    let announced = translateAnnouncementPhrases(t, true)
    if (announced !== t) {
      if (/<[a-z][\s\S]*>/i.test(announced)) {
        return translateEventHtmlDescription(announced, true)
      }
      return announced
    }

    // If HTML, translate inner phrases
    if (/<[a-z][\s\S]*>/i.test(t)) {
      return translateEventHtmlDescription(t, true)
    }

    return translatePhrase(t, 'en') || t
  }

  // ----------------------------------------------------
  // VIETNAMESE MODE (isEnglish === false)
  // Revert any English content to Vietnamese
  // ----------------------------------------------------

  // 1. Reminders:
  // "Event "HOUSE WITHOUT MEN" will start at 01:00 - 05:00, Friday, 06/11/2026 at Sân Khấu Quốc Thảo. Please have your e-ticket ready for on-time check-in."
  const reminderEnMatch = t.match(/^Event\s*"(.*?)"\s*will start at\s*(.*?),\s*([^\.]+?)(?:\s+at\s+([^\.]+?)|(?:\s*\(Online\)))?\.\s*Please have your e-ticket ready for on-time check-in\.?$/i)
  if (reminderEnMatch) {
    const eventName = translateEventTitle(reminderEnMatch[1], false)
    const timeStr = reminderEnMatch[2]
    const rawDateStr = reminderEnMatch[3]
    const venueStr = reminderEnMatch[4]
    const translatedDate = translateDateStringToVi(rawDateStr)
    const venuePart = venueStr ? ` tại ${venueStr}` : (t.includes('Online') ? ' (Trực tuyến)' : '')
    return `Sự kiện "${eventName}" sẽ bắt đầu lúc ${timeStr}, ${translatedDate}${venuePart}. Hãy chuẩn bị vé điện tử để check-in đúng giờ.`
  }

  // 2. Refunds:
  // "Refund request for ticket/order ... has been completed. Amount: ..."
  const refundDoneEnMatch = t.match(/^Refund request for (ticket|order)\s+([^\s]+)\s+has been completed\.\s*Amount:\s*(.*?)\.?$/i)
  if (refundDoneEnMatch) {
    const itemType = refundDoneEnMatch[1].toLowerCase() === 'ticket' ? 'vé' : 'đơn'
    const code = refundDoneEnMatch[2]
    const amount = refundDoneEnMatch[3]
    return `Yêu cầu hoàn tiền ${itemType} ${code} đã hoàn tất. Số tiền: ${amount}.`
  }

  // "Refund request for ticket ... was rejected. Reason: ..."
  const refundRejectEnMatch = t.match(/^Refund request for ticket\s+(.*?)\s+was rejected\.\s*Reason:\s*(.*?)\.?$/i)
  if (refundRejectEnMatch) {
    return `Yêu cầu hoàn tiền cho vé ${refundRejectEnMatch[1]} đã bị từ chối. Lý do: ${refundRejectEnMatch[2]}.`
  }

  // "New ticket refund request for event "..."..."
  const refundNewEnMatch = t.match(/^New ticket refund request for event\s*"(.*?)"\.\s*Ticket code:\s*(.*?),\s*amount:\s*(.*?)\.?$/i)
  if (refundNewEnMatch) {
    const eventName = translateEventTitle(refundNewEnMatch[1], false)
    return `Có yêu cầu hoàn vé mới cho sự kiện "${eventName}". Mã vé: ${refundNewEnMatch[2]}, số tiền: ${refundNewEnMatch[3]}.`
  }

  // "Customer disputed not receiving refund for order ..."
  const refundDisputeEnMatch = t.match(/^Customer disputed not receiving refund for order\s+(.*?)\.\s*Reason:\s*(.*?)\.\s*Please review reconciliation\.?$/i)
  if (refundDisputeEnMatch) {
    return `Khách hàng khiếu nại chưa nhận được tiền hoàn đơn ${refundDisputeEnMatch[1]}. Lý do: ${refundDisputeEnMatch[2]}. Vui lòng kiểm tra lại đối soát.`
  }

  // "Customer confirmed receiving the full refund of ... for order ..."
  const refundConfirmEnMatch = t.match(/^Customer confirmed receiving the full refund of\s+(.*?)\s+for order\s+(.*?)\.?$/i)
  if (refundConfirmEnMatch) {
    return `Khách hàng đã xác nhận nhận đủ tiền hoàn ${refundConfirmEnMatch[1]} cho đơn hàng ${refundConfirmEnMatch[2]}.`
  }

  // 3. Orders:
  // "Order ... for event "..." was paid successfully. Your tickets are ready in My Tickets."
  const orderPaidEnMatch = t.match(/^Order\s+(.*?)\s+for event\s*"(.*?)"\s+was paid successfully\.\s*Your tickets are ready in My Tickets\.?$/i)
  if (orderPaidEnMatch) {
    const eventName = translateEventTitle(orderPaidEnMatch[2], false)
    return `Đơn hàng ${orderPaidEnMatch[1]} cho sự kiện "${eventName}" đã được thanh toán thành công. Vé của bạn đã sẵn sàng trong mục Vé của tôi.`
  }

  // 4. Cancellation:
  const cancelAttEnMatch = t.match(/^Event\s*"(.*?)"\s+has been officially cancelled(.*?)\.\s*A 100% refund request has been automatically created\.\s*Please go to "My Tickets" to check and provide bank account information for your refund\.?$/i)
  if (cancelAttEnMatch) {
    const eventName = translateEventTitle(cancelAttEnMatch[1], false)
    const reason = cancelAttEnMatch[2].replace(/^\s*\(Reason:\s*(.*?)\)/i, ' (Lý do: $1)')
    return `Sự kiện "${eventName}" đã chính thức bị hủy${reason}. Hệ thống đã tự động tạo yêu cầu hoàn tiền 100%. Vui lòng vào mục "Vé của tôi" để kiểm tra và cung cấp thông tin tài khoản ngân hàng nhận tiền hoàn.`
  }

  const forceCancelEnMatch = t.match(/^Event\s*"(.*?)"\s+was forcefully cancelled by Admin after the cooling-off period\.\s*The 100% refund process has been activated\.?$/i)
  if (forceCancelEnMatch) {
    const eventName = translateEventTitle(forceCancelEnMatch[1], false)
    return `Sự kiện "${eventName}" đã bị Quản trị viên hủy cưỡng chế sau thời gian chờ Cooling-off. Tiến trình hoàn tiền 100% cho khách hàng đã được kích hoạt.`
  }

  // 5. Updates & Reviews:
  const revisionApproveEnMatch = t.match(/^Event revision for\s*"(.*?)"\s+has been successfully approved by Admin\.?$/i)
  if (revisionApproveEnMatch) {
    const eventName = translateEventTitle(revisionApproveEnMatch[1], false)
    return `Bản sửa đổi cho sự kiện "${eventName}" đã được Quản trị viên phê duyệt thành công.`
  }

  const revisionRejectEnMatch = t.match(/^Event revision for\s*"(.*?)"\s+was rejected by Admin(.*?)\.?$/i)
  if (revisionRejectEnMatch) {
    const eventName = translateEventTitle(revisionRejectEnMatch[1], false)
    const reasonPart = revisionRejectEnMatch[2].replace(/with reason:\s*"(.*?)"/i, 'với lý do: "$1"')
    return `Bản sửa đổi cho sự kiện "${eventName}" đã bị Quản trị viên từ chối${reasonPart}.`
  }

  const hideEventEnMatch = t.match(/^Your event\s*"(.*?)"\s+has been hidden by Admin due to detected policy violations or issues under review\.(.*)$/is)
  if (hideEventEnMatch) {
    const eventName = translateEventTitle(hideEventEnMatch[1], false)
    const rest = hideEventEnMatch[2]
      .replace(/Reason:\s*(.*)/i, 'Lý do: $1')
      .replace(/Please contact support for more details\./i, 'Vui lòng liên hệ hỗ trợ để biết thêm thông tin.')
    return `Sự kiện "${eventName}" của bạn đã bị Admin ẩn khỏi nền tảng do phát hiện vi phạm hoặc vấn đề cần xem xét.${rest}`
  }

  const restoreEventEnMatch = t.match(/^Your event\s*"(.*?)"\s+has been restored by Admin and is now publicly visible on the platform\.?$/i)
  if (restoreEventEnMatch) {
    const eventName = translateEventTitle(restoreEventEnMatch[1], false)
    return `Sự kiện "${eventName}" của bạn đã được Admin khôi phục và hiện đang hiển thị công khai trên nền tảng.`
  }

  const approveEventEnMatch = t.match(/^Your event\s*"(.*?)"\s+has been successfully approved by Admin\.?$/i)
  if (approveEventEnMatch) {
    const eventName = translateEventTitle(approveEventEnMatch[1], false)
    return `Sự kiện "${eventName}" của bạn đã được Admin phê duyệt thành công.`
  }

  // 6. Feedback:
  const feedbackEnMatch = t.match(/^Event\s*"(.*?)"\s+has completed 2\/3 of its duration\.\s*Please share your thoughts and feedback to help the organizer improve!?$/i)
  if (feedbackEnMatch) {
    const eventName = translateEventTitle(feedbackEnMatch[1], false)
    return `Sự kiện "${eventName}" đã đi qua 2/3 thời gian. Hãy chia sẻ cảm nhận và phản hồi của bạn để ban tổ chức ngày càng hoàn thiện hơn nhé!`
  }

  // 7. Organizer Announcements (revert to Vietnamese):
  let announcedVi = translateAnnouncementPhrases(t, false)
  if (announcedVi !== t) {
    return announcedVi
  }

  return t
}

export function stripNotificationHtml(html) {
  if (!html || typeof html !== 'string') return ''
  // 1. If no HTML tags or entities, return as is
  if (!/<[a-z][\s\S]*>/i.test(html) && !/&[a-z0-9#]+;/i.test(html)) {
    return html.trim()
  }

  // 2. Replace block breaks and br with a space
  let text = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '') // remove all other tags

  // 3. Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  // 4. Collapse whitespace
  return text.replace(/\s+/g, ' ').trim()
}

export function formatNotificationDisplay(notification, isEnglish = false) {
  if (!notification) return { title: isEnglish ? 'Notification' : 'Thông báo', content: '', preview: '' }

  let title = notification.title || (isEnglish ? 'Notification' : 'Thông báo')
  let content = notification.content || ''

  const meta = parseNotificationContent(content)

  if (title === 'STAFF_INVITATION' || meta?.status) {
    title = isEnglish ? 'Staff Invitation' : 'Lời mời làm nhân sự'
    const orgName = meta?.organization_name || meta?.organizer_name || (isEnglish ? 'Organizer' : 'Ban tổ chức')
    const rawEventTitle = meta?.event_title || notification.event?.title
    const eventTitle = isEnglish ? translateEventTitle(rawEventTitle, true) : translateEventTitle(rawEventTitle, false)
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
  } else {
    // Unconditionally translate both title and content according to the requested language
    title = translateNotificationTitle(title, isEnglish)
    content = translateNotificationContent(content, isEnglish)
  }

  // Normalize non-breaking spaces so text wraps naturally across all lines and never overflows
  if (typeof content === 'string') {
    content = content.replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ')
  }

  const preview = stripNotificationHtml(content)

  return { title, content, preview }
}

const ORGANIZER_OR_REJECTED_TITLE_PATTERNS = [
  /^Yêu cầu hủy sự kiện/i,
  /^Event Cancellation Request/i,
  /^Sự kiện đã bị hủy cưỡng chế$/i,
  /^Event Forcefully Cancelled$/i,
  /^Yêu cầu hoàn tiền vé mới$/i,
  /^New Ticket Refund Request$/i,
  /^Khiếu nại hoàn tiền:/i,
  /^Refund Dispute:/i,
  /^Khách hàng đã nhận được tiền hoàn$/i,
  /^Customer Confirmed Refund Receipt$/i,
  /^Yêu cầu hoàn tiền vé đã bị từ chối$/i,
  /^Ticket Refund Request Rejected$/i,
]

export function isCustomerCancellationOrRefundNotification(notification) {
  if (!notification || notification.title === 'STAFF_INVITATION') return false
  const title = typeof notification.title === 'string' ? notification.title.trim() : ''
  const content = stripNotificationHtml(typeof notification.content === 'string' ? notification.content : '')

  if (ORGANIZER_OR_REJECTED_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return false
  }

  const isEventCancellationNotice =
    /^Sự kiện\s*".*"\s*đã bị hủy$/i.test(title) ||
    /^Event\s*".*"\s*has been cancelled$/i.test(title) ||
    /đã chính thức bị hủy|has been officially cancelled|tạo yêu cầu hoàn tiền 100%|100% refund request/i.test(content)

  const isRefundGrantedNotice =
    /^Hoàn tiền vé thành công$/i.test(title) ||
    /^Ticket Refund Successful$/i.test(title) ||
    /hoàn tiền vé thành công|yêu cầu hoàn tiền (vé|đơn)\s+.*\s+đã hoàn tất|refund request for (ticket|order)\s+.*\s+has been completed/i.test(
      `${title}\n${content}`,
    )

  return isEventCancellationNotice || isRefundGrantedNotice
}
