/**
 * Billing 2.0 — pacote de preparação (Sprint 0).
 * Sem efeito em checkout/renovação até sprints posteriores consumirem as flags.
 */
export {
  BILLING2_FLAG_CATALOG,
  BILLING2_FLAG_KEYS,
  billing2PlatformFlagKey,
  getBilling2FeatureFlags,
  getBilling2FeatureFlagsSnapshot,
  isBilling2FlagEnabled,
  type Billing2FlagKey,
  type Billing2FlagMeta,
  type Billing2FlagResolvedFrom,
  type Billing2FlagRuntime,
} from './billingFeatureFlags.js';

export {
  monthlyizePeriodCents,
  getDashboardMrrSnapshot,
  computeCatalogMrrCents,
  computeContractedMrrFromSubscriptions,
  DASHBOARD_KPI_DEFINITIONS,
  type DashboardMrrSnapshot,
  type DashboardMrrSource,
} from './dashboardMrr.js';

export {
  billingJobCorrelationId,
  billingRenewalCorrelationId,
  tenantBillingAttemptCorrelationId,
  tenantBillingCorrelationId,
  type Billing2CorrelationFields,
  type BillingCorrelationKind,
} from './billingCorrelationId.js';
