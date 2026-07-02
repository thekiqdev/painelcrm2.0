import type { BillingPlanRow } from '../../billingPlan/types.js';
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';

export const BILLING_PROVISION_VERSION = 'v4_0a_auto_provision';

export type BillingProvisionAction =
  | 'noop'
  | 'provisioned'
  | 'repaired'
  | 'synchronized'
  | 'validated';

export type BillingProvisionStatus = {
  subscription_id: string;
  tenant_id: string;
  has_billing_plan: boolean;
  billing_plan_id: string | null;
  billing_plan_status: string | null;
  item_count: number;
  plan_revision: number | null;
  valid: boolean;
  issues: string[];
};

export type BillingProvisionResult = {
  ok: boolean;
  action: BillingProvisionAction;
  subscription_id: string;
  tenant_id: string;
  billing_plan_id: string | null;
  billing_plan: BillingPlanRow | null;
  items: BillingPlanItemRow[];
  duration_ms: number;
  created_plan: boolean;
  created_items: boolean;
  repaired: boolean;
  synchronized: boolean;
  message: string;
};

export type BillingProvisionErrorCode =
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'SUBSCRIPTION_NOT_ELIGIBLE'
  | 'TENANT_MISMATCH'
  | 'PROVISION_FAILED'
  | 'REPAIR_FAILED'
  | 'SYNC_FAILED'
  | 'VALIDATION_FAILED';

export class BillingPlanProvisionError extends Error {
  constructor(
    message: string,
    readonly code: BillingProvisionErrorCode,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BillingPlanProvisionError';
  }
}

export type EnsureBillingPlanOptions = {
  tenantId?: string;
  periodStartYmd?: string;
  skipSync?: boolean;
};
