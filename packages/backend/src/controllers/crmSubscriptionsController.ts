import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import {
  listCrmCustomerSubscriptions,
  getCrmSubscriptionDetail,
  cancelCrmCustomerSubscription,
  patchCrmSubscriptionNextBilling,
  patchCrmSubscriptionCyclesConfig,
  crmSubscriptionMeta,
} from '../services/crmSubscriptionsService.js';
import { patchCrmSubscriptionContract, getCrmSubscriptionContractHistory } from '../services/crmSubscriptionsContractService.js';
import {
  pauseCrmSubscription,
  resumeCrmSubscription,
  reactivateCrmSubscription,
} from '../services/crmSubscriptionsLifecycleService.js';
import type { BillingInterval } from '../services/billingSubscriptionService.js';
import {
  getCrmSubscriptionsAnalytics,
  resolveCrmSubscriptionsAnalyticsRange,
} from '../services/crmSubscriptionsAnalyticsService.js';
import {
  getManualRenewalStatus,
  manualReprocessRenewal,
  manualRenewSubscription,
  manualReprocessSubscription,
} from '../services/billingManualRenewalService.js';
import { emitBillingJobTrace } from '../services/billingJobLifecycleTrace.js';
import { repairInvoicedCyclesWithoutInvoice } from '../services/subscriptionCycleLifecycleService.js';
import { assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import type { PermissionCatalogKey } from '../permissions/permissionCatalog.js';

async function requirePermKey(req: AuthRequest, key: PermissionCatalogKey, res: Response): Promise<boolean> {
  try {
    await assertPermissionKey(req.userId, key, req);
    return true;
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return false;
    }
    throw e;
  }
}

export async function listCrmSubscriptions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_subscriptions', res))) return;
    const subscriptions = await listCrmCustomerSubscriptions(tenantId);
    res.json({ subscriptions });
  } catch (e) {
    console.error('[crmSubscriptionsController] list', e);
    res.status(500).json({ error: 'Erro ao listar assinaturas' });
  }
}

export async function getCrmSubscriptionsAnalyticsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_subscriptions', res))) return;
    const range = resolveCrmSubscriptionsAnalyticsRange(req.query as Record<string, unknown>);
    const analytics = await getCrmSubscriptionsAnalytics(tenantId, range);
    res.json(analytics);
  } catch (e) {
    console.error('[crmSubscriptionsController] analytics', e);
    res.status(500).json({ error: 'Erro ao carregar analytics de assinaturas' });
  }
}

export async function getCrmSubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_subscriptions', res))) return;
    const { id } = req.params;
    const detail = await getCrmSubscriptionDetail(tenantId, id);
    if (!detail) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    res.json({
      ...detail,
      meta: crmSubscriptionMeta(detail.subscription),
    });
  } catch (e) {
    console.error('[crmSubscriptionsController] get', e);
    res.status(500).json({ error: 'Erro ao carregar assinatura' });
  }
}

export async function getCrmSubscriptionContractHistoryHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_subscriptions', res))) return;
    const { id } = req.params;
    const history = await getCrmSubscriptionContractHistory(tenantId, id);
    if (history === null) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    res.json({ history });
  } catch (e) {
    console.error('[crmSubscriptionsController] contract history', e);
    res.status(500).json({ error: 'Erro ao carregar histórico do contrato' });
  }
}

const patchNextBody = z.object({
  next_billing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'next_billing_date deve ser YYYY-MM-DD'),
});

const patchCyclesBody = z
  .object({
    cycles_unlimited: z.boolean(),
    max_cycles: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.cycles_unlimited && (data.max_cycles == null || data.max_cycles < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'max_cycles obrigatório quando cycles_unlimited é false',
        path: ['max_cycles'],
      });
    }
  });

export async function patchCrmSubscriptionCyclesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = patchCyclesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const maxCycles = parsed.data.cycles_unlimited ? null : (parsed.data.max_cycles ?? null);
    const updated = await patchCrmSubscriptionCyclesConfig({
      tenantId,
      subscriptionId: id,
      cycles_unlimited: parsed.data.cycles_unlimited,
      max_cycles: maxCycles,
    });
    if (!updated) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    res.json({ subscription: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('max_cycles')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[crmSubscriptionsController] patch cycles', err);
    res.status(500).json({ error: 'Erro ao atualizar ciclos' });
  }
}

export async function patchCrmSubscriptionNextBillingHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = patchNextBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const result = await patchCrmSubscriptionNextBilling({
      tenantId,
      subscriptionId: id,
      nextBillingDateYmd: parsed.data.next_billing_date,
      actorUserId: req.userId ?? null,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.startsWith('Só é possível') ||
      msg.startsWith('Reagendar') ||
      msg.startsWith('Operação disponível') ||
      msg.startsWith('Assinatura não está') ||
      msg.startsWith('Assinatura não encontrada') ||
      msg.startsWith('Fatura sem') ||
      msg.startsWith('next_billing_date') ||
      msg.startsWith('Nenhuma fatura paga')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[crmSubscriptionsController] patch next billing', err);
    res.status(500).json({ error: 'Erro ao atualizar próxima cobrança' });
  }
}

const patchContractBody = z.object({
  amount_cents: z.number().int().positive(),
  billing_interval: z.enum(['weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly']),
  description: z.string().trim().min(1, 'description é obrigatória'),
  effective_at: z.enum(['immediate', 'next_cycle']),
  reason: z.string().trim().optional(),
});

export async function patchCrmSubscriptionContractHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = patchContractBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const result = await patchCrmSubscriptionContract({
      tenantId,
      subscriptionId: id,
      amount_cents: parsed.data.amount_cents,
      billing_interval: parsed.data.billing_interval as BillingInterval,
      description: parsed.data.description,
      effective_at: parsed.data.effective_at,
      reason: parsed.data.reason,
      actorUserId: req.userId ?? null,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.startsWith('Assinatura') ||
      msg.startsWith('amount_cents') ||
      msg.startsWith('description') ||
      msg.startsWith('billing_interval') ||
      msg.startsWith('Nenhuma fatura paga')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[crmSubscriptionsController] patch contract', err);
    res.status(500).json({ error: 'Erro ao atualizar contrato da assinatura' });
  }
}

const cancelBody = z.object({
  mode: z.enum(['immediate', 'end_of_period']),
});

const pauseBody = z.object({
  reason: z.string().trim().min(1, 'Motivo da pausa é obrigatório'),
});

const resumeReactivateBody = z.object({
  next_billing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'next_billing_date deve ser YYYY-MM-DD'),
  reason: z.string().trim().optional(),
});

export async function postCrmSubscriptionPause(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = pauseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const subscription = await pauseCrmSubscription({
      tenantId,
      subscriptionId: id,
      reason: parsed.data.reason,
      actorUserId: req.userId ?? null,
    });
    res.json({ subscription });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('Assinatura') || msg.startsWith('Só é possível') || msg.startsWith('Motivo')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[crmSubscriptionsController] pause', err);
    res.status(500).json({ error: 'Erro ao pausar assinatura' });
  }
}

export async function postCrmSubscriptionResume(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = resumeReactivateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const subscription = await resumeCrmSubscription({
      tenantId,
      subscriptionId: id,
      next_billing_date: parsed.data.next_billing_date,
      reason: parsed.data.reason,
      actorUserId: req.userId ?? null,
    });
    res.json({ subscription });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.startsWith('Assinatura') ||
      msg.startsWith('Só é possível') ||
      msg.startsWith('next_billing_date')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[crmSubscriptionsController] resume', err);
    res.status(500).json({ error: 'Erro ao retomar assinatura' });
  }
}

export async function postCrmSubscriptionReactivate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = resumeReactivateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const subscription = await reactivateCrmSubscription({
      tenantId,
      subscriptionId: id,
      next_billing_date: parsed.data.next_billing_date,
      reason: parsed.data.reason,
      actorUserId: req.userId ?? null,
    });
    res.json({ subscription });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.startsWith('Assinatura') ||
      msg.startsWith('Só é possível') ||
      msg.startsWith('next_billing_date')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[crmSubscriptionsController] reactivate', err);
    res.status(500).json({ error: 'Erro ao reativar assinatura' });
  }
}

export async function postCrmSubscriptionCancel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.cancel_subscription', res))) return;
    const { id } = req.params;
    const parsed = cancelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const result = await cancelCrmCustomerSubscription({
      tenantId,
      subscriptionId: id,
      mode: parsed.data.mode,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? 'Não foi possível cancelar' });
      return;
    }
    res.json({ ok: true, subscription: result.subscription });
  } catch (e) {
    console.error('[crmSubscriptionsController] cancel', e);
    res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
}

function manualRenewalActor(req: AuthRequest): { user_id: string; user_name: string | null; ip: string | null } {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim() ?? null
      : req.socket.remoteAddress ?? null;
  return {
    user_id: req.userId ?? 'unknown',
    user_name: req.user?.email ?? null,
    ip,
  };
}

export async function getCrmSubscriptionRenewalDiagnosisHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const status = await getManualRenewalStatus(tenantId, id);
    res.json(status);
  } catch (e) {
    console.error('[crmSubscriptionsController] renewal diagnosis', e);
    res.status(500).json({ error: 'Erro ao carregar diagnóstico de renovação' });
  }
}

export async function postCrmSubscriptionGenerateNowHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const cycleId =
      typeof req.body?.cycle_id === 'string'
        ? req.body.cycle_id
        : typeof req.body?.cycleId === 'string'
          ? req.body.cycleId
          : undefined;
    const result = await manualRenewSubscription(tenantId, id, manualRenewalActor(req), cycleId ? { cycleId } : undefined);
    res.status(result.success ? 200 : 400).json(result);
  } catch (e) {
    console.error('[crmSubscriptionsController] generate-now', e);
    res.status(500).json({ error: 'Erro ao gerar cobrança manualmente' });
  }
}

export async function postCrmSubscriptionReprocessHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const jobId = typeof req.body?.job_id === 'string' ? req.body.job_id : undefined;
    const result = await manualReprocessRenewal(tenantId, id, manualRenewalActor(req), jobId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (e) {
    console.error('[crmSubscriptionsController] reprocess', e);
    res.status(500).json({ error: 'Erro ao reprocessar ciclo' });
  }
}

/** B0.2.1 — POST manual-renew (execução síncrona, sem scheduler). */
export async function postCrmSubscriptionManualRenewHandler(req: AuthRequest, res: Response): Promise<void> {
  const requestStarted = Date.now();
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const cycleId =
      typeof req.body?.cycle_id === 'string'
        ? req.body.cycle_id
        : typeof req.body?.cycleId === 'string'
          ? req.body.cycleId
          : undefined;
    emitBillingJobTrace('HTTP_POST_MANUAL_RENEW_RECEIVED', {
      subscription_id: id,
      tenant_id: tenantId,
      cycle_id: cycleId ?? null,
      caller_file: 'crmSubscriptionsController.ts',
      caller_line: 486,
      caller_function: 'postCrmSubscriptionManualRenewHandler',
    });
    const result = await manualRenewSubscription(tenantId, id, manualRenewalActor(req), cycleId ? { cycleId } : undefined);
    const httpStatus = result.success ? 200 : 400;
    emitBillingJobTrace('HTTP_POST_MANUAL_RENEW_RESPONSE', {
      subscription_id: id,
      tenant_id: tenantId,
      job_id: result.job_id,
      correlation_id: result.correlation_id ?? null,
      http_status: httpStatus,
      success: result.success,
      result: result.result,
      invoice_id: result.invoice_id,
      duration_ms: Date.now() - requestStarted,
      caller_file: 'crmSubscriptionsController.ts',
      caller_line: 496,
      caller_function: 'postCrmSubscriptionManualRenewHandler',
    });
    res.status(httpStatus).json(result);
  } catch (e) {
    emitBillingJobTrace('HTTP_POST_MANUAL_RENEW_ERROR', {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      caller_file: 'crmSubscriptionsController.ts',
      caller_line: 498,
      caller_function: 'postCrmSubscriptionManualRenewHandler',
    });
    console.error('[crmSubscriptionsController] manual-renew', e);
    res.status(500).json({ error: 'Erro na renovação manual' });
  }
}

/** Sprint 5.0-24C — repara INV-19 (invoiced sem invoice_id) para assinatura ou ciclo específico. */
export async function postCrmSubscriptionRepairCycleInvariantsHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id: subscriptionId } = req.params;
    const cycleId =
      typeof req.body?.cycle_id === 'string'
        ? req.body.cycle_id
        : typeof req.body?.cycleId === 'string'
          ? req.body.cycleId
          : undefined;
    const result = await repairInvoicedCyclesWithoutInvoice(tenantId, subscriptionId, {
      reason: 'manual_repair_cycle_invariants',
      cycleId: cycleId ?? null,
    });
    res.status(200).json({
      success: true,
      cycles_reopened: result.cycles_reopened,
      cycle_ids: result.cycle_ids,
      cycle_dates: result.cycle_dates,
      jobs_reset: result.jobs_reset,
    });
  } catch (e) {
    console.error('[crmSubscriptionsController] repair-cycle-invariants', e);
    res.status(500).json({ error: 'Erro ao reparar competências da assinatura' });
  }
}

/** B0.2.1 — POST manual-reprocess (execução síncrona). */
export async function postCrmSubscriptionManualReprocessHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const jobId = typeof req.body?.job_id === 'string' ? req.body.job_id : undefined;
    const result = await manualReprocessSubscription(tenantId, id, manualRenewalActor(req), jobId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (e) {
    console.error('[crmSubscriptionsController] manual-reprocess', e);
    res.status(500).json({ error: 'Erro no reprocessamento manual' });
  }
}

const pixAutomaticEnableBody = z.object({
  invoice_id: z.string().uuid().optional().nullable(),
});

/** CRM7/CRM8 — liga débito automático via PIX na assinatura (fatura aberta ou intenção). */
export async function postCrmSubscriptionPixAutomaticEnable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const parsed = pixAutomaticEnableBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const { enablePixAutomaticForCrmSubscription } = await import(
      '../services/crm/crmPixAutomaticService.js'
    );
    const result = await enablePixAutomaticForCrmSubscription({
      tenantId,
      subscriptionId: id,
      invoiceId: parsed.data.invoice_id ?? null,
      correlationId: `crm_sub_enable:${id}`,
    });
    if (!result.ok) {
      const status =
        result.detail === 'needs_open_invoice'
          ? 409
          : result.detail === 'flag_crm_pix_automatic_off' || result.detail.startsWith('gate_')
            ? 403
            : result.detail === 'auth_already_active'
              ? 409
              : 400;
      res.status(status).json({ ok: false, error: result.detail, code: result.detail });
      return;
    }
    res.json({
      ok: true,
      authorization_id: result.authorization_id,
      status: result.status,
      pix_copy_paste: result.qr_payload,
      pix_qr_code: result.qr_image,
      invoice_id: result.invoice_id,
      deferred: result.deferred === true,
    });
  } catch (e) {
    console.error('[crmSubscriptionsController] pix-automatic enable', e);
    res.status(500).json({ error: 'Erro ao ativar débito automático via PIX' });
  }
}

/** CRM7 — desliga / opt-out Pix Automático na assinatura. */
export async function postCrmSubscriptionPixAutomaticDisable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;
    const { id } = req.params;
    const { cancelPixAutomaticAuthorizationForCrmSubscription } = await import(
      '../services/crm/crmPixAutomaticService.js'
    );
    const result = await cancelPixAutomaticAuthorizationForCrmSubscription({
      tenantId,
      subscriptionId: id,
      correlationId: `crm_sub_disable:${id}`,
      reason: 'operator_switch_off',
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.detail, code: result.detail });
      return;
    }
    res.json({ ok: true, detail: result.detail });
  } catch (e) {
    console.error('[crmSubscriptionsController] pix-automatic disable', e);
    res.status(500).json({ error: 'Erro ao desativar débito automático via PIX' });
  }
}
