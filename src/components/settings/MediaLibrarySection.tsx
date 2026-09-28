import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, FileText, Loader2, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/sonner';
import {
  deleteMediaLibraryAsset,
  formatBytes,
  listMediaLibrary,
  resolveMediaLibraryPreviewUrl,
  uploadMediaLibraryFile,
  type MediaLibraryAsset,
} from '@/services/mediaLibrary';
import { useAuth } from '@/contexts/AuthContext';

function isImageMime(mime: string): boolean {
  return String(mime || '').toLowerCase().startsWith('image/');
}

function AssetThumb({ asset }: { asset: MediaLibraryAsset }) {
  const url = resolveMediaLibraryPreviewUrl(asset);
  if (isImageMime(asset.mimeType)) {
    return (
      <img
        src={url}
        alt={asset.originalFilename || 'Pré-visualização'}
        className="h-20 w-full rounded-md object-cover bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex h-20 w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
      {asset.mimeType === 'application/pdf' ? (
        <FileText className="h-8 w-8 opacity-70" aria-hidden />
      ) : (
        <FileImage className="h-8 w-8 opacity-70" aria-hidden />
      )}
    </div>
  );
}

export function MediaLibrarySection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['media-library', search],
    queryFn: () => listMediaLibrary({ limit: 50, q: search || undefined }),
    enabled: !!user,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadMediaLibraryFile,
    onSuccess: async () => {
      toast.success('Ficheiro enviado para a biblioteca.');
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro no upload'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMediaLibraryAsset,
    onSuccess: async () => {
      toast.success('Mídia removida.');
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao apagar'),
  });

  const quota = data?.quota;
  const quotaPct = useMemo(() => {
    if (!quota || quota.maxTotalBytes <= 0) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.maxTotalBytes) * 100));
  }, [quota]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadMutation.mutate(file);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="h-5 w-5 opacity-80" aria-hidden />
            Mídias
          </CardTitle>
          <CardDescription>
            Biblioteca de ficheiros do tenant para produtos e anexos reutilizáveis. Ficheiros
            capturados pelo chatbot (extratos de leads) não entram aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {quota ? (
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {quota.usedCount} / {quota.maxCount} ficheiros · {formatBytes(quota.usedBytes)} /{' '}
                  {formatBytes(quota.maxTotalBytes)}
                </span>
                <Badge variant="secondary">{quotaPct}%</Badge>
              </div>
              <Progress value={quotaPct} className="h-2" />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(q.trim());
              }}
            >
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar por nome ou tipo…"
                className="min-w-0"
              />
              <Button type="submit" variant="secondary">
                Filtrar
              </Button>
            </form>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,audio/*,video/*,.doc,.docx,.xls,.xlsx,.txt"
                onChange={onPickFile}
              />
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                )}
                Carregar
              </Button>
            </div>
          </div>

          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />A carregar biblioteca…
            </div>
          ) : null}

          {isError ? (
            <div className="space-y-2 text-sm text-destructive">
              <p>{(error as Error)?.message || 'Erro ao carregar mídias.'}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : null}

          {!isPending && !isError && (data?.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há ficheiros na biblioteca. Carregue uma imagem ou PDF para começar.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.items || []).map((asset) => (
              <div
                key={asset.id}
                className="group overflow-hidden rounded-lg border border-border/70 bg-card"
              >
                <AssetThumb asset={asset} />
                <div className="space-y-2 p-3">
                  <div className="truncate text-sm font-medium" title={asset.originalFilename || asset.id}>
                    {asset.originalFilename || 'Sem nome'}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-normal">
                      {asset.scope}
                    </Badge>
                    <span>{formatBytes(asset.sizeBytes)}</span>
                    <span className="truncate">{asset.mimeType}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" asChild>
                      <a href={resolveMediaLibraryPreviewUrl(asset)} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (!window.confirm('Remover esta mídia da biblioteca?')) return;
                        deleteMutation.mutate(asset.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Apagar</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default MediaLibrarySection;
