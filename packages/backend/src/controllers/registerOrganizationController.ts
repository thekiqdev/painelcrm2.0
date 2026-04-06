/**
 * Cadastro de nova organização (tenant + administrador) em fluxo guiado por etapas.
 * Garante unicidade global de e-mail e WhatsApp do administrador.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { hashPassword } from '../utils/bcrypt.js';
import { generateToken } from '../utils/jwt.js';
import { notifySuperAdminsNewTenant } from '../services/superadminNotificationsService.js';
import { checkTenantUsersLimitForAddOne } from '../services/tenantLimitService.js';
import { normalizeEmailForUniqueness, normalizeWhatsappDigits } from '../utils/userIdentity.js';
import { isValidCpfOrCnpj, onlyDigits } from '../utils/cpfCnpj.js';
import { getPermissionsForRole } from '../services/rolePermissionsService.js';
import type { AppRole } from '../services/rolePermissionsService.js';

const checkAdminSchema = z.object({
  admin_email: z.string().email(),
  admin_whatsapp: z.string().min(8),
});

const registerOrganizationSchema = z.object({
  plan_id: z.string().uuid(),
  company: z.object({
    name: z.string().min(1),
    cpf_cnpj: z.string().min(11),
    email: z.string().email(),
    phone: z.string().min(8),
  }),
  admin: z.object({
    first_name: z.string().min(1),
    last_name: z.string().optional().nullable(),
    email: z.string().email(),
    whatsapp: z.string().min(8),
    password: z.string().min(6),
  }),
  billing_finalize: z
    .object({
      billing_phone: z.string().optional().nullable(),
      responsible_name: z.string().optional().nullable(),
    })
    .optional(),
});

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'empresa';
}

async function assertAdminEmailAvailable(normalizedEmail: string): Promise<void> {
  const r = await pool.query('SELECT 1 FROM users WHERE lower(btrim(email)) = $1 LIMIT 1', [
    normalizedEmail,
  ]);
  if (r.rows.length > 0) {
    const err = new Error('EMAIL_ALREADY_REGISTERED_USE_LOGIN');
    (err as Error & { code?: string }).code = 'EMAIL_ALREADY_REGISTERED_USE_LOGIN';
    throw err;
  }
}

async function assertAdminWhatsappAvailable(digits: string): Promise<void> {
  if (digits.length < 8) return;
  const r = await pool.query(
    `SELECT 1 FROM users
     WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
       AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1
     LIMIT 1`,
    [digits]
  );
  if (r.rows.length > 0) {
    const err = new Error('WHATSAPP_ALREADY_REGISTERED_USE_LOGIN');
    (err as Error & { code?: string }).code = 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN';
    throw err;
  }
}

/**
 * POST /api/auth/register/check-admin — valida e-mail e WhatsApp do futuro administrador (antes de concluir o cadastro).
 */
export async function checkAdminAvailability(req: Request, res: Response): Promise<void> {
  try {
    const body = checkAdminSchema.parse(req.body);
    const adminEmail = normalizeEmailForUniqueness(body.admin_email);
    const adminWa = normalizeWhatsappDigits(body.admin_whatsapp);
    if (!adminWa || adminWa.length < 8) {
      res.status(400).json({
        error: 'Informe um WhatsApp válido com DDD.',
        code: 'INVALID_WHATSAPP',
      });
      return;
    }
    await assertAdminEmailAvailable(adminEmail);
    await assertAdminWhatsappAvailable(adminWa);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    const code = (e as Error & { code?: string })?.code;
    const msg = e instanceof Error ? e.message : String(e);
    if (code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('EMAIL_ALREADY')) {
      res.status(400).json({
        error: 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.',
        code: 'EMAIL_ALREADY_REGISTERED_USE_LOGIN',
      });
      return;
    }
    if (code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('WHATSAPP_ALREADY')) {
      res.status(400).json({
        error: 'Este número de WhatsApp já está cadastrado. Faça login ou use outro número.',
        code: 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN',
      });
      return;
    }
    console.error('checkAdminAvailability:', e);
    res.status(500).json({ error: 'Erro ao validar disponibilidade' });
  }
}

/**
 * POST /api/auth/register/organization — cria tenant + usuário administrador (transação única).
 */
export async function registerOrganization(req: Request, res: Response): Promise<void> {
  if (process.env.DISABLE_PUBLIC_REGISTER_ORGANIZATION === 'true') {
    res.status(403).json({
      error: 'Cadastro por este fluxo foi desativado. Utilize o checkout.',
      code: 'PUBLIC_REGISTER_ORGANIZATION_DISABLED',
    });
    return;
  }
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const parsed = registerOrganizationSchema.parse(req.body);
    const companyEmail = normalizeEmailForUniqueness(parsed.company.email);
    const companyPhoneDigits = normalizeWhatsappDigits(parsed.company.phone);
    const adminEmail = normalizeEmailForUniqueness(parsed.admin.email);
    const adminWa = normalizeWhatsappDigits(parsed.admin.whatsapp);
    const cpfCnpjDigits = onlyDigits(parsed.company.cpf_cnpj);

    if (!isValidCpfOrCnpj(cpfCnpjDigits)) {
      res.status(400).json({ error: 'CPF ou CNPJ inválido.', code: 'INVALID_CPF_CNPJ', field: 'cpf_cnpj' });
      return;
    }
    if (!adminWa || adminWa.length < 8) {
      res.status(400).json({ error: 'WhatsApp do administrador inválido.', code: 'INVALID_WHATSAPP' });
      return;
    }
    if (!companyPhoneDigits || companyPhoneDigits.length < 8) {
      res.status(400).json({ error: 'Telefone da empresa inválido.', code: 'INVALID_COMPANY_PHONE' });
      return;
    }

    const billingPhoneFinal = normalizeWhatsappDigits(
      parsed.billing_finalize?.billing_phone?.trim() || parsed.company.phone
    );
    if (!billingPhoneFinal || billingPhoneFinal.length < 8) {
      res.status(400).json({ error: 'Telefone para faturamento inválido.', code: 'INVALID_BILLING_PHONE' });
      return;
    }

    await assertAdminEmailAvailable(adminEmail);
    await assertAdminWhatsappAvailable(adminWa);

    const planRow = await client.query<{ id: string }>(
      'SELECT id FROM plans WHERE id = $1 AND is_active = true',
      [parsed.plan_id]
    );
    if (planRow.rows.length === 0) {
      res.status(400).json({ error: 'Plano inválido ou indisponível.', code: 'INVALID_PLAN' });
      return;
    }
    const planId = planRow.rows[0].id;
    const planDetail = await client.query(
      'SELECT is_free, free_access_days FROM plans WHERE id = $1',
      [planId]
    );
    const isFree = planDetail.rows[0]?.is_free === true;
    const freeDays = planDetail.rows[0]?.free_access_days;

    const companyName = parsed.company.name.trim();
    const firstName = parsed.admin.first_name.trim();
    const lastName = (parsed.admin.last_name ?? '').trim();
    const responsibleName =
      (parsed.billing_finalize?.responsible_name?.trim() ||
        [firstName, lastName].filter(Boolean).join(' ').trim()) ||
      firstName;

    await client.query('BEGIN');
    transactionStarted = true;

    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    let suffix = 0;
    for (;;) {
      const exists = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
      if (exists.rows.length === 0) break;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const trialEndsAt =
      isFree && freeDays != null && freeDays >= 1
        ? `now() + (${Number(freeDays)} || ' days')::interval`
        : null;

    let tenantInsert;
    if (trialEndsAt) {
      tenantInsert = await client.query<{ id: string }>(
        `INSERT INTO tenants (
           name, slug, plan_id, status, created_via,
           billing_email, billing_phone, cpf_cnpj, responsible_name,
           trial_ends_at
         )
         VALUES ($1, $2, $3, 'trial', 'registration', $4, $5, $6, $7, now() + ($8::int || ' days')::interval)
         RETURNING id`,
        [
          companyName,
          slug,
          planId,
          companyEmail,
          billingPhoneFinal,
          cpfCnpjDigits,
          responsibleName,
          freeDays,
        ]
      );
    } else {
      tenantInsert = await client.query<{ id: string }>(
        `INSERT INTO tenants (
           name, slug, plan_id, status, created_via,
           billing_email, billing_phone, cpf_cnpj, responsible_name
         )
         VALUES ($1, $2, $3, 'trial', 'registration', $4, $5, $6, $7)
         RETURNING id`,
        [companyName, slug, planId, companyEmail, billingPhoneFinal, cpfCnpjDigits, responsibleName]
      );
    }

    const tenantId = tenantInsert.rows[0].id;

    const usersLimit = await checkTenantUsersLimitForAddOne(tenantId);
    if (!usersLimit.allowed) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(403).json({
        error:
          usersLimit.limit != null
            ? `Limite de usuários do plano atingido (${usersLimit.current} de ${usersLimit.limit}).`
            : 'Limite de usuários atingido.',
        code: 'TENANT_USERS_LIMIT',
      });
      return;
    }

    const passwordHash = await hashPassword(parsed.admin.password);

    const userResult = await client.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, whatsapp_number, tenant_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email`,
      [adminEmail, passwordHash, adminWa, tenantId]
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [user.id, firstName, lastName || null, companyName, adminWa]
    );

    const companyProfileResult = await client.query<{ id: string }>(
      `INSERT INTO user_profiles (owner_id, name, description, is_admin)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [user.id, companyName, null]
    );
    const companyProfileId = companyProfileResult.rows[0].id;

    await client.query(
      `INSERT INTO profile_members (profile_id, user_id, created_by)
       VALUES ($1, $2, $2)`,
      [companyProfileId, user.id]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role, profile_id, created_by)
       VALUES ($1, 'admin', $2, $1)`,
      [user.id, companyProfileId]
    );

    const adminPerms = getPermissionsForRole('admin' as AppRole);
    for (const permission of adminPerms) {
      await client.query(
        `INSERT INTO user_permissions (user_id, profile_id, permission, created_by)
         VALUES ($1, $2, $3, $4)`,
        [user.id, companyProfileId, permission, user.id]
      );
    }

    await client.query(
      'INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, now())',
      [tenantId, planId]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    setImmediate(() => notifySuperAdminsNewTenant(companyName, tenantId).catch(() => {}));

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        whatsapp_number: adminWa,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        company_name: companyName,
        registration_complete: false,
        default_profile_id: companyProfileId,
        tenant_id: tenantId,
      },
      token,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('registerOrganization rollback:', rollbackError);
      }
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const code = (error as Error & { code?: string })?.code;
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('EMAIL_ALREADY')) {
      res.status(400).json({
        error: 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.',
        code: 'EMAIL_ALREADY_REGISTERED_USE_LOGIN',
      });
      return;
    }
    if (code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('WHATSAPP_ALREADY')) {
      res.status(400).json({
        error: 'Este número de WhatsApp já está cadastrado. Faça login ou use outro número.',
        code: 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN',
      });
      return;
    }
    const pgCode = (error as { code?: string })?.code;
    if (pgCode === '23505') {
      res.status(400).json({
        error: 'E-mail ou WhatsApp já cadastrado na plataforma.',
        code: 'DUPLICATE_KEY',
      });
      return;
    }
    console.error('registerOrganization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
