'use client';

import type { AuthUser } from '@dropto/types';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { getMe } from '@/common/services/api/auth.api';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';

interface Props {
  children: (user: AuthUser) => ReactNode;
}

/**
 * Client gate that guards a protected page: verifies the session via `/auth/me`
 * on mount, redirecting to `/login` when unauthenticated, and passing the
 * authenticated user to its children.
 */
export default function AuthGate({ children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    getMe()
      .then((value) => {
        if (active) {
          setUser(value);
        }
      })
      .catch(() => {
        // The axios interceptor also redirects on a truly-expired session; this
        // is the explicit fallback for the initial check.
        router.replace('/login');
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (!user) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <LoadingIndicator className='h-6 w-6' />
      </div>
    );
  }

  return <>{children(user)}</>;
}
