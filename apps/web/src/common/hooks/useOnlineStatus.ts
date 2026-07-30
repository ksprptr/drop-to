'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks the browser's connectivity via the `online`/`offline` events and `navigator.onLine`. Returns `true` if the browser is online, `false` if offline.
 **/
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
