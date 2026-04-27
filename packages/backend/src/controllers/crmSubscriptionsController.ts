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

export async function listCrmSubscriptions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const subscriptions = await listCrmCustomerSubscriptions(tenantId);
    res.json({ subscriptions });
  } catch (e) {
    console.error('[crmSubscriptionsController] list', e);
    res.status(500).json({ error: 'Erro ao listar assinaturas' });
  }
}

export async function getCrmSubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
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

const cancelBody = z.object({
  mode: z.enum(['immediate', 'end_of_period']),
});

export async function postCrmSubscriptionCancel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
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
