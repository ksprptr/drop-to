'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  claimDriveOwnerAction,
  disconnectAction,
  revokeDriveOwnerAction,
  saveFoldersAction,
} from '@/actions/auth/auth.actions';
import {
  moveItemAction,
  resolvePathAction,
  statusesAction,
} from '@/actions/storage/storage.actions';
import { DESKTOP_QUERY } from '@/common/constants/layout.constants';
import { useBrowsePane } from '@/common/hooks/useBrowsePane';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import { useEntryListing } from '@/common/hooks/useEntryListing';
import { useEntryOperations } from '@/common/hooks/useEntryOperations';
import { useEntrySelection } from '@/common/hooks/useEntrySelection';
import { useMediaQuery } from '@/common/hooks/useMediaQuery';
import { useUploadQueue } from '@/common/hooks/useUploadQueue';
import { fileDownloadUrl, folderDownloadUrl } from '@/common/services/api/storage.client';
import { type PickedFolder, usePicker } from '@/common/services/picker/usePicker';
import type { Crumb, SortDir, SortKey, ViewEntry } from '@/common/types/workspace.types';
import { extractApiErrorMessage } from '@/common/utils/error.functions';
import { buildWorkspaceUrl, slugify } from '@/common/utils/storage-url';
import { useToast } from '@/components/providers/ToastProvider';
import { UploadProvider, useUploadActions } from '@/components/providers/UploadProvider';
import { STORAGE_ICON } from '@/configs/storage.config';

import AccountSidebar from './AccountSidebar';
import type { AccountSidebarProps } from './AccountSidebarContent';
import FileBrowser from './FileBrowser';
import MobileMenu from './mobile/MobileMenu';
import PreviewPanel from './PreviewPanel';
import UploadDock from './UploadDock';
import WorkspaceDialogs from './WorkspaceDialogs';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOWNLOAD_PREPARING_MS = 6000;

interface Props {
  /** Instance name, resolved on the server so the wordmark hydrates identically. */
  appName: string;
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
 * Main workspace: sidebar + file browser + preview, with uploads and account management.
 **/
function WorkspaceInner({
  appName,
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
  const { setDownloads } = useUploadActions();

  const [statuses, setStatuses] = useState<StorageStatus[]>(initialStatuses);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [activeBackend, setActiveBackend] = useState<StorageBackend | null>(initialBackend ?? null);
  const [path, setPath] = useState<Crumb[]>(initialPath ?? []);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ViewEntry | null>(null);
  const canSplit = useMediaQuery(DESKTOP_QUERY);
  const [split, setSplit] = useState(false);
  const [activePane, setActivePane] = useState<0 | 1>(0);
  const [dragMove, setDragMove] = useState<{ ids: string[]; sourcePane: 0 | 1 } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handledParams = useRef(false);
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

  // The main pane's listing and selection — the same primitives the split pane runs on. Only the
  // location differs: this pane reads it from the URL, the split pane from local state.
  const {
    entries,
    loading: loadingEntries,
    hasMore,
    loadingMore,
    loadMore: loadMoreEntries,
    reload: loadEntries,
  } = useEntryListing({
    backend: activeBackend,
    currentFolderId,
    roots,
    search: debouncedSearch,
    sortKey,
    sortDir,
    onError: onPaneError,
  });

  const {
    selectedIds,
    toggleSelect,
    selectAll: selectIds,
    clearSelection,
    setSelection,
    pruneSelection,
  } = useEntrySelection(currentFolderId, activeBackend);

  const selectAll = useCallback(
    () => selectIds(entries.map((entry) => entry.id)),
    [entries, selectIds],
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

    const missing = restIds.filter(
      (id) => !nameCache.current.has(id) || !linkCache.current.has(id),
    );
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

  // Below `md` two panes have no usable width, and moving items between them is a drag & drop
  // gesture touch never fires — so the split collapses back to one pane on a narrow viewport.
  useEffect(() => {
    if (!canSplit) {
      setSplit(false);
      setDragMove(null);
      setActivePane(0);
    }
  }, [canSplit]);

  // Keyboard shortcut (Cmd/Ctrl + \) to toggle the split view.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        // Only open the split from inside a folder, and only where it fits; closing is always allowed.
        if (!split && (currentFolderId === null || !canSplit)) {
          return;
        }
        event.preventDefault();
        toggleSplit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [split, currentFolderId, canSplit, toggleSplit]);

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
      clearSelection();
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
      clearSelection();
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

  // Uploads (duplicate prompt, folder creation, progress, rollback) live in their own hook.
  const paneAccess = useMemo(
    () => ({
      folderId: (pane: 0 | 1) => (pane === 0 ? currentFolderId : paneB.currentFolderId),
      selectedIds: (pane: 0 | 1) => [...(pane === 0 ? selectedIds : paneB.selectedIds)],
      clearSelection: (pane: 0 | 1) => (pane === 0 ? clearSelection() : paneB.clearSelection()),
    }),
    [currentFolderId, paneB, selectedIds, clearSelection],
  );

  const getPaneTarget = useCallback(
    (pane: 0 | 1) =>
      pane === 0
        ? { folderId: currentFolderId, entries }
        : { folderId: paneB.currentFolderId, entries: paneB.entries },
    [currentFolderId, entries, paneB],
  );

  const uploads = useUploadQueue(activeBackend, getPaneTarget, reloadPanes);

  /**
   * Drops ids from the preview and both panes' selection (after a delete or a changed id).
   **/
  const forgetEntries = useCallback(
    (ids: string[]) => {
      setSelected((current) => (current && ids.includes(current.id) ? null : current));
      for (const id of ids) {
        pruneSelection(id);
        paneB.pruneSelection(id);
      }
    },
    [paneB, pruneSelection],
  );

  // Entry mutations (new folder, rename, delete, bulk delete, unauthorize) + their dialog state.
  const ops = useEntryOperations({
    backend: activeBackend,
    panes: paneAccess,
    reloadPanes,
    loadStatus,
    forgetEntries,
  });

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

  const handleLogout = useCallback(() => {
    setLoggingOut(true);
    // /logout revokes the session, clears cookies and redirects (full navigation).
    window.location.href = '/logout';
  }, []);

  const rootLabel = activeStatus?.label ?? 'Home';
  const rootIcon = activeBackend ? STORAGE_ICON[activeBackend] : 'Home';

  // One set of props for both sidebar shells: the desktop rail and the mobile swipe-open drawer.
  const sidebarProps: AccountSidebarProps = {
    appName,
    statuses,
    driveStatus,
    activeBackend,
    loading: loadingStatus,
    username,
    saving,
    isOwner: driveStatus?.isOwner ?? false,
    onSelectStorage: selectStorage,
    onManageFolders: handleManageFolders,
    onDisconnect: handleDisconnect,
    onLogout: handleLogout,
    loggingOut,
  };

  return (
    <div className='flex h-screen gap-3 overflow-hidden p-3'>
      <AccountSidebar {...sidebarProps} />
      <MobileMenu {...sidebarProps} />

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
            onUpload={(items) => uploads.handleUpload(items, 0)}
            onNewFolder={() => ops.newFolder.openFor(0)}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onSetSelectedIds={setSelection}
            onBulkDelete={() => ops.bulkRemove.openFor(0)}
            onDownload={handleDownload}
            onRename={ops.rename.open}
            onDelete={ops.remove.request}
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
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMoreEntries}
            onMoveIntoFolder={handleMoveIntoFolder}
            onUnselectRoot={
              activeBackend === 'drive' && (driveStatus?.isOwner ?? false)
                ? ops.unselectRoot.request
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
                onUpload={(items) => uploads.handleUpload(items, 1)}
                onNewFolder={() => ops.newFolder.openFor(1)}
                onToggleSelect={paneB.toggleSelect}
                onSelectAll={paneB.selectAll}
                onClearSelection={paneB.clearSelection}
                onSetSelectedIds={paneB.setSelection}
                onBulkDelete={() => ops.bulkRemove.openFor(1)}
                onDownload={handleDownload}
                onRename={ops.rename.open}
                onDelete={ops.remove.request}
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
          onDelete={ops.remove.request}
          onDownload={handleDownload}
          onRename={ops.rename.open}
          onCopyLink={handleCopyEntryLink}
        />
      </main>

      <UploadDock />

      <WorkspaceDialogs ops={ops} uploads={uploads} />
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
