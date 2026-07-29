'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs` — resets the timer on every change, so it only settles once the value stops changing (used to debounce the server-side search behind an instant client filter).
 **/
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
