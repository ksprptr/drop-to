'use client';

import type { StorageBackend } from '@dropto/types';
import { useCallback, useRef, useState } from 'react';

import { createFolderAction, deleteItemAction } from '@/actions/storage/storage.actions';
import { uploadFile } from '@/common/services/api/storage.client';
import type {
  BatchRuntime,
  UploadBatch,
  UploadItem,
  ViewEntry,
} from '@/common/types/workspace.types';
import { extractApiErrorMessage, isCanceledError } from '@/common/utils/error.functions';
import {
  isIgnoredUploadName,
  isTopLevelFolder,
  topLevelName,
  uniqueName,
} from '@/common/utils/upload.functions';
import { useToast } from '@/components/providers/ToastProvider';
import { useUploadActions } from '@/components/providers/UploadProvider';

/** Where an upload is headed: the target folder and what is already in it. */
export interface UploadTarget {
  folderId: string | null;
  entries: ViewEntry[];
}

/** The duplicate prompt plus the entry point for a drop. */
export interface UploadQueue {
  /** Top-level names that already exist in the target folder; null when nothing is being asked. */
  duplicate: string[] | null;
  resolveDuplicate: (choice: 'replace' | 'keep' | 'cancel') => void;
  handleUpload: (items: UploadItem[], pane?: 0 | 1) => Promise<void>;
}

/**
 * Runs the upload queue: duplicate handling, folder creation, per-file progress and rollback.
 **/
// The panes are reached through `getPaneTarget`, so this never has to know how the workspace stores them.
export function useUploadQueue(
  activeBackend: StorageBackend | null,
  getPaneTarget: (pane: 0 | 1) => UploadTarget,
  reloadPanes: () => Promise<void>,
): UploadQueue {
  const toast = useToast();
  const { setBatches, updateTask, setBatchStatus, scheduleRemoveBatch, batchRuntime } =
    useUploadActions();

  const [duplicate, setDuplicate] = useState<string[] | null>(null);
  const duplicateResolve = useRef<((choice: 'replace' | 'keep' | 'cancel') => void) | null>(null);

  // Undo a batch: delete everything it created so a cancel leaves nothing behind.
  const rollbackBatch = useCallback(
    async (batchId: string, backend: StorageBackend) => {
      // Flip the batch and its rows to cancelled (the dock turns them red).
      setBatches((current) =>
        current.map((batch) =>
          batch.id === batchId
            ? {
                ...batch,
                status: 'canceling',
                tasks: batch.tasks.map((task) => ({ ...task, status: 'canceled', rate: null })),
              }
            : batch,
        ),
      );
      const runtime = batchRuntime.current.get(batchId);
      if (runtime) {
        await Promise.all(
          [...runtime.rootFolderIds, ...runtime.looseFileIds].map((id) =>
            deleteItemAction(backend, id),
          ),
        );
        batchRuntime.current.delete(batchId);
      }
      await reloadPanes();
      setBatchStatus(batchId, 'canceled');
      scheduleRemoveBatch(batchId);
    },
    [reloadPanes, setBatchStatus, scheduleRemoveBatch, setBatches, batchRuntime],
  );

  const askDuplicate = useCallback((names: string[]): Promise<'replace' | 'keep' | 'cancel'> => {
    setDuplicate(names);
    return new Promise((resolve) => {
      duplicateResolve.current = resolve;
    });
  }, []);

  const resolveDuplicate = useCallback((choice: 'replace' | 'keep' | 'cancel') => {
    setDuplicate(null);
    duplicateResolve.current?.(choice);
    duplicateResolve.current = null;
  }, []);

  const handleUpload = useCallback(
    async (droppedItems: UploadItem[], pane: 0 | 1 = 0) => {
      const items = droppedItems.filter((item) => !isIgnoredUploadName(item.relativePath));
      const { folderId: targetFolderId, entries: existing } = getPaneTarget(pane);
      if (targetFolderId === null || activeBackend === null || items.length === 0) {
        return;
      }
      const backend = activeBackend;

      // Detect name conflicts among the top-level items being added here.
      const existingNames = new Set(existing.map((entry) => entry.name));
      const topLevel = new Map<string, boolean>();
      for (const item of items) {
        const top = topLevelName(item.relativePath);
        topLevel.set(top, topLevel.get(top) === true || isTopLevelFolder(item.relativePath));
      }
      const conflicts = [...topLevel.keys()].filter((name) => existingNames.has(name));

      const renameMap = new Map<string, string>();
      // "Replace": upload first, delete originals only once they're safely in.
      let replaceIds: string[] = [];
      if (conflicts.length > 0) {
        const choice = await askDuplicate(conflicts);
        if (choice === 'cancel') {
          return;
        }
        if (choice === 'replace') {
          replaceIds = existing
            .filter((entry) => conflicts.includes(entry.name))
            .map((entry) => entry.id);
        } else {
          const taken = new Set(existingNames);
          for (const name of conflicts) {
            const renamed = uniqueName(name, taken);
            taken.add(renamed);
            renameMap.set(name, renamed);
          }
        }
      }

      // Apply any renames (folders via their path, loose files via an upload name).
      const finalItems: UploadItem[] = items.map((item) => {
        const top = topLevelName(item.relativePath);
        const renamed = renameMap.get(top);
        if (!renamed) {
          return item;
        }
        return isTopLevelFolder(item.relativePath)
          ? { ...item, relativePath: `${renamed}${item.relativePath.slice(top.length)}` }
          : { ...item, relativePath: renamed, uploadName: renamed };
      });

      const folderTops = new Set(
        finalItems
          .filter((item) => isTopLevelFolder(item.relativePath))
          .map((item) => topLevelName(item.relativePath)),
      );
      const looseCount = finalItems.filter((item) => !isTopLevelFolder(item.relativePath)).length;
      const kind: UploadBatch['kind'] =
        folderTops.size === 1 && looseCount === 0 ? 'folder' : 'files';
      const folderName = kind === 'folder' ? [...folderTops][0] : null;

      const batchId = crypto.randomUUID();
      const runtime: BatchRuntime = {
        controller: new AbortController(),
        looseFileIds: [],
        rootFolderIds: [],
      };
      batchRuntime.current.set(batchId, runtime);
      const { signal } = runtime.controller;

      const queue = finalItems.map((item) => {
        const slash = item.relativePath.lastIndexOf('/');
        return {
          taskId: crypto.randomUUID(),
          item,
          dirPath: slash === -1 ? '' : item.relativePath.slice(0, slash),
        };
      });
      setBatches((current) => [
        ...current,
        {
          id: batchId,
          kind,
          folderName,
          status: 'uploading',
          tasks: queue.map(({ taskId, item }) => ({
            id: taskId,
            name: item.uploadName ?? item.file.name,
            size: item.file.size,
            percent: 0,
            rate: null,
            status: 'pending' as const,
          })),
        },
      ]);

      // Recreate the nested folder structure, tracking top-level folders for cancel.
      const folderIdByPath = new Map<string, string>([['', targetFolderId]]);
      const ensureFolder = async (dirPath: string): Promise<string> => {
        const cached = folderIdByPath.get(dirPath);
        if (cached) {
          return cached;
        }
        const slash = dirPath.lastIndexOf('/');
        const parentPath = slash === -1 ? '' : dirPath.slice(0, slash);
        const name = slash === -1 ? dirPath : dirPath.slice(slash + 1);
        const parentId = await ensureFolder(parentPath);
        const result = await createFolderAction(backend, parentId, name);
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? 'Failed to create folder.');
        }
        const created = result.data;
        folderIdByPath.set(dirPath, created.id);
        if (parentPath === '') {
          runtime.rootFolderIds.push(created.id);
        }
        return created.id;
      };

      for (const { taskId, item, dirPath } of queue) {
        if (signal.aborted) {
          break;
        }
        updateTask(batchId, taskId, { status: 'uploading' });
        try {
          // eslint-disable-next-line no-await-in-loop -- uploads run one at a time (progress + folder dedup)
          const uploadFolderId = await ensureFolder(dirPath);
          // eslint-disable-next-line no-await-in-loop -- sequential upload queue
          const result = await uploadFile(
            backend,
            uploadFolderId,
            item.file,
            ({ percent, rate }) => {
              updateTask(batchId, taskId, {
                percent,
                rate,
                status: percent >= 100 ? 'processing' : 'uploading',
              });
            },
            signal,
            item.uploadName,
          );
          if (dirPath === '') {
            runtime.looseFileIds.push(result.fileId);
          }
          updateTask(batchId, taskId, { status: 'done', percent: 100, rate: null });
        } catch (error) {
          if (isCanceledError(error)) {
            break;
          }
          updateTask(batchId, taskId, { status: 'error', rate: null });
          toast.error(`${item.uploadName ?? item.file.name}: ${extractApiErrorMessage(error)}`);
        }
      }

      if (signal.aborted) {
        await rollbackBatch(batchId, backend);
      } else {
        try {
          // Replacements are in — now remove the originals they superseded.
          if (replaceIds.length > 0) {
            await Promise.all(replaceIds.map((id) => deleteItemAction(backend, id)));
          }
          await reloadPanes();
        } finally {
          batchRuntime.current.delete(batchId);
          setBatchStatus(batchId, 'done');
          scheduleRemoveBatch(batchId);
        }
      }
    },
    [
      activeBackend,
      getPaneTarget,
      reloadPanes,
      toast,
      askDuplicate,
      updateTask,
      setBatchStatus,
      scheduleRemoveBatch,
      rollbackBatch,
    ],
  );

  return { duplicate, resolveDuplicate, handleUpload };
}
