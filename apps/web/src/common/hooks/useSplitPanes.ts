'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useEffect, useState } from 'react';

import { moveItemAction } from '@/actions/storage/storage.actions';
import type { BrowsePane } from '@/common/hooks/useBrowsePane';
import type { Crumb } from '@/common/types/workspace.types';
import { useToast } from '@/components/providers/ToastProvider';

/** Which pane an interaction belongs to. */
type Pane = 0 | 1;

/** A drag in flight: what is being moved, and which pane it left. */
interface DragMove {
  ids: string[];
  sourcePane: Pane;
}

interface Options {
  /** False below the breakpoint where two panes fit. */
  canSplit: boolean;
  backend: StorageBackend | null;
  /** The main pane's folder and path. */
  currentFolderId: string | null;
  path: Crumb[];
  paneB: BrowsePane;
  reloadPanes: () => Promise<void>;
  /** Clears what the move invalidated (both selections and the preview), as the workspace sees fit. */
  onMoved: (ids: string[]) => void;
}

/**
 * The second pane: whether it is open, which pane is active, and moving items between them.
 **/
export function useSplitPanes({
  canSplit,
  backend,
  currentFolderId,
  path,
  paneB,
  reloadPanes,
  onMoved,
}: Options) {
  const toast = useToast();

  const [split, setSplit] = useState(false);
  const [activePane, setActivePane] = useState<Pane>(0);
  const [dragMove, setDragMove] = useState<DragMove | null>(null);

  const toggleSplit = useCallback(() => {
    setSplit((current) => {
      const next = !current;

      if (next) {
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
    if (backend === null) {
      setSplit(false);
      setDragMove(null);
    }
  }, [backend]);

  // Two panes have no usable width below `md`, and moving between them is a gesture touch never fires.
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

  /**
   * Moves ids into a folder and reports the outcome in one live toast.
   **/
  // A move can take a while (S3 copies whole folders), so the toast is opened before the requests.
  const runMove = useCallback(
    async (targetFolderId: string, ids: string[], activeBackend: StorageBackend) => {
      const count = `${ids.length} item${ids.length === 1 ? '' : 's'}`;
      const toastId = toast.loading(`Moving ${count}…`);

      const results = await Promise.all(
        ids.map((id) => moveItemAction(activeBackend, id, targetFolderId)),
      );
      const failed = results.filter((result) => !result.ok).length;

      await reloadPanes();
      onMoved(ids);

      toast.update(toastId, {
        variant: failed > 0 ? 'error' : 'success',
        message:
          failed > 0
            ? `Failed to move ${failed} item${failed === 1 ? '' : 's'}.`
            : `Moved ${count}.`,
      });
    },
    [toast, reloadPanes, onMoved],
  );

  // Finder-style drop onto a folder row, within one pane.
  const moveIntoFolder = useCallback(
    async (targetFolderId: string, ids: string[]) => {
      if (backend === null) {
        return;
      }

      const moveIds = ids.filter((id) => id !== targetFolderId);

      if (moveIds.length === 0) {
        return;
      }

      await runMove(targetFolderId, moveIds, backend);
    },
    [backend, runMove],
  );

  // Drop onto the other pane.
  const moveDrop = useCallback(
    async (targetPane: Pane) => {
      if (!dragMove || backend === null || dragMove.sourcePane === targetPane) {
        return;
      }

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

      await runMove(targetFolderId, ids, backend);
    },
    [dragMove, backend, currentFolderId, paneB, runMove, toast],
  );

  return {
    split,
    activePane,
    setActivePane,
    dragMove,
    setDragMove,
    toggleSplit,
    moveIntoFolder,
    moveDrop,
  };
}
