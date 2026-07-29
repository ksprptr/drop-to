/**
 * True when Fetch Metadata marks the request cross-site; CSRF defense-in-depth on cookie-auth route handlers.
 **/
export const isCrossSiteRequest = (request: Request): boolean =>
  request.headers.get('sec-fetch-site') === 'cross-site';

/**
 * The externally-visible origin of a request, honoring the reverse proxy's forwarded headers.
 **/
export const resolveRequestOrigin = (request: Request): string => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (request.headers.get('x-forwarded-proto') ?? 'https').split(',')[0].trim();
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
};
