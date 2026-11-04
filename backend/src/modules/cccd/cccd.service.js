/**
 * EventHub - CCCD Processing Service
 * Interfaces with the local Python Computer Vision & OCR pipeline.
 * Ensures strict compliance with Decree 13/2023/NĐ-CP on Personal Data Protection:
 * - Ephemeral processing: Temporary files deleted immediately in finally blocks.
 * - Sensitive data masking in audit logs.
 * - Never uploads raw CCCD images to external cloud storage.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const logger = require('../../core/logger');

const ENGINE_SCRIPT = path.join(__dirname, 'engine', 'cccd_engine.py');

function maskIdNumber(id) {
  if (!id || typeof id !== 'string') return '***';
  const clean = id.trim();
  if (clean.length < 6) return '***';
  return `${clean.slice(0, 3)}***${clean.slice(-3)}`;
}

class CCCDService {
  /**
   * Processes a CCCD image buffer through the CV & OCR engine.
   * @param {Buffer} buffer - Raw image bytes
   * @param {string} mimetype - Image MIME type
   * @param {string} userId - Requesting user ID for audit logging
   * @returns {Promise<Object>} Verification and extracted data
   */
  async scanCccdImage(buffer, mimetype, userId) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Dữ liệu ảnh không hợp lệ.');
    }

    // Determine file extension
    let ext = '.jpg';
    if (mimetype === 'image/png') ext = '.png';
    else if (mimetype === 'image/webp') ext = '.webp';

    const tempFilename = `cccd_${crypto.randomUUID()}${ext}`;
    const tempPath = path.join(os.tmpdir(), tempFilename);

    try {
      // 1. Write buffer to ephemeral file in OS temp directory
      await fs.writeFile(tempPath, buffer);

      // 2. Invoke local Python engine
      const output = await this._runEngine(tempPath);

      // 3. Mask sensitive data for application logging
      const extractedId = output?.verification?.fields?.id_number?.value || '';
      logger.info('CCCD OCR & QR Verification Completed', {
        userId,
        maskedId: maskIdNumber(extractedId),
        qrFound: output.qr_found,
        overallConfidence: output?.verification?.overall_confidence,
        isTrustworthy: output?.verification?.is_trustworthy,
      });

      return output;
    } finally {
      // 4. Guaranteed Ephemeral Cleanup (Decree 13/2023/NĐ-CP)
      try {
        await fs.unlink(tempPath);
      } catch (cleanupErr) {
        // Ignore if file was already removed
      }
    }
  }

  /**
   * Spawns Python process and gathers JSON stdout.
   */
  _runEngine(imagePath) {
    return new Promise((resolve, reject) => {
      // Use standard python executable
      const pythonProc = spawn('python', [ENGINE_SCRIPT, imagePath], {
        windowsHide: true,
      });

      let stdoutData = '';
      let stderrData = '';

      const timeout = setTimeout(() => {
        pythonProc.kill('SIGTERM');
        reject(new Error('Thời gian xử lý ảnh CCCD vượt quá giới hạn cho phép (30 giây).'));
      }, 30000);

      pythonProc.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString('utf8');
      });

      pythonProc.stderr.on('data', (chunk) => {
        stderrData += chunk.toString('utf8');
      });

      pythonProc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Không thể khởi chạy engine nhận diện CCCD: ${err.message}`));
      });

      pythonProc.on('close', (code) => {
        clearTimeout(timeout);

        if (!stdoutData.trim()) {
          return reject(
            new Error(
              `Engine xử lý CCCD kết thúc với mã lỗi ${code}. Chi tiết: ${stderrData.slice(-300)}`
            )
          );
        }

        try {
          // Parse JSON output from stdout
          // Handle potential warnings before the JSON block
          const jsonStartIndex = stdoutData.indexOf('{');
          if (jsonStartIndex === -1) {
            return reject(new Error('Định dạng phản hồi từ engine CCCD không hợp lệ.'));
          }

          const rawJson = stdoutData.slice(jsonStartIndex);
          const parsed = JSON.parse(rawJson);
          resolve(parsed);
        } catch (parseErr) {
          reject(
            new Error(`Không thể phân tích dữ liệu nhận diện: ${parseErr.message}`)
          );
        }
      });
    });
  }
}

module.exports = new CCCDService();
