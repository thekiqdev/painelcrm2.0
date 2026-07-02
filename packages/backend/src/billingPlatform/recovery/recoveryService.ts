import { BILLING_RECOVERY_CAPABILITIES, type BillingRecoveryArchitecture } from './types.js';

export function describeRecoveryArchitectureFoundation(tenantId: string): BillingRecoveryArchitecture {
  return {
    tenant_id: tenantId,
    capabilities: BILLING_RECOVERY_CAPABILITIES.map((capability) => ({
      capability,
      enabled: false as const,
      status: 'architecture_only' as const,
    })),
  };
}
