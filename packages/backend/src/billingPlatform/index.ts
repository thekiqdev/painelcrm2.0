/**
 * Billing Platform 4.0 — public package exports.
 */

export {
  BILLING_PLATFORM_VERSION,
  type BillingPlatformManifest,
  type BillingPlatformModuleDescriptor,
  type BillingPlatformModuleId,
  type BillingPlatformModuleStatus,
} from './types/index.js';

export { getBillingPlatformManifest, getBillingPlatformVersion } from './platformManifest.js';

export * from './analytics/index.js';
export * from './intelligence/index.js';
export * from './forecasting/index.js';
export * from './recovery/index.js';
export * from './automation/index.js';
export * from './reports/index.js';
export * from './events/index.js';
export * from './shared/index.js';
export * from './api/index.js';
export * from './provisioning/index.js';
export * from './audit/index.js';
