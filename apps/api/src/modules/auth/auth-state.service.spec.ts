import type { PrismaService } from '@/prisma/prisma.service';

import { AUTH_STATE_ID } from './auth.constants';
import { AuthStateService } from './auth-state.service';

describe('AuthStateService', () => {
  let prisma: { authState: { findUnique: jest.Mock; upsert: jest.Mock } };
  let service: AuthStateService;

  beforeEach(() => {
    prisma = { authState: { findUnique: jest.fn(), upsert: jest.fn() } };
    service = new AuthStateService(prisma as unknown as PrismaService);
  });

  describe('getTokenVersion', () => {
    it('returns the stored version', async () => {
      prisma.authState.findUnique.mockResolvedValue({ tokenVersion: 4 });

      await expect(service.getTokenVersion()).resolves.toBe(4);
      expect(prisma.authState.findUnique).toHaveBeenCalledWith({
        where: { id: AUTH_STATE_ID },
        select: { tokenVersion: true },
      });
    });

    it('defaults to 0 when the row does not exist', async () => {
      prisma.authState.findUnique.mockResolvedValue(null);

      await expect(service.getTokenVersion()).resolves.toBe(0);
    });
  });

  describe('bumpTokenVersion', () => {
    it('increments (or seeds) the singleton row', async () => {
      prisma.authState.upsert.mockResolvedValue(undefined);

      await service.bumpTokenVersion();

      expect(prisma.authState.upsert).toHaveBeenCalledWith({
        where: { id: AUTH_STATE_ID },
        update: { tokenVersion: { increment: 1 } },
        create: { id: AUTH_STATE_ID, tokenVersion: 1 },
      });
    });
  });
});
