import type { OperationPreviewState } from './operationBuilderState';

type Props = {
  preview: OperationPreviewState;
};

/** Resumo compacto — mobile fixo acima do CTA */
export function OperationSummaryBar({ preview }: Props) {
  return (
    <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 backdrop-blur-md">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Sua operação inicial
      </p>
      <ul className="mt-2 space-y-1 text-xs text-foreground/90">
        <li>
          {preview.usersCount} {preview.usersCount === 1 ? 'usuário' : 'usuários'}
        </li>
        <li>{preview.whatsappChannels} canal WhatsApp</li>
        <li>IA Assist preview · Automações habilitadas</li>
      </ul>
      {(preview.trialLabel || preview.afterActivationLabel) && (
        <div className="mt-2.5 border-t border-white/[0.06] pt-2.5 space-y-0.5">
          {preview.trialLabel ? (
            <p className="text-[11px] font-medium text-primary/90">{preview.trialLabel}</p>
          ) : null}
          {preview.afterActivationLabel ? (
            <p className="text-[10px] text-muted-foreground">{preview.afterActivationLabel}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
