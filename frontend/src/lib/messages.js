const TECHNICAL_MESSAGE_MAP = {
  Success: 'Thao tác thành công.',
  Error: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  'Something went wrong!': 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  'Invalid request data': 'Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
  'Route not found': 'Không tìm thấy chức năng yêu cầu.',
  'Could not load profile.': 'Không thể tải hồ sơ. Vui lòng thử lại.',
  'User not found': 'Không tìm thấy người dùng.',
  'Authentication required': 'Vui lòng đăng nhập để tiếp tục.',
  'Not authorized to access this route': 'Bạn không có quyền truy cập chức năng này.',
  Forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  'Account is locked': 'Tài khoản của bạn đã bị khóa.',
  'Refresh token not found': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  'Event not found': 'Không tìm thấy sự kiện.',
  'Event cannot be submitted': 'Không thể gửi sự kiện này.',
  'Event must have at least one session before submit': 'Sự kiện cần có ít nhất một phiên trước khi gửi duyệt.',
  'Event must have at least one ticket type before submit': 'Sự kiện cần có ít nhất một loại vé trước khi gửi duyệt.',
  'Organizer profile not found': 'Không tìm thấy hồ sơ nhà tổ chức.',
  'Organizer profile not found or inactive.': 'Hồ sơ nhà tổ chức không tồn tại hoặc chưa hoạt động.',
  'Venue not found': 'Không tìm thấy địa điểm.',
  'Venue name is required': 'Vui lòng nhập tên địa điểm.',
  'Address is required': 'Vui lòng nhập địa chỉ.',
  'Seat map not found': 'Không tìm thấy sơ đồ ghế.',
  'Seat map name is required': 'Vui lòng nhập tên sơ đồ ghế.',
  'Seat map must have at least one seat': 'Sơ đồ ghế cần có ít nhất một ghế.',
  'Order not found': 'Không tìm thấy đơn hàng.',
  'Promo code already exists': 'Mã khuyến mãi đã tồn tại.',
  'Promo code not found': 'Không tìm thấy mã khuyến mãi.',
  'Please select at least one event for this promotion': 'Vui lòng chọn ít nhất một sự kiện cho mã khuyến mãi.',
  'Start time must be before end_time': 'Thời gian bắt đầu phải trước thời gian kết thúc.',
  'Cloudinary is not configured': 'Hệ thống tải tệp chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
}

const ENGLISH_PATTERN = /[A-Za-z]{3,}/
const VIETNAMESE_PATTERN = /[À-ỹ]/

export function normalizeMessage(message, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.') {
  if (!message) return fallback

  const value = String(message).trim()
  if (!value) return fallback

  if (TECHNICAL_MESSAGE_MAP[value]) {
    return TECHNICAL_MESSAGE_MAP[value]
  }

  if (VIETNAMESE_PATTERN.test(value)) {
    return value
  }

  if (ENGLISH_PATTERN.test(value)) {
    return fallback
  }

  return value
}

export function getApiMessage(error, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.') {
  const apiError = error?.response?.data
  const issues = apiError?.errors || apiError?.data

  if (Array.isArray(issues) && issues.length > 0) {
    const messages = issues
      .map((item) => normalizeMessage(item?.message, 'Dữ liệu chưa hợp lệ.'))
      .filter(Boolean)

    if (messages.length > 0) {
      return messages.join(', ')
    }
  }

  return normalizeMessage(apiError?.message || error?.message, fallback)
}
