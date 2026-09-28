/**
 * Billing Platform — bridge to existing Billing Observability (no duplication).
 */
import {
  BILLING_OBSERVABILITY_VERSION,
  getBillingObservabilityReport,
  type BillingObservabilityReport,
} from '../../billingObservability/index.js';

export type BillingPlatformObservabilityBridge = {
  platform_version: string;
  observability_version: string;
  report: BillingObservabilityReport;
};

export async function getPlatformObservabilityBridge(options?: {
  includeAudit?: boolean;
}): Promise<BillingPlatformObservabilityBridge> {
  const report = await getBillingObservabilityReport({
    includeAudit: options?.includeAudit ?? false,
  });

  return {
    platform_version: 'v4_platform_foundation',
    observability_version: BILLING_OBSERVABILITY_VERSION,
    report,
  };
}
