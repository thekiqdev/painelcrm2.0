import React, { useCallback } from 'react';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { cn } from '@/lib/utils';

type Props = {
  html: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  pageWidth: number;
  pageHeight: number;
  className?: string;
  /** Desativa interação do editor durante posicionamento de assinatura. */
  placementMode?: boolean;
};

/** Visualização/edição de página extra (camada virtual, exportada na geração do PDF). */
export function ContractPdfExtraPageView({
  html,
  onChange,
  readOnly = false,
  pageWidth,
  pageHeight,
  className,
  placementMode = false,
}: Props) {
  const handleChange = useCallback(
    (v: string) => {
      onChange(v);
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        'absolute inset-0 z-[8] flex flex-col overflow-hidden bg-white',
        className,
      )}
      style={{ width: pageWidth, height: pageHeight }}
    >
      <div className="shrink-0 border-b border-border/40 bg-muted/30 px-3 py-1.5">
        <p className="text-[11px] font-medium text-primary">Página editável</p>
        <p className="text-[10px] text-muted-foreground">Conteúdo incluído no PDF final na exportação</p>
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto p-3 sm:p-4',
          placementMode && 'pointer-events-none opacity-80',
        )}
      >
        <RichTextEditor
          value={html}
          onChange={handleChange}
          readOnly={readOnly}
          placeholder="Digite cláusulas, observações ou anexos…"
          className="min-h-[min(58vh,640px)] border-0 shadow-none"
        />
      </div>
    </div>
  );
}
