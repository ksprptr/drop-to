import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import type { PropsWithChildren } from 'react';

import ThemeProvider from '@/components/providers/ThemeProvider';
import ToastProvider from '@/components/providers/ToastProvider';
import { MetadataConfig } from '@/configs/metadata.config';

import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: MetadataConfig.title,
  description: MetadataConfig.description,
};

/**
 * Root layout: fonts, theme + toast providers, and base surface colors.
 */
export default function RootLayout({ children }: Readonly<PropsWithChildren>) {
  return (
    <html lang='en' data-scroll-behavior='smooth' suppressHydrationWarning>
      <body
        className={`${poppins.className} min-h-screen bg-zinc-100 text-zinc-950 antialiased dark:bg-zinc-900 dark:text-zinc-50`}>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
