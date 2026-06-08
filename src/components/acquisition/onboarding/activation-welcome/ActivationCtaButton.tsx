import { ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activationPrimaryButtonClass } from '../activationAppStyles';
import { ACTIVATION_CTA } from './constants';

type Props = {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  label?: string;
};

/** CTA com texto centralizado — sem space-between. */
export function ActivationCtaButton({
  loading = false,
  disabled = false,
  onClick,
  className,
  label = ACTIVATION_CTA.label,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        activationPrimaryButtonClass,
        'relative inline-flex h-[52px] w-full items-center justify-center rounded-xl px-4 text-[15px] font-semibold',
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight className="absolute right-4 h-4 w-4 opacity-80" aria-hidden />
        </>
      )}
    </button>
  );
}
