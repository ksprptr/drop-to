import Link from 'next/link';

/**
 * 404 body for the not-found route.
 **/
// Deliberately static: an error page must not depend on JS having run to become visible.
export default function NotFoundContent() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center'>
      <p className='text-primary-600 text-sm font-semibold tracking-widest uppercase'>Error 404</p>
      <h1 className='text-2xl font-bold'>Page not found</h1>
      <p className='max-w-md text-zinc-600 dark:text-zinc-400'>
        This page does not exist — but your storage is one click away.
      </p>
      <Link
        href='/'
        className='bg-primary-600 hover:bg-primary-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out'>
        Back to the workspace
      </Link>
    </main>
  );
}
