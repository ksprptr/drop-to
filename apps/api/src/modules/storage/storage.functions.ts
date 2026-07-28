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
