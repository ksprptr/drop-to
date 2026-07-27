'use client';

import type { ReactNode } from 'react';

import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Modal from '@/components/common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  tone?: 'danger' | 'warning';
}

const TONE = {
  danger: { badge: 'bg-red-500/10 text-red-500', confirm: 'danger' as const },
  warning: { badge: 'bg-amber-500/10 text-amber-500', confirm: 'primary' as const },
};

/**
 * Shared confirm modal: warning/danger badge, a message and a Cancel/confirm pair.
 **/
export default function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  loading = false,
  tone = 'danger',
}: Props) {
  const styles = TONE[tone];

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className='flex flex-col gap-y-5'>
        <div className='flex gap-x-3'>
          <div
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.badge}`}>
            <Icon icon='ExclamationTriangle' className='h-5 w-5' />
          </div>
          <p className='text-sm text-zinc-600 dark:text-zinc-400'>{message}</p>
        </div>
        <div className='flex justify-end gap-x-2'>
          <Button variant='transparent' onClick={onClose}>
            Cancel
          </Button>
          <Button variant={styles.confirm} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
