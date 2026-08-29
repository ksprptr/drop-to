'use client';

import AccountSidebarContent, { type AccountSidebarProps } from './AccountSidebarContent';

/**
 * Left pane: Google account + S3 status, storage switcher, and the session footer.
 **/
// Only the desktop shell — below `md` the same body is served by the swipe-open `MobileDrawer`.
export default function AccountSidebar(props: AccountSidebarProps) {
  return (
    <aside className='hidden w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-50 md:flex dark:border-zinc-700 dark:bg-zinc-800'>
      <AccountSidebarContent {...props} />
    </aside>
  );
}
