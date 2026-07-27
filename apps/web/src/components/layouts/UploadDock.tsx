'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import type { UploadBatch, UploadTask } from '@/common/types/workspace.types';
import { formatEta } from '@/common/utils/format.functions';
import Icon from '@/components/common/Icon';
import { useUploadActions, useUploadState } from '@/components/providers/UploadProvider';

const statusLabel = (task: UploadTask): string => {
  switch (task.status) {
    case 'error':
      return 'Failed';
    case 'done':
      return 'Done';
    case 'processing':
      return 'Processing…';
    case 'canceled':
      return 'Cancelled';
    case 'pending':
      return 'Queued';
    default:
      return `${task.percent}%`;
  }
};

const statusColor = (task: UploadTask): string => {
  switch (task.status) {
    case 'error':
    case 'canceled':
      return 'text-red-500';
    case 'done':
      return 'text-emerald-500';
    default:
      return 'text-zinc-600 dark:text-zinc-400';
  }
};

/**
 * Indeterminate progress bar (streaming / preparing).
 **/
function IndeterminateBar() {
  return (
    <div className='h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-900'>
      <motion.div
        className='h-full w-1/3 rounded-full bg-green-600'
        animate={{ x: ['-100%', '300%'] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/**
 * Per-task progress bar.
 **/
function ProgressBar({ task }: { task: UploadTask }) {
  if (task.status === 'processing') {
    return <IndeterminateBar />;
  }

  return (
    <div className='h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-900'>
      {task.status === 'done' ? (
        <div className='h-full w-full rounded-full bg-green-600' />
      ) : task.status === 'canceled' ? (
        <div className='h-full w-full rounded-full bg-red-500' />
      ) : (
        <motion.div
          className={`h-full rounded-full ${task.status === 'error' ? 'bg-red-500' : 'bg-green-600'}`}
          initial={false}
          animate={{ width: `${task.percent}%` }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        />
      )}
    </div>
  );
}

function TaskRow({ task }: { task: UploadTask }) {
  return (
    <div className='flex flex-col gap-y-1'>
      <div className='flex items-center justify-between gap-x-2'>
        <span className='truncate text-xs font-medium'>{task.name}</span>
        <span className={`shrink-0 text-[10px] font-semibold ${statusColor(task)}`}>
          {statusLabel(task)}
        </span>
      </div>
      <ProgressBar task={task} />
    </div>
  );
}

/**
 * Card for one upload batch.
 **/
function BatchCard({ batch, onCancel }: { batch: UploadBatch; onCancel: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const total = batch.tasks.length;
  const done = batch.tasks.filter((task) => task.status === 'done').length;
  const inFlight = batch.tasks.filter(
    (task) => task.status === 'pending' || task.status === 'uploading' || task.status === 'processing',
  );
  const remainingBytes = inFlight.reduce((sum, task) => sum + task.size * (1 - task.percent / 100), 0);
  const rate = batch.tasks.reduce((max, task) => Math.max(max, task.rate ?? 0), 0);
  const eta = rate > 0 ? formatEta(remainingBytes / rate) : '';

  const single = total === 1 && batch.kind !== 'folder';
  const many = total > 4;
  const showList = !many || expanded;

  const title = `${batch.status === 'done' ? 'Uploaded' : 'Uploading'} ${
    batch.kind === 'folder' ? `folder “${batch.folderName}”` : `${total} file${total === 1 ? '' : 's'}`
  }`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className='pointer-events-auto rounded-xl border border-zinc-300 bg-zinc-50 p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800'>
      {single ? (
        <div className='flex flex-col gap-y-1'>
          <div className='flex items-center justify-between gap-x-2'>
            <span className='truncate text-xs font-medium'>{batch.tasks[0].name}</span>
            <div className='flex shrink-0 items-center gap-x-1'>
              <span className={`text-[10px] font-semibold ${statusColor(batch.tasks[0])}`}>
                {statusLabel(batch.tasks[0])}
              </span>
              {batch.status === 'uploading' && (
                <button
                  type='button'
                  onClick={() => onCancel(batch.id)}
                  title='Cancel upload'
                  className='inline-flex h-5 w-5 items-center justify-center rounded text-zinc-600 transition hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-400'>
                  <Icon icon='XMark' className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </div>
          <ProgressBar task={batch.tasks[0]} />
          {eta && <p className='mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-400'>~ {eta}</p>}
        </div>
      ) : (
        <>
          <div className='flex items-center justify-between gap-x-2'>
            <div className='min-w-0'>
              <p className='truncate text-xs font-semibold'>{title}</p>
              {batch.status === 'uploading' && (
                <p className='text-[10px] text-zinc-600 dark:text-zinc-400'>
                  {batch.kind === 'folder' ? `${total} file${total === 1 ? '' : 's'} · ` : ''}
                  {done} of {total} done{eta ? ` · ~ ${eta}` : ''}
                </p>
              )}
            </div>
            <div className='flex shrink-0 items-center gap-x-0.5'>
              {batch.status === 'uploading' && (
                <button
                  type='button'
                  onClick={() => onCancel(batch.id)}
                  title='Cancel upload'
                  className='inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-400'>
                  <Icon icon='XMark' className='h-4 w-4' />
                </button>
              )}
              {many && (
                <button
                  type='button'
                  onClick={() => setExpanded((value) => !value)}
                  title={expanded ? 'Collapse' : 'Expand'}
                  className='inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-900'>
                  <Icon icon={expanded ? 'ChevronDown' : 'ChevronUp'} className='h-4 w-4' />
                </button>
              )}
            </div>
          </div>

          {showList && (
            <div className='mt-3 flex max-h-64 flex-col gap-y-3 overflow-y-auto pr-1'>
              {batch.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

/**
 * Floating dock showing upload batches (ETA, per-file bars, cancel) and downloads.
 **/
export default function UploadDock() {
  const { batches, downloads } = useUploadState();
  const { cancelBatch: onCancelBatch } = useUploadActions();
  const hasActive = batches.some((batch) => batch.status === 'uploading');

  return (
    <div className='pointer-events-none fixed right-4 bottom-4 z-40 flex w-72 flex-col gap-2'>
      <AnimatePresence initial={false}>
        {hasActive && (
          <motion.div
            key='upload-warning'
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className='pointer-events-auto flex items-start gap-x-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-amber-800 shadow-lg dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'>
            <Icon icon='ExclamationTriangle' type='solid' className='mt-px h-4 w-4 shrink-0' />
            <span className='text-[11px] leading-snug font-medium'>
              Upload in progress — don&apos;t refresh or close the page, it will cancel the upload.
            </span>
          </motion.div>
        )}

        {downloads.map((download) => (
          <motion.div
            key={download.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className='pointer-events-auto rounded-xl border border-zinc-300 bg-zinc-50 p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800'>
            <div className='mb-2 flex items-center justify-between gap-x-2'>
              <span className='truncate text-xs font-medium'>{download.name}</span>
              <span className='shrink-0 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400'>
                Preparing…
              </span>
            </div>
            <IndeterminateBar />
          </motion.div>
        ))}

        {batches.map((batch) => (
          <BatchCard key={batch.id} batch={batch} onCancel={onCancelBatch} />
        ))}
      </AnimatePresence>
    </div>
  );
}
