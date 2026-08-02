'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listContentsAction } from '@/actions/storage/storage.actions';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import type { Crumb, SortDir, SortKey, ViewEntry } from '@/common/types/workspace.types';
import { toViewEntries } from '@/common/utils/view-entry.functions';

/**
 * Drive filters by name server-side; S3 lists a whole level and is filtered client-side.
 **/
const serverSearch = (backend: StorageBackend | null, term: string): string | undefined =>
  backend === 'drive' && term ? term : undefined;

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
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  search: string;
  setSearch: (query: string) => void;
  /** Whether another page can be loaded (infinite scroll). */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
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
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  useEffect(() => {
    setPath([]);
  }, [backend]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId, backend]);

  // A new folder starts unfiltered.
  useEffect(() => {
    setSearch('');
  }, [currentFolderId, backend]);

  // Keep the latest sortKey for toggleSort without making it depend on (and re-create) on every change.
  const sortKeyRef = useRef<SortKey>(sortKey);
  sortKeyRef.current = sortKey;

  const toggleSort = useCallback((key: SortKey) => {
    setSortDir((dir) => (key === sortKeyRef.current ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }, []);

  const reload = useCallback(async () => {
    if (currentFolderId === null || backend === null) {
      setEntries(roots);
      setNextPageToken(null);
      return;
    }

    setLoading(true);
    const result = await listContentsAction(backend, currentFolderId, {
      search: serverSearch(backend, debouncedSearch),
      sortKey,
      sortDir,
    });
    if (result.ok) {
      setEntries(toViewEntries(result.data?.entries ?? []));
      setNextPageToken(result.data?.nextPageToken ?? null);
    } else {
      onError({ error: result.error, status: result.status });
    }
    setLoading(false);
  }, [backend, currentFolderId, roots, onError, debouncedSearch, sortKey, sortDir]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (nextPageToken === null || backend === null || currentFolderId === null || loadingMore) {
      return;
    }

    setLoadingMore(true);
    const result = await listContentsAction(backend, currentFolderId, {
      pageToken: nextPageToken,
      search: serverSearch(backend, debouncedSearch),
      sortKey,
      sortDir,
    });
    if (result.ok) {
      setEntries((current) => [...current, ...toViewEntries(result.data?.entries ?? [])]);
      setNextPageToken(result.data?.nextPageToken ?? null);
    } else {
      onError({ error: result.error, status: result.status });
    }
    setLoadingMore(false);
  }, [nextPageToken, backend, currentFolderId, loadingMore, debouncedSearch, sortKey, sortDir, onError]);

  const openFolder = useCallback((entry: ViewEntry) => {
    setPath((current) => [
      ...current,
      { id: entry.id, name: entry.name, webViewLink: entry.webViewLink },
    ]);
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
      sortKey,
      sortDir,
      toggleSort,
      search,
      setSearch,
      hasMore: nextPageToken !== null,
      loadingMore,
      loadMore,
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
      sortKey,
      sortDir,
      toggleSort,
      search,
      nextPageToken,
      loadingMore,
      loadMore,
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
