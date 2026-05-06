import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClientGoogleDriveBrowserBreadcrumb } from '@/services/clientGoogleDriveBrowser';

type Props = {
  segments: ClientGoogleDriveBrowserBreadcrumb[];
  /** `null` = pasta raiz «Arquivos». */
  onNavigate: (folderId: string | null) => void;
};

export function ClientDriveBreadcrumb({ segments, onNavigate }: Props) {
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
              <span className="max-w-[200px] truncate font-medium text-foreground" title={seg.name}>
                {seg.name}
              </span>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-auto max-w-[160px] truncate px-1 py-0 text-muted-foreground"
                title={seg.name}
                onClick={() => onNavigate(i === 0 ? null : seg.folder_id)}
              >
                {seg.name}
              </Button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
