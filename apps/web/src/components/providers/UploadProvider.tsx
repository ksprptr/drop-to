'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  BatchRuntime,
  DownloadTask,
  UploadBatch,
  UploadTask,
} from '@/common/types/workspace.types';

const UPLOAD_LINGER_MS = 4000;

interface UploadState {
  batches: UploadBatch[];
  downloads: DownloadTask[];
}

interface UploadActions {
  setBatches: React.Dispatch<React.SetStateAction<UploadBatch[]>>;
  setDownloads: React.Dispatch<React.SetStateAction<DownloadTask[]>>;
  updateTask: (batchId: string, taskId: string, patch: Partial<UploadTask>) => void;
  setBatchStatus: (batchId: string, status: UploadBatch['status']) => void;
  scheduleRemoveBatch: (batchId: string) => void;
  cancelBatch: (batchId: string) => void;
  batchRuntime: React.RefObject<Map<string, BatchRuntime>>;
}

// Split contexts so frequent upload-progress ticks re-render only the dock, never the workspace tree.
const UploadStateContext = createContext<UploadState | null>(null);
const UploadActionsContext = createContext<UploadActions | null>(null);

/**
 * Owns upload/download dock state so progress updates don't re-render the workspace panes.
 **/
export function UploadProvider({ children }: PropsWithChildren) {
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const batchRuntime = useRef<Map<string, BatchRuntime>>(new Map());

  const updateTask = useCallback((batchId: string, taskId: string, patch: Partial<UploadTask>) => {
    setBatches((current) =>
      current.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              tasks: batch.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
            }
          : batch,
      ),
    );
  }, []);

  const setBatchStatus = useCallback((batchId: string, status: UploadBatch['status']) => {
    setBatches((current) =>
      current.map((batch) => (batch.id === batchId ? { ...batch, status } : batch)),
    );
  }, []);

  const scheduleRemoveBatch = useCallback((batchId: string) => {
    setTimeout(() => {
      setBatches((current) => current.filter((batch) => batch.id !== batchId));
    }, UPLOAD_LINGER_MS);
  }, []);

  const cancelBatch = useCallback((batchId: string) => {
    batchRuntime.current.get(batchId)?.controller.abort();
  }, []);

  // Abort any in-flight uploads when the workspace unmounts (e.g. on refresh).
  useEffect(() => {
    const runtimes = batchRuntime.current;
    return () => runtimes.forEach((runtime) => runtime.controller.abort());
  }, []);

  // Warn (native browser prompt) before leaving while uploads are still running.
  const hasActiveUploads = batches.some((batch) => batch.status === 'uploading');
  useEffect(() => {
    if (!hasActiveUploads) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasActiveUploads]);

  const state = useMemo<UploadState>(() => ({ batches, downloads }), [batches, downloads]);
  const actions = useMemo<UploadActions>(
    () => ({
      setBatches,
      setDownloads,
      updateTask,
      setBatchStatus,
      scheduleRemoveBatch,
      cancelBatch,
      batchRuntime,
    }),
    [updateTask, setBatchStatus, scheduleRemoveBatch, cancelBatch],
  );

  return (
    <UploadActionsContext.Provider value={actions}>
      <UploadStateContext.Provider value={state}>{children}</UploadStateContext.Provider>
    </UploadActionsContext.Provider>
  );
}

/**
 * Reads the live upload/download dock state (re-renders on every progress tick).
 **/
export function useUploadState(): UploadState {
  const context = useContext(UploadStateContext);
  if (!context) {
    throw new Error('useUploadState must be used within an UploadProvider.');
  }

  return context;
}

/**
 * Reads the stable upload actions (safe to consume without re-rendering on progress ticks).
 **/
export function useUploadActions(): UploadActions {
  const context = useContext(UploadActionsContext);
  if (!context) {
    throw new Error('useUploadActions must be used within an UploadProvider.');
  }

  return context;
}
