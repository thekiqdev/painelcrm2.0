/**
 * Billing Engine V2 — Sprint 3.0D: dispara notificações pós-persistência.
 */
import { notifyInvoiceCreated } from '../services/invoiceNotificationsService.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { NotificationExecutionOutcome } from './types.js';

export function executeInvoiceNotifications(params: {
  tenantId: string;
  invoiceId: string;
  skipNotify?: boolean;
}): NotificationExecutionOutcome {
  logExecutionOrchestrator('NOTIFICATION_EXECUTION', 'start', {
    tenant_id: params.tenantId,
    invoice_id: params.invoiceId,
  });

  if (params.skipNotify) {
    logExecutionOrchestrator('NOTIFICATION_EXECUTION', 'skipped', {
      invoice_id: params.invoiceId,
    });
    return { status: 'skipped' };
  }

  try {
    notifyInvoiceCreated({
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      origin_kind: 'renewal_v2',
    });
    logExecutionOrchestrator('NOTIFICATION_EXECUTION', 'complete', {
      invoice_id: params.invoiceId,
      status: 'queued',
    });
    return { status: 'queued' };
  } catch {
    logExecutionOrchestrator('NOTIFICATION_EXECUTION', 'failed', {
      invoice_id: params.invoiceId,
    });
    return { status: 'unknown' };
  }
}
