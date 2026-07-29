'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, useState } from 'react';

import { login } from '@/actions/auth/auth.actions';
import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';
import { useToast } from '@/components/providers/ToastProvider';

/**
 * Login screen — posts credentials via the `login` action, then navigates to `/`.
 **/
export default function LoginForm() {
  const router = useRouter();
  const toast = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Submit explicitly on Enter — some password managers swallow the implicit submit.
  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (submitting || !username.trim() || !password) {
      return;
    }

    setSubmitting(true);
    const result = await login(username.trim(), password);
    if (result.ok) {
      router.replace('/');
      router.refresh();
      return;
    }
    toast.error(result.error ?? 'Invalid username or password.');
    setSubmitting(false);
  };

  return (
    <main className='flex min-h-screen items-center justify-center px-4'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className='w-full max-w-sm rounded-2xl border border-zinc-300 bg-zinc-50 p-8 shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
        <div className='mb-6 flex flex-col items-center text-center'>
          <div className='mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm'>
            <Icon icon='CloudArrowUp' className='h-6 w-6' />
          </div>
          <h1 className='text-lg font-semibold'>DropTo</h1>
          <p className='mt-1 text-sm text-zinc-600 dark:text-zinc-400'>Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDownCapture={handleKeyDown}
          className='flex flex-col gap-y-4'>
          <Input
            name='username'
            label='Username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete='username'
            autoFocus
          />
          <Input
            name='password'
            type='password'
            label='Password'
            placeholder='••••••••'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete='current-password'
          />
          <Button
            type='submit'
            variant='primary'
            fullWidth
            loading={submitting}
            disabled={!username.trim() || !password}
            className='mt-1'>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </motion.div>
    </main>
  );
}
