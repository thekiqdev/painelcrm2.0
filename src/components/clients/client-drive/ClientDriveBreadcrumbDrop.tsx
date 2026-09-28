import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ClientGoogleDriveBrowserBreadcrumb } from '@/services/clientGoogleDriveBrowser';

export const CRUMB_DROP_PREFIX = 'CRUMB|';

type Props = {
  segments: ClientGoogleDriveBrowserBreadcrumb[];
  /** `null` = pasta raiz «Arquivos». */
  onNavigate: (folderId: string | null) => void;
  canDrop: boolean;
};

function CrumbSegment({
  folderId,
  name,
  isFirst,
  onNavigate,
  canDrop,
}: {
  folderId: string;
  name: string;
  isFirst: boolean;
  onNavigate: (folderId: string | null) => void;
  canDrop: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${CRUMB_DROP_PREFIX}${folderId}`,
    disabled: !canDrop,
    data: { type: 'crumb', folderId },
  });

  return (
    <span
      ref={setNodeRef}
      className={cn(
        'inline-flex max-w-[200px] rounded-md transition-colors',
        canDrop && isOver && 'bg-primary/15 ring-2 ring-primary/45',
      )}
    >
      <Button
        type="button"
        variant="link"
        className="h-auto max-w-full truncate px-1 py-0 text-muted-foreground"
        title={name}
        onClick={() => onNavigate(isFirst ? null : folderId)}
      >
        {name}
      </Button>
    </span>
  );
}

export function ClientDriveBreadcrumbDrop({ segments, onNavigate, canDrop }: Props) {
  return (
    <nav aria-label="Localização na pasta" className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <React.Fragment key={seg.folder_id}>
            {i > 0 ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            {isLast ? (
              <span className="max-w-[220px] truncate font-medium text-foreground" title={seg.name}>
                {seg.name}
              </span>
            ) : (
              <CrumbSegment
                folderId={seg.folder_id}
                name={seg.name}
                isFirst={i === 0}
                onNavigate={onNavigate}
                canDrop={canDrop}
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
