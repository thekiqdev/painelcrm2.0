/**
 * Sprint H — observação shadow de eventos billing/trial/subscription no Lifecycle Router.
 * Não move cards, não altera Kanban, não executa automações.
 */
import {
  ACQUISITION_BOARD_NAME,
  findOpsKanbanCardForLead,
} from '../services/superadminOpsKanbanLeadService.js';
import { pool } from '../utils/db.js';
import { resolveLifecycleRoute } from './lifecycleRouter.js';
import type { LifecycleContext, LifecycleEventType, LifecycleResolution } from './lifecycleTypes.js';

/** Eventos billing com rota Sprint G. */
export type BillingLifecycleEventType = Extract<
  LifecycleEventType,
  'trial.started' | 'trial.expired' | 'subscription.activated' | 'subscription.cancelled'
>;

/** Estrutura futura (Sprint I+) — resolve com fallback até rotas existirem. */
export type FutureBillingLifecycleEventType =
  | 'subscription.renewed'
  | 'subscription.overdue'
  | 'subscription.upgraded'
  | 'subscription.downgraded';

export const BILLING_LIFECYCLE_EVENT_TYPES: readonly BillingLifecycleEventType[] = [
  'trial.started',
  'trial.expired',
  'subscription.activated',
  'subscription.cancelled',
] as const;

export const FUTURE_BILLING_LIFECYCLE_EVENT_TYPES: readonly FutureBillingLifecycleEventType[] = [
  'subscription.renewed',
  'subscription.overdue',
  'subscription.upgraded',
  'subscription.downgraded',
] as const;

export type BillingLifecycleContext = {
  tenantId?: string | null;
  acquisitionLeadId?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  correlationId?: string | null;
};

export type LifecycleObservationMetric = {
  event: string;
  tenantId: string | null;
  acquisitionLeadId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  resolvedBoard: string;
  resolvedColumn: string;
  actualBoard: string | null;
  actualColumn: string | null;
  matched: boolean;
  fallback: boolean;
  source: string;
  observedAt: string;
};

const METRICS_CAP = 500;
const metricsBuffer: LifecycleObservationMetric[] = [];

function toLifecycleContext(ctx: BillingLifecycleContext): LifecycleContext {
  return {
    tenantId: ctx.tenantId ?? null,
    acquisitionLeadId: ctx.acquisitionLeadId ?? null,
    subscriptionId: ctx.subscriptionId ?? null,
    correlationId: ctx.correlationId ?? null,
    metadata: ctx.invoiceId ? { invoice_id: ctx.invoiceId } : undefined,
  };
}

function recordMetric(
  eventType: string,
  ctx: BillingLifecycleContext,
  resolution: LifecycleResolution,
  source: string,
  actual?: { boardName: string; columnName: string },
): void {
  const entry: LifecycleObservationMetric = {
    event: eventType,
    tenantId: ctx.tenantId ?? null,
    acquisitionLeadId: ctx.acquisitionLeadId ?? null,
    subscriptionId: ctx.subscriptionId ?? null,
    invoiceId: ctx.invoiceId ?? null,
    resolvedBoard: resolution.boardName,
    resolvedColumn: resolution.columnName,
    actualBoard: actual?.boardName ?? null,
    actualColumn: actual?.columnName ?? null,
    matched: resolution.matched,
    fallback: resolution.fallback,
    source,
    observedAt: new Date().toISOString(),
  };
  metricsBuffer.push(entry);
  if (metricsBuffer.length > METRICS_CAP) {
    metricsBuffer.splice(0, metricsBuffer.length - METRICS_CAP);
  }
}

/**
 * Observa evento billing no router — somente resolve + log + métricas em memória.
 */
export function observeBillingLifecycleEvent(
  eventType: BillingLifecycleEventType | FutureBillingLifecycleEventType | string,
  context: BillingLifecycleContext = {},
  options?: {
    source?: string;
    actual?: { boardName: string; columnName: string };
  },
): LifecycleResolution {
  const resolution = resolveLifecycleRoute(eventType, toLifecycleContext(context));
  const source = options?.source ?? 'billing_lifecycle';

  console.info('[lifecycle_billing_observe]', {
    event: eventType,
    tenantId: context.tenantId ?? null,
    acquisitionLeadId: context.acquisitionLeadId ?? null,
    subscriptionId: context.subscriptionId ?? null,
    invoiceId: context.invoiceId ?? null,
    correlationId: context.correlationId ?? null,
    resolvedBoard: resolution.boardName,
    resolvedColumn: resolution.columnName,
    matched: resolution.matched,
    fallback: resolution.fallback,
    reason: resolution.reason,
    actualBoard: options?.actual?.boardName ?? null,
    actualColumn: options?.actual?.columnName ?? null,
    source,
  });

  recordMetric(eventType, context, resolution, source, options?.actual);
  return resolution;
}

/** Eventos futuros — mesma observação shadow; rotas ainda não no catálogo principal. */
export function observeFutureBillingLifecycleEvent(
  eventType: FutureBillingLifecycleEventType,
  context: BillingLifecycleContext = {},
  options?: { source?: string },
): LifecycleResolution {
  return observeBillingLifecycleEvent(eventType, context, {
    source: options?.source ?? `future_billing:${eventType}`,
  });
}

async function resolveAcquisitionLeadIdForTenant(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM acquisition_leads WHERE tenant_id = $1::uuid ORDER BY updated_at DESC LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Enriquece contexto com lead + posição Kanban atual (read-only) e observa.
 * // lifecycle shadow observation
 */
export async function observeBillingLifecycleEventWithKanbanActual(
  eventType: BillingLifecycleEventType | FutureBillingLifecycleEventType | string,
  context: BillingLifecycleContext,
  source: string,
): Promise<LifecycleResolution> {
  const enriched = { ...context };
  if (!enriched.acquisitionLeadId && enriched.tenantId) {
    enriched.acquisitionLeadId = await resolveAcquisitionLeadIdForTenant(enriched.tenantId);
  }

  let actual: { boardName: string; columnName: string } | undefined;
  if (enriched.acquisitionLeadId) {
    const card = await findOpsKanbanCardForLead(enriched.acquisitionLeadId);
    if (card) {
      actual = { boardName: ACQUISITION_BOARD_NAME, columnName: card.columnName };
    }
  }

  return observeBillingLifecycleEvent(eventType, enriched, { source, actual });
}

/** Métricas shadow acumuladas (comparação resolved vs actual — Sprint I). */
export function collectLifecycleObservationMetrics(): readonly LifecycleObservationMetric[] {
  return [...metricsBuffer];
}

/** Limpa buffer — uso em testes. */
export function resetLifecycleObservationMetrics(): void {
  metricsBuffer.length = 0;
}
