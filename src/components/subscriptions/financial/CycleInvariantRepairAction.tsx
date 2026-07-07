import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { AlertTriangle, Loader2, Wrench } from 'lucide-react';

type Props = {
  cycleId?: string | null;
  loading?: boolean;
  disabled?: boolean;
  onRepair?: (cycleId: string | null | undefined) => void;
  className?: string;
  variant?: 'icon' | 'button';
};

const TOOLTIP =
  'Competência inconsistente: a cobrança foi removida mas o ciclo não foi reaberto. Corrija para permitir gerar novamente.';

export function CycleInvariantRepairAction({
  cycleId,
  loading = false,
  disabled = false,
  onRepair,
  className,
  variant = 'button',
}: Props) {
  if (!onRepair) return null;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    onRepair(cycleId);
  };

  if (variant === 'icon') {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className={cn(
                'h-8 w-8 shrink-0 border-amber-500/50 text-amber-600 hover:bg-amber-500/10',
                focusRingClass(),
                className
              )}
              disabled={disabled || loading}
              aria-label="Corrigir competência inconsistente"
              onClick={handleClick}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              'h-8 gap-1.5 text-xs border-amber-500/50 text-amber-700 hover:bg-amber-500/10',
              focusRingClass(),
              className
            )}
            disabled={disabled || loading}
            onClick={handleClick}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Wrench className="h-3.5 w-3.5" aria-hidden />
            )}
            {loading ? 'Corrigindo…' : 'Corrigir'}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
