import type { AcquisitionLeadStage } from '../acquisition/acquisitionTypes.js';
import { observeBillingLifecycleEvent } from './lifecycleBillingObserver.js';
import { resolveLifecycleRoute } from './lifecycleRouter.js';
import { inferLifecycleEventFromAcquisitionSync } from './lifecycleStageMapping.js';
import type { LifecycleContext, LifecycleEventType, LifecycleResolution } from './lifecycleTypes.js';

export type LifecycleSimulationResult = {
  eventType: LifecycleEventType | string;
  context: LifecycleContext;
  resolution: LifecycleResolution;
};

/**
 * Simula rota para um evento — útil em debug/CLI; não altera cards.
 */
export function simulateLifecycleRoute(
  eventType: LifecycleEventType | string,
  context: LifecycleContext = {},
): LifecycleSimulationResult {
  return {
    eventType,
    context,
    resolution: resolveLifecycleRoute(eventType, context),
  };
}

export type LifecycleObservationInput = {
  eventType: LifecycleEventType | string;
  context?: LifecycleContext;
  source: string;
  /** Destino real hoje (sync legado) — apenas comparação em log. */
  actual?: { boardName: string; columnName: string };
};

/**
 * Modo observação Sprint G: resolve em memória e registra log estruturado.
 * Não move cards, não persiste, não altera fluxos existentes.
 */
/** Observação no sync legado de acquisition (Sprint G — shadow). */
export function observeOpsKanbanAcquisitionSync(input: {
  acquisitionLeadId: string;
  tenantId: string | null;
  correlationId: string;
  currentStage: string;
  signupStep?: string;
  columnName: string;
  cardCreated: boolean;
}): LifecycleResolution | null {
  const event = inferLifecycleEventFromAcquisitionSync({
    currentStage: input.currentStage as AcquisitionLeadStage,
    cardCreated: input.cardCreated,
    signupStep: input.signupStep,
  });
  if (!event) return null;
  return observeLifecycleRoute({
    eventType: event,
    context: {
      acquisitionLeadId: input.acquisitionLeadId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      currentStage: input.currentStage,
    },
    source: 'ops_kanban_sync',
    actual: { boardName: 'Aquisição', columnName: input.columnName },
  });
}

export function observeOnboardingCompletedShadow(input: {
  acquisitionLeadId: string;
  tenantId: string;
  correlationId: string;
}): LifecycleResolution {
  return observeLifecycleRoute({
    eventType: 'onboarding.completed',
    context: {
      acquisitionLeadId: input.acquisitionLeadId,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
    },
    source: 'onboarding_completed',
    actual: { boardName: 'Aquisição', columnName: 'Trial iniciado' },
  });
}

export function observeTrialActivationShadow(input: {
  acquisitionLeadId: string;
  tenantId: string;
  correlationId: string;
  tenantStatus: string;
}): LifecycleResolution | null {
  if (input.tenantStatus !== 'trial') return null;
  return observeBillingLifecycleEvent(
    'trial.started',
    {
      tenantId: input.tenantId,
      acquisitionLeadId: input.acquisitionLeadId,
      correlationId: input.correlationId,
    },
    {
      source: 'trial_activation',
      actual: { boardName: 'Aquisição', columnName: 'Onboarding incompleto' },
    },
  );
}

export function observeLifecycleRoute(input: LifecycleObservationInput): LifecycleResolution {
  const resolution = resolveLifecycleRoute(input.eventType, input.context ?? {});
  console.info('[lifecycle_router_observe]', {
    source: input.source,
    event_type: input.eventType,
    resolved_board: resolution.boardName,
    resolved_column: resolution.columnName,
    matched: resolution.matched,
    fallback: resolution.fallback,
    reason: resolution.reason,
    validation: resolution.validation,
    actual_board: input.actual?.boardName ?? null,
    actual_column: input.actual?.columnName ?? null,
    acquisition_lead_id: input.context?.acquisitionLeadId ?? null,
    tenant_id: input.context?.tenantId ?? null,
    correlation_id: input.context?.correlationId ?? null,
  });
  return resolution;
}
