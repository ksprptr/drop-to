'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { getMe, login } from '@/common/services/api/auth.api';
import { extractApiErrorMessage } from '@/common/utils/error.functions';
import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';
import { useToast } from '@/components/providers/ToastProvider';

/**
 * Component driving the login screen: posts the operator credentials and, on
 * success, redirects to the workspace.
 */
export default function LoginForm() {
  const router = useRouter();
  const toast = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Already-authenticated visitors are sent straight to the workspace.
  useEffect(() => {
    let active = true;

    getMe()
      .then(() => router.replace('/'))
      .catch(() => {
        if (active) {
          setCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (submitting || !username.trim() || !password) {
      return;
    }

    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
      router.replace('/');
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <main className='flex min-h-screen items-center justify-center'>
        <LoadingIndicator className='h-6 w-6' />
      </main>
    );
  }

  return (
    <main className='flex min-h-screen items-center justify-center px-4'>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className='w-full max-w-sm rounded-2xl border border-zinc-300 bg-zinc-50 p-8 shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
        <div className='mb-6 flex flex-col items-center text-center'>
          <div className='mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm'>
            <Icon icon='CloudArrowUp' className='h-6 w-6' type='solid' />
          </div>
          <h1 className='text-lg font-semibold'>DropTo</h1>
          <p className='mt-1 text-sm text-zinc-600 dark:text-zinc-400'>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className='flex flex-col gap-y-4'>
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
