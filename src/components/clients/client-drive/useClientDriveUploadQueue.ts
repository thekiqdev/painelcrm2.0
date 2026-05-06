import { useCallback, useMemo, useRef, useState } from 'react';
import type { ClientGoogleDriveBrowserItem } from '@/services/clientGoogleDriveBrowser';
import { mapUploadResponseToBrowserItem, uploadClientGoogleDriveFileWithProgress } from '@/services/clientGoogleDriveFiles';

export type UploadQueueEntry = {
  temp_id: string;
  file: File;
  phase: 'uploading' | 'processing' | 'error';
  progress: number;
  error_message?: string;
  /** Chave do react-query para esta vista (`folderId ?? 'root'`). */
  cache_key: string;
  /** Pasta destino no momento do envio (Drive). */
  parent_folder_id?: string;
};

type Params = {
  clientId: string;
  maxMb: number;
  /** Pasta Drive atual + chave de cache da vista. */
  getUploadContext: () => { parent_folder_id?: string; cache_key: string };
  onUploaded: (item: ClientGoogleDriveBrowserItem, cacheKey: string) => void;
};

export function useClientDriveUploadQueue({
  clientId,
  maxMb,
  getUploadContext,
  onUploaded,
}: Params) {
  const [entries, setEntries] = useState<UploadQueueEntry[]>([]);
  const abortMap = useRef<Map<string, AbortController>>(new Map());

  const updateEntry = useCallback((tempId: string, patch: Partial<UploadQueueEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.temp_id === tempId ? { ...e, ...patch } : e)),
    );
  }, []);

  const removeEntry = useCallback((tempId: string) => {
    abortMap.current.get(tempId)?.abort();
    abortMap.current.delete(tempId);
    setEntries((prev) => prev.filter((e) => e.temp_id !== tempId));
  }, []);

  const runUpload = useCallback(
    async (entry: UploadQueueEntry) => {
      const controller = new AbortController();
      abortMap.current.set(entry.temp_id, controller);

      try {
        updateEntry(entry.temp_id, {
          phase: 'uploading',
          progress: 0,
          error_message: undefined,
        });

        const res = await uploadClientGoogleDriveFileWithProgress(clientId, entry.file, {
          parentFolderId: entry.parent_folder_id,
          signal: controller.signal,
          onProgress: (pct) => {
            updateEntry(entry.temp_id, { phase: 'uploading', progress: pct });
          },
          onUploadBytesFinished: () => {
            updateEntry(entry.temp_id, { phase: 'processing', progress: 100 });
          },
        });

        const mapped = mapUploadResponseToBrowserItem(res);
        removeEntry(entry.temp_id);
        onUploaded(mapped, entry.cache_key);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : typeof e === 'string' ? e : 'Falha no upload';
        if (msg === 'Pedido cancelado.' || msg.includes('abort')) {
          removeEntry(entry.temp_id);
          return;
        }
        updateEntry(entry.temp_id, {
          phase: 'error',
          progress: 0,
          error_message: msg,
        });
      } finally {
        abortMap.current.delete(entry.temp_id);
      }
    },
    [clientId, onUploaded, removeEntry, updateEntry],
  );

  const queueFiles = useCallback(
    (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
      const ctx = getUploadContext();

      for (const file of arr) {
        if (file.size > maxMb * 1024 * 1024) {
          continue;
        }
        const temp_id = crypto.randomUUID();
        const entry: UploadQueueEntry = {
          temp_id,
          file,
          phase: 'uploading',
          progress: 0,
          cache_key: ctx.cache_key,
          parent_folder_id: ctx.parent_folder_id,
        };
        setEntries((prev) => [...prev, entry]);
        void runUpload(entry);
      }
    },
    [getUploadContext, maxMb, runUpload],
  );

  const retry = useCallback(
    (tempId: string) => {
      const ctx = getUploadContext();
      setEntries((prev) => {
        const entry = prev.find((e) => e.temp_id === tempId && e.phase === 'error');
        if (!entry) return prev;
        const next: UploadQueueEntry = {
          ...entry,
          phase: 'uploading',
          progress: 0,
          error_message: undefined,
          cache_key: ctx.cache_key,
          parent_folder_id: ctx.parent_folder_id,
        };
        queueMicrotask(() => void runUpload(next));
        return prev.map((e) => (e.temp_id === tempId ? next : e));
      });
    },
    [getUploadContext, runUpload],
  );

  const cancel = useCallback(
    (tempId: string) => {
      abortMap.current.get(tempId)?.abort();
      removeEntry(tempId);
    },
    [removeEntry],
  );

  const activePipelineCount = useMemo(
    () => entries.filter((e) => e.phase === 'uploading' || e.phase === 'processing').length,
    [entries],
  );

  const optimisticBrowserItems = useMemo((): ClientGoogleDriveBrowserItem[] => {
    const now = new Date().toISOString();
    return entries.map((e) => ({
      id: e.temp_id,
      type: 'file' as const,
      name: e.file.name,
      mime_type: e.file.type || 'application/octet-stream',
      size_bytes: e.file.size,
      web_view_link: null,
      created_at: now,
      modified_at: now,
      optimistic_upload: {
        temp_id: e.temp_id,
        phase: e.phase,
        progress: e.progress,
        error_message: e.error_message,
      },
    }));
  }, [entries]);

  return {
    entries,
    queueFiles,
    retry,
    remove: removeEntry,
    cancel,
    activePipelineCount,
    optimisticBrowserItems,
  };
}
