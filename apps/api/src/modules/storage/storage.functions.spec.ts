import { sanitizeUploadFilename, sanitizeZipEntryPath } from './storage.functions';

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
