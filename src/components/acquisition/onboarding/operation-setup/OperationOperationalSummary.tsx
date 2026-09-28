import { Check } from 'lucide-react';
import type { OperationPreviewState } from './operationBuilderState';

type Props = {
  preview: OperationPreviewState;
};

const ROW_CLASS = 'flex items-start gap-2 text-xs text-foreground/90';

export function OperationOperationalSummary({ preview }: Props) {
  return (
    <div className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Sua operação inicial
      </p>
      <ul className="mt-3 space-y-2">
        {preview.trialLabel ? (
          <li className={ROW_CLASS}>
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{preview.trialLabel}</span>
          </li>
        ) : null}
        <li className={ROW_CLASS}>
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            {preview.usersCount} {preview.usersCount === 1 ? 'usuário incluso' : 'usuários inclusos'}
          </span>
        </li>
        <li className={ROW_CLASS}>
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span>{preview.whatsappChannels} canal WhatsApp</span>
        </li>
        <li className={ROW_CLASS}>
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
          <span>IA Assist preview</span>
        </li>
      </ul>
      {preview.afterActivationLabel ? (
        <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-muted-foreground">
          {preview.afterActivationLabel}
        </p>
      ) : null}
    </div>
  );
}
