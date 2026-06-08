import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Props = {
  onBack?: () => void;
  onContinue?: () => void;
  onSkip?: () => void;
  continueLabel?: string;
  skipLabel?: string;
  loading?: boolean;
  continueDisabled?: boolean;
  showBack?: boolean;
  showSkip?: boolean;
};

export function WizardFocusNav({
  onBack,
  onContinue,
  onSkip,
  continueLabel = 'Continuar',
  skipLabel = 'Configurar depois',
  loading = false,
  continueDisabled = false,
  showBack = false,
  showSkip = false,
}: Props) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {showBack && onBack ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            Voltar
          </Button>
        ) : (
          <span className="hidden sm:inline" aria-hidden />
        )}
        {showSkip && onSkip ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-muted-foreground hover:text-foreground"
            onClick={onSkip}
          >
            {skipLabel}
          </Button>
        ) : null}
      </div>
      {onContinue ? (
        <Button
          type="button"
          className={cn(
            'h-12 w-full text-base sm:min-w-[200px] sm:w-auto',
            'shadow-[0_0_28px_-10px_hsl(var(--primary)/0.5)]',
          )}
          disabled={loading || continueDisabled}
          onClick={onContinue}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : continueLabel}
        </Button>
      ) : null}
    </div>
  );
}
