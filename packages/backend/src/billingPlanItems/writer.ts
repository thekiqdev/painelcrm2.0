/**
 * Billing Engine V2 — Shadow Write interface (Sprint 2.3+).
 */
import type { BillingItemSnapshot } from '../billingPlanItemSnapshot/types.js';
import type { BillingPlanItemCreateInput } from './types.js';

export interface BillingPlanItemWriter {
  write(_items: BillingPlanItemCreateInput[]): Promise<void>;
  sync(_billingPlanId: string, _tenantId: string): Promise<void>;
  validate(_items: BillingPlanItemCreateInput[]): Promise<void>;
  writeSnapshot(_snapshot: BillingItemSnapshot): Promise<void>;
  compareSnapshot(_snapshot: BillingItemSnapshot): Promise<void>;
  validateSnapshot(_snapshot: BillingItemSnapshot): Promise<void>;
}

export class BillingPlanItemWriterNotImplemented implements BillingPlanItemWriter {
  async write(): Promise<void> {
    throw new Error('not_implemented');
  }

  async sync(): Promise<void> {
    throw new Error('not_implemented');
  }

  async validate(): Promise<void> {
    throw new Error('not_implemented');
  }

  async writeSnapshot(): Promise<void> {
    throw new Error('not_implemented');
  }

  async compareSnapshot(): Promise<void> {
    throw new Error('not_implemented');
  }

  async validateSnapshot(): Promise<void> {
    throw new Error('not_implemented');
  }
}

export const billingPlanItemWriter = new BillingPlanItemWriterNotImplemented();
