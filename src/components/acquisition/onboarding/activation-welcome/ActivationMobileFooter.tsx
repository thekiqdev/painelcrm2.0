import { ActivationCtaButton } from './ActivationCtaButton';
import { PREMIUM_WORKSPACE_REVEAL } from './constants';
import { cn } from '@/lib/utils';

type Props = {
  loading?: boolean;
  disabled?: boolean;
  onContinue: () => void;
  className?: string;
  showMessage?: boolean;
};

/** Barra fixa inferior premium — mensagem + CTA. */
export function ActivationMobileFooter({
  loading,
  disabled,
  onContinue,
  className,
  showMessage = true,
}: Props) {
  return (
    <div
      className={cn(
        'w-full border-t border-white/[0.08] bg-[hsl(228,32%,4%)]/95 px-4 pt-2 backdrop-blur-sm',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {showMessage ? (
        <p className="mb-2 text-center text-[11px] leading-snug text-muted-foreground">
          {PREMIUM_WORKSPACE_REVEAL.bottomMessage}
        </p>
      ) : null}
      <ActivationCtaButton loading={loading} disabled={disabled} onClick={onContinue} />
    </div>
  );
}
