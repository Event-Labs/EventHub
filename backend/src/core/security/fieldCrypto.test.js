const crypto = require('crypto');
const fieldCrypto = require('./fieldCrypto');

describe('fieldCrypto - AES-256-GCM Per-Tenant Encryption', () => {
  const orgId = 'org-12345';
  const field = 'payos_api_key';
  const secret = 'secret-api-key-test-value-123';

  it('mã hóa rồi giải mã ra đúng giá trị', () => {
    const enc = fieldCrypto.encrypt(secret, orgId, field);
    expect(enc).toBeDefined();
    expect(typeof enc).toBe('string');
    expect(enc.startsWith('enc.1.')).toBe(true);

    const dec = fieldCrypto.decrypt(enc, orgId, field);
    expect(dec).toBe(secret);
  });

  it('hai lần mã hóa cùng giá trị cho ciphertext khác nhau (random IV)', () => {
    const enc1 = fieldCrypto.encrypt(secret, orgId, field);
    const enc2 = fieldCrypto.encrypt(secret, orgId, field);
    expect(enc1).not.toBe(enc2);
    expect(fieldCrypto.decrypt(enc1, orgId, field)).toBe(secret);
    expect(fieldCrypto.decrypt(enc2, orgId, field)).toBe(secret);
  });

  it('giải mã với orgId khác hoặc field khác phải thất bại', () => {
    const enc = fieldCrypto.encrypt(secret, orgId, field);

    // orgId khác
    expect(() => fieldCrypto.decrypt(enc, 'org-different', field)).toThrow('Cannot decrypt credential');

    // field khác
    expect(() => fieldCrypto.decrypt(enc, orgId, 'payos_checksum_key')).toThrow('Cannot decrypt credential');
  });

  it('sửa 1 ký tự ciphertext hoặc auth tag phải thất bại (tamper resistance)', () => {
    const enc = fieldCrypto.encrypt(secret, orgId, field);
    const parts = enc.split('.');
    expect(parts.length).toBe(5);

    // Tamper with ciphertext
    const tamperedCt = parts[4].slice(0, -1) + (parts[4].slice(-1) === 'A' ? 'B' : 'A');
    const tamperedEnc = [parts[0], parts[1], parts[2], parts[3], tamperedCt].join('.');
    expect(() => fieldCrypto.decrypt(tamperedEnc, orgId, field)).toThrow('Cannot decrypt credential');

    // Tamper with auth tag
    const tagBuf = Buffer.from(parts[3], 'base64');
    tagBuf[0] ^= 1;
    const tamperedEncTag = [parts[0], parts[1], parts[2], tagBuf.toString('base64'), parts[4]].join('.');
    expect(() => fieldCrypto.decrypt(tamperedEncTag, orgId, field)).toThrow('Cannot decrypt credential');
  });

  it('isEncrypted nhận diện chính xác định dạng enc.version.iv.tag.ct', () => {
    expect(fieldCrypto.isEncrypted(null)).toBeFalsy();
    expect(fieldCrypto.isEncrypted('')).toBeFalsy();
    expect(fieldCrypto.isEncrypted('plain-secret-key')).toBeFalsy();
    expect(fieldCrypto.isEncrypted('enc.1.invalid')).toBeFalsy();

    const enc = fieldCrypto.encrypt(secret, orgId, field);
    expect(fieldCrypto.isEncrypted(enc)).toBe(true);
  });

  it('decrypt giá trị cũ khi allowLegacy=false phải ném lỗi, khi true trả nguyên giá trị', () => {
    const legacyPlain = 'legacy-plain-key-12345';

    expect(() => fieldCrypto.decrypt(legacyPlain, orgId, field, { allowLegacy: false }))
      .toThrow('Credential is not encrypted');

    const result = fieldCrypto.decrypt(legacyPlain, orgId, field, { allowLegacy: true });
    expect(result).toBe(legacyPlain);
  });

  it('maskTail che đúng số ký tự', () => {
    expect(fieldCrypto.maskTail('1234567890', 4)).toBe('****7890');
    expect(fieldCrypto.maskTail('123', 4)).toBe('****');
    expect(fieldCrypto.maskTail('', 4)).toBe('****');
    expect(fieldCrypto.maskTail(null, 4)).toBe('****');
  });

  it('ném lỗi Missing CRED_MASTER_KEY_V1 khi khởi động thiếu key ở môi trường không phải test', () => {
    const savedKey = process.env.CRED_MASTER_KEY_V1;
    const prevEnv = process.env.NODE_ENV;
    delete process.env.CRED_MASTER_KEY_V1;
    process.env.NODE_ENV = 'production';

    try {
      expect(() => {
        jest.isolateModules(() => {
          require('./fieldCrypto');
        });
      }).toThrow('Missing CRED_MASTER_KEY_V1');
    } finally {
      if (savedKey) process.env.CRED_MASTER_KEY_V1 = savedKey;
      process.env.NODE_ENV = prevEnv;
    }
  });
});

