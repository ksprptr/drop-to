'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';
import type { PropsWithChildren } from 'react';

/**
 * Component wrapping next-themes to enable class-based, OS-driven dark mode.
 */
export default function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemeProvider
      attribute='class'
      defaultTheme='system'
      enableSystem
      disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
