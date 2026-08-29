'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reports whether a media query currently matches.
 **/
// An external store, not state in an effect: only the browser knows the viewport width, so the
// server snapshot is `false` and the client has the real answer on its first render — no flash.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);

      media.addEventListener('change', onChange);

      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
