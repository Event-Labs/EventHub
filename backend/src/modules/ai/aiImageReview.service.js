/**
 * EventHub — AI Image Moderation Service
 * =======================================
 * Điều phối quét và kiểm duyệt hình ảnh sự kiện:
 * 1. Bóc tách ảnh từ Poster, Banner, và nội dung HTML.
 * 2. Gọi Ollama Vision / OCR nhận diện vi phạm và trích xuất chữ.
 * 3. Chạy bất đồng bộ ngầm (Non-blocking background job).
 * 4. Tự động cập nhật kết quả vào database.
 */

const ollamaClient = require('../../infrastructure/ai/ollama.client');
const logger = require('../../core/logger');
const db = require('../../infrastructure/database/db.client');
const { collectAllEventImages, fetchImageAsBase64 } = require('../../common/utils/htmlImageParser.util');
const {
  IMAGE_MODERATION_SYSTEM_PROMPT,
  buildImageModerationUserPrompt,
} = require('./prompts/imageModeration.prompt');

class AiImageReviewService {
  /**
   * Giải quyết tên danh mục sự kiện từ eventData hoặc fallback truy vấn bảng event_categories khi chỉ có category_id.
   */
  async _resolveEventCategory(eventData = {}) {
    const direct =
      eventData.category_name ||
      eventData.categoryName ||
      eventData.category?.name ||
      (typeof eventData.category === 'string' ? eventData.category : '');

    if (direct && String(direct).trim()) {
      return String(direct).trim();
    }

    if (eventData.category_id) {
      try {
        const res = await db.query(
          'SELECT name FROM event_categories WHERE id = $1 LIMIT 1',
          [eventData.category_id],
        );
        if (res?.rows?.[0]?.name) {
          return String(res.rows[0].name).trim();
        }
      } catch (err) {
        logger.debug(`[AiImageReview] Could not lookup category_id ${eventData.category_id}: ${err.message}`);
      }
    }

    return '';
  }

  /**
   * Kích hoạt kiểm duyệt hình ảnh ngầm (Async Background Execution).
   * Không block response HTTP của Organizer.
   *
   * @param {string} eventId
   * @param {object} eventData
   */
  triggerAsyncImageReview(eventId, eventData) {
    if (!eventId || !eventData) return;

    setImmediate(async () => {
      try {
        await this.reviewEventImages(eventId, eventData);
      } catch (err) {
        logger.error(`[AiImageReview] Background job error for event ${eventId}: ${err.message}`);
      }
    });
  }

  /**
   * Thực hiện kiểm duyệt toàn bộ hình ảnh sự kiện bằng AI Ollama
   *
   * @param {string} eventId
   * @param {object} eventData
   * @returns {Promise<object>}
   */
  async reviewEventImages(eventId, eventData) {
    logger.info(`[AiImageReview] Bắt đầu quét ảnh sự kiện: ${eventId} ("${eventData.title || ''}")`);

    const categoryName = await this._resolveEventCategory(eventData);
    const imageSources = collectAllEventImages(eventData);

    // Trường hợp 1: Sự kiện không có bất kỳ hình ảnh nào
    if (imageSources.length === 0) {
      logger.info(`[AiImageReview] Sự kiện ${eventId} không có hình ảnh. Tự động APPROVED.`);
      const cleanResult = {
        decision: 'APPROVED',
        flagged: false,
        confidence_score: 1.0,
        visual_description: '',
        extracted_text: '',
        is_event_poster_or_relevant_banner: null,
        safety_flags: [],
        ai_flagged_reasons: [],
        ai_extracted_text: '',
        safety_breakdown: {},
        image_details: [],
        note: 'Sự kiện không chứa hình ảnh cần kiểm duyệt',
      };
      await this.saveReviewResult(eventId, cleanResult);
      return cleanResult;
    }

    // Trường hợp 2: Tải và chuyển hóa các ảnh sang Base64
    const validImages = [];
    const processedSources = [];

    for (const sourceItem of imageSources) {
      const b64 = await fetchImageAsBase64(sourceItem.url);
      if (b64) {
        validImages.push(b64);
        processedSources.push(sourceItem);
      } else {
        logger.warn(`[AiImageReview] Bỏ qua ảnh không tải được: [${sourceItem.source}] ${sourceItem.url}`);
      }
    }

    if (validImages.length === 0) {
      logger.warn(`[AiImageReview] Không thể nạp được ảnh nào cho sự kiện ${eventId}. Đánh dấu NEEDS_REVIEW.`);
      const fallbackResult = {
        decision: 'NEEDS_REVIEW',
        flagged: false,
        confidence_score: 0.5,
        visual_description: '',
        extracted_text: '',
        is_event_poster_or_relevant_banner: null,
        safety_flags: [],
        ai_flagged_reasons: ['Hình ảnh sự kiện không truy cập được để kiểm duyệt tự động.'],
        ai_extracted_text: '',
        safety_breakdown: {},
        image_details: [],
        note: 'Ảnh không truy cập được qua URL',
      };
      await this.saveReviewResult(eventId, fallbackResult);
      return fallbackResult;
    }

    // Trường hợp 3: Gọi Ollama Vision / Multimodal Chat
    try {
      const isOllamaUp = await ollamaClient.isHealthy();
      if (!isOllamaUp) {
        throw new Error('Dịch vụ Ollama hiện không phản hồi (offline)');
      }

      const userPrompt = buildImageModerationUserPrompt(eventData.title, processedSources, categoryName);
      const messages = [
        { role: 'system', content: IMAGE_MODERATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      const visionModel = process.env.OLLAMA_VISION_MODEL || ollamaClient.OLLAMA_VISION_MODEL || 'qwen2.5vl:3b';
      const visionFallbackModel = process.env.OLLAMA_VISION_FALLBACK_MODEL || ollamaClient.OLLAMA_VISION_FALLBACK_MODEL || 'moondream';
      const aiResponse = await ollamaClient.chat(messages, {
        model: visionModel,
        fallbackModel: visionFallbackModel,
        temperature: 0.1,
        max_tokens: 1500,
        images: validImages,
        timeoutMs: ollamaClient.OLLAMA_VISION_TIMEOUT,
      });

      const parsedJson = ollamaClient.extractJSON(aiResponse.content);

      if (parsedJson && parsedJson.decision) {
        let decision = ['APPROVED', 'FLAGGED', 'NEEDS_REVIEW'].includes(parsedJson.decision)
          ? parsedJson.decision
          : 'NEEDS_REVIEW';

        const imageDetails = (Array.isArray(parsedJson.image_details) ? parsedJson.image_details : []).map((detail, idx) => {
          const detailFlags = Array.isArray(detail?.safety_flags)
            ? detail.safety_flags.map((f) => String(f || '').trim().toLowerCase()).filter(Boolean)
            : [];
          const normalizedRel = typeof detail?.is_event_poster_or_relevant_banner === 'boolean'
            ? detail.is_event_poster_or_relevant_banner
            : null;
          return {
            ...detail,
            source_index: detail?.source_index ?? idx + 1,
            source_name: detail?.source_name || processedSources[idx]?.source || `IMAGE_${idx + 1}`,
            visual_description: String(detail?.visual_description || '').trim(),
            extracted_text: String(detail?.extracted_text || detail?.ocr_text || '').trim(),
            is_event_poster_or_relevant_banner: normalizedRel,
            safety_flags: detailFlags,
          };
        });

        const topLevelFlags = Array.isArray(parsedJson.safety_flags)
          ? parsedJson.safety_flags.map((f) => String(f || '').trim().toLowerCase()).filter(Boolean)
          : [];
        const combinedSafetyFlags = Array.from(new Set([
          ...topLevelFlags,
          ...imageDetails.flatMap((d) => d.safety_flags || []),
        ]));

        const hasExplicitIrrelevantDetail = imageDetails.some((d) => d.is_event_poster_or_relevant_banner === false);
        const topLevelRelevant = typeof parsedJson.is_event_poster_or_relevant_banner === 'boolean'
          ? parsedJson.is_event_poster_or_relevant_banner
          : null;
        const isRelevantPoster = (topLevelRelevant === false || hasExplicitIrrelevantDetail)
          ? false
          : topLevelRelevant;

        const reasons = Array.isArray(parsedJson.ai_flagged_reasons)
          ? [...parsedJson.ai_flagged_reasons]
          : [];

        if (combinedSafetyFlags.length > 0) {
          decision = 'FLAGGED';
          const flagReason = `Phát hiện dấu hiệu mất an toàn trên hình ảnh (${combinedSafetyFlags.join(', ')}).`;
          if (!reasons.some((r) => /an toàn|nsfw|bạo lực|cờ bạc|qr|lừa đảo/i.test(String(r)))) {
            reasons.push(flagReason);
          }
        } else if (isRelevantPoster === false) {
          if (decision === 'APPROVED') {
            decision = 'FLAGGED';
          }
          const relReason = `Hình ảnh không phải poster/banner sự kiện hoặc không phù hợp với chủ đề "${eventData.title || ''}"${categoryName ? ` (${categoryName})` : ''}.`;
          if (!reasons.some((r) => /poster|liên quan|phù hợp|chủ đề|lạc đề|selfie|meme/i.test(String(r)))) {
            reasons.push(relReason);
          }
        }

        const extractedText = String(
          parsedJson.extracted_text ||
          parsedJson.ai_extracted_text ||
          imageDetails.map((d) => d.extracted_text).filter(Boolean).join(' ')
        ).trim();

        const visualDescription = String(
          parsedJson.visual_description ||
          imageDetails.map((d) => d.visual_description).filter(Boolean).join(' | ')
        ).trim();

        const resultData = {
          decision,
          flagged: parsedJson.flagged === true || decision === 'FLAGGED',
          confidence_score: Number(parsedJson.confidence_score ?? 0.9),
          visual_description: visualDescription,
          extracted_text: extractedText,
          is_event_poster_or_relevant_banner: isRelevantPoster,
          safety_flags: combinedSafetyFlags,
          ai_flagged_reasons: reasons,
          ai_extracted_text: String(parsedJson.ai_extracted_text || extractedText).trim(),
          safety_breakdown: parsedJson.safety_breakdown || {},
          image_details: imageDetails,
          model: aiResponse.model || visionModel,
        };

        await this.saveReviewResult(eventId, resultData);
        logger.info(
          `[AiImageReview] Hoàn thành kiểm duyệt cho sự kiện ${eventId}: Decision = ${resultData.decision}, Flagged = ${resultData.flagged}`,
        );
        return resultData;
      } else {
        throw new Error('AI không trả về JSON hợp lệ: ' + (aiResponse.content || '').slice(0, 150));
      }
    } catch (aiErr) {
      logger.warn(
        `[AiImageReview] Ollama gặp sự cố (${aiErr.message}), chuyển sang trạng thái NEEDS_REVIEW cho Admin kiểm tra thủ công.`,
      );

      const fallbackResult = {
        decision: 'NEEDS_REVIEW',
        flagged: false,
        confidence_score: 0.0,
        visual_description: '',
        extracted_text: '',
        is_event_poster_or_relevant_banner: null,
        safety_flags: [],
        ai_flagged_reasons: [`Kiểm duyệt AI tự động tạm gián đoạn (${aiErr.message}). Chờ Admin xem xét.`],
        ai_extracted_text: '',
        safety_breakdown: {},
        image_details: [],
        error: aiErr.message,
      };

      await this.saveReviewResult(eventId, fallbackResult);
      return fallbackResult;
    }
  }

  /**
   * Lưu kết quả Image Pre-scan vào các cột chuyên biệt trên bảng events.
   * Không ghi đè ai_recommendation / ai_reviewed_at của luồng Full Review.
   *
   * @param {string} eventId
   * @param {object} data
   */
  async saveReviewResult(eventId, data) {
    const reviewStatus = data.decision === 'APPROVED' ? 'APPROVED' : data.decision === 'FLAGGED' ? 'FLAGGED' : 'PENDING';

    await db.query(
      `
      UPDATE events
      SET review_status           = $1,
          ai_flagged_reasons      = $2::jsonb,
          ai_extracted_text       = $3,
          ai_image_review_results = $4::jsonb,
          updated_at              = NOW()
      WHERE id = $5
      `,
      [
        reviewStatus,
        JSON.stringify(data.ai_flagged_reasons || []),
        data.ai_extracted_text || '',
        JSON.stringify(data.ai_image_review_results || data),
        eventId,
      ],
    );
  }
}

module.exports = new AiImageReviewService();
