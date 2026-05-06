import React from 'react';
import type { DraggableAttributes, SyntheticListenerMap } from '@dnd-kit/core';
import {
  Archive,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  MoreVertical,
  Presentation,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClientGoogleDriveBrowserItem } from '@/services/clientGoogleDriveBrowser';
import { ClientDriveUploadProgress } from './ClientDriveUploadProgress';

function itemIcon(item: ClientGoogleDriveBrowserItem, size: 'lg' | 'xl') {
  const cls = size === 'xl' ? 'h-16 w-16' : 'h-14 w-14';
  if (item.type === 'folder') {
    return <Folder className={cn(cls, 'text-sky-600 dark:text-sky-400')} aria-hidden />;
  }
  const mime = (item.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) {
    return <FileImage className={cn(cls, 'text-emerald-600 dark:text-emerald-400')} aria-hidden />;
  }
  if (mime === 'application/pdf') {
    return <FileText className={cn(cls, 'text-red-600 dark:text-red-400')} aria-hidden />;
  }
  if (
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return <FileSpreadsheet className={cn(cls, 'text-green-600 dark:text-green-400')} aria-hidden />;
  }
  if (mime.includes('presentation') || mime.includes('vnd.google-apps.presentation')) {
    return <Presentation className={cn(cls, 'text-amber-600 dark:text-amber-400')} aria-hidden />;
  }
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') {
    return <Archive className={cn(cls, 'text-violet-600 dark:text-violet-400')} aria-hidden />;
  }
  if (
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('vnd.google-apps.document')
  ) {
    return <FileText className={cn(cls, 'text-blue-600 dark:text-blue-400')} aria-hidden />;
  }
  return <File className={cn(cls, 'text-muted-foreground')} aria-hidden />;
}

function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export type ClientDriveOptimisticHandlers = {
  onRetry?: () => void;
  onRemove?: () => void;
  onCancel?: () => void;
};

export type ClientDriveDesktopTileProps = {
  item: ClientGoogleDriveBrowserItem;
  selected: boolean;
  canEdit: boolean;
  isDragging: boolean;
  isOverDrop: boolean;
  isMoving: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  setDragRef?: (node: HTMLElement | null) => void;
  setDropRef?: (node: HTMLElement | null) => void;
  onActivate: () => void;
  onOpenFolder?: () => void;
  openUrl?: string | null;
  onMove?: () => void;
  onDelete?: () => void;
  optimisticHandlers?: ClientDriveOptimisticHandlers;
};

export function ClientDriveDesktopTile({
  item,
  selected,
  canEdit,
  isDragging,
  isOverDrop,
  isMoving,
  dragAttributes,
  dragListeners,
  setDragRef,
  setDropRef,
  onActivate,
  onOpenFolder,
  openUrl,
  onMove,
  onDelete,
  optimisticHandlers,
}: ClientDriveDesktopTileProps) {
  const isFolder = item.type === 'folder';
  const ox = item.optimistic_upload;
  const isOptimistic = Boolean(ox);
  const isError = ox?.phase === 'error';

  const showMenu =
    !isOptimistic &&
    (isFolder || Boolean(openUrl) || (canEdit && !isFolder && (onMove || onDelete)));

  const mergedRef = (node: HTMLElement | null) => {
    setDragRef?.(node);
    setDropRef?.(node);
  };

  return (
    <div
      ref={mergedRef}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex min-h-[168px] flex-col rounded-xl border-2 bg-card p-4 text-center shadow-sm outline-none transition-all duration-300',
        'hover:border-primary/35 hover:shadow-md hover:ring-1 hover:ring-primary/15',
        selected && !isOptimistic && 'border-primary/60 ring-2 ring-primary/40 shadow-md',
        !selected && !isOptimistic && 'border-border/60',
        isOverDrop && canEdit && !isOptimistic && 'border-primary bg-primary/[0.07] ring-2 ring-primary/50 shadow-lg',
        isDragging && 'scale-[0.98] opacity-45',
        isMoving && 'pointer-events-none opacity-60',
        isOptimistic && !isError && 'border-primary/35 ring-1 ring-primary/20',
        isError && 'border-destructive/40 ring-1 ring-destructive/25',
      )}
      onClick={(e) => {
        if (isOptimistic) return;
        e.stopPropagation();
        if (isFolder && onOpenFolder) onOpenFolder();
        else onActivate();
      }}
      onKeyDown={(e) => {
        if (isOptimistic) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isFolder && onOpenFolder) onOpenFolder();
          else onActivate();
        }
      }}
      onDoubleClick={(e) => {
        if (isFolder || isOptimistic) return;
        e.preventDefault();
        e.stopPropagation();
        if (openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer');
      }}
    >
      {showMenu ? (
        <div className="absolute right-1 top-1 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-70 hover:opacity-100"
                aria-label={`Menu: ${item.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {isFolder ? (
                <DropdownMenuItem asChild>
                  <a
                    href={`https://drive.google.com/drive/folders/${encodeURIComponent(item.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir no Google Drive
                  </a>
                </DropdownMenuItem>
              ) : null}
              {!isFolder && openUrl ? (
                <DropdownMenuItem asChild>
                  <a href={openUrl} target="_blank" rel="noopener noreferrer">
                    Abrir no Google Drive
                  </a>
                </DropdownMenuItem>
              ) : null}
              {!isFolder && canEdit && onMove ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onMove()}>Mover…</DropdownMenuItem>
                </>
              ) : null}
              {!isFolder && canEdit && onDelete ? (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete()}>
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {isOptimistic && ox && (ox.phase === 'uploading' || ox.phase === 'processing') && optimisticHandlers?.onCancel ? (
        <div className="absolute right-1 top-1 z-20">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            aria-label="Cancelar envio"
            onClick={(e) => {
              e.stopPropagation();
              optimisticHandlers.onCancel?.();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-h-[112px] w-full flex-col items-center justify-center px-1 transition-opacity duration-300',
          canEdit && !isFolder && !isOptimistic && 'cursor-grab active:cursor-grabbing',
          isOptimistic && ox?.phase !== 'error' && 'opacity-55',
        )}
        {...(canEdit && !isFolder && !isOptimistic ? dragListeners : {})}
        {...(canEdit && !isFolder && !isOptimistic ? dragAttributes : {})}
      >
        <div className="flex min-h-[88px] items-center justify-center">{itemIcon(item, 'xl')}</div>
      </div>

      <div className="mt-2 min-h-[3rem] w-full px-0.5">
        <p
          className="break-words text-center text-sm font-medium leading-snug text-foreground"
          title={item.name}
          style={{ wordBreak: 'break-word' }}
        >
          {item.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isFolder
            ? 'Pasta'
            : isOptimistic && ox?.phase !== 'error'
              ? formatBytes(item.size_bytes)
              : `${formatBytes(item.size_bytes)} · ${formatWhen(item.modified_at || item.created_at)}`}
        </p>
      </div>

      {isOptimistic && ox && ox.phase !== 'error' ? (
        <div className="absolute inset-x-2 bottom-2 z-10 rounded-lg border border-border/60 bg-background/95 p-3 shadow-md backdrop-blur-sm">
          <ClientDriveUploadProgress meta={{ phase: ox.phase, progress: ox.progress }} />
        </div>
      ) : null}

      {isOptimistic && ox && ox.phase === 'error' ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/92 p-3 text-center backdrop-blur-sm">
          <p className="text-sm font-medium text-destructive">Falha no upload</p>
          <p className="line-clamp-3 text-xs text-muted-foreground">{ox.error_message || 'Erro desconhecido.'}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => optimisticHandlers?.onRetry?.()}>
              Tentar novamente
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => optimisticHandlers?.onRemove?.()}>
              Remover
            </Button>
          </div>
        </div>
      ) : null}

      {isMoving ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
          <span className="text-xs font-medium text-muted-foreground">A mover…</span>
        </div>
      ) : null}
    </div>
  );
}
