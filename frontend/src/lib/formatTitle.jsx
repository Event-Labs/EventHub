export function renderCosmicTitle(title, variant = 'gold') {
  if (typeof title !== 'string') return title
  const trimmed = title.trim()
  if (!trimmed) return title

  if (variant === 'gold') {
    return (
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C99A47] to-[#E6C17A] drop-shadow-[0_0_8px_rgba(230,193,122,0.9)] drop-shadow-[0_0_20px_rgba(201,154,71,0.7)] drop-shadow-[0_0_35px_rgba(230,193,122,0.45)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] inline-block">
        {trimmed}
      </span>
    )
  }

  const words = trimmed.split(' ')
  if (words.length <= 1) {
    return (
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary drop-shadow-sm">
        {trimmed}
      </span>
    )
  }

  const lower = trimmed.toLowerCase()

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

export const renderGoldTitle = (title) => renderCosmicTitle(title, 'gold')

