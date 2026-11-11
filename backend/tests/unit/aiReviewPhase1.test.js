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
const { collectAllEventImages, fetchImageAsBase64 } = require('../../src/common/utils/htmlImageParser.util');
const reviewCriteriaRepository = require('../../src/modules/admin/reviewCriteria.repository');
const aiImageReviewService = require('../../src/modules/ai/aiImageReview.service');
const eventsAdminRepository = require('../../src/modules/admin/events.repository');
const eventsAdminService = require('../../src/modules/admin/events.service');

describe('Phase 1 — AI Event Review Fixes & Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('A. AiImageReviewService separation & Vision model fix', () => {
    it('passes explicit vision model when calling ollamaClient.chat with images', async () => {
      collectAllEventImages.mockReturnValue([{ source: 'MAIN_POSTER', url: 'https://cdn.example.com/poster.jpg' }]);
      fetchImageAsBase64.mockResolvedValue('base64data');
      ollamaClient.isHealthy.mockResolvedValue(true);
      ollamaClient.chat.mockResolvedValue({
        model: 'moondream',
        content: '{"decision":"APPROVED","flagged":false,"confidence_score":0.95,"ai_flagged_reasons":[],"ai_extracted_text":"Concert","safety_breakdown":{},"image_details":[]}',
      });
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'APPROVED',
        flagged: false,
        confidence_score: 0.95,
        ai_flagged_reasons: [],
        ai_extracted_text: 'Concert',
        safety_breakdown: {},
        image_details: [],
      });
      db.query.mockResolvedValue({ rows: [] });

      const result = await aiImageReviewService.reviewEventImages('evt-1', { title: 'Live Concert' });

      expect(result.decision).toBe('APPROVED');
      expect(ollamaClient.chat).toHaveBeenCalledTimes(1);
      const chatOptions = ollamaClient.chat.mock.calls[0][1];
      expect(chatOptions.model).toBe(process.env.OLLAMA_VISION_MODEL || 'moondream');
      expect(chatOptions.images).toEqual(['base64data']);
    });

    it('saveReviewResult updates only image pre-scan columns and never overwrites ai_recommendation or ai_reviewed_at', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await aiImageReviewService.saveReviewResult('evt-1', {
        decision: 'APPROVED',
        ai_flagged_reasons: [],
        ai_extracted_text: 'Poster text',
      });

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/review_status\s*=/i);
      expect(sql).toMatch(/ai_flagged_reasons\s*=/i);
      expect(sql).toMatch(/ai_extracted_text\s*=/i);
      expect(sql).toMatch(/ai_image_review_results\s*=/i);
      expect(sql).not.toMatch(/ai_recommendation\s*=/i);
      expect(sql).not.toMatch(/ai_reviewed_at\s*=/i);
      expect(params[0]).toBe('APPROVED');
      expect(params[4]).toBe('evt-1');
    });
  });

  describe('B. findEventFullDetailForAi & User Prompt Context', () => {
    it('findEventFullDetailForAi queries category, organizer, tags, additional_terms and session venues', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      await eventsAdminRepository.findEventFullDetailForAi('evt-1');

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql] = db.query.mock.calls[0];
      expect(sql).toContain('e.tags');
      expect(sql).toContain('e.additional_terms');
      expect(sql).toContain('e.short_description');
      expect(sql).toContain('e.format');
      expect(sql).toContain('e.visibility');
      expect(sql).toMatch(/LEFT JOIN event_categories\s+c\s+ON/i);
      expect(sql).toContain('c.name AS category_name');
      expect(sql).toContain('c.slug AS category_slug');
      expect(sql).toMatch(/LEFT JOIN organizers\s+o\s+ON/i);
      expect(sql).toContain('o.organization_name');
      expect(sql).toContain('o.description AS organizer_description');
      expect(sql).toContain('is_verified');
      expect(sql).toMatch(/LEFT JOIN venues\s+v\s+ON\s+v\.id\s*=\s*sess\.venue_id/i);
      expect(sql).toContain("'venue_name', v.name");
      expect(sql).toContain("'address', v.address_line");
      expect(sql).toContain("'district', v.district");
      expect(sql).toContain("'city', v.city");
      expect(sql).toContain("'province', v.city");
    });

    it('buildEventAiUserPrompt displays organizer, category, session venue address and OFFLINE venue note', () => {
      const prompt = eventsAdminService.buildEventAiUserPrompt({
        event: {
          title: 'Đêm Nhạc Acoustic 2027',
          category_name: 'Âm nhạc & Biểu diễn',
          category_slug: 'am-nhac-bieu-dien',
          format: 'OFFLINE',
          visibility: 'PUBLIC',
          tags: ['acoustic', 'live'],
          organization_name: 'Sân Khấu Quốc Thảo',
          organizer_description: 'Đơn vị tổ chức nghệ thuật chuyên nghiệp tại TP.HCM.',
          is_verified: true,
          start_time: '2027-01-10T12:00:00Z',
          end_time: '2027-01-10T15:00:00Z',
          sessions: [
            {
              session_name: 'Đêm diễn 1',
              start_time: '2027-01-10T12:00:00Z',
              end_time: '2027-01-10T15:00:00Z',
              venue_id: 'venue-1',
              venue_name: 'Nhà hát Bến Thành',
              address: 'Số 6 Mạc Đĩnh Chi',
              district: 'Quận 1',
              city: 'Thành phố Hồ Chí Minh',
            },
          ],
        },
        cleanShortDesc: 'Đêm nhạc ấm cúng',
        cleanDescription: 'Chương trình quy tụ nhiều nghệ sĩ.',
        cleanAdditionalTerms: 'Không mang đồ ăn bên ngoài.',
        imageSummary: '- Poster: ĐÃ CÓ',
        permitSummary: 'KHÔNG CÓ',
        distinctTicketCount: 1,
        sessionCount: 1,
        ticketSummary: 'Vé VIP: 500.000 VNĐ',
        refundSummary: 'Hoàn vé trước 3 ngày',
      });

      expect(prompt).toContain('Âm nhạc & Biểu diễn (am-nhac-bieu-dien)');
      expect(prompt).toContain('Sân Khấu Quốc Thảo');
      expect(prompt).toContain('Đã xác minh (ACTIVE)');
      expect(prompt).toContain('acoustic, live');
      expect(prompt).toContain('Không mang đồ ăn bên ngoài.');
      expect(prompt).toContain('Nhà hát Bến Thành, Số 6 Mạc Đĩnh Chi, Quận 1, Thành phố Hồ Chí Minh');
      expect(prompt).toContain('KHÔNG báo lỗi giả về thiếu địa điểm');
    });
  });

  describe('D. Non-blocking Full Review & Human Override Logging Hooks', () => {
    it('saveAiReview inserts FULL_REVIEW log and remains non-blocking if logging fails', async () => {
      const savedEventRow = {
        id: 'evt-1',
        event_id: 'evt-1',
        recommendation: 'APPROVE',
        warnings: { summary: 'OK', risk_score: 5, quality_score: 95 },
        created_at: new Date().toISOString(),
      };

      db.query
        .mockResolvedValueOnce({ rows: [savedEventRow] })
        .mockRejectedValueOnce(new Error('log table unavailable'));

      const result = await eventsAdminRepository.saveAiReview({
        eventId: 'evt-1',
        recommendation: 'APPROVE',
        warnings: savedEventRow.warnings,
        logContext: {
          modelName: 'eventhub-qwen3',
          criteriaSnapshot: [{ code: 'TERMS_ORGANIZER' }],
          inputSnapshot: { event: { id: 'evt-1' } },
          rawOutput: '{"decision":"APPROVE"}',
          riskScore: 5,
          qualityScore: 95,
        },
      });

      expect(result).toEqual(savedEventRow);
      expect(db.query).toHaveBeenCalledTimes(2);
      const [logSql, logParams] = db.query.mock.calls[1];
      expect(logSql).toContain('INSERT INTO event_ai_review_logs');
      expect(logSql).toContain("'FULL_REVIEW'");
      expect(logParams[0]).toBe('evt-1');
      expect(logParams[1]).toBe('eventhub-qwen3');
      expect(logParams[6]).toBe('APPROVE');
      expect(logParams[7]).toBe(5);
      expect(logParams[8]).toBe(95);
    });

    it('reviewEvent syncs human_decision & override SQL to latest FULL_REVIEW log and is non-blocking on log failure', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const updatedEvent = {
        id: 'evt-1',
        title: 'Test Event',
        status: 'COMPLETED',
        approval_status: 'APPROVED',
        organizer_id: 'org-1',
        review_note: 'Hợp lệ sau kiểm tra thủ công',
        reviewed_at: '2026-11-11T10:00:00Z',
      };

      db.getClient.mockResolvedValue(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'evt-1', status: 'PENDING_REVIEW' }] }) // FOR UPDATE
        .mockResolvedValueOnce({ rows: [updatedEvent] }) // UPDATE events
        .mockResolvedValueOnce({}); // COMMIT
      db.query.mockRejectedValueOnce(new Error('logging DB hiccup'));

      const result = await eventsAdminRepository.reviewEvent({
        eventId: 'evt-1',
        reviewedBy: 'admin-1',
        status: 'APPROVED',
        reviewNote: 'Hợp lệ sau kiểm tra thủ công',
      });

      expect(result).toEqual(updatedEvent);
      expect(db.query).toHaveBeenCalledTimes(1);
      const [syncSql, syncParams] = db.query.mock.calls[0];
      expect(syncSql).toContain('UPDATE event_ai_review_logs');
      expect(syncSql).toContain("review_stage = 'FULL_REVIEW'");
      expect(syncSql).toContain("latest_log.ai_recommendation = 'REJECT' AND $2::text = 'APPROVED'");
      expect(syncSql).toContain("latest_log.ai_recommendation = 'NEEDS_REVIEW' AND $2::text = 'APPROVED'");
      expect(syncSql).toContain("latest_log.ai_recommendation = 'APPROVE' AND $2::text = 'REJECTED'");
      expect(syncParams).toEqual([
        'evt-1',
        'APPROVED',
        'Hợp lệ sau kiểm tra thủ công',
        'admin-1',
        '2026-11-11T10:00:00Z',
      ]);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('runAiReview forwards logContext (modelName, criteriaSnapshot, inputSnapshot, rawOutput) to saveAiReview', async () => {
      const findDetailSpy = jest.spyOn(eventsAdminRepository, 'findEventFullDetailForAi').mockResolvedValue({
        id: 'evt-99',
        title: 'Tech Summit 2027',
        short_description: 'Hội nghị công nghệ',
        description: '<p>Nội dung chi tiết hội nghị công nghệ và các diễn giả hàng đầu.</p>',
        thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        banner_url: 'https://cdn.example.com/banner.jpg',
        format: 'OFFLINE',
        visibility: 'PUBLIC',
        tags: ['tech', 'ai'],
        additional_terms: 'Mang theo QR vé.',
        category_name: 'Công nghệ',
        category_slug: 'cong-nghe',
        organization_name: 'FPT EventHub',
        organizer_description: 'Tổ chức sự kiện công nghệ',
        is_verified: true,
        start_time: '2027-03-01T02:00:00Z',
        end_time: '2027-03-01T10:00:00Z',
        refund_policy: {},
        permits: [],
        sessions: [
          {
            id: 'sess-1',
            session_name: 'Sáng',
            start_time: '2027-03-01T02:00:00Z',
            end_time: '2027-03-01T10:00:00Z',
            venue_id: 'v-1',
            venue_name: 'NCC',
            address: 'Phạm Hùng',
            district: 'Nam Từ Liêm',
            city: 'Hà Nội',
          },
        ],
        ticket_types: [{ name: 'Standard', price: 200000, quantity: 100, is_seated: false }],
      });
      const saveSpy = jest.spyOn(eventsAdminRepository, 'saveAiReview').mockResolvedValue({
        id: 'evt-99',
        event_id: 'evt-99',
        recommendation: 'APPROVE',
        warnings: {},
        created_at: new Date().toISOString(),
      });

      reviewCriteriaRepository.findActive.mockResolvedValue([
        { id: 'c-1', code: 'TERMS_ORGANIZER', title: 'Điều khoản', category: 'LEGAL', severity: 'CRITICAL', rule_content: 'Không lừa đảo' },
      ]);
      collectAllEventImages.mockReturnValue([]);
      ollamaClient.isHealthy.mockResolvedValue(true);
      ollamaClient.chat.mockResolvedValue({
        model: 'eventhub-qwen3',
        content: '{"decision":"APPROVE","risk_score":5,"quality_score":95,"summary":"Đạt chuẩn","critical_violations":[],"warnings":[],"compliant_checks":["Hợp lệ"],"suggestions":[]}',
      });
      ollamaClient.extractJSON.mockReturnValue({
        decision: 'APPROVE',
        risk_score: 5,
        quality_score: 95,
        summary: 'Đạt chuẩn',
        critical_violations: [],
        warnings: [],
        compliant_checks: ['Hợp lệ'],
        suggestions: [],
      });

      await eventsAdminService.runAiReview('evt-99');

      expect(saveSpy).toHaveBeenCalledTimes(1);
      const callArg = saveSpy.mock.calls[0][0];
      expect(callArg.recommendation).toBe('APPROVE');
      expect(callArg.logContext.modelName).toBe('eventhub-qwen3');
      expect(callArg.logContext.criteriaSnapshot).toHaveLength(1);
      expect(callArg.logContext.inputSnapshot.event.organization_name).toBe('FPT EventHub');
      expect(callArg.logContext.inputSnapshot.event.category_name).toBe('Công nghệ');
      expect(callArg.logContext.inputSnapshot.user_prompt).toContain('KHÔNG báo lỗi giả về thiếu địa điểm');
      expect(callArg.logContext.rawOutput).toContain('"decision":"APPROVE"');

      findDetailSpy.mockRestore();
      saveSpy.mockRestore();
    });
  });
});
