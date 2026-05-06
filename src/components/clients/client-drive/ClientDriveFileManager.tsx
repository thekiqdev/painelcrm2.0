import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { FolderOpen, GripVertical, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/sonner';
import {
  createClientGoogleDriveUserFolder,
  deleteClientGoogleDriveFolder,
  deleteClientGoogleDriveItem,
  getClientGoogleDriveBrowser,
  moveClientGoogleDriveItem,
  type ClientGoogleDriveBrowserItem,
} from '@/services/clientGoogleDriveBrowser';
import { retryFailedClientGoogleDriveUploadWithProgress } from '@/services/clientGoogleDriveFiles';
import { cn } from '@/lib/utils';
import { ClientDriveBreadcrumbDrop, CRUMB_DROP_PREFIX } from './ClientDriveBreadcrumbDrop';
import { ClientDriveCreateFolderDialog } from './ClientDriveCreateFolderDialog';
import { ClientDriveGrid, DND_FILE_PREFIX, DND_FOLD_PREFIX } from './ClientDriveGrid';
import { ClientDriveMoveDialog, type MoveDestinationOption } from './ClientDriveMoveDialog';
import { ClientDriveToolbar, type ClientDriveSort } from './ClientDriveToolbar';
import { useClientDriveUploadQueue } from './useClientDriveUploadQueue';

type Props = {
  clientId: string;
  clientDisplayName: string;
  canUpload: boolean;
};

const MAX_MB = 20;
const ACCEPT_EXT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';

function parseDragFileId(activeId: string | number): string | null {
  const s = String(activeId);
  if (!s.startsWith(DND_FILE_PREFIX)) return null;
  return s.slice(DND_FILE_PREFIX.length);
}

function parseDropFolderId(overId: string | number): string | null {
  const s = String(overId);
  if (s.startsWith(DND_FOLD_PREFIX)) return s.slice(DND_FOLD_PREFIX.length);
  if (s.startsWith(CRUMB_DROP_PREFIX)) return s.slice(CRUMB_DROP_PREFIX.length);
  return null;
}

export function ClientDriveFileManager({ clientId, clientDisplayName, canUpload }: Props) {
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ClientDriveSort>('name');
  const [createOpen, setCreateOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const retryFileInputRef = useRef<HTMLInputElement | null>(null);
  const retryTargetFileIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [moveDialogItem, setMoveDialogItem] = useState<ClientGoogleDriveBrowserItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ClientGoogleDriveBrowserItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
  );

  const browserQuery = useQuery({
    queryKey: ['client-google-drive-browser', clientId, folderId ?? 'root'],
    queryFn: () => getClientGoogleDriveBrowser(clientId, folderId),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const busy = items.some(
        (i) =>
          i.type === 'file' &&
          i.upload_status &&
          (i.upload_status === 'uploading' || i.upload_status === 'processing'),
      );
      return busy ? 4000 : false;
    },
  });

  const invalidateBrowser = async () => {
    await queryClient.invalidateQueries({ queryKey: ['client-google-drive-browser', clientId] });
  };

  const getUploadContext = useCallback(() => {
    const parent_folder_id = browserQuery.data?.current_folder_id;
    const cache_key = folderId ?? 'root';
    return { parent_folder_id, cache_key };
  }, [browserQuery.data?.current_folder_id, folderId]);

  const uploadQueue = useClientDriveUploadQueue({
    clientId,
    maxMb: MAX_MB,
    getUploadContext,
    onUploaded: async () => {
      toast.success('Arquivo enviado com sucesso.', { duration: 2600 });
      await invalidateBrowser();
    },
  });

  const mergedItems = useMemo(() => {
    const server = browserQuery.data?.items ?? [];
    const optimistic = uploadQueue.optimisticBrowserItems;
    const filteredOptimistic = optimistic.filter((o) => {
      const dup = server.some(
        (s) =>
          s.type === 'file' &&
          s.name === o.name &&
          (s.upload_status === 'uploading' || s.upload_status === 'processing'),
      );
      return !dup;
    });
    return [...filteredOptimistic, ...server];
  }, [uploadQueue.optimisticBrowserItems, browserQuery.data?.items]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length || !canUpload) return;
    const ok: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_MB * 1024 * 1024) {
        toast.error(`«${f.name}» excede o máximo de ${MAX_MB} MB.`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length > 0) uploadQueue.queueFiles(ok);
  };

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createClientGoogleDriveUserFolder(clientId, {
        name,
        parent_folder_id: browserQuery.data?.current_folder_id ?? null,
      }),
    onSuccess: async () => {
      toast.success('Pasta criada.');
      setCreateOpen(false);
      await invalidateBrowser();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao criar pasta'),
  });

  const moveMutation = useMutation({
    mutationFn: async (p: { fileId: string; destinationFolderId: string }) => {
      await moveClientGoogleDriveItem(clientId, {
        file_id: p.fileId,
        destination_folder_id: p.destinationFolderId,
      });
    },
    onSuccess: async () => {
      toast.success('Arquivo movido.');
      setActiveDragId(null);
      await invalidateBrowser();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao mover arquivo'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: ClientGoogleDriveBrowserItem) => {
      if (item.type === 'folder') {
        await deleteClientGoogleDriveFolder(clientId, item.id);
      } else {
        await deleteClientGoogleDriveItem(clientId, item.id);
      }
    },
    onSuccess: async (_void, item) => {
      toast.success(
        item.type === 'folder'
          ? 'Pasta enviada para a lixeira do Google Drive.'
          : 'Arquivo movido para a lixeira do Google Drive.',
      );
      setDeleteItem(null);
      setSelectedId(null);
      await invalidateBrowser();
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível concluir a exclusão.'),
  });

  const retryServerMutation = useMutation({
    mutationFn: async (p: { fileId: string; file: File }) => {
      await retryFailedClientGoogleDriveUploadWithProgress(clientId, p.fileId, p.file);
    },
    onSuccess: async () => {
      toast.success('Arquivo enviado com sucesso.');
      await invalidateBrowser();
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível repetir o envio.'),
  });

  const movingFileId = moveMutation.isPending && moveMutation.variables ? moveMutation.variables.fileId : null;

  const moveDialogOptions: MoveDestinationOption[] = useMemo(() => {
    const data = browserQuery.data;
    if (!data || !moveDialogItem || moveDialogItem.type !== 'file') return [];
    const cur = data.current_folder_id;
    const opts: MoveDestinationOption[] = [];
    const seen = new Set<string>();
    for (const seg of data.breadcrumb) {
      if (seg.folder_id === cur) continue;
      if (seen.has(seg.folder_id)) continue;
      seen.add(seg.folder_id);
      opts.push({ id: seg.folder_id, label: seg.name });
    }
    for (const it of data.items) {
      if (it.type !== 'folder') continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      opts.push({ id: it.id, label: it.name });
    }
    return opts;
  }, [browserQuery.data, moveDialogItem]);

  const goBack = () => {
    const data = browserQuery.data;
    if (!data?.parent_folder_id) return;
    const rootId = data.breadcrumb[0]?.folder_id;
    if (data.parent_folder_id === rootId) setFolderId(null);
    else setFolderId(data.parent_folder_id);
  };

  const canGoBack = useMemo(() => {
    const data = browserQuery.data;
    if (!data) return false;
    return data.current_folder_id !== data.breadcrumb[0]?.folder_id;
  }, [browserQuery.data]);

  const handleDragStart = (event: DragStartEvent) => {
    const fid = parseDragFileId(event.active.id);
    setActiveDragId(fid);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || !canUpload) return;
    const fileId = parseDragFileId(active.id);
    const destFolderId = parseDropFolderId(over.id);
    if (!fileId || !destFolderId) return;
    const cur = browserQuery.data?.current_folder_id;
    if (!cur || destFolderId === cur) return;
    void moveMutation.mutateAsync({ fileId, destinationFolderId: destFolderId });
  };

  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    return (
      mergedItems.find(
        (i) =>
          i.type === 'file' &&
          i.id === activeDragId &&
          !i.optimistic_upload &&
          (i.upload_status === undefined || i.upload_status === 'ready'),
      ) ?? null
    );
  }, [activeDragId, mergedItems]);

  const errCode = browserQuery.error
    ? (browserQuery.error as Error & { code?: string }).code
    : undefined;
  const errMsg = browserQuery.error instanceof Error ? browserQuery.error.message : 'Erro ao carregar arquivos.';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FolderOpen className="h-5 w-5 opacity-80" aria-hidden />
              Arquivos do cliente
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-2xl text-sm leading-relaxed">
              Organize documentos, imagens e anexos de{' '}
              <span className="font-medium text-foreground/90">{clientDisplayName}</span> em pastas sincronizadas com o
              Google Drive.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {browserQuery.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              A carregar…
            </div>
          ) : null}

          {browserQuery.isError ? (
            <Alert variant={errCode === 'drive_not_connected' ? 'default' : 'destructive'}>
              <AlertTitle>
                {errCode === 'drive_not_connected' ? 'Google Drive não configurado' : 'Não foi possível carregar'}
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{errMsg}</p>
                {errCode === 'drive_not_connected' ? (
                  <Button type="button" variant="secondary" size="sm" asChild>
                    <Link to="/settings?section=googleDrive">Abrir integrações</Link>
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void browserQuery.refetch()}>
                    Tentar de novo
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {browserQuery.data ? (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={ACCEPT_EXT}
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={retryFileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPT_EXT}
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const fid = retryTargetFileIdRef.current;
                  e.target.value = '';
                  retryTargetFileIdRef.current = null;
                  if (!file || !fid) return;
                  void retryServerMutation.mutateAsync({ fileId: fid, file });
                }}
              />

              <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 sm:px-4">
                <ClientDriveBreadcrumbDrop
                  segments={browserQuery.data.breadcrumb}
                  onNavigate={(id) => setFolderId(id)}
                  canDrop={canUpload}
                />
              </div>

              <ClientDriveToolbar
                canEdit={canUpload}
                isRefreshing={browserQuery.isFetching}
                onRefresh={() => void browserQuery.refetch()}
                onBack={goBack}
                canGoBack={canGoBack}
                onNewFolder={() => setCreateOpen(true)}
                onUploadClick={() => fileInputRef.current?.click()}
                driveFolderUrl={browserQuery.data.drive_folder_view_url}
                search={search}
                onSearchChange={setSearch}
                sort={sort}
                onSortChange={setSort}
              />

              {!canUpload ? (
                <p className="text-xs text-muted-foreground">
                  Sem permissão de edição para criar pastas ou enviar ficheiros.
                </p>
              ) : null}

              <ClientDriveGrid
                items={mergedItems}
                sort={sort}
                search={search}
                canEdit={canUpload}
                selectedId={selectedId}
                movingFileId={movingFileId}
                onOpenFolder={(id) => setFolderId(id)}
                onSelectItem={(item) => setSelectedId(item.id)}
                onMoveMenu={(item) => setMoveDialogItem(item)}
                onDeleteMenu={(item) => setDeleteItem(item)}
                onRetryServerFailedUpload={(fileId) => {
                  retryTargetFileIdRef.current = fileId;
                  retryFileInputRef.current?.click();
                }}
                onRetryOptimisticUpload={(tid) => uploadQueue.retry(tid)}
                onRemoveOptimisticUpload={(tid) => uploadQueue.remove(tid)}
                onCancelOptimisticUpload={(tid) => uploadQueue.cancel(tid)}
              />

              <DragOverlay dropAnimation={null}>
                {activeDragItem ? (
                  <div
                    className={cn(
                      'pointer-events-none flex max-w-[180px] flex-col items-center rounded-xl border-2 border-primary/40 bg-card p-4 text-center shadow-xl',
                    )}
                  >
                    <GripVertical className="mb-1 h-4 w-4 text-muted-foreground" aria-hidden />
                    <p className="line-clamp-2 text-xs font-medium">{activeDragItem.name}</p>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : null}
        </CardContent>
      </Card>

      <ClientDriveCreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (name) => {
          await createMutation.mutateAsync(name);
        }}
      />

      <ClientDriveMoveDialog
        open={moveDialogItem !== null}
        onOpenChange={(o) => {
          if (!o) setMoveDialogItem(null);
        }}
        fileName={moveDialogItem?.name ?? ''}
        options={moveDialogOptions}
        onConfirm={async (destinationFolderId) => {
          if (!moveDialogItem || moveDialogItem.type !== 'file') return;
          await moveMutation.mutateAsync({
            fileId: moveDialogItem.id,
            destinationFolderId,
          });
          setMoveDialogItem(null);
        }}
      />

      <AlertDialog open={deleteItem !== null} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteItem?.type === 'folder' ? 'Excluir pasta?' : 'Excluir arquivo?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItem?.type === 'folder' ? (
                <>
                  A pasta só pode ser eliminada se estiver vazia no PainelCRM. Será enviada para a lixeira do Google
                  Drive; pode recuperá-la a partir daí.
                </>
              ) : (
                <>O ficheiro será enviado para a lixeira do Google Drive. Esta ação pode ser revertida no Drive.</>
              )}
              {deleteItem ? (
                <>
                  {' '}
                  <span className="font-medium text-foreground">{deleteItem.name}</span>
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteItem}
              onClick={() => {
                if (deleteItem) void deleteMutation.mutateAsync(deleteItem);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
