jest.mock('../../src/infrastructure/database/db.client', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../src/infrastructure/ai/ollama.client', () => ({
  isHealthy: jest.fn(),
  chat: jest.fn(),
  extractJSON: jest.fn(),
  describeImageBatch: jest.fn(),
  OLLAMA_MODEL: 'eventhub-qwen3',
  OLLAMA_VISION_MODEL: 'moondream',
  OLLAMA_TIMEOUT: 90000,
  OLLAMA_VISION_TIMEOUT: 200000,
  OLLAMA_NUM_CTX: 8192,
}));

jest.mock('../../src/common/utils/htmlImageParser.util', () => ({
  collectAllEventImages: jest.fn(),
  fetchImageAsBase64: jest.fn(),
  extractImagesFromHtml: jest.fn(() => []),
  fetchDocumentContent: jest.fn(),
}));

jest.mock('../../src/modules/admin/reviewCriteria.repository', () => ({
  findActive: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  resetDefaults: jest.fn(),
}));

const db = require('../../src/infrastructure/database/db.client');
const ollamaClient = require('../../src/infrastructure/ai/ollama.client');
const realOllamaClient = jest.requireActual('../../src/infrastructure/ai/ollama.client');
const {
  collectAllEventImages,
  fetchImageAsBase64,
  fetchDocumentContent,
} = require('../../src/common/utils/htmlImageParser.util');
const reviewCriteriaRepository = require('../../src/modules/admin/reviewCriteria.repository');
const {
  IMAGE_MODERATION_SYSTEM_PROMPT,
  buildImageModerationUserPrompt,
} = require('../../src/modules/ai/prompts/imageModeration.prompt');
const aiImageReviewService = require('../../src/modules/ai/aiImageReview.service');
const eventsAdminRepository = require('../../src/modules/admin/events.repository');
const eventsAdminService = require('../../src/modules/admin/events.service');

const TEST_ACTIVE_CRITERIA = [
  { code: 'LEGAL_PERMIT_AUTHENTICITY', title: 'Giấy phép & Pháp lý sự kiện', category: 'LEGAL', severity: 'CRITICAL', rule_content: 'Kiểm tra tính xác thực và liên quan của giấy phép.' },
  { code: 'IMAGE_POLICY', title: 'Hình ảnh & Poster', category: 'MEDIA', severity: 'CRITICAL', rule_content: 'Ảnh phải hợp lệ, an toàn và phù hợp sự kiện.' },
  { code: 'EVENT_COHERENCE', title: 'Đồng nhất chủ đề', category: 'MEDIA', severity: 'WARNING', rule_content: 'Tiêu đề, mô tả và hình ảnh phải nhất quán.' },
  { code: 'TERMS_ORGANIZER', title: 'Nhà tổ chức & Điều khoản', category: 'LEGAL', severity: 'CRITICAL', rule_content: 'Thông tin đơn vị tổ chức minh bạch.' },
  { code: 'SESSION_SCHEDULE', title: 'Lịch trình & Địa điểm phiên', category: 'LOGISTICS', severity: 'WARNING', rule_content: 'Thời gian và địa điểm phiên hợp lý.' },
  { code: 'TICKET_POLICY', title: 'Cơ cấu loại vé', category: 'TICKETING', severity: 'WARNING', rule_content: 'Giá và số lượng vé minh bạch.' },
  { code: 'CONTENT_SPELLING', title: 'Nội dung & Chính tả', category: 'CONTENT', severity: 'WARNING', rule_content: 'Mô tả rõ ràng, hạn chế lỗi chính tả.' },
  { code: 'PAYMENT_POLICY', title: 'An toàn thanh toán', category: 'LEGAL', severity: 'CRITICAL', rule_content: 'Cấm lừa đảo hoặc thu tiền ngoài sàn.' },
];

describe('Phase 2 — Media Cross-Checking, Junk Document Detection & Anti-False-Positive Guardrails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Stage 1A — inspectDocumentLegality (Document Relevance & Junk Detection)', () => {
    const sampleEvent = {
      title: 'Hội thảo Công nghệ AI EventHub 2026',
      organization_name: 'Công ty Cổ phần Công nghệ NextGen',
      category_name: 'Công nghệ & Khởi nghiệp',
      format: 'OFFLINE',
    };

    it('returns NOT_REQUIRED without penalty when no permit file is attached for non-strict workshop/online event', () => {
      const result = eventsAdminService.inspectDocumentLegality('', '', {
        title: 'Workshop Thiết kế UI/UX căn bản',
        category_name: 'Đào tạo',
        format: 'ONLINE',
      });

      expect(result.status).toBe('NOT_REQUIRED');
      expect(result.is_valid).toBe(true);
      expect(result.violation_type).toBeNull();
    });

    it('returns MISSING when no permit file is attached for strict large festival event', () => {
      const result = eventsAdminService.inspectDocumentLegality('', '', {
        title: 'Đại nhạc hội Âm nhạc Quốc tế Ngoài trời 2026',
        category_name: 'Âm nhạc & Festival',
        format: 'OFFLINE',
      });

      expect(result.status).toBe('MISSING');
      expect(result.is_valid).toBe(false);
    });

    it.each([
      [
        'vocabulary list with IPA & Part of Speech',
        'Vocabulary Unit 3 - Part of Speech:\n1. conference (Noun) /ˈkɒnfərəns/ - hội nghị\n2. collaborate (Verb) /kəˈlæbəreɪt/ - hợp tác\n3. innovative (Adjective) /ˈɪnəveɪtɪv/ - đổi mới',
        'unit3_vocab.pdf',
      ],
      [
        'school lesson plan and Q&A exam',
        'Giáo án môn Ngữ Văn lớp 11 - Lesson Plan Tiết 12.\nCâu 1: Phân tích tác phẩm.\nCâu 2: Nêu cảm nhận.\nĐáp án: Học sinh trình bày mạch lạc...',
        'giao_an_tieng_viet.docx',
      ],
      [
        'personal CV / Resume',
        'CURRICULUM VITAE (CV xin việc)\nKinh nghiệm làm việc: 3 năm lập trình Frontend.\nKỹ năng cá nhân: ReactJS, Node.js, giao tiếp tốt.\nMục tiêu nghề nghiệp: Senior Developer.',
        'NguyenVanA_Resume.pdf',
      ],
      [
        'retail receipt / restaurant menu',
        'THỰC ĐƠN NHÀ HÀNG PHỐ BIỂN\nKhai vị: Gỏi cuốn tôm thịt 65k\nMón chính: Lẩu thái hải sản 280k\nTráng miệng: Chè hạt sen\nĐồ uống: Trà sữa trân châu',
        'thuc_don_quan.pdf',
      ],
      [
        'programming source code',
        "const express = require('express');\nmodule.exports = function handler(req, res) {\n  console.log('hello');\n  return res.json({ ok: true });\n}",
        'server.js',
      ],
    ])('flags blacklisted junk document (%s) as IRRELEVANT_OR_FAKE_DOCUMENT with relevance_score = 0', (_label, text, fileName) => {
      const result = eventsAdminService.inspectDocumentLegality(text, fileName, sampleEvent);

      expect(result.status).toBe('VIOLATION');
      expect(result.is_valid).toBe(false);
      expect(result.isSubstanceViolation).toBe(true);
      expect(result.relevance_score).toBe(0);
      expect(result.violation_type).toBe('IRRELEVANT_OR_FAKE_DOCUMENT');
      expect(result.reason).toBe('Tài liệu đính kèm không liên quan đến sự kiện hoặc không phải là văn bản pháp lý/giấy phép hợp lệ');
    });

    it('flags arbitrary unrelated document with zero event/organizer match and zero legal keywords', () => {
      const randomProse = 'Chuyến đi du lịch Đà Lạt cuối tuần ngắm hoa dã quỳ và thưởng thức bánh tráng nướng bên bờ hồ Xuân Hương tuyệt đẹp cùng bạn bè.';
      const result = eventsAdminService.inspectDocumentLegality(randomProse, 'nhat_ky.pdf', sampleEvent);

      expect(result.status).toBe('VIOLATION');
      expect(result.is_valid).toBe(false);
      expect(result.relevance_score).toBe(0);
      expect(result.violation_type).toBe('IRRELEVANT_OR_FAKE_DOCUMENT');
      expect(result.reason).toBe('Tài liệu đính kèm không liên quan đến sự kiện hoặc không phải là văn bản pháp lý/giấy phép hợp lệ');
    });

    it('approves authentic legal permit matching event & organizer with legal keywords', () => {
      const officialPermit = [
        'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
        'Độc lập - Tự do - Hạnh phúc',
        'GIẤY PHÉP TỔ CHỨC SỰ KIỆN',
        'Sở Văn hóa và Thể thao TP.HCM chấp thuận cho Công ty Cổ phần Công nghệ NextGen',
        'tổ chức sự kiện: Hội thảo Công nghệ AI EventHub 2026 tại Trung tâm Hội nghị Quận 1.',
      ].join('\n');

      const result = eventsAdminService.inspectDocumentLegality(officialPermit, 'giay_phep_chinh_thuc.pdf', sampleEvent);

      expect(result.status).toBe('VALID');
      expect(result.is_valid).toBe(true);
      expect(result.isSubstanceViolation).toBe(false);
      expect(result.violation_type).toBeNull();
      expect(result.relevance_score).toBeGreaterThanOrEqual(85);
    });

    it('does not falsely block official legal permit for a genuine IELTS / Language workshop', () => {
      const genuineIeltsPermit = [
        'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
        'Độc lập - Tự do - Hạnh phúc',
        'QUYẾT ĐỊNH CHẤP THUẬN TỔ CHỨC HỘI THẢO',
        'Sở Văn hóa xác nhận cấp phép cho Trung tâm Anh ngữ Sunrise tổ chức Ngày hội Luyện thi IELTS 2026.',
      ].join('\n');

      const result = eventsAdminService.inspectDocumentLegality(genuineIeltsPermit, 'giay_phep_hoi_thao_ielts.pdf', {
        title: 'Ngày hội Luyện thi IELTS 2026',
        organization_name: 'Trung tâm Anh ngữ Sunrise',
        category_name: 'Giáo dục',
      });

      expect(result.status).toBe('VALID');
      expect(result.is_valid).toBe(true);
      expect(result.violation_type).toBeNull();
    });
  });

  describe('Stage 1B — Vision Prompts, OllamaClient & AiImageReviewService', () => {
    it('includes [Event Title - Category] and 4 mandatory fields in Image Moderation prompts', () => {
      expect(IMAGE_MODERATION_SYSTEM_PROMPT).toContain('visual_description');
      expect(IMAGE_MODERATION_SYSTEM_PROMPT).toContain('extracted_text');
      expect(IMAGE_MODERATION_SYSTEM_PROMPT).toContain('is_event_poster_or_relevant_banner');
      expect(IMAGE_MODERATION_SYSTEM_PROMPT).toContain('safety_flags');
      expect(IMAGE_MODERATION_SYSTEM_PROMPT).toContain('scam_qr');

      const userPrompt = buildImageModerationUserPrompt(
        'Tech Summit 2026',
        [{ source: 'MAIN_POSTER' }],
        'Công nghệ',
      );
      expect(userPrompt).toContain('[Tech Summit 2026 - Công nghệ]');
      expect(userPrompt).toContain('Event Title: "Tech Summit 2026"');
      expect(userPrompt).toContain('Category: "Công nghệ"');
      expect(userPrompt).toContain('is_event_poster_or_relevant_banner');
      expect(userPrompt).toContain('safety_flags');
    });

    it('realOllamaClient.describeImageBatch sends Event Title + Category and returns 4 structured fields', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            visual_description: 'A casual bathroom mirror selfie holding a smartphone.',
            extracted_text: '',
            is_event_poster_or_relevant_banner: false,
            safety_flags: [],
          }),
        }),
      });

      try {
        const results = await realOllamaClient.describeImageBatch(
          [{ source: 'MAIN_POSTER', base64: 'fakeb64', url: 'https://cdn.example.com/selfie.jpg' }],
          'Hội thảo AI 2026',
          null,
          { category: 'Công nghệ' },
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const fetchBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe(realOllamaClient.OLLAMA_VISION_MODEL);
        expect(fetchBody.prompt).toContain('Hội thảo AI 2026');
        expect(fetchBody.prompt).toContain('Công nghệ');
        expect(fetchBody.prompt).toContain('is_event_poster_or_relevant_banner');
        expect(fetchBody.prompt).toContain('safety_flags');

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          source: 'MAIN_POSTER',
          visual_description: 'A casual bathroom mirror selfie holding a smartphone.',
          extracted_text: '',
          is_event_poster_or_relevant_banner: false,
          safety_flags: [],
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('aiImageReviewService blocks APPROVED decision when image is selfie/meme (is_event_poster_or_relevant_banner = false) or has scam_qr safety_flag', async () => {
      collectAllEventImages.mockReturnValue([{ source: 'MAIN_POSTER', url: 'https://cdn.example.com/meme.jpg' }]);
      fetchImageAsBase64.mockResolvedValue('base64meme');
      ollamaClient.isHealthy.mockResolvedValue(true);
      // Look up category name from event_categories via category_id
      db.query
        .mockResolvedValueOnce({ rows: [{ name: 'Âm nhạc' }] })
        .mockResolvedValueOnce({ rows: [] });

      ollamaClient.chat.mockResolvedValue({ model: 'moondream', content: '{}' });
      // Simulate Vision JSON erroneously saying APPROVED despite is_event_poster_or_relevant_banner = false
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'APPROVED',
        flagged: false,
        visual_description: 'Ảnh meme con mèo đang ngủ trên bàn phím.',
        extracted_text: '',
        is_event_poster_or_relevant_banner: false,
        safety_flags: [],
        ai_flagged_reasons: [],
        image_details: [
          {
            source_name: 'MAIN_POSTER',
            visual_description: 'Ảnh meme con mèo',
            extracted_text: '',
            is_event_poster_or_relevant_banner: false,
            safety_flags: [],
          },
        ],
      });

      const res = await aiImageReviewService.reviewEventImages('evt-meme', {
        title: 'Đêm nhạc Acoustic Mùa Thu',
        category_id: 'cat-music-1',
      });

      const passedUserPrompt = ollamaClient.chat.mock.calls[0][0][1].content;
      expect(passedUserPrompt).toContain('[Đêm nhạc Acoustic Mùa Thu - Âm nhạc]');
      expect(res.decision).toBe('FLAGGED');
      expect(res.flagged).toBe(true);
      expect(res.is_event_poster_or_relevant_banner).toBe(false);
      expect(res.ai_flagged_reasons.length).toBeGreaterThan(0);

      // Now verify safety_flags = ['scam_qr'] also forces FLAGGED
      db.query.mockResolvedValue({ rows: [] });
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'APPROVED',
        flagged: false,
        visual_description: 'Poster có chèn mã QR chuyển khoản ngân hàng cá nhân ngoài luồng.',
        extracted_text: 'CHUYEN KHOAN STK 99999',
        is_event_poster_or_relevant_banner: true,
        safety_flags: ['scam_qr'],
        ai_flagged_reasons: [],
        image_details: [],
      });

      const scamRes = await aiImageReviewService.reviewEventImages('evt-qr', {
        title: 'Liveshow Ca nhạc',
        category_name: 'Âm nhạc',
      });
      expect(scamRes.decision).toBe('FLAGGED');
      expect(scamRes.flagged).toBe(true);
      expect(scamRes.safety_flags).toEqual(['scam_qr']);
    });
  });

  describe('Stage 2 — System Prompt Rules, Guardrails & End-to-End runAiReview Enforcement', () => {
    const baseCriteria = TEST_ACTIVE_CRITERIA;

    it('buildAiReviewSystemPrompt enforces DOCUMENT_RELEVANCE, IMAGE_RELEVANCE, ANTI_FALSE_POSITIVE and VIOLATION/REJECTED alignment', () => {
      const sysPrompt = eventsAdminService.buildAiReviewSystemPrompt(baseCriteria);
      expect(sysPrompt).toContain('DOCUMENT_RELEVANCE');
      expect(sysPrompt).toContain('IMAGE_RELEVANCE');
      expect(sysPrompt).toContain('ANTI_FALSE_POSITIVE');
      expect(sysPrompt).toContain('NOT_REQUIRED');
      expect(sysPrompt).toContain('VIOLATION');
    });

    it('runAiReview hard-forces REJECT (risk_score >= 85) and LEGAL_PERMIT_AUTHENTICITY when Stage 1A detects IRRELEVANT_OR_FAKE_DOCUMENT, even if LLM tries to APPROVE', async () => {
      const event = {
        id: 'evt-vocab-doc',
        title: 'Workshop Khởi nghiệp Công nghệ 2026',
        category_name: 'Công nghệ',
        organization_name: 'TechHub VN',
        format: 'OFFLINE',
        short_description: 'Chia sẻ kinh nghiệm gọi vốn startup công nghệ.',
        description: '<p>Chương trình chia sẻ chuyên sâu dành cho các nhà sáng lập startup Việt Nam.</p>',
        thumbnail_url: 'https://cdn.example.com/tech-poster.jpg',
        banner_url: 'https://cdn.example.com/tech-banner.jpg',
        refund_policy: {
          permit_files: [
            {
              file_name: 'vocab_sheet.pdf',
              url: 'https://cdn.example.com/vocab_sheet.pdf',
              type: 'application/pdf',
            },
          ],
        },
        sessions: [
          {
            id: 's1',
            session_name: 'Phiên chính',
            venue_id: 'v1',
            venue_name: 'Saigon Innovation Hub',
            address: '273 Điện Biên Phủ, Quận 3',
            city: 'TP.HCM',
            start_time: new Date(Date.now() + 7 * 86400000).toISOString(),
            end_time: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
          },
        ],
        ticket_types: [{ name: 'Standard', price: 100000, quantity: 100, is_seated: false }],
      };

      const savedPayloads = [];
      jest.spyOn(eventsAdminRepository, 'findEventFullDetailForAi').mockResolvedValue(event);
      jest.spyOn(eventsAdminRepository, 'saveAiReview').mockImplementation(async (payload) => {
        savedPayloads.push(payload);
        return { id: payload.eventId, ai_recommendation: payload.recommendation, ai_warnings: payload.warnings };
      });
      reviewCriteriaRepository.findActive.mockResolvedValue(baseCriteria);

      collectAllEventImages.mockReturnValue([
        { source: 'PERMIT_DOCUMENT_1', fileName: 'vocab_sheet.pdf', url: 'https://cdn.example.com/vocab_sheet.pdf', fileType: 'application/pdf' },
        { source: 'MAIN_POSTER', url: 'https://cdn.example.com/tech-poster.jpg' },
        { source: 'COVER_BANNER', url: 'https://cdn.example.com/tech-banner.jpg' },
      ]);
      fetchDocumentContent.mockResolvedValue({
        hasText: true,
        text: 'Vocabulary List - Part of Speech: startup (Noun) /ˈstɑːrtʌp/, pitch (Verb) /pɪtʃ/, revenue (Noun) /ˈrevənjuː/.',
      });
      fetchImageAsBase64.mockResolvedValue('b64img');
      ollamaClient.isHealthy.mockResolvedValue(true);
      ollamaClient.describeImageBatch.mockResolvedValue([
        {
          source: 'MAIN_POSTER',
          description: 'Poster sự kiện Workshop Khởi nghiệp Công nghệ 2026',
          visual_description: 'Poster sự kiện Workshop Khởi nghiệp Công nghệ 2026',
          extracted_text: 'Workshop Khởi nghiệp Công nghệ 2026',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
        {
          source: 'COVER_BANNER',
          description: 'Banner sự kiện Workshop Khởi nghiệp',
          visual_description: 'Banner sự kiện Workshop Khởi nghiệp',
          extracted_text: 'TechHub VN',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
      ]);

      // Simulate overly lenient LLM attempting to APPROVE despite junk permit
      ollamaClient.chat.mockResolvedValue({ model: 'eventhub-qwen3', content: '{"decision":"APPROVE"}' });
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'APPROVE',
        risk_score: 5,
        quality_score: 96,
        summary: 'Sự kiện hợp lệ.',
        critical_violations: [],
        warnings: [],
        compliant_checks: ['Đã đính kèm giấy phép hợp lệ'],
        document_review: {
          overall_document_verdict: 'SAFE',
          items: [{ source: 'PERMIT_DOCUMENT_1', status: 'VALID' }],
        },
        image_review: {
          overall_image_verdict: 'SAFE',
          items: [
            { source: 'MAIN_POSTER', status: 'VALID' },
            { source: 'COVER_BANNER', status: 'VALID' },
          ],
        },
      });

      const saved = await eventsAdminService.runAiReview('evt-vocab-doc');

      expect(savedPayloads).toHaveLength(1);
      expect(saved.ai_recommendation).toBe('REJECT');
      expect(saved.ai_warnings.risk_score).toBeGreaterThanOrEqual(85);
      expect(saved.ai_warnings.quality_score).toBeLessThanOrEqual(40);
      expect(saved.ai_warnings.document_review.overall_document_verdict).toBe('VIOLATION');
      expect(saved.ai_warnings.document_review.items[0].status).toBe('VIOLATION');
      expect(saved.ai_warnings.document_review.items[0].violation_type).toBe('IRRELEVANT_OR_FAKE_DOCUMENT');
      expect(saved.ai_warnings.critical_violations.some((v) => v.policy_code === 'LEGAL_PERMIT_AUTHENTICITY')).toBe(true);
      expect(saved.ai_warnings.compliant_checks.some((c) => /giấy phép/i.test(c))).toBe(false);
    });

    it('runAiReview blocks APPROVE when Stage 1B reports is_event_poster_or_relevant_banner = false (e.g. food photo on Tech event)', async () => {
      const event = {
        id: 'evt-food-poster',
        title: 'Hội nghị Lập trình Cloud & DevOps 2026',
        category_name: 'Công nghệ',
        organization_name: 'CloudVN',
        format: 'ONLINE',
        short_description: 'Hội nghị trực tuyến về kiến trúc Cloud Native.',
        description: '<p>Cập nhật xu hướng Kubernetes và DevOps hiện đại cho kỹ sư phần mềm.</p>',
        thumbnail_url: 'https://cdn.example.com/food_table.jpg',
        banner_url: 'https://cdn.example.com/cloud_banner.jpg',
        sessions: [
          {
            id: 's1',
            session_name: 'Online Keynote',
            start_time: new Date(Date.now() + 7 * 86400000).toISOString(),
            end_time: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
          },
        ],
        ticket_types: [{ name: 'Free Pass', price: 0, quantity: 300, is_seated: false }],
      };

      jest.spyOn(eventsAdminRepository, 'findEventFullDetailForAi').mockResolvedValue(event);
      jest.spyOn(eventsAdminRepository, 'saveAiReview').mockImplementation(async (payload) => ({
        id: payload.eventId,
        ai_recommendation: payload.recommendation,
        ai_warnings: payload.warnings,
      }));
      reviewCriteriaRepository.findActive.mockResolvedValue(baseCriteria);

      collectAllEventImages.mockReturnValue([
        { source: 'MAIN_POSTER', url: 'https://cdn.example.com/food_table.jpg' },
        { source: 'COVER_BANNER', url: 'https://cdn.example.com/cloud_banner.jpg' },
      ]);
      fetchImageAsBase64.mockResolvedValue('b64food');
      ollamaClient.isHealthy.mockResolvedValue(true);
      ollamaClient.describeImageBatch.mockResolvedValue([
        {
          source: 'MAIN_POSTER',
          description: 'Ảnh bàn ăn với đĩa thức ăn và ly bia, không liên quan đến hội nghị công nghệ',
          visual_description: 'Plates of food and beer glasses on a dining table',
          extracted_text: '',
          is_event_poster_or_relevant_banner: false,
          safety_flags: [],
        },
        {
          source: 'COVER_BANNER',
          description: 'Banner hội nghị Cloud & DevOps 2026',
          visual_description: 'Designed event banner for Cloud & DevOps 2026',
          extracted_text: 'Cloud & DevOps 2026',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
      ]);

      ollamaClient.chat.mockResolvedValue({ model: 'eventhub-qwen3', content: '{"decision":"APPROVE"}' });
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'APPROVE',
        risk_score: 5,
        quality_score: 95,
        summary: 'Sự kiện ổn.',
        critical_violations: [],
        warnings: [],
        compliant_checks: ['Poster hợp lệ'],
        image_review: {
          overall_image_verdict: 'SAFE',
          items: [
            { source: 'MAIN_POSTER', status: 'VALID', analysis: 'Ảnh ổn' },
            { source: 'COVER_BANNER', status: 'VALID', analysis: 'Banner ổn' },
          ],
        },
      });

      const saved = await eventsAdminService.runAiReview('evt-food-poster');

      expect(saved.ai_recommendation).not.toBe('APPROVE');
      expect(['REJECT', 'NEEDS_REVIEW']).toContain(saved.ai_recommendation);
      const posterReview = saved.ai_warnings.image_review.items.find((i) => i.source === 'MAIN_POSTER');
      expect(['VIOLATION', 'WARNING']).toContain(posterReview.status);
      expect(posterReview.issues.length).toBeGreaterThan(0);
      expect(saved.ai_warnings.vision_analysis[0].is_event_poster_or_relevant_banner).toBe(false);
    });

    it('ANTI_FALSE_POSITIVE strips hallucinated missing-venue & missing-permit complaints for valid OFFLINE workshop with DB venue', async () => {
      const event = {
        id: 'evt-valid-offline',
        title: 'Workshop Thiết kế Sản phẩm Số 2026',
        category_name: 'Giáo dục & Hội thảo',
        organization_name: 'DesignLab Việt Nam',
        is_verified: true,
        format: 'OFFLINE',
        short_description: 'Workshop thực hành Product Design tại TP.HCM.',
        description: '<p>Cùng chuyên gia xây dựng Product Roadmap và Design System trong 1 ngày thực hành.</p>',
        thumbnail_url: 'https://cdn.example.com/design_poster.jpg',
        banner_url: 'https://cdn.example.com/design_banner.jpg',
        sessions: [
          {
            id: 's1',
            session_name: 'Buổi sáng',
            venue_id: 'venue-101',
            venue_name: 'CirCO Co-working Space',
            address: '222 Điện Biên Phủ, Phường Võ Thị Sáu',
            district: 'Quận 3',
            city: 'TP.HCM',
            start_time: new Date(Date.now() + 10 * 86400000).toISOString(),
            end_time: new Date(Date.now() + 10 * 86400000 + 14400000).toISOString(),
          },
        ],
        ticket_types: [{ name: 'Early Bird', price: 250000, quantity: 60, is_seated: false }],
      };

      jest.spyOn(eventsAdminRepository, 'findEventFullDetailForAi').mockResolvedValue(event);
      jest.spyOn(eventsAdminRepository, 'saveAiReview').mockImplementation(async (payload) => ({
        id: payload.eventId,
        ai_recommendation: payload.recommendation,
        ai_warnings: payload.warnings,
      }));
      reviewCriteriaRepository.findActive.mockResolvedValue(baseCriteria);

      collectAllEventImages.mockReturnValue([
        { source: 'MAIN_POSTER', url: 'https://cdn.example.com/design_poster.jpg' },
        { source: 'COVER_BANNER', url: 'https://cdn.example.com/design_banner.jpg' },
      ]);
      fetchImageAsBase64.mockResolvedValue('b64poster');
      ollamaClient.isHealthy.mockResolvedValue(true);
      ollamaClient.describeImageBatch.mockResolvedValue([
        {
          source: 'MAIN_POSTER',
          description: 'Poster sự kiện Workshop Thiết kế Sản phẩm Số 2026 chuyên nghiệp',
          visual_description: 'Modern design workshop event poster',
          extracted_text: 'Workshop Thiết kế Sản phẩm Số 2026',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
        {
          source: 'COVER_BANNER',
          description: 'Cover banner Workshop Thiết kế Sản phẩm Số 2026',
          visual_description: 'Wide banner for Design Workshop',
          extracted_text: 'DesignLab Việt Nam',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
      ]);

      // Simulate noisy LLM hallucinating missing address & missing permit
      ollamaClient.chat.mockResolvedValue({ model: 'eventhub-qwen3', content: '{"decision":"NEEDS_REVIEW"}' });
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'NEEDS_REVIEW',
        risk_score: 55,
        quality_score: 55,
        summary: 'Cần bổ sung địa điểm và giấy phép.',
        critical_violations: [
          { policy_code: 'LEGAL_PERMIT_AUTHENTICITY', issue: 'Sự kiện chưa đính kèm giấy phép tổ chức.' },
        ],
        warnings: [
          { policy_code: 'SESSION_SCHEDULE', issue: 'Bài viết mô tả chưa ghi rõ địa chỉ tổ chức, thiếu địa điểm.' },
        ],
        compliant_checks: ['Lịch trình hợp lệ'],
        image_review: {
          overall_image_verdict: 'SAFE',
          items: [
            { source: 'MAIN_POSTER', status: 'VALID' },
            { source: 'COVER_BANNER', status: 'VALID' },
          ],
        },
      });

      const saved = await eventsAdminService.runAiReview('evt-valid-offline');

      expect(saved.ai_recommendation).toBe('APPROVE');
      expect(saved.ai_warnings.critical_violations).toEqual([]);
      expect(saved.ai_warnings.warnings).toEqual([]);
      expect(saved.ai_warnings.risk_score).toBeLessThanOrEqual(20);
      expect(saved.ai_warnings.quality_score).toBeGreaterThanOrEqual(85);
    });

    it('ANTI_FALSE_POSITIVE strips physical-address & missing-permit complaints for valid ONLINE webinar', () => {
      const result = eventsAdminService.applyStage2Guardrails({
        event: {
          title: 'Webinar Hướng nghiệp Data Analyst 2026',
          category_name: 'Giáo dục',
          format: 'ONLINE',
        },
        activeCodes: new Set(baseCriteria.map((c) => c.code)),
        permitFiles: [],
        sessionList: [{ session_name: 'Livestream Zoom' }],
        hasThumbnail: true,
        hasBanner: true,
        imageAnalysisResults: [
          { source: 'MAIN_POSTER', is_event_poster_or_relevant_banner: true, safety_flags: [] },
          { source: 'COVER_BANNER', is_event_poster_or_relevant_banner: true, safety_flags: [] },
        ],
        criticalViolations: [
          { policy_code: 'LEGAL_PERMIT_AUTHENTICITY', issue: 'Thiếu giấy phép tổ chức sự kiện.' },
        ],
        yellowWarnings: [
          { policy_code: 'SESSION_SCHEDULE', issue: 'Sự kiện chưa có địa chỉ đường phố vật lý cụ thể.' },
        ],
        parsedQuality: 60,
        parsedRisk: 50,
      });

      expect(result.recommendation).toBe('APPROVE');
      expect(result.criticalViolations).toEqual([]);
      expect(result.yellowWarnings).toEqual([]);
      expect(result.finalRiskScore).toBeLessThanOrEqual(20);
      expect(result.finalQualityScore).toBeGreaterThanOrEqual(85);
    });

    it('enforces Stage 1A REJECT guardrail and preserves all Admin UI keys even when Stage 2 LLM falls back to heuristic mode', async () => {
      const event = {
        id: 'evt-fallback-doc',
        title: 'Lễ hội Âm nhạc Mùa Hè',
        category_name: 'Âm nhạc',
        organization_name: 'LiveStage VN',
        format: 'OFFLINE',
        short_description: 'Đêm nhạc ngoài trời dành cho giới trẻ.',
        description: '<p>Chương trình biểu diễn âm nhạc sôi động với các nghệ sĩ trẻ được yêu thích.</p>',
        thumbnail_url: 'https://cdn.example.com/music_poster.jpg',
        banner_url: 'https://cdn.example.com/music_banner.jpg',
        refund_policy: {
          permit_files: [{ file_name: 'de_thi_toan.pdf', url: 'https://cdn.example.com/de_thi_toan.pdf' }],
        },
        sessions: [
          {
            id: 's1',
            session_name: 'Đêm chính',
            venue_id: 'v-san',
            venue_name: 'Sân vận động QK7',
            address: '202 Hoàng Văn Thụ, Tân Bình',
            city: 'TP.HCM',
            start_time: new Date(Date.now() + 8 * 86400000).toISOString(),
            end_time: new Date(Date.now() + 8 * 86400000 + 10800000).toISOString(),
          },
        ],
        ticket_types: [{ name: 'GA', price: 300000, quantity: 500, is_seated: false }],
      };

      jest.spyOn(eventsAdminRepository, 'findEventFullDetailForAi').mockResolvedValue(event);
      jest.spyOn(eventsAdminRepository, 'saveAiReview').mockImplementation(async (payload) => ({
        id: payload.eventId,
        ai_recommendation: payload.recommendation,
        ai_warnings: payload.warnings,
      }));
      reviewCriteriaRepository.findActive.mockResolvedValue(baseCriteria);

      collectAllEventImages.mockReturnValue([
        { source: 'PERMIT_DOCUMENT_1', fileName: 'de_thi_toan.pdf', url: 'https://cdn.example.com/de_thi_toan.pdf' },
        { source: 'MAIN_POSTER', url: 'https://cdn.example.com/music_poster.jpg' },
        { source: 'COVER_BANNER', url: 'https://cdn.example.com/music_banner.jpg' },
      ]);
      fetchDocumentContent.mockResolvedValue({
        hasText: true,
        text: 'ĐỀ THI KIỂM TRA HỌC KỲ I\nCâu 1: Giải phương trình bậc 2.\nCâu 2: Tìm giá trị lớn nhất.\nĐáp án: Câu 1 x = 2.',
      });
      fetchImageAsBase64.mockResolvedValue('b64music');
      ollamaClient.isHealthy.mockResolvedValue(true);
      ollamaClient.describeImageBatch.mockResolvedValue([
        {
          source: 'MAIN_POSTER',
          description: 'Poster Lễ hội Âm nhạc Mùa Hè',
          visual_description: 'Concert poster with stage lighting',
          extracted_text: 'Lễ hội Âm nhạc Mùa Hè',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
        {
          source: 'COVER_BANNER',
          description: 'Banner Lễ hội Âm nhạc Mùa Hè',
          visual_description: 'Music festival cover banner',
          extracted_text: 'LiveStage VN',
          is_event_poster_or_relevant_banner: true,
          safety_flags: [],
        },
      ]);

      // Simulate Stage 2 LLM crash -> triggers heuristic fallback
      ollamaClient.chat.mockRejectedValue(new Error('Ollama Stage 2 timeout'));

      const saved = await eventsAdminService.runAiReview('evt-fallback-doc');

      expect(saved.ai_recommendation).toBe('REJECT');
      expect(saved.ai_warnings.risk_score).toBeGreaterThanOrEqual(85);
      expect(saved.ai_warnings.critical_violations.some((v) => v.policy_code === 'LEGAL_PERMIT_AUTHENTICITY')).toBe(true);
      expect(saved.ai_warnings.document_review.items[0].violation_type).toBe('IRRELEVANT_OR_FAKE_DOCUMENT');

      // Verify zero breakage on top-level ai_warnings keys consumed by AdminEventReviewDetailPage.jsx
      const expectedKeys = [
        'summary',
        'risk_score',
        'quality_score',
        'compliant_checks',
        'critical_violations',
        'warnings',
        'suggestions',
        'flat_warnings',
        'content_review',
        'image_review',
        'document_review',
        'applied_criteria',
        'vision_analysis',
        'document_analysis',
      ];
      expectedKeys.forEach((k) => {
        expect(Object.prototype.hasOwnProperty.call(saved.ai_warnings, k)).toBe(true);
      });
    });
  });
});
