import { CryptoService } from '@/common/services/crypto/crypto.service';

// Mirrors TOKEN_ENCRYPTION_KEY from setup-env.ts (all-zero 32-byte key).
const TEST_ENCRYPTION_KEY = Buffer.from('0'.repeat(64), 'hex');

/**
 * A refresh token encrypted with the test key, so the app's real CryptoService can
 * decrypt it when an integration test provides a "connected" account.
 */
export const encryptedTestRefreshToken = new CryptoService({
  tokenEncryptionKey: TEST_ENCRYPTION_KEY,
}).encrypt('refresh-token');

/**
 * Builds an allowed-folder record shaped like the Prisma `select` used across the services.
 */
export const allowedFolderRecord = (
  overrides: Partial<{ id: string; folderId: string; name: string; createdAt: Date }> = {},
) => ({
  id: 'folder-record-1',
  folderId: 'drive-root-1',
  name: 'Photos',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});
