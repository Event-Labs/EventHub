/**
 * Helper to get bilingual category name.
 */
import { translatePhrase } from './phraseDictionary.js'

export const CATEGORY_MAP = {
  // Database active categories
  'Âm nhạc & Biểu diễn': 'Music & Performing Arts',
  'Lễ hội & Văn hóa': 'Festivals & Culture',
  'Hội thảo & Giáo dục': 'Workshops & Education',
  'Kinh doanh & Công nghệ': 'Business & Technology',
  'Thể thao': 'Sports',

  // Common variants & subcategories
  'Âm nhạc': 'Music',
  'Biểu diễn': 'Performing Arts',
  'Lễ hội': 'Festivals',
  'Văn hóa': 'Culture',
  'Hội thảo': 'Workshops',
  'Hội thảo & Workshop': 'Workshops & Seminars',
  'Giáo dục': 'Education',
  'Giáo dục & Đào tạo': 'Education & Training',
  'Kinh doanh': 'Business',
  'Kinh doanh & Hội thảo': 'Business & Seminars',
  'Công nghệ': 'Technology',
  'Khoa học & Công nghệ': 'Science & Technology',
  'Nghệ thuật': 'Art & Culture',
  'Nghệ thuật & Sân khấu': 'Arts & Theater',
  'Sân khấu & Kịch': 'Theater & Drama',
  'Ẩm thực': 'Food & Drinks',
  'Ẩm thực & Đồ uống': 'Food & Beverage',
  'Hội nghị': 'Conferences',
  'Triển lãm': 'Exhibitions',
  'Giải trí': 'Entertainment',
  'Cộng đồng': 'Community',
  'Cộng đồng & Xã hội': 'Community & Society',
  'Du lịch': 'Travel & Tourism',
  'Du lịch & Trải nghiệm': 'Travel & Experiences',
  'Sức khỏe': 'Health & Wellness',
  'Sức khỏe & Đời sống': 'Health & Living',
  'Thời trang': 'Fashion & Beauty',
  'Thời trang & Phong cách': 'Fashion & Style',
  'Gia đình': 'Family & Kids',
  'Gia đình & Thiếu nhi': 'Family & Kids',
  'Thiếu nhi': 'Kids',
}

export const SLUG_CATEGORY_MAP = {
  'am-nhac-bieu-dien': 'Music & Performing Arts',
  'le-hoi-van-hoa': 'Festivals & Culture',
  'hoi-thao-giao-duc': 'Workshops & Education',
  'kinh-doanh-cong-nghe': 'Business & Technology',
  'the-thao': 'Sports',
  'sports': 'Sports',
  'music': 'Music',
  'business': 'Business',
  'technology': 'Technology',
  'education': 'Education',
  'entertainment': 'Entertainment',
  'festivals': 'Festivals & Culture',
}

export function getCategoryName(category, isEnglish = false) {
  if (!category) return isEnglish ? 'Event' : 'Sự kiện'
  const rawName = typeof category === 'string'
    ? category
    : (category.name || category.category_name || '')
  const slug = typeof category === 'object' ? (category.slug || '') : ''

  if (!rawName && !slug) return isEnglish ? 'Event' : 'Sự kiện'
  if (!isEnglish) return rawName || slug

  const trimmed = rawName.trim()
  if (CATEGORY_MAP[trimmed]) return CATEGORY_MAP[trimmed]
  if (slug && SLUG_CATEGORY_MAP[slug]) return SLUG_CATEGORY_MAP[slug]

  const dictionaryTranslation = translatePhrase(trimmed, 'en')
  if (dictionaryTranslation && dictionaryTranslation !== trimmed) {
    return dictionaryTranslation
  }

  return trimmed || (slug && SLUG_CATEGORY_MAP[slug]) || slug
}

export default getCategoryName
