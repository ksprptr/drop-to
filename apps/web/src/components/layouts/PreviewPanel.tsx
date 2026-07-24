'use client';

import type { StorageBackend } from '@dropto/types';
import { useState } from 'react';

import { fileDownloadUrl } from '@/common/services/api/storage.api';
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
}

/**
 * A single metadata row in the details panel.
 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-x-3'>
      <span className='shrink-0 text-xs text-zinc-600 dark:text-zinc-400'>{label}</span>
      <span className='min-w-0 text-right text-xs font-medium wrap-break-word'>{value}</span>
    </div>
  );
}

/**
 * The right pane: preview and metadata of the selected file or folder, with
 * download (file / folder-as-ZIP) and delete actions.
 */
export default function PreviewPanel({
  entry,
  isRoot,
  backend,
  onClose,
  onDelete,
  onDownload,
  onRename,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);

  const isImage = !!entry && !entry.isFolder && !!entry.mimeType?.startsWith('image/');
  // Images preview via the download endpoint (cookie-authenticated, same-site).
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

      {!entry ? (
        <div className='flex flex-1 flex-col items-center justify-center px-6 text-center text-zinc-600 dark:text-zinc-400'>
          <Icon icon='CursorArrowRays' className='mb-3 h-8 w-8 opacity-40' />
          <p className='text-sm'>Select an item to see its preview and details.</p>
        </div>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col overflow-y-auto p-5'>
          {/* Preview */}
          <div className='flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900'>
            {isImage && !imageFailed ? (
              <img
                src={imageUrl}
                alt={entry.name}
                onError={() => setImageFailed(true)}
                className='h-full w-full object-contain'
              />
            ) : (
              <Icon
                icon={entry.isFolder ? 'Folder' : 'Document'}
                type={entry.isFolder ? 'solid' : 'outlined'}
                className={`h-16 w-16 ${entry.isFolder ? 'text-green-600' : 'text-zinc-600 dark:text-zinc-400'}`}
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
            <Button variant='primary' fullWidth onClick={() => onDownload(entry)}>
              <Icon icon='ArrowDownTray' className='h-4 w-4' />
              {entry.isFolder ? 'Download as ZIP' : 'Download'}
            </Button>
            {entry.webViewLink && !entry.isFolder && (
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
              <Button variant='normal' fullWidth onClick={() => onRename(entry)}>
                <Icon icon='Pencil' className='h-4 w-4' />
                Rename
              </Button>
            )}
            {!isRoot && (
              <Button variant='danger' fullWidth onClick={() => onDelete(entry)}>
                <Icon icon='Trash' className='h-4 w-4' />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
