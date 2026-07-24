'use client';

import type { Crumb } from '@/common/types/workspace.types';
import Icon from '@/components/common/Icon';

interface Props {
  crumbs: Crumb[];
  /** Label of the browse root (the active storage name, e.g. "Google Drive"). */
  rootLabel: string;
  /** Heroicon name for the browse root. */
  rootIcon: string;
  onNavigate: (index: number) => void;
}

/**
 * Breadcrumb trail for the current folder path. The first crumb is the active
 * storage (e.g. Google Drive → folder → subfolder).
 */
export default function Breadcrumb({ crumbs, rootLabel, rootIcon, onNavigate }: Props) {
  return (
    <nav className='flex min-w-0 items-center gap-x-1 text-sm'>
      <button
        type='button'
        onClick={() => onNavigate(-1)}
        className={`hover:text-green-600 flex shrink-0 items-center gap-x-1 ${
          crumbs.length === 0
            ? 'text-zinc-950 dark:text-zinc-50 font-medium'
            : 'text-zinc-600 dark:text-zinc-400'
        }`}>
        <Icon icon={rootIcon} className='h-4 w-4' />
        {rootLabel}
      </button>

      {crumbs.map((crumb, index) => (
        <span key={crumb.id} className='flex min-w-0 items-center gap-x-1'>
          <Icon
            icon='ChevronRight'
            className='text-zinc-600 dark:text-zinc-400 h-3.5 w-3.5 shrink-0'
          />
          <button
            type='button'
            onClick={() => onNavigate(index)}
            className={`hover:text-green-600 truncate ${
              index === crumbs.length - 1
                ? 'text-zinc-950 dark:text-zinc-50 font-medium'
                : 'text-zinc-600 dark:text-zinc-400'
            }`}>
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
