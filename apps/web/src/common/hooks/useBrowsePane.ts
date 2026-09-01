'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import { type PaneError, useEntryListing } from '@/common/hooks/useEntryListing';
import { useEntrySelection } from '@/common/hooks/useEntrySelection';
import type { Crumb, SortDir, SortKey, ViewEntry } from '@/common/types/workspace.types';

export type { PaneError };

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
// Location lives in local state here (the main pane uses the URL); everything below it is shared.
export function useBrowsePane(
  backend: StorageBackend | null,
  roots: ViewEntry[],
  onError: (error: PaneError) => void,
): BrowsePane {
  const [path, setPath] = useState<Crumb[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  useEffect(() => {
    setPath([]);
  }, [backend]);

  // A new folder starts unfiltered.
  useEffect(() => {
    setSearch('');
  }, [currentFolderId, backend]);

  const listing = useEntryListing({
    backend,
    currentFolderId,
    roots,
    search: debouncedSearch,
    sortKey,
    sortDir,
    onError,
  });

  const selection = useEntrySelection(currentFolderId, backend);

  // Keep the latest sortKey for toggleSort without making it depend on (and re-create) on every change.
  const sortKeyRef = useRef<SortKey>(sortKey);
  sortKeyRef.current = sortKey;

  const toggleSort = useCallback((key: SortKey) => {
    setSortDir((dir) => (key === sortKeyRef.current ? (dir === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }, []);

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

  const { entries } = listing;
  const { selectAll: selectIds } = selection;
  const selectAll = useCallback(
    () => selectIds(entries.map((entry) => entry.id)),
    [entries, selectIds],
  );

  return useMemo(
    () => ({
      path,
      entries: listing.entries,
      loading: listing.loading,
      selectedIds: selection.selectedIds,
      currentFolderId,
      atRoots,
      sortKey,
      sortDir,
      toggleSort,
      search,
      setSearch,
      hasMore: listing.hasMore,
      loadingMore: listing.loadingMore,
      loadMore: listing.loadMore,
      openFolder,
      navigate,
      goTo,
      reload: listing.reload,
      toggleSelect: selection.toggleSelect,
      selectAll,
      clearSelection: selection.clearSelection,
      setSelection: selection.setSelection,
      pruneSelection: selection.pruneSelection,
    }),
    [
      path,
      listing,
      selection,
      currentFolderId,
      atRoots,
      sortKey,
      sortDir,
      toggleSort,
      search,
      openFolder,
      navigate,
      goTo,
      selectAll,
    ],
  );
}
