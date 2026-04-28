import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { ensureTenantIdForInsert, stripTenantIdFromBody } from '../utils/tenantScope.js';
import { z } from 'zod';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'equipe';
}

const teamSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  slug: z.string().optional(),
  description: z.string().optional().nullable(),
});

const teamMemberSchema = z.object({
  user_id: z.string().uuid('user_id deve ser um UUID válido'),
  role: z.enum(['lead', 'member', 'supervisor']).optional().default('member'),
});

// GET /api/teams (retorna [] se a tabela teams não existir — migração 49 não aplicada)
export const getTeams = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const result = await pool.query(
      `SELECT id, tenant_id, name, slug, description, created_at, updated_at
       FROM teams
       WHERE tenant_id = $1
       ORDER BY name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
      return res.json([]);
    }
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Erro ao buscar equipes' });
  }
};

// GET /api/teams/:id
export const getTeamById = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { id } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const result = await pool.query(
      `SELECT id, tenant_id, name, slug, description, created_at, updated_at
       FROM teams
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Erro ao buscar equipe' });
  }
};

// POST /api/teams (tenant_id sempre de req.tenantId, nunca do body)
export const createTeam = async (req: Request, res: Response) => {
  try {
    const tenantId = ensureTenantIdForInsert(req as any);
    const bodyWithoutTenant = stripTenantIdFromBody((req.body || {}) as Record<string, unknown>);
    const validated = teamSchema.parse(bodyWithoutTenant);
    const slug = validated.slug?.trim() || slugify(validated.name);

    const result = await pool.query(
      `INSERT INTO teams (tenant_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, name, slug, description, created_at, updated_at`,
      [tenantId, validated.name.trim(), slug, validated.description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Tenant required') {
      return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    const err = error as { code?: string; message?: string };
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma equipe com esse nome ou slug' });
    }
    if (err?.code === '42P01' || err?.message?.includes('relation "teams" does not exist')) {
      return res.status(503).json({
        error: 'Tabela de equipes não existe. Execute as migrações do banco (npm run migrate ou script de migração).',
      });
    }
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Erro ao criar equipe' });
  }
};

// PATCH /api/teams/:id
export const updateTeam = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { id } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const bodyWithoutTenant = stripTenantIdFromBody((req.body || {}) as Record<string, unknown>);
    const validated = teamSchema.partial().parse(bodyWithoutTenant);
    const updates: string[] = [];
    const values: any[] = [];
    let pos = 1;
    if (validated.name !== undefined) {
      updates.push(`name = $${pos++}`);
      values.push(validated.name.trim());
    }
    if (validated.slug !== undefined) {
      updates.push(`slug = $${pos++}`);
      values.push(validated.slug.trim());
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${pos++}`);
      values.push(validated.description || null);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    values.push(id, tenantId);
    const result = await pool.query(
      `UPDATE teams SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${pos++} AND tenant_id = $${pos}
       RETURNING id, tenant_id, name, slug, description, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma equipe com esse slug' });
    }
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Erro ao atualizar equipe' });
  }
};

// DELETE /api/teams/:id
export const deleteTeam = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { id } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const result = await pool.query(
      'DELETE FROM teams WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Erro ao excluir equipe' });
  }
};

// GET /api/teams/:teamId/members
export const getTeamMembers = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { teamId } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const teamCheck = await pool.query(
      'SELECT id FROM teams WHERE id = $1 AND tenant_id = $2',
      [teamId, tenantId]
    );
    if (teamCheck.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });

    const result = await pool.query(
      `SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.created_at, tm.updated_at,
              u.email,
              p.first_name, p.last_name
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       LEFT JOIN profiles p ON u.id = p.id
       WHERE tm.team_id = $1
       ORDER BY tm.created_at`,
      [teamId]
    );
    const rows = result.rows.map((r: any) => ({
      id: r.id,
      team_id: r.team_id,
      user_id: r.user_id,
      role: r.role,
      created_at: r.created_at,
      updated_at: r.updated_at,
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
    }));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Erro ao buscar membros da equipe' });
  }
};

// POST /api/teams/:teamId/members
export const addTeamMember = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { teamId } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const teamCheck = await pool.query(
      'SELECT id FROM teams WHERE id = $1 AND tenant_id = $2',
      [teamId, tenantId]
    );
    if (teamCheck.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });

    const validated = teamMemberSchema.parse(req.body);

    const userTenantCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [validated.user_id, tenantId]
    );
    if (userTenantCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Usuário não pertence à mesma conta' });
    }

    const existing = await pool.query(
      'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, validated.user_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Usuário já é membro desta equipe' });
    }

    const result = await pool.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id, team_id, user_id, role, created_at, updated_at`,
      [teamId, validated.user_id, validated.role]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ error: 'Usuário já é membro desta equipe' });
    }
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Erro ao adicionar membro' });
  }
};

// DELETE /api/teams/:teamId/members/:memberId
export const removeTeamMember = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { teamId, memberId } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const teamCheck = await pool.query(
      'SELECT id FROM teams WHERE id = $1 AND tenant_id = $2',
      [teamId, tenantId]
    );
    if (teamCheck.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });

    const result = await pool.query(
      `DELETE FROM team_members
       WHERE id = $1 AND team_id = $2
       RETURNING id`,
      [memberId, teamId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Membro não encontrado' });
    res.status(204).send();
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
};

// GET /api/teams/by-user/:userId - equipes às quais o usuário pertence (mesmo tenant)
export const getUserTeams = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { userId: targetUserId } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const userTenantCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (userTenantCheck.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const result = await pool.query(
      `SELECT t.id, t.tenant_id, t.name, t.slug, t.description, t.created_at, t.updated_at, tm.role
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
       WHERE t.tenant_id = $2
       ORDER BY t.name`,
      [targetUserId, tenantId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user teams:', error);
    res.status(500).json({ error: 'Erro ao buscar equipes do usuário' });
  }
};

const setUserTeamsSchema = z.object({
  team_ids: z.array(z.string().uuid()),
});

// PUT /api/teams/by-user/:userId - define as equipes do usuário (substitui vínculos no tenant)
export const setUserTeams = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { userId: targetUserId } = req.params;
    if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });

    const userTenantCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (userTenantCheck.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { team_ids } = setUserTeamsSchema.parse(req.body);

    if (team_ids.length > 0) {
      const teamCheck = await pool.query(
        'SELECT id FROM teams WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
        [tenantId, team_ids]
      );
      if (teamCheck.rows.length !== team_ids.length) {
        return res.status(400).json({ error: 'Uma ou mais equipes não pertencem à sua conta' });
      }
    }

    await pool.query('BEGIN');
    try {
      await pool.query(
        `DELETE FROM team_members WHERE user_id = $1 AND team_id IN (SELECT id FROM teams WHERE tenant_id = $2)`,
        [targetUserId, tenantId]
      );
      for (const teamId of team_ids) {
        await pool.query(
          `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')
           ON CONFLICT (team_id, user_id) DO NOTHING`,
          [teamId, targetUserId]
        );
      }
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }

    const result = await pool.query(
      `SELECT t.id, t.tenant_id, t.name, t.slug, t.description, t.created_at, t.updated_at, tm.role
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
       WHERE t.tenant_id = $2
       ORDER BY t.name`,
      [targetUserId, tenantId]
    );
    res.json(result.rows);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    console.error('Error setting user teams:', error);
    res.status(500).json({ error: 'Erro ao atualizar equipes do usuário' });
  }
};
