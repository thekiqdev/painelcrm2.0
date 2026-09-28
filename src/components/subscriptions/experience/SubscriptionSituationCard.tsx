import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  buildTechnicalDiagnostics,
  friendlyBillingMessage,
  resolveSubscriptionSituation,
} from '@/lib/billingSubscriptionExperience';
import {
  healthStateEmoji,
  wcagContrastPair,
  focusRingClass,
  polishTransitionClass,
} from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatDateTimeBrSafe } from '@/lib/billingSafeDate';
import { cn } from '@/lib/utils';
import { ChevronDown, Wrench } from 'lucide-react';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  onResolve?: () => void;
  onShowTechnical?: () => void;
  className?: string;
};

function mapSituationToHealthState(
  detail: CrmSubscriptionDetailPayload
): import('@/lib/billingSubscriptionExperiencePolish').HealthState {
  const s = detail.subscription.status;
  if (s === 'cancelled') return 'cancelled';
  if (s === 'paused') return 'paused';
  const situation = resolveSubscriptionSituation(detail);
  if (situation.hasError) return 'error';
  if (situation.visualState === 'payment_pending' || situation.visualState === 'preparing') return 'attention';
  return 'healthy';
}

export function SubscriptionSituationCard({ detail, onResolve, onShowTechnical, className }: Props) {
  const situation = useMemo(() => resolveSubscriptionSituation(detail), [detail]);
  const healthState = useMemo(() => mapSituationToHealthState(detail), [detail]);
  const technical = useMemo(() => buildTechnicalDiagnostics(detail), [detail]);
  const [techOpen, setTechOpen] = useState(false);
  const colors = wcagContrastPair(healthState);

  return (
    <Card
      className={cn('border shadow-sm overflow-hidden', colors.bg, className)}
      role="status"
      aria-live="polite"
    >
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium">Situação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-lg shrink-0" aria-hidden>
            {healthStateEmoji(healthState)}
          </span>
          <div>
            <p className={cn('font-semibold', colors.fg)}>{situation.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {healthState === 'healthy'
                ? 'Saudável'
                : healthState === 'attention'
                  ? 'Atenção'
                  : healthState === 'error'
                    ? 'Erro'
                    : healthState === 'paused'
                      ? 'Pausada'
                      : 'Cancelada'}
            </p>
          </div>
        </div>

        {situation.friendlyMessage ? (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {friendlyBillingMessage(situation.technicalError) || situation.friendlyMessage}
          </p>
        ) : null}

        {situation.hasError && onResolve ? (
          <Button
            type="button"
            size="sm"
            className={cn('w-full', focusRingClass())}
            onClick={onResolve}
          >
            Resolver agora
          </Button>
        ) : null}

        <Collapsible open={techOpen} onOpenChange={setTechOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-background/60',
                focusRingClass(),
                polishTransitionClass()
              )}
              onClick={() => onShowTechnical?.()}
            >
              <span className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                Detalhes técnicos
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', techOpen && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-1.5 text-xs text-muted-foreground">
            <p>Worker: {technical.workerStatus ?? '—'}</p>
            <p>Retry: {technical.retryAt ? formatDateTimeBrSafe(technical.retryAt) : '—'}</p>
            <p>Cycle Key: {technical.cycleKey ?? '—'}</p>
            <p>Job Id: {technical.jobId ?? '—'}</p>
            <p>Engine: {technical.engineVersion ?? '—'}</p>
            <p>Execução: {technical.executionTime ? formatDateTimeBrSafe(technical.executionTime) : '—'}</p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
