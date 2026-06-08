import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { refreshActivationScoreForLead } from './activationScoreService.js';
import { findAcquisitionLeadById, updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import { publishAcquisitionStageChanged } from './acquisitionOutbox.js';
import { syncAcquisitionLeadToOpsKanban } from '../services/superadminOpsKanbanLeadService.js';
import {
  appendOperationalTimelineForLead,
  TIMELINE_LABELS,
} from '../services/superadminOpsLeadTimelineService.js';
import type { AcquisitionLeadStage } from './acquisitionTypes.js';

export type OnboardingWizardEventKey =
  | 'onboarding.company.completed'
  | 'onboarding.users.completed'
  | 'whatsapp.connected';

const KANBAN_BY_EVENT: Partial<Record<OnboardingWizardEventKey, string>> = {
  'onboarding.company.completed': 'Onboarding incompleto',
  'onboarding.users.completed': 'Trial iniciado',
  'whatsapp.connected': 'Ativado',
};

const STAGE_BY_EVENT: Partial<Record<OnboardingWizardEventKey, AcquisitionLeadStage>> = {
  'onboarding.company.completed': 'onboarding_in_progress',
  'onboarding.users.completed': 'onboarding_active',
  'whatsapp.connected': 'converted',
};

export async function emitOnboardingWizardEvent(input: {
  eventKey: OnboardingWizardEventKey;
  acquisitionLeadId: string;
  tenantId: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const lead = await findAcquisitionLeadById(input.acquisitionLeadId);
  if (!lead) return;

  const previousStage = lead.current_stage;
  const nextStage = STAGE_BY_EVENT[input.eventKey];
  const tags = Array.isArray(lead.metadata_json.operational_tags)
    ? [...(lead.metadata_json.operational_tags as string[])]
    : [];

  if (input.eventKey === 'onboarding.company.completed' && !tags.includes('onboarding_empresa')) {
    tags.push('onboarding_empresa');
  }
  if (input.eventKey === 'onboarding.users.completed' && !tags.includes('ativacao_parcial')) {
    tags.push('ativacao_parcial');
  }
  if (input.eventKey === 'whatsapp.connected') {
    tags.push('ativado', 'whatsapp_conectado');
  }

  let updatedLead = lead;
  if (nextStage) {
    updatedLead =
      (await updateAcquisitionLeadStage(lead.id, nextStage, {
        tenantId: input.tenantId,
        convertedAt: input.eventKey === 'whatsapp.connected' ? new Date() : undefined,
        metadata: {
          last_wizard_event: input.eventKey,
          operational_tags: tags,
        },
      })) ?? lead;
    void publishAcquisitionStageChanged(updatedLead, previousStage);
  }

  const timelineType = input.eventKey.replace(/\./g, '_');
  const label =
    TIMELINE_LABELS[timelineType] ??
    (input.eventKey === 'whatsapp.connected' ? 'WhatsApp conectado' : input.eventKey);

  void appendOperationalTimelineForLead(input.acquisitionLeadId, {
    type: timelineType,
    label,
    correlation_id: input.correlationId,
    tenant_id: input.tenantId,
    ...input.metadata,
  });

  const activationEventType =
    input.eventKey === 'whatsapp.connected'
      ? 'first_message'
      : input.eventKey === 'onboarding.users.completed'
        ? 'first_team_member'
        : 'signup_started';

  await trackActivationEvent({
    acquisitionLeadId: input.acquisitionLeadId,
    tenantId: input.tenantId,
    eventType: activationEventType,
    correlationId: input.correlationId,
    metadata: { wizard_event: input.eventKey, ...input.metadata },
  });

  void startWorkflow({
    workflowKey: input.eventKey,
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    payload: {
      acquisition_lead_id: input.acquisitionLeadId,
      tenant_id: input.tenantId,
      ...input.metadata,
    },
    triggerEventKey: input.eventKey,
    idempotencyKey: `${input.eventKey}:${input.acquisitionLeadId}`,
  });

  void syncAcquisitionLeadToOpsKanban({
    acquisitionLeadId: input.acquisitionLeadId,
    correlationId: input.correlationId,
    columnNameOverride: KANBAN_BY_EVENT[input.eventKey],
    timelineType,
  });

  await refreshActivationScoreForLead(updatedLead);
}
