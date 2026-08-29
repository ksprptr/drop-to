'use client';

import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Modal from '@/components/common/Modal';

interface Props {
  open: boolean;
  onDismiss: () => void;
}

/**
 * First-visit explanation of the swipe-open menu — there is no hamburger to discover.
 **/
export default function MenuHintModal({ open, onDismiss }: Props) {
  return (
    <Modal open={open} onClose={onDismiss} maxWidth='max-w-sm'>
      <div className='flex flex-col items-center text-center'>
        <span className='inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600/10 text-green-600'>
          <Icon icon='ArrowsRightLeft' className='h-6 w-6' />
        </span>

        <h2 className='mt-4 text-base font-semibold'>The menu is a swipe away</h2>

        <p className='mt-2 text-sm text-zinc-600 dark:text-zinc-400'>
          Swipe right anywhere on the page to open your storage menu, then pick what you need. Swipe
          left or tap outside to close it again.
        </p>

        <Button variant='primary' fullWidth onClick={onDismiss} className='mt-6'>
          Got it
        </Button>
      </div>
    </Modal>
  );
}
