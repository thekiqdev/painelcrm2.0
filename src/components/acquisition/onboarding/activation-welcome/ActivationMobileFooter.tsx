import { ActivationCtaButton } from './ActivationCtaButton';
import { cn } from '@/lib/utils';

type Props = {
  loading?: boolean;
  disabled?: boolean;
  onContinue: () => void;
  className?: string;
};

/** Barra fixa inferior — sólida, sem painéis transparentes. */
export function ActivationMobileFooter({ loading, disabled, onContinue, className }: Props) {
  return (
    <div
      className={cn(
        'w-full border-t border-white/[0.08] bg-[hsl(228,32%,4%)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <ActivationCtaButton loading={loading} disabled={disabled} onClick={onContinue} />
    </div>
  );
}
