import { ActivationCtaButton } from './ActivationCtaButton';
import { PREMIUM_WORKSPACE_REVEAL } from './constants';
import { cn } from '@/lib/utils';

type Props = {
  loading?: boolean;
  disabled?: boolean;
  onContinue: () => void;
  className?: string;
};

/** Barra inferior premium — mensagem + CTA (desktop e mobile). */
export function PremiumWelcomeBottomBar({ loading, disabled, onContinue, className }: Props) {
  return (
    <div
      className={cn(
        'shrink-0 border-t border-white/[0.08] bg-[hsl(228,32%,4%)]/80 pt-3 backdrop-blur-sm',
        className,
      )}
    >
      <p className="mb-2.5 text-center text-xs leading-snug text-muted-foreground">
        {PREMIUM_WORKSPACE_REVEAL.bottomMessage}
      </p>
      <ActivationCtaButton loading={loading} disabled={disabled} onClick={onContinue} />
    </div>
  );
}
