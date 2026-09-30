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

  // 4. Các tệp giấy phép / tài liệu pháp lý
  const permitFiles = Array.isArray(eventData.permits)
    ? eventData.permits
    : Array.isArray(eventData.refund_policy?.permit_files)
      ? eventData.refund_policy.permit_files
      : [];

  permitFiles.forEach((file, index) => {
    const fileUrl = typeof file === 'string' ? file : file?.file_url || file?.url || file?.path;
    if (fileUrl && typeof fileUrl === 'string') {
      const trimmed = fileUrl.trim();
      const fileName = file?.file_name || file?.name || `Giấy phép ${index + 1}`;
      const fileType = file?.type || file?.mime_type || '';
      const isPdf = trimmed.toLowerCase().includes('.pdf') || fileType.includes('pdf');
      
      if (!imageSources.some((item) => item.url === trimmed)) {
        imageSources.push({
          source: `PERMIT_DOCUMENT_${index + 1}`,
          url: trimmed,
          isBase64: trimmed.startsWith('data:image/'),
          fileName,
          fileType,
          isPdf,
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

      // Hỗ trợ Cloudinary CDN: tự động render trang 1 của PDF sang ảnh JPG hoặc tối ưu hóa kích thước ảnh
      if (downloadUrl.includes('res.cloudinary.com')) {
        if (downloadUrl.toLowerCase().includes('.pdf')) {
          if (downloadUrl.includes('/upload/')) {
            downloadUrl = downloadUrl
              .replace(/\.pdf(\?.*)?$/i, '.jpg')
              .replace('/upload/', '/upload/w_1000,c_limit,q_auto:good,f_jpg,pg_1/');
          }
        } else if (downloadUrl.includes('/image/upload/')) {
          if (!downloadUrl.includes('/w_') && !downloadUrl.includes('/c_limit')) {
            downloadUrl = downloadUrl.replace('/image/upload/', '/image/upload/w_1000,c_limit,q_auto:eco,f_jpg/');
          }
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
        logger.warn(`[htmlImageParser] Failed to fetch image/document from Cloudinary/Web: ${trimmed.slice(0, 60)} (Status: ${response.status})`);
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

const zlib = require('zlib');

/**
 * Trích xuất toàn bộ text từ buffer file .docx (PKZip) chuẩn xác không cần thư viện ngoài
 */
function extractTextFromDocxBuffer(buffer) {
  if (!buffer || buffer.length < 30) return null;
  try {
    let offset = 0;
    while (offset < buffer.length - 30) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        offset++;
        continue;
      }
      const method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
      const dataStart = offset + 30 + fileNameLen + extraLen;

      if (fileName === 'word/document.xml') {
        const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
        let xmlStr = '';
        if (method === 8) {
          xmlStr = zlib.inflateRawSync(compressedData).toString('utf8');
        } else if (method === 0) {
          xmlStr = compressedData.toString('utf8');
        }
        if (xmlStr) {
          return xmlStr
            .replace(/<\/w:p>/gi, '\n')
            .replace(/<w:tab\/>/gi, '\t')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      offset = dataStart + compressedSize;
    }
  } catch (err) {
    logger.warn(`[htmlImageParser] Error extracting docx text: ${err.message}`);
  }
  return null;
}

const pdfParse = require('pdf-parse');

/**
 * Tải và phân tích toàn diện nội dung tài liệu đính kèm (Bắt buộc PDF, trích xuất text)
 * @param {string} documentUrl
 * @param {object} fileMeta - { fileName, mimeType, etc. }
 * @param {number} timeoutMs
 */
async function fetchDocumentContent(documentUrl, fileMeta = {}, timeoutMs = 15000) {
  if (!documentUrl || typeof documentUrl !== 'string') return null;
  const trimmed = documentUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;

  try {
    const fileName = fileMeta?.fileName || fileMeta?.name || '';
    const fileType = fileMeta?.type || fileMeta?.mimeType || '';
    const lowerUrl = trimmed.toLowerCase();
    const lowerName = fileName.toLowerCase();

    const isPdfByExt = lowerUrl.includes('.pdf') || lowerName.endsWith('.pdf') || fileType.includes('pdf');
    
    // 1. Tải binary buffer của tệp từ link Cloudinary / Web
    const rawResponse = await fetch(trimmed, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'EventHub-AI-DocumentReader/1.0',
      },
    });

    if (!rawResponse.ok) {
      logger.warn(`[htmlImageParser] Không thể tải tệp từ link: ${trimmed.slice(0, 80)} (Status: ${rawResponse.status})`);
      return {
        type: 'DOWNLOAD_FAILED',
        error: `Không thể tải tệp từ máy chủ lưu trữ (HTTP ${rawResponse.status})`,
        fileName,
      };
    }

    const arrayBuffer = await rawResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const magic = buffer.subarray(0, 5).toString('latin1');
    const isActualPdf = magic.startsWith('%PDF-') || isPdfByExt;

    // Nếu KHÔNG PHẢI định dạng PDF -> Đánh dấu rõ ràng lỗi định dạng
    if (!isActualPdf) {
      let detectedFormat = 'Không phải PDF';
      if (magic.startsWith('PK\x03\x04')) {
        detectedFormat = 'Word/DOCX';
      } else if (lowerUrl.includes('.doc') || lowerName.endsWith('.doc')) {
        detectedFormat = 'Word/DOC';
      } else if (magic.startsWith('\xFF\xD8\xFF') || lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) {
        detectedFormat = 'Ảnh JPG/JPEG';
      } else if (magic.startsWith('\x89PNG') || lowerUrl.includes('.png')) {
        detectedFormat = 'Ảnh PNG';
      }

      return {
        type: 'INVALID_FORMAT',
        isPdf: false,
        detectedFormat,
        fileName,
        size: buffer.length,
        error: `Tệp tải lên không đúng định dạng PDF (.pdf). Định dạng phát hiện: ${detectedFormat}.`,
      };
    }

    // 2. Tệp đúng định dạng PDF -> Trích xuất văn bản (Text extraction) bằng pdf-parse
    let extractedText = '';
    let numPages = 1;

    try {
      const pdfData = await pdfParse(buffer);
      extractedText = (pdfData?.text || '').trim();
      numPages = pdfData?.numpages || 1;
    } catch (parseErr) {
      logger.warn(`[htmlImageParser] pdf-parse warning: ${parseErr.message}`);
    }

    // Làm sạch khoảng trắng thừa
    const cleanText = extractedText.replace(/\s+/g, ' ').trim();

    // 3. Nếu PDF là dạng scan (chỉ có hình ảnh scan không có text layer) -> lấy ảnh trang 1 từ Cloudinary để Vision OCR
    let imageBase64Fallback = null;
    if (cleanText.length < 20 && trimmed.includes('res.cloudinary.com') && trimmed.includes('/upload/')) {
      const previewJpgUrl = trimmed
        .replace(/\.pdf(\?.*)?$/i, '.jpg')
        .replace('/upload/', '/upload/w_1200,c_limit,q_auto:good,f_jpg,pg_1/');
      try {
        const imgResp = await fetch(previewJpgUrl, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'EventHub-AI-Vision/1.0' },
        });
        if (imgResp.ok) {
          const imgArr = await imgResp.arrayBuffer();
          imageBase64Fallback = Buffer.from(imgArr).toString('base64');
        }
      } catch (e) {
        // ignore
      }
    }

    return {
      type: 'PDF_DOCUMENT',
      isPdf: true,
      text: cleanText,
      numPages,
      size: buffer.length,
      fileName,
      hasText: cleanText.length >= 20,
      imageBase64Fallback,
    };
  } catch (err) {
    logger.warn(`[htmlImageParser] Error fetching document content (${trimmed.slice(0, 60)}): ${err.message}`);
    return null;
  }
}

module.exports = {
  extractImagesFromHtml,
  collectAllEventImages,
  fetchImageAsBase64,
  extractTextFromDocxBuffer,
  fetchDocumentContent,
};
