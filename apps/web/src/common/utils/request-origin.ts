/**
 * True when Fetch Metadata marks the request cross-site; CSRF defense-in-depth on cookie-auth route handlers.
 **/
export const isCrossSiteRequest = (request: Request): boolean =>
  request.headers.get('sec-fetch-site') === 'cross-site';
