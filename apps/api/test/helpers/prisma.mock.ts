/** A mock PrismaService for integration tests; behavior is scripted per test via jest.fn returns. */
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

/** A live (non-revoked, unexpired) refresh-token row — the default `findUnique` result. */
const liveRefreshRow = () => ({
  id: 'refresh-row-1',
  tokenHash: 'hash-1',
  subject: 'test-admin',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
});

/**
 * Creates a fresh Prisma mock with healthy infrastructure defaults.
 **/
export const createPrismaMock = (): PrismaMock => {
  const mock: PrismaMock = {
    // Rejecting with this exact hint makes Terminus fall through to the SQL path (reports DB up).
    $runCommandRaw: jest.fn().mockRejectedValue(new Error('Use the mongodb provider')),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]),
    // Interactive form invokes the callback with the mock as tx client; array form resolves empty.
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: PrismaMock) => unknown)(mock) : Promise.resolve([]),
    ),
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
    // Default: issuing a session creates a row; lookups find a live row unless a test scripts otherwise.
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'refresh-row-2' }),
      findUnique: jest.fn().mockResolvedValue(liveRefreshRow()),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    uploadLog: { create: jest.fn().mockResolvedValue(undefined) },
  };

  return mock;
};

/**
 * Resets all mocks on the given Prisma mock and restores the infrastructure defaults.
 **/
export const resetPrismaMock = (mock: PrismaMock): void => {
  mock.$runCommandRaw.mockReset().mockRejectedValue(new Error('Use the mongodb provider'));
  mock.$queryRawUnsafe.mockReset().mockResolvedValue([{ ok: 1 }]);
  mock.$transaction
    .mockReset()
    .mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: PrismaMock) => unknown)(mock) : Promise.resolve([]),
    );
  mock.authState.findUnique.mockReset().mockResolvedValue(null);
  mock.authState.upsert.mockReset().mockResolvedValue(undefined);
  mock.driveAccount.findFirst.mockReset();
  mock.driveAccount.findUnique.mockReset();
  mock.driveAccount.upsert.mockReset();
  mock.driveAccount.delete.mockReset();
  mock.allowedFolder.findMany.mockReset();
  mock.allowedFolder.upsert.mockReset();
  mock.refreshToken.create.mockReset().mockResolvedValue({ id: 'refresh-row-2' });
  mock.refreshToken.findUnique.mockReset().mockResolvedValue(liveRefreshRow());
  mock.refreshToken.update.mockReset().mockResolvedValue(undefined);
  mock.refreshToken.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mock.refreshToken.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  mock.uploadLog.create.mockReset().mockResolvedValue(undefined);
};
