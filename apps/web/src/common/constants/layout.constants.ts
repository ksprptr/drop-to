/**
 * Viewport at which the desktop chrome fits: the sidebar rail and the split view. Tailwind's `md`.
 **/
// Below it the sidebar becomes a swipe-open drawer and the split view is unavailable — two panes
// have no room, and moving items between them is a drag & drop gesture touch never fires.
export const DESKTOP_QUERY = '(min-width: 48rem)';
