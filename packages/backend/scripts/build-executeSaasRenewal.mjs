import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.join(__dirname, '../src/services/billingRenewalEngine');
const body = fs.readFileSync(path.join(engineDir, '_saasBody.txt'), 'utf8');

const header = `/**
 * Pipeline SaaS renewal — BillingRenewalEngine (B0.3).
 */
import { pool } from '../../utils/db.js';
import { billingLog } from '../billingLogger.js';
import {
  changeSubscriptionPlan,
  type SubscriptionRow,
} from '../billingSubscriptionService.js';
import {
  createInvoice,
  updateInvoiceGatewayData,
  type CreateInvoiceInput,
} from '../invoiceService.js';
import { publishPlatformBillingChargeCreated } from '../platformNotifications/platformBusinessNotifications.js';
import { calculateSaasRenewalInvoiceAmount, type BillingInterval } from '../billingService.js';
import { trySettleZeroAmountBillingIfEligible } from '../../commercial/zeroAmountSettlementService.js';
import { getActiveGateway } from '../../modules/payments/gatewayProvider.js';
import { getActiveConfig } from '../paymentGatewayConfigService.js';
import { resolveAutomaticInvoicePaymentMethod } from '../gatewayPaymentMethodPolicy.js';
import { calculateNextBillingDate } from '../subscriptionService.js';
import {
  BILLING_RECURRING_JOB_OUTCOME,
  advanceSubscriptionAfterCompletedCycle,
  completeBillingRecurringJob,
} from '../billingRecurringJobPersistence.js';
import type {
  BillingRenewalExecutionMode,
  BillingRenewalJobRef,
  BillingRenewalResult,
} from './types.js';

type DbQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

function nextSubscriptionBillingAfterCycle(periodStartYmd: string, interval: BillingInterval): string {
  return calculateNextBillingDate(periodStartYmd, interval, null);
}

function buildSaasRenewalResult(
  partial: Partial<BillingRenewalResult> &
    Pick<BillingRenewalResult, 'success' | 'executionMode' | 'correlationId' | 'cycleKey' | 'executionTime' | 'logs'>
): BillingRenewalResult {
  return {
    invoiceId: null,
    gatewayStatus: null,
    notificationStatus: 'unknown',
    timelineStatus: 'not_applicable',
    historyStatus: 'not_applicable',
    subscriptionAdvanced: false,
    completionOutcome: null,
    ...partial,
  };
}

export async function executeSaasRenewal(params: {
  client: DbQueryable;
  job: BillingRenewalJobRef;
  subscription: SubscriptionRow;
  periodStartYmd: string;
  executionMode: BillingRenewalExecutionMode;
  correlationId: string;
}): Promise<BillingRenewalResult> {
  const started = Date.now();
  const logs: string[] = ['saas_renewal_start'];
  const { client, job } = params;
  const subscription = params.subscription;
  const correlationId = params.correlationId;
`;

let transformed = body.replace(/^async function processOneRenewalJob\([\s\S]*?\): Promise<void> \{\n/, '');
if (transformed.endsWith('}\n')) transformed = transformed.slice(0, -2);
else if (transformed.endsWith('}')) transformed = transformed.slice(0, -1);

transformed = transformed.replace(
  'const periodStart = periodStartYmd;',
  'const periodStart = params.periodStartYmd;'
);

transformed += `

  return buildSaasRenewalResult({
    success: true,
    invoiceId: billing.id,
    gatewayStatus: null,
    notificationStatus: zeroSettlement ? 'skipped' : 'queued',
    timelineStatus: 'ok',
    historyStatus: 'ok',
    subscriptionAdvanced: true,
    completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_SAAS,
    executionMode: params.executionMode,
    correlationId,
    cycleKey: periodStart,
    executionTime: Date.now() - started,
    logs: [...logs, 'saas_renewal_complete'],
  });
}
`;

fs.writeFileSync(path.join(engineDir, 'executeSaasRenewal.ts'), header + transformed);
fs.unlinkSync(path.join(engineDir, '_saasBody.txt'));
console.log('Wrote executeSaasRenewal.ts');
