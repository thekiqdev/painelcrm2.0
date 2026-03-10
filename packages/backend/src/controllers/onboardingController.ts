/**
 * Onboarding pós-pagamento: criar primeiro admin, confirmar dados da empresa, finalizar.
 * POST /api/onboarding/create-admin — sem auth (tenant_id no body).
 * GET/PATCH /api/onboarding/* — com auth (tenant do usuário).
 */
import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { hashPassword } from '../utils/bcrypt.js';
import { generateToken } from '../utils/jwt.js';
import { getPermissionsForRole } from '../services/rolePermissionsService.js';
import type { AppRole } from '../services/rolePermissionsService.js';

const createAdminSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

/** POST /api/onboarding/create-admin — cria o primeiro usuário administrador do tenant (sem auth). */
export async function postOnboardingCreateAdmin(req: import('express').Request, res: Response): Promise<void> {
  try {
    const body = createAdminSchema.parse(req.body);

    const tenantRow = await pool.query<{ id: string; name: string; status: string; onboarding_completed: boolean }>(
      `SELECT id, name, status, onboarding_completed FROM tenants WHERE id = $1`,
      [body.tenant_id]
    );
    if (tenantRow.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const tenant = tenantRow.rows[0];
    if (tenant.status !== 'active') {
      res.status(400).json({ error: 'Conta ainda não está ativa. Aguarde a confirmação do pagamento.' });
      return;
    }
    if (tenant.onboarding_completed) {
      res.status(400).json({ error: 'Onboarding já foi concluído para esta conta.' });
      return;
    }

    const email = body.email.trim().toLowerCase();
    const passwordHash = await hashPassword(body.password);
    const fullName = body.name.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? fullName;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const existingUserRow = await pool.query<{ id: string; tenant_id: string | null }>(
      'SELECT id, tenant_id FROM users WHERE email = $1',
      [email]
    );
    const existingUser = existingUserRow.rows[0];

    if (existingUser) {
      if (existingUser.tenant_id !== body.tenant_id) {
        res.status(400).json({ error: 'Já existe um usuário com este e-mail em outra conta.' });
        return;
      }
      // Mesmo tenant: usuário já foi criado antes (ex.: sem senha); atualizar senha e nome
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
        [passwordHash, existingUser.id]
      );
      const profileExists = await pool.query('SELECT 1 FROM profiles WHERE id = $1', [existingUser.id]);
      if (profileExists.rows.length > 0) {
        await pool.query(
          `UPDATE profiles SET first_name = $1, last_name = $2, company_name = COALESCE(NULLIF(trim(company_name), ''), $3), registration_complete = true, updated_at = now() WHERE id = $4`,
          [firstName, lastName, tenant.name, existingUser.id]
        );
      } else {
        await pool.query(
          `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
           VALUES ($1, $2, $3, $4, '', true)`,
          [existingUser.id, firstName, lastName, tenant.name]
        );
      }
      // Garantir que tenha user_profile e role admin (caso tenha sido criado só parcialmente)
      const hasProfile = await pool.query(
        'SELECT id FROM user_profiles WHERE owner_id = $1 LIMIT 1',
        [existingUser.id]
      );
      if (hasProfile.rows.length === 0) {
        const profileResult = await pool.query<{ id: string }>(
          `INSERT INTO user_profiles (owner_id, name, description, is_admin) VALUES ($1, $2, NULL, true) RETURNING id`,
          [existingUser.id, tenant.name]
        );
        const profileId = profileResult.rows[0].id;
        await pool.query(
          'INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)',
          [profileId, existingUser.id, existingUser.id]
        );
        await pool.query(
          `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, 'admin', $2, $3)`,
          [existingUser.id, profileId, existingUser.id]
        );
        const adminPerms = getPermissionsForRole('admin' as AppRole);
        for (const permission of adminPerms) {
          await pool.query(
            `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
            [existingUser.id, profileId, permission, existingUser.id]
          );
        }
      }
      const token = generateToken({ userId: existingUser.id, email });
      return res.status(200).json({
        token,
        user: {
          id: existingUser.id,
          email,
          first_name: firstName,
          last_name: lastName || undefined,
          registration_complete: true,
        },
      });
    }

    const countUsers = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM users WHERE tenant_id = $1',
      [body.tenant_id]
    );
    if (parseInt(countUsers.rows[0]?.count ?? '0', 10) > 0) {
      res.status(400).json({ error: 'Esta conta já possui um administrador. Faça login.' });
      return;
    }

    const userResult = await pool.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, tenant_id)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [email, passwordHash, body.tenant_id]
    );
    const user = userResult.rows[0];

    await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete)
       VALUES ($1, $2, $3, $4, '', true)`,
      [user.id, firstName, lastName, tenant.name]
    );

    const profileResult = await pool.query<{ id: string }>(
      `INSERT INTO user_profiles (owner_id, name, description, is_admin)
       VALUES ($1, $2, NULL, true)
       RETURNING id`,
      [user.id, tenant.name]
    );
    const profileId = profileResult.rows[0].id;

    await pool.query(
      `INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)`,
      [profileId, user.id, user.id]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, 'admin', $2, $3)`,
      [user.id, profileId, user.id]
    );
    const adminPerms = getPermissionsForRole('admin' as AppRole);
    for (const permission of adminPerms) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
        [user.id, profileId, permission, user.id]
      );
    }

    const token = generateToken({ userId: user.id, email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: firstName,
        last_name: lastName || undefined,
        registration_complete: true,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Dados inválidos', details: err.errors });
      return;
    }
    console.error('[onboarding] create-admin', err);
    res.status(500).json({ error: 'Erro ao criar administrador' });
  }
}

/** GET /api/onboarding/tenant-data — dados da empresa do tenant do usuário (para step 2). */
export async function getOnboardingTenantData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantRow = await pool.query<{
      name: string;
      cpf_cnpj: string | null;
      billing_email: string | null;
      billing_phone: string | null;
    }>(
      `SELECT t.name, t.cpf_cnpj, t.billing_email, t.billing_phone
       FROM tenants t
       INNER JOIN users u ON u.tenant_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    if (tenantRow.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const row = tenantRow.rows[0];
    res.json({
      company_name: row.name,
      cpf_cnpj: row.cpf_cnpj ?? '',
      billing_email: row.billing_email ?? '',
      billing_phone: row.billing_phone ?? '',
    });
  } catch (err) {
    console.error('[onboarding] tenant-data', err);
    res.status(500).json({ error: 'Erro ao carregar dados da empresa' });
  }
}

const patchCompanySchema = z.object({
  company_name: z.string().min(1).optional(),
  cpf_cnpj: z.string().optional(),
  billing_email: z.union([z.string().email(), z.literal('')]).optional(),
  billing_phone: z.string().optional(),
});

/** PATCH /api/onboarding/company — atualiza dados da empresa do tenant. */
export async function patchOnboardingCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const body = patchCompanySchema.parse(req.body || {});

    const tenantIdRow = await pool.query<{ id: string }>(
      'SELECT tenant_id AS id FROM users WHERE id = $1 AND tenant_id IS NOT NULL',
      [userId]
    );
    if (tenantIdRow.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const tenantId = tenantIdRow.rows[0].id;

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (body.company_name !== undefined) {
      updates.push(`name = $${i}`);
      values.push(body.company_name);
      i++;
    }
    if (body.cpf_cnpj !== undefined) {
      updates.push(`cpf_cnpj = $${i}`);
      values.push(body.cpf_cnpj || null);
      i++;
    }
    if (body.billing_email !== undefined) {
      updates.push(`billing_email = $${i}`);
      values.push(body.billing_email || null);
      i++;
    }
    if (body.billing_phone !== undefined) {
      updates.push(`billing_phone = $${i}`);
      values.push(body.billing_phone || null);
      i++;
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    values.push(tenantId);
    await pool.query(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
      values
    );
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    console.error('[onboarding] company', err);
    res.status(500).json({ error: 'Erro ao salvar dados da empresa' });
  }
}

/** POST /api/onboarding/complete — marca onboarding como concluído e redireciona para dashboard. */
export async function postOnboardingComplete(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantRow = await pool.query<{ id: string; status: string; onboarding_completed: boolean }>(
      `SELECT t.id, t.status, t.onboarding_completed
       FROM tenants t
       INNER JOIN users u ON u.tenant_id = t.id
       WHERE u.id = $1`,
      [userId]
    );
    if (tenantRow.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const tenant = tenantRow.rows[0];
    if (tenant.status !== 'active') {
      res.status(400).json({ error: 'Conta não está ativa' });
      return;
    }
    await pool.query(
      'UPDATE tenants SET onboarding_completed = true, updated_at = now() WHERE id = $1',
      [tenant.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[onboarding] complete', err);
    res.status(500).json({ error: 'Erro ao finalizar onboarding' });
  }
}
