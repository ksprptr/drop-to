import type { Metadata } from 'next';

import LoginForm from '@/components/forms/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * Login route — operator username/password sign-in. The proxy redirects
 * already-authenticated visitors to the workspace before this renders.
 */
export default function LoginPage() {
  return <LoginForm />;
}
