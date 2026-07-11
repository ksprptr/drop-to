'use client';

import type { ExtendedProps } from '@/common/types/global.types';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';

interface Props extends ExtendedProps {
  type?: 'button' | 'submit' | 'reset';
  variant?: 'normal' | 'primary' | 'secondary' | 'danger' | 'soft-danger' | 'transparent';
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  loading?: boolean;
  title?: string;
}

/**
 * Shared button with primary/secondary/danger/transparent variants.
 */
export default function Button({
  type = 'button',
  variant = 'normal',
  disabled = false,
  fullWidth = false,
  onClick,
  loading,
  title,
  children,
  className,
}: Props) {
  const variants: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-green-600 hover:bg-green-700 disabled:bg-green-600 text-white',
    secondary:
      'bg-green-600/10 hover:bg-green-600/20 text-green-700 dark:bg-green-600/20 dark:hover:bg-green-600/30 dark:text-green-400',
    danger: 'bg-red-500/90 hover:bg-red-500 text-white',
    'soft-danger': 'bg-red-500/10 hover:bg-red-500/20 text-red-500',
    transparent:
      'bg-transparent hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-950 dark:text-zinc-50',
    normal:
      'bg-zinc-50 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-950 dark:text-zinc-50',
  };

  return (
    <button
      {...(onClick ? { onClick } : {})}
      {...(title ? { title } : {})}
      disabled={disabled || loading}
      type={type}
      className={`inline-flex items-center justify-center gap-x-2 rounded-lg px-4 py-2 text-sm font-medium duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className ?? ''}`}>
      {loading && <LoadingIndicator />}
      {children}
    </button>
  );
}
