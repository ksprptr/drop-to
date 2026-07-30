'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useCallback,
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

// Popup-menu geometry (px): fixed widths, an estimated row-menu height for the flip-up decision,
// and the gap between the anchor and the menu.
const TOOLBAR_MENU_WIDTH = 176;
const ROW_MENU_WIDTH = 200;
const ROW_MENU_EST_HEIGHT = 200;
const MENU_GAP = 4;

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
  /** Unselect an authorized root folder (Drive owner only); enables a three-dots menu at the roots level. */
  onUnselectRoot?: (entry: ViewEntry) => void;
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
  /** Controlled search box: filters this view's entries (instant client-side + server-side for Drive). */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  /** Infinite scroll: more pages exist, and the callback to load the next one. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Move dragged items into a folder row (Finder-style drop, same pane). */
  onMoveIntoFolder?: (targetFolderId: string, ids: string[]) => void;
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
  onUnselectRoot,
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
  searchQuery = '',
  onSearchChange,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onMoveIntoFolder,
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

  const rootMenu = path.length === 0 && Boolean(onUnselectRoot);
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const [toolbarMenu, setToolbarMenu] = useState<DOMRect | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  // Folder row currently hovered as a move drop target (Finder-style same-pane move).
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);

  // Close the search box and drop its filter.
  const closeSearch = useCallback(() => {
    setShowSearch(false);
    onSearchChange?.('');
  }, [onSearchChange]);

  // Infinite scroll: the scroll container + a bottom sentinel watched by an IntersectionObserver.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

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

  // Instant client-side filter of the loaded rows (Drive also filters server-side; this is a superset,
  // so it never hides server results — and it handles roots + S3, which aren't searched server-side).
  const query = searchQuery.trim().toLowerCase();
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const list = query
      ? entries.filter((entry) => entry.name.toLowerCase().includes(query))
      : entries;

    return [...list].sort((a, b) => {
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
  }, [entries, sortKey, sortDir, query]);

  // Identity of the current view — changes only on folder / sort / search, i.e. a "fresh load".
  const viewKey = `${path.map((crumb) => crumb.id).join('/')}|${sortKey}|${sortDir}|${query}`;

  // Reset the scroll to the top on a fresh load — but NOT when appending pages (that must not jump).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [viewKey]);

  // Load the next page as the sentinel nears the viewport; pauses while a page is in flight.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (records) => {
        if (records[0]?.isIntersecting) {
          loadMoreRef.current?.();
        }
      },
      { root, rootMargin: '400px' },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, loadingMore, sorted.length]);

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

  // The trailing three-dots column shows when rows are modifiable or a root can be unselected.
  const showActions = canModify || rootMenu;
  // Checkbox column only when modifiable; actions column when either; "Modified" is dropped on mobile.
  const gridCols = canModify
    ? 'grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_2rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_8rem_5rem_2rem]'
    : rootMenu
      ? 'grid-cols-[minmax(0,1fr)_4.5rem_2rem] sm:grid-cols-[minmax(0,1fr)_8rem_6rem_2rem]'
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
              {query
                ? `${sorted.length} of ${entries.length}`
                : `${entries.length} item${entries.length === 1 ? '' : 's'}`}
            </span>
          )}
          {/* Search toggle — appears once the folder has loaded content (no empty-folder flash). */}
          {!loading && entries.length > 0 && (
            <button
              type='button'
              onClick={() => (showSearch ? closeSearch() : setShowSearch(true))}
              title='Search'
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                showSearch
                  ? 'bg-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'
              }`}>
              <Icon icon='MagnifyingGlass' className='h-5 w-5' />
            </button>
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

      {/* Search this view (folders + files). Instant client filter; Drive also narrows server-side. */}
      <AnimatePresence initial={false}>
        {showSearch && (
          <motion.div
            key='search-bar'
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className='shrink-0 overflow-hidden px-2 pt-1 pb-2'>
            <div className='relative'>
              <Icon
                icon='MagnifyingGlass'
                className='pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zinc-500'
              />
              <input
                type='text'
                autoFocus
                value={searchQuery}
                onChange={(event) => onSearchChange?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeSearch();
                }}
                placeholder='Search this folder'
                className='w-full rounded-lg border border-zinc-300 bg-zinc-50 py-1.5 pr-8 pl-8 text-sm text-zinc-950 transition placeholder:text-zinc-500 focus:outline-2 focus:-outline-offset-1 focus:outline-green-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50'
              />
              {searchQuery && (
                <button
                  type='button'
                  onClick={() => onSearchChange?.('')}
                  title='Clear search'
                  className='absolute top-1/2 right-2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'>
                  <Icon icon='XMark' className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content / drop zone */}
      <div
        ref={scrollRef}
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
        ) : sorted.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center text-center text-zinc-600 dark:text-zinc-400'>
            <Icon icon='MagnifyingGlass' className='mb-3 h-9 w-9 opacity-40' />
            <p className='text-sm font-medium text-zinc-950 dark:text-zinc-50'>No matches</p>
            <p className='mt-1 text-xs'>Nothing here matches “{searchQuery.trim()}”.</p>
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
                  className='h-4 w-4'
                />
              )}
              <SortHeader
                label='Name'
                column='name'
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggleSort}
              />
              <div className='hidden sm:block'>
                <SortHeader
                  label='Modified'
                  column='modified'
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </div>
              <div className='flex justify-end'>
                <SortHeader
                  label='Size'
                  column='size'
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </div>
              {showActions && <span />}
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
                      onDragOver={(event) => {
                        // A folder row accepts a move drop (unless it's part of the dragged selection).
                        if (
                          canModify &&
                          onMoveIntoFolder &&
                          entry.isFolder &&
                          !selectedIds.has(entry.id) &&
                          event.dataTransfer.types.includes(MOVE_MIME)
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = 'move';
                          if (dropFolderId !== entry.id) setDropFolderId(entry.id);
                        }
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          return;
                        }
                        setDropFolderId((current) => (current === entry.id ? null : current));
                      }}
                      onDrop={(event) => {
                        if (
                          !canModify ||
                          !onMoveIntoFolder ||
                          !entry.isFolder ||
                          !event.dataTransfer.types.includes(MOVE_MIME)
                        ) {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        setDropFolderId(null);
                        const ids = event.dataTransfer.getData(MOVE_MIME).split(',').filter(Boolean);
                        if (ids.length > 0 && !ids.includes(entry.id)) {
                          onMoveIntoFolder(entry.id, ids);
                        }
                      }}
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
                        dropFolderId === entry.id
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
                            onChange={() => onToggleSelect(entry.id)}
                            className='hidden h-4 w-4 max-sm:block'
                          />
                          {/* Desktop: a check indicator (no checkbox) for selected rows. */}
                          {checked && (
                            <Icon icon='Check' className='hidden h-4 w-4 text-green-600 sm:block' />
                          )}
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
                      {(canModify || (rootMenu && entry.isFolder)) && (
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

            {loadingMore && (
              <div className='flex items-center justify-center gap-x-2 py-3 text-xs text-zinc-600 dark:text-zinc-400'>
                <LoadingIndicator />
                Loading more…
              </div>
            )}
            {/* Sentinel: when it nears the viewport the next page loads (see the observer effect). */}
            <div ref={sentinelRef} className='h-px w-full' />
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
              left: Math.max(8, toolbarMenu.right - TOOLBAR_MENU_WIDTH),
              top: toolbarMenu.bottom + MENU_GAP,
              width: TOOLBAR_MENU_WIDTH,
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
              const width = ROW_MENU_WIDTH;
              const left = Math.max(8, menu.rect.right - width);
              const flipUp =
                typeof window !== 'undefined' &&
                menu.rect.bottom + ROW_MENU_EST_HEIGHT > window.innerHeight;
              const transformOrigin = flipUp ? 'bottom right' : 'top right';
              return flipUp
                ? {
                    left,
                    bottom: window.innerHeight - menu.rect.top + MENU_GAP,
                    width,
                    transformOrigin,
                  }
                : { left, top: menu.rect.bottom + MENU_GAP, width, transformOrigin };
            })()}
            initial={MENU_MOTION.initial}
            animate={MENU_MOTION.animate}
            exit={MENU_MOTION.exit}
            transition={MENU_MOTION.transition}
            className='fixed z-50 flex flex-col gap-y-0.5 rounded-xl border border-zinc-300 bg-zinc-50 p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-800'>
            {rootMenu && onUnselectRoot ? (
              <MenuItem
                icon='FolderMinus'
                label='Remove from app'
                tone='danger'
                onClick={() => runMenuAction(onUnselectRoot, menu.entry)}
              />
            ) : (
              <>
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
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * A sortable column header button showing the active sort direction.
 **/
function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <button
      type='button'
      onClick={() => onToggle(column)}
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
