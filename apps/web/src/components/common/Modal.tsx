'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

import type { ExtendedProps } from '@/common/types/global.types';
import Icon from '@/components/common/Icon';

interface Props extends ExtendedProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: string;
}

/**
 * Shared animated modal dialog with a backdrop and optional titled header.
 */
export default function Modal({ open, onClose, title, maxWidth = 'max-w-md', children }: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
            className={`w-full border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl border shadow-2xl`}>
            {title && (
              <div className='flex items-center justify-between border-b border-zinc-300 px-6 py-4 dark:border-zinc-700'>
                <h2 className='text-base font-semibold'>{title}</h2>
                <button
                  type='button'
                  onClick={onClose}
                  className='rounded-md p-1 text-zinc-600 transition hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'>
                  <Icon icon='XMark' className='h-5 w-5' />
                </button>
              </div>
            )}
            <div className='px-6 py-5'>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
