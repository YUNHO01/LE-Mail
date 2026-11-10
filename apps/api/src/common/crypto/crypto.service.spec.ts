import { CryptoService } from './crypto.service';

describe('CryptoService (AES-256-GCM)', () => {
  let service: CryptoService;

  beforeAll(() => {
    service = new CryptoService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should encrypt and decrypt string accurately', () => {
    const plainText = 'Aiblab21!@SuperSecretPassword';
    const encrypted = service.encrypt(plainText);

    expect(encrypted).not.toEqual(plainText);
    expect(service.isEncrypted(encrypted)).toBe(true);
    expect(encrypted.startsWith('ENC:v1:')).toBe(true);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toEqual(plainText);
  });

  it('should handle UTF-8 / Korean characters safely', () => {
    const koreanText = '안전한 비밀번호 1234!@# 특수문자 포함';
    const encrypted = service.encrypt(koreanText);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toEqual(koreanText);
  });

  it('should return empty string when empty input is provided', () => {
    expect(service.encrypt('')).toEqual('');
    expect(service.decrypt('')).toEqual('');
  });

  it('should not re-encrypt already encrypted string', () => {
    const plainText = 'MySecret123';
    const firstEncrypted = service.encrypt(plainText);
    const secondEncrypted = service.encrypt(firstEncrypted);

    expect(secondEncrypted).toEqual(firstEncrypted);
    expect(service.decrypt(secondEncrypted)).toEqual(plainText);
  });

  it('should return raw text if decrypting unencrypted text (backward compatibility)', () => {
    const legacyPlainText = 'plain_password_123';
    expect(service.decrypt(legacyPlainText)).toEqual(legacyPlainText);
  });

  it('should throw error when auth tag or ciphertext is tampered with', () => {
    const encrypted = service.encrypt('SensitiveData');
    const tampered = encrypted.substring(0, encrypted.length - 2) + 'ff';

    expect(() => {
      service.decrypt(tampered);
    }).toThrow();
  });

  it('should mask secret strings', () => {
    expect(service.maskSecret('Aiblab21!@')).toBe('••••••••');
    expect(service.maskSecret('')).toBe('');
  });
});
