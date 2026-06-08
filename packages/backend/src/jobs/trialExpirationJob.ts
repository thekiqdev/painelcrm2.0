/**
 * Sprint K.2 — agendamento de expiração de trial (usa expireTrialsPastDue).
 */
import type { ExpireTrialsPastDueResult } from '../services/subscriptionService.js';
import { expireTrialsPastDue } from '../services/subscriptionService.js';

/** Intervalo fixo: 1 hora (sem env configurável nesta fase). */
export const TRIAL_EXPIRATION_INTERVAL_MS = 3_600_000;

export async function runTrialExpirationOnce(): Promise<ExpireTrialsPastDueResult> {
  const result = await expireTrialsPastDue();
  if (result.suspended > 0) {
    console.log(
      `[trial-expiration] suspended=${result.suspended} lifecycle=${result.lifecycle_events} promotions=${result.promotions_executed}`,
    );
  }
  return result;
}
