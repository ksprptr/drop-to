/**
 * True when Fetch Metadata marks the request as cross-site. Used as CSRF defense-in-depth on
 * cookie-authenticated, state-changing route handlers (Server Actions get this check built in).
 * Same-origin / same-site / direct navigations (`none`) and clients that omit the header pass.
 **/
export const isCrossSiteRequest = (request: Request): boolean =>
  request.headers.get('sec-fetch-site') === 'cross-site';
