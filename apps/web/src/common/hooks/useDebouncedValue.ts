'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on each change (debounce).
 **/
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
