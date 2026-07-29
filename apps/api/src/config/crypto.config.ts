import { registerAs } from '@nestjs/config';

export const cryptoConfig = registerAs('crypto', () => {
  const key = process.env['TOKEN_ENCRYPTION_KEY']!;

  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) for AES-256-GCM.',
    );
  }

  return {
    tokenEncryptionKey: Buffer.from(key, 'hex'),
  };
});

export type CryptoConfig = ReturnType<typeof cryptoConfig>;
