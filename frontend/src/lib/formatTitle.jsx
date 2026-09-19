export function renderCosmicTitle(title) {
  if (typeof title !== 'string') return title
  const words = title.trim().split(' ')
  if (words.length <= 1) return title

  const lower = title.toLowerCase()
  
  // Danh sách các cụm từ có nghĩa ở cuối tiêu đề sẽ được highlight trọn vẹn
  const PHRASES = [
    'ban tổ chức',
    'sự kiện', 'yêu thích', 'đơn hàng', 'hoàn tiền',
    'hoàn vé', 'bán vé', 'khuyến mãi', 'người tham dự',
    'tổng quan', 'thống kê', 'tài khoản', 'báo cáo',
    'phản hồi', 'đánh giá', 'giao dịch', 'thanh toán',
    'hồ sơ', 'cài đặt', 'vai trò', 'nhân viên',
    'khách hàng', 'chi tiết', 'địa điểm', 'sơ đồ',
    'chỗ ngồi', 'doanh thu', 'soát vé', 'nhân sự', 'dịch vụ', 'thông báo',
    'đang áp dụng', 'cá nhân', 'nhà tổ chức', 'được giao', 'trực tiếp', 'thủ công', 'nền tảng', 'người dùng', 'quản trị viên'
  ]

  let highlightCount = 1
  for (const phrase of PHRASES) {
    if (lower.endsWith(phrase)) {
      highlightCount = phrase.split(' ').length
      break
    }
  }

  const start = words.slice(0, -highlightCount).join(' ')
  const end = words.slice(-highlightCount).join(' ')

  return (
    <>
      {start}{start ? ' ' : ''}<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary drop-shadow-sm">{end}</span>
    </>
  )
}
