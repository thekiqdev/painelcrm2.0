import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileImage, FileText, Images, Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import {
  formatBytes,
  listMediaLibrary,
  resolveMediaLibraryPreviewUrl,
  uploadMediaLibraryFile,
  type MediaLibraryAsset,
} from '@/services/mediaLibrary';
import { cn } from '@/lib/utils';

export type MediaPickerAccept = 'any' | 'image' | 'document';

export type MediaPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Filtro de MIME no picker (listagem library já exclui flow_inbound_temp). */
  accept?: MediaPickerAccept;
  /** Upload rápido para a library (default true). */
  allowUpload?: boolean;
  confirmLabel?: string;
  onSelect: (asset: MediaLibraryAsset) => void | Promise<void>;
};

function isImageMime(mime: string): boolean {
  return String(mime || '').toLowerCase().startsWith('image/');
}

function matchesAccept(asset: MediaLibraryAsset, accept: MediaPickerAccept): boolean {
  if (accept === 'any') return true;
  if (accept === 'image') return isImageMime(asset.mimeType);
  // document: PDF e office-ish (não imagem/áudio/vídeo)
  const mt = String(asset.mimeType || '').toLowerCase();
  if (mt.startsWith('image/') || mt.startsWith('audio/') || mt.startsWith('video/')) return false;
  return true;
}

function AssetThumb({ asset }: { asset: MediaLibraryAsset }) {
  const url = resolveMediaLibraryPreviewUrl(asset);
  if (isImageMime(asset.mimeType)) {
    return (
      <img
        src={url}
        alt={asset.originalFilename || 'Pré-visualização'}
        className="h-24 w-full rounded-md object-cover bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex h-24 w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
      {asset.mimeType === 'application/pdf' ? (
        <FileText className="h-8 w-8 opacity-70" aria-hidden />
      ) : (
        <FileImage className="h-8 w-8 opacity-70" aria-hidden />
      )}
    </div>
  );
}

/**
 * S33.1/S33.2 — picker reutilizável (composer chat + produtos/itens + nó send_message).
 * Lista só scopes da Media Library (`library` / `product_image`).
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  title = 'Biblioteca de mídias',
  description = 'Escolha um ficheiro da biblioteca ou carregue um novo. Sem colar URL.',
  accept = 'any',
  allowUpload = true,
  confirmLabel = 'Usar selecionado',
  onSelect,
}: MediaPickerDialogProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['media-library', 'picker', search],
    queryFn: () => listMediaLibrary({ limit: 50, q: search || undefined }),
    enabled: open,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadMediaLibraryFile,
    onSuccess: async (asset) => {
      toast.success('Ficheiro enviado para a biblioteca.');
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
      if (matchesAccept(asset, accept)) {
        setSelectedId(asset.id);
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Erro no upload'),
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    return list.filter((a) => matchesAccept(a, accept));
  }, [data?.items, accept]);

  const selected = items.find((a) => a.id === selectedId) ?? null;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (accept === 'image' && !file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.');
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      await onSelect(selected);
      onOpenChange(false);
      setSelectedId(null);
    } catch {
      // Caller já notifica o erro; mantém o dialog aberto.
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSelectedId(null);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-5 w-5 opacity-80" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome…"
            className="flex-1 min-w-[160px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearch(q.trim());
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => setSearch(q.trim())}>
            Buscar
          </Button>
          {allowUpload ? (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={
                  accept === 'image'
                    ? 'image/jpeg,image/png,image/webp,image/gif'
                    : accept === 'document'
                      ? '.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf'
                      : 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt'
                }
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadMutation.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Carregar
              </Button>
            </>
          ) : null}
        </div>

        {data?.quota ? (
          <p className="text-xs text-muted-foreground">
            Quota: {data.quota.usedCount}/{data.quota.maxCount} ficheiros ·{' '}
            {formatBytes(data.quota.usedBytes)} / {formatBytes(data.quota.maxTotalBytes)}
          </p>
        ) : null}

        <div className="min-h-[220px] max-h-[45vh] overflow-y-auto rounded-md border p-2">
          {isPending ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : isError ? (
            <div className="space-y-2 p-4 text-sm">
              <p className="text-destructive">{(error as Error)?.message || 'Erro ao listar.'}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum ficheiro na biblioteca{accept === 'image' ? ' (imagens)' : ''}. Use Carregar
              para adicionar.
            </p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((asset) => {
                const active = asset.id === selectedId;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-md border p-2 text-left transition-colors hover:bg-accent/40',
                        active && 'border-primary ring-2 ring-primary/30',
                      )}
                      onClick={() => setSelectedId(asset.id)}
                    >
                      <AssetThumb asset={asset} />
                      <p className="mt-1 truncate text-xs font-medium">
                        {asset.originalFilename || asset.id.slice(0, 8)}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {isImageMime(asset.mimeType) ? 'imagem' : 'ficheiro'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatBytes(asset.sizeBytes)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selected || confirming}
            onClick={() => void handleConfirm()}
          >
            {confirming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MediaPickerDialog;
