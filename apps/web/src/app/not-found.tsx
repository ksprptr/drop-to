import type { Metadata } from 'next';

import NotFoundContent from '@/components/layouts/NotFoundContent';

export const metadata: Metadata = {
  title: 'Page not found',
};

/**
 * Custom 404 page (Server Component so it can set its title; the animated body
 * lives in a client child).
 */
export default function NotFound() {
  return <NotFoundContent />;
}
