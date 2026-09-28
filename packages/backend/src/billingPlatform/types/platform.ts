/**
 * Billing Platform 4.0 — core platform types.
 */

export const BILLING_PLATFORM_VERSION = 'v4_platform_foundation';

export type BillingPlatformModuleId =
  | 'engine'
  | 'execution'
  | 'plans'
  | 'analytics'
  | 'intelligence'
  | 'forecast'
  | 'recovery'
  | 'automation'
  | 'reports'
  | 'api'
  | 'events'
  | 'observability'
  | 'provisioning'
  | 'audit';

export type BillingPlatformModuleStatus = 'ga' | 'foundation' | 'planned';

export type BillingPlatformModuleDescriptor = {
  id: BillingPlatformModuleId;
  status: BillingPlatformModuleStatus;
  description: string;
};

export type BillingPlatformManifest = {
  version: typeof BILLING_PLATFORM_VERSION;
  engine_version: string;
  modules: BillingPlatformModuleDescriptor[];
};
