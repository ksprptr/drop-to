'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import type { Crumb } from '@/common/types/workspace.types';
import Icon from '@/components/common/Icon';
import { STORAGE_ICON } from '@/configs/storage.config';

/**
 * Lets the root crumb switch the active storage. Primarily for mobile, where the
 * sidebar (and its storage switcher) is hidden.
 */
export interface BreadcrumbStoragePicker {
  storages: StorageStatus[];
  activeBackend: StorageBackend | null;
  onSelect: (backend: StorageBackend) => void;
}

interface Props {
  crumbs: Crumb[];
  /** Label of the browse root (the active storage name, e.g. "Google Drive"). */
  rootLabel: string;
  /** Icon name for the browse root. */
  rootIcon: string;
  onNavigate: (index: number) => void;
  storagePicker?: BreadcrumbStoragePicker;
}

/**
 * Breadcrumb trail for the current folder path. The first crumb is the active
 * storage (e.g. Google Drive → folder → subfolder); at the roots level, when more
 * than one storage is connected, it doubles as a dropdown to switch storage.
 */
export default function Breadcrumb({
  crumbs,
  rootLabel,
  rootIcon,
  onNavigate,
  storagePicker,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const atRoots = crumbs.length === 0;
  const isPicker = atRoots && Boolean(storagePicker && storagePicker.storages.length > 1);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  return (
    <nav className='flex min-w-0 items-center gap-x-1 text-sm'>
      <div ref={rootRef} className='relative shrink-0'>
        <button
          type='button'
          onClick={() => (isPicker ? setPickerOpen((open) => !open) : onNavigate(-1))}
          className={`flex shrink-0 items-center gap-x-1 hover:text-green-600 ${
            atRoots
              ? 'font-medium text-zinc-950 dark:text-zinc-50'
              : 'text-zinc-600 dark:text-zinc-400'
          }`}>
          <Icon icon={rootIcon} className='h-4 w-4 shrink-0' />
          <span className='max-w-[10rem] truncate'>{rootLabel}</span>
          {isPicker && <Icon icon='ChevronUpDown' className='h-3.5 w-3.5 shrink-0 opacity-60' />}
        </button>

        <AnimatePresence>
          {isPicker && pickerOpen && storagePicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              style={{ transformOrigin: 'top left' }}
              className='absolute top-full left-0 z-30 mt-1 flex w-48 flex-col gap-y-0.5 rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
              {storagePicker.storages.map((storage) => {
                const active = storage.backend === storagePicker.activeBackend;
                return (
                  <button
                    key={storage.backend}
                    type='button'
                    onClick={() => {
                      storagePicker.onSelect(storage.backend);
                      setPickerOpen(false);
                    }}
                    className={`flex items-center gap-x-2.5 rounded-lg px-3 py-2 text-left font-medium transition ${
                      active
                        ? 'bg-green-600/10 text-green-600'
                        : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}>
                    <Icon icon={STORAGE_ICON[storage.backend]} className='h-4 w-4 shrink-0' />
                    <span className='truncate'>{storage.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {crumbs.map((crumb, index) => (
        <span key={crumb.id} className='flex min-w-0 items-center gap-x-1'>
          <Icon
            icon='ChevronRight'
            className='h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-400'
          />
          <button
            type='button'
            onClick={() => onNavigate(index)}
            className={`min-w-0 truncate hover:text-green-600 ${
              index === crumbs.length - 1
                ? 'font-medium text-zinc-950 dark:text-zinc-50'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}>
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
