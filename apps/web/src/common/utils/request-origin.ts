/**
 * True when Fetch Metadata marks the request cross-site; CSRF defense-in-depth on cookie-auth route handlers.
 **/
export const isCrossSiteRequest = (request: Request): boolean =>
  request.headers.get('sec-fetch-site') === 'cross-site';

/**
 * The externally-visible origin of a request, honoring the reverse proxy's forwarded headers.
 **/
export const resolveForwardedOrigin = (
  getHeader: (name: string) => string | null,
  fallback: string,
): string => {
  const forwardedHost = getHeader('x-forwarded-host');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (getHeader('x-forwarded-proto') ?? 'https').split(',')[0].trim();
    return `${proto}://${host}`;
  }

  return fallback;
};

/**
 * The externally-visible origin of a request (redirect targets), falling back to its own origin.
 **/
export const resolveRequestOrigin = (request: Request): string =>
  resolveForwardedOrigin((name) => request.headers.get(name), new URL(request.url).origin);
