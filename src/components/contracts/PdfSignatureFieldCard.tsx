import React from 'react';
import { cn } from '@/lib/utils';
import { PenLine } from 'lucide-react';

type Props = {
  signerName: string;
  taxId?: string | null;
  email?: string | null;
  status: 'pending' | 'placed' | 'signed';
  selected?: boolean;
  palette: { border: string; bg: string; text: string; dot: string };
  compact?: boolean;
};

/** Preview do bloco real de assinatura (220×110 proporcional). */
export function PdfSignatureFieldCard({
  signerName,
  taxId,
  email,
  status,
  selected,
  palette,
}: Props) {
  const statusLabel =
    status === 'signed' ? 'Assinado' : status === 'placed' ? 'Aguardando assinatura' : 'Posicionar';

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md border-2 bg-background text-left shadow-sm transition-shadow',
        palette.border,
        status === 'pending' ? 'border-dashed' : 'border-solid',
        selected && 'ring-2 ring-primary ring-offset-1 shadow-md',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-1 border-b px-2 py-1 text-[9px] font-bold uppercase tracking-wide',
          palette.bg,
          palette.text,
        )}
      >
        <span className="flex items-center gap-1 truncate">
          <PenLine className="h-3 w-3 shrink-0 opacity-80" />
          Assinatura
        </span>
        <span className="shrink-0 rounded bg-background/80 px-1 py-0.5 text-[8px] font-medium normal-case">
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between px-2 py-1.5 min-h-0">
        <div className="flex flex-1 items-center justify-center rounded border border-dashed border-muted-foreground/25 bg-muted/20">
          <span className="text-[9px] text-muted-foreground">Imagem da assinatura</span>
        </div>
        <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1">
          <div className="h-px w-full max-w-[85%] bg-muted-foreground/40" aria-hidden />
          <p className="truncate text-[10px] font-semibold text-foreground leading-tight">{signerName}</p>
          {taxId ? <p className="truncate text-[9px] text-muted-foreground">CPF/CNPJ {taxId}</p> : null}
          {email ? <p className="truncate text-[9px] text-muted-foreground">{email}</p> : null}
        </div>
      </div>
    </div>
  );
}
