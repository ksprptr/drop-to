import { cryptoConfig } from './crypto.config';

const ZERO_KEY = '0'.repeat(64);

describe('cryptoConfig', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env['TOKEN_ENCRYPTION_KEY'];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['TOKEN_ENCRYPTION_KEY'];
    else process.env['TOKEN_ENCRYPTION_KEY'] = saved;
  });

  it('decodes 64 hex characters into the 32-byte AES-256 key', () => {
    process.env['TOKEN_ENCRYPTION_KEY'] = ZERO_KEY;

    const cfg = cryptoConfig();

    expect(cfg.tokenEncryptionKey).toBeInstanceOf(Buffer);
    expect(cfg.tokenEncryptionKey).toHaveLength(32);
  });

  it('accepts uppercase hex', () => {
    process.env['TOKEN_ENCRYPTION_KEY'] = 'A'.repeat(64);

    expect(cryptoConfig().tokenEncryptionKey).toHaveLength(32);
  });

  // The guard is what stops a short or malformed key from silently becoming a weak one: Buffer.from
  // with 'hex' truncates at the first invalid pair instead of throwing, so without this check a
  // 4-character key would boot fine and encrypt every refresh token with 2 bytes of entropy.
  it.each([
    ['too short', 'abcd'],
    ['too long', '0'.repeat(65)],
    ['non-hex characters', 'z'.repeat(64)],
    ['empty', ''],
  ])('rejects a key that is %s', (_label, value) => {
    process.env['TOKEN_ENCRYPTION_KEY'] = value;

    expect(() => cryptoConfig()).toThrow(/64 hex characters/i);
  });

  it('rejects a missing key rather than booting without encryption', () => {
    delete process.env['TOKEN_ENCRYPTION_KEY'];

    expect(() => cryptoConfig()).toThrow(/64 hex characters/i);
  });
});
