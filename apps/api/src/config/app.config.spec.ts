import { appConfig } from './app.config';

const KEYS = ['APP_PORT', 'NODE_ENV', 'CORS_ALLOWED_ORIGINS', 'WEB_APP_URL', 'TRUST_PROXY_HOPS'];

describe('appConfig', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of KEYS) {
      saved[key] = process.env[key];
    }
    Object.assign(process.env, {
      APP_PORT: '4000',
      NODE_ENV: 'test',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      WEB_APP_URL: 'http://localhost:3000',
    });
    delete process.env['TRUST_PROXY_HOPS'];
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('parses the port as a number', () => {
    process.env['APP_PORT'] = '4321';

    expect(appConfig().port).toBe(4321);
  });

  it('derives the environment flags from NODE_ENV', () => {
    process.env['NODE_ENV'] = 'production';
    expect(appConfig()).toMatchObject({ isProduction: true, isDevelopment: false });

    process.env['NODE_ENV'] = 'development';
    expect(appConfig()).toMatchObject({ isProduction: false, isDevelopment: true });

    // Neither flag is true under `test`, which is what keeps Swagger off in the e2e suite.
    process.env['NODE_ENV'] = 'test';
    expect(appConfig()).toMatchObject({ isProduction: false, isDevelopment: false });
  });

  it('splits and trims the CORS allowlist', () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://a.test, https://b.test ,https://c.test';

    expect(appConfig().corsAllowedOrigins).toEqual([
      'https://a.test',
      'https://b.test',
      'https://c.test',
    ]);
  });

  // Security-relevant: the hop count decides which X-Forwarded-For entry becomes `req.ip`, the rate-limit key.
  it('defaults the trusted proxy hop count to 1', () => {
    expect(appConfig().trustProxyHops).toBe(1);
  });

  it('honours an explicit TRUST_PROXY_HOPS', () => {
    process.env['TRUST_PROXY_HOPS'] = '2';

    expect(appConfig().trustProxyHops).toBe(2);
  });
});
