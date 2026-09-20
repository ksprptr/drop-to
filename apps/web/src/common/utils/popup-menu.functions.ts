import type { CSSProperties } from 'react';

/** Gap between a popup menu and the control it is anchored to. */
const MENU_GAP = 4;

/** Open/close animation shared by every popup menu (fade + zoom + slight slide), shadcn-style. */
export const MENU_MOTION = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
  transition: { duration: 0.08, ease: 'easeOut' },
} as const;

/** Shell of every popup menu; fixed, so a scrolling ancestor can never clip it. */
export const POPUP_MENU_CLASS =
  'fixed z-50 flex flex-col gap-y-0.5 rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800';

/**
 * Places a menu under the control it belongs to, flipping it above when it would overflow below.
 **/
// `estimatedHeight` is what makes the flip possible at all: the menu has not been measured when its
// position is computed, so the caller passes a height big enough to decide the direction.
export const anchoredMenuStyle = (
  anchor: DOMRect,
  width: number,
  estimatedHeight?: number,
): CSSProperties => {
  const left = Math.max(8, anchor.right - width);
  const flipUp =
    estimatedHeight !== undefined &&
    typeof window !== 'undefined' &&
    anchor.bottom + estimatedHeight > window.innerHeight;

  return flipUp
    ? {
        left,
        bottom: window.innerHeight - anchor.top + MENU_GAP,
        width,
        transformOrigin: 'bottom right',
      }
    : { left, top: anchor.bottom + MENU_GAP, width, transformOrigin: 'top right' };
};
