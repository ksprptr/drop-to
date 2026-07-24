'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck } from 'lucide-react';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type ToastVariant = 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

/**
 * Component providing a minimal toast notification system.
 *
 * Exposes `success`/`error` helpers via context; toasts auto-dismiss after a
 * few seconds and stack in the bottom-right corner.
 */
export default function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className='pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:right-4 sm:left-auto sm:items-end'>
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.button
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={() => dismiss(toast.id)}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-sm shadow-lg ${
                toast.variant === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
              }`}>
              {toast.variant === 'success' ? (
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
 * Hook to access the toast helpers.
 * @returns The toast context value
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }

  return context;
}
