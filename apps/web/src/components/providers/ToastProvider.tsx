'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import LoadingIndicator from '@/components/loadings/LoadingIndicator';

type ToastVariant = 'success' | 'error' | 'loading';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastUpdate {
  message?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  /** Shows a persistent spinner toast; returns its id to later `update`/`dismiss`. */
  loading: (message: string) => number;
  /** Updates a toast (e.g. a loading toast → success/error) and auto-dismisses it. */
  update: (id: number, next: ToastUpdate) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

/**
 * Minimal toast system; success/error auto-dismiss, `loading` stays until `update`d.
 **/
export default function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant, autoDismiss = true) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, message, variant }]);
      if (autoDismiss) {
        setTimeout(() => dismiss(id), 5000);
      }
      return id;
    },
    [dismiss],
  );

  const update = useCallback(
    (id: number, next: ToastUpdate) => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, ...next } : toast)),
      );
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => void push(message, 'success'),
      error: (message) => void push(message, 'error'),
      loading: (message) => push(message, 'loading', false),
      update,
      dismiss,
    }),
    [push, update, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className='pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-center gap-2 sm:right-4 sm:left-auto sm:items-end'>
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.button
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={() => dismiss(toast.id)}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-sm shadow-lg ${
                toast.variant === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200'
                  : toast.variant === 'error'
                    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
              }`}>
              {toast.variant === 'loading' ? (
                <LoadingIndicator className='mt-px h-4 w-4 shrink-0' />
              ) : toast.variant === 'success' ? (
                <CircleCheck className='h-5 w-5 shrink-0' />
              ) : (
                <CircleAlert className='h-5 w-5 shrink-0' />
              )}
              <span className='min-w-0'>{toast.message}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast helpers.
 **/
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }

  return context;
}
