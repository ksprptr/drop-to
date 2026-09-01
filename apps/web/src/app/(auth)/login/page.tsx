import type { Metadata } from 'next';

import LoginForm from '@/components/forms/LoginForm';
import { appServerConfig } from '@/configs/app/app.server-config';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * Login route — the proxy redirects already-authenticated visitors to `/`.
 **/
export default function LoginPage() {
  return <LoginForm appName={appServerConfig.name} />;
}
