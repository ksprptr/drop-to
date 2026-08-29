'use client';

import { useCallback, useEffect, useState } from 'react';

import { useMediaQuery } from '@/common/hooks/useMediaQuery';

import type { AccountSidebarProps } from '../AccountSidebarContent';
import MenuHintModal from './MenuHintModal';
import MobileDrawer from './MobileDrawer';

/** Remembers that the swipe hint has been acknowledged. */
const HINT_STORAGE_KEY = 'dropto:menu-hint-seen';

/** The breakpoint at which the sidebar rail appears, so the drawer and its hint are pointless. */
const SIDEBAR_QUERY = '(min-width: 48rem)';

/**
 * Owns the mobile sidebar drawer and its first-visit swipe hint.
 **/
// The media query is the single gate: below `md` there is no rail, so the sidebar is a gesture.
// Above it the drawer, the swipe listener and the hint are never mounted at all.
export default function MobileMenu(sidebar: AccountSidebarProps) {
  const hasSidebar = useMediaQuery(SIDEBAR_QUERY);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // First visit on a device without the rail: nobody would guess the swipe on their own.
  useEffect(() => {
    if (hasSidebar) return;

    try {
      if (localStorage.getItem(HINT_STORAGE_KEY)) return;
    } catch {
      // Storage blocked (private mode, disabled cookies) — show the hint rather than crash.
    }

    setHintOpen(true);
  }, [hasSidebar]);

  const dismissHint = useCallback(() => {
    setHintOpen(false);

    try {
      localStorage.setItem(HINT_STORAGE_KEY, '1');
    } catch {
      // Storage blocked — the hint simply returns on the next visit.
    }
  }, []);

  if (hasSidebar) {
    return null;
  }

  return (
    <>
      <MobileDrawer sidebar={sidebar} open={menuOpen} onOpen={openMenu} onClose={closeMenu} />
      <MenuHintModal open={hintOpen} onDismiss={dismissHint} />
    </>
  );
}
