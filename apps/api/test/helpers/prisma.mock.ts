/**
 * A mock PrismaService for integration tests. The app is stateless from the tests'
 * perspective, so the database layer is fully faked; behavior is scripted per test via
 * the jest.fn returns. Infrastructure methods default to a "healthy" resolution.
 */
export interface PrismaMock {
  $runCommandRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
  authState: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  driveAccount: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  allowedFolder: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  uploadLog: { create: jest.Mock };
}

/**
 * Creates a fresh Prisma mock with healthy infrastructure defaults.
 */
export const createPrismaMock = (): PrismaMock => ({
  // Terminus probes the Mongo command first; rejecting with this exact hint makes it
  // fall through to the SQL `$queryRawUnsafe` path, which then reports the DB as up.
  $runCommandRaw: jest.fn().mockRejectedValue(new Error('Use the mongodb provider')),
  $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]),
  $transaction: jest.fn().mockResolvedValue([]),
  // Default: no row → token version 0 (matches the ver:0 baked into test tokens).
  authState: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  driveAccount: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  allowedFolder: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  // Default: issuing a session creates a row with a stable id; lookups find a live (non-revoked,
  // unexpired) row so refresh/logout succeed unless a test scripts otherwise.
  refreshToken: {
    create: jest.fn().mockResolvedValue({ id: 'refresh-row-1' }),
    findUnique: jest.fn().mockResolvedValue({
      id: 'refresh-row-1',
      subject: 'test-admin',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
    update: jest.fn().mockResolvedValue(undefined),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  uploadLog: { create: jest.fn().mockResolvedValue(undefined) },
});

/**
 * Resets all mocks on the given Prisma mock and restores the infrastructure defaults.
 */
export const resetPrismaMock = (mock: PrismaMock): void => {
  mock.$runCommandRaw.mockReset().mockRejectedValue(new Error('Use the mongodb provider'));
  mock.$queryRawUnsafe.mockReset().mockResolvedValue([{ ok: 1 }]);
  mock.$transaction.mockReset().mockResolvedValue([]);
  mock.authState.findUnique.mockReset().mockResolvedValue(null);
  mock.authState.upsert.mockReset().mockResolvedValue(undefined);
  mock.driveAccount.findFirst.mockReset();
  mock.driveAccount.findUnique.mockReset();
  mock.driveAccount.upsert.mockReset();
  mock.driveAccount.delete.mockReset();
  mock.allowedFolder.findMany.mockReset();
  mock.allowedFolder.upsert.mockReset();
  mock.refreshToken.create.mockReset().mockResolvedValue({ id: 'refresh-row-1' });
  mock.refreshToken.findUnique.mockReset().mockResolvedValue({
    id: 'refresh-row-1',
    subject: 'test-admin',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  mock.refreshToken.update.mockReset().mockResolvedValue(undefined);
  mock.refreshToken.updateMany.mockReset().mockResolvedValue({ count: 0 });
  mock.refreshToken.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  mock.uploadLog.create.mockReset().mockResolvedValue(undefined);
};
