'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getFolderContents } from '@/common/services/api/storage.api';
import type { Crumb, ViewEntry } from '@/common/types/workspace.types';

/** A single independently-browsable pane of folders/files. */
export interface BrowsePane {
  path: Crumb[];
  entries: ViewEntry[];
  loading: boolean;
  selectedIds: Set<string>;
  /** Id of the folder currently open (null at the roots level). */
  currentFolderId: string | null;
  atRoots: boolean;
  openFolder: (entry: ViewEntry) => void;
  navigate: (index: number) => void;
  goTo: (path: Crumb[]) => void;
  reload: () => Promise<void>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  pruneSelection: (id: string) => void;
}

/**
 * Hook that owns one browsing pane's state (its path, listed entries, loading and
 * multi-selection) for a single storage backend. Used to power a second, split
 * pane alongside the primary workspace pane, so items can be dragged between them.
 * @param backend - The active storage backend (or null when none is selected)
 * @param roots - The backend's browse roots, shown at the top (path) level
 * @param onError - Called with a display message when listing a folder fails
 * @returns The pane state and its navigation/selection helpers
 */
export function useBrowsePane(
  backend: StorageBackend | null,
  roots: ViewEntry[],
  onError: (error: unknown) => void,
): BrowsePane {
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;

  // Reset the path when the backend changes (its folders are entirely different).
  useEffect(() => {
    setPath([]);
  }, [backend]);

  // Drop any multi-selection whenever the folder or backend changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId, backend]);

  const reload = useCallback(async () => {
    if (currentFolderId === null || backend === null) {
      setEntries(roots);
      return;
    }

    setLoading(true);
    try {
      const contents = await getFolderContents(backend, currentFolderId);
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
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [backend, currentFolderId, roots, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openFolder = useCallback((entry: ViewEntry) => {
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
  }, []);

  const navigate = useCallback((index: number) => {
    setPath((current) => (index < 0 ? [] : current.slice(0, index + 1)));
  }, []);

  const goTo = useCallback((next: Crumb[]) => setPath(next), []);

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

  const pruneSelection = useCallback((id: string) => {
    setSelectedIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      path,
      entries,
      loading,
      selectedIds,
      currentFolderId,
      atRoots,
      openFolder,
      navigate,
      goTo,
      reload,
      toggleSelect,
      selectAll,
      clearSelection,
      pruneSelection,
    }),
    [
      path,
      entries,
      loading,
      selectedIds,
      currentFolderId,
      atRoots,
      openFolder,
      navigate,
      goTo,
      reload,
      toggleSelect,
      selectAll,
      clearSelection,
      pruneSelection,
    ],
  );
}
