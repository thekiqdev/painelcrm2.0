/**
 * Versões do runtime Billing Platform (Sprint 4.1J — certificação).
 */
export const BILLING_ENGINE_VERSION = '3.0';
export const BILLING_WORKER_VERSION = '4.1J';
export const BILLING_EXECUTION_VERSION = '2.1';
export const BILLING_RUNTIME_VERSION = '4.1J-certified';

export const BILLING_RUNTIME_PIPELINE = 'billing_renewal_unified' as const;

export const BILLING_RUNTIME_STAGES = [
  'HTTP_RECEIVED',
  'READINESS',
  'JOB_RESOLUTION',
  'JOB_PICKUP',
  'ENGINE_START',
  'PERSISTENCE',
  'COMPLETE',
  'ERROR',
] as const;

export type BillingRuntimeStage = (typeof BILLING_RUNTIME_STAGES)[number];
