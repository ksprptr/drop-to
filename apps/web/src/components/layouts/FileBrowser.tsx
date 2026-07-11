'use client';

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { Crumb, UploadItem, ViewEntry } from '@/common/types/workspace.types';
import { formatBytes, formatDate } from '@/common/utils/format.functions';
import Icon from '@/components/common/Icon';
import LoadingIndicator from '@/components/loadings/LoadingIndicator';

import Breadcrumb from './Breadcrumb';

interface Props {
  path: Crumb[];
  entries: ViewEntry[];
  loading: boolean;
  selectedId: string | null;
  canUpload: boolean;
  onNavigate: (index: number) => void;
  onOpenFolder: (entry: ViewEntry) => void;
  onSelect: (entry: ViewEntry) => void;
  onUpload: (items: UploadItem[]) => void;
  onNewFolder: () => void;
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
  entries,
  loading,
  selectedId,
  canUpload,
  onNavigate,
  onOpenFolder,
  onSelect,
  onUpload,
  onNewFolder,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // `webkitdirectory` has no typed React prop, so set it imperatively.
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

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
        <Breadcrumb crumbs={path} onNavigate={onNavigate} />

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
              icon={canUpload ? 'ArrowUpTray' : 'FolderOpen'}
              className='mb-3 h-9 w-9 opacity-40'
            />
            <p className='text-sm font-medium text-zinc-950 dark:text-zinc-50'>
              {canUpload ? 'This folder is empty' : 'No folders yet'}
            </p>
            <p className='mt-1 text-xs'>
              {canUpload
                ? 'Drag files or folders here, or use the upload buttons.'
                : 'Connect a Google account and pick folders in the sidebar.'}
            </p>
          </div>
        ) : (
          <div className='px-1'>
            {/* Column headers */}
            <div className='sticky top-0 z-1 grid grid-cols-[minmax(0,1fr)_8rem_6rem] items-center gap-x-3 border-b border-zinc-300 bg-zinc-100 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900'>
              <SortHeader label='Name' column='name' />
              <SortHeader label='Modified' column='modified' />
              <div className='flex justify-end'>
                <SortHeader label='Size' column='size' />
              </div>
            </div>

            {/* Rows */}
            <ul className='py-1'>
              {sorted.map((entry) => {
                const selected = entry.id === selectedId;
                return (
                  <li key={entry.id}>
                    <button
                      type='button'
                      onClick={() => onSelect(entry)}
                      onDoubleClick={() => {
                        if (entry.isFolder) onOpenFolder(entry);
                        else if (entry.webViewLink) window.open(entry.webViewLink, '_blank');
                      }}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_8rem_6rem] items-center gap-x-3 rounded-lg px-3 py-2 text-left transition ${
                        selected ? 'bg-green-600/10' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
                      }`}>
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
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type='file' multiple className='hidden' onChange={handleInput} />
      <input ref={folderInputRef} type='file' className='hidden' onChange={handleInput} />
    </section>
  );
}
