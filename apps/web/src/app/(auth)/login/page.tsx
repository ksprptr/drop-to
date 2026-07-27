import LoginForm from '@/components/forms/LoginForm';

/**
 * Login route — operator username/password sign-in. The proxy redirects
 * already-authenticated visitors to the workspace before this renders.
 */
export default function LoginPage() {
  return <LoginForm />;
}
