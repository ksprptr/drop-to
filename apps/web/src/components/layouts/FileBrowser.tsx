'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  Crumb,
  SortDir,
  SortKey,
  UploadItem,
  ViewEntry,
} from '@/common/types/workspace.types';
import { formatBytes, formatDate } from '@/common/utils/format.functions';
import Icon from '@/components/common/Icon';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';

import Breadcrumb, { type BreadcrumbStoragePicker } from './Breadcrumb';

/** Custom DataTransfer type marking an internal drag-to-move (vs an OS file drop). */
const MOVE_MIME = 'application/x-dropto-move';

/** Dropdown-menu open/close animation (fade + zoom + slight slide), shadcn-style. */
const MENU_MOTION = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
  transition: { duration: 0.08, ease: 'easeOut' },
} as const;

interface Props {
  path: Crumb[];
  rootLabel: string;
  rootIcon: string;
  entries: ViewEntry[];
  loading: boolean;
  /** The current folder URL doesn't exist / isn't authorized — show a 404 in the file area. */
  notFound?: boolean;
  selectedId: string | null;
  canUpload: boolean;
  /** False at the roots level (no select/rename/delete). */
  canModify: boolean;
  hasStorage: boolean;
  selectedIds: Set<string>;
  onNavigate: (index: number) => void;
  onOpenFolder: (entry: ViewEntry) => void;
  onSelect: (entry: ViewEntry) => void;
  onDeselect: () => void;
  onUpload: (items: UploadItem[]) => void;
  onNewFolder: () => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Replaces the whole selection set (used for Shift-click range select on desktop). */
  onSetSelectedIds?: (ids: string[]) => void;
  onBulkDelete: () => void;
  onDownload: (entry: ViewEntry) => void;
  onRename: (entry: ViewEntry) => void;
  onDelete: (entry: ViewEntry) => void;
  split?: boolean;
  onToggleSplit?: () => void;
  /** Copies the current folder's shareable URL (main pane only). */
  onCopyLink?: () => void;
  /** Whether this pane can accept an in-progress drag-to-move. */
  acceptMove?: boolean;
  onMoveDragStart?: (ids: string[]) => void;
  onMoveDragEnd?: () => void;
  onMoveDrop?: () => void;
  storagePicker?: BreadcrumbStoragePicker;
  /** Controlled sort (URL-driven); falls back to internal state when omitted (e.g. the split pane). */
  sortKey?: SortKey;
  sortDir?: SortDir;
  onToggleSort?: (key: SortKey) => void;
}

/** An open row-actions menu, anchored to the three-dot button's screen position. */
interface RowMenu {
  entry: ViewEntry;
  rect: DOMRect;
}


/**
 * Icon name for a MIME type.
 **/
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
 * Reads all entries from a directory reader (≤100 per call).
 **/
const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => reader.readEntries(resolve, reject));

/**
 * Resolves a file entry into a File.
 **/
const entryToFile = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject));

/**
 * Recursively walks a dropped entry into flat upload items.
 **/
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
      // eslint-disable-next-line no-await-in-loop -- sequential walk into a shared, ordered list
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
    // eslint-disable-next-line no-await-in-loop -- the directory reader is stateful; read in sequence
    batch = await readAllEntries(reader);
  }
};

/**
 * Dropped items → flat upload items (falls back to the plain file list).
 **/
const resolveDropItems = async (
  entries: FileSystemEntry[],
  flatFiles: File[],
): Promise<UploadItem[]> => {
  if (entries.length === 0) {
    return flatFiles.map((file) => ({ file, relativePath: file.name }));
  }

  const out: UploadItem[] = [];
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop -- entries walked sequentially into an ordered list
    await walkEntry(entry, '', out);
  }
  return out;
};

/**
 * Middle pane: Finder-like sortable list + drop target for uploads.
 **/
export default function FileBrowser({
  path,
  rootLabel,
  rootIcon,
  entries,
  loading,
  notFound = false,
  selectedId,
  canUpload,
  canModify,
  hasStorage,
  selectedIds,
  onNavigate,
  onOpenFolder,
  onSelect,
  onDeselect,
  onUpload,
  onNewFolder,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onSetSelectedIds,
  onBulkDelete,
  onDownload,
  onRename,
  onDelete,
  split = false,
  onToggleSplit,
  onCopyLink,
  acceptMove = false,
  onMoveDragStart,
  onMoveDragEnd,
  onMoveDrop,
  storagePicker,
  sortKey: controlledSortKey,
  sortDir: controlledSortDir,
  onToggleSort,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Anchor row for Shift-click range selection.
  const selectionAnchor = useRef<string | null>(null);
  const [dragKind, setDragKind] = useState<'upload' | 'move' | null>(null);
  const [internalSortKey, setInternalSortKey] = useState<SortKey>('name');
  const [internalSortDir, setInternalSortDir] = useState<SortDir>('asc');
  const sortKey = controlledSortKey ?? internalSortKey;
  const sortDir = controlledSortDir ?? internalSortDir;
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const [toolbarMenu, setToolbarMenu] = useState<DOMRect | null>(null);

  // `webkitdirectory` has no typed React prop, so set it imperatively.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  // Close any open menu on an outside click, scroll, resize, or Escape.
  useEffect(() => {
    if (!menu && !toolbarMenu) {
      return;
    }
    const close = () => {
      setMenu(null);
      setToolbarMenu(null);
    };
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
  }, [menu, toolbarMenu]);

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
    if (onToggleSort) {
      onToggleSort(key);
      return;
    }
    if (key === internalSortKey) {
      setInternalSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setInternalSortKey(key);
      setInternalSortDir('asc');
    }
  };

  const allSelected = entries.length > 0 && entries.every((entry) => selectedIds.has(entry.id));

  // Checkbox + actions columns only when modifiable; "Modified" is dropped on mobile.
  const gridCols = canModify
    ? 'grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_2rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_8rem_5rem_2rem]'
    : 'grid-cols-[minmax(0,1fr)_4.5rem] sm:grid-cols-[minmax(0,1fr)_8rem_6rem]';

  const openMenu = (event: MouseEvent<HTMLButtonElement>, entry: ViewEntry) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    // Opening a row menu closes the toolbar menu (they must never overlap).
    setToolbarMenu(null);
    setMenu((current) => (current?.entry.id === entry.id ? null : { entry, rect }));
  };

  const openToolbarMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    // Opening the toolbar menu closes any open row menu.
    setMenu(null);
    setToolbarMenu((current) => (current ? null : rect));
  };

  const runMenuAction = (action: (entry: ViewEntry) => void, entry: ViewEntry) => {
    setMenu(null);
    action(entry);
  };

  const runToolbarAction = (action: () => void) => {
    setToolbarMenu(null);
    action();
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    // An internal drag-to-move from the other pane takes precedence.
    if (acceptMove && types.includes(MOVE_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragKind('move');
      return;
    }
    if (canUpload && types.includes('Files')) {
      event.preventDefault();
      setDragKind('upload');
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;

    // Internal move: hand off to the parent, which knows the dragged ids.
    if (acceptMove && types.includes(MOVE_MIME)) {
      event.preventDefault();
      setDragKind(null);
      onMoveDrop?.();
      return;
    }

    event.preventDefault();
    setDragKind(null);
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

  const handleRowDragStart = (event: DragEvent<HTMLDivElement>, entry: ViewEntry) => {
    if (!canModify) {
      return;
    }
    // Dragging a selected row moves the whole selection; otherwise just that row.
    const ids = selectedIds.has(entry.id) ? [...selectedIds] : [entry.id];
    event.dataTransfer.setData(MOVE_MIME, ids.join(','));
    event.dataTransfer.effectAllowed = 'move';
    onMoveDragStart?.(ids);
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
        <Breadcrumb
          crumbs={path}
          rootLabel={rootLabel}
          rootIcon={rootIcon}
          onNavigate={onNavigate}
          storagePicker={storagePicker}
        />

        <div className='flex shrink-0 items-center gap-x-1'>
          {!loading && (
            <span className='mr-1 hidden text-xs text-zinc-600 sm:block dark:text-zinc-400'>
              {entries.length} item{entries.length === 1 ? '' : 's'}
            </span>
          )}
          {(canUpload || onToggleSplit || onCopyLink) && (
            <button
              type='button'
              onClick={openToolbarMenu}
              title='Actions'
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                toolbarMenu
                  ? 'bg-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'
              }`}>
              <Icon icon='EllipsisVertical' className='h-5 w-5' />
            </button>
          )}
        </div>
      </header>

      {/* Content / drop zone */}
      <div
        onClick={onDeselect}
        onDragOver={handleDragOver}
        onDragLeave={(event) => {
          // Ignore leave events bubbling up from children still inside the zone.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setDragKind(null);
        }}
        onDrop={handleDrop}
        className='relative min-h-0 flex-1 overflow-y-auto'>
        <AnimatePresence>
          {dragKind && (
            <motion.div
              key={dragKind}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className='pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-green-600 text-green-600 backdrop-blur-md dark:bg-zinc-900/60'>
              <Icon
                icon={dragKind === 'move' ? 'ArrowsPointingIn' : 'ArrowDownTray'}
                className='h-8 w-8'
              />
              <p className='text-sm font-medium'>
                {dragKind === 'move' ? 'Move here' : 'Drop files or folders to upload'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {notFound ? (
          <div className='flex h-full flex-col items-center justify-center text-center text-zinc-600 dark:text-zinc-400'>
            <Icon icon='FolderOpen' className='mb-3 h-9 w-9 opacity-40' />
            <p className='text-sm font-medium text-zinc-950 dark:text-zinc-50'>
              404 — Folder not found
            </p>
            <p className='mt-1 text-xs'>This folder doesn’t exist or isn’t available.</p>
          </div>
        ) : loading ? (
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
              {canUpload
                ? 'This folder is empty'
                : hasStorage
                  ? 'No folders yet'
                  : 'No storage selected'}
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
              <div className='hidden sm:block'>
                <SortHeader label='Modified' column='modified' />
              </div>
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
                      draggable={canModify}
                      onDragStart={(event) => handleRowDragStart(event, entry)}
                      onDragEnd={() => onMoveDragEnd?.()}
                      onClick={(event) => {
                        // Don't let the click reach the finder's deselect handler.
                        event.stopPropagation();
                        const ids = sorted.map((row) => row.id);
                        // Shift-click: select the range from the anchor to this row.
                        if (event.shiftKey && onSetSelectedIds && selectionAnchor.current) {
                          const from = ids.indexOf(selectionAnchor.current);
                          const to = ids.indexOf(entry.id);
                          if (from !== -1 && to !== -1) {
                            const [lo, hi] = from < to ? [from, to] : [to, from];
                            onSetSelectedIds(ids.slice(lo, hi + 1));
                            return;
                          }
                        }
                        // Cmd/Ctrl-click: toggle this row in the multi-selection.
                        if ((event.metaKey || event.ctrlKey) && canModify) {
                          onToggleSelect(entry.id);
                          selectionAnchor.current = entry.id;
                          return;
                        }
                        // Plain click: single select (preview) and drop any multi-selection.
                        onSelect(entry);
                        if (canModify) {
                          onClearSelection();
                        }
                        selectionAnchor.current = entry.id;
                      }}
                      onDoubleClick={() => {
                        if (entry.isFolder) onOpenFolder(entry);
                        else if (entry.webViewLink) window.open(entry.webViewLink, '_blank');
                      }}
                      onKeyDown={(event) => {
                        // Enter opens a folder / selects a file; Space selects.
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (entry.isFolder) onOpenFolder(entry);
                          else onSelect(entry);
                        } else if (event.key === ' ') {
                          event.preventDefault();
                          onSelect(entry);
                        }
                      }}
                      className={`grid ${gridCols} w-full cursor-pointer items-center gap-x-3 rounded-lg px-3 py-2 text-left transition ${
                        checked || selected
                          ? 'bg-green-600/10'
                          : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                      }`}>
                      {canModify && (
                        // Wrapper keeps the grid cell on desktop (so columns stay aligned); the
                        // checkbox itself shows only on mobile — desktop multi-select is Shift/Cmd-click.
                        <span className='flex h-4 w-4 items-center justify-center'>
                          <input
                            type='checkbox'
                            checked={checked}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => onToggleSelect(entry.id)}
                            className='hidden h-4 w-4 cursor-pointer accent-green-600 max-sm:block'
                          />
                          {/* Desktop: a check indicator (no checkbox) for selected rows. */}
                          {checked && (
                            <Icon icon='Check' className='hidden h-4 w-4 text-green-600 sm:block' />
                          )}
                        </span>
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
                        <span className='min-w-0 truncate text-sm font-medium'>{entry.name}</span>
                      </span>
                      <span className='hidden text-xs text-zinc-600 sm:block dark:text-zinc-400'>
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

      {/* Bulk selection bar — below the list, styled like the sidebar */}
      <AnimatePresence initial={false}>
        {canModify && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.12, ease: 'easeInOut' }}
            className='flex shrink-0 items-center justify-between gap-x-3 overflow-hidden rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800'>
            <span className='text-xs font-medium text-zinc-700 dark:text-zinc-300'>
              {selectedIds.size} selected
            </span>
            <div className='flex items-center gap-x-1'>
              <button
                type='button'
                onClick={onClearSelection}
                title='Clear selection'
                className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'>
                <Icon icon='XMark' className='h-4 w-4' />
              </button>
              <button
                type='button'
                onClick={onBulkDelete}
                title='Delete selected'
                className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-500/10'>
                <Icon icon='Trash' className='h-4 w-4' />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type='file' multiple className='hidden' onChange={handleInput} />
      <input ref={folderInputRef} type='file' className='hidden' onChange={handleInput} />

      {/* Toolbar actions menu (upload / new folder / split), same style as row menu */}
      <AnimatePresence>
        {toolbarMenu && (
          <motion.div
            key='toolbar-menu'
            role='menu'
            onClick={(event) => event.stopPropagation()}
            style={{
              left: Math.max(8, toolbarMenu.right - 176),
              top: toolbarMenu.bottom + 4,
              width: 176,
              transformOrigin: 'top right',
            }}
            initial={MENU_MOTION.initial}
            animate={MENU_MOTION.animate}
            exit={MENU_MOTION.exit}
            transition={MENU_MOTION.transition}
            className='fixed z-50 flex flex-col gap-y-0.5 rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
            {canUpload && (
              <MenuItem
                icon='ArrowUpTray'
                label='Upload files'
                tone='primary'
                onClick={() => runToolbarAction(() => fileInputRef.current?.click())}
              />
            )}
            {canUpload && (
              <MenuItem
                icon='FolderArrowDown'
                label='Upload folder'
                tone='primary'
                onClick={() => runToolbarAction(() => folderInputRef.current?.click())}
              />
            )}
            {canUpload && (
              <MenuItem
                icon='FolderPlus'
                label='New folder'
                onClick={() => runToolbarAction(onNewFolder)}
              />
            )}
            {onToggleSplit && (
              <MenuItem
                icon={split ? 'XMark' : 'ViewColumns'}
                label={split ? 'Close split view' : 'Split view'}
                onClick={() => runToolbarAction(onToggleSplit)}
              />
            )}
            {onCopyLink && (
              <MenuItem
                icon='LinkIcon'
                label='Copy link'
                onClick={() => runToolbarAction(onCopyLink)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row actions menu (fixed so it is never clipped by the scroll container) */}
      <AnimatePresence>
        {menu && (
          <motion.div
            key='row-menu'
            role='menu'
            onClick={(event) => event.stopPropagation()}
            style={(() => {
              const width = 200;
              const left = Math.max(8, menu.rect.right - width);
              const flipUp =
                typeof window !== 'undefined' && menu.rect.bottom + 200 > window.innerHeight;
              const transformOrigin = flipUp ? 'bottom right' : 'top right';
              return flipUp
                ? { left, bottom: window.innerHeight - menu.rect.top + 4, width, transformOrigin }
                : { left, top: menu.rect.bottom + 4, width, transformOrigin };
            })()}
            initial={MENU_MOTION.initial}
            animate={MENU_MOTION.animate}
            exit={MENU_MOTION.exit}
            transition={MENU_MOTION.transition}
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
              tone='danger'
              onClick={() => runMenuAction(onDelete, menu.entry)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'primary';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-500 hover:bg-red-500/10'
      : tone === 'primary'
        ? 'text-green-600 hover:bg-green-600/10'
        : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700';

  return (
    <button
      type='button'
      role='menuitem'
      onClick={onClick}
      className={`flex items-center gap-x-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${toneClass}`}>
      <Icon icon={icon} className='h-4 w-4 shrink-0' />
      {label}
    </button>
  );
}
