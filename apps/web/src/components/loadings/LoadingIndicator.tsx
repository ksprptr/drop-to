import { ArrowPathIcon } from '@heroicons/react/24/outline';

/**
 * Component rendering a small inline loading spinner.
 */
export default function LoadingIndicator({ className = 'h-4 w-4' }: { className?: string }) {
  return <ArrowPathIcon className={`animate-spin ${className}`} aria-hidden />;
}
