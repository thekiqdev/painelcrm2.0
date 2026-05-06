import React, { useMemo } from 'react';
import { FolderOpen } from 'lucide-react';
import type { ClientGoogleDriveBrowserItem } from '@/services/clientGoogleDriveBrowser';
import { ClientDriveItemCard } from './ClientDriveItemCard';
import type { ClientDriveSort } from './ClientDriveToolbar';

type Props = {
  items: ClientGoogleDriveBrowserItem[];
  sort: ClientDriveSort;
  search: string;
  onOpenFolder: (id: string) => void;
};

export function ClientDriveGrid({ items, sort, search, onOpenFolder }: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : [...items];
    list.sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' });
      }
      if (sort === 'type') {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' });
      }
      const da = new Date(a.modified_at || a.created_at || 0).getTime();
      const db = new Date(b.modified_at || b.created_at || 0).getTime();
      return db - da;
    });
    return list;
  }, [items, search, sort]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 py-16 text-center">
        <FolderOpen className="mb-3 h-12 w-12 text-muted-foreground/70" aria-hidden />
        <p className="text-base font-medium text-foreground">Esta pasta ainda está vazia</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Envie arquivos ou crie uma nova pasta para começar a organizar os documentos deste cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filtered.map((item) => (
        <ClientDriveItemCard key={`${item.type}-${item.id}`} item={item} onOpenFolder={onOpenFolder} />
      ))}
    </div>
  );
}
