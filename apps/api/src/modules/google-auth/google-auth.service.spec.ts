import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { google } from 'googleapis';

import { CryptoService } from '@/common/services/crypto/crypto.service';
import { type GoogleConfig } from '@/config/google.config';
import { PrismaService } from '@/prisma/prisma.service';

import { GoogleAuthService } from './google-auth.service';

jest.mock('googleapis', () => ({
  google: { auth: { OAuth2: jest.fn() } },
}));

/**
 * Encodes a minimal id_token JWT carrying the given payload.
 **/
const idToken = (payload: Record<string, unknown>): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${body}.signature`;
};

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let oauthClient: {
    generateAuthUrl: jest.Mock;
    getToken: jest.Mock;
    setCredentials: jest.Mock;
    getAccessToken: jest.Mock;
    revokeCredentials: jest.Mock;
  };
  let prisma: {
    driveAccount: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    allowedFolder: { upsert: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };

  const googleCfg = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost/callback',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive'],
  } as unknown as GoogleConfig;

  beforeEach(() => {
    oauthClient = {
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      setCredentials: jest.fn(),
      getAccessToken: jest.fn(),
      revokeCredentials: jest.fn(),
    };
    (google.auth.OAuth2 as unknown as jest.Mock).mockImplementation(() => oauthClient);

    prisma = {
      driveAccount: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      allowedFolder: { upsert: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    crypto = { encrypt: jest.fn(), decrypt: jest.fn() };

    service = new GoogleAuthService(
      googleCfg,
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  describe('getAuthUrl', () => {
    it('requests an offline consent URL with the configured scopes and the CSRF state nonce', () => {
      oauthClient.generateAuthUrl.mockReturnValue('https://accounts.google.com/consent');

      expect(service.getAuthUrl('nonce-123')).toBe('https://accounts.google.com/consent');
      expect(oauthClient.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          prompt: 'consent',
          scope: googleCfg.scopes,
          state: 'nonce-123',
        }),
      );
    });
  });

  describe('handleCallback', () => {
    it('encrypts the refresh token and upserts the account, returning the email', async () => {
      oauthClient.getToken.mockResolvedValue({
        tokens: { refresh_token: 'refresh-123', id_token: idToken({ email: 'owner@gmail.com' }) },
      });
      crypto.encrypt.mockReturnValue('encrypted-token');
      prisma.driveAccount.upsert.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });

      await expect(service.handleCallback('auth-code')).resolves.toBe('owner@gmail.com');

      expect(crypto.encrypt).toHaveBeenCalledWith('refresh-123');
      expect(prisma.driveAccount.upsert).toHaveBeenCalledWith({
        where: { email: 'owner@gmail.com' },
        create: { email: 'owner@gmail.com', refreshTokenEnc: 'encrypted-token' },
        update: { refreshTokenEnc: 'encrypted-token' },
      });
    });

    it('falls back to a placeholder email when the id_token is unusable', async () => {
      oauthClient.getToken.mockResolvedValue({
        tokens: { refresh_token: 'refresh-123', id_token: 'not-a-jwt' },
      });
      crypto.encrypt.mockReturnValue('enc');
      prisma.driveAccount.upsert.mockResolvedValue({ id: 'acc-1', email: 'unknown@google' });

      await service.handleCallback('auth-code');

      expect(prisma.driveAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'unknown@google' } }),
      );
    });

    it('throws Unauthorized when Google returns no refresh token', async () => {
      oauthClient.getToken.mockResolvedValue({
        tokens: { refresh_token: null, id_token: idToken({ email: 'x@y.com' }) },
      });

      await expect(service.handleCallback('auth-code')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.driveAccount.upsert).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when the code exchange fails', async () => {
      oauthClient.getToken.mockRejectedValue(new Error('invalid_grant'));

      await expect(service.handleCallback('bad-code')).rejects.toThrow(
        'Failed to exchange authorization code.',
      );
    });
  });

  describe('getActiveAccountId', () => {
    it('returns the most recently connected account id', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });

      await expect(service.getActiveAccountId()).resolves.toBe('acc-1');
      expect(prisma.driveAccount.findFirst).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('throws NotFound when no account is connected', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      await expect(service.getActiveAccountId()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAuthorizedClient', () => {
    it('attaches the decrypted refresh token to the client', async () => {
      prisma.driveAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        refreshTokenEnc: 'encrypted',
      });
      crypto.decrypt.mockReturnValue('refresh-plain');

      await service.getAuthorizedClient('acc-1');

      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted');
      expect(oauthClient.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-plain' });
    });

    it('throws NotFound when the account does not exist', async () => {
      prisma.driveAccount.findUnique.mockResolvedValue(null);

      await expect(service.getAuthorizedClient('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getPickerAccessToken', () => {
    it('returns a fresh access token for the active account', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.driveAccount.findUnique.mockResolvedValue({ id: 'acc-1', refreshTokenEnc: 'enc' });
      crypto.decrypt.mockReturnValue('refresh');
      oauthClient.getAccessToken.mockResolvedValue({ token: 'access-token-abc' });

      await expect(service.getPickerAccessToken()).resolves.toBe('access-token-abc');
    });

    it('throws Unauthorized when no access token can be minted', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.driveAccount.findUnique.mockResolvedValue({ id: 'acc-1', refreshTokenEnc: 'enc' });
      crypto.decrypt.mockReturnValue('refresh');
      oauthClient.getAccessToken.mockResolvedValue({ token: null });

      await expect(service.getPickerAccessToken()).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('saveAllowedFolders', () => {
    it('upserts each selected folder in a transaction and returns the updated list', async () => {
      // Prisma hands back a Date; the entity exposes the ISO string the wire contract declares.
      const saved = [
        { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date('2026-01-01') },
      ];
      const expected = saved.map((folder) => ({
        ...folder,
        createdAt: folder.createdAt.toISOString(),
      }));
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.$transaction.mockResolvedValue([]);
      prisma.allowedFolder.findMany.mockResolvedValue(saved);

      const dto = { folders: [{ folderId: 'drive-1', name: 'Photos' }] };

      await expect(service.saveAllowedFolders(dto)).resolves.toEqual(expected);
      expect(prisma.allowedFolder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driveAccountId_folderId: { driveAccountId: 'acc-1', folderId: 'drive-1' } },
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('reports a disconnected status when no account exists', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      await expect(service.getStatus()).resolves.toEqual({
        connected: false,
        email: null,
        allowedFolders: [],
      });
    });

    it('reports a connected status with the account email and folders', async () => {
      const allowedFolders = [
        { id: 'f1', folderId: 'drive-1', name: 'Photos', createdAt: new Date('2026-01-01') },
      ];
      const expectedFolders = allowedFolders.map((folder) => ({
        ...folder,
        createdAt: folder.createdAt.toISOString(),
      }));
      prisma.driveAccount.findFirst.mockResolvedValue({
        email: 'owner@gmail.com',
        allowedFolders,
      });

      await expect(service.getStatus()).resolves.toEqual({
        connected: true,
        email: 'owner@gmail.com',
        allowedFolders: expectedFolders,
      });
    });
  });

  describe('disconnect', () => {
    it('is a no-op when nothing is connected', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue(null);

      await service.disconnect();

      expect(prisma.driveAccount.delete).not.toHaveBeenCalled();
    });

    it('revokes the Google credentials and deletes the account', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });
      prisma.driveAccount.findUnique.mockResolvedValue({ id: 'acc-1', refreshTokenEnc: 'enc' });
      crypto.decrypt.mockReturnValue('refresh');
      oauthClient.revokeCredentials.mockResolvedValue({});

      await service.disconnect();

      expect(oauthClient.revokeCredentials).toHaveBeenCalled();
      expect(prisma.driveAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    });

    it('still deletes the account when revoking at Google fails', async () => {
      prisma.driveAccount.findFirst.mockResolvedValue({ id: 'acc-1', email: 'owner@gmail.com' });
      prisma.driveAccount.findUnique.mockResolvedValue({ id: 'acc-1', refreshTokenEnc: 'enc' });
      crypto.decrypt.mockReturnValue('refresh');
      oauthClient.revokeCredentials.mockRejectedValue(new Error('network down'));

      await service.disconnect();

      expect(prisma.driveAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    });
  });
});
