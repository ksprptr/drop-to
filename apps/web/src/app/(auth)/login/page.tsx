import type { Metadata } from 'next';
import { Suspense } from 'react';

import LoginForm from '@/components/forms/LoginForm';
import { appServerConfig } from '@/configs/app/app.server-config';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * Login route — the proxy redirects already-authenticated visitors to `/`.
 **/
export default function LoginPage() {
  return (
    // `useSearchParams` in the form makes it a client boundary that needs its own Suspense.
    <Suspense>
      <LoginForm appName={appServerConfig.name} />
    </Suspense>
  );
}
