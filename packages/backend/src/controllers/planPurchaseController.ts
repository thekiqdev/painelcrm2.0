/**
 * POST /api/plan-purchase — compra de plano (self-service).
 * Fase 3: cria fatura sem gateway; retorna billing_id, invoice_number, amount_cents, status.
 * Pode ser chamado logado (usa req.tenantId) ou não logado (cria tenant temporário com status payment_pending).
 */
import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { subscribePlan } from '../services/subscriptionService.js';
import { createTenantAdminUser } from '../services/tenantAdminService.js';

const planPurchaseBodySchema = z.object({
  plan_id: z.string().uuid(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional().default('monthly'),
  users_count: z.number().int().min(1).optional().nullable(),
  tenant_id: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
  company_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  cpf_cnpj: z.string().optional(),
  phone: z.string().optional(),
  responsible_name: z.string().optional(),
});

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'empresa';
  return base;
}

/**
 * Resolve tenant: req.tenantId (logado), body.tenant_id (se existir) ou cria novo com status payment_pending.
 */
async function resolveTenantId(
  req: AuthRequest,
  body: z.infer<typeof planPurchaseBodySchema>,
  planId: string,
  usersCount: number | null
): Promise<{ tenantId: string; isNewTenant: boolean }> {
  if (req.tenantId) {
    return { tenantId: req.tenantId, isNewTenant: false };
  }

  if (body.tenant_id) {
    const row = await pool.query(
      'SELECT id FROM tenants WHERE id = $1 AND status IN ($2, $3)',
      [body.tenant_id, 'trial', 'payment_pending']
    );
    if (row.rows.length > 0) {
      return { tenantId: body.tenant_id, isNewTenant: false };
    }
  }

  const name = (body.company_name ?? body.name)?.trim();
  if (!name) {
    throw new Error('Quando não logado, informe "name" ou "company_name" (nome da empresa) para criar a conta, ou "tenant_id" se já tiver uma conta pendente.');
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 0;
  for (;;) {
    const exists = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (exists.rows.length === 0) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const created = await pool.query<{ id: string }>(
    `INSERT INTO tenants (name, slug, plan_id, status, created_via, billing_email, billing_phone, cpf_cnpj, responsible_name)
     VALUES ($1, $2, $3, 'payment_pending', 'registration', $4, $5, $6, $7)
     RETURNING id`,
    [
      name,
      slug,
      planId,
      body.email?.trim() ?? null,
      body.phone?.trim() ?? null,
      body.cpf_cnpj?.replace(/\D/g, '') || null,
      body.responsible_name?.trim() ?? null,
    ]
  );
  const tenantId = created.rows[0].id;

  if (usersCount != null && usersCount > 0) {
    await pool.query(
      'UPDATE tenants SET max_users_override = $1, updated_at = now() WHERE id = $2',
      [usersCount, tenantId]
    );
  }

  const adminEmail = body.email?.trim();
  if (adminEmail) {
    try {
      await createTenantAdminUser({
        tenantId,
        tenantName: name,
        email: adminEmail,
        responsibleName: body.responsible_name?.trim(),
      });
    } catch (err) {
      console.error('[plan-purchase] createTenantAdminUser', err);
    }
  }

  return { tenantId, isNewTenant: true };
}

export async function postPlanPurchase(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = planPurchaseBodySchema.parse(req.body || {});

    const usersCount = body.users_count ?? null;
    const { tenantId, isNewTenant } = await resolveTenantId(req, body, body.plan_id, usersCount);

    const result = await subscribePlan(tenantId, body.plan_id, body.billing_interval, {
      usersCount,
      source: 'self_service',
      billingReason: 'plan_purchase',
      paymentMethod: body.payment_method ?? 'BOLETO',
    });

    if (!isNewTenant) {
      await pool.query(
        `UPDATE tenants
         SET plan_id = $1, status = 'payment_pending',
             max_users_override = COALESCE($2, max_users_override),
             billing_email = COALESCE($4, billing_email),
             billing_phone = COALESCE($5, billing_phone),
             cpf_cnpj = COALESCE($6, cpf_cnpj),
             responsible_name = COALESCE($7, responsible_name),
             updated_at = now()
         WHERE id = $3`,
        [
          body.plan_id,
          usersCount,
          tenantId,
          body.email?.trim() ?? null,
          body.phone?.trim() ?? null,
          body.cpf_cnpj?.replace(/\D/g, '') || null,
          body.responsible_name?.trim() ?? null,
        ]
      );
    }

    const b = result.billing;
    const response: Record<string, unknown> = {
      billing_id: b.id,
      invoice_number: b.invoice_number,
      amount_cents: b.amount_cents,
      status: b.status,
      tenant_id: tenantId,
      payment_method: b.payment_method ?? undefined,
    };
    if (result.paymentUrls?.invoiceUrl) response.invoice_url = result.paymentUrls.invoiceUrl;
    if (result.paymentUrls?.bankSlipUrl) response.bank_slip_url = result.paymentUrls.bankSlipUrl;
    if (result.paymentUrls?.pixQrCode) response.pix_qr_code = result.paymentUrls.pixQrCode;
    if (result.paymentUrls?.pixCopyPaste) response.pix_copy_paste = result.paymentUrls.pixCopyPaste;
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : 'Erro ao processar compra';
    if (message.includes('não encontrado') || message.includes('inativo') || message.includes('exigem')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('postPlanPurchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
