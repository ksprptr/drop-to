'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { listContentsAction } from '@/actions/storage/storage.actions';
import type { Crumb, ViewEntry } from '@/common/types/workspace.types';
import { toViewEntries } from '@/common/utils/view-entry.functions';

/** A failed read, surfaced to the pane's error handler. */
export interface PaneError {
  error?: string;
  status?: number;
}

/** A single independently-browsable pane of folders/files. */
export interface BrowsePane {
  path: Crumb[];
  entries: ViewEntry[];
  loading: boolean;
  selectedIds: Set<string>;
  /** Null at the roots level. */
  currentFolderId: string | null;
  atRoots: boolean;
  openFolder: (entry: ViewEntry) => void;
  navigate: (index: number) => void;
  goTo: (path: Crumb[]) => void;
  reload: () => Promise<void>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  pruneSelection: (id: string) => void;
}

/**
 * Owns one browsing pane's state (path, entries, loading, multi-selection).
 **/
export function useBrowsePane(
  backend: StorageBackend | null,
  roots: ViewEntry[],
  onError: (error: PaneError) => void,
): BrowsePane {
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;

  useEffect(() => {
    setPath([]);
  }, [backend]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId, backend]);

  const reload = useCallback(async () => {
    if (currentFolderId === null || backend === null) {
      setEntries(roots);
      return;
    }

    setLoading(true);
    const result = await listContentsAction(backend, currentFolderId);
    if (result.ok) {
      setEntries(toViewEntries(result.data ?? []));
    } else {
      onError({ error: result.error, status: result.status });
    }
    setLoading(false);
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

  const setSelection = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);

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
      setSelection,
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
      setSelection,
      pruneSelection,
    ],
  );
}
