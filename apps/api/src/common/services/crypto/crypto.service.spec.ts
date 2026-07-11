import { randomBytes } from 'node:crypto';

import { type CryptoConfig } from '@/config/crypto.config';

import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;
  const config: CryptoConfig = { tokenEncryptionKey: randomBytes(32) };

  beforeEach(() => {
    service = new CryptoService(config);
  });

  describe('encrypt', () => {
    it('produces an iv:authTag:ciphertext hex envelope', () => {
      const envelope = service.encrypt('a-refresh-token');
      const parts = envelope.split(':');

      expect(parts).toHaveLength(3);
      // 12-byte IV and 16-byte auth tag, hex-encoded.
      expect(parts[0]).toMatch(/^[0-9a-f]{24}$/);
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it('uses a fresh IV so the same plaintext encrypts differently each time', () => {
      expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
    });
  });

  describe('decrypt', () => {
    it('round-trips a value back to the original plaintext', () => {
      const plaintext = 'super-secret-refresh-token-1234567890';

      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });

    it('round-trips unicode content', () => {
      const plaintext = 'čřž — 日本語 — 🚀';

      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });

    it('throws on a malformed envelope (wrong number of segments)', () => {
      expect(() => service.decrypt('not-a-valid-envelope')).toThrow(
        'Invalid encrypted payload format.',
      );
    });

    it('throws when the IV length is wrong', () => {
      const [, authTag, data] = service.encrypt('x').split(':');

      expect(() => service.decrypt(`00:${authTag}:${data}`)).toThrow(
        'Invalid encrypted payload format.',
      );
    });

    it('rejects a tampered ciphertext (GCM auth tag mismatch)', () => {
      const [iv, authTag, data] = service.encrypt('tamper-me').split(':');
      // Flip the first byte of the ciphertext.
      const flipped = (data[0] === 'a' ? 'b' : 'a') + data.slice(1);

      expect(() => service.decrypt(`${iv}:${authTag}:${flipped}`)).toThrow();
    });

    it('cannot decrypt an envelope produced with a different key', () => {
      const other = new CryptoService({ tokenEncryptionKey: randomBytes(32) });

      expect(() => service.decrypt(other.encrypt('cross-key'))).toThrow();
    });
  });
});
