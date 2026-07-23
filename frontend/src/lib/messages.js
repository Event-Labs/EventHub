const TECHNICAL_MESSAGE_MAP = {
  Success: 'Thao tác thành công.',
  Error: 'Đã xảy ra lỗi. Vui lòng thử lại.',
  'Something went wrong!': 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  'Invalid request data': 'Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
  'Route not found': 'Không tìm thấy chức năng yêu cầu.',
  'Could not load profile.': 'Không thể tải hồ sơ. Vui lòng thử lại.',
  'User not found': 'Không tìm thấy thông tin người dùng.',
  'Authentication required': 'Vui lòng đăng nhập để tiếp tục.',
  'Not authorized to access this route': 'Bạn không có quyền truy cập chức năng này.',
  Forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  'Account is locked': 'Tài khoản của bạn đã bị khóa.',
  'Refresh token not found': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  'Event not found': 'Không tìm thấy thông tin sự kiện.',
  'Event cannot be submitted': 'Không thể gửi sự kiện này.',
  'Event must have at least one session before submit': 'Sự kiện cần có ít nhất một phiên trước khi gửi duyệt.',
  'Event must have at least one ticket type before submit': 'Sự kiện cần có ít nhất một loại vé trước khi gửi duyệt.',
  'Organizer profile not found': 'Không tìm thấy hồ sơ nhà tổ chức.',
  'Organizer profile not found or inactive.': 'Hồ sơ nhà tổ chức không tồn tại hoặc chưa kích hoạt.',
  'Organizer record not found. Please complete your organizer profile.': 'Chưa tìm thấy hồ sơ nhà tổ chức. Vui lòng hoàn tất thông tin nhà tổ chức.',
  'Venue not found': 'Không tìm thấy địa điểm.',
  'Venue name is required': 'Vui lòng nhập tên địa điểm.',
  'Address is required': 'Vui lòng nhập địa chỉ.',
  'Seat map not found': 'Không tìm thấy sơ đồ ghế.',
  'Seat map name is required': 'Vui lòng nhập tên sơ đồ ghế.',
  'Seat map must have at least one seat': 'Sơ đồ ghế cần có ít nhất một ghế.',
  'Seat map đang được sử dụng bởi session active': 'Sơ đồ ghế đang được sử dụng bởi phiên sự kiện đang hoạt động.',
  'Seat map đang được sử dụng': 'Sơ đồ ghế đang được sử dụng bởi một hoặc nhiều phiên sự kiện.',
  'Order not found': 'Không tìm thấy đơn hàng.',
  'Promo code already exists': 'Mã khuyến mãi này đã tồn tại.',
  'Promo code not found': 'Không tìm thấy mã khuyến mãi.',
  'Please select at least one event for this promotion': 'Vui lòng chọn ít nhất một sự kiện cho mã khuyến mãi.',
  'Start time must be before end_time': 'Thời gian bắt đầu phải trước thời gian kết thúc.',
  'Cloudinary is not configured': 'Hệ thống tải tệp chưa được cấu hình. Vui lòng liên hệ quản trị viên.',
  'Ma OTP khong hop le': 'Mã OTP không hợp lệ hoặc đã hết hạn.',
  'No valid fields to update': 'Chưa có thông tin hợp lệ nào để cập nhật.',
  'Two-factor authentication is not supported': 'Tài khoản chưa hỗ trợ xác thực 2 lớp.',
  'Email must be verified before enabling two-factor authentication': 'Email phải được xác thực trước khi bật xác thực 2 lớp.',
  'Payment order not found': 'Không tìm thấy đơn hàng thanh toán.',
  'Invalid PayOS webhook signature': 'Chữ ký thanh toán PayOS không hợp lệ.',
  'Payment channel not configured yet': 'Kênh thanh toán chưa được kết nối.',
  'api_key and checksum_key are required for a new payment channel': 'Bắt buộc nhập API Key và Checksum Key khi kết nối thanh toán.',
  'api_key and checksum_key must be provided together': 'API Key và Checksum Key phải được điền cùng nhau.',
  'All selected events must belong to your organizer': 'Tất cả các sự kiện được chọn phải thuộc quyền sở hữu của bạn.',
  'You do not have permission to view this promo code': 'Bạn không có quyền xem mã khuyến mãi này.',
  'You do not have permission to edit this promo code': 'Bạn không có quyền chỉnh sửa mã khuyến mãi này.',
  'You do not have permission to deactivate this promo code': 'Bạn không có quyền dừng mã khuyến mãi này.',
  'No organizer verification fields changed': 'Chưa có thông tin xác minh nào được thay đổi.',
  'Organizer profile not found for this user.': 'Tài khoản chưa có hồ sơ Nhà tổ chức.',
  'Invalid ticket status': 'Trạng thái vé không hợp lệ.',
  'Ticket not found': 'Không tìm thấy vé.',
  'end_time must be later than start_time': 'Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.',
  'start_time and end_time are required': 'Thời gian bắt đầu và kết thúc là bắt buộc.',
  'start_time must not be in the past': 'Thời gian bắt đầu không được ở trong quá khứ.',
  'Invalid session for ticket type': 'Phiên sự kiện cho loại vé không hợp lệ.',
  'Ticket type name is required': 'Tên loại vé không được để trống.',
  'Ticket price must be >= 0': 'Giá vé phải lớn hơn hoặc bằng 0.',
  'Ticket quantity must be > 0': 'Số lượng vé phải lớn hơn 0.',
  'Request failed with status code 400': 'Dữ liệu không hợp lệ (Mã 400). Vui lòng kiểm tra lại.',
  'Internal Server Error': 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
  'Network Error': 'Lỗi kết nối mạng. Vui lòng kiểm tra lại Internet.',
  'Request failed with status code 401': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'Request failed with status code 403': 'Bạn không có quyền thực hiện thao tác này.',
  'Request failed with status code 404': 'Không tìm thấy nội dung yêu cầu.',
  'Request failed with status code 500': 'Hệ thống gặp sự cố. Vui lòng thử lại sau.',
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
    return value
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
