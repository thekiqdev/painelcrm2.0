export {
  BILLING_PROVISION_VERSION,
  BillingPlanProvisionError,
  type BillingProvisionAction,
  type BillingProvisionErrorCode,
  type BillingProvisionResult,
  type BillingProvisionStatus,
  type EnsureBillingPlanOptions,
} from './types.js';

export {
  billingPlanProvisionService,
  BillingPlanProvisionService,
  assertBillingPlanValid,
  validateBillingPlanForSubscription,
} from './billingPlanProvisionService.js';

export {
  buildBillingPlanItemInputsFromSubscription,
  createActiveBillingPlanForSubscription,
  createBillingPlanItemsForSubscription,
  readSubscriptionMetadata,
  resolveItemLabel,
} from './billingPlanAutoProvision.js';

export { repairBillingPlanForSubscription } from './billingPlanRepairService.js';
export { synchronizeBillingPlanFromSubscription } from './billingPlanSynchronizationService.js';

export {
  getBillingProvisionMetrics,
  resetBillingProvisionMetricsForTests,
  recordBillingPlanCreated,
  recordBillingPlanProvisionDuration,
  recordBillingPlanRepaired,
  recordBillingPlanSync,
  recordBillingPlanValidationError,
  recordProvisionRuntimeError,
  recordProvisionSqlError,
  recordTenantResolutionError,
  recordBillingItemsCreated,
  recordBillingItemsRepaired,
  buildProvisionHealthDashboard,
  type BillingProvisionHealthSnapshot,
} from './billingPlanProvisionMetrics.js';

export { logBillingProvision } from './billingPlanProvisionLogger.js';
export { runProvisionTransaction } from './billingPlanProvisionDb.js';
export { observeProvisionFailure, isPgError, pgErrorMessage } from './billingPlanProvisionErrors.js';
export type { BillingProvisionMetricsSnapshot } from './billingPlanProvisionMetrics.js';
