#!/usr/bin/env node
/**
 * EventHub — Phase 4 Automated AI Event Review Accuracy Verification Script
 * =========================================================================
 * Kiem thu luong `EventsAdminService.runAiReview` & `reviewEvent` voi 6 kich ban
 * sat thuc te nhat:
 *   1. Su kien hop le + Anh ban nhau / Meme lac de -> REJECT / NEEDS_REVIEW + image_review flag
 *   2. Su kien hop le + Tai lieu giay phep la tu vung TOEIC / giao an -> REJECT (LEGAL_PERMIT_AUTHENTICITY)
 *   3. Su kien hop le + Giay phep khop ten su kien & Organizer -> APPROVE, risk_score < 20, quality_score >= 80
 *   4. Su kien nho / Workshop Acoustic khong giay phep nhung du thong tin -> APPROVE (khong bat loi oan)
 *   5. Su kien lua dao tai chinh 30%/thang + bao lo 100% + link rut gon ngoai san -> REJECT (ANTI_FINANCIAL_FRAUD_MLM / PAYMENT_POLICY)
 *   6. End-to-End Log & Admin Override Feedback Loop (NEEDS_REVIEW -> APPROVED) -> verify `event_ai_review_logs`
 *
 * Usage:
 *   node scripts/test-ai-review-accuracy.js          # Deterministic Stage 1 + Stage 2 + Real PostgreSQL
 *   node scripts/test-ai-review-accuracy.js --live   # Live Ollama inference + Real PostgreSQL
 */

const path = require('path');
const crypto = require('crypto');

// Nap env truoc khi require bat ky module nao cua backend
const dotenv = require(path.resolve(__dirname, '../backend/node_modules/dotenv'));
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const db = require(path.resolve(__dirname, '../backend/src/infrastructure/database/db.client'));
const ollamaClient = require(path.resolve(__dirname, '../backend/src/infrastructure/ai/ollama.client'));
const eventsAdminService = require(path.resolve(__dirname, '../backend/src/modules/admin/events.service'));
const reviewCriteriaRepository = require(path.resolve(__dirname, '../backend/src/modules/admin/reviewCriteria.repository'));

const IS_LIVE_MODE = process.argv.includes('--live');

// =========================================================================
// Helpers: Build real valid 1x1 PNG & valid DOCX zip buffer in memory
// =========================================================================
function buildTaggedPngBuffer(tagSeed) {
  // Valid 1x1 RGB PNG bytes + harmless PNG tEXt chunk carrying media identifier for simulator vision inspection
  const ihdrAndIdat = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de' +
    '0000000c4944415408d763f8ffff3f0005fe02fea7358184',
    'hex',
  );
  const tagText = Buffer.from(`EventHubTest\0${tagSeed}`, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(tagText.length, 0);
  const typeBuf = Buffer.from('tEXt', 'ascii');
  const crcBuf = Buffer.alloc(4, 0); // Ignored by base64 carrier
  const iend = Buffer.from('0000000049454e44ae426082', 'hex');
  return Buffer.concat([ihdrAndIdat, lenBuf, typeBuf, tagText, crcBuf, iend]);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildMinimalDocxBuffer(paragraphText) {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${escapeXml(paragraphText)}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  const fileNameBuf = Buffer.from('word/document.xml', 'utf8');
  const dataBuf = Buffer.from(xml, 'utf8');
  const crc = crc32(dataBuf);

  // Local file header (30 bytes + filename)
  const localHdr = Buffer.alloc(30 + fileNameBuf.length);
  localHdr.writeUInt32LE(0x04034b50, 0);
  localHdr.writeUInt16LE(20, 4); // version needed
  localHdr.writeUInt16LE(0, 6);  // flags
  localHdr.writeUInt16LE(0, 8);  // method = STORE (0)
  localHdr.writeUInt16LE(0, 10);
  localHdr.writeUInt16LE(0, 12);
  localHdr.writeUInt32LE(crc, 14);
  localHdr.writeUInt32LE(dataBuf.length, 18);
  localHdr.writeUInt32LE(dataBuf.length, 22);
  localHdr.writeUInt16LE(fileNameBuf.length, 26);
  localHdr.writeUInt16LE(0, 28);
  fileNameBuf.copy(localHdr, 30);

  const centralOffset = localHdr.length + dataBuf.length;

  // Central directory header (46 bytes + filename)
  const cdHdr = Buffer.alloc(46 + fileNameBuf.length);
  cdHdr.writeUInt32LE(0x02014b50, 0);
  cdHdr.writeUInt16LE(20, 4);
  cdHdr.writeUInt16LE(20, 6);
  cdHdr.writeUInt16LE(0, 8);
  cdHdr.writeUInt16LE(0, 10);
  cdHdr.writeUInt16LE(0, 12);
  cdHdr.writeUInt16LE(0, 14);
  cdHdr.writeUInt32LE(crc, 16);
  cdHdr.writeUInt32LE(dataBuf.length, 20);
  cdHdr.writeUInt32LE(dataBuf.length, 24);
  cdHdr.writeUInt16LE(fileNameBuf.length, 28);
  cdHdr.writeUInt16LE(0, 30);
  cdHdr.writeUInt16LE(0, 32);
  cdHdr.writeUInt16LE(0, 34);
  cdHdr.writeUInt16LE(0, 36);
  cdHdr.writeUInt32LE(0, 38);
  cdHdr.writeUInt32LE(0, 42);
  fileNameBuf.copy(cdHdr, 46);

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdHdr.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHdr, dataBuf, cdHdr, eocd]);
}

// =========================================================================
// Virtual Media Registry & Deterministic Stage 1/2 Ollama Simulator
// =========================================================================
const MEDIA_ASSETS = {
  'https://cdn.test.eventhub.vn/images/ai-workshop-poster.png': {
    buffer: buildTaggedPngBuffer('POSTER_AI_WORKSHOP'),
    visionResult: {
      visual_description: 'Poster sự kiện thiết kế chuyên nghiệp tông xanh công nghệ, hiển thị chủ đề Hội thảo Kỹ năng Công nghệ AI & Ứng dụng Thực tiễn 2027 cùng tên diễn giả và thời gian.',
      extracted_text: 'HỘI THẢO KỸ NĂNG CÔNG NGHỆ AI 2027 - TECHLAB VIETNAM - NHÀ HÁT BẾN THÀNH',
      is_event_poster_or_relevant_banner: true,
      safety_flags: [],
    },
  },
  'https://cdn.test.eventhub.vn/images/ai-workshop-banner.png': {
    buffer: buildTaggedPngBuffer('BANNER_AI_WORKSHOP'),
    visionResult: {
      visual_description: 'Ảnh bìa ngang thiết kế đồng bộ với poster Hội thảo Kỹ năng Công nghệ AI 2027, có logo nhà tổ chức và bố cục hiện đại.',
      extracted_text: 'AI SKILLS CONFERENCE 2027',
      is_event_poster_or_relevant_banner: true,
      safety_flags: [],
    },
  },
  'https://cdn.test.eventhub.vn/images/junk-beer-meme.png': {
    buffer: buildTaggedPngBuffer('JUNK_BEER_MEME'),
    visionResult: {
      visual_description: 'Ảnh chụp bàn ăn nhậu với nhiều cốc bia, đĩa đồ ăn và hình ảnh meme hài hước trên bàn tiệc tối, hoàn toàn không phải poster sự kiện hay liên quan đến hội thảo công nghệ AI.',
      extracted_text: '1 2 3 DÔ! CUỐI TUẦN QUẨY TỚI BẾN MEME',
      is_event_poster_or_relevant_banner: false,
      safety_flags: [],
    },
  },
  'https://cdn.test.eventhub.vn/images/acoustic-poster.png': {
    buffer: buildTaggedPngBuffer('POSTER_ACOUSTIC_WORKSHOP'),
    visionResult: {
      visual_description: 'Poster thiết kế ấm áp với cây đàn guitar acoustic, ánh đèn vàng sân khấu nhỏ và thông tin đêm giao lưu Coffee Talk Acoustic Cuối Tuần.',
      extracted_text: 'WORKSHOP ACOUSTIC & COFFEE TALK CUỐI TUẦN',
      is_event_poster_or_relevant_banner: true,
      safety_flags: [],
    },
  },
  'https://cdn.test.eventhub.vn/images/acoustic-banner.png': {
    buffer: buildTaggedPngBuffer('BANNER_ACOUSTIC_WORKSHOP'),
    visionResult: {
      visual_description: 'Ảnh bìa ngang quán cà phê sân khấu acoustic ấm cúng phù hợp chủ đề Workshop Acoustic & Coffee Talk.',
      extracted_text: 'ACOUSTIC COFFEE TALK LIVE',
      is_event_poster_or_relevant_banner: true,
      safety_flags: [],
    },
  },
  'https://cdn.test.eventhub.vn/images/crypto-scam-poster.png': {
    buffer: buildTaggedPngBuffer('POSTER_CRYPTO_SCAM'),
    visionResult: {
      visual_description: 'Poster quảng cáo đầu tư tài chính tiền số cam kết lợi nhuận 30%/tháng, bao lỗ 100%, kèm nút kêu gọi bấm link chuyển khoản ngoài hệ thống.',
      extracted_text: 'ĐẦU TƯ AI CRYPTO LỢI NHUẬN 30%/THÁNG - BAO LỖ 100%',
      is_event_poster_or_relevant_banner: true,
      safety_flags: [],
    },
  },
  'https://cdn.test.eventhub.vn/images/crypto-scam-banner.png': {
    buffer: buildTaggedPngBuffer('BANNER_CRYPTO_SCAM'),
    visionResult: {
      visual_description: 'Banner quảng cáo khóa học làm giàu siêu tốc với biểu đồ tăng trưởng không rủi ro.',
      extracted_text: 'BAO LỖ 100% - LÃI 30%/THÁNG',
      is_event_poster_or_relevant_banner: true,
      safety_flags: [],
    },
  },
};

const DOC_ASSETS = {
  'https://cdn.test.eventhub.vn/docs/toeic-vocab-list.docx': buildMinimalDocxBuffer(
    'TOEIC Essential Vocabulary List - Unit 1: Business & Office\n' +
    '1. Accompany (Verb) /əˈkʌm.pə.ni/: đi cùng, tháp tùng. Example: She will accompany me.\n' +
    '2. Accomplish (Verb) /əˈkʌm.plɪʃ/: hoàn thành.\n' +
    '3. Agreement (Noun) /əˈɡriː.mənt/: hợp đồng thỏa thuận.\n' +
    'Lesson Plan - Homework Exercise 1: Fill in the blanks using Noun, Verb, Adjective. Đáp án câu 1, câu 2.',
  ),
};

function buildValidPermitDocx(eventTitle, organizationName) {
  return buildMinimalDocxBuffer(
    `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\n` +
    `Độc lập - Tự do - Hạnh phúc\n` +
    `Số: 2027/GP-SVHTT\n` +
    `GIẤY XÁC NHẬN CHẤP THUẬN TỔ CHỨC SỰ KIỆN\n` +
    `Sở Văn hóa và Thể thao Thành phố Hồ Chí Minh xác nhận chấp thuận cho đơn vị tổ chức: ${organizationName} ` +
    `được phép tổ chức chương trình: "${eventTitle}" tại Nhà hát Bến Thành, Số 6 Mạc Đĩnh Chi, Phường Sài Gòn, TP. Hồ Chí Minh.\n` +
    `Ủy ban nhân dân và các cơ quan liên quan phối hợp đảm bảo an ninh trật tự. Ký tên và đóng dấu xác nhận.`,
  );
}

function createFetchRouter(originalFetch, dynamicDocs = {}) {
  const visionByBase64 = new Map();
  Object.values(MEDIA_ASSETS).forEach((asset) => {
    visionByBase64.set(asset.buffer.toString('base64'), asset.visionResult);
  });

  const makeBinaryResponse = (buffer, contentType) => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', contentType]]),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  });

  const makeJsonResponse = (obj) => ({
    ok: true,
    status: 200,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  });

  return async function routedFetch(url, init = {}) {
    const urlStr = String(url || '');

    if (MEDIA_ASSETS[urlStr]) {
      return makeBinaryResponse(MEDIA_ASSETS[urlStr].buffer, 'image/png');
    }
    if (DOC_ASSETS[urlStr]) {
      return makeBinaryResponse(
        DOC_ASSETS[urlStr],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    }
    if (dynamicDocs[urlStr]) {
      return makeBinaryResponse(
        dynamicDocs[urlStr],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    }

    const ollamaBaseUrl = (ollamaClient.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    if (!IS_LIVE_MODE && urlStr.startsWith(ollamaBaseUrl)) {
      if (urlStr.endsWith('/api/tags')) {
        return makeJsonResponse({
          models: [
            { name: ollamaClient.OLLAMA_VISION_MODEL },
            { name: ollamaClient.OLLAMA_VISION_FALLBACK_MODEL },
            { name: ollamaClient.OLLAMA_MODEL },
          ],
        });
      }

      if (urlStr.endsWith('/api/generate')) {
        const body = JSON.parse(init.body || '{}');
        const imgB64 = Array.isArray(body.images) ? body.images[0] : '';
        const matchedVision = visionByBase64.get(imgB64);
        if (matchedVision) {
          return makeJsonResponse({
            model: body.model,
            response: JSON.stringify(matchedVision),
          });
        }
        return makeJsonResponse({
          model: body.model,
          response: JSON.stringify({
            visual_description: 'Ảnh sự kiện tải lên rõ nét.',
            extracted_text: '',
            is_event_poster_or_relevant_banner: true,
            safety_flags: [],
          }),
        });
      }

      if (urlStr.endsWith('/api/chat')) {
        const body = JSON.parse(init.body || '{}');
        // Assert deterministic Stage 2 configuration (Phase 4A)
        if (body.options?.num_ctx !== 8192 || body.options?.temperature !== 0.1) {
          throw new Error(
            `Stage 2 LLM config mismatch: expected num_ctx=8192 & temperature=0.1, got num_ctx=${body.options?.num_ctx}, temperature=${body.options?.temperature}`,
          );
        }

        const userPrompt = String(body.messages?.[1]?.content || '');
        const hasMlMFraud =
          /lợi nhuận\s*30%\s*\/\s*tháng|lãi\s*30%\s*\/\s*tháng|bao lỗ\s*100%|đa cấp/i.test(userPrompt);
        const hasOffPlatformPay =
          /(bit\.ly|tinyurl\.com|t\.me|zalo\.me|chuyển khoản ngoài|stk cá nhân|ngoài sàn)/i.test(userPrompt);
        const hasIrrelevantDoc =
          /TÀI LIỆU RÁC \/ LẠC ĐỀ|IRRELEVANT_OR_FAKE_DOCUMENT/i.test(userPrompt);
        const hasIrrelevantBanner =
          /is_event_poster_or_relevant_banner:\s*false/i.test(userPrompt);
        const hasMissingBanner =
          /Ảnh bìa \(Cover Banner\):\s*CHƯA CÓ/i.test(userPrompt);

        // Scenario 5: Financial Fraud / MLM + Off-platform payment link
        if (hasMlMFraud || hasOffPlatformPay) {
          return makeJsonResponse({
            model: body.model,
            message: {
              content: JSON.stringify({
                decision: 'REJECT',
                risk_score: 95,
                quality_score: 10,
                summary:
                  'Sự kiện có dấu hiệu lừa đảo tài chính/đa cấp cam kết lợi nhuận phi thực tế và điều hướng thanh toán ngoài hệ thống EventHub.',
                compliant_checks: [],
                critical_violations: [
                  ...(hasMlMFraud
                    ? [
                        {
                          policy_code: 'ANTI_FINANCIAL_FRAUD_MLM',
                          issue: 'Cam kết lợi nhuận phi thực tế "30%/tháng" và "bao lỗ 100%" có dấu hiệu lừa đảo tài chính/đa cấp.',
                          highlighted_text: 'lợi nhuận 30%/tháng, bao lỗ 100%',
                        },
                      ]
                    : []),
                  ...(hasOffPlatformPay
                    ? [
                        {
                          policy_code: 'PAYMENT_POLICY',
                          issue: 'Chèn link rút gọn điều hướng người tham dự chuyển khoản ngoài nền tảng EventHub.',
                          highlighted_text: 'bit.ly/chuyen-khoan-ngoai-san',
                        },
                      ]
                    : []),
                ],
                warnings: [],
                suggestions: [],
                image_review: {
                  overall_image_verdict: 'SAFE',
                  items: [
                    {
                      source: 'MAIN_POSTER',
                      status: 'VALID',
                      analysis: 'Poster hiển thị rõ tên sự kiện.',
                      issues: [],
                      ocr_reasoning: '1. Nhìn thấy poster đầu tư tài chính. 2. Đọc được OCR lợi nhuận 30%/tháng.',
                      extracted_texts: ['ĐẦU TƯ AI CRYPTO LỢI NHUẬN 30%/THÁNG - BAO LỖ 100%'],
                    },
                  ],
                },
                document_review: { overall_document_verdict: 'NOT_REQUIRED', items: [] },
              }),
            },
            eval_count: 350,
          });
        }

        // Scenario 2: Invalid/Irrelevant Permit Document
        if (hasIrrelevantDoc) {
          return makeJsonResponse({
            model: body.model,
            message: {
              content: JSON.stringify({
                decision: 'REJECT',
                risk_score: 90,
                quality_score: 20,
                summary: 'Tài liệu đính kèm là danh sách từ vựng tiếng Anh / giáo án học tập, hoàn toàn không phải giấy phép sự kiện hợp lệ.',
                compliant_checks: ['Poster sự kiện rõ ràng'],
                critical_violations: [
                  {
                    policy_code: 'LEGAL_PERMIT_AUTHENTICITY',
                    issue: 'Tài liệu đính kèm là bảng từ vựng TOEIC / giáo án giảng dạy, không có giá trị pháp lý đối với sự kiện.',
                    highlighted_text: 'TOEIC Essential Vocabulary List',
                  },
                ],
                warnings: [],
                suggestions: [],
                image_review: {
                  overall_image_verdict: 'SAFE',
                  items: [
                    {
                      source: 'MAIN_POSTER',
                      status: 'VALID',
                      analysis: 'Poster hội thảo phù hợp chủ đề sự kiện.',
                      issues: [],
                      ocr_reasoning: '1. Quan sát thấy poster hội thảo AI. 2. OCR đọc đúng tên sự kiện.',
                      extracted_texts: ['HỘI THẢO KỸ NĂNG CÔNG NGHỆ AI 2027'],
                    },
                  ],
                },
                document_review: {
                  overall_document_verdict: 'VIOLATION',
                  items: [
                    {
                      source: 'PERMIT_DOCUMENT_1',
                      status: 'VIOLATION',
                      violation_type: 'IRRELEVANT_OR_FAKE_DOCUMENT',
                      analysis: 'Nội dung là danh sách từ vựng tiếng Anh TOEIC / bài tập, lạc đề so với hồ sơ pháp lý sự kiện.',
                      issues: ['Tài liệu rác / lạc đề (Danh sách từ vựng TOEIC / Giáo án).'],
                    },
                  ],
                },
              }),
            },
            eval_count: 320,
          });
        }

        // Scenario 1: Irrelevant Banner / Beer Meme photo on Tech/AI Workshop
        if (hasIrrelevantBanner) {
          return makeJsonResponse({
            model: body.model,
            message: {
              content: JSON.stringify({
                decision: 'REJECT',
                risk_score: 80,
                quality_score: 35,
                summary: 'Ảnh bìa/banner là ảnh bàn nhậu và meme hài hước không liên quan đến Hội thảo Kỹ năng Công nghệ AI.',
                compliant_checks: ['Địa điểm, lịch trình và vé đầy đủ'],
                critical_violations: [
                  {
                    policy_code: 'EVENT_COHERENCE',
                    issue: 'Hình ảnh bìa (Cover Banner) chụp bàn ăn nhậu/meme hài hước, không nhất quán với chủ đề Hội thảo Kỹ năng Công nghệ AI.',
                    highlighted_text: '1 2 3 DÔ! CUỐI TUẦN QUẨY TỚI BẾN MEME',
                  },
                ],
                warnings: [],
                suggestions: [],
                image_review: {
                  overall_image_verdict: 'VIOLATION',
                  items: [
                    {
                      source: 'MAIN_POSTER',
                      status: 'VALID',
                      analysis: 'Poster chính phù hợp với chủ đề hội thảo công nghệ AI.',
                      issues: [],
                      ocr_reasoning: 'Poster AI hợp lệ.',
                      extracted_texts: ['HỘI THẢO KỸ NĂNG CÔNG NGHỆ AI 2027'],
                    },
                    {
                      source: 'COVER_BANNER',
                      status: 'VIOLATION',
                      analysis: 'Ảnh bìa là ảnh bàn nhậu / meme hài hước không liên quan đến hội thảo công nghệ AI.',
                      issues: ['Hình ảnh không liên quan đến nội dung sự kiện (ảnh bàn ăn nhậu / meme).'],
                      ocr_reasoning: 'Phát hiện ảnh bàn nhậu & dòng chữ meme "1 2 3 DÔ!".',
                      extracted_texts: ['1 2 3 DÔ! CUỐI TUẦN QUẨY TỚI BẾN MEME'],
                    },
                  ],
                },
                document_review: { overall_document_verdict: 'NOT_REQUIRED', items: [] },
              }),
            },
            eval_count: 340,
          });
        }

        // Scenario 6 setup: valid small workshop missing cover banner -> NEEDS_REVIEW so Admin can override -> APPROVED
        if (hasMissingBanner) {
          return makeJsonResponse({
            model: body.model,
            message: {
              content: JSON.stringify({
                decision: 'NEEDS_REVIEW',
                risk_score: 30,
                quality_score: 75,
                summary: 'Sự kiện nội dung tốt nhưng chưa tải lên Ảnh bìa (Cover Banner), cần Admin xem xét duyệt.',
                compliant_checks: ['Nội dung, địa điểm và cơ cấu vé minh bạch'],
                critical_violations: [],
                warnings: [
                  {
                    policy_code: 'IMAGE_POLICY',
                    issue: 'Sự kiện chưa có ảnh bìa (Cover Banner).',
                  },
                ],
                suggestions: ['Bổ sung ảnh bìa kích thước ngang để tăng thẩm mỹ trang sự kiện.'],
                image_review: {
                  overall_image_verdict: 'SAFE',
                  items: [
                    {
                      source: 'MAIN_POSTER',
                      status: 'VALID',
                      analysis: 'Poster phù hợp chủ đề workshop.',
                      issues: [],
                      ocr_reasoning: 'Poster rõ nét.',
                      extracted_texts: ['WORKSHOP ACOUSTIC & COFFEE TALK CUỐI TUẦN'],
                    },
                  ],
                },
                document_review: { overall_document_verdict: 'NOT_REQUIRED', items: [] },
              }),
            },
            eval_count: 280,
          });
        }

        // Scenario 3 & 4: Clean compliant events -> APPROVE
        return makeJsonResponse({
          model: body.model,
          message: {
            content: JSON.stringify({
              decision: 'APPROVE',
              risk_score: 5,
              quality_score: 95,
              summary: 'Sự kiện đầy đủ thông tin, hình ảnh và hồ sơ đồng bộ với chủ đề, đề xuất phê duyệt.',
              compliant_checks: [
                'Địa điểm, lịch trình phiên và cơ cấu vé đầy đủ, minh bạch',
                'Hình ảnh poster/banner đồng bộ chủ đề sự kiện',
              ],
              critical_violations: [],
              warnings: [],
              suggestions: [],
              content_review: {
                title_status: 'VALID',
                title_analysis: 'Tiêu đề rõ ràng, đúng chuẩn.',
                description_status: 'VALID',
                description_analysis: 'Mô tả chi tiết minh bạch, đầy đủ lịch trình và quy định.',
                spelling_grammar_issues: [],
              },
              image_review: {
                overall_image_verdict: 'SAFE',
                items: [
                  {
                    source: 'MAIN_POSTER',
                    status: 'VALID',
                    analysis: 'Poster thiết kế chuẩn sự kiện, khớp tiêu đề.',
                    issues: [],
                    ocr_reasoning: 'Nhận diện poster đúng sự kiện và đọc rõ chữ tiêu đề.',
                    extracted_texts: [],
                  },
                ],
              },
              document_review: {
                overall_document_verdict: userPrompt.includes('Tài liệu đính kèm') ? 'VALID' : 'NOT_REQUIRED',
                items: [],
              },
            }),
          },
          eval_count: 300,
        });
      }
    }

    return originalFetch(url, init);
  };
}

// =========================================================================
// Database Fixtures for Isolated Real-DB Execution
// =========================================================================
async function loadBaseReferences() {
  const orgRes = await db.query(
    `SELECT o.id, o.user_id, o.organization_name, o.status
     FROM organizers o
     ORDER BY (o.status = 'ACTIVE') DESC, o.created_at ASC
     LIMIT 1`,
  );
  const catRes = await db.query(`SELECT id, name, slug FROM event_categories ORDER BY created_at ASC`);
  const venueRes = await db.query(
    `SELECT id, name, address_line, district, city
     FROM venues
     WHERE deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  const userRes = await db.query(
    `SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
  );

  if (!orgRes.rows[0] || !venueRes.rows[0] || !userRes.rows[0]) {
    throw new Error('Missing baseline organizers/venues/users in PostgreSQL to create isolated test events.');
  }

  const categories = catRes.rows || [];
  const pickCategory = (pattern) =>
    categories.find((c) => pattern.test(`${c.name} ${c.slug}`)) || categories[0] || null;

  return {
    organizer: orgRes.rows[0],
    techCategory: pickCategory(/cong-nghe|công nghệ|hoi-thao|hội thảo/i),
    musicCategory: pickCategory(/am-nhac|âm nhạc/i),
    venue: venueRes.rows[0],
    reviewerUserId: userRes.rows[0].id,
  };
}

async function createTempEvent(refs, spec) {
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const startTime = new Date(Date.now() + 20 * 86400000);
  const endTime = new Date(startTime.getTime() + 4 * 3600000);

  const eventRes = await db.query(
    `INSERT INTO events (
       organizer_id, category_id, title, slug, short_description, description,
       thumbnail_url, banner_url, format, visibility, tags, additional_terms,
       refund_policy, start_time, end_time, status, approval_status
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, 'PUBLIC', $10::text[], $11,
       $12::jsonb, $13, $14, 'PENDING_REVIEW', 'PENDING'
     )
     RETURNING id`,
    [
      refs.organizer.id,
      spec.categoryId ?? refs.techCategory?.id ?? null,
      spec.title,
      `test-ai-p4-${suffix}`,
      spec.shortDescription,
      spec.description,
      spec.thumbnailUrl,
      spec.bannerUrl,
      spec.format || 'OFFLINE',
      spec.tags || ['eventhub', 'test'],
      spec.additionalTerms || 'Vui lòng mang mã vé QR khi check-in tại sảnh chính.',
      JSON.stringify(spec.refundPolicy || {
        allow_refund: true,
        refund_before_days: 7,
        refund_rate: 100,
        permit_files: spec.permitFiles || [],
      }),
      startTime.toISOString(),
      endTime.toISOString(),
    ],
  );
  const eventId = eventRes.rows[0].id;

  const sessRes = await db.query(
    `INSERT INTO event_sessions (event_id, venue_id, session_name, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [eventId, refs.venue.id, 'Phiên chính', startTime.toISOString(), endTime.toISOString()],
  );
  const sessionId = sessRes.rows[0].id;

  await db.query(
    `INSERT INTO ticket_types (event_session_id, name, description, price, quantity, is_seated)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [sessionId, spec.ticketName || 'Vé Tiêu Chuẩn', 'Vé tham dự sự kiện chính thức', spec.ticketPrice ?? 199000, 100],
  );

  return eventId;
}

async function cleanupTempEvents(eventIds) {
  if (!eventIds.length) return;
  await db.query(`DELETE FROM event_ai_review_logs WHERE event_id = ANY($1::uuid[])`, [eventIds]);
  await db.query(
    `DELETE FROM ticket_types
     WHERE event_session_id IN (SELECT id FROM event_sessions WHERE event_id = ANY($1::uuid[]))`,
    [eventIds],
  );
  await db.query(`DELETE FROM event_sessions WHERE event_id = ANY($1::uuid[])`, [eventIds]);
  await db.query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [eventIds]);
}

function pad(str, len) {
  const s = String(str);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

async function main() {
  const originalFetch = global.fetch;
  const originalNotify = eventsAdminService._notifyReview.bind(eventsAdminService);
  const createdEventIds = [];
  const results = [];

  try {
    const criteria = await reviewCriteriaRepository.findActive();
    console.log(`\n[Phase 4 Accuracy Test] Mode: ${IS_LIVE_MODE ? 'LIVE OLLAMA' : 'DETERMINISTIC REAL PIPELINE'} | Active criteria in DB: ${criteria.length}`);
    console.log(`[Phase 4 Accuracy Test] Vision Primary: ${ollamaClient.OLLAMA_VISION_MODEL} | Fallback: ${ollamaClient.OLLAMA_VISION_FALLBACK_MODEL} | Stage 2 num_ctx: ${ollamaClient.OLLAMA_NUM_CTX}\n`);

    const refs = await loadBaseReferences();
    const validPermitUrl = 'https://cdn.test.eventhub.vn/docs/valid-tech-permit.docx';
    const dynamicDocs = {
      [validPermitUrl]: buildValidPermitDocx('Hội Thảo Công Nghệ AI Thực Chiến 2027', refs.organizer.organization_name),
    };

    global.fetch = createFetchRouter(originalFetch, dynamicDocs);
    eventsAdminService._notifyReview = async () => {};

    // ---------------------------------------------------------------------
    // TEST 1: Valid Event + Junk Drinking/Meme Banner -> REJECT / NEEDS_REVIEW
    // ---------------------------------------------------------------------
    {
      const id = await createTempEvent(refs, {
        title: 'Hội thảo Kỹ năng Công nghệ AI Thực chiến 2027',
        shortDescription: 'Chương trình đào tạo ứng dụng AI dành cho kỹ sư phần mềm và sinh viên CNTT.',
        description:
          '<p>Hội thảo chuyên sâu về ứng dụng Trí tuệ nhân tạo trong quy trình phát triển phần mềm, tổ chức chuyên nghiệp tại TP.HCM với sự góp mặt của các kỹ sư đầu ngành.</p>',
        thumbnailUrl: 'https://cdn.test.eventhub.vn/images/ai-workshop-poster.png',
        bannerUrl: 'https://cdn.test.eventhub.vn/images/junk-beer-meme.png',
        permitFiles: [],
      });
      createdEventIds.push(id);

      const saved = await eventsAdminService.runAiReview(id);
      const w = saved.warnings || {};
      const imgItems = w.image_review?.items || [];
      const bannerFlagged = imgItems.some(
        (it) =>
          it.source === 'COVER_BANNER' &&
          ['VIOLATION', 'WARNING'].includes(it.status) &&
          /không liên quan|nhậu|meme|poster/i.test(`${it.analysis || ''} ${(it.issues || []).join(' ')}`),
      );
      const ok = ['REJECT', 'NEEDS_REVIEW'].includes(saved.recommendation) && bannerFlagged;
      results.push({
        name: 'Test 1: Sự kiện hợp lệ + Ảnh bàn nhậu/Meme',
        expected: 'REJECT/NEEDS_REVIEW + image_review flag',
        actual: `${saved.recommendation} (bannerFlagged=${bannerFlagged}, risk=${w.risk_score})`,
        passed: ok,
      });
    }

    // ---------------------------------------------------------------------
    // TEST 2: Valid Event + TOEIC Vocab / Lesson Plan in permit_files -> REJECT
    // ---------------------------------------------------------------------
    {
      const id = await createTempEvent(refs, {
        title: 'Hội thảo Kỹ năng Công nghệ AI & Chuyển đổi số 2027',
        shortDescription: 'Hội thảo công nghệ chuyên sâu với diễn giả uy tín.',
        description:
          '<p>Chương trình chia sẻ kiến thức thực chiến về AI và kiến trúc hệ thống quy mô lớn dành cho cộng đồng công nghệ Việt Nam.</p>',
        thumbnailUrl: 'https://cdn.test.eventhub.vn/images/ai-workshop-poster.png',
        bannerUrl: 'https://cdn.test.eventhub.vn/images/ai-workshop-banner.png',
        permitFiles: [
          {
            file_name: 'TuVung_TOEIC_LessonPlan.docx',
            file_url: 'https://cdn.test.eventhub.vn/docs/toeic-vocab-list.docx',
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      });
      createdEventIds.push(id);

      const saved = await eventsAdminService.runAiReview(id);
      const w = saved.warnings || {};
      const hasDocViolation = (w.document_review?.items || []).some((it) => it.status === 'VIOLATION');
      const hasPermitCritical = (w.critical_violations || []).some(
        (v) => v.policy_code === 'LEGAL_PERMIT_AUTHENTICITY',
      );
      const ok = saved.recommendation === 'REJECT' && hasDocViolation && hasPermitCritical;
      results.push({
        name: 'Test 2: Sự kiện hợp lệ + Permit file Từ vựng TOEIC',
        expected: 'REJECT + LEGAL_PERMIT_AUTHENTICITY',
        actual: `${saved.recommendation} (docViolation=${hasDocViolation}, permitCritical=${hasPermitCritical})`,
        passed: ok,
      });
    }

    // ---------------------------------------------------------------------
    // TEST 3: Valid Event + Matching Legal Permit + Valid Poster -> APPROVE
    // ---------------------------------------------------------------------
    {
      const id = await createTempEvent(refs, {
        title: 'Hội Thảo Công Nghệ AI Thực Chiến 2027',
        shortDescription: 'Hội thảo công nghệ chính thống có văn bản chấp thuận tổ chức.',
        description:
          '<p>Hội thảo công nghệ quy mô chuyên sâu với đầy đủ nội dung chương trình, thời gian check-in, danh sách diễn giả và giấy xác nhận chấp thuận tổ chức hợp lệ.</p>',
        thumbnailUrl: 'https://cdn.test.eventhub.vn/images/ai-workshop-poster.png',
        bannerUrl: 'https://cdn.test.eventhub.vn/images/ai-workshop-banner.png',
        permitFiles: [
          {
            file_name: 'GiayXacNhan_ChapThuan_SuKien_2027.docx',
            file_url: validPermitUrl,
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      });
      createdEventIds.push(id);

      const saved = await eventsAdminService.runAiReview(id);
      const w = saved.warnings || {};
      const ok = saved.recommendation === 'APPROVE' && Number(w.risk_score) < 20 && Number(w.quality_score) >= 80;
      results.push({
        name: 'Test 3: Sự kiện hợp lệ + Giấy phép khớp tên & BTC',
        expected: 'APPROVE (risk<20, quality>=80)',
        actual: `${saved.recommendation} (risk=${w.risk_score}, quality=${w.quality_score})`,
        passed: ok,
      });
    }

    // ---------------------------------------------------------------------
    // TEST 4: Small Acoustic / Coffee Talk Workshop (no permit, venue in sessions) -> APPROVE
    // ---------------------------------------------------------------------
    {
      const id = await createTempEvent(refs, {
        title: 'Workshop Acoustic & Coffee Talk Cuối Tuần',
        categoryId: refs.musicCategory?.id,
        shortDescription: 'Buổi giao lưu âm nhạc acoustic kết hợp trò chuyện nghề sáng tạo nội dung.',
        description:
          '<p>Workshop Acoustic & Coffee Talk dành cho các bạn trẻ yêu âm nhạc giao lưu thân mật cuối tuần, hướng dẫn hợp âm cơ bản và chia sẻ câu chuyện sáng tác.</p>',
        thumbnailUrl: 'https://cdn.test.eventhub.vn/images/acoustic-poster.png',
        bannerUrl: 'https://cdn.test.eventhub.vn/images/acoustic-banner.png',
        permitFiles: [],
      });
      createdEventIds.push(id);

      const saved = await eventsAdminService.runAiReview(id);
      const w = saved.warnings || {};
      const ok = saved.recommendation === 'APPROVE';
      results.push({
        name: 'Test 4: Workshop Acoustic nhỏ (permit=[])',
        expected: 'APPROVE (không bắt lỗi oan)',
        actual: `${saved.recommendation} (risk=${w.risk_score}, quality=${w.quality_score})`,
        passed: ok,
      });
    }

    // ---------------------------------------------------------------------
    // TEST 5: Financial Fraud / MLM 30%/month + Shortened Off-Platform Payment Link -> REJECT
    // ---------------------------------------------------------------------
    {
      const id = await createTempEvent(refs, {
        title: 'Đầu tư AI Crypto Lợi Nhuận 30%/Tháng - Bao Lỗ 100%',
        shortDescription: 'Cơ hội đầu tư đa cấp tài chính siêu lợi nhuận không rủi ro.',
        description:
          '<p>Cam kết lợi nhuận 30%/tháng, bao lỗ 100%, x100 tài khoản sau 90 ngày. Để mua vé VIP ưu đãi không mất phí sàn, vui lòng truy cập link rút gọn https://bit.ly/chuyen-khoan-ngoai-san để chuyển khoản STK cá nhân.</p>',
        thumbnailUrl: 'https://cdn.test.eventhub.vn/images/crypto-scam-poster.png',
        bannerUrl: 'https://cdn.test.eventhub.vn/images/crypto-scam-banner.png',
        permitFiles: [],
      });
      createdEventIds.push(id);

      const saved = await eventsAdminService.runAiReview(id);
      const w = saved.warnings || {};
      const codes = new Set((w.critical_violations || []).map((v) => v.policy_code));
      const matchedPolicy = codes.has('ANTI_FINANCIAL_FRAUD_MLM') || codes.has('PAYMENT_POLICY');
      const ok = saved.recommendation === 'REJECT' && matchedPolicy;
      results.push({
        name: 'Test 5: Lừa đảo tài chính 30%/tháng + link ngoài sàn',
        expected: 'REJECT + ANTI_FINANCIAL_FRAUD_MLM/PAYMENT_POLICY',
        actual: `${saved.recommendation} (codes=${Array.from(codes).join(',')})`,
        passed: ok,
      });
    }

    // ---------------------------------------------------------------------
    // TEST 6: End-to-End Log & Admin Override Feedback Loop (NEEDS_REVIEW -> APPROVED)
    // ---------------------------------------------------------------------
    {
      const id = await createTempEvent(refs, {
        title: 'Workshop Acoustic & Coffee Talk Phiên Bản Đặc Biệt',
        categoryId: refs.musicCategory?.id,
        shortDescription: 'Giao lưu âm nhạc nhỏ cuối tuần chưa kịp tải ảnh bìa.',
        description:
          '<p>Buổi gặp mặt giao lưu âm nhạc mộc và chia sẻ kỹ năng trình diễn cho thành viên câu lạc bộ tại TP.HCM.</p>',
        thumbnailUrl: 'https://cdn.test.eventhub.vn/images/acoustic-poster.png',
        bannerUrl: null, // Intentionally omit banner to produce NEEDS_REVIEW on Stage 2
        permitFiles: [],
      });
      createdEventIds.push(id);

      const aiSaved = await eventsAdminService.runAiReview(id);
      if (aiSaved.recommendation !== 'NEEDS_REVIEW') {
        throw new Error(`Expected initial recommendation NEEDS_REVIEW for Test 6 setup, got ${aiSaved.recommendation}`);
      }

      await eventsAdminService.reviewEvent(refs.reviewerUserId, id, {
        status: 'APPROVED',
        review_note: 'Admin đã xác minh thông tin workshop hợp lệ và cho phép duyệt đè.',
      });

      const logRes = await db.query(
        `SELECT ai_recommendation, human_decision, human_override, input_snapshot, human_review_note
         FROM event_ai_review_logs
         WHERE event_id = $1::uuid AND review_stage = 'FULL_REVIEW'
         ORDER BY created_at DESC
         LIMIT 1`,
        [id],
      );
      const logRow = logRes.rows[0];
      const hasInputSnapshot = Boolean(
        logRow?.input_snapshot &&
        typeof logRow.input_snapshot === 'object' &&
        logRow.input_snapshot.event?.title &&
        logRow.input_snapshot.user_prompt,
      );
      const ok =
        Boolean(logRow) &&
        logRow.ai_recommendation === 'NEEDS_REVIEW' &&
        logRow.human_decision === 'APPROVED' &&
        logRow.human_override === true &&
        hasInputSnapshot;

      results.push({
        name: 'Test 6: Admin Override Feedback Loop & Log DB',
        expected: 'human_override=true + input_snapshot',
        actual: logRow
          ? `ai=${logRow.ai_recommendation}, human=${logRow.human_decision}, override=${logRow.human_override}, snapshot=${hasInputSnapshot}`
          : 'NO_LOG_ROW',
        passed: ok,
      });
    }

    // =====================================================================
    // Summary Report Table
    // =====================================================================
    console.log('\n=========================================================================================================');
    console.log('                       EVENTHUB AI EVENT REVIEW — ACCURACY VERIFICATION SUMMARY');
    console.log('=========================================================================================================');
    console.log(`${pad('KỊCH BẢN', 52)} | ${pad('KẾT QUẢ', 8)} | CHI TIẾT THỰC TẾ`);
    console.log('---------------------------------------------------------------------------------------------------------');
    results.forEach((r) => {
      console.log(`${pad(r.name, 52)} | ${pad(r.passed ? 'PASS' : 'FAIL', 8)} | ${r.actual}`);
    });
    console.log('---------------------------------------------------------------------------------------------------------');
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`TỔNG KẾT: ${passedCount}/${results.length} kịch bản ĐẠT (${Math.round((passedCount / results.length) * 100)}%)`);
    console.log('=========================================================================================================\n');

    process.exitCode = passedCount === results.length ? 0 : 1;
  } catch (err) {
    console.error('\n[Phase 4 Accuracy Test] FATAL ERROR:', err);
    process.exitCode = 1;
  } finally {
    global.fetch = originalFetch;
    eventsAdminService._notifyReview = originalNotify;
    try {
      await cleanupTempEvents(createdEventIds);
    } catch (cleanupErr) {
      console.warn('[Phase 4 Accuracy Test] Cleanup warning:', cleanupErr.message);
    }
    await db.pool?.end?.();
  }
}

main();
