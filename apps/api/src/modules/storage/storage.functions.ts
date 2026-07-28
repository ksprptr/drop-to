/**
 * Sanitizes a ZIP entry path so a crafted stored name can't traverse out of the archive
 * root when extracted (zip-slip): drops leading slashes, `.`/`..` segments and empties.
 **/
export const sanitizeZipEntryPath = (entryPath: string): string =>
  entryPath
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');

/**
 * Reduces an uploaded filename to a single safe path segment: strips any directory components
 * (`/` or `\`) and control chars so it can't write to an unintended key prefix / Drive name.
 **/
export const sanitizeUploadFilename = (name: string): string => {
  const base = (name.split(/[/\\]/).pop() ?? '').replace(/\p{Cc}/gu, '').trim();

  return base === '' || base === '.' || base === '..' ? 'file' : base;
};
