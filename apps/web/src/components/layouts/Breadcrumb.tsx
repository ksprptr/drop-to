'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Crumb } from '@/common/types/workspace.types';
import Icon from '@/components/common/Icon';
import { STORAGE_ICON } from '@/configs/storage.config';

/** Lets the root crumb switch the active storage (mobile, where the sidebar is hidden). */
export interface BreadcrumbStoragePicker {
  storages: StorageStatus[];
  activeBackend: StorageBackend | null;
  onSelect: (backend: StorageBackend) => void;
}

interface Props {
  crumbs: Crumb[];
  rootLabel: string;
  rootIcon: string;
  onNavigate: (index: number) => void;
  storagePicker?: BreadcrumbStoragePicker;
}

/**
 * Folder-path trail; the root crumb doubles as a storage switcher at the roots level.
 **/
export default function Breadcrumb({
  crumbs,
  rootLabel,
  rootIcon,
  onNavigate,
  storagePicker,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowPos, setOverflowPos] = useState<{ top: number; left: number } | null>(null);
  const overflowRef = useRef<HTMLSpanElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);

  // Below `md` the sidebar is hidden, so the root crumb becomes the storage switcher.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const atRoots = crumbs.length === 0;
  const isPicker = isMobile && Boolean(storagePicker && storagePicker.storages.length > 1);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setPickerOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    // mousedown (not click) so it also fires when opening a menu whose button stops click propagation.
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!overflowOpen) {
      return;
    }
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!overflowRef.current?.contains(target) && !overflowMenuRef.current?.contains(target)) {
        setOverflowOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverflowOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [overflowOpen]);

  const renderCrumb = (crumb: Crumb, index: number) => (
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
        {crumb.name || (
          <span className='inline-block h-3 w-16 animate-pulse rounded bg-zinc-300 align-middle dark:bg-zinc-700' />
        )}
      </button>
    </span>
  );

  return (
    <nav className='flex min-w-0 items-center gap-x-1 text-sm'>
      <div ref={rootRef} className='relative shrink-0'>
        <button
          type='button'
          onClick={() => {
            if (!isPicker) {
              onNavigate(-1);
              return;
            }
            if (!pickerOpen && rootRef.current) {
              const rect = rootRef.current.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 4, left: rect.left });
            }
            setPickerOpen((open) => !open);
          }}
          className={`flex shrink-0 items-center gap-x-1 hover:text-green-600 ${
            atRoots
              ? 'font-medium text-zinc-950 dark:text-zinc-50'
              : 'text-zinc-600 dark:text-zinc-400'
          }`}>
          <Icon icon={rootIcon} className='h-4 w-4 shrink-0' />
          <span className='max-w-40 truncate'>{rootLabel}</span>
          {isPicker && <Icon icon='ChevronUpDown' className='h-3.5 w-3.5 shrink-0 opacity-60' />}
        </button>

        {typeof document !== 'undefined' &&
          createPortal(
            <AnimatePresence>
              {isPicker && pickerOpen && storagePicker && menuPos && (
                <motion.div
                  ref={menuRef}
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.08, ease: 'easeOut' }}
                  style={{ transformOrigin: 'top left', top: menuPos.top, left: menuPos.left }}
                  className='fixed z-50 flex w-48 flex-col gap-y-0.5 rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
                  {storagePicker.storages.map((storage) => {
                    const active = storage.backend === storagePicker.activeBackend;
                    const disabled = !storage.connected;
                    return (
                      <button
                        key={storage.backend}
                        type='button'
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) {
                            return;
                          }
                          storagePicker.onSelect(storage.backend);
                          setPickerOpen(false);
                        }}
                        className={`flex items-center gap-x-2.5 rounded-lg px-3 py-2 text-left font-medium transition ${
                          active
                            ? 'bg-green-600/10 text-green-600'
                            : disabled
                              ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-600'
                              : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}>
                        <Icon icon={STORAGE_ICON[storage.backend]} className='h-4 w-4 shrink-0' />
                        <span className='truncate'>{storage.label}</span>
                        {disabled && (
                          <span className='ml-auto shrink-0 text-xs opacity-70'>Not connected</span>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>,
            document.body,
          )}
      </div>

      {crumbs.length <= 4 ? (
        crumbs.map((crumb, index) => renderCrumb(crumb, index))
      ) : (
        <>
          {renderCrumb(crumbs[0], 0)}
          <span ref={overflowRef} className='flex shrink-0 items-center gap-x-1'>
            <Icon
              icon='ChevronRight'
              className='h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-400'
            />
            <button
              type='button'
              onClick={() => {
                if (!overflowOpen && overflowRef.current) {
                  const rect = overflowRef.current.getBoundingClientRect();
                  setOverflowPos({ top: rect.bottom + 4, left: rect.left });
                }
                setOverflowOpen((open) => !open);
              }}
              title='Show hidden folders'
              className='rounded px-1 font-medium text-zinc-600 hover:text-green-600 dark:text-zinc-400'>
              …
            </button>
          </span>
          {renderCrumb(crumbs[crumbs.length - 2], crumbs.length - 2)}
          {renderCrumb(crumbs[crumbs.length - 1], crumbs.length - 1)}
        </>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {overflowOpen && overflowPos && (
              <motion.div
                ref={overflowMenuRef}
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.08, ease: 'easeOut' }}
                style={{ transformOrigin: 'top left', top: overflowPos.top, left: overflowPos.left }}
                className='fixed z-50 flex max-h-72 w-56 flex-col gap-y-0.5 overflow-y-auto rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
                {crumbs.slice(1, crumbs.length - 2).map((crumb, i) => (
                  <button
                    key={crumb.id}
                    type='button'
                    onClick={() => {
                      onNavigate(i + 1);
                      setOverflowOpen(false);
                    }}
                    className='flex items-center gap-x-2 rounded-lg px-3 py-2 text-left text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700'>
                    <Icon icon='Folder' className='h-4 w-4 shrink-0 text-green-600' />
                    <span className='truncate'>{crumb.name || 'Loading…'}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </nav>
  );
}
