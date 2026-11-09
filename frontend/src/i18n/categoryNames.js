/**
 * Helper to get bilingual category name.
 */
const CATEGORY_MAP = {
  'Âm nhạc': 'Music',
  'Thể thao': 'Sports',
  'Nghệ thuật': 'Art & Culture',
  'Nghệ thuật & Sân khấu': 'Arts & Theater',
  'Ẩm thực': 'Food & Drinks',
  'Ẩm thực & Đồ uống': 'Food & Beverage',
  'Kinh doanh': 'Business',
  'Kinh doanh & Hội thảo': 'Business & Seminars',
  'Hội thảo': 'Workshops & Seminars',
  'Hội nghị': 'Conferences',
  'Triển lãm': 'Exhibitions',
  'Giải trí': 'Entertainment',
  'Cộng đồng': 'Community',
  'Công nghệ': 'Technology',
  'Giáo dục': 'Education',
  'Du lịch': 'Travel & Tourism',
  'Sức khỏe': 'Health & Wellness',
  'Thời trang': 'Fashion & Beauty',
  'Gia đình': 'Family & Kids',
}

export function getCategoryName(category, isEnglish = false) {
  if (!category) return isEnglish ? 'Event' : 'Sự kiện'
  const name = typeof category === 'string' ? category : (category.name || category.category_name || '')
  if (!name) return isEnglish ? 'Event' : 'Sự kiện'
  if (!isEnglish) return name
  return CATEGORY_MAP[name] || name
}

export default getCategoryName

