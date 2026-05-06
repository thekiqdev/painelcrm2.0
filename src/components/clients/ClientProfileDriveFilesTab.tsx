import React, { useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FolderOpen, Loader2, RefreshCw, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/sonner';
import { ensureClientGoogleDriveFolders } from '@/services/clientGoogleDriveFolders';
import { listClientGoogleDriveFiles, uploadClientGoogleDriveFile } from '@/services/clientGoogleDriveFiles';

function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

type Props = {
  clientId: string;
  clientDisplayName: string;
  canUpload: boolean;
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ClientProfileDriveFilesTab({ clientId, clientDisplayName, canUpload }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['client-google-drive-folders', clientId],
    queryFn: () => ensureClientGoogleDriveFolders(clientId),
  });
  const filesQuery = useQuery({
    queryKey: ['client-google-drive-files', clientId],
    queryFn: () => listClientGoogleDriveFiles(clientId),
    enabled: Boolean(data && !isError),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => uploadClientGoogleDriveFile(clientId, file),
    onSuccess: async () => {
      toast.success('Arquivo enviado com sucesso.');
      await queryClient.invalidateQueries({ queryKey: ['client-google-drive-files', clientId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao enviar arquivo'),
  });

  const errMsg = error instanceof Error ? error.message : 'Erro ao preparar pastas no Google Drive';
  const files = filesQuery.data ?? [];

  const maxMb = 20;
  const acceptExt = useMemo(
    () => '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip',
    [],
  );

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Máximo ${maxMb}MB.`);
      return;
    }
    void uploadMutation.mutateAsync(f);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 opacity-80" aria-hidden />
              Arquivos do cliente
            </CardTitle>
            <CardDescription>
              Envie documentos, imagens e anexos gerais deste cliente. Os arquivos serão organizados automaticamente no
              Google Drive da empresa.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              A preparar estrutura de pastas no Drive…
            </div>
          ) : null}

          {isError ? (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível preparar as pastas</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{errMsg}</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {data ? (
            <>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-sm font-medium">Upload simples (sem categoria)</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nesta fase, todo envio vai para <code className="rounded bg-muted px-1">Clientes &gt; {clientDisplayName} &gt; Arquivos</code>.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Limite: {maxMb}MB. Tipos: PDF, imagens, DOC/DOCX, XLS/XLSX, TXT, CSV e ZIP.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={acceptExt}
                    onChange={(e) => {
                      onPickFile(e.target.files?.[0] ?? null);
                      e.currentTarget.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canUpload || uploadMutation.isPending}
                    className="gap-2"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden />
                    )}
                    Enviar arquivo
                  </Button>
                  {!canUpload ? (
                    <p className="text-xs text-muted-foreground">
                      Sem permissão de edição de cliente para enviar arquivos.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/25 px-4 py-3 font-mono text-xs leading-relaxed">
                <p className="mb-2 font-sans text-sm font-medium text-foreground">Estrutura</p>
                <pre className="whitespace-pre-wrap text-muted-foreground">
                  {`Empresa\n└── Clientes\n    └── ${clientDisplayName}\n        ├── Arquivos\n        ├── Contratos\n        ├── Propostas\n        └── Faturas`}
                </pre>
              </div>

              {data.created ? (
                <p className="text-sm text-muted-foreground">
                  Pastas criadas agora no Google Drive. Nas próximas visitas serão reutilizadas as mesmas pastas.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Estrutura já existente — sem alterações no Drive.</p>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Abrir no Google Drive</p>
                <ul className="flex flex-col gap-2 text-sm">
                  <li>
                    <a
                      href={driveFolderUrl(data.folder_arquivos_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                    >
                      Pasta Arquivos <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Arquivos enviados</p>
                {filesQuery.isPending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    A carregar arquivos...
                  </div>
                ) : null}
                {filesQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Falha ao carregar lista</AlertTitle>
                    <AlertDescription>
                      {filesQuery.error instanceof Error ? filesQuery.error.message : 'Erro ao listar arquivos.'}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {!filesQuery.isPending && !filesQuery.isError && files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum arquivo enviado para este cliente ainda.</p>
                ) : null}
                {!filesQuery.isPending && !filesQuery.isError && files.length > 0 ? (
                  <div className="rounded-md border">
                    <ul className="divide-y">
                      {files.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.mime_type} • {formatBytes(Number(f.size_bytes))}
                            </p>
                          </div>
                          <div className="shrink-0">
                            <Button asChild size="sm" variant="outline">
                              <a href={f.web_view_link || driveFolderUrl(data.folder_arquivos_id)} target="_blank" rel="noopener noreferrer">
                                Abrir no Drive
                              </a>
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <details className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">IDs técnicos (Drive)</summary>
                <dl className="mt-2 grid gap-1 font-mono text-[11px] text-muted-foreground">
                  <div>
                    <dt className="text-foreground/80">Raiz cliente</dt>
                    <dd className="break-all">{data.client_root_folder_id}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/80">Arquivos</dt>
                    <dd className="break-all">{data.folder_arquivos_id}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/80">Contratos</dt>
                    <dd className="break-all">{data.folder_contratos_id}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/80">Propostas</dt>
                    <dd className="break-all">{data.folder_propostas_id}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/80">Faturas</dt>
                    <dd className="break-all">{data.folder_faturas_id}</dd>
                  </div>
                </dl>
              </details>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
