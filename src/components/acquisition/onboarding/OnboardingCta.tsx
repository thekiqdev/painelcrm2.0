import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { activationPrimaryButtonClass } from './activationAppStyles';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

type Props = {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
  /** inline = desktop + fallback; mobile-fixed = rodapé app */
  layout?: 'inline' | 'mobile-fixed';
  /** E2.5.2 — admin mobile: stack full-width Voltar + Continuar 56px */
  mobileStack?: 'default' | 'full';
};

export function OnboardingCta({
  onBack,
  onNext,
  nextLabel = 'Continuar',
  loading,
  backDisabled,
  nextDisabled,
  className,
  layout = 'inline',
  mobileStack = 'default',
}: Props) {
  if (layout === 'mobile-fixed') {
    const stacked = mobileStack === 'full';
    return (
      <div className={cn(stacked ? 'flex flex-col gap-2 px-5 pb-1 pt-2' : 'space-y-2', className)}>
        {onBack ? (
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-center gap-1.5 text-sm transition-colors disabled:opacity-50',
              stacked
                ? 'h-11 rounded-xl border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground'
                : 'py-1 text-muted-foreground hover:text-foreground',
            )}
            onClick={onBack}
            disabled={backDisabled || loading}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        ) : null}
        <Button
          type="button"
          className={cn(activationPrimaryButtonClass, stacked && 'h-14 w-full')}
          onClick={onNext}
          disabled={nextDisabled || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {nextLabel}
          {!loading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-muted-foreground transition-colors hover:text-foreground"
          onClick={onBack}
          disabled={backDisabled || loading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
      <Button
        type="button"
        className={cn(activationPrimaryButtonClass, 'sm:min-w-[220px] sm:w-auto')}
        onClick={onNext}
        disabled={nextDisabled || loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {nextLabel}
        {!loading ? (
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </Button>
    </div>
  );
}
