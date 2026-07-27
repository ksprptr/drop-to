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
  mock.uploadLog.create.mockReset().mockResolvedValue(undefined);
};
