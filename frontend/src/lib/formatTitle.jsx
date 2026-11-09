import { translatePhrase } from '@/i18n/phraseDictionary.js'

export function renderCosmicTitle(title, variant = 'gold') {
  if (typeof title !== 'string') return title
  const activeLocale =
    (typeof document !== 'undefined' && document.documentElement?.lang) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale')) ||
    'vi'
  const localizedTitle = translatePhrase(title, activeLocale)
  const trimmed = (typeof localizedTitle === 'string' ? localizedTitle : title).trim()
  if (!trimmed) return title

  const goldClasses = "cosmic-header-title text-transparent bg-clip-text bg-gradient-to-r from-[#C99A47] to-[#E6C17A] drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] [html.light_&]:drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)] inline-block"

  if (variant === 'gold') {
    return (
      <span className={goldClasses}>
        {trimmed}
      </span>
    )
  }

  const words = trimmed.split(' ')
  if (words.length <= 1) {
    return (
      <span className={goldClasses}>
        {trimmed}
      </span>
    )
  }

  const lower = trimmed.toLowerCase()

  // Danh sách các cụm từ có nghĩa ở cuối tiêu đề sẽ được highlight trọn vẹn (hỗ trợ cả tiếng Việt và tiếng Anh)
  const PHRASES = [
    'ban tổ chức',
    'sự kiện', 'yêu thích', 'đơn hàng', 'hoàn tiền',
    'hoàn vé', 'bán vé', 'khuyến mãi', 'người tham dự',
    'tổng quan', 'thống kê', 'tài khoản', 'báo cáo',
    'phản hồi', 'đánh giá', 'giao dịch', 'thanh toán',
    'hồ sơ', 'cài đặt', 'vai trò', 'nhân viên',
    'khách hàng', 'chi tiết', 'địa điểm', 'sơ đồ',
    'chỗ ngồi', 'doanh thu', 'soát vé', 'nhân sự', 'dịch vụ', 'thông báo',
    'đang áp dụng', 'cá nhân', 'nhà tổ chức', 'được giao', 'trực tiếp', 'thủ công', 'nền tảng', 'người dùng', 'quản trị viên',
    // English equivalents
    'overview', 'dashboard', 'analytics', 'management', 'requests', 'events',
    'categories', 'review', 'finance', 'plans', 'service plans', 'profile',
    'orders', 'refunds', 'promotions', 'attendees', 'check-in', 'feedback',
    'venues', 'staff', 'payment', 'announcements', 'policies', 'statistics',
    'users', 'organizers', 'reports', 'service'
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
      {start}{start ? ' ' : ''}<span className={goldClasses}>{end}</span>
    </>
  )
}

export const renderGoldTitle = (title) => renderCosmicTitle(title, 'gold')

