/**
 * Billing Engine V2 — Value Object: identidade imutável do Billing Plan.
 */
import type { BillingPlanRow } from './types.js';
import { isValidBillingPlanNumber } from './billingPlanNumberGenerator.js';

export class BillingPlanIdentity {
  readonly plan_number: string;
  readonly subscription_id: string;
  readonly tenant_id: string;
  readonly version: number;
  readonly revision: number;

  private constructor(fields: {
    plan_number: string;
    subscription_id: string;
    tenant_id: string;
    version: number;
    revision: number;
  }) {
    if (!isValidBillingPlanNumber(fields.plan_number)) {
      throw new Error('billing_plan_identity_invalid_plan_number');
    }
    if (fields.version < 1 || fields.revision < 1) {
      throw new Error('billing_plan_identity_invalid_version_or_revision');
    }
    this.plan_number = fields.plan_number;
    this.subscription_id = fields.subscription_id;
    this.tenant_id = fields.tenant_id;
    this.version = fields.version;
    this.revision = fields.revision;
  }

  static fromRow(row: BillingPlanRow): BillingPlanIdentity {
    return new BillingPlanIdentity({
      plan_number: row.plan_number,
      subscription_id: row.subscription_id,
      tenant_id: row.tenant_id,
      version: row.version,
      revision: row.plan_revision,
    });
  }

  static create(fields: {
    plan_number: string;
    subscription_id: string;
    tenant_id: string;
    version: number;
    revision: number;
  }): BillingPlanIdentity {
    return new BillingPlanIdentity(fields);
  }

  toJSON(): Record<string, string | number> {
    return {
      plan_number: this.plan_number,
      subscription_id: this.subscription_id,
      tenant_id: this.tenant_id,
      version: this.version,
      revision: this.revision,
    };
  }

  equals(other: BillingPlanIdentity): boolean {
    return (
      this.plan_number === other.plan_number &&
      this.subscription_id === other.subscription_id &&
      this.tenant_id === other.tenant_id &&
      this.version === other.version &&
      this.revision === other.revision
    );
  }
}
