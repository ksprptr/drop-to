/**
 * Shared `googleapis` mock (mirrors the reference monorepo's `stripe.mock.ts` approach).
 *
 * `google.auth.OAuth2` and `google.drive` are replaced so no Google network call ever
 * happens. Each e2e file wires it in with:
 *
 *   jest.mock('googleapis', () => require('../helpers/googleapis.mock').createGoogleApisMock());
 *
 * and imports `oauthClientMock` / `driveFilesMock` to script behavior per test.
 */

export const oauthClientMock = {
  setCredentials: jest.fn(),
  getAccessToken: jest.fn(),
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  revokeCredentials: jest.fn(),
};

export const driveFilesMock = {
  get: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};

/**
 * Builds the mocked `googleapis` module — passed to `jest.mock` as the factory.
 */
export const createGoogleApisMock = () => ({
  google: {
    auth: { OAuth2: jest.fn(() => oauthClientMock) },
    drive: jest.fn(() => ({ files: driveFilesMock })),
  },
});

/**
 * Resets call history and restores sensible default resolutions between tests.
 */
export const resetGoogleApisMock = (): void => {
  oauthClientMock.setCredentials.mockReset();
  oauthClientMock.getAccessToken.mockReset().mockResolvedValue({ token: 'access-token' });
  oauthClientMock.generateAuthUrl.mockReset().mockReturnValue('https://consent');
  oauthClientMock.getToken.mockReset();
  oauthClientMock.revokeCredentials.mockReset().mockResolvedValue({});
  driveFilesMock.get.mockReset();
  driveFilesMock.list.mockReset();
  driveFilesMock.create.mockReset();
  driveFilesMock.delete.mockReset();
};
