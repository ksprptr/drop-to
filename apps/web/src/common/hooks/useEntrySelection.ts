'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** Multi-selection over the entries of one pane. */
export interface EntrySelection {
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  /** Drops a single id (an entry that was deleted or moved away). */
  pruneSelection: (id: string) => void;
}

/**
 * Owns a pane's multi-selection, resetting it whenever the pane changes folder or backend.
 **/
// Shared by both panes: the split pane and the URL-driven main pane had identical copies of this.
export function useEntrySelection(
  currentFolderId: string | null,
  backend: StorageBackend | null,
): EntrySelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // A different folder (or storage) means a different set of entries — the old ids are meaningless.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId, backend]);

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

  const selectAll = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);

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
    () => ({ selectedIds, toggleSelect, selectAll, clearSelection, setSelection, pruneSelection }),
    [selectedIds, toggleSelect, selectAll, clearSelection, setSelection, pruneSelection],
  );
}
