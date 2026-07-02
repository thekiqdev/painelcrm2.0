/**
 * Billing Platform — manifest and module registry.
 */
import { BILLING_ENGINE_VERSION } from '../billingEngine/types.js';
import {
  BILLING_PLATFORM_VERSION,
  type BillingPlatformManifest,
  type BillingPlatformModuleDescriptor,
} from './types/platform.js';

const MODULES: BillingPlatformModuleDescriptor[] = [
  { id: 'engine', status: 'ga', description: 'Billing Engine 3.0 — invoice generation' },
  { id: 'execution', status: 'ga', description: 'Billing Execution — gateway, notifications, timeline' },
  { id: 'plans', status: 'ga', description: 'Billing Plans & Items' },
  { id: 'analytics', status: 'foundation', description: 'Revenue & growth indicators' },
  { id: 'intelligence', status: 'foundation', description: 'Risk & scoring signals' },
  { id: 'forecast', status: 'foundation', description: 'Revenue projection horizons' },
  { id: 'recovery', status: 'foundation', description: 'Dunning & delinquency architecture' },
  { id: 'automation', status: 'foundation', description: 'Workflow contracts' },
  { id: 'reports', status: 'foundation', description: 'MRR, ARR, LTV report contracts' },
  { id: 'api', status: 'foundation', description: 'Platform HTTP API' },
  { id: 'events', status: 'foundation', description: 'Internal event bus' },
  { id: 'observability', status: 'ga', description: 'Metrics bridge (existing module)' },
  { id: 'provisioning', status: 'ga', description: 'Automatic Billing Plan provisioning' },
  { id: 'audit', status: 'ga', description: 'Production readiness certification (Sprint 4.2)' },
];

export function getBillingPlatformManifest(): BillingPlatformManifest {
  return {
    version: BILLING_PLATFORM_VERSION,
    engine_version: BILLING_ENGINE_VERSION,
    modules: MODULES,
  };
}

export function getBillingPlatformVersion(): string {
  return BILLING_PLATFORM_VERSION;
}
