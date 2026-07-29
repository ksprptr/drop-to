'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import Icon from '@/components/common/Icon';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

const OPTIONS = [
  { value: 'system', label: 'System', icon: 'ComputerDesktop' },
  { value: 'light', label: 'Light', icon: 'Sun' },
  { value: 'dark', label: 'Dark', icon: 'Moon' },
] as const;

/**
 * Theme picker: a button that opens a menu to choose System, Light or Dark.
 **/
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!mounted) {
    return <div className='h-9 w-9' />;
  }

  const active = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[0];

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'
        aria-label='Change theme'
        aria-haspopup='menu'
        aria-expanded={open}>
        <Icon icon={active.icon} className='h-4 w-4' />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role='menu'
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className='absolute right-0 bottom-full z-50 mb-2 w-36 origin-bottom-right overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800'>
            {OPTIONS.map((option) => {
              const selected = option.value === active.value;

              return (
                <button
                  key={option.value}
                  type='button'
                  role='menuitem'
                  onClick={() => {
                    setTheme(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-x-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    selected
                      ? 'bg-green-600/10 text-green-700 dark:text-green-400'
                      : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-900'
                  }`}>
                  <Icon icon={option.icon} className='h-4 w-4' />
                  <span className='flex-1 text-left'>{option.label}</span>
                  {selected && <Icon icon='Check' className='h-3.5 w-3.5' />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
