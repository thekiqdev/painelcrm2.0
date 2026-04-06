import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { hashPassword } from '../utils/bcrypt.js';
import { generateImpersonationToken } from '../utils/jwt.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import { z } from 'zod';

const addSuperAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * GET /api/superadmin/users - Lista usuários que são super admin
 */
export async function listSuperAdmins(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT id, email, is_super_admin, created_at FROM users WHERE is_super_admin = true ORDER BY email`
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('listSuperAdmins error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/superadmin/users - Adiciona super admin (cria usuário ou promove existente)
 * Body: { email, password }
 */
export async function addSuperAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = addSuperAdminSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await pool.query(
      'SELECT id, is_super_admin FROM users WHERE lower(btrim(email)) = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].is_super_admin) {
        res.status(400).json({ error: 'Este usuário já é Super Admin.' });
        return;
      }
      await pool.query('UPDATE users SET is_super_admin = true WHERE id = $1', [existing.rows[0].id]);
      if (req.user?.id) {
        await logSuperAdminAction(req.user.id, 'superadmin.added', 'user', existing.rows[0].id, { email });
      }
      const updated = await pool.query('SELECT id, email, is_super_admin, created_at FROM users WHERE id = $1', [existing.rows[0].id]);
      res.status(200).json(updated.rows[0]);
      return;
    }
    const passwordHash = await hashPassword(body.password);
    const insert = await pool.query(
      `INSERT INTO users (email, password_hash, is_super_admin) VALUES ($1, $2, true) RETURNING id, email, is_super_admin, created_at`,
      [email, passwordHash]
    );
    const user = insert.rows[0];
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'superadmin.added', 'user', user.id, { email });
    }
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    if ((error as { code?: string })?.code === '23505') {
      res.status(400).json({ error: 'Este e-mail já está cadastrado na plataforma.' });
      return;
    }
    console.error('addSuperAdmin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const changePasswordSchema = z.object({
  new_password: z.string().min(6, 'Mínimo 6 caracteres'),
});

/**
 * PUT /api/superadmin/users/:id/password - Altera a senha de um usuário (Super Admin)
 */
export async function changeUserPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = changePasswordSchema.parse(req.body);
    const userResult = await pool.query('SELECT id, email FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const passwordHash = await hashPassword(body.new_password);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'user.password_changed', 'user', id, { target_email: userResult.rows[0].email });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0]?.message || 'Validation error', details: error.errors });
      return;
    }
    console.error('changeUserPassword error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const impersonateSchema = z.object({
  user_id: z.string().uuid(),
});

/**
 * POST /api/superadmin/impersonate - Gera token temporário para "Acessar como" o usuário.
 * Apenas Super Admin. O usuário alvo deve pertencer a um tenant (não pode ser outro Super Admin).
 */
export async function impersonateUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = impersonateSchema.parse(req.body);
    const targetResult = await pool.query(
      'SELECT id, email, is_super_admin, tenant_id FROM users WHERE id = $1',
      [body.user_id]
    );
    if (targetResult.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const target = targetResult.rows[0];
    if (target.is_super_admin) {
      res.status(400).json({ error: 'Não é permitido acessar como outro Super Admin.' });
      return;
    }
    if (!target.tenant_id) {
      res.status(400).json({ error: 'Usuário não está vinculado a nenhuma empresa.' });
      return;
    }
    const token = generateImpersonationToken({ userId: target.id, email: target.email });
    const url = (process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'impersonate', 'user', target.id, { target_email: target.email });
    }
    res.json({ token, url: url || undefined });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('impersonateUser error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/superadmin/users/:id - Remove super admin (is_super_admin = false)
 * Não permite remover o último super admin.
 */
export async function removeSuperAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE is_super_admin = true', []);
    const count = countResult.rows[0]?.c ?? 0;
    if (count <= 1) {
      res.status(400).json({ error: 'Não é permitido remover o último Super Admin.' });
      return;
    }
    const userResult = await pool.query('SELECT id, email, is_super_admin FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const row = userResult.rows[0];
    if (!row.is_super_admin) {
      res.status(400).json({ error: 'Usuário não é Super Admin.' });
      return;
    }
    await pool.query('UPDATE users SET is_super_admin = false WHERE id = $1', [id]);
    if (req.user?.id) {
      await logSuperAdminAction(req.user.id, 'superadmin.removed', 'user', id, { email: row.email });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('removeSuperAdmin error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
