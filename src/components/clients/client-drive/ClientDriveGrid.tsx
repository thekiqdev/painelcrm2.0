import React, { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { FolderOpen } from 'lucide-react';
import type { ClientGoogleDriveBrowserItem } from '@/services/clientGoogleDriveBrowser';
import { ClientDriveDesktopTile } from './ClientDriveDesktopTile';
import type { ClientDriveSort } from './ClientDriveToolbar';

export const DND_FILE_PREFIX = 'FILE|';
export const DND_FOLD_PREFIX = 'FOLD|';

type Props = {
  items: ClientGoogleDriveBrowserItem[];
  sort: ClientDriveSort;
  search: string;
  canEdit: boolean;
  selectedId: string | null;
  /** drive file id em movimento */
  movingFileId: string | null;
  onOpenFolder: (id: string) => void;
  onSelectItem: (item: ClientGoogleDriveBrowserItem) => void;
  onMoveMenu: (item: ClientGoogleDriveBrowserItem) => void;
  onDeleteMenu: (item: ClientGoogleDriveBrowserItem) => void;
  onRetryOptimisticUpload?: (tempId: string) => void;
  onRemoveOptimisticUpload?: (tempId: string) => void;
  onCancelOptimisticUpload?: (tempId: string) => void;
};

function GridItem({
  item,
  canEdit,
  selected,
  movingFileId,
  onOpenFolder,
  onSelectItem,
  onMoveMenu,
  onDeleteMenu,
  onRetryOptimisticUpload,
  onRemoveOptimisticUpload,
  onCancelOptimisticUpload,
}: {
  item: ClientGoogleDriveBrowserItem;
  canEdit: boolean;
  selected: boolean;
  movingFileId: string | null;
  onOpenFolder: (id: string) => void;
  onSelectItem: (item: ClientGoogleDriveBrowserItem) => void;
  onMoveMenu: (item: ClientGoogleDriveBrowserItem) => void;
  onDeleteMenu: (item: ClientGoogleDriveBrowserItem) => void;
  onRetryOptimisticUpload?: (tempId: string) => void;
  onRemoveOptimisticUpload?: (tempId: string) => void;
  onCancelOptimisticUpload?: (tempId: string) => void;
}) {
  const isFolder = item.type === 'folder';
  const ox = item.optimistic_upload;

  if (!isFolder && ox) {
    return (
      <ClientDriveDesktopTile
        item={item}
        selected={selected}
        canEdit={canEdit}
        isDragging={false}
        isOverDrop={false}
        isMoving={false}
        onActivate={() => {}}
        openUrl={null}
        optimisticHandlers={{
          onRetry: () => onRetryOptimisticUpload?.(ox.temp_id),
          onRemove: () => onRemoveOptimisticUpload?.(ox.temp_id),
          onCancel:
            ox.phase === 'uploading' || ox.phase === 'processing'
              ? () => onCancelOptimisticUpload?.(ox.temp_id)
              : undefined,
        }}
      />
    );
  }

  const draggable = useDraggable({
    id: `${DND_FILE_PREFIX}${item.id}`,
    disabled: !canEdit || isFolder,
    data: { kind: 'file' as const, driveFileId: item.id },
  });

  const droppable = useDroppable({
    id: `${DND_FOLD_PREFIX}${item.id}`,
    disabled: !canEdit || !isFolder,
    data: { kind: 'folder' as const, folderId: item.id },
  });

  const isMovingFile = !isFolder && movingFileId === item.id;

  if (isFolder) {
    return (
      <ClientDriveDesktopTile
        item={item}
        selected={selected}
        canEdit={canEdit}
        isDragging={false}
        isOverDrop={droppable.isOver}
        isMoving={false}
        setDropRef={droppable.setNodeRef}
        onActivate={() => onOpenFolder(item.id)}
        onOpenFolder={() => onOpenFolder(item.id)}
        openUrl={null}
      />
    );
  }

  return (
    <ClientDriveDesktopTile
      item={item}
      selected={selected}
      canEdit={canEdit}
      isDragging={draggable.isDragging}
      isOverDrop={false}
      isMoving={Boolean(isMovingFile)}
      dragAttributes={draggable.attributes}
      dragListeners={draggable.listeners}
      setDragRef={draggable.setNodeRef}
      onActivate={() => onSelectItem(item)}
      openUrl={item.web_view_link || undefined}
      onMove={canEdit ? () => onMoveMenu(item) : undefined}
      onDelete={canEdit ? () => onDeleteMenu(item) : undefined}
    />
  );
}

export function ClientDriveGrid({
  items,
  sort,
  search,
  canEdit,
  selectedId,
  movingFileId,
  onOpenFolder,
  onSelectItem,
  onMoveMenu,
  onDeleteMenu,
  onRetryOptimisticUpload,
  onRemoveOptimisticUpload,
  onCancelOptimisticUpload,
}: Props) {
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {filtered.map((item) => (
        <GridItem
          key={`${item.type}-${item.id}`}
          item={item}
          canEdit={canEdit}
          selected={selectedId === item.id}
          movingFileId={movingFileId}
          onOpenFolder={onOpenFolder}
          onSelectItem={onSelectItem}
          onMoveMenu={onMoveMenu}
          onDeleteMenu={onDeleteMenu}
          onRetryOptimisticUpload={onRetryOptimisticUpload}
          onRemoveOptimisticUpload={onRemoveOptimisticUpload}
          onCancelOptimisticUpload={onCancelOptimisticUpload}
        />
      ))}
    </div>
  );
}
