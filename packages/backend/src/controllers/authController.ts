import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { isPgUndefinedColumn } from '../utils/pgErrors.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { insertTenantPlanHistory } from '../services/auditLogService.js';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import { generateToken } from '../utils/jwt.js';
import { getEnabledFeaturesForUser } from '../services/featureFlagService.js';
import { isPhase2TrialCrmGateEnabled } from '../config/checkoutTrialFeatureFlags.js';
import { notifySuperAdminsNewTenant } from '../services/superadminNotificationsService.js';
import { checkTenantUsersLimitForAddOne } from '../services/tenantLimitService.js';
import { ensureWhatsAppTemplateDefaults } from '../services/whatsappTemplateDefaultsService.js';
import {
  schedulePublishPlatformAccountCreated,
  schedulePublishPlatformTrialStarted,
} from '../services/platformNotifications/platformBusinessNotifications.js';
import { z } from 'zod';
import { normalizeEmailForUniqueness, normalizeWhatsappDigits } from '../utils/userIdentity.js';
import { refreshCatalogMediaRelativeSignedUrl } from '../utils/catalogMediaPublicSignedUrl.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  whatsapp: z.string().nullable().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email ou telefone é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

async function findDefaultProfileId(userId: string): Promise<string | null> {
  const profileMember = await pool.query(
    `SELECT profile_id
     FROM profile_members
     WHERE user_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId]
  );

  if (profileMember.rows.length > 0) {
    return profileMember.rows[0].profile_id;
  }

  const ownedProfile = await pool.query(
    `SELECT id
     FROM user_profiles
     WHERE owner_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId]
  );

  return ownedProfile.rows[0]?.id || null;
}

export async function register(req: Request, res: Response): Promise<void> {
  if (process.env.DISABLE_PUBLIC_AUTH_REGISTER === 'true') {
    res.status(403).json({
      error: 'Cadastro público desativado. Utilize o checkout para criar sua conta.',
      code: 'PUBLIC_REGISTER_DISABLED',
    });
    return;
  }
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const {
      email,
      password,
      whatsapp,
      first_name,
      last_name,
      company_name,
    } = registerSchema.parse(req.body);

    const normalizedEmail = normalizeEmailForUniqueness(email);
    const normalizedWhatsapp = normalizeWhatsappDigits(whatsapp ?? null);
    const firstName = first_name?.trim() || null;
    const lastName = last_name?.trim() || null;
    const inferredCompanyName =
      company_name?.trim() ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      (normalizedWhatsapp ? `Empresa ${normalizedWhatsapp.slice(-4)}` : normalizedEmail.split('@')[0]);

    await client.query('BEGIN');
    transactionStarted = true;

    const existingByEmail = await client.query(
      'SELECT id FROM users WHERE lower(btrim(email)) = $1',
      [normalizedEmail]
    );
    if (existingByEmail.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({ error: 'Este e-mail já está cadastrado na plataforma.' });
      return;
    }

    if (normalizedWhatsapp) {
      const existingByWa = await client.query(
        `SELECT id FROM users
         WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
           AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1`,
        [normalizedWhatsapp]
      );
      if (existingByWa.rows.length > 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        res.status(400).json({ error: 'Este número de WhatsApp já está cadastrado na plataforma.' });
        return;
      }
    }

    const passwordHash = await hashPassword(password);

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, whatsapp_number)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [normalizedEmail, passwordHash, normalizedWhatsapp]
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [
        user.id,
        firstName,
        lastName,
        inferredCompanyName,
        normalizedWhatsapp ?? '',
      ]
    );

    const companyResult = await client.query(
      `INSERT INTO user_profiles (owner_id, name, description, is_admin)
       VALUES ($1, $2, $3, true)
       RETURNING id, name`,
      [user.id, inferredCompanyName, null]
    );

    const companyProfileId = companyResult.rows[0].id;

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

    await client.query(
      `INSERT INTO user_permissions (user_id, profile_id, permission, created_by)
       VALUES ($1, $2, 'all_access', $1)`,
      [user.id, companyProfileId]
    );

    // Criar tenant (empresa) e vincular usuário — usa plano padrão (is_default) ou primeiro ativo
    let planRow = await client.query(
      `SELECT id FROM plans WHERE is_active = true AND is_default = true LIMIT 1`
    );
    if (planRow.rows.length === 0) {
      planRow = await client.query(
        `SELECT id FROM plans WHERE is_active = true ORDER BY sort_order ASC, name ASC LIMIT 1`
      );
    }
    let registeredTenantId: string | null = null;
    let registerHadTrial = false;
    if (planRow.rows.length > 0) {
      const planId = planRow.rows[0].id;
      const planDetail = await client.query(
        'SELECT is_free, free_access_days FROM plans WHERE id = $1',
        [planId]
      );
      const isFree = planDetail.rows[0]?.is_free === true;
      const freeDays = planDetail.rows[0]?.free_access_days;
      const trialEndsAt =
        isFree && freeDays != null && freeDays >= 1
          ? `now() + (${Number(freeDays)} || ' days')::interval`
          : null;
      registerHadTrial = Boolean(trialEndsAt);
      let baseSlug = inferredCompanyName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'empresa';
      let slug = baseSlug;
      let suffix = 0;
      while (true) {
        const exists = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
        if (exists.rows.length === 0) break;
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
      const tenantResult = trialEndsAt
        ? await client.query(
            `INSERT INTO tenants (name, slug, plan_id, status, created_via, trial_ends_at)
             VALUES ($1, $2, $3, 'trial', 'registration', now() + ($4::int || ' days')::interval)
             RETURNING id`,
            [inferredCompanyName, slug, planId, freeDays]
          )
        : await client.query(
            `INSERT INTO tenants (name, slug, plan_id, status, created_via)
             VALUES ($1, $2, $3, 'trial', 'registration')
             RETURNING id`,
            [inferredCompanyName, slug, planId]
          );
      const tenantId = tenantResult.rows[0].id;
      registeredTenantId = tenantId;
      const usersLimit = await checkTenantUsersLimitForAddOne(tenantId);
      if (!usersLimit.allowed) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        const msg = usersLimit.limit != null
          ? `Limite de usuários do plano atingido (${usersLimit.current} de ${usersLimit.limit}).`
          : 'Limite de usuários atingido.';
        res.status(403).json({ error: msg });
        return;
      }
      await client.query('UPDATE users SET tenant_id = $1 WHERE id = $2', [tenantId, user.id]);
      await client.query(
        'INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, now())',
        [tenantId, planId]
      );
      setImmediate(() => notifySuperAdminsNewTenant(inferredCompanyName, tenantId).catch(() => {}));
    }

    await client.query('COMMIT');

    if (registeredTenantId) {
      ensureWhatsAppTemplateDefaults(registeredTenantId).catch((err) =>
        console.error('[auth] ensureWhatsAppTemplateDefaults', err),
      );
      schedulePublishPlatformAccountCreated(registeredTenantId);
      if (registerHadTrial) {
        schedulePublishPlatformTrialStarted(registeredTenantId);
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        whatsapp_number: normalizedWhatsapp,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        company_name: inferredCompanyName,
        registration_complete: false,
        default_profile_id: companyProfileId,
      },
      token,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const pgCode = (error as { code?: string })?.code;
    if (pgCode === '23505') {
      res.status(400).json({
        error: 'E-mail ou WhatsApp já cadastrado. Se o problema persistir, entre em contato com o suporte.',
      });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = loginSchema.parse(req.body);

    // Determine if identifier is email or phone number
    // Email contains @, phone number is numeric (may contain +, spaces, dashes, parentheses)
    const isEmail = identifier.includes('@');
    
    let userResult;
    if (isEmail) {
      const em = normalizeEmailForUniqueness(identifier);
      userResult = await pool.query(
        `SELECT id, email, password_hash, whatsapp_number, COALESCE(is_super_admin, false) AS is_super_admin,
                tenant_id
         FROM users
         WHERE lower(btrim(email)) = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [em]
      );
    } else {
      const digits = identifier.replace(/\D/g, '');
      if (digits.length < 8) {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }
      userResult = await pool.query(
        `SELECT id, email, password_hash, whatsapp_number, COALESCE(is_super_admin, false) AS is_super_admin
         FROM users
         WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
           AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [digits]
      );
    }

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const user = userResult.rows[0];

    // Check if user has a password hash
    if (!user.password_hash) {
      console.error('User found but has no password_hash:', user.id);
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    // Verify password
    console.log('Attempting login for:', identifier);
    console.log('User found:', user.email);
    console.log('Password hash exists:', !!user.password_hash);
    console.log('Password hash length:', user.password_hash?.length);
    
    const isValid = await comparePassword(password, user.password_hash);
    console.log('Password comparison result:', isValid);
    
    if (!isValid) {
      console.error('Password validation failed for user:', user.email);
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    // Get profile to check registration_complete
    interface Profile {
      registration_complete?: boolean;
      first_name?: string;
      last_name?: string;
      company_name?: string;
    }
    
    let profile: Profile = {};
    try {
      const profileResult = await pool.query<Profile>(
        'SELECT registration_complete, first_name, last_name, company_name FROM profiles WHERE id = $1',
        [user.id]
      );
      profile = profileResult.rows[0] || {};
    } catch (profileError) {
      console.error('Error fetching profile:', profileError);
      // Continue without profile if it doesn't exist
    }

    // Generate token
    let token;
    try {
      token = generateToken({
        userId: user.id,
        email: user.email,
      });
      console.log('Token generated successfully');
    } catch (tokenError) {
      console.error('Error generating token:', tokenError);
      throw tokenError;
    }

    const defaultProfileId = await findDefaultProfileId(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        whatsapp_number: user.whatsapp_number,
        registration_complete: profile.registration_complete || false,
        first_name: profile.first_name,
        last_name: profile.last_name,
        company_name: profile.company_name,
        default_profile_id: defaultProfileId,
        is_super_admin: user.is_super_admin === true,
        tenant_id: user.tenant_id ?? null,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erro de validação', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    console.error('Login error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error instanceof Error ? error.message : 'Unknown error',
      // Em desenvolvimento, incluir mais detalhes
      ...(process.env.NODE_ENV !== 'production' && { 
        stack: error instanceof Error ? error.stack : undefined 
      })
    });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user with profile and is_super_admin (fallback se migração 157 ainda não foi aplicada)
    const sqlMeWithProfileExtras = `SELECT u.id, u.email, u.whatsapp_number, u.created_at, u.tenant_id, COALESCE(u.is_super_admin, false) AS is_super_admin,
              p.first_name, p.last_name, p.company_name,
              p.avatar_url, p.job_title, p.locale, p.timezone,
              p.whatsapp_connected, p.registration_complete
       FROM users u
       LEFT JOIN profiles p ON u.id = p.id
       WHERE u.id = $1`;
    const sqlMeLegacyUserAvatar = `SELECT u.id, u.email, u.whatsapp_number, u.created_at, u.tenant_id, COALESCE(u.is_super_admin, false) AS is_super_admin,
              p.first_name, p.last_name, p.company_name,
              u.avatar_url,
              p.whatsapp_connected, p.registration_complete
       FROM users u
       LEFT JOIN profiles p ON u.id = p.id
       WHERE u.id = $1`;
    const sqlMeLegacyProfile = `SELECT u.id, u.email, u.whatsapp_number, u.created_at, u.tenant_id, COALESCE(u.is_super_admin, false) AS is_super_admin,
              p.first_name, p.last_name, p.company_name,
              p.whatsapp_connected, p.registration_complete
       FROM users u
       LEFT JOIN profiles p ON u.id = p.id
       WHERE u.id = $1`;
    let userResult;
    try {
      userResult = await pool.query(sqlMeWithProfileExtras, [userId]);
    } catch (e) {
      if (isPgUndefinedColumn(e)) {
        try {
          userResult = await pool.query(sqlMeLegacyUserAvatar, [userId]);
        } catch (e2) {
          if (isPgUndefinedColumn(e2)) {
            userResult = await pool.query(sqlMeLegacyProfile, [userId]);
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];
    const defaultProfileId = await findDefaultProfileId(user.id);

    let canManagePlan = false;
    let planExpired = false;
    /** plan_period_end no passado: CRM retorna 402 nas rotas operacionais; o front deve ir ao hub comercial. */
    let commercialAccessRequired = false;
    let tenantStatus: string | null = null;
    let onboardingCompleted = false;
    let trialEndsAt: string | null = null;
    let suspensionReason: string | null = null;
    let requiresCheckoutResume = false;
    const tenantCheck = await pool.query<{
      tenant_id: string;
      primary_user_id: string;
      status: string;
      onboarding_completed: boolean;
      trial_ends_at: string | null;
      activated_billing_id: string | null;
      suspension_reason: string | null;
      plan_period_end: string | null;
    }>(
      `SELECT u.tenant_id,
        (SELECT u2.id FROM users u2 WHERE u2.tenant_id = u.tenant_id ORDER BY u2.created_at ASC LIMIT 1) AS primary_user_id,
        t.status,
        t.onboarding_completed,
        t.trial_ends_at,
        t.activated_billing_id,
        t.suspension_reason,
        t.plan_period_end
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id IS NOT NULL`,
      [userId as string]
    );
    if (tenantCheck.rows.length > 0) {
      const row = tenantCheck.rows[0];
      tenantStatus = row.status;
      trialEndsAt = row.trial_ends_at;
      suspensionReason = row.suspension_reason;
      if (row.plan_period_end) {
        const pe = new Date(row.plan_period_end);
        if (!Number.isNaN(pe.getTime()) && pe.getTime() < Date.now()) {
          commercialAccessRequired = true;
        }
      }
      const trialEndedUnpaid =
        row.status === 'trial' &&
        row.trial_ends_at != null &&
        new Date(row.trial_ends_at) < new Date() &&
        row.activated_billing_id == null;
      const trialEndedWhilePaymentPending =
        row.status === 'payment_pending' &&
        row.trial_ends_at != null &&
        new Date(row.trial_ends_at) < new Date() &&
        row.activated_billing_id == null;
      const needsTrialPayment =
        (row.status === 'suspended' && row.suspension_reason === 'trial_expired') ||
        trialEndedUnpaid ||
        trialEndedWhilePaymentPending;
      requiresCheckoutResume = isPhase2TrialCrmGateEnabled() && needsTrialPayment;
      if (row.status === 'active' || row.activated_billing_id != null) {
        requiresCheckoutResume = false;
      }
      onboardingCompleted = row.onboarding_completed === true;
      const primaryUserId = row.primary_user_id;
      const isPrimaryUser = primaryUserId === userId;
      const hasAdminProfile = await pool.query(
        'SELECT 1 FROM user_profiles WHERE owner_id = $1 AND is_admin = true LIMIT 1',
        [userId]
      );
      canManagePlan = isPrimaryUser || hasAdminProfile.rows.length > 0;
      const planPeriodValid =
        row.plan_period_end != null && new Date(row.plan_period_end).getTime() >= Date.now();
      const hasPaidActivationOrActive =
        row.activated_billing_id != null || row.status === 'active' || planPeriodValid;
      const expCheck = await pool.query(
        `SELECT t.trial_ends_at, p.is_free
         FROM tenants t
         JOIN plans p ON p.id = t.plan_id
         WHERE t.id = $1`,
        [row.tenant_id]
      );
      if (
        !hasPaidActivationOrActive &&
        expCheck.rows.length > 0 &&
        expCheck.rows[0].is_free === true &&
        expCheck.rows[0].trial_ends_at
      ) {
        const endsAt = new Date(expCheck.rows[0].trial_ends_at);
        if (endsAt.getTime() < Date.now()) {
          planExpired = true;
        }
      }
    }

    const tenantAdmin = await isTenantAdmin(userId);

    res.json({
      id: user.id,
      email: user.email,
      whatsapp_number: user.whatsapp_number,
      first_name: user.first_name,
      last_name: user.last_name,
      company_name: user.company_name,
      avatar_url: refreshCatalogMediaRelativeSignedUrl(user.avatar_url ?? null),
      job_title: user.job_title ?? null,
      locale: user.locale ?? null,
      timezone: user.timezone ?? null,
      whatsapp_connected: user.whatsapp_connected,
      registration_complete: user.registration_complete,
      created_at: user.created_at,
      tenant_id: user.tenant_id ?? null,
      default_profile_id: defaultProfileId,
      is_super_admin: user.is_super_admin === true,
      /** Role admin no tenant (user_roles) — supervisão no chat (transferir, ver equipa). */
      is_tenant_admin: tenantAdmin,
      can_manage_plan: canManagePlan,
      plan_expired: planExpired,
      tenant_status: tenantStatus,
      onboarding_completed: onboardingCompleted,
      trial_ends_at: trialEndsAt,
      suspension_reason: suspensionReason,
      requires_checkout_resume: requiresCheckoutResume,
      commercial_access_required: commercialAccessRequired,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/auth/me/features
 * Lista de feature_key habilitadas para o usuário logado (para frontend/mobile em lote).
 */
export async function getMeFeatures(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const features = await getEnabledFeaturesForUser(userId);
    res.json({ features });
  } catch (error) {
    console.error('Get me features error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  // With JWT, logout is handled client-side by removing the token
  // Optionally, we could implement a token blacklist here
  res.json({ message: 'Logged out successfully' });
}

// Endpoint temporário para atualizar senha do admin (REMOVER EM PRODUÇÃO)
export async function updateAdminPassword(req: Request, res: Response): Promise<void> {
  try {
    // Permitir se ALLOW_PASSWORD_UPDATE estiver definido ou em desenvolvimento
    const isAllowed = process.env.ALLOW_PASSWORD_UPDATE === 'true' || process.env.NODE_ENV !== 'production';
    
    if (!isAllowed) {
      res.status(403).json({ error: 'Not allowed. Set ALLOW_PASSWORD_UPDATE=true to enable.' });
      return;
    }

    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Gerar novo hash
    const passwordHash = await hashPassword(password);

    // Atualizar no banco
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email',
      [passwordHash, email]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ 
      message: 'Password updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update admin password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


