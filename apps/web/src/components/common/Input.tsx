'use client';

import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * Shared text input with an optional label and error message.
 */
export default function Input({ label, error, className, id, ...props }: Props) {
  const inputId = id ?? props.name;

  return (
    <div className='flex flex-col gap-y-1.5'>
      {label && (
        <label htmlFor={inputId} className='text-sm font-medium text-zinc-950 dark:text-zinc-50'>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-950 transition outline-none placeholder:text-zinc-600 focus:border-green-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-400 ${error ? 'border-red-500' : ''} ${className ?? ''}`}
        {...props}
      />
      {error && <p className='text-xs text-red-500'>{error}</p>}
    </div>
  );
}
