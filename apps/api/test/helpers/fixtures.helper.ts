import { CryptoService } from '@/common/services/crypto/crypto.service';

// Mirrors TOKEN_ENCRYPTION_KEY from .env.test (all-zero 32-byte key; see .env.test.example).
const TEST_ENCRYPTION_KEY = Buffer.from('0'.repeat(64), 'hex');

/** A refresh token encrypted with the test key so the real CryptoService can decrypt it. */
export const encryptedTestRefreshToken = new CryptoService({
  tokenEncryptionKey: TEST_ENCRYPTION_KEY,
}).encrypt('refresh-token');
