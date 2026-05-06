import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/sonner';
import {
  createClientGoogleDriveUserFolder,
  getClientGoogleDriveBrowser,
} from '@/services/clientGoogleDriveBrowser';
import { uploadClientGoogleDriveFile } from '@/services/clientGoogleDriveFiles';
import { ClientDriveBreadcrumb } from './ClientDriveBreadcrumb';
import { ClientDriveCreateFolderDialog } from './ClientDriveCreateFolderDialog';
import { ClientDriveGrid } from './ClientDriveGrid';
import { ClientDriveToolbar, type ClientDriveSort } from './ClientDriveToolbar';
import { ClientDriveUploadDialog } from './ClientDriveUploadDialog';

type Props = {
  clientId: string;
  clientDisplayName: string;
  canUpload: boolean;
};

const MAX_MB = 20;
const ACCEPT_EXT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';

export function ClientDriveFileManager({ clientId, clientDisplayName, canUpload }: Props) {
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ClientDriveSort>('name');
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const browserQuery = useQuery({
    queryKey: ['client-google-drive-browser', clientId, folderId ?? 'root'],
    queryFn: () => getClientGoogleDriveBrowser(clientId, folderId),
  });

  const invalidateBrowser = async () => {
    await queryClient.invalidateQueries({ queryKey: ['client-google-drive-browser', clientId] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const parent = browserQuery.data?.current_folder_id;
      return uploadClientGoogleDriveFile(clientId, file, {
        parentFolderId: parent ?? undefined,
      });
    },
    onSuccess: async () => {
      toast.success('Arquivo enviado com sucesso.');
      setUploadOpen(false);
      await invalidateBrowser();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao enviar arquivo'),
  });

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

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Máximo ${MAX_MB} MB.`);
      return;
    }
    void uploadMutation.mutateAsync(f);
  };

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
            <>
              <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 sm:px-4">
                <ClientDriveBreadcrumb
                  segments={browserQuery.data.breadcrumb}
                  onNavigate={(id) => setFolderId(id)}
                />
              </div>

              <ClientDriveToolbar
                canEdit={canUpload}
                isRefreshing={browserQuery.isFetching}
                onRefresh={() => void browserQuery.refetch()}
                onBack={goBack}
                canGoBack={canGoBack}
                onNewFolder={() => setCreateOpen(true)}
                onUploadClick={() => setUploadOpen(true)}
                isUploading={uploadMutation.isPending}
                driveFolderUrl={browserQuery.data.drive_folder_view_url}
                search={search}
                onSearchChange={setSearch}
                sort={sort}
                onSortChange={setSort}
              />

              {!canUpload ? (
                <p className="text-xs text-muted-foreground">Sem permissão de edição para criar pastas ou enviar ficheiros.</p>
              ) : null}

              <ClientDriveGrid
                items={browserQuery.data.items}
                sort={sort}
                search={search}
                onOpenFolder={(id) => setFolderId(id)}
              />
            </>
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

      <ClientDriveUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onFileSelected={onPickFile}
        isUploading={uploadMutation.isPending}
        maxMb={MAX_MB}
        accept={ACCEPT_EXT}
      />
    </div>
  );
}
