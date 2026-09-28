/**
 * EventHub — HTML & Event Image Extraction Utility
 * =================================================
 * Bóc tách và xử lý ảnh từ:
 * 1. Main Poster (thumbnail_url)
 * 2. Cover Banner (banner_url)
 * 3. Thẻ <img> trong HTML description & short_description (URL / Data URI Base64)
 */

const logger = require('../../core/logger');

/**
 * Trích xuất toàn bộ URL và chuỗi Base64 Image dạng text từ chuỗi HTML / Markdown / Plain text
 * @param {string} html
 * @returns {string[]} Danh sách chuỗi URL/Base64 không trùng lặp
 */
function extractImagesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const images = [];

  // 1. Regex bóc tách src từ thẻ <img ... src="..." ...>
  const imgTagRegex = /<img[^>]+src=["']?([^"'>\s]+)["']?[^>]*>/gi;
  let match;

  while ((match = imgTagRegex.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (src && !images.includes(src)) {
      images.push(src);
    }
  }

  // 2. Regex bóc tách markdown image syntax: ![alt](url_or_base64)
  const mdImgRegex = /!\[[^\]]*\]\(([^)]+)\)/gi;
  while ((match = mdImgRegex.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (src && !images.includes(src)) {
      images.push(src);
    }
  }

  // 3. Regex bóc tách trực tiếp chuỗi Data URI Base64 (data:image/...;base64,xxxx) lưu dưới dạng text
  const base64Regex = /data:image\/[a-zA-Z0-9.+_-]+;base64,[a-zA-Z0-9+/=]+/gi;
  while ((match = base64Regex.exec(html)) !== null) {
    const src = match[0]?.trim();
    if (src && !images.includes(src)) {
      images.push(src);
    }
  }

  return images;
}

/**
 * Gom toàn bộ nguồn ảnh của sự kiện:
 * 1. Main Poster (thumbnail_url)
 * 2. Cover Banner (banner_url)
 * 3. Tất cả ảnh nhúng dạng text/Base64 trong mô tả (description & short_description)
 * 4. Tệp giấy phép nếu là ảnh
 *
 * @param {object} eventData
 * @returns {Array<{ source: string, url: string, isBase64: boolean, fileName?: string }>}
 */
function collectAllEventImages(eventData = {}) {
  const imageSources = [];

  // 1. Ảnh chính (Poster)
  if (eventData.thumbnail_url && typeof eventData.thumbnail_url === 'string') {
    const trimmed = eventData.thumbnail_url.trim();
    if (trimmed) {
      imageSources.push({
        source: 'MAIN_POSTER',
        url: trimmed,
        isBase64: trimmed.startsWith('data:image/'),
      });
    }
  }

  // 2. Ảnh bìa (Cover Banner)
  if (eventData.banner_url && typeof eventData.banner_url === 'string') {
    const trimmed = eventData.banner_url.trim();
    if (trimmed && !imageSources.some((item) => item.url === trimmed)) {
      imageSources.push({
        source: 'COVER_BANNER',
        url: trimmed,
        isBase64: trimmed.startsWith('data:image/'),
      });
    }
  }

  // 3. Toàn bộ ảnh lưu dạng text/Base64/URL trong HTML description & short_description
  const descImages = [
    ...extractImagesFromHtml(eventData.description),
    ...extractImagesFromHtml(eventData.short_description),
  ];

  descImages.forEach((imgUrl, index) => {
    if (!imageSources.some((item) => item.url === imgUrl)) {
      imageSources.push({
        source: `DESCRIPTION_IMAGE_${index + 1}`,
        url: imgUrl,
        isBase64: imgUrl.startsWith('data:image/'),
      });
    }
  });

  // 4. Các tệp giấy phép / tài liệu pháp lý nếu là hình ảnh
  const permitFiles = Array.isArray(eventData.permits)
    ? eventData.permits
    : Array.isArray(eventData.refund_policy?.permit_files)
      ? eventData.refund_policy.permit_files
      : [];

  permitFiles.forEach((file, index) => {
    const fileUrl = typeof file === 'string' ? file : file?.file_url || file?.url || file?.path;
    if (fileUrl && typeof fileUrl === 'string') {
      const trimmed = fileUrl.trim();
      const isImg = trimmed.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(trimmed) || trimmed.includes('/image/upload/');
      if (isImg && !imageSources.some((item) => item.url === trimmed)) {
        imageSources.push({
          source: `PERMIT_DOCUMENT_${index + 1}`,
          url: trimmed,
          isBase64: trimmed.startsWith('data:image/'),
          fileName: file?.file_name || file?.name || `Giấy phép ${index + 1}`,
        });
      }
    }
  });

  return imageSources;
}

/**
 * Tải ảnh hoặc decode chuỗi Data URI / Text Base64 sạch để gửi Ollama
 * @param {string} imageUrl
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
async function fetchImageAsBase64(imageUrl, timeoutMs = 8000) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  try {
    const trimmed = imageUrl.trim();

    // 1. Nếu là data URI dạng text trong DB: data:image/...;base64,xxxx
    if (trimmed.startsWith('data:image/')) {
      const base64Index = trimmed.indexOf(';base64,');
      if (base64Index !== -1) {
        return trimmed.slice(base64Index + 8).trim();
      }
      return null;
    }

    // 2. Nếu là chuỗi Base64 thuần túy (text dài không có prefix)
    if (trimmed.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed.slice(0, 100))) {
      return trimmed.replace(/\s+/g, '');
    }

    // 3. Nếu là URL HTTP / HTTPS (hỗ trợ Cloudinary CDN và các CDN khác)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      let downloadUrl = trimmed;

      // Tối ưu hóa tải ảnh từ Cloudinary
      if (downloadUrl.includes('res.cloudinary.com') && downloadUrl.includes('/image/upload/')) {
        if (!downloadUrl.includes('/w_') && !downloadUrl.includes('/c_limit')) {
          downloadUrl = downloadUrl.replace('/image/upload/', '/image/upload/w_800,c_limit,q_auto:eco,f_jpg/');
        }
      }

      const response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'EventHub-AI-ImageModerator/1.0',
          'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.8',
        },
      });

      if (!response.ok) {
        logger.warn(`[htmlImageParser] Failed to fetch image from Cloudinary/Web: ${trimmed.slice(0, 60)} (Status: ${response.status})`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return buffer.toString('base64');
    }

    return null;
  } catch (err) {
    logger.warn(`[htmlImageParser] Error converting image to base64 (${imageUrl.slice(0, 60)}): ${err.message}`);
    return null;
  }
}

module.exports = {
  extractImagesFromHtml,
  collectAllEventImages,
  fetchImageAsBase64,
};
