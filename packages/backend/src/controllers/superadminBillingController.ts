/**
 * Super Admin – relatórios e configurações de cobrança (Billing Engine Fase 3).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { getBillingSettings, updateBillingSettings } from '../services/billingSettingsService.js';
import {
  getSubscriptionCyclesSuperadminSettings,
  updateSubscriptionCyclesSuperadminSettings,
} from '../services/subscriptionCyclesSuperadminSettingsService.js';
import {
  getBillingRecurringJobsStatusSummary,
  listBillingRecurringJobsForOps,
} from '../services/billingRecurringJobsOpsService.js';
import { getBillingOpsHeartbeats } from '../services/billingOpsHeartbeatService.js';
import { z } from 'zod';

/** GET /api/superadmin/billing/subscriptions – assinaturas ativas (saas). */
export async function getBillingSubscriptions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT s.id, s.tenant_id, s.plan_id, s.amount_cents, s.billing_interval, s.status, s.next_billing_date,
              s.current_period_start, s.current_period_end, s.cancel_at_period_end, s.last_job_at, s.created_at,
              t.company_name AS tenant_name,
              p.name AS plan_name
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.type = 'saas'
       ORDER BY s.next_billing_date ASC`
    );
    res.json({ subscriptions: r.rows });
  } catch (e: any) {
    console.error('[getBillingSubscriptions]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar assinaturas' });
  }
}

/** GET /api/superadmin/billing/upcoming – próximas cobranças (next_billing_date nos próximos N dias). */
export async function getBillingUpcoming(req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || 30), 10) || 30));
    const r = await pool.query(
      `SELECT s.id, s.tenant_id, s.plan_id, s.amount_cents, s.billing_interval, s.next_billing_date,
              t.company_name AS tenant_name, p.name AS plan_name
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.type = 'saas' AND s.status = 'active'
         AND s.next_billing_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int || ' days')::interval
       ORDER BY s.next_billing_date ASC`,
      [days]
    );
    res.json({ upcoming: r.rows, days });
  } catch (e: any) {
    console.error('[getBillingUpcoming]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar próximas cobranças' });
  }
}

/** GET /api/superadmin/billing/jobs-failed – jobs com status failed. */
export async function getBillingJobsFailed(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    const r = await pool.query(
      `SELECT j.id, j.subscription_id, j.tenant_id, j.cycle_key, j.scheduled_at, j.attempts, j.max_attempts,
              j.error_message, j.created_at, j.updated_at,
              t.company_name AS tenant_name
       FROM billing_recurring_jobs j
       JOIN tenants t ON t.id = j.tenant_id
       WHERE j.status = 'failed'
       ORDER BY j.updated_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ jobs: r.rows });
  } catch (e: any) {
    console.error('[getBillingJobsFailed]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar jobs com falha' });
  }
}

/** GET /api/superadmin/billing/settings – configurações de cobrança. */
export async function getBillingSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const settings = await getBillingSettings();
    res.json(settings);
  } catch (e: any) {
    console.error('[getBillingSettings]', e);
    res.status(500).json({ error: e.message || 'Erro ao carregar configurações' });
  }
}

const updateSettingsSchema = z.object({
  grace_period_days: z.number().int().min(0).max(90).optional(),
  auto_suspend_enabled: z.boolean().optional(),
});

/** GET /api/superadmin/billing/recurring-jobs — diagnóstico operacional (CRM + SaaS). */
export async function getBillingRecurringJobsOps(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 100), 10) || 100));
    const windowDays = Math.min(365, Math.max(1, parseInt(String(req.query.window_days || 30), 10) || 30));
    const sinceDaysRaw = req.query.since_days;
    const sinceDays =
      sinceDaysRaw === undefined || sinceDaysRaw === ''
        ? null
        : Math.min(365, Math.max(1, parseInt(String(sinceDaysRaw), 10) || 30));
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const [summary, jobs, process_heartbeats] = await Promise.all([
      getBillingRecurringJobsStatusSummary(windowDays),
      listBillingRecurringJobsForOps({ limit, status, since_days: sinceDays }),
      getBillingOpsHeartbeats(),
    ]);
    res.json({
      summary,
      jobs,
      process_heartbeats,
      query: { limit, window_days: windowDays, since_days: sinceDays, status },
    });
  } catch (e: any) {
    console.error('[getBillingRecurringJobsOps]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar jobs de recorrência' });
  }
}

/** PUT /api/superadmin/billing/settings – atualizar configurações de cobrança. */
export async function putBillingSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const settings = await updateBillingSettings(parsed.data);
    res.json(settings);
  } catch (e: any) {
    console.error('[putBillingSettings]', e);
    res.status(500).json({ error: e.message || 'Erro ao salvar configurações' });
  }
}

const subscriptionCyclesFlagsSchema = z.object({
  subscription_cycles_read: z.boolean(),
  subscription_cycles_write: z.boolean(),
});

/** GET /api/superadmin/billing/subscription-cycles-flags */
export async function getSubscriptionCyclesFlagsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const settings = await getSubscriptionCyclesSuperadminSettings();
    res.json(settings);
  } catch (e: any) {
    console.error('[getSubscriptionCyclesFlags]', e);
    res.status(500).json({ error: e.message || 'Erro ao carregar flags de ciclos' });
  }
}

/** PUT /api/superadmin/billing/subscription-cycles-flags */
export async function putSubscriptionCyclesFlagsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = subscriptionCyclesFlagsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const settings = await updateSubscriptionCyclesSuperadminSettings(parsed.data);
    res.json(settings);
  } catch (e: any) {
    console.error('[putSubscriptionCyclesFlags]', e);
    res.status(500).json({ error: e.message || 'Erro ao salvar flags de ciclos' });
  }
}
