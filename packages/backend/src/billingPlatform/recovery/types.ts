/**
 * Billing Recovery — architecture contracts (no automatic execution).
 */

export const BILLING_RECOVERY_CAPABILITIES = [
  'reminders',
  'automatic_charge',
  'dunning_sequence',
  'negotiation',
  'delinquency_recovery',
] as const;

export type BillingRecoveryCapability = (typeof BILLING_RECOVERY_CAPABILITIES)[number];

export type BillingRecoveryCapabilityDescriptor = {
  capability: BillingRecoveryCapability;
  enabled: false;
  status: 'architecture_only';
};

export type BillingRecoveryArchitecture = {
  tenant_id: string;
  capabilities: BillingRecoveryCapabilityDescriptor[];
};
