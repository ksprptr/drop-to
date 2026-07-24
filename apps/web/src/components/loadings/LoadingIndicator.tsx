import { LoaderCircle } from 'lucide-react';

/**
 * Component rendering a small inline loading spinner.
 */
export default function LoadingIndicator({ className = 'h-4 w-4' }: { className?: string }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden />;
}
