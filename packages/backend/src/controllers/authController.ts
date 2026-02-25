import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { insertTenantPlanHistory } from '../services/auditLogService.js';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import { generateToken } from '../utils/jwt.js';
import { getEnabledFeaturesForUser } from '../services/featureFlagService.js';
import { notifySuperAdminsNewTenant } from '../services/superadminNotificationsService.js';
import { checkTenantUsersLimitForAddOne } from '../services/tenantLimitService.js';
import { z } from 'zod';

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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedWhatsapp = whatsapp ? whatsapp.replace(/\D/g, '') : null;
    const firstName = first_name?.trim() || null;
    const lastName = last_name?.trim() || null;
    const inferredCompanyName =
      company_name?.trim() ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      (normalizedWhatsapp ? `Empresa ${normalizedWhatsapp.slice(-4)}` : normalizedEmail.split('@')[0]);

    await client.query('BEGIN');
    transactionStarted = true;

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, whatsapp_number)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [normalizedEmail, passwordHash, normalizedWhatsapp || null]
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
        normalizedWhatsapp || '',
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
      userResult = await pool.query(
        'SELECT id, email, password_hash, whatsapp_number, COALESCE(is_super_admin, false) AS is_super_admin FROM users WHERE email = $1',
        [identifier.toLowerCase().trim()]
      );
    } else {
      const normalizedPhone = identifier.replace(/[\s\-\(\)\+]/g, '');
      userResult = await pool.query(
        'SELECT id, email, password_hash, whatsapp_number, COALESCE(is_super_admin, false) AS is_super_admin FROM users WHERE whatsapp_number = $1 OR whatsapp_number = $2',
        [identifier, normalizedPhone]
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

    // Get user with profile and is_super_admin
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.whatsapp_number, u.created_at, COALESCE(u.is_super_admin, false) AS is_super_admin,
              p.first_name, p.last_name, p.company_name, 
              p.whatsapp_connected, p.registration_complete
       FROM users u
       LEFT JOIN profiles p ON u.id = p.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];
    const defaultProfileId = await findDefaultProfileId(user.id);

    let canManagePlan = false;
    let planExpired = false;
    const tenantCheck = await pool.query(
      `SELECT u.tenant_id,
        (SELECT u2.id FROM users u2 WHERE u2.tenant_id = u.tenant_id ORDER BY u2.created_at ASC LIMIT 1) AS primary_user_id
       FROM users u WHERE u.id = $1 AND u.tenant_id IS NOT NULL`,
      [userId]
    );
    if (tenantCheck.rows.length > 0) {
      const primaryUserId = tenantCheck.rows[0].primary_user_id;
      const isPrimaryUser = primaryUserId === userId;
      const hasAdminProfile = await pool.query(
        'SELECT 1 FROM user_profiles WHERE owner_id = $1 AND is_admin = true LIMIT 1',
        [userId]
      );
      canManagePlan = isPrimaryUser || hasAdminProfile.rows.length > 0;
      const tid = tenantCheck.rows[0].tenant_id;
      const expCheck = await pool.query(
        `SELECT t.trial_ends_at, p.is_free
         FROM tenants t
         JOIN plans p ON p.id = t.plan_id
         WHERE t.id = $1`,
        [tid]
      );
      if (expCheck.rows.length > 0 && expCheck.rows[0].is_free === true && expCheck.rows[0].trial_ends_at) {
        const endsAt = new Date(expCheck.rows[0].trial_ends_at);
        if (endsAt.getTime() < Date.now()) {
          planExpired = true;
        }
      }
    }

    res.json({
      id: user.id,
      email: user.email,
      whatsapp_number: user.whatsapp_number,
      first_name: user.first_name,
      last_name: user.last_name,
      company_name: user.company_name,
      whatsapp_connected: user.whatsapp_connected,
      registration_complete: user.registration_complete,
      created_at: user.created_at,
      default_profile_id: defaultProfileId,
      is_super_admin: user.is_super_admin === true,
      can_manage_plan: canManagePlan,
      plan_expired: planExpired,
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


