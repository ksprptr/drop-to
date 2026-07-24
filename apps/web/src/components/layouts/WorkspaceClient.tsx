'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { disconnectAccount, logout, saveFolders } from '@/common/services/api/auth.api';
import {
  createSubfolder,
  deleteItem,
  fileDownloadUrl,
  folderDownloadUrl,
  getFolderContents,
  getStorageStatuses,
  uploadFile,
} from '@/common/services/api/storage.api';
import { type PickedFolder, usePicker } from '@/common/services/picker/usePicker';
import type {
  Crumb,
  DownloadTask,
  UploadBatch,
  UploadItem,
  UploadTask,
  ViewEntry,
} from '@/common/types/workspace.types';
import { extractApiErrorMessage, isCanceledError } from '@/common/utils/error.functions';
import { isTopLevelFolder, topLevelName, uniqueName } from '@/common/utils/upload.functions';
import Button from '@/components/common/Button';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { STORAGE_ICON } from '@/configs/storage.config';

import AccountSidebar from './AccountSidebar';
import FileBrowser from './FileBrowser';
import PreviewPanel from './PreviewPanel';
import UploadDock from './UploadDock';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const UPLOAD_LINGER_MS = 4000;
const DOWNLOAD_PREPARING_MS = 6000;

interface BatchRuntime {
  controller: AbortController;
  looseFileIds: string[];
  rootFolderIds: string[];
}

interface Props {
  username: string;
}

/**
 * Returns the first connected backend (or null), used to auto-select a storage.
 */
const pickDefaultBackend = (statuses: StorageStatus[]): StorageBackend | null =>
  statuses.find((status) => status.connected)?.backend ?? null;

/**
 * The main workspace: a Finder-like three-pane view (storage sidebar, file
 * browser, preview panel) with drag-and-drop uploads and account management. The
 * sidebar switches between storage backends (Google Drive, S3); the active
 * backend's roots (authorized folders / buckets) are the top level.
 */
export default function WorkspaceClient({ username }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { openPicker } = usePicker();

  const [statuses, setStatuses] = useState<StorageStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [activeBackend, setActiveBackend] = useState<StorageBackend | null>(null);
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [selected, setSelected] = useState<ViewEntry | null>(null);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [duplicate, setDuplicate] = useState<string[] | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ViewEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handledParams = useRef(false);
  const batchRuntime = useRef<Map<string, BatchRuntime>>(new Map());
  const duplicateResolve = useRef<((choice: 'replace' | 'keep' | 'cancel') => void) | null>(null);

  const driveStatus = statuses.find((status) => status.backend === 'drive') ?? null;
  const activeStatus = activeBackend
    ? (statuses.find((status) => status.backend === activeBackend) ?? null)
    : null;

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;
  const hasActiveUploads = batches.some((batch) => batch.status === 'uploading');

  // Abort any in-flight uploads when the workspace unmounts (e.g. on refresh).
  useEffect(() => {
    const runtimes = batchRuntime.current;
    return () => {
      runtimes.forEach((runtime) => runtime.controller.abort());
    };
  }, []);

  // Warn (native browser prompt) before leaving while uploads are still running.
  useEffect(() => {
    if (!hasActiveUploads) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasActiveUploads]);

  const roots = useMemo<ViewEntry[]>(
    () =>
      (activeStatus?.roots ?? []).map((root) => ({
        id: root.id,
        name: root.name,
        isFolder: true,
        size: null,
        mimeType: FOLDER_MIME,
        modifiedTime: null,
        webViewLink: null,
      })),
    [activeStatus],
  );

  const loadStatus = useCallback(async () => {
    try {
      setStatuses(await getStorageStatuses());
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setLoadingStatus(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Keep the active backend valid: default to the first connected one, and drop
  // it if the current one becomes disconnected.
  useEffect(() => {
    setActiveBackend((current) => {
      const stillConnected =
        current !== null && statuses.some((s) => s.backend === current && s.connected);
      return stillConnected ? current : pickDefaultBackend(statuses);
    });
  }, [statuses]);

  // Reset the browse path whenever the active storage changes.
  useEffect(() => {
    setPath([]);
    setSelected(null);
  }, [activeBackend]);

  useEffect(() => {
    if (handledParams.current) {
      return;
    }
    handledParams.current = true;

    if (searchParams.get('connected') === '1') {
      toast.success('Google account connected successfully.');
      void loadStatus();
    }
    const error = searchParams.get('error');
    if (error) {
      toast.error(`Failed to connect the Google account (${error}).`);
    }
    if (searchParams.get('connected') || searchParams.get('error')) {
      router.replace('/');
    }
  }, [searchParams, toast, loadStatus, router]);

  const loadEntries = useCallback(async () => {
    if (currentFolderId === null || activeBackend === null) {
      setEntries(roots);
      return;
    }

    setLoadingEntries(true);
    try {
      const contents = await getFolderContents(activeBackend, currentFolderId);
      setEntries(
        contents.map((entry) => ({
          id: entry.id,
          name: entry.name,
          isFolder: entry.isFolder,
          size: entry.size,
          mimeType: entry.mimeType,
          modifiedTime: entry.modifiedTime,
          webViewLink: entry.webViewLink,
        })),
      );
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setLoadingEntries(false);
    }
  }, [activeBackend, currentFolderId, roots, toast]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const openFolder = useCallback((entry: ViewEntry) => {
    setSelected(null);
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
  }, []);

  const navigate = useCallback((index: number) => {
    setSelected(null);
    setPath((current) => (index < 0 ? [] : current.slice(0, index + 1)));
  }, []);

  const selectStorage = useCallback((backend: StorageBackend) => {
    setActiveBackend(backend);
  }, []);

  // --- Upload dock state helpers ------------------------------------------------

  const updateTask = useCallback(
    (batchId: string, taskId: string, patch: Partial<UploadTask>) => {
      setBatches((current) =>
        current.map((batch) =>
          batch.id === batchId
            ? {
                ...batch,
                tasks: batch.tasks.map((task) =>
                  task.id === taskId ? { ...task, ...patch } : task,
                ),
              }
            : batch,
        ),
      );
    },
    [],
  );

  const setBatchStatus = useCallback((batchId: string, batchStatus: UploadBatch['status']) => {
    setBatches((current) =>
      current.map((batch) => (batch.id === batchId ? { ...batch, status: batchStatus } : batch)),
    );
  }, []);

  const scheduleRemoveBatch = useCallback((batchId: string) => {
    setTimeout(() => {
      setBatches((current) => current.filter((batch) => batch.id !== batchId));
    }, UPLOAD_LINGER_MS);
  }, []);

  // Undo an entire batch: delete every file/folder it created, so cancelling a
  // multi-file or folder upload leaves nothing behind.
  const rollbackBatch = useCallback(
    async (batchId: string, backend: StorageBackend) => {
      // Flip the batch (and all its rows) to a cancelled state — the dock turns
      // the bars and labels red.
      setBatches((current) =>
        current.map((batch) =>
          batch.id === batchId
            ? {
                ...batch,
                status: 'canceling',
                tasks: batch.tasks.map((task) => ({ ...task, status: 'canceled', rate: null })),
              }
            : batch,
        ),
      );
      const runtime = batchRuntime.current.get(batchId);
      if (runtime) {
        await Promise.all(
          [...runtime.rootFolderIds, ...runtime.looseFileIds].map((id) =>
            deleteItem(backend, id).catch(() => undefined),
          ),
        );
        batchRuntime.current.delete(batchId);
      }
      await loadEntries();
      setBatchStatus(batchId, 'canceled');
      scheduleRemoveBatch(batchId);
    },
    [loadEntries, setBatchStatus, scheduleRemoveBatch],
  );

  const cancelBatch = useCallback((batchId: string) => {
    batchRuntime.current.get(batchId)?.controller.abort();
  }, []);

  const askDuplicate = useCallback((names: string[]): Promise<'replace' | 'keep' | 'cancel'> => {
    setDuplicate(names);
    return new Promise((resolve) => {
      duplicateResolve.current = resolve;
    });
  }, []);

  const resolveDuplicate = useCallback((choice: 'replace' | 'keep' | 'cancel') => {
    setDuplicate(null);
    duplicateResolve.current?.(choice);
    duplicateResolve.current = null;
  }, []);

  const handleUpload = useCallback(
    async (items: UploadItem[]) => {
      if (currentFolderId === null || activeBackend === null || items.length === 0) {
        return;
      }
      const backend = activeBackend;

      // Detect name conflicts among the top-level items being added here.
      const existingNames = new Set(entries.map((entry) => entry.name));
      const topLevel = new Map<string, boolean>();
      for (const item of items) {
        const top = topLevelName(item.relativePath);
        topLevel.set(top, topLevel.get(top) === true || isTopLevelFolder(item.relativePath));
      }
      const conflicts = [...topLevel.keys()].filter((name) => existingNames.has(name));

      const renameMap = new Map<string, string>();
      // For "replace" we upload the new items first and delete the originals only
      // once they're safely in — so cancelling never destroys the existing file.
      let replaceIds: string[] = [];
      if (conflicts.length > 0) {
        const choice = await askDuplicate(conflicts);
        if (choice === 'cancel') {
          return;
        }
        if (choice === 'replace') {
          replaceIds = entries
            .filter((entry) => conflicts.includes(entry.name))
            .map((entry) => entry.id);
        } else {
          const taken = new Set(existingNames);
          for (const name of conflicts) {
            const renamed = uniqueName(name, taken);
            taken.add(renamed);
            renameMap.set(name, renamed);
          }
        }
      }

      // Apply any renames (folders via their path, loose files via an upload name).
      const finalItems: UploadItem[] = items.map((item) => {
        const top = topLevelName(item.relativePath);
        const renamed = renameMap.get(top);
        if (!renamed) {
          return item;
        }
        return isTopLevelFolder(item.relativePath)
          ? { ...item, relativePath: `${renamed}${item.relativePath.slice(top.length)}` }
          : { ...item, relativePath: renamed, uploadName: renamed };
      });

      const folderTops = new Set(
        finalItems.filter((item) => isTopLevelFolder(item.relativePath)).map((item) => topLevelName(item.relativePath)),
      );
      const looseCount = finalItems.filter((item) => !isTopLevelFolder(item.relativePath)).length;
      const kind: UploadBatch['kind'] =
        folderTops.size === 1 && looseCount === 0 ? 'folder' : 'files';
      const folderName = kind === 'folder' ? [...folderTops][0] : null;

      const batchId = crypto.randomUUID();
      const runtime: BatchRuntime = {
        controller: new AbortController(),
        looseFileIds: [],
        rootFolderIds: [],
      };
      batchRuntime.current.set(batchId, runtime);
      const { signal } = runtime.controller;

      const queue = finalItems.map((item) => {
        const slash = item.relativePath.lastIndexOf('/');
        return {
          taskId: crypto.randomUUID(),
          item,
          dirPath: slash === -1 ? '' : item.relativePath.slice(0, slash),
        };
      });
      setBatches((current) => [
        ...current,
        {
          id: batchId,
          kind,
          folderName,
          status: 'uploading',
          tasks: queue.map(({ taskId, item }) => ({
            id: taskId,
            name: item.uploadName ?? item.file.name,
            size: item.file.size,
            percent: 0,
            rate: null,
            status: 'pending' as const,
          })),
        },
      ]);

      // Recreate the (possibly nested) folder structure, tracking the top-level
      // folders so a cancel can delete them.
      const folderIdByPath = new Map<string, string>([['', currentFolderId]]);
      const ensureFolder = async (dirPath: string): Promise<string> => {
        const cached = folderIdByPath.get(dirPath);
        if (cached) {
          return cached;
        }
        const slash = dirPath.lastIndexOf('/');
        const parentPath = slash === -1 ? '' : dirPath.slice(0, slash);
        const name = slash === -1 ? dirPath : dirPath.slice(slash + 1);
        const parentId = await ensureFolder(parentPath);
        const created = await createSubfolder(backend, parentId, name);
        folderIdByPath.set(dirPath, created.id);
        if (parentPath === '') {
          runtime.rootFolderIds.push(created.id);
        }
        return created.id;
      };

      for (const { taskId, item, dirPath } of queue) {
        if (signal.aborted) {
          break;
        }
        updateTask(batchId, taskId, { status: 'uploading' });
        try {
          const targetFolderId = await ensureFolder(dirPath);
          const result = await uploadFile(
            backend,
            targetFolderId,
            item.file,
            ({ percent, rate }) => {
              updateTask(batchId, taskId, {
                percent,
                rate,
                status: percent >= 100 ? 'processing' : 'uploading',
              });
            },
            signal,
            item.uploadName,
          );
          if (dirPath === '') {
            runtime.looseFileIds.push(result.fileId);
          }
          updateTask(batchId, taskId, { status: 'done', percent: 100, rate: null });
        } catch (error) {
          if (isCanceledError(error)) {
            break;
          }
          updateTask(batchId, taskId, { status: 'error', rate: null });
          toast.error(`${item.uploadName ?? item.file.name}: ${extractApiErrorMessage(error)}`);
        }
      }

      if (signal.aborted) {
        await rollbackBatch(batchId, backend);
      } else {
        // Replacements are in — now remove the originals they superseded.
        if (replaceIds.length > 0) {
          await Promise.all(replaceIds.map((id) => deleteItem(backend, id).catch(() => undefined)));
        }
        batchRuntime.current.delete(batchId);
        await loadEntries();
        setBatchStatus(batchId, 'done');
        scheduleRemoveBatch(batchId);
      }
    },
    [
      activeBackend,
      currentFolderId,
      entries,
      loadEntries,
      toast,
      askDuplicate,
      updateTask,
      setBatchStatus,
      scheduleRemoveBatch,
      rollbackBatch,
    ],
  );

  const handleDownload = useCallback(
    (entry: ViewEntry) => {
      if (activeBackend === null) {
        return;
      }
      const url = entry.isFolder
        ? folderDownloadUrl(activeBackend, entry.id)
        : fileDownloadUrl(activeBackend, entry.id);
      const id = crypto.randomUUID();
      setDownloads((current) => [...current, { id, name: entry.name }]);

      // Trigger the download without navigating the SPA; the server's
      // Content-Disposition drives the filename (the `download` attr is ignored
      // cross-origin). We can't observe when it starts, so clear "Preparing" after
      // a short delay.
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => {
        setDownloads((current) => current.filter((task) => task.id !== id));
      }, DOWNLOAD_PREPARING_MS);
    },
    [activeBackend],
  );

  const handleCreateFolder = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const name = newFolderName.trim();
      if (currentFolderId === null || activeBackend === null || !name || creating) {
        return;
      }

      setCreating(true);
      try {
        await createSubfolder(activeBackend, currentFolderId, name);
        await loadEntries();
        toast.success(`Folder "${name}" created.`);
        setNewFolderOpen(false);
        setNewFolderName('');
      } catch (error) {
        toast.error(extractApiErrorMessage(error));
      } finally {
        setCreating(false);
      }
    },
    [activeBackend, currentFolderId, newFolderName, creating, loadEntries, toast],
  );

  const confirmDelete = useCallback(async () => {
    if (!confirmTarget || activeBackend === null) {
      return;
    }
    const entry = confirmTarget;

    setDeleting(true);
    try {
      await deleteItem(activeBackend, entry.id);
      await loadEntries();
      if (selected?.id === entry.id) {
        setSelected(null);
      }
      toast.success(`${entry.isFolder ? 'Folder' : 'File'} "${entry.name}" deleted.`);
      setConfirmTarget(null);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }, [activeBackend, confirmTarget, selected, loadEntries, toast]);

  const handleManageFolders = useCallback(async () => {
    try {
      await openPicker(async (folders: PickedFolder[]) => {
        if (folders.length === 0) {
          return;
        }
        setSaving(true);
        try {
          await saveFolders({ folders });
          await loadStatus();
          toast.success(`Saved ${folders.length} allowed folder(s).`);
        } catch (error) {
          toast.error(extractApiErrorMessage(error));
        } finally {
          setSaving(false);
        }
      });
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    }
  }, [openPicker, loadStatus, toast]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectAccount();
      await loadStatus();
      toast.success('Google account disconnected.');
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    }
  }, [loadStatus, toast]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
      setLoggingOut(false);
    }
  }, [router, toast]);

  const rootLabel = activeStatus?.label ?? 'Home';
  const rootIcon = activeBackend ? STORAGE_ICON[activeBackend] : 'Home';

  return (
    <div className='flex h-screen gap-3 overflow-hidden p-3'>
      <AccountSidebar
        statuses={statuses}
        driveStatus={driveStatus}
        activeBackend={activeBackend}
        loading={loadingStatus}
        username={username}
        saving={saving}
        onSelectStorage={selectStorage}
        onManageFolders={handleManageFolders}
        onDisconnect={handleDisconnect}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />

      <main className='flex min-w-0 flex-1 gap-3'>
        <FileBrowser
          path={path}
          rootLabel={rootLabel}
          rootIcon={rootIcon}
          entries={entries}
          loading={currentFolderId === null ? loadingStatus : loadingEntries}
          selectedId={selected?.id ?? null}
          canUpload={currentFolderId !== null}
          hasStorage={activeBackend !== null}
          onNavigate={navigate}
          onOpenFolder={openFolder}
          onSelect={setSelected}
          onUpload={handleUpload}
          onNewFolder={() => setNewFolderOpen(true)}
        />
        <PreviewPanel
          entry={selected}
          isRoot={atRoots}
          backend={activeBackend}
          onClose={() => setSelected(null)}
          onDelete={setConfirmTarget}
          onDownload={handleDownload}
        />
      </main>

      <UploadDock batches={batches} downloads={downloads} onCancelBatch={cancelBatch} />

      {/* Duplicate name modal */}
      <Modal
        open={duplicate !== null}
        onClose={() => resolveDuplicate('cancel')}
        title='Items already exist'>
        <div className='flex flex-col gap-y-5'>
          <p className='text-sm text-zinc-600 dark:text-zinc-400'>
            {duplicate?.length === 1
              ? 'An item with this name already exists here:'
              : `${duplicate?.length} items with these names already exist here:`}
          </p>
          <ul className='max-h-32 overflow-y-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900'>
            {duplicate?.map((name) => (
              <li key={name} className='truncate'>
                {name}
              </li>
            ))}
          </ul>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button variant='transparent' onClick={() => resolveDuplicate('cancel')}>
              Cancel
            </Button>
            <Button variant='normal' onClick={() => resolveDuplicate('keep')}>
              Keep both
            </Button>
            <Button variant='primary' onClick={() => resolveDuplicate('replace')}>
              Replace
            </Button>
          </div>
        </div>
      </Modal>

      {/* New folder modal */}
      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title='New folder'>
        <form onSubmit={handleCreateFolder} className='flex flex-col gap-y-4'>
          <Input
            name='folderName'
            label='Folder name'
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            autoFocus
          />
          <div className='flex justify-end gap-x-2'>
            <Button variant='transparent' onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button type='submit' variant='primary' loading={creating} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.isFolder ? 'Delete folder' : 'Delete file'}>
        <div className='flex flex-col gap-y-5'>
          <div className='flex gap-x-3'>
            <div className='bg-red-500/10 text-red-500 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full'>
              <Icon icon='ExclamationTriangle' className='h-5 w-5' />
            </div>
            <p className='text-zinc-600 dark:text-zinc-400 text-sm'>
              {confirmTarget?.isFolder
                ? `Delete the folder "${confirmTarget?.name}" and everything inside it? This cannot be undone.`
                : `Delete the file "${confirmTarget?.name}"? This cannot be undone.`}
            </p>
          </div>
          <div className='flex justify-end gap-x-2'>
            <Button variant='transparent' onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant='danger' loading={deleting} onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
