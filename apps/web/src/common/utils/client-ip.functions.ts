/**
 * The `X-Forwarded-For` chain to hand the API, or null when there is nothing trustworthy to forward.
 **/
// Security-relevant: the API keys its rate limiter on `req.ip`, which Express derives from this
// header using `TRUST_PROXY_HOPS`. Two rules make that derivation sound, and both are easy to
// break by accident:
//
//   1. Only `x-forwarded-for` is read. A client can send any header it likes, so a vendor header
//      such as `cf-connecting-ip` is only worth reading when the matching vendor actually sits in
//      front of this app and overwrites it — nothing does here, so trusting it would hand the
//      client a single-value header that wins over the real chain.
//   2. The chain is forwarded verbatim, never appended to. Each proxy appends the peer it received
//      from, so the rightmost entry is the one *our* proxy wrote and the only one a client cannot
//      forge — which is exactly the entry `trust proxy` counts back to. Appending our own hop would
//      shift that count and make `req.ip` resolve to the proxy instead of the client.
//
// A forged prefix is therefore harmless: `<forged>, <real>` still resolves to `<real>`.
export const forwardedForHeader = (headersList: Headers): string | null =>
  headersList.get('x-forwarded-for');
