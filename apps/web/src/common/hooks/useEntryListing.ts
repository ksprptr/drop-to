'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listContentsAction } from '@/actions/storage/storage.actions';
import type { SortDir, SortKey, ViewEntry } from '@/common/types/workspace.types';
import { toViewEntries } from '@/common/utils/view-entry.functions';

/** A failed read, surfaced to the pane's error handler. */
export interface PaneError {
  error?: string;
  status?: number;
}

/** Where and how a pane wants its entries listed. */
interface ListingOptions {
  backend: StorageBackend | null;
  /** Null at the roots level, where `roots` is shown instead of a server listing. */
  currentFolderId: string | null;
  roots: ViewEntry[];
  /** Already debounced by the caller. */
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onError: (error: PaneError) => void;
}

/** One pane's listing: the entries plus their loading and pagination state. */
export interface EntryListing {
  entries: ViewEntry[];
  setEntries: (update: (current: ViewEntry[]) => ViewEntry[]) => void;
  loading: boolean;
  /** Whether another page can be loaded (infinite scroll). */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Drive filters by name server-side; S3 lists a whole level and is filtered client-side.
 **/
const serverSearch = (backend: StorageBackend | null, term: string): string | undefined =>
  backend === 'drive' && term ? term : undefined;

/**
 * Loads one pane's entries, with cursor pagination and stale-response protection.
 **/
// Shared by both panes; they differ only in where the folder and sort come from, never in how a listing is read.
export function useEntryListing({
  backend,
  currentFolderId,
  roots,
  search,
  sortKey,
  sortDir,
  onError,
}: ListingOptions): EntryListing {
  const [entries, setEntries] = useState<ViewEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // A resolved request whose id no longer matches is stale and must not paint over the current folder.
  const listSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++listSeq.current;

    if (currentFolderId === null || backend === null) {
      setEntries(roots);
      setNextPageToken(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await listContentsAction(backend, currentFolderId, {
      search: serverSearch(backend, search),
      sortKey,
      sortDir,
    });

    // Superseded while in flight — a newer read owns the pane now.
    if (seq !== listSeq.current) {
      return;
    }

    if (result.ok) {
      setEntries(toViewEntries(result.data?.entries ?? []));
      setNextPageToken(result.data?.nextPageToken ?? null);
    } else {
      onError({ error: result.error, status: result.status });
    }
    setLoading(false);
  }, [backend, currentFolderId, roots, onError, search, sortKey, sortDir]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (nextPageToken === null || backend === null || currentFolderId === null || loadingMore) {
      return;
    }

    const seq = listSeq.current;
    setLoadingMore(true);
    const result = await listContentsAction(backend, currentFolderId, {
      pageToken: nextPageToken,
      search: serverSearch(backend, search),
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
    } else {
      onError({ error: result.error, status: result.status });
    }
    setLoadingMore(false);
  }, [nextPageToken, backend, currentFolderId, loadingMore, search, sortKey, sortDir, onError]);

  return useMemo(
    () => ({
      entries,
      setEntries,
      loading,
      hasMore: nextPageToken !== null,
      loadingMore,
      loadMore,
      reload,
    }),
    [entries, loading, nextPageToken, loadingMore, loadMore, reload],
  );
}
