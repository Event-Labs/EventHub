/**
 * Unit Tests for CCCD Service & Ephemeral Storage Integrity
 */

const cccdService = require('./cccd.service');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('CCCD Service Unit Tests', () => {
  it('should reject invalid or non-buffer inputs', async () => {
    await expect(cccdService.scanCccdImage(null, 'image/jpeg', 'user-1')).rejects.toThrow(
      'Dữ liệu ảnh không hợp lệ.'
    );
    await expect(cccdService.scanCccdImage('not-a-buffer', 'image/jpeg', 'user-1')).rejects.toThrow(
      'Dữ liệu ảnh không hợp lệ.'
    );
  });

  it('should clean up temporary files in OS tempdir even if engine fails', async () => {
    const tempFilesBefore = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('cccd_'));
    
    // Provide a corrupted 10-byte buffer that fails CV decode
    const corruptedBuffer = Buffer.from('CORRUPTED_BYTES');
    try {
      await cccdService.scanCccdImage(corruptedBuffer, 'image/jpeg', 'test-user');
    } catch (err) {
      // Expected to fail in CV preprocessor or return rejection
    }

    const tempFilesAfter = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('cccd_'));
    // Ensure no orphan temporary files were leaked
    expect(tempFilesAfter.length).toBe(tempFilesBefore.length);
  });
});

