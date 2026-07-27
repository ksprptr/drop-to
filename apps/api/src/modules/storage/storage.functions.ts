/**
 * Sanitizes a ZIP entry path so a crafted stored name can't traverse out of the archive
 * root when extracted (zip-slip): drops leading slashes, `.`/`..` segments and empties.
 **/
export const sanitizeZipEntryPath = (entryPath: string): string =>
  entryPath
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
