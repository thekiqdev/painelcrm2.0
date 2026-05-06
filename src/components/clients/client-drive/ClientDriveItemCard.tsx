import React from 'react';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClientGoogleDriveBrowserItem } from '@/services/clientGoogleDriveBrowser';

function itemIcon(item: ClientGoogleDriveBrowserItem) {
  if (item.type === 'folder') {
    return <Folder className="h-10 w-10 text-sky-600 dark:text-sky-400" aria-hidden />;
  }
  const mime = (item.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) {
    return <FileImage className="h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  }
  if (mime === 'application/pdf') {
    return <FileText className="h-10 w-10 text-red-600 dark:text-red-400" aria-hidden />;
  }
  if (
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return <FileSpreadsheet className="h-10 w-10 text-green-600 dark:text-green-400" aria-hidden />;
  }
  if (mime.includes('presentation') || mime.includes('vnd.google-apps.presentation')) {
    return <Presentation className="h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden />;
  }
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') {
    return <Archive className="h-10 w-10 text-violet-600 dark:text-violet-400" aria-hidden />;
  }
  if (
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('vnd.google-apps.document')
  ) {
    return <FileText className="h-10 w-10 text-blue-600 dark:text-blue-400" aria-hidden />;
  }
  return <File className="h-10 w-10 text-muted-foreground" aria-hidden />;
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

type Props = {
  item: ClientGoogleDriveBrowserItem;
  onOpenFolder?: (id: string) => void;
};

export function ClientDriveItemCard({ item, onOpenFolder }: Props) {
  const openUrl = item.web_view_link || undefined;
  const isFolder = item.type === 'folder';

  return (
    <div
      className="group flex flex-col rounded-xl border border-border/70 bg-card p-3 shadow-sm transition hover:border-border hover:shadow-md"
      role={isFolder ? 'button' : undefined}
      tabIndex={isFolder ? 0 : undefined}
      onClick={() => {
        if (isFolder && onOpenFolder) onOpenFolder(item.id);
      }}
      onKeyDown={(e) => {
        if (!isFolder || !onOpenFolder) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenFolder(item.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="shrink-0 rounded-lg bg-muted/50 p-2">{itemIcon(item)}</div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate font-medium leading-tight" title={item.name}>
              {item.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isFolder ? 'Pasta' : formatBytes(item.size_bytes)}
              {!isFolder ? ` · ${formatWhen(item.modified_at || item.created_at)}` : null}
            </p>
          </div>
        </div>
        {(isFolder || openUrl) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 opacity-70 group-hover:opacity-100"
                aria-label={`Ações: ${item.name}`}
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
                    Abrir pasta no Google Drive
                  </a>
                </DropdownMenuItem>
              ) : null}
              {openUrl ? (
                <DropdownMenuItem asChild>
                  <a href={openUrl} target="_blank" rel="noopener noreferrer">
                    Abrir no Google Drive
                  </a>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
