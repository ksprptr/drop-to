/**
 * The `X-Forwarded-For` chain to hand the API, or null when there is nothing trustworthy to forward.
 **/
// Only `x-forwarded-for`, verbatim: the rate-limit key depends on `trust proxy` counting back to our proxy's entry.
export const forwardedForHeader = (headersList: Headers): string | null =>
  headersList.get('x-forwarded-for');
