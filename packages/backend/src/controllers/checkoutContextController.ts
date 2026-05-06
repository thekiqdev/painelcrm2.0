/**
 * GET /api/me/tenant/checkout-context — dados para retomada do checkout (trial expirado).
 * Montado fora de tenantAuth para permitir tenant suspenso por trial.
 */
import type { Response } from 'express';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { isCheckoutResumeV1Enabled } from '../config/checkoutTrialFeatureFlags.js';
import { effectiveCheckoutTrialDays } from '../utils/checkoutTrialPlan.js';

export async function getCheckoutContext(req: AuthRequest, res: Response): Promise<void> {
  try {
    const purpose = String((req.query as { purpose?: string }).purpose ?? '').trim();
    /** Checkout de assentos adicionais: conta já ativa; não é “retomada” — libera mesmo com CHECKOUT_RESUME_V1 off. */
    const forSeatAddonCheckout = purpose === 'seat_addon';
    /** Hub Meu plano /checkout?mode=renew — dados da empresa para pagamento sem refazer cadastro (tenant já existe). */
    const forPlanRenewalHub = purpose === 'renew';

    if (!isCheckoutResumeV1Enabled() && !forSeatAddonCheckout && !forPlanRenewalHub) {
      res.status(403).json({
        error:
          'Retomada de checkout está desligada no servidor. Defina CHECKOUT_RESUME_V1=true no .env da API e reinicie.',
        code: 'CHECKOUT_RESUME_V1_DISABLED',
      });
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa obrigatória', code: 'TENANT_REQUIRED' });
      return;
    }

    const tRow = await pool.query<{
      name: string;
      plan_id: string;
      status: string;
      suspension_reason: string | null;
      trial_ends_at: string | null;
      activated_billing_id: string | null;
      billing_email: string | null;
      billing_phone: string | null;
      cpf_cnpj: string | null;
      responsible_name: string | null;
      max_users_override: number | null;
    }>(
      `SELECT name, plan_id, status, suspension_reason, trial_ends_at, activated_billing_id,
              billing_email, billing_phone, cpf_cnpj, responsible_name, max_users_override
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (tRow.rows.length === 0) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }
    const t = tRow.rows[0];

    const trialEndedUnpaid =
      t.status === 'trial' &&
      t.trial_ends_at != null &&
      new Date(t.trial_ends_at) < new Date() &&
      t.activated_billing_id == null;

    /** Trial ainda vigente: permitir “pagar antes do fim” sem refazer cadastro empresa/admin. */
    const trialActivePayEarly =
      t.status === 'trial' &&
      (t.trial_ends_at == null || new Date(t.trial_ends_at) >= new Date());

    const canResume =
      (t.status === 'suspended' && t.suspension_reason === 'trial_expired') ||
      trialEndedUnpaid ||
      t.status === 'payment_pending' ||
      trialActivePayEarly;

    const canSeatAddonProfile = forSeatAddonCheckout && t.status === 'active';

    const canRenewalHubProfile =
      forPlanRenewalHub &&
      (t.status === 'active' ||
        t.status === 'payment_pending' ||
        t.status === 'trial' ||
        (t.status === 'suspended' && t.suspension_reason === 'trial_expired'));

    if (!canResume && !canSeatAddonProfile && !canRenewalHubProfile) {
      res.status(400).json({
        error: 'Retomada de checkout não aplicável a este estado da conta.',
        code: 'CHECKOUT_RESUME_NOT_APPLICABLE',
      });
      return;
    }

    const uRow = await pool.query<{ email: string; whatsapp_number: string | null }>(
      `SELECT email, whatsapp_number
       FROM users
       WHERE tenant_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [tenantId]
    );
    const admin = uRow.rows[0];

    const pRow = await pool.query<{
      id: string;
      name: string;
      plan_type: string;
      price_cents: number | null;
      trial_days: number | null;
      free_access_days: number | null;
      description: string | null;
      benefits: unknown;
      is_free: boolean;
      billing_interval: string;
    }>(
      `SELECT id, name, plan_type, price_cents, trial_days, free_access_days, description, benefits, is_free, billing_interval
       FROM plans WHERE id = $1 AND is_active = true`,
      [t.plan_id]
    );
    const plan = pRow.rows[0];
    if (!plan) {
      res.status(400).json({ error: 'Plano inválido para retomada.', code: 'INVALID_PLAN' });
      return;
    }
    /** Só o ramo “trial expirado / suspenso por trial” exige plano com trial de checkout; payment_pending e pagamento antecipado podem usar plano pago sem trial_days. */
    const requiresTrialPlanForResume =
      trialEndedUnpaid || (t.status === 'suspended' && t.suspension_reason === 'trial_expired');
    if (requiresTrialPlanForResume && effectiveCheckoutTrialDays(plan) < 1) {
      res.status(400).json({ error: 'Plano inválido para retomada.', code: 'INVALID_PLAN' });
      return;
    }

    const pricesRows =
      plan.plan_type === 'custom'
        ? await pool.query(
            'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
            [plan.id]
          )
        : { rows: [] as { billing_interval: string; price_per_user_cents: number }[] };

    const allowedIntervals = new Set(['monthly', 'quarterly', 'semi_annual', 'yearly']);
    const billingInterval = allowedIntervals.has(plan.billing_interval) ? plan.billing_interval : 'monthly';

    res.json({
      tenant_id: tenantId,
      company_name: t.name,
      email: admin?.email ?? t.billing_email ?? '',
      whatsapp: admin?.whatsapp_number ?? t.billing_phone ?? '',
      responsible_name: t.responsible_name ?? '',
      cpf_cnpj: t.cpf_cnpj != null && String(t.cpf_cnpj).trim() !== '' ? String(t.cpf_cnpj).trim() : '',
      users_count: t.max_users_override ?? 1,
      billing_interval: billingInterval,
      plan: {
        id: plan.id,
        name: plan.name,
        plan_type: plan.plan_type,
        price_cents: plan.price_cents ?? 0,
        trial_days: effectiveCheckoutTrialDays(plan),
        description: plan.description,
        benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
        interval_prices: pricesRows.rows,
      },
      requires_payment: true,
    });
  } catch (e) {
    console.error('getCheckoutContext error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
