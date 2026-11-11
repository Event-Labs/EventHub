jest.mock('../../src/infrastructure/database/db.client', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const realOllamaClient = jest.requireActual('../../src/infrastructure/ai/ollama.client');

describe('Phase 4 — Vision Model Upgrade (qwen2.5vl:3b + moondream fallback) & Deterministic Stage 2 Config', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('defaults OLLAMA_VISION_MODEL to qwen2.5vl:3b, OLLAMA_VISION_FALLBACK_MODEL to moondream, and OLLAMA_NUM_CTX to 8192', () => {
    const prevVision = process.env.OLLAMA_VISION_MODEL;
    const prevFallback = process.env.OLLAMA_VISION_FALLBACK_MODEL;
    const prevCtx = process.env.OLLAMA_NUM_CTX;
    delete process.env.OLLAMA_VISION_MODEL;
    delete process.env.OLLAMA_VISION_FALLBACK_MODEL;
    delete process.env.OLLAMA_NUM_CTX;

    jest.isolateModules(() => {
      const freshOllama = require('../../src/infrastructure/ai/ollama.client');
      expect(freshOllama.OLLAMA_VISION_MODEL).toBe('qwen2.5vl:3b');
      expect(freshOllama.OLLAMA_VISION_FALLBACK_MODEL).toBe('moondream');
      expect(freshOllama.OLLAMA_NUM_CTX).toBe(8192);
    });

    if (prevVision !== undefined) process.env.OLLAMA_VISION_MODEL = prevVision;
    if (prevFallback !== undefined) process.env.OLLAMA_VISION_FALLBACK_MODEL = prevFallback;
    if (prevCtx !== undefined) process.env.OLLAMA_NUM_CTX = prevCtx;
  });

  it('analyzeImageDetailed falls back automatically to moondream when primary vision model (qwen2.5vl:3b) is not pulled', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "model 'qwen2.5vl:3b' not found",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            visual_description: 'Designed music concert poster with stage lighting and event schedule.',
            extracted_text: 'DEM NHAC ACOUSTIC 2027',
            is_event_poster_or_relevant_banner: true,
            safety_flags: [],
          }),
        }),
      });
    global.fetch = fetchMock;

    let result;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
    });

    result = await realOllamaClient.analyzeImageDetailed(
      'ZmFrZWltYWdl',
      '',
      'MAIN_POSTER',
      'Đêm Nhạc Acoustic 2027',
      false,
      null,
      'Âm nhạc',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(firstBody.model).toBe(realOllamaClient.OLLAMA_VISION_MODEL);
    expect(secondBody.model).toBe(realOllamaClient.OLLAMA_VISION_FALLBACK_MODEL);
    expect(result.extracted_text).toBe('DEM NHAC ACOUSTIC 2027');
    expect(result.is_event_poster_or_relevant_banner).toBe(true);
    expect(result.safety_flags).toEqual([]);
  });

  it('chat() with images falls back to OLLAMA_VISION_FALLBACK_MODEL (moondream) instead of text fallback model', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "model 'qwen2.5vl:3b' not found",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'moondream',
          message: { content: '{"decision":"APPROVED","flagged":false}' },
          eval_count: 42,
        }),
      });
    global.fetch = fetchMock;

    const res = await realOllamaClient.chat(
      [
        { role: 'system', content: 'Review image' },
        { role: 'user', content: 'Check poster' },
      ],
      {
        model: 'qwen2.5vl:3b',
        images: ['ZmFrZWltYWdl'],
        temperature: 0.1,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.model).toBe('qwen2.5vl:3b');
    expect(secondBody.model).toBe('moondream');
    expect(res.model).toBe('moondream');
  });

  it('eventsAdminService.runAiReview invokes Stage 2 chat with temperature: 0.1 and num_ctx: 8192', async () => {
    const db = require('../../src/infrastructure/database/db.client');
    const reviewCriteriaRepository = require('../../src/modules/admin/reviewCriteria.repository');
    const ollamaClient = require('../../src/infrastructure/ai/ollama.client');
    const htmlImageParser = require('../../src/common/utils/htmlImageParser.util');

    jest.spyOn(reviewCriteriaRepository, 'findActive').mockResolvedValue([
      { code: 'IMAGE_POLICY', title: 'Ảnh sự kiện', severity: 'WARNING', rule_content: 'Kiểm tra ảnh', is_active: true },
    ]);
    jest.spyOn(ollamaClient, 'isHealthy').mockResolvedValue(true);
    jest.spyOn(ollamaClient, 'describeImageBatch').mockResolvedValue([
      {
        source: 'MAIN_POSTER',
        url: 'https://cdn.example.com/poster.jpg',
        visual_description: 'Poster chuẩn cho Workshop Công nghệ AI 2027',
        extracted_text: 'WORKSHOP AI 2027',
        is_event_poster_or_relevant_banner: true,
        safety_flags: [],
        description: 'Poster chuẩn',
      },
    ]);
    const chatSpy = jest.spyOn(ollamaClient, 'chat').mockResolvedValue({
      model: 'eventhub-qwen3',
      content: JSON.stringify({
        decision: 'APPROVE',
        risk_score: 5,
        quality_score: 95,
        summary: 'Sự kiện hợp lệ, đề xuất phê duyệt.',
        compliant_checks: ['Poster rõ ràng'],
        critical_violations: [],
        warnings: [],
        suggestions: [],
      }),
    });
    jest.spyOn(htmlImageParser, 'fetchImageAsBase64').mockResolvedValue('ZmFrZWltYWdl');

    // Mock findEventFullDetailForAi, saveAiReview, and log insert
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'evt-p4',
            title: 'Workshop Công nghệ AI 2027',
            short_description: 'Chia sẻ ứng dụng AI thực tế.',
            description: '<p>Workshop chia sẻ ứng dụng AI thực tế dành cho kỹ sư phần mềm tại TP.HCM.</p>',
            thumbnail_url: 'https://cdn.example.com/poster.jpg',
            banner_url: 'https://cdn.example.com/banner.jpg',
            format: 'OFFLINE',
            visibility: 'PUBLIC',
            tags: ['ai'],
            category_name: 'Công nghệ',
            organization_name: 'TechLab VN',
            organizer_description: 'Tổ chức cộng đồng công nghệ.',
            is_verified: true,
            start_time: new Date(Date.now() + 14 * 86400000).toISOString(),
            end_time: new Date(Date.now() + 14 * 86400000 + 10800000).toISOString(),
            sessions: [
              {
                session_name: 'Phiên chính',
                start_time: new Date(Date.now() + 14 * 86400000).toISOString(),
                end_time: new Date(Date.now() + 14 * 86400000 + 10800000).toISOString(),
                venue_id: 'v-1',
                venue_name: 'Tech Hub Q1',
                address: '123 Lê Lợi',
                district: 'Quận 1',
                city: 'TP.HCM',
              },
            ],
            ticket_types: [{ name: 'Vé chuẩn', price: 150000, quantity: 100, is_seated: false }],
            permits: [],
            refund_policy: { allow_refund: true, refund_before_days: 3, refund_rate: 100 },
          },
        ],
      })
      .mockResolvedValue({
        rows: [{ id: 'evt-p4', event_id: 'evt-p4', recommendation: 'APPROVE', warnings: {}, created_at: new Date() }],
      });

    const eventsAdminService = require('../../src/modules/admin/events.service');
    await eventsAdminService.runAiReview('evt-p4');

    expect(chatSpy).toHaveBeenCalledTimes(1);
    const chatOptions = chatSpy.mock.calls[0][1];
    expect(chatOptions.temperature).toBe(0.1);
    expect(chatOptions.num_ctx).toBe(8192);
    expect(chatOptions.format).toBe('json');
    expect(chatOptions.max_tokens).toBe(2048);
  });

  it('ollamaClient.chat forwards format: "json" and extractJSON cleans unclosed <think> before truncated repair', async () => {
    jest.resetModules();
    const realOllamaClient = jest.requireActual('../../src/infrastructure/ai/ollama.client');

    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'eventhub-qwen3',
        message: { content: '{"decision":"APPROVE","risk_score":5}' },
      }),
    }));
    global.fetch = fetchMock;

    await realOllamaClient.chat(
      [{ role: 'user', content: 'Review event' }],
      { format: 'json', num_ctx: 8192 },
    );

    const reqBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(reqBody.format).toBe('json');

    // Think block contains stray brace; valid truncated JSON follows closing </think>
    const mixedThinkTruncated = '<think>{"noise": 123}</think>\n{"decision": "REJECT", "risk_score": 90, "summary": "Loi tai lieu"';
    const parsedMixed = realOllamaClient.extractJSON(mixedThinkTruncated);
    expect(parsedMixed).toEqual(expect.objectContaining({ decision: 'REJECT', risk_score: 90 }));

    // Unclosed <think> block alone returns null rather than parsing think text
    expect(realOllamaClient.extractJSON('<think>reasoning {"fake": true}')).toBeNull();
  });

  it('stripHtmlForAiPrompt decodes HTML entities and runAiReview scales num_ctx dynamically on huge prompts', async () => {
    const db = require('../../src/infrastructure/database/db.client');
    const reviewCriteriaRepository = require('../../src/modules/admin/reviewCriteria.repository');
    const ollamaClient = require('../../src/infrastructure/ai/ollama.client');
    const htmlImageParser = require('../../src/common/utils/htmlImageParser.util');
    const eventsAdminService = require('../../src/modules/admin/events.service');

    expect(
      eventsAdminService.stripHtmlForAiPrompt('<p>Green&nbsp;Future &amp; Expo&nbsp;2027 &mdash; &quot;HCMC&quot;</p>'),
    ).toBe('Green Future & Expo 2027 — "HCMC"');

    // Simulate 16 verbose active criteria pushing estimated prompt tokens past 8192
    const largeCriteria = Array.from({ length: 16 }, (_, idx) => ({
      code: `RULE_${idx + 1}`,
      title: `Tiêu chí kiểm duyệt số ${idx + 1}`,
      severity: 'CRITICAL',
      rule_content: 'Kiểm tra chặt chẽ toàn bộ nội dung, hình ảnh, tài liệu pháp lý và điều khoản sự kiện. '.repeat(12),
      is_active: true,
    }));
    jest.spyOn(reviewCriteriaRepository, 'findActive').mockResolvedValue(largeCriteria);
    jest.spyOn(ollamaClient, 'isHealthy').mockResolvedValue(true);
    jest.spyOn(ollamaClient, 'describeImageBatch').mockResolvedValue([]);
    jest.spyOn(htmlImageParser, 'fetchImageAsBase64').mockResolvedValue(null);

    const chatSpy = jest.spyOn(ollamaClient, 'chat').mockResolvedValue({
      model: 'eventhub-qwen3',
      content: JSON.stringify({
        decision: 'APPROVE',
        risk_score: 5,
        quality_score: 95,
        summary: 'Hợp lệ.',
      }),
    });

    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'evt-large-ctx',
            title: 'Green Future Expo 2027',
            short_description: 'Triển lãm công nghệ xanh.',
            description: '<p>Nội dung&nbsp;chi&nbsp;tiết '.repeat(120) + '</p>',
            format: 'ONLINE',
            visibility: 'PUBLIC',
            category_name: 'Công nghệ',
            organization_name: 'EcoVN',
            is_verified: true,
            start_time: new Date(Date.now() + 14 * 86400000).toISOString(),
            end_time: new Date(Date.now() + 14 * 86400000 + 10800000).toISOString(),
            sessions: [],
            ticket_types: [{ name: 'Free', price: 0, quantity: 100, is_seated: false }],
            permits: [],
            refund_policy: {},
          },
        ],
      })
      .mockResolvedValue({
        rows: [{ id: 'evt-large-ctx', event_id: 'evt-large-ctx', recommendation: 'APPROVE', warnings: {}, created_at: new Date() }],
      });

    await eventsAdminService.runAiReview('evt-large-ctx');

    const chatOptions = chatSpy.mock.calls[0][1];
    expect(chatOptions.format).toBe('json');
    expect(chatOptions.num_ctx).toBeGreaterThan(8192);
    expect(chatOptions.num_ctx).toBeLessThanOrEqual(16384);
  });
});

