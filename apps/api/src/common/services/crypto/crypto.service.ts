import { Inject, Injectable } from '@nestjs/common';
import {
  type CipherGCMTypes,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

import { type CryptoConfig, cryptoConfig } from '@/config/crypto.config';

const ALGORITHM: CipherGCMTypes = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * AES-256-GCM encryption for the Drive refresh token; envelope `iv:authTag:data` (hex).
 **/
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(cryptoConfig.KEY) config: CryptoConfig) {
    this.key = config.tokenEncryptionKey;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  decrypt(payload: string): string {
    const [ivHex, authTagHex, dataHex] = payload.split(':');

    if (!ivHex || !authTagHex || !dataHex) {
      throw new Error('Invalid encrypted payload format.');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted payload format.');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
