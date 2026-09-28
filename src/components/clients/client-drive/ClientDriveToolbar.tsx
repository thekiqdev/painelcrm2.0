import React from 'react';
import {
  ArrowLeft,
  ExternalLink,
  FolderPlus,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ClientDriveSort = 'name' | 'modified' | 'type';

type Props = {
  canEdit: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  canGoBack: boolean;
  onNewFolder: () => void;
  onUploadClick: () => void;
  driveFolderUrl: string | null;
  search: string;
  onSearchChange: (v: string) => void;
  sort: ClientDriveSort;
  onSortChange: (v: ClientDriveSort) => void;
};

export function ClientDriveToolbar({
  canEdit,
  isRefreshing,
  onRefresh,
  onBack,
  canGoBack,
  onNewFolder,
  onUploadClick,
  driveFolderUrl,
  search,
  onSearchChange,
  sort,
  onSortChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/80 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onBack}
          disabled={!canGoBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void onRefresh()}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Atualizar
        </Button>
        {driveFolderUrl ? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir no Google Drive
            </a>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={onNewFolder}
            disabled={!canEdit}
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            Nova pasta
          </Button>
          <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={onUploadClick} disabled={!canEdit}>
            <Upload className="h-4 w-4" aria-hidden />
            Enviar arquivo
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nome…"
              className="pl-8"
              aria-label="Buscar por nome"
            />
          </div>
          <Select value={sort} onValueChange={(v) => onSortChange(v as ClientDriveSort)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
              <SelectItem value="modified">Mais recentes</SelectItem>
              <SelectItem value="type">Tipo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
