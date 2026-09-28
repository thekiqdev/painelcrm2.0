import type { ReactNode } from 'react';
import type { OperationPreviewState } from './operationBuilderState';

type Props = {
  preview: OperationPreviewState;
  children: ReactNode;
};

/** Bottom sheet nativo — resumo + CTA sempre visível (mobile). */
export function OperationMobileBottomSheet({ preview, children }: Props) {
  return (
    <div className="rounded-t-2xl border border-white/[0.08] border-b-0 bg-[hsl(228,30%,7%)]/98 px-4 pt-3 shadow-[0_-12px_48px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden />

      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[11px]">
        <span className="text-muted-foreground">Usuários</span>
        <span className="text-right font-medium tabular-nums text-foreground">
          {preview.usersCount} {preview.usersCount === 1 ? 'operador' : 'operadores'}
        </span>
        <span className="text-muted-foreground">WhatsApp</span>
        <span className="text-right font-medium text-emerald-400/90">
          {preview.whatsappChannels} incluso
        </span>
        <span className="text-muted-foreground">IA Assist</span>
        <span className="text-right font-medium text-violet-300/90">Preview</span>
        {preview.trialLabel ? (
          <>
            <span className="text-muted-foreground">Período inicial</span>
            <span className="text-right font-medium text-primary/90">{preview.trialLabel}</span>
          </>
        ) : null}
        {preview.afterActivationLabel ? (
          <>
            <span className="text-muted-foreground">Depois</span>
            <span className="text-right text-foreground/80">{preview.afterActivationLabel.replace('Após ativação: ', '')}</span>
          </>
        ) : null}
      </div>

      <div className="mt-3">{children}</div>
    </div>
  );
}
