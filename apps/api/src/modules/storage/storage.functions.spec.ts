import {
  contentDisposition,
  guessMimeType,
  isInlineSafeMimeType,
  sanitizeUploadFilename,
  sanitizeZipEntryPath,
} from './storage.functions';

describe('sanitizeZipEntryPath', () => {
  it('drops leading slashes and `.`/`..` segments (zip-slip)', () => {
    expect(sanitizeZipEntryPath('/a//b/./c')).toBe('a/b/c');
    expect(sanitizeZipEntryPath('../../etc/passwd')).toBe('etc/passwd');
  });

  it('neutralizes backslash traversal (Windows extractors)', () => {
    expect(sanitizeZipEntryPath('..\\..\\evil.exe')).toBe('evil.exe');
    expect(sanitizeZipEntryPath('a\\b\\c.txt')).toBe('a/b/c.txt');
  });

  it('keeps a normal nested path intact', () => {
    expect(sanitizeZipEntryPath('dir/sub/file.txt')).toBe('dir/sub/file.txt');
  });
});

describe('sanitizeUploadFilename', () => {
  it('reduces a path-bearing filename to its final segment', () => {
    expect(sanitizeUploadFilename('../../other/evil.txt')).toBe('evil.txt');
    expect(sanitizeUploadFilename('a/b/c.png')).toBe('c.png');
    expect(sanitizeUploadFilename('dir\\sub\\win.txt')).toBe('win.txt');
  });

  it('strips control characters', () => {
    expect(sanitizeUploadFilename('a\x07b\x00.txt')).toBe('ab.txt');
  });

  it('falls back to `file` for empty / traversal-only names', () => {
    expect(sanitizeUploadFilename('')).toBe('file');
    expect(sanitizeUploadFilename('..')).toBe('file');
    expect(sanitizeUploadFilename('/')).toBe('file');
    expect(sanitizeUploadFilename('a/b/')).toBe('file');
  });

  it('leaves a plain filename untouched', () => {
    expect(sanitizeUploadFilename('photo 2024.jpg')).toBe('photo 2024.jpg');
  });
});

describe('isInlineSafeMimeType', () => {
  it('allows the media types a share link is meant to preview', () => {
    for (const type of ['image/png', 'image/jpeg', 'video/mp4', 'audio/mpeg', 'application/pdf']) {
      expect(isInlineSafeMimeType(type)).toBe(true);
    }
  });

  // Serving either of these inline from the app's own origin would be stored XSS.
  it('never allows a scriptable type to render inline', () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml']) {
      expect(isInlineSafeMimeType(type)).toBe(false);
    }
  });

  it('ignores parameters and casing when deciding', () => {
    expect(isInlineSafeMimeType('IMAGE/PNG')).toBe(true);
    expect(isInlineSafeMimeType('text/plain; charset=utf-8')).toBe(true);
    expect(isInlineSafeMimeType('TEXT/HTML; charset=utf-8')).toBe(false);
  });

  it('falls back to download for anything unknown', () => {
    expect(isInlineSafeMimeType('application/octet-stream')).toBe(false);
  });
});

describe('guessMimeType', () => {
  it('maps a known extension, case-insensitively', () => {
    expect(guessMimeType('photo.PNG')).toBe('image/png');
    expect(guessMimeType('a/b/clip.mp4')).toBe('video/mp4');
  });

  it('falls back to octet-stream with no or an unknown extension', () => {
    expect(guessMimeType('README')).toBe('application/octet-stream');
    expect(guessMimeType('thing.zzz')).toBe('application/octet-stream');
  });
});

describe('contentDisposition', () => {
  it('carries both the ASCII fallback and the UTF-8 name', () => {
    expect(contentDisposition('attachment', 'faktura.pdf')).toBe(
      'attachment; filename="faktura.pdf"; filename*=UTF-8\'\'faktura.pdf',
    );
  });

  it('strips quotes and non-ASCII from the fallback so the header cannot be broken out of', () => {
    const header = contentDisposition('inline', 'a"b\u010d.png');

    expect(header.startsWith('inline; filename="ab_.png"')).toBe(true);
    expect(header).toContain("filename*=UTF-8''a%22b%C4%8D.png");
  });
});
