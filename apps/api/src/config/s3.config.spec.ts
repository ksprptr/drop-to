import { s3Config } from './s3.config';

const S3_KEYS = [
  'S3_ENABLED',
  'S3_BUCKETS',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
];

describe('s3Config', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of S3_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of S3_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('is disabled (and skips validation) when S3_ENABLED is not "true"', () => {
    process.env.S3_ENABLED = 'false';

    const cfg = s3Config();

    expect(cfg.enabled).toBe(false);
    expect(cfg.buckets).toEqual([]);
  });

  it('parses trimmed buckets, region and endpoint/path-style when enabled', () => {
    Object.assign(process.env, {
      S3_ENABLED: 'true',
      S3_BUCKETS: 'a, b ,c,',
      S3_REGION: 'eu-central-1',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_ENDPOINT: 'https://minio.local',
      S3_FORCE_PATH_STYLE: 'true',
    });

    const cfg = s3Config();

    expect(cfg.enabled).toBe(true);
    expect(cfg.buckets).toEqual(['a', 'b', 'c']);
    expect(cfg.region).toBe('eu-central-1');
    expect(cfg.endpoint).toBe('https://minio.local');
    expect(cfg.forcePathStyle).toBe(true);
  });

  it('throws when enabled but credentials/region are missing', () => {
    process.env.S3_ENABLED = 'true';
    process.env.S3_BUCKETS = 'a';

    expect(() => s3Config()).toThrow(/missing required variables/i);
  });

  it('throws when enabled but S3_BUCKETS is empty', () => {
    Object.assign(process.env, {
      S3_ENABLED: 'true',
      S3_REGION: 'eu',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    });

    expect(() => s3Config()).toThrow(/S3_BUCKETS is empty/i);
  });
});
