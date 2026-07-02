import type { SubscriptionActionsHandlers, SubscriptionActionsFlags } from './SubscriptionActionsPanel';
import { Button } from '@/components/ui/button';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { focusRingClass } from '@/components/subscriptions/financial/FinancialStatCard';

type Props = {
  handlers: SubscriptionActionsHandlers;
  flags: SubscriptionActionsFlags;
  className?: string;
};

export function SubscriptionSettingsActions({ handlers, flags, className }: Props) {
  const isActive = flags.status === 'active';
  const isPaused = flags.status === 'paused';
  const isCancelled = flags.status === 'cancelled';

  return (
    <div className={cn('space-y-2', className)} role="group" aria-label="Ações da assinatura">
      {(isActive || isPaused) && handlers.onEdit ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditContract}
          onClick={handlers.onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar assinatura
        </Button>
      ) : null}
      {isActive && handlers.onPause ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditSubscription}
          onClick={handlers.onPause}
        >
          <Pause className="h-3.5 w-3.5" />
          Pausar
        </Button>
      ) : null}
      {isActive && flags.canCancelSubscription && handlers.onCancelEndOfPeriod ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn('w-full justify-start gap-2 text-muted-foreground', focusRingClass())}
          onClick={handlers.onCancelEndOfPeriod}
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      ) : null}
      {isActive && handlers.onUpgrade ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditContract}
          onClick={handlers.onUpgrade}
        >
          <ArrowUp className="h-3.5 w-3.5" />
          Upgrade
        </Button>
      ) : null}
      {isActive && handlers.onDowngrade ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditContract}
          onClick={handlers.onDowngrade}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Downgrade
        </Button>
      ) : null}
      {isActive && handlers.onChangeNextBilling ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditSubscription || !flags.canReschedule}
          onClick={handlers.onChangeNextBilling}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Alterar próxima cobrança
        </Button>
      ) : null}
      {isPaused && handlers.onResume ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditSubscription}
          onClick={handlers.onResume}
        >
          <Play className="h-3.5 w-3.5" />
          Retomar
        </Button>
      ) : null}
      {isCancelled && handlers.onReactivate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('w-full justify-start gap-2', focusRingClass())}
          disabled={!flags.canEditSubscription}
          onClick={handlers.onReactivate}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reativar
        </Button>
      ) : null}
    </div>
  );
}
