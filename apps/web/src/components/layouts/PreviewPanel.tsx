'use client';

import type { StorageBackend } from '@dropto/types';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { fileDownloadUrl } from '@/common/services/api/storage.client';
import type { ViewEntry } from '@/common/types/workspace.types';
import { formatBytes, formatDateTime } from '@/common/utils/format.functions';
import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';

interface Props {
  entry: ViewEntry | null;
  isRoot: boolean;
  backend: StorageBackend | null;
  onClose: () => void;
  onDelete: (entry: ViewEntry) => void;
  onDownload: (entry: ViewEntry) => void;
  onRename: (entry: ViewEntry) => void;
  onCopyLink: (entry: ViewEntry) => void;
  onCopyPublicLink: (entry: ViewEntry) => void;
  onRemovePublicLink: (entry: ViewEntry) => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-x-3'>
      <span className='shrink-0 text-xs text-zinc-600 dark:text-zinc-400'>{label}</span>
      <span className='min-w-0 text-right text-xs font-medium wrap-break-word'>{value}</span>
    </div>
  );
}

/**
 * Right pane: preview + metadata of the selected item, with download/rename/delete.
 **/
export default function PreviewPanel({
  entry,
  isRoot,
  backend,
  onClose,
  onDelete,
  onDownload,
  onRename,
  onCopyLink,
  onCopyPublicLink,
  onRemovePublicLink,
}: Props) {
  // Per-entry image-failure, so switching items retries fresh.
  const [failedId, setFailedId] = useState<string | null>(null);

  const isImage = !!entry && !entry.isFolder && !!entry.mimeType?.startsWith('image/');
  const imageFailed = !!entry && failedId === entry.id;
  const imageUrl = entry && !entry.isFolder && backend ? fileDownloadUrl(backend, entry.id) : '';

  return (
    <aside className='hidden w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-50 lg:flex dark:border-zinc-700 dark:bg-zinc-800'>
      <header className='flex h-16 shrink-0 items-center justify-between border-b border-zinc-300 px-5 dark:border-zinc-700'>
        <h2 className='text-sm font-semibold'>Details</h2>
        {entry && (
          <button
            type='button'
            onClick={onClose}
            className='rounded-md p-1 text-zinc-600 transition hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'>
            <Icon icon='XMark' className='h-4 w-4' />
          </button>
        )}
      </header>

      <AnimatePresence mode='wait' initial={false}>
        {!entry ? (
          <motion.div
            key='empty'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className='flex flex-1 flex-col items-center justify-center px-6 text-center text-zinc-600 dark:text-zinc-400'>
            <Icon icon='CursorArrowRays' className='mb-3 h-8 w-8 opacity-40' />
            <p className='text-sm'>Select an item to see its preview and details.</p>
          </motion.div>
        ) : (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className='flex min-h-0 flex-1 flex-col overflow-y-auto p-5'>
            <div className='flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900'>
              {isImage && !imageFailed ? (
                <img
                  src={imageUrl}
                  alt={entry.name}
                  onError={() => setFailedId(entry.id)}
                  className='h-full w-full object-contain'
                />
              ) : (
                <Icon
                  icon={entry.isFolder ? 'Folder' : 'Document'}
                  className={`h-16 w-16 ${entry.isFolder ? 'text-primary-600' : 'text-zinc-600 dark:text-zinc-400'}`}
                />
              )}
            </div>

            <h3 className='mt-4 text-sm font-semibold wrap-break-word'>{entry.name}</h3>

            <div className='mt-4 flex flex-col gap-y-2.5 border-t border-zinc-300 pt-4 dark:border-zinc-700'>
              <DetailRow
                label='Type'
                value={entry.isFolder ? 'Folder' : (entry.mimeType ?? 'File')}
              />
              {!entry.isFolder && <DetailRow label='Size' value={formatBytes(entry.size)} />}
              <DetailRow label='Modified' value={formatDateTime(entry.modifiedTime)} />
            </div>

            <div className='mt-6 flex flex-col gap-y-2'>
              {/* Root folders (storage roots) can't be downloaded as a ZIP. */}
              {!isRoot && (
                <Button variant='primary' fullWidth onClick={() => onDownload(entry)}>
                  <Icon icon='ArrowDownTray' className='h-4 w-4' />
                  {entry.isFolder ? 'Download as ZIP' : 'Download'}
                </Button>
              )}
              {!isRoot && (
                <Button variant='normal' fullWidth onClick={() => onRename(entry)}>
                  <Icon icon='Pencil' className='h-4 w-4' />
                  Rename
                </Button>
              )}
              {/* Sharing state is spelled out rather than implied by a button label: the share and
                  unshare actions would otherwise sit in the same spot, and a click meant to check
                  whether a link is gone would silently mint a new one. */}
              {!isRoot && !entry.isFolder && (
                <div className='flex flex-col gap-y-2 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700'>
                  <div className='flex items-center gap-x-2'>
                    <Icon
                      icon={entry.publicUrl ? 'GlobeIcon' : 'LockClosed'}
                      className={`h-4 w-4 ${entry.publicUrl ? 'text-primary-600' : 'text-zinc-600 dark:text-zinc-400'}`}
                    />
                    <span className='text-xs font-semibold'>
                      {entry.publicUrl ? 'Shared publicly' : 'Not shared'}
                    </span>
                  </div>

                  {entry.publicUrl ? (
                    <>
                      <a
                        href={entry.publicUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='text-primary-600 text-xs wrap-break-word underline-offset-2 hover:underline'>
                        {entry.publicUrl}
                      </a>
                      <Button variant='normal' fullWidth onClick={() => onCopyPublicLink(entry)}>
                        <Icon icon='LinkIcon' className='h-4 w-4' />
                        Copy public link
                      </Button>
                      <Button variant='danger' fullWidth onClick={() => onRemovePublicLink(entry)}>
                        <Icon icon='LinkSlash' className='h-4 w-4' />
                        Stop sharing
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className='text-xs text-zinc-600 dark:text-zinc-400'>
                        Anyone with the link will be able to download this file.
                      </p>
                      <Button variant='normal' fullWidth onClick={() => onCopyPublicLink(entry)}>
                        <Icon icon='Share' className='h-4 w-4' />
                        Create public link
                      </Button>
                    </>
                  )}
                </div>
              )}
              {entry.webViewLink && (
                <Button variant='normal' fullWidth onClick={() => onCopyLink(entry)}>
                  <Icon icon='LinkIcon' className='h-4 w-4' />
                  Copy link
                </Button>
              )}
              {entry.webViewLink && (
                <a
                  href={entry.webViewLink}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center justify-center gap-x-2 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-medium transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-900'>
                  <Icon icon='ArrowTopRightOnSquare' className='h-4 w-4' />
                  Open in Drive
                </a>
              )}
              {!isRoot && (
                <Button variant='danger' fullWidth onClick={() => onDelete(entry)}>
                  <Icon icon='Trash' className='h-4 w-4' />
                  Delete
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
