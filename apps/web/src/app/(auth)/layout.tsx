import type { PropsWithChildren } from 'react';

/**
 * Auth layout — a thin wrapper for the unauthenticated routes (login).
 */
export default function AuthLayout({ children }: Readonly<PropsWithChildren>) {
  return <>{children}</>;
}
