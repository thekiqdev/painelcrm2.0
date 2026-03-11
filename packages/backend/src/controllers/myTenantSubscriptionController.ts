/**
 * Fase 2 Billing Engine: assinatura do tenant (get, cancelar, mudar plano).
 * Rotas sob /api/me/tenant (tenantAuth).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import {
  getActiveSaasSubscriptionByTenant,
  cancelSubscription,
  changeSubscriptionPlan,
} from '../services/billingSubscriptionService.js';
import { z } from 'zod';

async function getMyTenantId(req: AuthRequest): Promise<string | null> {
  if (!req.userId) return null;
  const r = await pool.query<{ tenant_id: string }>('SELECT tenant_id FROM users WHERE id = $1', [req.userId]);
  return r.rows[0]?.tenant_id ?? null;
}

/** GET /api/me/tenant/subscription — assinatura ativa do meu tenant (saas). */
export async function getMySubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const subscription = await getActiveSaasSubscriptionByTenant(tenantId);
    if (!subscription) {
      res.status(200).json({ subscription: null });
      return;
    }
    res.status(200).json({
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        amount_cents: subscription.amount_cents,
        billing_interval: subscription.billing_interval,
        status: subscription.status,
        next_billing_date: subscription.next_billing_date,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        users_count: subscription.users_count,
      },
    });
  } catch (e) {
    console.error('[getMySubscription]', e);
    res.status(500).json({ error: 'Erro ao buscar assinatura' });
  }
}

const cancelBodySchema = z.object({
  immediate: z.boolean().optional().default(false),
});

/** POST /api/me/tenant/subscription/cancel — cancelar assinatura (imediato ou ao fim do período). */
export async function cancelMySubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const sub = await getActiveSaasSubscriptionByTenant(tenantId);
    if (!sub) {
      res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
      return;
    }
    const parsed = cancelBodySchema.safeParse(req.body);
    const immediate = parsed.success ? parsed.data.immediate : false;
    const result = await cancelSubscription(sub.id, tenantId, { immediate });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({
      ok: true,
      message: immediate
        ? 'Assinatura cancelada. Seu acesso foi alterado para trial.'
        : 'Assinatura será cancelada ao fim do período atual.',
    });
  } catch (e) {
    console.error('[cancelMySubscription]', e);
    res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
}

const changePlanBodySchema = z.object({
  plan_id: z.string().uuid(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  users_count: z.number().int().min(1).nullable().optional(),
});

/** PATCH /api/me/tenant/subscription — mudar plano (upgrade/downgrade). Próxima cobrança usa o novo plano. */
export async function patchMySubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const sub = await getActiveSaasSubscriptionByTenant(tenantId);
    if (!sub) {
      res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
      return;
    }
    const parsed = changePlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const result = await changeSubscriptionPlan(sub.id, tenantId, {
      plan_id: parsed.data.plan_id,
      billing_interval: parsed.data.billing_interval,
      users_count: parsed.data.users_count ?? undefined,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({
      ok: true,
      message: 'Plano atualizado. A próxima cobrança usará o novo plano.',
    });
  } catch (e) {
    console.error('[patchMySubscription]', e);
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
}
