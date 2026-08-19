/**
 * Chaves tipadas do rollout registry P0 (platform_feature_flags).
 * Distinto de plan_features / FEATURE_KEYS (produto por plano).
 */

export const PLATFORM_FLAG_NAMESPACES = [
  'acquisition',
  'communication',
  'workflow',
  'outbox',
  'onboarding',
  'billing_recovery',
  'billing2',
  'crm',
  'meta_readiness',
  'worker',
  'platform',
  'partner',
] as const;

export type PlatformFlagNamespace = (typeof PLATFORM_FLAG_NAMESPACES)[number];

export const PLATFORM_FEATURE_FLAG_KEYS = [
  'acquisition.master_off',
  'acquisition.signup_session_v1',
  'acquisition.trial_activation_v1',
  'acquisition.defer_tenant_v1',
  'acquisition.pre_signup_v1',
  'acquisition.signup_flow_v1',
  'acquisition.trial_flow_v1',
  'acquisition.recovery_v1',
  'acquisition.activation_tracking_v1',
  'acquisition.activation_score_v1',
  'acquisition.onboarding_kickoff_v1',
  'communication.master_off',
  'communication.gateway_v1',
  'communication.bridge_dual_dispatch',
  'communication.webhook_normalizer_v1',
  'communication.uazapi_bridge_v1',
  'communication.routing_v1',
  'communication.capability_registry_v1',
  'outbox.master_off',
  'outbox.publisher_off',
  'outbox.write_v1',
  'outbox.publisher_v1',
  'outbox.publisher_worker_v1',
  'outbox.subscribers_v1',
  'outbox.passive_consumers_v1',
  'outbox.replay_foundation_v1',
  'outbox.dead_letter_v1',
  'workflow.master_off',
  'workflow.scheduler_v1',
  'workflow.retry_v1',
  'workflow.runtime_v1',
  'workflow.shadow_execution_v1',
  'workflow.passive_consumers_v1',
  'workflow.orchestration_v1',
  'workflow.saga_foundation_v1',
  'workflow.bridge_v1',
  'onboarding.master_off',
  'onboarding.engine_v1',
  'onboarding.recovery_v1',
  'billing_recovery.shadow_metrics_v1',
  'billing2.card_auto_renew',
  'billing2.pix_automatic',
  'billing2.pix_auto_generate',
  'billing2.whatsapp_charge_notify',
  'billing2.email_charge_notify',
  'billing2.auto_suspend',
  'billing2.auto_cancel',
  'billing2.auto_reactivate',
  'billing2.reconciliation_auto',
  'billing2.detailed_logs',
  'billing2.collection_policy_engine_enabled',
  'billing2.past_due_writer_enabled',
  'billing2.dashboard_mrr_contracted',
  'billing2.reconciliation_l2_enabled',
  'billing2.dunning_enabled',
  'billing2.collection_policy_db_read',
  'billing2.multi_gateway',
  'crm.pix_automatic',
  'meta_readiness.probe_v1',
  'platform.signup_entry_acquisition_v1',
  'platform.correlation_middleware_v1',
  'partner.master_off',
  'partner.channel_v1',
  'partner.domain_verify_bypass',
  'worker.runtime_v1',
  'worker.heartbeat_v1',
  'worker.health_v1',
  'worker.reclaim_v1',
] as const;

export type PlatformFeatureFlagKey = (typeof PLATFORM_FEATURE_FLAG_KEYS)[number];

const KEY_SET = new Set<string>(PLATFORM_FEATURE_FLAG_KEYS);

export function isPlatformFeatureFlagKey(key: string): key is PlatformFeatureFlagKey {
  return KEY_SET.has(key);
}

export function namespaceFromFlagKey(key: string): string {
  const dot = key.indexOf('.');
  return dot > 0 ? key.slice(0, dot) : key;
}
