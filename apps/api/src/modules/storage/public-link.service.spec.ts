import { Logger, NotFoundException } from '@nestjs/common';

import type { AppConfig } from '@/config/app.config';

import { PublicLinkService } from './public-link.service';
import type { StorageRegistry } from './storage.registry';

const WEB_APP_URL = 'https://dropto.example';
const ITEM_ID = 'item-1';

describe('PublicLinkService', () => {
  let prisma: {
    publicLink: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let registry: { resolve: jest.Mock };
  let resolveNames: jest.Mock;
  let service: PublicLinkService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    resolveNames = jest.fn().mockResolvedValue([{ id: ITEM_ID, name: 'photo.png' }]);
    registry = { resolve: jest.fn().mockReturnValue({ resolveNames }) };
    prisma = {
      publicLink: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    service = new PublicLinkService(
      prisma as never,
      registry as unknown as StorageRegistry,
      { webAppUrl: WEB_APP_URL } as AppConfig,
    );
  });

  describe('create', () => {
    it('mints a random token and returns a URL carrying the file name', async () => {
      prisma.publicLink.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...create, createdAt: new Date('2026-01-01T00:00:00.000Z') }),
      );

      const link = await service.create('s3', ITEM_ID);

      expect(link.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(link.url).toBe(`${WEB_APP_URL}/f/${link.token}/photo.png`);
    });

    it('percent-encodes a name so it stays a single URL segment', async () => {
      resolveNames.mockResolvedValue([{ id: ITEM_ID, name: 'a b/c?.png' }]);
      prisma.publicLink.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ ...create, createdAt: new Date() }),
      );

      const link = await service.create('s3', ITEM_ID);

      expect(link.url.endsWith('/a%20b%2Fc%3F.png')).toBe(true);
    });

    it('replaces an existing link rather than piling up tokens for one file', async () => {
      prisma.publicLink.upsert.mockResolvedValue({
        token: 't',
        fileName: 'photo.png',
        createdAt: new Date(),
      });

      await service.create('s3', ITEM_ID);

      expect(prisma.publicLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { backend_itemId: { backend: 's3', itemId: ITEM_ID } } }),
      );
    });

    it('refuses an item the provider reports as unreachable', async () => {
      resolveNames.mockResolvedValue([{ id: ITEM_ID, name: '' }]);

      await expect(service.create('drive', ITEM_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.publicLink.upsert).not.toHaveBeenCalled();
    });

    it('propagates the registry 404 for a disabled backend', async () => {
      registry.resolve.mockImplementation(() => {
        throw new NotFoundException('Storage backend is not enabled: s3');
      });

      await expect(service.create('s3', ITEM_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolve', () => {
    it('returns the item a live token points at', async () => {
      prisma.publicLink.findUnique.mockResolvedValue({
        backend: 's3',
        itemId: ITEM_ID,
        fileName: 'photo.png',
      });

      await expect(service.resolve('tok')).resolves.toEqual({
        backend: 's3',
        itemId: ITEM_ID,
        fileName: 'photo.png',
      });
    });

    it('404s an unknown token', async () => {
      await expect(service.resolve('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('urlsForItems', () => {
    it('maps every item that has a link', async () => {
      prisma.publicLink.findMany.mockResolvedValue([
        { itemId: 'a', token: 'ta', fileName: 'a.png' },
        { itemId: 'b', token: 'tb', fileName: 'b.png' },
      ]);

      const urls = await service.urlsForItems('s3', ['a', 'b']);

      expect(urls.get('a')).toBe(`${WEB_APP_URL}/f/ta/a.png`);
      expect(urls.get('b')).toBe(`${WEB_APP_URL}/f/tb/b.png`);
    });

    it('does not query at all for an empty page', async () => {
      await expect(service.urlsForItems('s3', [])).resolves.toEqual(new Map());
      expect(prisma.publicLink.findMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the row for that item', async () => {
      await service.remove('s3', ITEM_ID);

      expect(prisma.publicLink.deleteMany).toHaveBeenCalledWith({
        where: { backend: 's3', itemId: ITEM_ID },
      });
    });

    it('still resolves the backend, so a disabled one cannot be managed', async () => {
      registry.resolve.mockImplementation(() => {
        throw new NotFoundException('Storage backend is not enabled: s3');
      });

      await expect(service.remove('s3', ITEM_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.publicLink.deleteMany).not.toHaveBeenCalled();
    });
  });
});
