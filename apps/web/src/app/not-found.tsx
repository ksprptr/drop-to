'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

import Icon from '@/components/common/Icon';

/**
 * Custom 404 page — mirrors the login's green icon badge, without a card.
 */
export default function NotFound() {
  return (
    <main className='flex min-h-screen items-center justify-center px-4'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className='flex w-full max-w-sm flex-col items-center text-center'>
        <div className='bg-green-600 mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm'>
          <Icon icon='ExclamationTriangle' className='h-6 w-6' type='solid' />
        </div>
        <h1 className='text-lg font-semibold'>Page not found</h1>
        <p className='text-zinc-600 dark:text-zinc-400 mt-1 text-sm'>
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href='/'
          className='bg-green-600 hover:bg-green-700 mt-6 inline-flex items-center gap-x-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition'>
          Back to home
        </Link>
      </motion.div>
    </main>
  );
}
