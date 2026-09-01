'use client';

import { type DragEvent, type KeyboardEvent, memo, type MouseEvent } from 'react';

import type { ViewEntry } from '@/common/types/workspace.types';
import { fileIcon } from '@/common/utils/drop-items.functions';
import { formatBytes, formatDate } from '@/common/utils/format.functions';
import Icon from '@/components/common/Icon';

interface Props {
  entry: ViewEntry;
  /** Single-selected (the one shown in the preview panel). */
  selected: boolean;
  /** Part of the multi-selection. */
  checked: boolean;
  /** A move is hovering this folder row. */
  isDropTarget: boolean;
  /** This row's action menu is open. */
  menuOpen: boolean;
  canModify: boolean;
  /** Whether the row shows the action menu button at all. */
  showMenu: boolean;
  /** The grid template shared with the header, so columns line up. */
  gridCols: string;
  onDragStart: (event: DragEvent<HTMLDivElement>, entry: ViewEntry) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, entry: ViewEntry) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>, entry: ViewEntry) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, entry: ViewEntry) => void;
  onClick: (event: MouseEvent<HTMLDivElement>, entry: ViewEntry) => void;
  onDoubleClick: (entry: ViewEntry) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, entry: ViewEntry) => void;
  onToggleCheck: (entry: ViewEntry) => void;
  onOpenMenu: (event: MouseEvent<HTMLButtonElement>, entry: ViewEntry) => void;
}

/**
 * One row of the file list: icon, name, modified date, size and the action menu.
 **/
// Memoized: every prop is a scalar or a browser-stable callback, so selecting a row re-renders only that row.
function FileRow({
  entry,
  selected,
  checked,
  isDropTarget,
  menuOpen,
  canModify,
  showMenu,
  gridCols,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onDoubleClick,
  onKeyDown,
  onToggleCheck,
  onOpenMenu,
}: Props) {
  return (
    <li>
      <div
        role='button'
        tabIndex={0}
        draggable={canModify}
        onDragStart={(event) => onDragStart(event, entry)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOver(event, entry)}
        onDragLeave={(event) => onDragLeave(event, entry)}
        onDrop={(event) => onDrop(event, entry)}
        onClick={(event) => onClick(event, entry)}
        onDoubleClick={() => onDoubleClick(entry)}
        onKeyDown={(event) => onKeyDown(event, entry)}
        className={`grid ${gridCols} w-full cursor-pointer items-center gap-x-3 rounded-lg px-3 py-2 text-left transition ${
          isDropTarget
            ? 'bg-green-600/15 ring-2 ring-green-600 ring-inset'
            : checked || selected
              ? 'bg-green-600/10'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
        }`}>
        {canModify && (
          // Wrapper keeps the grid cell aligned on desktop; the checkbox shows only on mobile.
          <span className='flex h-4 w-4 items-center justify-center'>
            <input
              type='checkbox'
              checked={checked}
              onClick={(event) => event.stopPropagation()}
              onChange={() => onToggleCheck(entry)}
              className='hidden h-4 w-4 max-sm:block'
            />
            {/* Desktop: a check indicator (no checkbox) for selected rows. */}
            {checked && <Icon icon='Check' className='hidden h-4 w-4 text-green-600 sm:block' />}
          </span>
        )}
        <span className='flex min-w-0 items-center gap-x-2.5'>
          {entry.isFolder ? (
            <Icon icon='Folder' className='h-5 w-5 shrink-0 text-green-600' />
          ) : (
            <Icon
              icon={fileIcon(entry.mimeType)}
              className='h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-400'
            />
          )}
          <span className='min-w-0 truncate text-sm font-medium'>{entry.name}</span>
        </span>
        <span className='hidden text-xs text-zinc-600 sm:block dark:text-zinc-400'>
          {formatDate(entry.modifiedTime)}
        </span>
        <span className='text-right text-xs text-zinc-600 dark:text-zinc-400'>
          {entry.isFolder ? '—' : formatBytes(entry.size)}
        </span>
        {showMenu && (
          <div className='flex justify-end'>
            <button
              type='button'
              title='Actions'
              onClick={(event) => onOpenMenu(event, entry)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-50 ${
                menuOpen ? 'bg-zinc-300 dark:bg-zinc-700' : ''
              }`}>
              <Icon icon='EllipsisVertical' className='h-4 w-4' />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default memo(FileRow);
