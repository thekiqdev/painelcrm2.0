import { ActivationCtaButton } from './ActivationCtaButton';
import { ACTIVATION_CTA_SECTION } from './constants';
import { cn } from '@/lib/utils';

type Props = {
  loading?: boolean;
  disabled?: boolean;
  onContinue: () => void;
  className?: string;
};

/** Bloco final da coluna direita — contexto + CTA. */
export function ActivationCtaSection({ loading, disabled, onContinue, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-transparent px-4 py-4',
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">{ACTIVATION_CTA_SECTION.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {ACTIVATION_CTA_SECTION.description}
      </p>
      <div className="mt-4">
        <ActivationCtaButton loading={loading} disabled={disabled} onClick={onContinue} />
      </div>
    </div>
  );
}
