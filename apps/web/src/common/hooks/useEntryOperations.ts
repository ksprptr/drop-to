'use client';

import type { StorageBackend } from '@dropto/types';
import { type FormEvent, useCallback, useState } from 'react';

import { removeFolderAction } from '@/actions/auth/auth.actions';
import {
  createFolderAction,
  deleteItemAction,
  renameItemAction,
} from '@/actions/storage/storage.actions';
import type { ViewEntry } from '@/common/types/workspace.types';
import { extractApiErrorMessage } from '@/common/utils/error.functions';
import { useToast } from '@/components/providers/ToastProvider';

/** Which pane an operation targets. */
type Pane = 0 | 1;

/** A pending extension change awaiting confirmation (the "modal on a modal"). */
export interface ExtensionWarning {
  /** The name exactly as typed (keeps the new extension). */
  use: string;
  /** The typed base name but with the original extension kept. */
  keep: string;
  /** The original extension (`''` when the file had none). */
  fromExt: string;
  /** The new extension (`''` when the new name has none). */
  toExt: string;
}

/** How the operations reach whichever panes the workspace is showing. */
interface PaneAccess {
  folderId: (pane: Pane) => string | null;
  selectedIds: (pane: Pane) => string[];
  clearSelection: (pane: Pane) => void;
}

interface Options {
  backend: StorageBackend | null;
  panes: PaneAccess;
  /** Refreshes both panes after a mutation. */
  reloadPanes: () => Promise<void>;
  /** Refreshes the sidebar (a parent folder or root may have disappeared). */
  loadStatus: () => Promise<void>;
  /** Drops ids from the preview and both panes' selection after they are gone or renamed. */
  forgetEntries: (ids: string[]) => void;
}

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

/**
 * Every mutation on an entry, together with the dialog state that confirms it.
 **/
// Lifted out of WorkspaceClient: creating, renaming, deleting and unauthorizing all follow the same
// shape (guard → act → reload both panes → forget the id → close), so they belong together.
export function useEntryOperations({
  backend,
  panes,
  reloadPanes,
  loadStatus,
  forgetEntries,
}: Options) {
  const toast = useToast();

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPane, setNewFolderPane] = useState<Pane>(0);
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ViewEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPane, setBulkPane] = useState<Pane>(0);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [renameTarget, setRenameTarget] = useState<ViewEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [pendingRename, setPendingRename] = useState<string | null>(null);
  const [extWarning, setExtWarning] = useState<ExtensionWarning | null>(null);

  const [unselectTarget, setUnselectTarget] = useState<ViewEntry | null>(null);
  const [unselecting, setUnselecting] = useState(false);

  // --- New folder ---------------------------------------------------------------

  const openNewFolder = useCallback((pane: Pane) => {
    setNewFolderPane(pane);
    setNewFolderOpen(true);
  }, []);

  const submitNewFolder = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const name = newFolderName.trim();
      const targetFolderId = panes.folderId(newFolderPane);

      if (targetFolderId === null || backend === null || !name || creating) {
        return;
      }

      setCreating(true);
      try {
        const result = await createFolderAction(backend, targetFolderId, name);

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
    [backend, panes, newFolderPane, newFolderName, creating, reloadPanes, toast, loadStatus],
  );

  // --- Delete -------------------------------------------------------------------

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || backend === null) {
      return;
    }
    const entry = deleteTarget;

    setDeleting(true);
    try {
      const result = await deleteItemAction(backend, entry.id);

      if (!result.ok) {
        toast.error(result.error ?? 'Something went wrong.');
        return;
      }

      await reloadPanes();
      forgetEntries([entry.id]);
      toast.success(`${entry.isFolder ? 'Folder' : 'File'} "${entry.name}" deleted.`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }, [backend, deleteTarget, reloadPanes, forgetEntries, toast]);

  const openBulkDelete = useCallback((pane: Pane) => {
    setBulkPane(pane);
    setBulkOpen(true);
  }, []);

  const confirmBulkDelete = useCallback(async () => {
    const ids = panes.selectedIds(bulkPane);

    if (backend === null || ids.length === 0) {
      return;
    }

    setBulkDeleting(true);
    try {
      const results = await Promise.all(ids.map((id) => deleteItemAction(backend, id)));
      const failed = results.filter((result) => !result.ok).length;

      await reloadPanes();
      forgetEntries(ids);
      panes.clearSelection(bulkPane);
      setBulkOpen(false);

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
  }, [backend, bulkPane, panes, reloadPanes, forgetEntries, toast]);

  // --- Rename -------------------------------------------------------------------

  const openRename = useCallback((entry: ViewEntry) => {
    setRenameTarget(entry);
    setRenameName(entry.name);
  }, []);

  const runRename = useCallback(
    async (name: string) => {
      if (!renameTarget || backend === null) {
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
        const result = await renameItemAction(backend, renameTarget.id, name);

        if (!result.ok) {
          toast.error(result.error ?? 'Something went wrong.');
          return;
        }

        await reloadPanes();
        // The id can change on rename (S3 keys), so drop the old id from selection/preview.
        forgetEntries([renameTarget.id]);
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
    [backend, renameTarget, reloadPanes, forgetEntries, toast],
  );

  const submitRename = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const name = renameName.trim();

      if (!renameTarget || backend === null || !name || renaming) {
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
    [renameName, renameTarget, backend, renaming, runRename],
  );

  // --- Unauthorize a Drive root -------------------------------------------------

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

  return {
    newFolder: {
      open: newFolderOpen,
      name: newFolderName,
      creating,
      setName: setNewFolderName,
      openFor: openNewFolder,
      close: () => setNewFolderOpen(false),
      submit: submitNewFolder,
    },
    remove: {
      target: deleteTarget,
      deleting,
      request: setDeleteTarget,
      cancel: () => setDeleteTarget(null),
      confirm: confirmDelete,
    },
    bulkRemove: {
      open: bulkOpen,
      pane: bulkPane,
      deleting: bulkDeleting,
      count: panes.selectedIds(bulkPane).length,
      openFor: openBulkDelete,
      close: () => setBulkOpen(false),
      confirm: confirmBulkDelete,
    },
    rename: {
      target: renameTarget,
      name: renameName,
      renaming,
      pending: pendingRename,
      extWarning,
      setName: setRenameName,
      open: openRename,
      close: () => setRenameTarget(null),
      submit: submitRename,
      run: runRename,
      dismissExtWarning: () => setExtWarning(null),
    },
    unselectRoot: {
      target: unselectTarget,
      busy: unselecting,
      request: setUnselectTarget,
      cancel: () => setUnselectTarget(null),
      confirm: confirmUnselect,
    },
  };
}

/** Everything the workspace dialogs need to render and drive themselves. */
export type EntryOperations = ReturnType<typeof useEntryOperations>;
