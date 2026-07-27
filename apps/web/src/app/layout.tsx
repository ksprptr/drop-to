import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import type { PropsWithChildren } from 'react';

import ThemeProvider from '@/components/providers/ThemeProvider';
import ToastProvider from '@/components/providers/ToastProvider';
import { appServerConfig } from '@/configs/app/app.server-config';
import { metadataConfig } from '@/configs/seo/metadata.config';

import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

const { appUrl } = appServerConfig.urls;

const siteTitle = `${metadataConfig.title} · ${metadataConfig.tagline}`;
const ogImages = [
  { url: `${appUrl}/api/og`, width: 1200, height: 630, alt: metadataConfig.shortTitle },
];

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: siteTitle,
    template: `${metadataConfig.title} · %s`,
  },
  description: metadataConfig.description,
  applicationName: metadataConfig.title,
  keywords: metadataConfig.keywords,
  openGraph: {
    title: siteTitle,
    description: metadataConfig.description,
    type: 'website',
    url: appUrl,
    siteName: metadataConfig.shortTitle,
    images: ogImages,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: metadataConfig.description,
    images: ogImages,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: metadataConfig.colors.background },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' },
  ],
};

/**
 * Root layout: fonts, theme + toast providers, and base surface colors.
 */
export default function RootLayout({ children }: Readonly<PropsWithChildren>) {
  return (
    <html lang='en' data-scroll-behavior='smooth' suppressHydrationWarning>
      <head>
        <meta name='apple-mobile-web-app-title' content='DropTo' />
      </head>
      <body
        className={`${poppins.className} min-h-screen bg-zinc-100 text-zinc-950 antialiased dark:bg-zinc-900 dark:text-zinc-50`}
        suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
