/**
 * Fase 2 Billing Engine: assinatura do tenant (get, cancelar, mudar plano).
 * Rotas sob /api/me/tenant (tenantAuth).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import {
  getActiveSaasSubscriptionByTenantAutoRepair,
  cancelSubscription,
  changeSubscriptionPlan,
} from '../services/billingSubscriptionService.js';
import { ensureUsableSaasSubscriptionForActivePaidTenant } from '../services/subscriptionService.js';
import { z } from 'zod';

async function getMyTenantId(req: AuthRequest): Promise<string | null> {
  if (!req.userId) return null;
  const r = await pool.query<{ tenant_id: string }>('SELECT tenant_id FROM users WHERE id = $1', [req.userId]);
  return r.rows[0]?.tenant_id ?? null;
}

/** Alterar/cancelar assinatura: mesmo critério do PUT /plan (apenas primary). */
async function getMyTenantIdIfPrimary(req: AuthRequest): Promise<string | null> {
  if (!req.userId) return null;
  const r = await pool.query<{ tenant_id: string; primary_user_id: string }>(
    `SELECT t.id AS tenant_id,
        (SELECT u2.id FROM users u2 WHERE u2.tenant_id = t.id ORDER BY u2.created_at ASC LIMIT 1) AS primary_user_id
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1`,
    [req.userId]
  );
  const row = r.rows[0];
  if (!row || row.primary_user_id !== req.userId) return null;
  return row.tenant_id;
}

function daysFromTodayToYmd(ymd: string | null | undefined): number | null {
  if (!ymd || typeof ymd !== 'string') return null;
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const target = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** GET /api/me/tenant/subscription — assinatura ativa do meu tenant (saas). */
export async function getMySubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantId(req);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    await ensureUsableSaasSubscriptionForActivePaidTenant(tenantId);
    const subscription = await getActiveSaasSubscriptionByTenantAutoRepair(tenantId);
    if (!subscription) {
      res.status(200).json({ subscription: null });
      return;
    }
    const planRow = await pool.query<{ name: string; slug: string; plan_type: string }>(
      'SELECT name, slug, plan_type FROM plans WHERE id = $1',
      [subscription.plan_id]
    );
    const pl = planRow.rows[0];
    const daysUntil = daysFromTodayToYmd(subscription.next_billing_date);
    const renewalOverdue = daysUntil !== null && daysUntil < 0;

    res.status(200).json({
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        plan_name: pl?.name ?? null,
        plan_slug: pl?.slug ?? null,
        plan_type: pl?.plan_type ?? null,
        amount_cents: subscription.amount_cents,
        billing_interval: subscription.billing_interval,
        status: subscription.status,
        next_billing_date: subscription.next_billing_date,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        users_count: subscription.users_count,
        /** Negativo = data de próxima cobrança já passou (referência da assinatura; conferir faturas no gateway). */
        days_until_next_billing: daysUntil,
        renewal_overdue: renewalOverdue,
        will_cancel_at_period_end:
          subscription.status === 'active' && subscription.cancel_at_period_end === true,
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
    await ensureUsableSaasSubscriptionForActivePaidTenant(tenantId);
    const sub = await getActiveSaasSubscriptionByTenantAutoRepair(tenantId);
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
  plan_id: z.string().uuid().optional(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  users_count: z.number().int().min(1).nullable().optional(),
});

/**
 * PATCH /api/me/tenant/subscription — alterar plano, intervalo e/ou assentos da assinatura.
 * Política Fase 2 (sem pró-rata imediato): alterações refletem no valor da próxima cobrança recorrente.
 */
export async function patchMySubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = await getMyTenantIdIfPrimary(req);
    if (!tenantId) {
      res.status(403).json({
        error: 'Apenas o administrador da conta pode alterar a assinatura.',
      });
      return;
    }
    await ensureUsableSaasSubscriptionForActivePaidTenant(tenantId);
    const sub = await getActiveSaasSubscriptionByTenantAutoRepair(tenantId);
    if (!sub) {
      res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
      return;
    }
    if (!sub.plan_id) {
      res.status(400).json({ error: 'Assinatura sem plano vinculado; entre em contato com o suporte.' });
      return;
    }
    const parsed = changePlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const { plan_id: bodyPlanId, billing_interval, users_count } = parsed.data;
    if (bodyPlanId === undefined && billing_interval === undefined && users_count === undefined) {
      res.status(400).json({
        error: 'Informe plan_id, billing_interval ou users_count para alterar a assinatura.',
      });
      return;
    }
    const effectivePlanId = bodyPlanId ?? sub.plan_id;
    const result = await changeSubscriptionPlan(
      sub.id,
      tenantId,
      {
        plan_id: effectivePlanId,
        billing_interval,
        users_count: users_count ?? undefined,
      },
      { syncContractSnapshot: true }
    );
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({
      ok: true,
      message:
        'Assinatura atualizada. Sem cobrança extra agora — o valor da próxima renovação passará a refletir esta alteração.',
    });
  } catch (e) {
    console.error('[patchMySubscription]', e);
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
}
