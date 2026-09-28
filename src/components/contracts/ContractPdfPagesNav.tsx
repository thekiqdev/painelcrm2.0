import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FilePlus2, FileText, Loader2, PenLine } from 'lucide-react';
import type { ContractPdfExtraPage } from '@/types/contractPdfEditor';

type Props = {
  sourcePageCount: number;
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  extraPages: ContractPdfExtraPage[];
  onAppendPage?: () => void;
  appendLoading?: boolean;
  readOnly?: boolean;
};

export function ContractPdfPagesNav({
  sourcePageCount,
  totalPages,
  currentPage,
  onPageSelect,
  extraPages,
  onAppendPage,
  appendLoading = false,
  readOnly = false,
}: Props) {
  const source = Math.max(1, sourcePageCount);
  const total = Math.max(source, totalPages);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Páginas</h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {total} {total === 1 ? 'página' : 'páginas'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {Array.from({ length: source }, (_, i) => {
          const p = i + 1;
          const active = currentPage === p;
          return (
            <button
              key={`src-${p}`}
              type="button"
              onClick={() => onPageSelect(p)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors',
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-border/50 bg-muted/30 hover:bg-muted/60',
              )}
              aria-label={`Página ${p} do PDF original`}
              aria-current={active ? 'page' : undefined}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-medium tabular-nums">{p}</span>
            </button>
          );
        })}
        {extraPages.map((ep) => {
          const p = ep.virtual_page;
          const active = currentPage === p;
          return (
            <button
              key={ep.id}
              type="button"
              onClick={() => onPageSelect(p)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors',
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10',
              )}
              aria-label={`Página editável ${p}`}
              aria-current={active ? 'page' : undefined}
            >
              <PenLine className="h-4 w-4 text-primary/80" />
              <span className="text-[10px] font-medium tabular-nums">{p}</span>
            </button>
          );
        })}
      </div>
      {onAppendPage && !readOnly ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-9 w-full gap-1.5"
          disabled={appendLoading}
          onClick={() => void onAppendPage()}
        >
          {appendLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FilePlus2 className="h-4 w-4" />
          )}
          Adicionar página
        </Button>
      ) : null}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Páginas com ícone de caneta são editáveis (texto rico). O PDF original não é alterado até a
        exportação.
      </p>
    </div>
  );
}
