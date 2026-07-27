'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

import Icon from '@/components/common/Icon';

/**
 * Custom 404 page — a plain green icon with a message and a link home.
 */
export default function NotFound() {
  return (
    <main className='flex min-h-screen items-center justify-center px-4'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className='flex w-full max-w-sm flex-col items-center text-center'>
        <Icon icon='ExclamationTriangle' type='solid' className='mb-4 h-8 w-8 text-green-600' />
        <h1 className='text-lg font-semibold'>Page not found</h1>
        <p className='mt-1 text-sm text-zinc-600 dark:text-zinc-400'>
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href='/'
          className='mt-6 inline-flex items-center gap-x-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-700'>
          Back to home
        </Link>
      </motion.div>
    </main>
  );
}
