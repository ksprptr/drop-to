'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  claimDriveOwnerAction,
  disconnectAction,
  removeFolderAction,
  revokeDriveOwnerAction,
  saveFoldersAction,
} from '@/actions/auth/auth.actions';
import {
  createFolderAction,
  deleteItemAction,
  listContentsAction,
  moveItemAction,
  renameItemAction,
  resolvePathAction,
  statusesAction,
} from '@/actions/storage/storage.actions';
import { useBrowsePane } from '@/common/hooks/useBrowsePane';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import {
  fileDownloadUrl,
  folderDownloadUrl,
  uploadFile,
} from '@/common/services/api/storage.client';
import { type PickedFolder, usePicker } from '@/common/services/picker/usePicker';
import type {
  BatchRuntime,
  Crumb,
  SortDir,
  SortKey,
  UploadBatch,
  UploadItem,
  ViewEntry,
} from '@/common/types/workspace.types';
import { extractApiErrorMessage, isCanceledError } from '@/common/utils/error.functions';
import { buildWorkspaceUrl, slugify } from '@/common/utils/storage-url';
import {
  isIgnoredUploadName,
  isTopLevelFolder,
  topLevelName,
  uniqueName,
} from '@/common/utils/upload.functions';
import { toViewEntries } from '@/common/utils/view-entry.functions';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';
import Modal from '@/components/common/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { UploadProvider, useUploadActions } from '@/components/providers/UploadProvider';
import { STORAGE_ICON } from '@/configs/storage.config';

import AccountSidebar from './AccountSidebar';
import FileBrowser from './FileBrowser';
import PreviewPanel from './PreviewPanel';
import UploadDock from './UploadDock';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOWNLOAD_PREPARING_MS = 6000;

interface Props {
  username: string;
  /** Statuses fetched server-side, for first paint. */
  initialStatuses: StorageStatus[];
  /** Backend from the URL (already validated connected), for first paint without a flash. */
  initialBackend?: StorageBackend | null;
  /** Breadcrumb resolved server-side (root + named folders), so a deep link paints with real names. */
  initialPath?: Crumb[];
  /** The URL points at a folder that doesn't exist / isn't authorized (server-detected 404). */
  initialNotFound?: boolean;
}

/**
 * First connected backend (or null) — used to auto-select a storage.
 **/
const pickDefaultBackend = (statuses: StorageStatus[]): StorageBackend | null =>
  statuses.find((status) => status.connected)?.backend ?? null;

/**
 * Splits a name into base + extension (leading/trailing dot = no extension).
 **/
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
 * Main workspace: sidebar + file browser + preview, with uploads and account management.
 **/
function WorkspaceInner({
  username,
  initialStatuses,
  initialBackend,
  initialPath,
  initialNotFound,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const toast = useToast();
  const { openPicker } = usePicker();
  const {
    setBatches,
    setDownloads,
    updateTask,
    setBatchStatus,
    scheduleRemoveBatch,
    batchRuntime,
  } = useUploadActions();

  const [statuses, setStatuses] = useState<StorageStatus[]>(initialStatuses);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [activeBackend, setActiveBackend] = useState<StorageBackend | null>(initialBackend ?? null);
  const [path, setPath] = useState<Crumb[]>(initialPath ?? []);
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [search, setSearch] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<ViewEntry | null>(null);
  const [duplicate, setDuplicate] = useState<string[] | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ViewEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unselectTarget, setUnselectTarget] = useState<ViewEntry | null>(null);
  const [unselecting, setUnselecting] = useState(false);
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
  const duplicateResolve = useRef<((choice: 'replace' | 'keep' | 'cancel') => void) | null>(null);
  // Bumped on every listing read; a resolved request whose id no longer matches is stale (the
  // operator navigated away mid-flight) and must not paint over the current folder.
  const listSeq = useRef(0);
  // id → display name, so navigating (and rebuilding a deep-linked breadcrumb) shows real names.
  const nameCache = useRef<Map<string, string>>(
    new Map((initialPath ?? []).map((crumb) => [crumb.id, crumb.name])),
  );
  // id → Drive web-view link, so the breadcrumb / toolbar "Copy link" always points at the real folder.
  const linkCache = useRef<Map<string, string | null>>(
    new Map((initialPath ?? []).map((crumb) => [crumb.id, crumb.webViewLink])),
  );

  const driveStatus = statuses.find((status) => status.backend === 'drive') ?? null;
  const activeStatus = activeBackend
    ? (statuses.find((status) => status.backend === activeBackend) ?? null)
    : null;

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  // Server-detected 404 (bad folder URL): shown in the file area until the operator navigates away.
  const notFoundPathname = useRef(initialNotFound ? pathname : null);
  const notFound = notFoundPathname.current !== null && notFoundPathname.current === pathname;

  // Sort lives in the URL query (?sort=&dir=) so it's shareable; the main pane is controlled by it.
  const sortParam = searchParams.get('sort');
  const sortKey: SortKey = sortParam === 'modified' || sortParam === 'size' ? sortParam : 'name';
  const sortDir: SortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

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

  // Refresh statuses on demand; the initial ones come from the server (no mount fetch).
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
      // The storage went away mid-session (revoked Drive token / dead S3), or the folder itself was
      // deleted outside the app — either way the roots in the sidebar may be stale.
      if (error.status === 424 || error.status === 404) {
        void loadStatus();
      }
    },
    [toast, loadStatus],
  );

  // The second (split) pane: an independent browser over the same backend.
  const paneB = useBrowsePane(activeBackend, roots, onPaneError);

  // Derive the browse location from the URL; navigation updates it via window.history (no server round-trip).
  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const paramBackend = segments[0] === 'drive' || segments[0] === 's3' ? segments[0] : null;
    const connected = statuses.filter((status) => status.connected).map((status) => status.backend);

    // Server-detected 404: keep the sidebar (select the backend) but don't load the bad folder.
    if (notFound) {
      if (paramBackend && connected.includes(paramBackend)) {
        setActiveBackend(paramBackend);
      }
      setPath([]);
      return;
    }

    // Only connected backends are browsable; redirect away from an unknown/disconnected URL.
    if (paramBackend === null || !connected.includes(paramBackend)) {
      const fallback = pickDefaultBackend(statuses);
      if (fallback === null) {
        setActiveBackend(null);
        setPath([]);
        setSelected(null);
        return;
      }
      router.replace(`/${fallback}`);
      return;
    }

    const backend = paramBackend;
    const backendRoots = statuses.find((status) => status.backend === backend)?.roots ?? [];
    const folderSegs = segments.slice(1);
    const root =
      folderSegs.length > 0 && backendRoots.find((r) => slugify(r.name) === folderSegs[0]);

    if (!root) {
      setActiveBackend(backend);
      setPath([]);
      setSelected(null);
      return;
    }

    // Names/links come from the cache so the breadcrumb paints instantly; any gap is filled once below.
    const restIds = folderSegs.slice(1);
    setActiveBackend(backend);
    setPath([
      { id: root.id, name: root.name, webViewLink: null },
      ...restIds.map((id) => ({
        id,
        name: nameCache.current.get(id) ?? '',
        webViewLink: linkCache.current.get(id) ?? null,
      })),
    ]);
    setSelected(null);

    const missing = restIds.filter((id) => !nameCache.current.has(id) || !linkCache.current.has(id));
    if (missing.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await resolvePathAction(backend, missing);
      if (cancelled || !result.ok) {
        return;
      }
      for (const pair of result.data ?? []) {
        nameCache.current.set(pair.id, pair.name);
        linkCache.current.set(pair.id, pair.webViewLink);
      }
      setPath((current) =>
        current.map((crumb) => ({
          ...crumb,
          name: nameCache.current.get(crumb.id) ?? crumb.name,
          webViewLink: linkCache.current.get(crumb.id) ?? crumb.webViewLink,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, statuses, router]);

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
      const ownerToken = searchParams.get('ownerToken');
      void (async () => {
        if (ownerToken) {
          await claimDriveOwnerAction(ownerToken);
        }
        await loadStatus();
      })();
    }
    const error = searchParams.get('error');
    if (error) {
      toast.error(`Failed to connect the Google account (${error}).`);
    }
    if (searchParams.get('connected') || searchParams.get('error')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams, toast, loadStatus]);

  // A new folder starts unfiltered.
  useEffect(() => {
    setSearch('');
  }, [currentFolderId, activeBackend]);

  const loadEntries = useCallback(async () => {
    const seq = ++listSeq.current;

    if (currentFolderId === null || activeBackend === null) {
      setEntries(roots);
      setNextPageToken(null);
      setLoadingEntries(false);
      return;
    }

    setLoadingEntries(true);
    const result = await listContentsAction(activeBackend, currentFolderId, {
      // Drive filters server-side; S3 lists the whole level and is filtered client-side.
      search: activeBackend === 'drive' && debouncedSearch ? debouncedSearch : undefined,
      sortKey,
      sortDir,
    });

    // Superseded while in flight — a newer read owns the view now.
    if (seq !== listSeq.current) {
      return;
    }

    if (result.ok) {
      setEntries(toViewEntries(result.data?.entries ?? []));
      setNextPageToken(result.data?.nextPageToken ?? null);
    } else {
      toast.error(result.error ?? 'Failed to open the folder.');
      // Storage disconnected, or the folder was deleted in Drive — refresh so the sidebar reflects it.
      if (result.status === 424 || result.status === 404) {
        void loadStatus();
      }
    }
    setLoadingEntries(false);
  }, [activeBackend, currentFolderId, roots, toast, loadStatus, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const loadMoreEntries = useCallback(async () => {
    if (
      nextPageToken === null ||
      activeBackend === null ||
      currentFolderId === null ||
      loadingMore
    ) {
      return;
    }

    const seq = listSeq.current;
    setLoadingMore(true);
    const result = await listContentsAction(activeBackend, currentFolderId, {
      pageToken: nextPageToken,
      search: activeBackend === 'drive' && debouncedSearch ? debouncedSearch : undefined,
      sortKey,
      sortDir,
    });

    // The folder changed under us — appending this page would mix two listings.
    if (seq !== listSeq.current) {
      setLoadingMore(false);
      return;
    }

    if (result.ok) {
      // Append (never replace) so the scroll position is preserved during infinite scroll.
      setEntries((current) => [...current, ...toViewEntries(result.data?.entries ?? [])]);
      setNextPageToken(result.data?.nextPageToken ?? null);
    } else if (result.status === 424 || result.status === 404) {
      void loadStatus();
    }
    setLoadingMore(false);
  }, [
    nextPageToken,
    activeBackend,
    currentFolderId,
    loadingMore,
    debouncedSearch,
    sortKey,
    sortDir,
    loadStatus,
  ]);

  // Reload both panes after a mutation so the source and destination both refresh.
  const reloadPanes = useCallback(async () => {
    await Promise.all([loadEntries(), split ? paneB.reload() : Promise.resolve()]);
  }, [loadEntries, split, paneB]);

  const openFolder = useCallback(
    (entry: ViewEntry) => {
      if (activeBackend === null) {
        return;
      }
      nameCache.current.set(entry.id, entry.name);
      linkCache.current.set(entry.id, entry.webViewLink);
      const url = buildWorkspaceUrl(activeBackend, [
        ...path,
        { id: entry.id, name: entry.name, webViewLink: entry.webViewLink },
      ]);
      window.history.pushState(null, '', url);
    },
    [activeBackend, path],
  );

  const navigate = useCallback(
    (index: number) => {
      if (activeBackend === null) {
        return;
      }
      const url = buildWorkspaceUrl(activeBackend, index < 0 ? [] : path.slice(0, index + 1));
      window.history.pushState(null, '', url);
    },
    [activeBackend, path],
  );

  const selectStorage = useCallback((backend: StorageBackend) => {
    window.history.pushState(null, '', `/${backend}`);
  }, []);

  // The Drive link of the folder currently open in the main pane (null at roots / for S3).
  const currentFolderLink = path.length > 0 ? path[path.length - 1].webViewLink : null;

  // Copies a Drive link to the clipboard (toolbar = current folder, row/preview = a specific item).
  const copyDriveLink = useCallback(
    (link: string | null) => {
      if (!link) {
        return;
      }
      void navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard.');
    },
    [toast],
  );

  // Opens a Drive link in a new tab (null-safe, so a missing link is a no-op).
  const openDriveLink = useCallback((link: string | null) => {
    if (link) {
      window.open(link, '_blank');
    }
  }, []);

  const handleCopyLink = useCallback(
    () => copyDriveLink(currentFolderLink),
    [copyDriveLink, currentFolderLink],
  );

  const handleOpenInDrive = useCallback(
    () => openDriveLink(currentFolderLink),
    [openDriveLink, currentFolderLink],
  );

  const handleCopyEntryLink = useCallback(
    (entry: ViewEntry) => copyDriveLink(entry.webViewLink),
    [copyDriveLink],
  );

  // Split pane's current folder link + its toolbar "Copy link" / "Open in Drive" handlers.
  const paneBFolderLink =
    paneB.path.length > 0 ? paneB.path[paneB.path.length - 1].webViewLink : null;
  const handleCopyPaneBLink = useCallback(
    () => copyDriveLink(paneBFolderLink),
    [copyDriveLink, paneBFolderLink],
  );
  const handleOpenPaneBInDrive = useCallback(
    () => openDriveLink(paneBFolderLink),
    [openDriveLink, paneBFolderLink],
  );

  const handleToggleSort = useCallback(
    (key: SortKey) => {
      const nextDir: SortDir = key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
      const base = activeBackend
        ? buildWorkspaceUrl(activeBackend, path)
        : window.location.pathname;
      // Default (name/asc) stays out of the URL to keep it clean.
      const query = key === 'name' && nextDir === 'asc' ? '' : `?sort=${key}&dir=${nextDir}`;
      window.history.replaceState(null, '', `${base}${query}`);
    },
    [sortKey, sortDir, activeBackend, path],
  );

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

  // Move the given ids into a target folder (Finder-style drop onto a folder row, same pane).
  const handleMoveIntoFolder = useCallback(
    async (targetFolderId: string, ids: string[]) => {
      if (activeBackend === null) {
        return;
      }
      // Can't move a folder into itself.
      const moveIds = ids.filter((id) => id !== targetFolderId);
      if (moveIds.length === 0) {
        return;
      }
      const backend = activeBackend;

      const count = `${moveIds.length} item${moveIds.length === 1 ? '' : 's'}`;
      const toastId = toast.loading(`Moving ${count}…`);

      const results = await Promise.all(
        moveIds.map((id) => moveItemAction(backend, id, targetFolderId)),
      );
      const failed = results.filter((result) => !result.ok).length;

      await reloadPanes();
      setSelectedIds(new Set());
      paneB.clearSelection();
      if (selected && moveIds.includes(selected.id)) {
        setSelected(null);
      }

      toast.update(toastId, {
        variant: failed > 0 ? 'error' : 'success',
        message:
          failed > 0
            ? `Failed to move ${failed} item${failed === 1 ? '' : 's'}.`
            : `Moved ${count}.`,
      });
    },
    [activeBackend, toast, reloadPanes, paneB, selected],
  );

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

      const count = `${ids.length} item${ids.length === 1 ? '' : 's'}`;
      // A move can take a while (S3 copies whole folders), so show a live toast.
      const toastId = toast.loading(`Moving ${count}…`);

      const results = await Promise.all(
        ids.map((id) => moveItemAction(backend, id, targetFolderId)),
      );
      const failed = results.filter((result) => !result.ok).length;

      await reloadPanes();
      setSelectedIds(new Set());
      paneB.clearSelection();
      if (selected && ids.includes(selected.id)) {
        setSelected(null);
      }

      if (failed > 0) {
        toast.update(toastId, {
          variant: 'error',
          message: `Failed to move ${failed} item${failed === 1 ? '' : 's'}.`,
        });
      } else {
        toast.update(toastId, { variant: 'success', message: `Moved ${count}.` });
      }
    },
    [dragMove, activeBackend, currentFolderId, paneB, reloadPanes, selected, toast],
  );

  // --- Upload orchestration -----------------------------------------------------

  // Undo a batch: delete everything it created so a cancel leaves nothing behind.
  const rollbackBatch = useCallback(
    async (batchId: string, backend: StorageBackend) => {
      // Flip the batch and its rows to cancelled (the dock turns them red).
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
    [reloadPanes, setBatchStatus, scheduleRemoveBatch, setBatches, batchRuntime],
  );

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
    async (droppedItems: UploadItem[], pane: 0 | 1 = 0) => {
      const items = droppedItems.filter((item) => !isIgnoredUploadName(item.relativePath));
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
      // "Replace": upload first, delete originals only once they're safely in.
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
        finalItems
          .filter((item) => isTopLevelFolder(item.relativePath))
          .map((item) => topLevelName(item.relativePath)),
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

      // Recreate the nested folder structure, tracking top-level folders for cancel.
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
          // eslint-disable-next-line no-await-in-loop -- uploads run one at a time (progress + folder dedup)
          const uploadFolderId = await ensureFolder(dirPath);
          // eslint-disable-next-line no-await-in-loop -- sequential upload queue
          const result = await uploadFile(
            backend,
            uploadFolderId,
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
        try {
          // Replacements are in — now remove the originals they superseded.
          if (replaceIds.length > 0) {
            await Promise.all(replaceIds.map((id) => deleteItemAction(backend, id)));
          }
          await reloadPanes();
        } finally {
          batchRuntime.current.delete(batchId);
          setBatchStatus(batchId, 'done');
          scheduleRemoveBatch(batchId);
        }
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

      // Download via a transient anchor; can't observe start, so clear "Preparing" after a delay.
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
          // The parent is gone (deleted outside the app) — drop it from the sidebar roots.
          if (result.status === 424 || result.status === 404) {
            void loadStatus();
          }
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
    [
      activeBackend,
      currentFolderId,
      paneB,
      newFolderPane,
      newFolderName,
      creating,
      reloadPanes,
      toast,
      loadStatus,
    ],
  );

  /**
   * Drops an id from the preview and both panes' selection (after it's deleted or its id changed).
   **/
  const forgetEntry = useCallback(
    (id: string) => {
      setSelected((current) => (current?.id === id ? null : current));
      setSelectedIds((current) => {
        if (!current.has(id)) {
          return current;
        }
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      paneB.pruneSelection(id);
    },
    [paneB],
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
      forgetEntry(entry.id);
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

  const setSelection = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);

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
      // Renaming to the same name is a no-op (and an S3 self-delete) — guard it.
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
        // The id can change on rename (S3 keys), so drop the old id from selection/preview.
        forgetEntry(renameTarget.id);
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

      // Warn (Finder-style) before changing a file's extension. Folders have none.
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
      await revokeDriveOwnerAction();
      await loadStatus();
      toast.success('Google account disconnected.');
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    }
  }, [loadStatus, toast]);

  const confirmUnselect = useCallback(async () => {
    if (!unselectTarget) {
      return;
    }
    setUnselecting(true);
    try {
      const result = await removeFolderAction(unselectTarget.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Something went wrong.');
        return;
      }
      setUnselectTarget(null);
      await loadStatus();
      toast.success('Folder removed from the app.');
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setUnselecting(false);
    }
  }, [unselectTarget, loadStatus, toast]);

  const handleLogout = useCallback(() => {
    setLoggingOut(true);
    // /logout revokes the session, clears cookies and redirects (full navigation).
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
        isOwner={driveStatus?.isOwner ?? false}
        onSelectStorage={selectStorage}
        onManageFolders={handleManageFolders}
        onDisconnect={handleDisconnect}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />

      <main className='flex min-w-0 flex-1 gap-3'>
        {/* Both panes share a grid whose second column animates 1fr↔0fr for a smooth resize. */}
        <div
          className='grid min-w-0 flex-1 grid-rows-1 transition-all duration-200 ease-out'
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
            notFound={notFound}
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
            onDeselect={() => {
              setSelected(null);
              clearSelection();
            }}
            onUpload={(items) => handleUpload(items, 0)}
            onNewFolder={() => {
              setNewFolderPane(0);
              setNewFolderOpen(true);
            }}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onSetSelectedIds={setSelection}
            onBulkDelete={() => {
              setBulkPane(0);
              setBulkDeleteOpen(true);
            }}
            onDownload={handleDownload}
            onRename={openRename}
            onDelete={setConfirmTarget}
            storagePicker={{
              storages: statuses,
              activeBackend,
              onSelect: selectStorage,
            }}
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={handleToggleSort}
            onCopyLink={currentFolderLink ? handleCopyLink : undefined}
            onOpenInDrive={currentFolderLink ? handleOpenInDrive : undefined}
            onCopyEntryLink={handleCopyEntryLink}
            searchQuery={search}
            onSearchChange={setSearch}
            hasMore={nextPageToken !== null}
            loadingMore={loadingMore}
            onLoadMore={loadMoreEntries}
            onMoveIntoFolder={handleMoveIntoFolder}
            onUnselectRoot={
              activeBackend === 'drive' && (driveStatus?.isOwner ?? false)
                ? setUnselectTarget
                : undefined
            }
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
                onDeselect={() => {
                  setSelected(null);
                  paneB.clearSelection();
                }}
                onUpload={(items) => handleUpload(items, 1)}
                onNewFolder={() => {
                  setNewFolderPane(1);
                  setNewFolderOpen(true);
                }}
                onToggleSelect={paneB.toggleSelect}
                onSelectAll={paneB.selectAll}
                onClearSelection={paneB.clearSelection}
                onSetSelectedIds={paneB.setSelection}
                onBulkDelete={() => {
                  setBulkPane(1);
                  setBulkDeleteOpen(true);
                }}
                onDownload={handleDownload}
                onRename={openRename}
                onDelete={setConfirmTarget}
                sortKey={paneB.sortKey}
                sortDir={paneB.sortDir}
                onToggleSort={paneB.toggleSort}
                searchQuery={paneB.search}
                onSearchChange={paneB.setSearch}
                hasMore={paneB.hasMore}
                loadingMore={paneB.loadingMore}
                onLoadMore={paneB.loadMore}
                onCopyLink={paneBFolderLink ? handleCopyPaneBLink : undefined}
                onOpenInDrive={paneBFolderLink ? handleOpenPaneBInDrive : undefined}
                onCopyEntryLink={handleCopyEntryLink}
                onMoveIntoFolder={handleMoveIntoFolder}
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
          onCopyLink={handleCopyEntryLink}
        />
      </main>

      <UploadDock />

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
            <Button variant='soft-danger' onClick={() => resolveDuplicate('cancel')}>
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
            <Button variant='soft-danger' onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              loading={creating}
              disabled={!newFolderName.trim()}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

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
              variant='soft-danger'
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
            <Button variant='soft-danger' onClick={() => setExtWarning(null)}>
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

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title='Delete items'
        message={`Delete the ${bulkCount} selected item${bulkCount === 1 ? '' : 's'}, including everything inside any selected folders? This cannot be undone.`}
        confirmLabel='Delete'
        loading={bulkDeleting}
        onConfirm={confirmBulkDelete}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.isFolder ? 'Delete folder' : 'Delete file'}
        message={
          confirmTarget?.isFolder
            ? `Delete the folder "${confirmTarget?.name}" and everything inside it? This cannot be undone.`
            : `Delete the file "${confirmTarget?.name}"? This cannot be undone.`
        }
        confirmLabel='Delete'
        loading={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={unselectTarget !== null}
        onClose={() => setUnselectTarget(null)}
        title='Remove folder'
        message={`Remove "${unselectTarget?.name}" from the app? It stays in Google Drive — only its authorization here is revoked.`}
        confirmLabel='Remove'
        loading={unselecting}
        onConfirm={confirmUnselect}
      />
    </div>
  );
}

/**
 * Wraps the workspace in the upload provider so progress ticks re-render only the dock.
 **/
export default function WorkspaceClient(props: Props) {
  return (
    <UploadProvider>
      <WorkspaceInner {...props} />
    </UploadProvider>
  );
}
