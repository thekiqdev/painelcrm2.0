import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClientDriveOptimisticUploadMeta } from '@/services/clientGoogleDriveBrowser';

type Props = {
  meta: Pick<ClientDriveOptimisticUploadMeta, 'phase' | 'progress'>;
  className?: string;
};

export function ClientDriveUploadProgress({ meta, className }: Props) {
  const { phase, progress } = meta;

  if (phase === 'processing') {
    return (
      <div className={cn('flex flex-col items-center gap-2', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-xs font-medium text-foreground">Processando…</p>
        <p className="text-[11px] text-muted-foreground">A sincronizar com o Google Drive</p>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, progress));

  return (
    <div className={cn('w-full space-y-2 px-1', className)}>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/90 ring-1 ring-inset ring-primary/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/85 shadow-sm transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">A enviar para o Drive…</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}
