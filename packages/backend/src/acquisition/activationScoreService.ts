import { isAcquisitionActivationScoreEnabled } from './acquisitionFlags.js';
import { updateAcquisitionLeadActivationScore } from './acquisitionLeadRepository.js';
import { countActivationEventsForLead, listActivationEventsForLead } from './activationTrackingService.js';
import { logActivation } from './acquisitionLogger.js';
import type { AcquisitionLeadRow, ActivationScore } from './acquisitionTypes.js';

const HIGH_VALUE_EVENTS = new Set([
  'checkout_completed',
  'trial_started',
  'first_login',
  'first_message',
  'first_team_member',
  'onboarding_completed',
  'signup_started',
]);

export function computeActivationScore(input: {
  lead: AcquisitionLeadRow;
  eventTypes: string[];
  eventCount: number;
}): ActivationScore {
  const { lead, eventTypes, eventCount } = input;

  if (lead.abandoned_at && !lead.converted_at) {
    const abandonedMs = Date.now() - new Date(lead.abandoned_at).getTime();
    if (abandonedMs > 72 * 60 * 60 * 1000) return 'at_risk';
  }

  const highValueHits = eventTypes.filter((e) => HIGH_VALUE_EVENTS.has(e)).length;
  if (highValueHits >= 2 || eventTypes.includes('onboarding_completed')) return 'high';
  if (eventCount >= 3 || eventTypes.includes('trial_started') || eventTypes.includes('checkout_started')) {
    return 'medium';
  }
  return 'low';
}

export async function refreshActivationScoreForLead(lead: AcquisitionLeadRow): Promise<ActivationScore> {
  const enabled = await isAcquisitionActivationScoreEnabled();
  const eventTypes = await listActivationEventsForLead(lead.id);
  const eventCount = eventTypes.length || (await countActivationEventsForLead(lead.id));
  const score = computeActivationScore({ lead, eventTypes, eventCount });

  if (enabled) {
    await updateAcquisitionLeadActivationScore(lead.id, score);
    logActivation('score_updated', {
      acquisition_lead_id: lead.id,
      score,
      event_count: eventCount,
    });
  }

  return score;
}
