import type { AcquisitionLeadRow, AcquisitionLeadStage } from './acquisitionTypes.js';
import { publishDomainEventDetached } from '../outbox/publishDomainEvent.js';
import { syncAcquisitionLeadToOpsKanban } from '../services/superadminOpsKanbanLeadService.js';

function leadPayload(lead: AcquisitionLeadRow, extra?: Record<string, unknown>) {
  return {
    acquisition_lead_id: lead.id,
    email: lead.email,
    name: lead.name,
    phone: lead.phone,
    source: lead.source,
    current_stage: lead.current_stage,
    activation_score: lead.activation_score,
    correlation_id: lead.correlation_id,
    ...extra,
  };
}

/** Fallback direto se outbox/worker estiver off — mantém pipeline operacional vivo. */
async function syncLeadToOpsKanbanFallback(
  lead: AcquisitionLeadRow,
  opts?: { signupStep?: string; columnOverride?: string; timelineType?: string },
): Promise<void> {
  try {
    const result = await syncAcquisitionLeadToOpsKanban({
      acquisitionLeadId: lead.id,
      correlationId: lead.correlation_id,
      signupStep: opts?.signupStep,
      columnNameOverride: opts?.columnOverride,
      timelineType: opts?.timelineType,
    });
    console.info('[acquisition] ops_kanban_sync_fallback', {
      acquisition_lead_id: lead.id,
      correlation_id: lead.correlation_id,
      ok: result.ok,
      reason: result.reason ?? null,
      card_id: result.cardId ?? null,
      column_id: result.columnId ?? null,
      created: result.created ?? false,
    });
  } catch (e) {
    console.error('[acquisition] ops_kanban_sync_fallback', {
      acquisition_lead_id: lead.id,
      correlation_id: lead.correlation_id,
      error: e,
    });
  }
}

/** Publica evento de domínio (outbox) após lead criado — alimenta Kanban operacional + consumers passivos. */
export async function publishAcquisitionLeadCreated(lead: AcquisitionLeadRow): Promise<void> {
  const result = await publishDomainEventDetached({
    eventKey: 'acquisition.lead.created',
    aggregateType: 'acquisition_lead',
    aggregateId: lead.id,
    tenantId: null,
    correlationId: lead.correlation_id,
    payload: leadPayload(lead),
    idempotencyKey: `acquisition.lead.created:${lead.id}`,
  });
  if (result.outcome === 'skipped') {
    await syncLeadToOpsKanbanFallback(lead, { timelineType: 'lead_created' });
  }
}

export async function publishAcquisitionSignupStarted(
  lead: AcquisitionLeadRow,
  step: 'contact' | 'plan' | 'checkout',
): Promise<void> {
  const result = await publishDomainEventDetached({
    eventKey: 'acquisition.signup.started',
    aggregateType: 'acquisition_lead',
    aggregateId: lead.id,
    tenantId: null,
    correlationId: lead.correlation_id,
    payload: leadPayload(lead, { step }),
    idempotencyKey: `acquisition.signup.started:${lead.id}:${step}`,
  });
  if (result.outcome === 'skipped') {
    await syncLeadToOpsKanbanFallback(lead, {
      signupStep: step,
      timelineType: 'signup_step',
    });
  }
}

export async function publishAcquisitionStageChanged(
  lead: AcquisitionLeadRow,
  previousStage?: AcquisitionLeadStage,
): Promise<void> {
  const result = await publishDomainEventDetached({
    eventKey: 'acquisition.stage.changed',
    aggregateType: 'acquisition_lead',
    aggregateId: lead.id,
    tenantId: null,
    correlationId: lead.correlation_id,
    payload: leadPayload(lead, { previous_stage: previousStage ?? null }),
    idempotencyKey: `acquisition.stage.changed:${lead.id}:${lead.current_stage}`,
  });
  if (result.outcome === 'skipped') {
    await syncLeadToOpsKanbanFallback(lead, { timelineType: 'stage_changed' });
  }
}

/** E2.1 — Atualiza cartão Ops após mudança de perfil (nome/e-mail) sem depender de idempotência de lead.created. */
export async function syncAcquisitionLeadOpsKanbanProfile(
  lead: AcquisitionLeadRow,
  opts?: { signupStep?: 'contact' | 'plan' | 'checkout'; timelineType?: string },
): Promise<void> {
  await syncLeadToOpsKanbanFallback(lead, {
    signupStep: opts?.signupStep ?? 'contact',
    timelineType: opts?.timelineType ?? 'lead_profile_updated',
  });
}

export async function publishAcquisitionCheckoutAbandoned(lead: AcquisitionLeadRow): Promise<void> {
  const result = await publishDomainEventDetached({
    eventKey: 'acquisition.checkout.abandoned',
    aggregateType: 'acquisition_lead',
    aggregateId: lead.id,
    tenantId: null,
    correlationId: lead.correlation_id,
    payload: leadPayload(lead),
    idempotencyKey: `acquisition.checkout.abandoned:${lead.id}`,
  });
  if (result.outcome === 'skipped') {
    await syncLeadToOpsKanbanFallback(lead, {
      columnOverride: 'Checkout abandonado',
      timelineType: 'checkout_abandoned',
    });
  }
}
