import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { FEATURE_KEYS, isValidFeatureKey } from '../constants/features.js';
import { logSuperAdminAction, insertTenantPlanHistory } from '../services/auditLogService.js';
import { notifySuperAdminsNewTenant } from '../services/superadminNotificationsService.js';
import { checkTenantUsersLimit, checkTenantProfilesLimit, checkTenantWhatsAppInstancesLimit } from '../services/tenantLimitService.js';
import { getActiveGateway, getActiveAsaasConfigForSaas } from '../modules/payments/gatewayProvider.js';
import { getActiveConfig } from '../services/paymentGatewayConfigService.js';
import { ensureCustomerForTenant } from '../modules/gateways/asaas/index.js';
import { z } from 'zod';

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug: apenas letras minúsculas, números e hífen'),
  domain: z.string().optional().nullable(),
  plan_id: z.string().uuid(),
  status: z.enum(['active', 'suspended', 'trial']).optional().default('active'),
  trial_ends_at: z.union([z.string(), z.null()]).optional().transform((v) => (v && v !== '' ? v : null)),
  timezone: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  max_users_override: z.number().int().min(0).optional().nullable(),
  max_whatsapp_instances_override: z.number().int().min(0).optional().nullable(),
});

const updateTenantSchema = createTenantSchema.partial();

export async function listTenants(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.slug, t.domain, t.plan_id, t.status, t.trial_ends_at, t.created_at, t.updated_at,
        p.name AS plan_name, p.slug AS plan_slug,
        (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users_count,
        (SELECT u.id FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1) AS primary_user_id,
        (SELECT u.email FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1) AS primary_contact_email,
        (SELECT TRIM(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')) FROM users u JOIN profiles pr ON pr.id = u.id WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1) AS primary_contact_name
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       ORDER BY t.created_at DESC, t.name ASC`
    );
    const rows = result.rows;
    let withCreatedVia: Record<string, unknown>[] = rows;
    if (rows.length > 0) {
      try {
        const withVia = await pool.query(
          `SELECT id, created_via FROM tenants WHERE id = ANY($1::uuid[])`,
          [rows.map((r: { id: string }) => r.id)]
        );
        const viaMap = new Map(withVia.rows.map((r: { id: string; created_via: string }) => [r.id, r.created_via]));
        withCreatedVia = rows.map((r: Record<string, unknown>) => ({ ...r, created_via: viaMap.get(r.id as string) ?? 'superadmin' }));
      } catch {
        withCreatedVia = rows.map((r: Record<string, unknown>) => ({ ...r, created_via: 'superadmin' }));
      }
    }
    res.json(withCreatedVia);
  } catch (error: any) {
    console.error('listTenants error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getTenant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT t.*, p.name AS plan_name, p.slug AS plan_slug
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const usersCount = await pool.query(
      'SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1',
      [id]
    );
    const tenant = result.rows[0];
    tenant.users_count = usersCount.rows[0]?.c ?? 0;
    res.json(tenant);
  } catch (error: any) {
    console.error('getTenant error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function createTenant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = createTenantSchema.parse(req.body);
    const slug = body.slug.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Já existe um cliente com este slug' });
      return;
    }
    const planCheck = await pool.query('SELECT id FROM plans WHERE id = $1', [body.plan_id]);
    if (planCheck.rows.length === 0) {
      res.status(400).json({ error: 'Plano não encontrado' });
      return;
    }
    const trialEndsAt = body.trial_ends_at
      ? (typeof body.trial_ends_at === 'string' ? new Date(body.trial_ends_at) : body.trial_ends_at)
      : null;
    const result = await pool.query(
      `INSERT INTO tenants (name, slug, domain, plan_id, status, trial_ends_at, max_users_override, max_whatsapp_instances_override)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        body.name.trim(),
        slug,
        body.domain?.trim() || null,
        body.plan_id,
        body.status,
        trialEndsAt,
        body.max_users_override ?? null,
        body.max_whatsapp_instances_override ?? null,
      ]
    );
    const tenant = result.rows[0];
    await insertTenantPlanHistory(tenant.id, body.plan_id);
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'tenant.created', 'tenant', tenant.id, {
        name: tenant.name,
        slug: tenant.slug,
        plan_id: body.plan_id,
        status: body.status,
      });
    }
    notifySuperAdminsNewTenant(tenant.name, tenant.id).catch(() => {});
    res.status(201).json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('createTenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateTenant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateTenantSchema.parse(req.body);
    const tenantResult = await pool.query('SELECT id, plan_id, status FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const current = tenantResult.rows[0];
    if (body.slug !== undefined) {
      const slug = body.slug.trim().toLowerCase();
      const existing = await pool.query('SELECT id FROM tenants WHERE slug = $1 AND id != $2', [slug, id]);
      if (existing.rows.length > 0) {
        res.status(400).json({ error: 'Já existe outro cliente com este slug' });
        return;
      }
    }
    if (body.plan_id !== undefined) {
      const planCheck = await pool.query('SELECT id FROM plans WHERE id = $1', [body.plan_id]);
      if (planCheck.rows.length === 0) {
        res.status(400).json({ error: 'Plano não encontrado' });
        return;
      }
    }
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    const fields: (keyof typeof body)[] = ['name', 'slug', 'domain', 'plan_id', 'status', 'trial_ends_at', 'timezone', 'locale', 'logo_url'];
    for (const key of fields) {
      if (body[key] !== undefined) {
        updates.push(`${key} = $${i}`);
        if (key === 'slug') {
          values.push((body[key] as string).trim().toLowerCase());
        } else if (key === 'trial_ends_at') {
          const v = body[key];
          values.push(v == null || v === '' ? null : new Date(v as string));
        } else if (key === 'timezone' || key === 'locale' || key === 'logo_url') {
          const v = body[key];
          values.push(v == null || v === '' ? null : v);
        } else {
          values.push(body[key]);
        }
        i++;
      }
    }
    if (updates.length === 0) {
      const r = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
      res.json(r.rows[0]);
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
      values
    );
    const updated = result.rows[0];
    if (body.plan_id !== undefined && body.plan_id !== current.plan_id) {
      await insertTenantPlanHistory(id, body.plan_id);
    }
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'tenant.updated', 'tenant', id, {
        changes: body,
        previous_plan_id: current.plan_id,
        previous_status: current.status,
      });
    }
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('updateTenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteTenant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const row = await pool.query('SELECT id, name FROM tenants WHERE id = $1', [id]);
    if (row.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'tenant.deleted', 'tenant', id, { name: row.rows[0].name });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('deleteTenant error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const updatePrimaryUserSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
});

/** GET /tenants/:id/primary-user - Dados do primeiro usuário (contato) da empresa */
export async function getPrimaryUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const userResult = await pool.query(
      `SELECT u.id, u.email FROM users u WHERE u.tenant_id = $1 ORDER BY u.created_at ASC LIMIT 1`,
      [id]
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Nenhum usuário vinculado a esta empresa.' });
      return;
    }
    const user = userResult.rows[0];
    const profileResult = await pool.query(
      'SELECT first_name, last_name, company_name FROM profiles WHERE id = $1',
      [user.id]
    );
    const profile = profileResult.rows[0] || {};
    res.json({
      id: user.id,
      email: user.email,
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      company_name: profile.company_name ?? '',
    });
  } catch (error: any) {
    console.error('getPrimaryUser error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** PUT /tenants/:id/primary-user - Atualiza e-mail e perfil do primeiro usuário da empresa */
export async function updatePrimaryUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = updatePrimaryUserSchema.parse(req.body);
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const userResult = await pool.query(
      'SELECT u.id FROM users u WHERE u.tenant_id = $1 ORDER BY u.created_at ASC LIMIT 1',
      [id]
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Nenhum usuário vinculado a esta empresa.' });
      return;
    }
    const userId = userResult.rows[0].id;
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      const existing = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (existing.rows.length > 0) {
        res.status(400).json({ error: 'Este e-mail já está em uso por outro usuário.' });
        return;
      }
      await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email, userId]);
    }
    const profileFields = ['first_name', 'last_name', 'company_name'] as const;
    const hasProfileUpdate = profileFields.some((k) => body[k] !== undefined);
    if (hasProfileUpdate) {
      const profileRow = await pool.query('SELECT id FROM profiles WHERE id = $1', [userId]);
      if (profileRow.rows.length === 0) {
        await pool.query(
          `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
           VALUES ($1, $2, $3, $4, '', false)`,
          [
            userId,
            body.first_name ?? '',
            body.last_name ?? '',
            body.company_name ?? '',
          ]
        );
      } else {
        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;
        for (const key of profileFields) {
          if (body[key] !== undefined) {
            updates.push(`${key} = $${i}`);
            values.push(body[key]);
            i++;
          }
        }
        if (updates.length > 0) {
          values.push(userId);
          await pool.query(
            `UPDATE profiles SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
            values
          );
        }
      }
    }
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'tenant.primary_user_updated', 'tenant', id, { user_id: userId, changes: body });
    }
    const updated = await pool.query(
      `SELECT u.id, u.email, p.first_name, p.last_name, p.company_name
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = $1`,
      [userId]
    );
    const row = updated.rows[0];
    res.json({
      id: row.id,
      email: row.email,
      first_name: row.first_name ?? '',
      last_name: row.last_name ?? '',
      company_name: row.company_name ?? '',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('updatePrimaryUser error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const putTenantFeaturesSchema = z.object({
  features: z.record(z.string(), z.boolean()),
});

/** GET /tenants/:id/features - features do plano + overrides (plan_features, overrides e effective) */
export async function getTenantFeatures(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query(
      'SELECT t.id, t.plan_id, p.name AS plan_name FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1',
      [id]
    );
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const { plan_id: planId, plan_name: planName } = tenantResult.rows[0];
    const planFeatures = await pool.query(
      'SELECT feature_key, enabled FROM plan_features WHERE plan_id = $1',
      [planId]
    );
    const overridesRows = await pool.query(
      'SELECT feature_key, enabled FROM tenant_feature_overrides WHERE tenant_id = $1',
      [id]
    );
    const plan_features: Record<string, boolean> = {};
    const overrides: Record<string, boolean> = {};
    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
      const planRow = planFeatures.rows.find((r: { feature_key: string }) => r.feature_key === key);
      plan_features[key] = planRow ? planRow.enabled === true : false;
      const override = overridesRows.rows.find((r: { feature_key: string }) => r.feature_key === key);
      if (override !== undefined) {
        overrides[key] = override.enabled === true;
        features[key] = override.enabled === true;
      } else {
        features[key] = plan_features[key];
      }
    }
    res.json({
      tenant_id: id,
      plan_id: planId,
      plan_name: planName,
      plan_features,
      overrides,
      features,
    });
  } catch (error: any) {
    console.error('getTenantFeatures error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** GET /tenants/:id/plan-history - histórico de planos do tenant (tenant_plan) */
export async function getTenantPlanHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const result = await pool.query(
      `SELECT tp.id, tp.plan_id, tp.starts_at, tp.ends_at, tp.created_at, p.name AS plan_name, p.slug AS plan_slug
       FROM tenant_plan tp
       JOIN plans p ON p.id = tp.plan_id
       WHERE tp.tenant_id = $1
       ORDER BY tp.starts_at DESC`,
      [id]
    );
    res.json({ tenant_id: id, history: result.rows });
  } catch (error: any) {
    console.error('getTenantPlanHistory error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** GET /tenants/:id/users - lista usuários do tenant (nome, email, role, último acesso) */
export async function getTenantUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const result = await pool.query(
      `SELECT u.id, u.email, u.is_super_admin,
        TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS full_name,
        (SELECT MAX(s.last_used_at) FROM sessions s WHERE s.user_id = u.id) AS last_used_at,
        (SELECT ur.role::text FROM user_roles ur
         JOIN user_profiles up ON up.id = ur.profile_id AND up.owner_id = u.id
         WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.tenant_id = $1
       ORDER BY u.created_at ASC`,
      [id]
    );
    const rows = result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      email: r.email,
      full_name: (r.full_name as string)?.trim() || null,
      last_used_at: r.last_used_at,
      role: r.role || null,
      is_super_admin: r.is_super_admin === true,
    }));
    res.json(rows);
  } catch (error: any) {
    console.error('getTenantUsers error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** GET /tenants/:id/usage - uso atual, limites do plano e overrides por tenant */
export async function getTenantUsage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query(
      `SELECT t.id, t.plan_id,
        t.max_users_override, t.max_profiles_override, t.max_whatsapp_instances_override,
        p.max_users, p.max_profiles, p.max_whatsapp_instances
       FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [id]
    );
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const row = tenantResult.rows[0];
    const [usersLimit, profilesLimit, whatsappLimit] = await Promise.all([
      checkTenantUsersLimit(id),
      checkTenantProfilesLimit(id),
      checkTenantWhatsAppInstancesLimit(id),
    ]);
    let contactsCount: number | null = null;
    try {
      const leadsRow = await pool.query(
        'SELECT COUNT(*)::int AS c FROM leads l JOIN users u ON u.id = l.user_id WHERE u.tenant_id = $1',
        [id]
      );
      contactsCount = leadsRow.rows[0]?.c ?? 0;
    } catch {
      // leads table may not exist in some setups
    }
    res.json({
      users: { current: usersLimit.current, limit: usersLimit.limit },
      profiles: { current: profilesLimit.current, limit: profilesLimit.limit },
      whatsapp_instances: { current: whatsappLimit.current, limit: whatsappLimit.limit },
      storage_mb: null,
      contacts_count: contactsCount,
      plan_limits: {
        max_users: row.max_users,
        max_profiles: row.max_profiles,
        max_whatsapp_instances: row.max_whatsapp_instances,
      },
      overrides: {
        max_users: row.max_users_override,
        max_profiles: row.max_profiles_override,
        max_whatsapp_instances: row.max_whatsapp_instances_override,
      },
    });
  } catch (error: any) {
    console.error('getTenantUsage error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const putTenantLimitsSchema = z.object({
  max_users: z.number().int().min(0).nullable().optional(),
  max_profiles: z.number().int().min(0).nullable().optional(),
  max_whatsapp_instances: z.number().int().min(0).nullable().optional(),
});

/** PUT /tenants/:id/limits - define limites personalizados (overrides) para o tenant */
export async function putTenantLimits(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = putTenantLimitsSchema.parse(req.body);
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (body.max_users !== undefined) {
      updates.push(`max_users_override = $${i++}`);
      values.push(body.max_users);
    }
    if (body.max_profiles !== undefined) {
      updates.push(`max_profiles_override = $${i++}`);
      values.push(body.max_profiles);
    }
    if (body.max_whatsapp_instances !== undefined) {
      updates.push(`max_whatsapp_instances_override = $${i++}`);
      values.push(body.max_whatsapp_instances);
    }
    if (updates.length === 0) {
      const r = await pool.query(
        `SELECT max_users_override, max_profiles_override, max_whatsapp_instances_override FROM tenants WHERE id = $1`,
        [id]
      );
      return void res.json({ overrides: r.rows[0] });
    }
    values.push(id);
    await pool.query(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
      values
    );
    const r = await pool.query(
      `SELECT max_users_override, max_profiles_override, max_whatsapp_instances_override FROM tenants WHERE id = $1`,
      [id]
    );
    res.json({ overrides: r.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putTenantLimits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /tenants/:id/billing - plano atual, próxima cobrança, histórico de cobranças */
export async function getTenantBilling(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query(
      `SELECT t.id, t.plan_id, t.max_users_override,
        p.name AS plan_name, p.slug AS plan_slug, p.plan_type AS plan_plan_type,
        p.price_cents AS plan_price_cents, p.billing_interval AS plan_billing_interval, p.max_users AS plan_max_users
       FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [id]
    );
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const row = tenantResult.rows[0];
    const planPayload: Record<string, unknown> = {
      id: row.plan_id,
      name: row.plan_name,
      slug: row.plan_slug,
      price_cents: row.plan_price_cents,
      billing_interval: row.plan_billing_interval,
      plan_type: row.plan_plan_type || 'standard',
    };
    if (row.plan_plan_type === 'custom') {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [row.plan_id]
      );
      planPayload.interval_prices = pricesRows.rows;
      planPayload.contracted_users =
        row.max_users_override != null
          ? Number(row.max_users_override)
          : (row.plan_max_users != null ? Number(row.plan_max_users) : 1);
    }
    const nextResult = await pool.query(
      `SELECT id, due_date, amount_cents, status, invoice_number, created_at
       FROM tenant_billing WHERE tenant_id = $1 AND status = 'pending' ORDER BY due_date ASC LIMIT 1`,
      [id]
    );
    const historyResult = await pool.query(
      `SELECT b.id, b.due_date, b.amount_cents, b.status, b.paid_at, b.invoice_number, b.created_at, p.name AS plan_name
       FROM tenant_billing b LEFT JOIN plans p ON p.id = b.plan_id WHERE b.tenant_id = $1 ORDER BY b.due_date DESC LIMIT 50`,
      [id]
    );
    res.json({
      plan: planPayload,
      next_charge: nextResult.rows[0] || null,
      history: historyResult.rows,
    });
  } catch (error: any) {
    console.error('getTenantBilling error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const createTenantChargeSchema = z.object({
  due_date: z.string().optional(),
  amount_cents: z.number().int().min(0).optional(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional(),
});

/** POST /tenants/:id/billing/charge - gerar cobrança (pendente); para plano custom calcula amount por usuário */
export async function createTenantCharge(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = createTenantChargeSchema.parse(req.body || {});
    const tenantResult = await pool.query(
      `SELECT t.id, t.plan_id, t.max_users_override,
        p.plan_type, p.price_cents, p.billing_interval AS plan_billing_interval, p.max_users AS plan_max_users
       FROM tenants t JOIN plans p ON p.id = t.plan_id WHERE t.id = $1`,
      [id]
    );
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const row = tenantResult.rows[0];
    const planId = row.plan_id;
    const planType = row.plan_type || 'standard';
    const billingInterval = body.billing_interval ?? row.plan_billing_interval ?? 'monthly';

    let amount: number;
    if (planType === 'custom') {
      const contractedUsers = row.max_users_override != null
        ? Number(row.max_users_override)
        : (row.plan_max_users != null ? Number(row.plan_max_users) : 1);
      const priceRow = await pool.query(
        'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
        [planId, billingInterval]
      );
      if (priceRow.rows.length === 0) {
        res.status(400).json({
          error: `Plano personalizado sem preço para o intervalo "${billingInterval}". Defina interval_prices para este plano.`,
        });
        return;
      }
      const pricePerUser = priceRow.rows[0].price_per_user_cents;
      amount = body.amount_cents ?? Math.max(0, pricePerUser * contractedUsers);
    } else {
      amount = body.amount_cents ?? row.price_cents ?? 0;
    }

    let dueDate: Date;
    if (body.due_date) {
      dueDate = new Date(body.due_date);
      if (isNaN(dueDate.getTime())) {
        res.status(400).json({ error: 'Data de vencimento inválida' });
        return;
      }
    } else {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      dueDate = d;
    }
    const dueDateStr = dueDate.toISOString().slice(0, 10);
    const invoiceNumber = `INV-${id.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
    const idempotencyKey = `saas_${id}_${planId}_${dueDateStr}`;

    const existing = await pool.query(
      `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
        gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key, created_at
       FROM tenant_billing WHERE idempotency_key = $1 AND asaas_payment_id IS NOT NULL`,
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      res.status(200).json(existing.rows[0]);
      return;
    }

    const config = await getActiveConfig('saas');
    const gateway = await getActiveGateway({ billingType: 'saas' });
    const asaasConfig = await getActiveAsaasConfigForSaas();
    const gatewayKey = config?.gateway_key ?? 'asaas';

    let chargeResult: { paymentId: string; status: string; invoiceUrl?: string; bankSlipUrl?: string; pixQrCode?: string; pixCopyPaste?: string } | null = null;
    if (gateway) {
      try {
        const customerId = await ensureCustomerForTenant(id, asaasConfig ?? undefined);
        chargeResult = await gateway.createCharge({
          customerId,
          amountCents: amount,
          dueDate: dueDateStr,
          paymentMethod: 'BOLETO',
          description: invoiceNumber,
          idempotencyKey,
          externalReference: id,
        });
      } catch (err) {
        console.error('createTenantCharge gateway error:', err);
      }
    }

    const insert = await pool.query(
      `INSERT INTO tenant_billing (
        tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
        gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
      RETURNING id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
        gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key, created_at`,
      [
        id,
        planId,
        billingInterval,
        amount,
        dueDate,
        invoiceNumber,
        gatewayKey,
        chargeResult ? 'BOLETO' : null,
        chargeResult?.paymentId ?? null,
        chargeResult?.status ?? null,
        idempotencyKey,
      ]
    );
    const createdCharge = insert.rows[0];
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'tenant.billing_created', 'tenant', id, {
        billing_id: createdCharge.id,
        amount_cents: createdCharge.amount_cents,
        due_date: createdCharge.due_date,
        asaas_payment_id: createdCharge.asaas_payment_id ?? undefined,
      });
    }
    const response: Record<string, unknown> = { ...createdCharge };
    if (chargeResult?.invoiceUrl) response.invoiceUrl = chargeResult.invoiceUrl;
    if (chargeResult?.bankSlipUrl) response.bankSlipUrl = chargeResult.bankSlipUrl;
    if (chargeResult?.pixQrCode) response.pixQrCode = chargeResult.pixQrCode;
    if (chargeResult?.pixCopyPaste) response.pixCopyPaste = chargeResult.pixCopyPaste;
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('createTenantCharge error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** PUT /tenants/:id/features - body: { features: { "dashboard": true, ... } } (apenas overrides) */
export async function putTenantFeatures(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = putTenantFeaturesSchema.parse(req.body);
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    await pool.query('BEGIN');
    try {
      for (const [key, enabled] of Object.entries(body.features)) {
        if (!isValidFeatureKey(key)) continue;
        await pool.query(
          `INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id, feature_key)
         DO UPDATE SET enabled = $3, updated_at = now()`,
          [id, key, enabled]
        );
      }
      await pool.query('COMMIT');
    } catch (txError) {
      await pool.query('ROLLBACK');
      throw txError;
    }
    const overrides = await pool.query(
      'SELECT feature_key, enabled FROM tenant_feature_overrides WHERE tenant_id = $1',
      [id]
    );
    const planFeatures = await pool.query(
      'SELECT feature_key, enabled FROM plan_features WHERE plan_id = (SELECT plan_id FROM tenants WHERE id = $1)',
      [id]
    );
    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
      const override = overrides.rows.find((r: { feature_key: string }) => r.feature_key === key);
      if (override !== undefined) {
        features[key] = override.enabled === true;
      } else {
        const planRow = planFeatures.rows.find((r: { feature_key: string }) => r.feature_key === key);
        features[key] = planRow ? planRow.enabled === true : false;
      }
    }
    res.json({ tenant_id: id, features });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putTenantFeatures error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// --- Tenant admin notes and tags ---
const postTenantNoteSchema = z.object({ content: z.string().min(1), is_pinned: z.boolean().optional().default(false) });
const putTenantNoteSchema = z.object({ content: z.string().min(1).optional(), is_pinned: z.boolean().optional() });
const putTenantTagsSchema = z.object({ tags: z.array(z.string().min(1)).max(50) });

export async function getTenantNotes(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const result = await pool.query(
      `SELECT n.id, n.tenant_id, n.author_id, n.content, n.is_pinned, n.created_at, n.updated_at,
        u.email AS author_email
       FROM tenant_admin_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE n.tenant_id = $1
       ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [id]
    );
    res.json({ tenant_id: id, notes: result.rows });
  } catch (error: any) {
    console.error('getTenantNotes error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function postTenantNote(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    const body = postTenantNoteSchema.parse(req.body);
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const insert = await pool.query(
      `INSERT INTO tenant_admin_notes (tenant_id, author_id, content, is_pinned)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, author_id, content, is_pinned, created_at, updated_at`,
      [id, userId, body.content.trim(), body.is_pinned === true]
    );
    const row = insert.rows[0];
    const authorRow = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    res.status(201).json({ ...row, author_email: authorRow.rows[0]?.email ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('postTenantNote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function putTenantNote(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id, noteId } = req.params;
    const body = putTenantNoteSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    const existing = await pool.query(
      'SELECT id FROM tenant_admin_notes WHERE id = $1 AND tenant_id = $2',
      [noteId, id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Nota não encontrada' });
      return;
    }
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (body.content !== undefined) {
      updates.push(`content = $${i}`);
      values.push(body.content.trim());
      i++;
    }
    if (body.is_pinned !== undefined) {
      updates.push(`is_pinned = $${i}`);
      values.push(body.is_pinned);
      i++;
    }
    values.push(noteId);
    const result = await pool.query(
      `UPDATE tenant_admin_notes SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
      values
    );
    const row = result.rows[0];
    const authorRow = await pool.query('SELECT email FROM users WHERE id = $1', [row.author_id]);
    res.json({ ...row, author_email: authorRow.rows[0]?.email ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putTenantNote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteTenantNote(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id, noteId } = req.params;
    const result = await pool.query(
      'DELETE FROM tenant_admin_notes WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [noteId, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Nota não encontrada' });
      return;
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('deleteTenantNote error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const AUDIT_DEFAULT_LIMIT = 50;
const AUDIT_MAX_LIMIT = 200;

/** GET /tenants/:id/audit-log - log de auditoria filtrado por tenant */
export async function getTenantAuditLog(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(AUDIT_MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || AUDIT_DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    const actionFilter = typeof req.query.action === 'string' ? req.query.action.trim() : null;

    let whereClause = "a.entity_type = 'tenant' AND a.entity_id = $1";
    const params: any[] = [id];
    if (actionFilter) {
      params.push(actionFilter);
      whereClause += ` AND a.action = $${params.length}`;
    }
    params.push(limit, offset);

    const [rowsResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.payload, a.created_at,
                u.email AS user_email
         FROM super_admin_audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM super_admin_audit_log a WHERE ${whereClause}`,
        params.slice(0, params.length - 2)
      ),
    ]);

    const total = totalResult.rows[0]?.c ?? 0;
    res.json({
      tenant_id: id,
      items: rowsResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('getTenantAuditLog error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getTenantTags(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    const result = await pool.query(
      'SELECT id, tag, created_at FROM tenant_tags WHERE tenant_id = $1 ORDER BY tag',
      [id]
    );
    res.json({ tenant_id: id, tags: result.rows.map((r: { tag: string }) => r.tag) });
  } catch (error: any) {
    console.error('getTenantTags error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function putTenantTags(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = putTenantTagsSchema.parse(req.body);
    const tenantResult = await pool.query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    await pool.query('DELETE FROM tenant_tags WHERE tenant_id = $1', [id]);
    const tags = [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    for (const tag of tags) {
      await pool.query(
        'INSERT INTO tenant_tags (tenant_id, tag) VALUES ($1, $2) ON CONFLICT (tenant_id, tag) DO NOTHING',
        [id, tag]
      );
    }
    const result = await pool.query(
      'SELECT tag FROM tenant_tags WHERE tenant_id = $1 ORDER BY tag',
      [id]
    );
    res.json({ tenant_id: id, tags: result.rows.map((r: { tag: string }) => r.tag) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putTenantTags error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
