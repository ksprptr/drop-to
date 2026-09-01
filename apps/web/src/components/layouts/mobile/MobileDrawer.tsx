'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';

import AccountSidebarContent, { type AccountSidebarProps } from '../AccountSidebarContent';

interface Props {
  sidebar: AccountSidebarProps;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/** How far a horizontal drag has to travel to count as a swipe. */
const SWIPE_DISTANCE = 70;

/** How much more horizontal than vertical it has to be, so scrolling never opens the drawer. */
const SWIPE_RATIO = 1.5;

/**
 * Tells whether a touch started inside something that scrolls sideways.
 **/
// Those elements own their horizontal gestures — a long file name is read by dragging it.
const startedInScroller = (target: EventTarget | null): boolean => {
  let node = target instanceof Element ? target : null;

  while (node) {
    if (node.scrollWidth > node.clientWidth) {
      const { overflowX } = getComputedStyle(node);

      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }

    node = node.parentElement;
  }

  return false;
};

/**
 * The swipe-open account sidebar shown where the desktop rail does not fit.
 **/
export default function MobileDrawer({ sidebar, open, onOpen, onClose }: Props) {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];

      startX = touch.clientX;
      startY = touch.clientY;
      tracking = !startedInScroller(event.target);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (Math.abs(deltaX) < SWIPE_DISTANCE) return;
      if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_RATIO) return;

      if (deltaX > 0) {
        onOpen();
      } else {
        onClose();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onOpen, onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    // The page behind must not scroll while the drawer covers it.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className='fixed inset-0 z-50'>
          <motion.button
            type='button'
            aria-label='Close the menu'
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='absolute inset-0 h-full w-full bg-zinc-950/50 backdrop-blur-[2px]'
          />

          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className='absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-hidden border-r border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800'>
            {/* Each of these navigates or opens a dialog, so the drawer gets out of the way. */}
            <AccountSidebarContent
              {...sidebar}
              onSelectStorage={(backend) => {
                sidebar.onSelectStorage(backend);
                onClose();
              }}
              onManageFolders={() => {
                sidebar.onManageFolders();
                onClose();
              }}
              onDisconnect={() => {
                sidebar.onDisconnect();
                onClose();
              }}
            />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
