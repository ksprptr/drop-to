import type { Metadata } from 'next';

import NotFoundContent from '@/components/layouts/NotFoundContent';

export const metadata: Metadata = {
  title: 'Page not found',
};

/**
 * 404 page — a Server Component (for the title) wrapping the animated client body.
 **/
export default function NotFound() {
  return <NotFoundContent />;
}
