import { googleConfig } from './google.config';

const GOOGLE_KEYS = [
  'GOOGLE_ENABLED',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
];

describe('googleConfig', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of GOOGLE_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of GOOGLE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('is disabled (and skips validation) when GOOGLE_ENABLED is not "true"', () => {
    process.env.GOOGLE_ENABLED = 'false';

    const cfg = googleConfig();

    expect(cfg.enabled).toBe(false);
  });

  it('is disabled when GOOGLE_ENABLED is absent entirely', () => {
    expect(googleConfig().enabled).toBe(false);
  });

  it('reads the OAuth credentials and the full-drive scope when enabled', () => {
    Object.assign(process.env, {
      GOOGLE_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/oauth/google/callback',
    });

    const cfg = googleConfig();

    expect(cfg.enabled).toBe(true);
    expect(cfg.clientId).toBe('client-id');
    expect(cfg.clientSecret).toBe('client-secret');
    expect(cfg.redirectUri).toBe('http://localhost:3000/api/oauth/google/callback');
    expect(cfg.scopes).toContain('https://www.googleapis.com/auth/drive');
  });

  it('throws when enabled but the OAuth credentials are missing', () => {
    process.env.GOOGLE_ENABLED = 'true';
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    expect(() => googleConfig()).toThrow(/missing required variables/i);
  });
});
