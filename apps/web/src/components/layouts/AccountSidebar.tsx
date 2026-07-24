'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import type { ReactNode } from 'react';

import { getGoogleAuthUrl } from '@/common/services/api/auth.api';
import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import ThemeToggle from '@/components/common/ThemeToggle';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';
import { STORAGE_ICON } from '@/configs/storage.config';

interface Props {
  statuses: StorageStatus[];
  driveStatus: StorageStatus | null;
  activeBackend: StorageBackend | null;
  loading: boolean;
  username: string;
  saving: boolean;
  onSelectStorage: (backend: StorageBackend) => void;
  onManageFolders: () => void;
  onDisconnect: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

/**
 * A small uppercase section label.
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className='mb-2 px-1 text-[10px] font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-400'>
      {children}
    </p>
  );
}

/**
 * The left pane: the Google account category (connect / pick folders / disconnect),
 * the S3 storage category (status from the API), a switcher to choose which storage
 * to browse, and the session footer.
 */
export default function AccountSidebar({
  statuses,
  driveStatus,
  activeBackend,
  loading,
  username,
  saving,
  onSelectStorage,
  onManageFolders,
  onDisconnect,
  onLogout,
  loggingOut,
}: Props) {
  const s3Status = statuses.find((status) => status.backend === 's3') ?? null;
  const connectedStorages = statuses.filter((status) => status.connected);

  return (
    <aside className='hidden w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-50 md:flex dark:border-zinc-700 dark:bg-zinc-800'>
      {/* Brand */}
      <div className='flex h-16 shrink-0 items-center gap-x-2.5 border-b border-zinc-300 px-5 dark:border-zinc-700'>
        <div className='inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white'>
          <Icon icon='CloudArrowUp' type='solid' className='h-5 w-5' />
        </div>
        <div className='leading-tight'>
          <p className='text-sm font-semibold'>DropTo</p>
          <p className='text-[10px] tracking-wider text-zinc-600 uppercase dark:text-zinc-400'>
            Storage workspace
          </p>
        </div>
      </div>

      {/* Categories + storage switcher */}
      <div className='flex min-h-0 flex-1 flex-col gap-y-5 overflow-y-auto p-4'>
        {/* Google account */}
        <div>
          <SectionLabel>Google account</SectionLabel>

          {loading ? (
            <div className='flex items-center gap-x-2 px-1 py-2 text-sm text-zinc-600 dark:text-zinc-400'>
              <LoadingIndicator />
              Loading…
            </div>
          ) : !driveStatus?.connected ? (
            <div className='flex flex-col gap-y-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900'>
              <p
                className={`text-xs ${
                  driveStatus?.error
                    ? 'font-medium text-amber-600 dark:text-amber-500'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}>
                {driveStatus?.error ??
                  'No account connected. Connect a Google account to pick folders and upload.'}
              </p>
              <a
                href={getGoogleAuthUrl()}
                className='inline-flex items-center justify-center gap-x-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-700'>
                <Icon icon='LinkIcon' className='h-4 w-4' />
                {driveStatus?.error ? 'Reconnect Drive' : 'Connect Drive'}
              </a>
            </div>
          ) : (
            <div className='flex flex-col gap-y-3'>
              <div className='flex items-center gap-x-2 rounded-xl bg-zinc-100 p-2.5 dark:bg-zinc-900'>
                <div className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600/15 text-green-600'>
                  <Icon icon='CheckBadge' type='solid' className='h-5 w-5' />
                </div>
                <div className='min-w-0 leading-tight'>
                  <p className='truncate text-xs font-medium'>{driveStatus.email}</p>
                  <p className='text-[10px] text-zinc-600 dark:text-zinc-400'>Connected</p>
                </div>
              </div>

              <div className='flex flex-col gap-y-2'>
                <Button variant='secondary' fullWidth onClick={onManageFolders} loading={saving}>
                  <Icon icon='FolderPlus' className='h-4 w-4' />
                  Manage folders
                </Button>
                <Button variant='soft-danger' fullWidth onClick={onDisconnect}>
                  <Icon icon='ArrowRightStartOnRectangle' className='h-4 w-4' />
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* S3 storage */}
        <div>
          <SectionLabel>S3 storage</SectionLabel>

          {loading ? (
            <div className='flex items-center gap-x-2 px-1 py-2 text-sm text-zinc-600 dark:text-zinc-400'>
              <LoadingIndicator />
              Loading…
            </div>
          ) : !s3Status?.connected ? (
            <div className='flex flex-col gap-y-1.5 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900'>
              <p
                className={`text-xs font-medium ${
                  s3Status?.error
                    ? 'text-amber-600 dark:text-amber-500'
                    : 'text-zinc-950 dark:text-zinc-50'
                }`}>
                {s3Status?.error ? 'S3 storage unavailable' : 'No S3 storage connected'}
              </p>
              <p className='text-[11px] text-zinc-600 dark:text-zinc-400'>
                {s3Status?.error ??
                  'Enable and configure S3 in the API environment to browse buckets.'}
              </p>
            </div>
          ) : (
            <div className='flex items-center gap-x-2 rounded-xl bg-zinc-100 p-2.5 dark:bg-zinc-900'>
              <div className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600/15 text-green-600'>
                <Icon icon='CircleStack' type='solid' className='h-5 w-5' />
              </div>
              <div className='min-w-0 leading-tight'>
                <p className='truncate text-xs font-medium'>
                  {s3Status.roots.length} bucket{s3Status.roots.length === 1 ? '' : 's'}
                </p>
                <p className='text-[10px] text-zinc-600 dark:text-zinc-400'>Connected</p>
              </div>
            </div>
          )}
        </div>

        {/* Storage switcher */}
        {!loading && connectedStorages.length > 0 && (
          <div className='min-h-0'>
            <SectionLabel>Browse</SectionLabel>
            <nav className='flex flex-col gap-y-0.5'>
              {connectedStorages.map((storage) => {
                const active = storage.backend === activeBackend;
                return (
                  <button
                    key={storage.backend}
                    type='button'
                    onClick={() => onSelectStorage(storage.backend)}
                    className={`flex items-center gap-x-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      active
                        ? 'bg-green-600/10 text-green-600 dark:bg-green-600/15'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'
                    }`}>
                    <Icon icon={STORAGE_ICON[storage.backend]} className='h-4 w-4 shrink-0' />
                    <span className='truncate'>{storage.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className='flex items-center justify-between gap-x-2 border-t border-zinc-300 p-3 dark:border-zinc-700'>
        <div className='flex min-w-0 items-center gap-x-2'>
          <div className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600/15 text-xs font-semibold text-green-600 uppercase'>
            {username.slice(0, 1)}
          </div>
          <span className='truncate text-xs font-medium'>{username}</span>
        </div>
        <div className='flex shrink-0 items-center gap-x-1'>
          <ThemeToggle />
          <button
            type='button'
            onClick={onLogout}
            disabled={loggingOut}
            title='Sign out'
            className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-500/10 disabled:opacity-50'>
            {loggingOut ? (
              <LoadingIndicator />
            ) : (
              <Icon icon='ArrowRightStartOnRectangle' className='h-4 w-4' />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
