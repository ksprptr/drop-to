'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { disconnectAction, saveFoldersAction } from '@/actions/auth/auth.actions';
import {
  createFolderAction,
  deleteItemAction,
  listContentsAction,
  moveItemAction,
  renameItemAction,
  statusesAction,
} from '@/actions/storage/storage.actions';
import { useBrowsePane } from '@/common/hooks/useBrowsePane';
import { fileDownloadUrl, folderDownloadUrl, uploadFile } from '@/common/services/api/storage.client';
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
  /** Storage statuses fetched on the server, so the sidebar has data on first paint. */
  initialStatuses: StorageStatus[];
}

/**
 * Returns the first connected backend (or null), used to auto-select a storage.
 */
const pickDefaultBackend = (statuses: StorageStatus[]): StorageBackend | null =>
  statuses.find((status) => status.connected)?.backend ?? null;

/**
 * Splits a file name into its base and extension (the extension includes the
 * leading dot, e.g. `.png`). A leading dot (hidden files) or a trailing dot is
 * treated as "no extension", matching how a desktop file manager sees it.
 */
const splitExtension = (name: string): { base: string; ext: string } => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return { base: name, ext: '' };
  }
  return { base: name.slice(0, dot), ext: name.slice(dot) };
};

/** A pending extension change awaiting confirmation (the "modal on a modal"). */
interface ExtensionWarning {
  /** The name exactly as typed (keeps the new extension). */
  use: string;
  /** The typed base name but with the original extension kept. */
  keep: string;
  /** The original extension (`''` when the file had none). */
  fromExt: string;
  /** The new extension (`''` when the new name has none). */
  toExt: string;
}

/**
 * The main workspace: a Finder-like three-pane view (storage sidebar, file
 * browser, preview panel) with drag-and-drop uploads and account management. The
 * sidebar switches between storage backends (Google Drive, S3); the active
 * backend's roots (authorized folders / buckets) are the top level.
 */
export default function WorkspaceClient({ username, initialStatuses }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { openPicker } = usePicker();

  const [statuses, setStatuses] = useState<StorageStatus[]>(initialStatuses);
  const [loadingStatus, setLoadingStatus] = useState(false);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [split, setSplit] = useState(false);
  const [activePane, setActivePane] = useState<0 | 1>(0);
  const [bulkPane, setBulkPane] = useState<0 | 1>(0);
  const [dragMove, setDragMove] = useState<{ ids: string[]; sourcePane: 0 | 1 } | null>(null);
  const [renameTarget, setRenameTarget] = useState<ViewEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [pendingRename, setPendingRename] = useState<string | null>(null);
  const [extWarning, setExtWarning] = useState<ExtensionWarning | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPane, setNewFolderPane] = useState<0 | 1>(0);
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

  // Refreshes statuses on demand (after connect/disconnect/save or a disconnect
  // mid-session). The initial statuses come from the server, so there is no
  // load-on-mount waterfall here.
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    const result = await statusesAction();
    if (result.ok) {
      setStatuses(result.data ?? []);
    } else {
      toast.error(result.error ?? 'Failed to load storage status.');
    }
    setLoadingStatus(false);
  }, [toast]);

  const onPaneError = useCallback(
    (error: { error?: string; status?: number }) => {
      toast.error(error.error ?? 'Failed to open the folder.');
      // The active storage went away mid-session (revoked Drive token / dead S3).
      if (error.status === 424) {
        void loadStatus();
      }
    },
    [toast, loadStatus],
  );

  // The second (split) pane: an independent browser over the same backend.
  const paneB = useBrowsePane(activeBackend, roots, onPaneError);

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

  // Drop any multi-select whenever the folder or storage changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId, activeBackend]);

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
    const result = await listContentsAction(activeBackend, currentFolderId);
    if (result.ok) {
      setEntries(
        (result.data ?? []).map((entry) => ({
          id: entry.id,
          name: entry.name,
          isFolder: entry.isFolder,
          size: entry.size,
          mimeType: entry.mimeType,
          modifiedTime: entry.modifiedTime,
          webViewLink: entry.webViewLink,
        })),
      );
    } else {
      toast.error(result.error ?? 'Failed to open the folder.');
      // The active storage went away mid-session (revoked Drive token / dead S3):
      // refresh the statuses so the sidebar flips to its reconnect/unavailable state.
      if (result.status === 424) {
        void loadStatus();
      }
    }
    setLoadingEntries(false);
  }, [activeBackend, currentFolderId, roots, toast, loadStatus]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Reload both panes after a mutation so the source and destination both refresh.
  const reloadPanes = useCallback(async () => {
    await Promise.all([loadEntries(), split ? paneB.reload() : Promise.resolve()]);
  }, [loadEntries, split, paneB]);

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

  // --- Split view + drag-to-move ------------------------------------------------

  const toggleSplit = useCallback(() => {
    setSplit((current) => {
      const next = !current;
      if (next) {
        // Open the second pane at the same location as the primary one.
        paneB.goTo(path);
      } else {
        setDragMove(null);
        setActivePane(0);
      }
      return next;
    });
  }, [paneB, path]);

  // Close the split (and any drag) if the storage disconnects entirely.
  useEffect(() => {
    if (activeBackend === null) {
      setSplit(false);
      setDragMove(null);
    }
  }, [activeBackend]);

  // Keyboard shortcut (Cmd/Ctrl + \) to toggle the split view.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        // Only open the split from inside a folder; closing is always allowed.
        if (!split && currentFolderId === null) {
          return;
        }
        event.preventDefault();
        toggleSplit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [split, currentFolderId, toggleSplit]);

  const handleMoveDrop = useCallback(
    async (targetPane: 0 | 1) => {
      if (!dragMove || activeBackend === null || dragMove.sourcePane === targetPane) {
        return;
      }
      const backend = activeBackend;
      const { ids } = dragMove;
      const sourceFolderId = dragMove.sourcePane === 0 ? currentFolderId : paneB.currentFolderId;
      const targetFolderId = targetPane === 0 ? currentFolderId : paneB.currentFolderId;
      setDragMove(null);

      if (targetFolderId === null) {
        return;
      }
      if (sourceFolderId === targetFolderId) {
        toast.error('Items are already in that folder.');
        return;
      }

      const results = await Promise.all(ids.map((id) => moveItemAction(backend, id, targetFolderId)));
      const failed = results.filter((result) => !result.ok).length;

      await reloadPanes();
      setSelectedIds(new Set());
      paneB.clearSelection();
      if (selected && ids.includes(selected.id)) {
        setSelected(null);
      }

      if (failed > 0) {
        toast.error(`Failed to move ${failed} item${failed === 1 ? '' : 's'}.`);
      } else {
        toast.success(`Moved ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
      }
    },
    [dragMove, activeBackend, currentFolderId, paneB, reloadPanes, selected, toast],
  );

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
            deleteItemAction(backend, id),
          ),
        );
        batchRuntime.current.delete(batchId);
      }
      await reloadPanes();
      setBatchStatus(batchId, 'canceled');
      scheduleRemoveBatch(batchId);
    },
    [reloadPanes, setBatchStatus, scheduleRemoveBatch],
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
    async (items: UploadItem[], pane: 0 | 1 = 0) => {
      const targetFolderId = pane === 0 ? currentFolderId : paneB.currentFolderId;
      const existing = pane === 0 ? entries : paneB.entries;
      if (targetFolderId === null || activeBackend === null || items.length === 0) {
        return;
      }
      const backend = activeBackend;

      // Detect name conflicts among the top-level items being added here.
      const existingNames = new Set(existing.map((entry) => entry.name));
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
          replaceIds = existing
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
      const folderIdByPath = new Map<string, string>([['', targetFolderId]]);
      const ensureFolder = async (dirPath: string): Promise<string> => {
        const cached = folderIdByPath.get(dirPath);
        if (cached) {
          return cached;
        }
        const slash = dirPath.lastIndexOf('/');
        const parentPath = slash === -1 ? '' : dirPath.slice(0, slash);
        const name = slash === -1 ? dirPath : dirPath.slice(slash + 1);
        const parentId = await ensureFolder(parentPath);
        const result = await createFolderAction(backend, parentId, name);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? 'Failed to create folder.');
        }
        const created = result.data;
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
          await Promise.all(replaceIds.map((id) => deleteItemAction(backend, id)));
        }
        batchRuntime.current.delete(batchId);
        await reloadPanes();
        setBatchStatus(batchId, 'done');
        scheduleRemoveBatch(batchId);
      }
    },
    [
      activeBackend,
      currentFolderId,
      paneB,
      entries,
      reloadPanes,
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
      const targetFolderId = newFolderPane === 0 ? currentFolderId : paneB.currentFolderId;
      if (targetFolderId === null || activeBackend === null || !name || creating) {
        return;
      }

      setCreating(true);
      try {
        const result = await createFolderAction(activeBackend, targetFolderId, name);
        if (!result.ok) {
          toast.error(result.error ?? 'Something went wrong.');
          return;
        }
        await reloadPanes();
        toast.success(`Folder "${name}" created.`);
        setNewFolderOpen(false);
        setNewFolderName('');
      } catch (error) {
        toast.error(extractApiErrorMessage(error));
      } finally {
        setCreating(false);
      }
    },
    [activeBackend, currentFolderId, paneB, newFolderPane, newFolderName, creating, reloadPanes, toast],
  );

  const confirmDelete = useCallback(async () => {
    if (!confirmTarget || activeBackend === null) {
      return;
    }
    const entry = confirmTarget;

    setDeleting(true);
    try {
      const result = await deleteItemAction(activeBackend, entry.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Something went wrong.');
        return;
      }
      await reloadPanes();
      if (selected?.id === entry.id) {
        setSelected(null);
      }
      setSelectedIds((current) => {
        if (!current.has(entry.id)) {
          return current;
        }
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
      paneB.pruneSelection(entry.id);
      toast.success(`${entry.isFolder ? 'Folder' : 'File'} "${entry.name}" deleted.`);
      setConfirmTarget(null);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }, [activeBackend, confirmTarget, selected, reloadPanes, paneB, toast]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(entries.map((entry) => entry.id)));
  }, [entries]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const confirmBulkDelete = useCallback(async () => {
    const ids = bulkPane === 0 ? [...selectedIds] : [...paneB.selectedIds];
    if (activeBackend === null || ids.length === 0) {
      return;
    }
    const backend = activeBackend;

    setBulkDeleting(true);
    try {
      const results = await Promise.all(ids.map((id) => deleteItemAction(backend, id)));
      const failed = results.filter((result) => !result.ok).length;

      await reloadPanes();
      if (selected && ids.includes(selected.id)) {
        setSelected(null);
      }
      if (bulkPane === 0) {
        setSelectedIds(new Set());
      } else {
        paneB.clearSelection();
      }
      setBulkDeleteOpen(false);

      if (failed > 0) {
        toast.error(`Failed to delete ${failed} item${failed === 1 ? '' : 's'}.`);
      } else {
        toast.success(`Deleted ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setBulkDeleting(false);
    }
  }, [activeBackend, bulkPane, selectedIds, paneB, selected, reloadPanes, toast]);

  const openRename = useCallback((entry: ViewEntry) => {
    setRenameTarget(entry);
    setRenameName(entry.name);
  }, []);

  const runRename = useCallback(
    async (name: string) => {
      if (!renameTarget || activeBackend === null) {
        return;
      }
      // Renaming to the exact current name is a no-op — and for S3 (copy+delete)
      // it would delete the file, so guard it here for every path into rename.
      if (name === renameTarget.name) {
        setRenameTarget(null);
        setExtWarning(null);
        return;
      }

      setRenaming(true);
      setPendingRename(name);
      try {
        const result = await renameItemAction(activeBackend, renameTarget.id, name);
        if (!result.ok) {
          toast.error(result.error ?? 'Something went wrong.');
          return;
        }
        await reloadPanes();
        // The id can change on rename (S3 ids encode the key), so drop the old id
        // from the preview and any multi-selection pointing at the renamed item.
        if (selected?.id === renameTarget.id) {
          setSelected(null);
        }
        setSelectedIds((current) => {
          if (!current.has(renameTarget.id)) {
            return current;
          }
          const next = new Set(current);
          next.delete(renameTarget.id);
          return next;
        });
        paneB.pruneSelection(renameTarget.id);
        toast.success(`Renamed to "${name}".`);
        setRenameTarget(null);
        setExtWarning(null);
      } catch (error) {
        toast.error(extractApiErrorMessage(error));
      } finally {
        setRenaming(false);
        setPendingRename(null);
      }
    },
    [activeBackend, renameTarget, selected, reloadPanes, paneB, toast],
  );

  const handleRename = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const name = renameName.trim();
      if (!renameTarget || activeBackend === null || !name || renaming) {
        return;
      }
      if (name === renameTarget.name) {
        setRenameTarget(null);
        return;
      }

      // Warn (Finder-style) before changing a file's extension, since it changes
      // how the file is typed/opened. Folders have no extension, so skip them.
      if (!renameTarget.isFolder) {
        const fromExt = splitExtension(renameTarget.name).ext;
        const { base, ext: toExt } = splitExtension(name);
        if (fromExt.toLowerCase() !== toExt.toLowerCase()) {
          setExtWarning({ use: name, keep: `${base}${fromExt}`, fromExt, toExt });
          return;
        }
      }

      void runRename(name);
    },
    [renameName, renameTarget, activeBackend, renaming, runRename],
  );

  const handleManageFolders = useCallback(async () => {
    try {
      await openPicker(async (folders: PickedFolder[]) => {
        if (folders.length === 0) {
          return;
        }
        setSaving(true);
        try {
          const result = await saveFoldersAction({ folders });
          if (!result.ok) {
            toast.error(result.error ?? 'Something went wrong.');
            return;
          }
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
      const result = await disconnectAction();
      if (!result.ok) {
        toast.error(result.error ?? 'Something went wrong.');
        return;
      }
      await loadStatus();
      toast.success('Google account disconnected.');
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    }
  }, [loadStatus, toast]);

  const handleLogout = useCallback(() => {
    setLoggingOut(true);
    // The /logout route handler revokes the session, clears the cookies and
    // redirects to /login — a full navigation so nothing stale is left behind.
    window.location.href = '/logout';
  }, []);

  const rootLabel = activeStatus?.label ?? 'Home';
  const rootIcon = activeBackend ? STORAGE_ICON[activeBackend] : 'Home';
  const bulkCount = bulkPane === 0 ? selectedIds.size : paneB.selectedIds.size;

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
        {/* Both panes live in a grid whose second column animates 1fr↔0fr, so the
            left pane resizes smoothly in sync with the right one appearing/leaving. */}
        <div
          className='grid min-w-0 flex-1 grid-rows-1 transition-all duration-300 ease-out'
          style={{
            gridTemplateColumns: `minmax(0,1fr) minmax(0,${split ? 1 : 0}fr)`,
            columnGap: split ? '0.75rem' : '0px',
          }}>
          <FileBrowser
            path={path}
            rootLabel={rootLabel}
          rootIcon={rootIcon}
          entries={entries}
          loading={currentFolderId === null ? loadingStatus : loadingEntries}
          selectedId={activePane === 0 ? (selected?.id ?? null) : null}
          canUpload={currentFolderId !== null}
          canModify={currentFolderId !== null}
          hasStorage={activeBackend !== null}
          selectedIds={selectedIds}
          split={split}
          onToggleSplit={currentFolderId !== null || split ? toggleSplit : undefined}
          acceptMove={split && dragMove?.sourcePane === 1 && currentFolderId !== null}
          onMoveDragStart={(ids) => setDragMove({ ids, sourcePane: 0 })}
          onMoveDragEnd={() => setDragMove(null)}
          onMoveDrop={() => void handleMoveDrop(0)}
          onNavigate={navigate}
          onOpenFolder={openFolder}
          onSelect={(entry) => {
            setSelected(entry);
            setActivePane(0);
          }}
          onDeselect={() => setSelected(null)}
          onUpload={(items) => handleUpload(items, 0)}
          onNewFolder={() => {
            setNewFolderPane(0);
            setNewFolderOpen(true);
          }}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onBulkDelete={() => {
            setBulkPane(0);
            setBulkDeleteOpen(true);
          }}
          onDownload={handleDownload}
          onRename={openRename}
          onDelete={setConfirmTarget}
        />

          <div className='min-w-0 overflow-hidden'>
            <div
              className={`flex h-full min-w-0 flex-col border-l border-zinc-200 pl-3 transition-opacity duration-300 dark:border-zinc-800 ${
                split ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}>
              <FileBrowser
                path={paneB.path}
                rootLabel={rootLabel}
                rootIcon={rootIcon}
                entries={paneB.entries}
                loading={paneB.atRoots ? loadingStatus : paneB.loading}
                selectedId={activePane === 1 ? (selected?.id ?? null) : null}
                canUpload={paneB.currentFolderId !== null}
                canModify={paneB.currentFolderId !== null}
                hasStorage={activeBackend !== null}
                selectedIds={paneB.selectedIds}
                split={split}
                onToggleSplit={toggleSplit}
                acceptMove={split && dragMove?.sourcePane === 0 && paneB.currentFolderId !== null}
                onMoveDragStart={(ids) => setDragMove({ ids, sourcePane: 1 })}
                onMoveDragEnd={() => setDragMove(null)}
                onMoveDrop={() => void handleMoveDrop(1)}
                onNavigate={paneB.navigate}
                onOpenFolder={paneB.openFolder}
                onSelect={(entry) => {
                  setSelected(entry);
                  setActivePane(1);
                }}
                onDeselect={() => setSelected(null)}
                onUpload={(items) => handleUpload(items, 1)}
                onNewFolder={() => {
                  setNewFolderPane(1);
                  setNewFolderOpen(true);
                }}
                onToggleSelect={paneB.toggleSelect}
                onSelectAll={paneB.selectAll}
                onClearSelection={paneB.clearSelection}
                onBulkDelete={() => {
                  setBulkPane(1);
                  setBulkDeleteOpen(true);
                }}
                onDownload={handleDownload}
                onRename={openRename}
                onDelete={setConfirmTarget}
              />
            </div>
          </div>
        </div>

        <PreviewPanel
          entry={selected}
          isRoot={activePane === 0 ? atRoots : paneB.atRoots}
          backend={activeBackend}
          onClose={() => setSelected(null)}
          onDelete={setConfirmTarget}
          onDownload={handleDownload}
          onRename={openRename}
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

      {/* Rename modal */}
      <Modal
        open={renameTarget !== null}
        onClose={() => {
          setRenameTarget(null);
          setExtWarning(null);
        }}
        title={renameTarget?.isFolder ? 'Rename folder' : 'Rename file'}>
        <form onSubmit={handleRename} className='flex flex-col gap-y-4'>
          <Input
            name='renameName'
            label='Name'
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            autoFocus
          />
          <div className='flex justify-end gap-x-2'>
            <Button
              variant='transparent'
              onClick={() => {
                setRenameTarget(null);
                setExtWarning(null);
              }}>
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              loading={renaming && extWarning === null}
              disabled={!renameName.trim() || renameName.trim() === renameTarget?.name}>
              Rename
            </Button>
          </div>
        </form>
      </Modal>

      {/* Extension-change confirmation (a modal on top of the rename modal) */}
      <Modal
        open={extWarning !== null}
        onClose={() => setExtWarning(null)}
        title='Change extension?'>
        <div className='flex flex-col gap-y-5'>
          <div className='flex gap-x-3'>
            <div className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500'>
              <Icon icon='ExclamationTriangle' className='h-5 w-5' />
            </div>
            <p className='text-sm text-zinc-600 dark:text-zinc-400'>
              {extWarning?.toExt === ''
                ? `Removing the "${extWarning?.fromExt}" extension may change how this file opens.`
                : extWarning?.fromExt === ''
                  ? `Adding the "${extWarning?.toExt}" extension may change this file's type.`
                  : `Changing the extension from "${extWarning?.fromExt}" to "${extWarning?.toExt}" may change this file's type.`}
            </p>
          </div>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button variant='transparent' onClick={() => setExtWarning(null)}>
              Cancel
            </Button>
            <Button
              variant='normal'
              loading={renaming && pendingRename === extWarning?.keep}
              disabled={renaming}
              onClick={() => extWarning && void runRename(extWarning.keep)}>
              {extWarning?.fromExt ? `Keep "${extWarning.fromExt}"` : 'Keep without extension'}
            </Button>
            <Button
              variant='primary'
              loading={renaming && pendingRename === extWarning?.use}
              disabled={renaming}
              onClick={() => extWarning && void runRename(extWarning.use)}>
              {extWarning?.toExt ? `Use "${extWarning.toExt}"` : 'Remove extension'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk delete confirmation modal */}
      <Modal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} title='Delete items'>
        <div className='flex flex-col gap-y-5'>
          <div className='flex gap-x-3'>
            <div className='bg-red-500/10 text-red-500 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full'>
              <Icon icon='ExclamationTriangle' className='h-5 w-5' />
            </div>
            <p className='text-zinc-600 dark:text-zinc-400 text-sm'>
              Delete the {bulkCount} selected item{bulkCount === 1 ? '' : 's'}, including everything
              inside any selected folders? This cannot be undone.
            </p>
          </div>
          <div className='flex justify-end gap-x-2'>
            <Button variant='transparent' onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant='danger' loading={bulkDeleting} onClick={confirmBulkDelete}>
              Delete
            </Button>
          </div>
        </div>
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
