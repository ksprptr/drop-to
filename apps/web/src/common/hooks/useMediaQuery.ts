'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reports whether a media query currently matches.
 **/
// An external store, not state in an effect: the server snapshot is `false` and the client is right on first render.
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
