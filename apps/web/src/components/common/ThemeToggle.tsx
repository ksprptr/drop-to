'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import Icon from '@/components/common/Icon';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Button toggling between light and dark themes.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return <div className='h-9 w-9' />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type='button'
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'
      aria-label='Toggle theme'>
      <Icon icon={isDark ? 'Sun' : 'Moon'} className='h-4 w-4' />
    </button>
  );
}
