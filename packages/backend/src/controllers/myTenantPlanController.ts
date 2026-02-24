/**
 * API para o usuário logado gerenciar o plano da própria conta (tenant).
 * Apenas o primary user do tenant pode acessar.
 */
import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

async function getMyTenantAndPrimary(req: AuthRequest): Promise<{ tenantId: string; primaryUserId: string } | null> {
  const userId = req.userId;
  if (!userId) return null;
  const r = await pool.query(
    `SELECT t.id AS tenant_id,
        (SELECT u2.id FROM users u2 WHERE u2.tenant_id = t.id ORDER BY u2.created_at ASC LIMIT 1) AS primary_user_id
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1`,
    [userId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return { tenantId: row.tenant_id, primaryUserId: row.primary_user_id };
}

/** GET /api/me/tenant/plan - plano atual do tenant do usuário (apenas primary user). */
export async function getMyTenantPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode acessar os planos' });
      return;
    }
    const planResult = await pool.query(
      `SELECT p.*, t.trial_ends_at, t.max_users_override, t.max_whatsapp_instances_override
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [ctx.tenantId]
    );
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Conta ou plano não encontrado' });
      return;
    }
    const plan = planResult.rows[0];
    if (!Array.isArray(plan.benefits)) plan.benefits = [];
    if (plan.plan_type === 'custom') {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [plan.id]
      );
      plan.interval_prices = pricesRows.rows;
    }
    res.json({
      tenant_id: ctx.tenantId,
      plan,
      trial_ends_at: plan.trial_ends_at,
      max_users_override: plan.max_users_override,
      max_whatsapp_instances_override: plan.max_whatsapp_instances_override,
    });
  } catch (error: any) {
    console.error('getMyTenantPlan error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const putMyTenantPlanSchema = z.object({
  plan_id: z.string().uuid().optional(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
  users_count: z.number().int().min(1).optional(),
});

/** PUT /api/me/tenant/plan - alterar plano ou (custom) número de usuários (apenas primary user). */
export async function putMyTenantPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({ error: 'Apenas o administrador da conta pode alterar o plano' });
      return;
    }
    const body = putMyTenantPlanSchema.parse(req.body || {});

    const tenantRow = await pool.query(
      'SELECT plan_id, max_users_override FROM tenants WHERE id = $1',
      [ctx.tenantId]
    );
    if (tenantRow.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const currentPlanId = tenantRow.rows[0].plan_id;
    const planId = body.plan_id ?? currentPlanId;

    const planRow = await pool.query(
      'SELECT id, plan_type, is_free, free_access_days FROM plans WHERE id = $1',
      [planId]
    );
    if (planRow.rows.length === 0) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const plan = planRow.rows[0];

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.plan_id !== undefined) {
      updates.push(`plan_id = $${i}`);
      values.push(planId);
      i++;
      if (plan.is_free && plan.free_access_days) {
        updates.push(`trial_ends_at = now() + ($${i}::int || ' days')::interval`);
        values.push(plan.free_access_days);
        i++;
      } else {
        updates.push('trial_ends_at = NULL');
      }
    }

    if (plan.plan_type === 'custom' && body.users_count !== undefined) {
      updates.push(`max_users_override = $${i}`);
      values.push(body.users_count);
      i++;
    }

    if (updates.length > 0) {
      values.push(ctx.tenantId);
      await pool.query(
        `UPDATE tenants SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
        values
      );
    }

    const updated = await pool.query(
      `SELECT t.*, p.name AS plan_name, p.slug AS plan_slug, p.plan_type, p.is_free, p.free_access_days
       FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [ctx.tenantId]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putMyTenantPlan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
