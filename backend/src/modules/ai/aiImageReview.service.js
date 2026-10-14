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

    const imageSources = collectAllEventImages(eventData);

    // Trường hợp 1: Sự kiện không có bất kỳ hình ảnh nào
    if (imageSources.length === 0) {
      logger.info(`[AiImageReview] Sự kiện ${eventId} không có hình ảnh. Tự động APPROVED.`);
      const cleanResult = {
        decision: 'APPROVED',
        flagged: false,
        confidence_score: 1.0,
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

      const userPrompt = buildImageModerationUserPrompt(eventData.title, processedSources);
      const messages = [
        { role: 'system', content: IMAGE_MODERATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      const aiResponse = await ollamaClient.chat(messages, {
        temperature: 0.1,
        max_tokens: 1500,
        images: validImages,
      });

      const parsedJson = ollamaClient.extractJSON(aiResponse.content);

      if (parsedJson && parsedJson.decision) {
        const decision = ['APPROVED', 'FLAGGED', 'NEEDS_REVIEW'].includes(parsedJson.decision)
          ? parsedJson.decision
          : 'NEEDS_REVIEW';

        const resultData = {
          decision,
          flagged: parsedJson.flagged === true || decision === 'FLAGGED',
          confidence_score: Number(parsedJson.confidence_score ?? 0.9),
          ai_flagged_reasons: Array.isArray(parsedJson.ai_flagged_reasons)
            ? parsedJson.ai_flagged_reasons
            : [],
          ai_extracted_text: String(parsedJson.ai_extracted_text || '').trim(),
          safety_breakdown: parsedJson.safety_breakdown || {},
          image_details: Array.isArray(parsedJson.image_details) ? parsedJson.image_details : [],
          model: aiResponse.model || 'ollama-vision',
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
   * Lưu kết quả kiểm duyệt vào bảng events trong Database
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
          ai_recommendation       = $2,
          ai_flagged_reasons      = $3::jsonb,
          ai_extracted_text       = $4,
          ai_image_review_results = $5::jsonb,
          ai_reviewed_at          = NOW(),
          updated_at              = NOW()
      WHERE id = $6
      `,
      [
        reviewStatus,
        data.decision || 'PENDING',
        JSON.stringify(data.ai_flagged_reasons || []),
        data.ai_extracted_text || '',
        JSON.stringify(data.ai_image_review_results || data),
        eventId,
      ],
    );
  }
}

module.exports = new AiImageReviewService();
