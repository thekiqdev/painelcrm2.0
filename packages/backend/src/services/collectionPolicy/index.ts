/**
 * Collection Policy — Billing 2.0 (Sprint 3: interpret + execute; Sprint 5: past_due + Assinaturas API).
 *
 * Flag `collection_policy_engine_enabled` OFF (default) → extension point no-op (legado).
 */
export type {
  CollectionAction,
  CollectionActionType,
  CollectionEvent,
  CollectionEventType,
  CollectionFailAction,
  CollectionInterpretContext,
  CollectionPolicy,
} from './types.js';
export { COLLECTION_POLICY_SCHEMA_VERSION } from './types.js';
export {
  buildDefaultCollectionPolicy,
  DEFAULT_COLLECTION_POLICY,
  DEFAULT_COLLECTION_POLICY_ATTEMPT_INTERVAL_DAYS,
  DEFAULT_COLLECTION_POLICY_CANCEL_AFTER_DAYS,
  DEFAULT_COLLECTION_POLICY_GRACE_DAYS,
  DEFAULT_COLLECTION_POLICY_MAX_ATTEMPTS,
  DEFAULT_COLLECTION_POLICY_SUSPEND_AFTER_DAYS,
} from './defaults.js';
export {
  assertValidCollectionPolicyShape,
  deserializeCollectionPolicy,
  serializeCollectionPolicy,
} from './serialize.js';
export { getActiveCollectionPolicy, type CollectionPolicyReadResult, type CollectionPolicyReadSource } from './reader.js';
export { interpretCollectionPolicy } from './interpret.js';
export {
  executeCollectionActions,
  type CollectionActionExecResult,
  type ExecuteCollectionActionsResult,
} from './execute.js';
export {
  buildCollectionActionIdempotencyKey,
  resolveCycleKey,
  resolveEntityForAction,
} from './idempotency.js';
export {
  runCollectionPolicyExtensionPoint,
  scheduleCollectionPolicyExtensionPoint,
  shouldCollectionPolicyOwnNotifications,
  type CollectionPolicyHookResult,
} from './hook.js';
export {
  ensureGlobalCollectionPolicySeeded,
  getActiveGlobalCollectionPolicyRow,
  policyFromRow,
  updateActiveGlobalCollectionPolicy,
  type BillingCollectionPolicyRow,
} from './collectionPolicyRepository.js';
export {
  writeBillingAuditEvent,
  type WriteBillingAuditEventInput,
  type BillingAuditActorType,
} from './billingAuditEventWriter.js';
export {
  markSubscriptionPastDue,
  clearSubscriptionPastDueOnPaid,
  syncSaasSubscriptionsPastDue,
  isSubscriptionPastDueEligible,
} from './subscriptionPastDueWriter.js';
export {
  listSaasSubscriptionsForSuperadmin,
  getSaasSubscriptionDetailForSuperadmin,
  type SaasSubscriptionListItem,
  type SaasSubscriptionDetail,
} from './saasSubscriptionsAdminService.js';
