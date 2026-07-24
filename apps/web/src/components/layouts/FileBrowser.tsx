'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Crumb, UploadItem, ViewEntry } from '@/common/types/workspace.types';
import { formatBytes, formatDate } from '@/common/utils/format.functions';
import Icon from '@/components/common/Icon';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';

import Breadcrumb from './Breadcrumb';

interface Props {
  path: Crumb[];
  /** Label of the browse root (the active storage name). */
  rootLabel: string;
  /** Heroicon name for the browse root. */
  rootIcon: string;
  entries: ViewEntry[];
  loading: boolean;
  selectedId: string | null;
  canUpload: boolean;
  /** Whether rows can be selected/renamed/deleted (false at the roots level). */
  canModify: boolean;
  /** Whether a storage backend is currently selected. */
  hasStorage: boolean;
  /** Ids currently checked for a bulk action. */
  selectedIds: Set<string>;
  onNavigate: (index: number) => void;
  onOpenFolder: (entry: ViewEntry) => void;
  onSelect: (entry: ViewEntry) => void;
  onUpload: (items: UploadItem[]) => void;
  onNewFolder: () => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onDownload: (entry: ViewEntry) => void;
  onRename: (entry: ViewEntry) => void;
  onDelete: (entry: ViewEntry) => void;
}

/** An open row-actions menu, anchored to the three-dot button's screen position. */
interface RowMenu {
  entry: ViewEntry;
  rect: DOMRect;
}

type SortKey = 'name' | 'modified' | 'size';
type SortDir = 'asc' | 'desc';

/**
 * Returns the Heroicon name for a file's MIME type.
 */
const fileIcon = (mimeType: string | null): string => {
  if (!mimeType) return 'Document';
  if (mimeType.startsWith('image/')) return 'Photo';
  if (mimeType.startsWith('video/')) return 'Film';
  if (mimeType.startsWith('audio/')) return 'MusicalNote';
  if (mimeType === 'application/pdf') return 'DocumentText';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'ArchiveBox';
  return 'Document';
};

/**
 * Reads all entries from a directory reader (it returns at most 100 per call).
 */
const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => reader.readEntries(resolve, reject));

/**
 * Resolves a file entry into a File.
 */
const entryToFile = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject));

/**
 * Recursively walks a dropped FileSystemEntry into flat upload items.
 */
const walkEntry = async (
  entry: FileSystemEntry,
  prefix: string,
  out: UploadItem[],
): Promise<void> => {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath: `${prefix}${entry.name}` });
    return;
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  let batch = await readAllEntries(reader);
  while (batch.length > 0) {
    for (const child of batch) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
    batch = await readAllEntries(reader);
  }
};

/**
 * Resolves dropped items (files and/or folders) into flat upload items, falling
 * back to the plain file list when the entry API is unavailable.
 */
const resolveDropItems = async (
  entries: FileSystemEntry[],
  flatFiles: File[],
): Promise<UploadItem[]> => {
  if (entries.length === 0) {
    return flatFiles.map((file) => ({ file, relativePath: file.name }));
  }

  const out: UploadItem[] = [];
  for (const entry of entries) {
    await walkEntry(entry, '', out);
  }
  return out;
};

/**
 * The middle pane: a Finder-like sortable list of folders and files. The whole
 * area is a drop target for uploads (files and folders) into the current folder.
 */
export default function FileBrowser({
  path,
  rootLabel,
  rootIcon,
  entries,
  loading,
  selectedId,
  canUpload,
  canModify,
  hasStorage,
  selectedIds,
  onNavigate,
  onOpenFolder,
  onSelect,
  onUpload,
  onNewFolder,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onDownload,
  onRename,
  onDelete,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [menu, setMenu] = useState<RowMenu | null>(null);

  // `webkitdirectory` has no typed React prop, so set it imperatively.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  // Close the row menu on any outside click, scroll, resize, or Escape.
  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;

    return [...entries].sort((a, b) => {
      // Folders always group before files, regardless of the column.
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }

      if (sortKey === 'size') {
        return ((a.size ?? -1) - (b.size ?? -1)) * dir;
      }
      if (sortKey === 'modified') {
        return (a.modifiedTime ?? '').localeCompare(b.modifiedTime ?? '') * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });
  }, [entries, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const allSelected = entries.length > 0 && entries.every((entry) => selectedIds.has(entry.id));

  // Row layout: a leading checkbox + trailing actions column only when the level
  // is modifiable (i.e. not the roots level, where items can't be changed).
  const gridCols = canModify
    ? 'grid-cols-[1.5rem_minmax(0,1fr)_8rem_5rem_2rem]'
    : 'grid-cols-[minmax(0,1fr)_8rem_6rem]';

  const openMenu = (event: MouseEvent<HTMLButtonElement>, entry: ViewEntry) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu((current) => (current?.entry.id === entry.id ? null : { entry, rect }));
  };

  const runMenuAction = (action: (entry: ViewEntry) => void, entry: ViewEntry) => {
    setMenu(null);
    action(entry);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!canUpload) {
      return;
    }

    // Extract entries synchronously — the DataTransfer is invalidated after this handler.
    const droppedEntries = Array.from(event.dataTransfer.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);
    const flatFiles = Array.from(event.dataTransfer.files);

    void resolveDropItems(droppedEntries, flatFiles).then((items) => {
      if (items.length > 0) {
        onUpload(items);
      }
    });
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onUpload(files.map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
    }
    event.target.value = '';
  };

  const SortHeader = ({ label, column }: { label: string; column: SortKey }) => {
    const active = sortKey === column;
    return (
      <button
        type='button'
        onClick={() => toggleSort(column)}
        className={`flex items-center gap-x-1 text-[11px] font-semibold tracking-wide uppercase hover:text-green-600 ${
          active ? 'text-zinc-950 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-400'
        }`}>
        {label}
        <Icon
          icon={active ? (sortDir === 'asc' ? 'ChevronUp' : 'ChevronDown') : 'ChevronUpDown'}
          className={`h-3 w-3 ${active ? '' : 'opacity-40'}`}
        />
      </button>
    );
  };

  return (
    <section className='flex min-h-0 flex-1 flex-col'>
      {/* Toolbar */}
      <header className='flex h-12 shrink-0 items-center justify-between gap-x-4 px-2'>
        <Breadcrumb crumbs={path} rootLabel={rootLabel} rootIcon={rootIcon} onNavigate={onNavigate} />

        <div className='flex shrink-0 items-center gap-x-1'>
          {!loading && (
            <span className='mr-1 hidden text-xs text-zinc-600 sm:block dark:text-zinc-400'>
              {entries.length} item{entries.length === 1 ? '' : 's'}
            </span>
          )}
          {canUpload && (
            <>
              <button
                type='button'
                onClick={onNewFolder}
                title='New folder'
                className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'>
                <Icon icon='FolderPlus' className='h-5 w-5' />
              </button>
              <button
                type='button'
                onClick={() => folderInputRef.current?.click()}
                title='Upload folder'
                className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'>
                <Icon icon='FolderArrowDown' className='h-5 w-5' />
              </button>
              <button
                type='button'
                onClick={() => fileInputRef.current?.click()}
                title='Upload files'
                className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-green-600 transition hover:bg-green-600/10'>
                <Icon icon='ArrowUpTray' className='h-5 w-5' />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Bulk selection bar */}
      {canModify && selectedIds.size > 0 && (
        <div className='mb-1 flex items-center justify-between gap-x-3 rounded-lg bg-green-600/10 px-3 py-2'>
          <span className='text-xs font-medium text-green-700 dark:text-green-400'>
            {selectedIds.size} selected
          </span>
          <div className='flex items-center gap-x-1'>
            <button
              type='button'
              onClick={onClearSelection}
              className='inline-flex h-8 items-center gap-x-1.5 rounded-lg px-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'>
              <Icon icon='XMark' className='h-4 w-4' />
              Clear
            </button>
            <button
              type='button'
              onClick={onBulkDelete}
              className='inline-flex h-8 items-center gap-x-1.5 rounded-lg px-2.5 text-xs font-medium text-red-500 transition hover:bg-red-500/10'>
              <Icon icon='Trash' className='h-4 w-4' />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Content / drop zone */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (canUpload) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className='relative min-h-0 flex-1 overflow-y-auto'>
        {dragging && canUpload && (
          <div className='pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-green-600 bg-zinc-100/60 text-green-600 backdrop-blur-md dark:bg-zinc-900/60'>
            <Icon icon='ArrowDownTray' className='h-8 w-8' />
            <p className='text-sm font-medium'>Drop files or folders to upload</p>
          </div>
        )}

        {loading ? (
          <div className='flex h-full items-center justify-center gap-x-2 text-sm text-zinc-600 dark:text-zinc-400'>
            <LoadingIndicator />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center text-center text-zinc-600 dark:text-zinc-400'>
            <Icon
              icon={canUpload ? 'ArrowUpTray' : hasStorage ? 'FolderOpen' : 'CircleStack'}
              className='mb-3 h-9 w-9 opacity-40'
            />
            <p className='text-sm font-medium text-zinc-950 dark:text-zinc-50'>
              {canUpload ? 'This folder is empty' : hasStorage ? 'No folders yet' : 'No storage selected'}
            </p>
            <p className='mt-1 text-xs'>
              {canUpload
                ? 'Drag files or folders here, or use the upload buttons.'
                : hasStorage
                  ? 'Add folders or buckets to this storage in the sidebar.'
                  : 'Choose a storage in the sidebar to start browsing.'}
            </p>
          </div>
        ) : (
          <div className='px-1'>
            {/* Column headers */}
            <div
              className={`sticky top-0 z-1 grid ${gridCols} items-center gap-x-3 border-b border-zinc-300 bg-zinc-100 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900`}>
              {canModify && (
                <input
                  type='checkbox'
                  checked={allSelected}
                  onChange={() => (allSelected ? onClearSelection() : onSelectAll())}
                  title={allSelected ? 'Clear selection' : 'Select all'}
                  className='h-4 w-4 cursor-pointer accent-green-600'
                />
              )}
              <SortHeader label='Name' column='name' />
              <SortHeader label='Modified' column='modified' />
              <div className='flex justify-end'>
                <SortHeader label='Size' column='size' />
              </div>
              {canModify && <span />}
            </div>

            {/* Rows */}
            <ul className='py-1'>
              {sorted.map((entry) => {
                const selected = entry.id === selectedId;
                const checked = selectedIds.has(entry.id);
                return (
                  <li key={entry.id}>
                    <div
                      role='button'
                      tabIndex={0}
                      onClick={() => onSelect(entry)}
                      onDoubleClick={() => {
                        if (entry.isFolder) onOpenFolder(entry);
                        else if (entry.webViewLink) window.open(entry.webViewLink, '_blank');
                      }}
                      className={`grid ${gridCols} w-full cursor-default items-center gap-x-3 rounded-lg px-3 py-2 text-left transition ${
                        checked || selected
                          ? 'bg-green-600/10'
                          : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                      }`}>
                      {canModify && (
                        <input
                          type='checkbox'
                          checked={checked}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => onToggleSelect(entry.id)}
                          className='h-4 w-4 cursor-pointer accent-green-600'
                        />
                      )}
                      <span className='flex min-w-0 items-center gap-x-2.5'>
                        {entry.isFolder ? (
                          <Icon
                            icon='Folder'
                            type='solid'
                            className='h-5 w-5 shrink-0 text-green-600'
                          />
                        ) : (
                          <Icon
                            icon={fileIcon(entry.mimeType)}
                            className='h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-400'
                          />
                        )}
                        <span className='truncate text-sm font-medium'>{entry.name}</span>
                      </span>
                      <span className='text-xs text-zinc-600 dark:text-zinc-400'>
                        {formatDate(entry.modifiedTime)}
                      </span>
                      <span className='text-right text-xs text-zinc-600 dark:text-zinc-400'>
                        {entry.isFolder ? '—' : formatBytes(entry.size)}
                      </span>
                      {canModify && (
                        <div className='flex justify-end'>
                          <button
                            type='button'
                            title='Actions'
                            onClick={(event) => openMenu(event, entry)}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-50 ${
                              menu?.entry.id === entry.id ? 'bg-zinc-300 dark:bg-zinc-700' : ''
                            }`}>
                            <Icon icon='EllipsisVertical' className='h-4 w-4' />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type='file' multiple className='hidden' onChange={handleInput} />
      <input ref={folderInputRef} type='file' className='hidden' onChange={handleInput} />

      {/* Row actions menu (fixed so it is never clipped by the scroll container) */}
      {menu && (
        <div
          role='menu'
          onClick={(event) => event.stopPropagation()}
          style={(() => {
            const width = 176;
            const left = Math.max(8, menu.rect.right - width);
            const flipUp =
              typeof window !== 'undefined' && menu.rect.bottom + 200 > window.innerHeight;
            return flipUp
              ? { left, bottom: window.innerHeight - menu.rect.top + 4, width }
              : { left, top: menu.rect.bottom + 4, width };
          })()}
          className='fixed z-50 flex flex-col gap-y-0.5 rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
          <MenuItem
            icon='ArrowDownTray'
            label={menu.entry.isFolder ? 'Download as ZIP' : 'Download'}
            onClick={() => runMenuAction(onDownload, menu.entry)}
          />
          {menu.entry.webViewLink && !menu.entry.isFolder && (
            <MenuItem
              icon='ArrowTopRightOnSquare'
              label='Open in Drive'
              onClick={() => {
                const link = menu.entry.webViewLink;
                setMenu(null);
                if (link) window.open(link, '_blank');
              }}
            />
          )}
          <MenuItem
            icon='Pencil'
            label='Rename'
            onClick={() => runMenuAction(onRename, menu.entry)}
          />
          <MenuItem
            icon='Trash'
            label='Delete'
            danger
            onClick={() => runMenuAction(onDelete, menu.entry)}
          />
        </div>
      )}
    </section>
  );
}

/**
 * A single row in the row-actions dropdown menu.
 */
function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type='button'
      role='menuitem'
      onClick={onClick}
      className={`flex items-center gap-x-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
        danger
          ? 'text-red-500 hover:bg-red-500/10'
          : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700'
      }`}>
      <Icon icon={icon} className='h-4 w-4 shrink-0' />
      {label}
    </button>
  );
}
