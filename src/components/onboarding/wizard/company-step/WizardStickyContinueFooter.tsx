import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onContinue: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
};

export function WizardStickyContinueFooter({
  onContinue,
  loading,
  disabled,
  label = 'Continuar',
  hint,
}: Props) {
  return (
    <div
      className={cn(
        'border-t border-white/[0.07] bg-[hsl(228,32%,4%)]/95 backdrop-blur-xl',
        'px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      )}
    >
      {hint ? (
        <p className="mb-2.5 text-center text-[11px] font-medium text-muted-foreground">{hint}</p>
      ) : null}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={onContinue}
        className={cn(
          'flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold',
          'bg-primary text-primary-foreground',
          'shadow-[0_0_32px_-8px_hsl(var(--primary)/0.55)]',
          'transition-all active:scale-[0.99] disabled:opacity-50',
        )}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {label}
      </button>
    </div>
  );
}
