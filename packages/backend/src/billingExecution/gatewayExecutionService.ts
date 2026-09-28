/**
 * Billing Engine V2 — Sprint 3.0D: executa cobrança real no gateway (sem alterar módulo gateway).
 */
import crypto from 'node:crypto';
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { CustomerInvoiceDraft } from '../billingEngine/types.js';
import { isAsaasInvalidCustomerError } from '../modules/gateways/asaas/asaasErrors.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { billingLog } from '../services/billingLogger.js';
import { updateCustomerInvoiceGatewayData } from '../services/customerInvoiceService.js';
import { resolveAutomaticInvoicePaymentMethod } from '../services/gatewayPaymentMethodPolicy.js';
import { getActiveConfig } from '../services/paymentGatewayConfigService.js';
import {
  createPaymentCustomerForClient,
  deletePaymentCustomerForClient,
  getPaymentCustomerForClient,
} from '../services/paymentCustomersService.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { DbQueryable, GatewayExecutionOutcome } from './types.js';

export async function executeGatewayChargeForInvoice(
  db: DbQueryable,
  params: {
    context: BillingExecutionContext;
    draft: CustomerInvoiceDraft;
    invoiceId: string;
    invoiceNumber: string | null;
    periodStartYmd: string;
  }
): Promise<GatewayExecutionOutcome> {
  const { context, draft, invoiceId, invoiceNumber, periodStartYmd } = params;
  const subscription = context.subscription;
  const clientId = draft.client_id;
  const gatewayKey = draft.gateway;
  const amountCents = draft.amount_cents;

  logExecutionOrchestrator('GATEWAY_EXECUTION', 'start', {
    subscription_id: subscription.id,
    invoice_id: invoiceId,
    amount_cents: amountCents,
  });

  if (amountCents <= 0 || !gatewayKey) {
    logExecutionOrchestrator('GATEWAY_EXECUTION', 'skipped', {
      subscription_id: subscription.id,
      reason: amountCents <= 0 ? 'zero_amount' : 'no_gateway',
    });
    return { status: null, paymentId: null, failed: false };
  }

  const gateway = await getActiveGateway({ billingType: 'crm', tenantId: subscription.tenant_id });
  if (!gateway) {
    return { status: null, paymentId: null, failed: false };
  }

  const config = await getActiveConfig('crm', subscription.tenant_id);

  try {
    let customerId =
      (await getPaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId))
        ?.gateway_customer_id ?? null;

    const clientR = await db.query('SELECT name, email, phone, cpf_cnpj FROM clients WHERE id = $1', [
      clientId,
    ]);
    const c = clientR.rows[0] as
      | { name: string; email: string | null; phone: string | null; cpf_cnpj: string | null }
      | undefined;

    if (!customerId && gateway.ensureCustomerForClient && c) {
      customerId = await gateway.ensureCustomerForClient(subscription.tenant_id, clientId, {
        name: c.name,
        email: c.email ?? '',
        phone: c.phone ?? undefined,
        cpfCnpj: c.cpf_cnpj?.trim() || undefined,
      });
      await createPaymentCustomerForClient(
        subscription.tenant_id,
        gatewayKey,
        clientId,
        customerId,
        clientId
      );
    }

    if (!customerId) {
      return { status: null, paymentId: null, failed: false };
    }

    // CRM4 — auth ACTIVE + janela 2–10 → instrução Pix Automático (sem charge avulso).
    try {
      const { isCrmPixAutomaticEnabled } = await import('../services/crm/crmPixAutomaticFlags.js');
      if (await isCrmPixAutomaticEnabled()) {
        const { getCrmPixAutomaticAuthBySubscriptionId } = await import(
          '../services/crm/crmPixAutomaticStore.js'
        );
        const { createPixAutomaticInstructionForCustomerInvoice } = await import(
          '../services/crm/crmPixAutomaticService.js'
        );
        const authRow = await getCrmPixAutomaticAuthBySubscriptionId(subscription.id);
        if (authRow?.status === 'active' && authRow.authorization_id) {
          const instr = await createPixAutomaticInstructionForCustomerInvoice({
            invoiceId,
            tenantId: subscription.tenant_id,
            customerId,
            correlationId: `crm_renew:${subscription.id}:${periodStartYmd}`,
          });
          if (instr.ok) {
            logExecutionOrchestrator('GATEWAY_EXECUTION', 'complete', {
              subscription_id: subscription.id,
              invoice_id: invoiceId,
              gateway_status: 'pix_automatic_instruction',
              payment_id: instr.payment_id,
            });
            return {
              status: 'PENDING',
              paymentId: instr.payment_id,
              failed: false,
            };
          }
          // outside_instruction_window / auth issues / Asaas error → path avulso abaixo
          if (instr.detail !== 'outside_instruction_window') {
            logExecutionOrchestrator('GATEWAY_EXECUTION', 'pix_auto_instruction_fallback', {
              subscription_id: subscription.id,
              invoice_id: invoiceId,
              detail: instr.detail,
            });
          }
        } else if (authRow?.status === 'pending' && authRow.authorization_id) {
          // Assinatura já com Pix Auto ligado (pending): próxima fatura herda metadata/QR.
          const { startPixAutomaticAuthorizationForCustomerInvoice } = await import(
            '../services/crm/crmPixAutomaticService.js'
          );
          const started = await startPixAutomaticAuthorizationForCustomerInvoice({
            invoiceId,
            tenantId: subscription.tenant_id,
            correlationId: `crm_renew_pending:${subscription.id}:${periodStartYmd}`,
          });
          if (started.ok) {
            logExecutionOrchestrator('GATEWAY_EXECUTION', 'complete', {
              subscription_id: subscription.id,
              invoice_id: invoiceId,
              gateway_status: 'pix_automatic_pending_propagated',
              authorization_id: started.authorization_id,
            });
            return {
              status: 'PENDING',
              paymentId: null,
              failed: false,
            };
          }
        } else if (authRow?.status === 'requested') {
          // CRM8 — intenção na assinatura: start auth na fatura do ciclo (ou metadata se sem cliente).
          const { finalizePixAutomaticOnCustomerInvoiceCreate } = await import(
            '../services/crm/crmPixAutomaticService.js'
          );
          const fin = await finalizePixAutomaticOnCustomerInvoiceCreate({
            tenantId: subscription.tenant_id,
            invoiceId,
            pixAutomaticRequested: true,
          });
          if (fin?.started) {
            logExecutionOrchestrator('GATEWAY_EXECUTION', 'complete', {
              subscription_id: subscription.id,
              invoice_id: invoiceId,
              gateway_status: 'pix_automatic_intent_started',
              authorization_id: fin.authorization_id ?? null,
            });
            return {
              status: 'PENDING',
              paymentId: null,
              failed: false,
            };
          }
          if (fin && !fin.started) {
            logExecutionOrchestrator('GATEWAY_EXECUTION', 'pix_auto_intent_deferred_or_fallback', {
              subscription_id: subscription.id,
              invoice_id: invoiceId,
              detail: fin.detail,
            });
          }
        }
      }
    } catch (pixErr) {
      const msg = pixErr instanceof Error ? pixErr.message : String(pixErr);
      billingLog('job', 'crm_pix_automatic_instruction_probe_error', {
        invoice_id: invoiceId,
        subscription_id: subscription.id,
        error: msg.slice(0, 500),
      });
    }

    const chargeCustomerId = customerId;
    const renewalPm = resolveAutomaticInvoicePaymentMethod(
      subscription.default_payment_method as string | null,
      config
    );
    let idempotencyKey = `customer_renew_v2_${subscription.id}_${periodStartYmd}`;

    const runCharge = (activeCustomerId: string) =>
      gateway.createCharge({
        customerId: activeCustomerId,
        amountCents,
        dueDate: draft.due_date,
        paymentMethod: renewalPm,
        description: invoiceNumber ?? `Cobrança ${periodStartYmd}`,
        idempotencyKey,
        externalReference: clientId,
      });

    let chargeResult;
    try {
      chargeResult = await runCharge(chargeCustomerId);
    } catch (renewErr) {
      if (!isAsaasInvalidCustomerError(renewErr) || !gateway.ensureCustomerForClient || !c) {
        throw renewErr;
      }
      await deletePaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId);
      customerId = await gateway.ensureCustomerForClient(subscription.tenant_id, clientId, {
        name: c.name,
        email: c.email ?? '',
        phone: c.phone ?? undefined,
        cpfCnpj: c.cpf_cnpj?.trim() || undefined,
      });
      await createPaymentCustomerForClient(
        subscription.tenant_id,
        gatewayKey,
        clientId,
        customerId,
        clientId
      );
      idempotencyKey = `customer_renew_v2_${subscription.id}_${periodStartYmd}_r_${crypto.randomUUID().slice(0, 8)}`;
      chargeResult = await runCharge(customerId);
    }

    await updateCustomerInvoiceGatewayData(invoiceId, {
      gateway: gatewayKey,
      payment_method: renewalPm,
      gateway_reference_id: chargeResult.paymentId,
      gateway_status: chargeResult.status,
      idempotency_key: idempotencyKey,
    });

    logExecutionOrchestrator('GATEWAY_EXECUTION', 'complete', {
      subscription_id: subscription.id,
      invoice_id: invoiceId,
      gateway_status: chargeResult.status,
    });

    return {
      status: chargeResult.status,
      paymentId: chargeResult.paymentId,
      failed: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    billingLog('job', 'persistence_orchestrator_gateway_error', {
      invoice_id: invoiceId,
      subscription_id: subscription.id,
      error: msg.slice(0, 2000),
    });
    logExecutionOrchestrator('GATEWAY_EXECUTION', 'failed', {
      subscription_id: subscription.id,
      invoice_id: invoiceId,
    });
    return { status: null, paymentId: null, failed: true, error: msg };
  }
}
