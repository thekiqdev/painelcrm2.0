/**
 * Defaults da Collection Policy = comportamento atual + PRD §18.
 * Sem suspend/cancel auto; PIX avulso ON; cartão/Pix Automático OFF.
 */
import {
  COLLECTION_POLICY_SCHEMA_VERSION,
  type CollectionPolicy,
} from './types.js';

export const DEFAULT_COLLECTION_POLICY_GRACE_DAYS = 3;
export const DEFAULT_COLLECTION_POLICY_MAX_ATTEMPTS = 3;
export const DEFAULT_COLLECTION_POLICY_ATTEMPT_INTERVAL_DAYS = 2;
export const DEFAULT_COLLECTION_POLICY_SUSPEND_AFTER_DAYS = 10;
export const DEFAULT_COLLECTION_POLICY_CANCEL_AFTER_DAYS = 30;

/** Policy canônica em memória (Sprint 1 — sem tabela). */
export function buildDefaultCollectionPolicy(
  overrides?: Partial<Pick<CollectionPolicy, 'grace_period_days'>>
): CollectionPolicy {
  const grace =
    overrides?.grace_period_days != null && Number.isFinite(overrides.grace_period_days)
      ? Math.max(0, Math.floor(overrides.grace_period_days))
      : DEFAULT_COLLECTION_POLICY_GRACE_DAYS;

  return {
    schema_version: COLLECTION_POLICY_SCHEMA_VERSION,
    renew_card_auto: false,
    generate_pix_auto: true,
    pix_automatic_enabled: false,
    max_attempts: DEFAULT_COLLECTION_POLICY_MAX_ATTEMPTS,
    attempt_interval_days: DEFAULT_COLLECTION_POLICY_ATTEMPT_INTERVAL_DAYS,
    suspend_after_days: DEFAULT_COLLECTION_POLICY_SUSPEND_AFTER_DAYS,
    cancel_after_days: DEFAULT_COLLECTION_POLICY_CANCEL_AFTER_DAYS,
    notify_whatsapp: true,
    notify_email: true,
    generate_pix_after_failure: true,
    reactivate_on_paid: true,
    auto_suspend_enabled: false,
    auto_cancel_enabled: false,
    grace_period_days: grace,
    actions_after_fail: ['create_pix', 'notify_whatsapp', 'notify_email'],
  };
}

export const DEFAULT_COLLECTION_POLICY: CollectionPolicy = buildDefaultCollectionPolicy();
