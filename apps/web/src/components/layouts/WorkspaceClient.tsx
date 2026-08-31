'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  claimDriveOwnerAction,
  disconnectAction,
  revokeDriveOwnerAction,
  saveFoldersAction,
} from '@/actions/auth/auth.actions';
import { statusesAction } from '@/actions/storage/storage.actions';
import { DESKTOP_QUERY } from '@/common/constants/layout.constants';
import { useBrowsePane } from '@/common/hooks/useBrowsePane';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import { useEntryListing } from '@/common/hooks/useEntryListing';
import { useEntryOperations } from '@/common/hooks/useEntryOperations';
import { useEntrySelection } from '@/common/hooks/useEntrySelection';
import { useMediaQuery } from '@/common/hooks/useMediaQuery';
import { useSplitPanes } from '@/common/hooks/useSplitPanes';
import { useUploadQueue } from '@/common/hooks/useUploadQueue';
import { useWorkspaceLocation } from '@/common/hooks/useWorkspaceLocation';
import { fileDownloadUrl, folderDownloadUrl } from '@/common/services/api/storage.client';
import { type PickedFolder, usePicker } from '@/common/services/picker/usePicker';
import type { Crumb, ViewEntry } from '@/common/types/workspace.types';
import { extractApiErrorMessage } from '@/common/utils/error.functions';
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
  const searchParams = useSearchParams();
  const toast = useToast();
  const { openPicker } = usePicker();
  const { setDownloads } = useUploadActions();

  const [statuses, setStatuses] = useState<StorageStatus[]>(initialStatuses);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ViewEntry | null>(null);
  const canSplit = useMediaQuery(DESKTOP_QUERY);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handledParams = useRef(false);

  // The browse location (backend, path, sort) is derived from the URL.
  const {
    activeBackend,
    path,
    currentFolderId,
    atRoots,
    notFound,
    sortKey,
    sortDir,
    openFolder,
    navigate,
    selectStorage,
    toggleSort: handleToggleSort,
  } = useWorkspaceLocation({
    statuses,
    initialBackend,
    initialPath,
    initialNotFound,
    onLocationChange: () => setSelected(null),
  });

  const driveStatus = statuses.find((status) => status.backend === 'drive') ?? null;
  const activeStatus = activeBackend
    ? (statuses.find((status) => status.backend === activeBackend) ?? null)
    : null;

  const debouncedSearch = useDebouncedValue(search.trim(), 250);

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

  // Read through a ref: `split` is owned by useSplitPanes, which in turn needs reloadPanes — the
  // ref breaks that cycle without making the reload depend on the split's identity.
  const splitRef = useRef(false);

  // Reload both panes after a mutation so the source and destination both refresh.
  const reloadPanes = useCallback(async () => {
    await Promise.all([loadEntries(), splitRef.current ? paneB.reload() : Promise.resolve()]);
  }, [loadEntries, paneB]);

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

  // The second pane and moving items between panes.
  const {
    split,
    activePane,
    setActivePane,
    dragMove,
    setDragMove,
    toggleSplit,
    moveIntoFolder: handleMoveIntoFolder,
    moveDrop: handleMoveDrop,
  } = useSplitPanes({
    canSplit,
    backend: activeBackend,
    currentFolderId,
    path,
    paneB,
    reloadPanes,
    // A move empties both selections and drops the preview if it was one of the moved items.
    onMoved: (ids) => {
      clearSelection();
      paneB.clearSelection();
      setSelected((current) => (current && ids.includes(current.id) ? null : current));
    },
  });

  splitRef.current = split;

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
