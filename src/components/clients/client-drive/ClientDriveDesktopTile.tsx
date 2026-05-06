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
}: ClientDriveDesktopTileProps) {
  const isFolder = item.type === 'folder';
  const showMenu = isFolder || Boolean(openUrl) || (canEdit && !isFolder && (onMove || onDelete));

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
        'group relative flex min-h-[168px] flex-col rounded-xl border-2 bg-card p-4 text-center shadow-sm outline-none transition-all duration-200',
        'hover:border-primary/35 hover:shadow-md hover:ring-1 hover:ring-primary/15',
        selected && 'border-primary/60 ring-2 ring-primary/40 shadow-md',
        !selected && 'border-border/60',
        isOverDrop && canEdit && 'border-primary bg-primary/[0.07] ring-2 ring-primary/50 shadow-lg',
        isDragging && 'scale-[0.98] opacity-45',
        isMoving && 'pointer-events-none opacity-60',
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (isFolder && onOpenFolder) onOpenFolder();
        else onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isFolder && onOpenFolder) onOpenFolder();
          else onActivate();
        }
      }}
      onDoubleClick={(e) => {
        if (isFolder) return;
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

      <div
        className={cn(
          'flex min-h-[112px] w-full flex-col items-center justify-center px-1',
          canEdit && !isFolder && 'cursor-grab active:cursor-grabbing',
        )}
        {...(canEdit && !isFolder ? dragListeners : {})}
        {...(canEdit && !isFolder ? dragAttributes : {})}
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
          {isFolder ? 'Pasta' : `${formatBytes(item.size_bytes)} · ${formatWhen(item.modified_at || item.created_at)}`}
        </p>
      </div>

      {isMoving ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
          <span className="text-xs font-medium text-muted-foreground">A mover…</span>
        </div>
      ) : null}
    </div>
  );
}
