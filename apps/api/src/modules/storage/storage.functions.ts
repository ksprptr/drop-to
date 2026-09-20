import { Archiver } from 'archiver';

/**
 * Finalizes the archive once population resolves, or destroys it with the error (fire-and-forget).
 **/
export const finalizeArchiveInBackground = (
  archive: Archiver,
  population: Promise<unknown>,
): void => {
  void population.then(
    () => archive.finalize(),
    (error: unknown) => archive.destroy(error instanceof Error ? error : new Error(String(error))),
  );
};

/**
 * Sanitizes a ZIP entry path to prevent zip-slip traversal (drops `.`/`..` and splits on `/` and `\`).
 **/
export const sanitizeZipEntryPath = (entryPath: string): string =>
  entryPath
    .split(/[/\\]/)
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');

/**
 * Reduces an uploaded filename to a single safe path segment (strips directory components and control chars).
 **/
export const sanitizeUploadFilename = (name: string): string => {
  const base = (name.split(/[/\\]/).pop() ?? '').replace(/\p{Cc}/gu, '').trim();

  return base === '' || base === '.' || base === '..' ? 'file' : base;
};

/** Common extension → MIME map so previews (images especially) and public links serve a real type. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
};

/**
 * Guesses a MIME type from a file name extension (octet-stream when unknown).
 **/
export const guessMimeType = (name: string): string => {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();

  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
};

/** MIME types safe to render in the browser; everything else is forced to download. */
// A public link serves attacker-influenceable bytes from this origin, so anything scriptable
// (text/html, image/svg+xml) must never render inline — it would be stored XSS on the app's domain.
const INLINE_SAFE_MIME = /^(image\/(?!svg\+xml)|video\/|audio\/)|^application\/pdf$|^text\/plain$/;

/**
 * Whether a MIME type may be shown inline in the browser rather than downloaded.
 **/
export const isInlineSafeMimeType = (mimeType: string): boolean =>
  INLINE_SAFE_MIME.test(mimeType.split(';')[0].trim().toLowerCase());

/**
 * Content-Disposition with an ASCII fallback + RFC 5987 UTF-8 variant for non-ASCII names.
 **/
export const contentDisposition = (
  disposition: 'inline' | 'attachment',
  fileName: string,
): string => {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};
