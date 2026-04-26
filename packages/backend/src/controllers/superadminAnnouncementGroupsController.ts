import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
});

const membersSchema = z.object({
  tenant_ids: z.array(z.string().uuid()),
});

export async function listAnnouncementGroups(req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query<{
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      member_count: string;
    }>(
      `SELECT g.id::text, g.name, g.description, g.is_active, g.created_at::text, g.updated_at::text,
              COUNT(m.id)::text AS member_count
       FROM announcement_groups g
       LEFT JOIN announcement_group_members m ON m.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name ASC`
    );
    res.json(
      r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        member_count: Number(row.member_count ?? 0),
      }))
    );
  } catch (e) {
    console.error('[announcement-groups] list', e);
    res.status(500).json({ error: 'Erro ao listar grupos' });
  }
}

export async function createAnnouncementGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = createSchema.parse(req.body);
    const r = await pool.query<{ id: string }>(
      `INSERT INTO announcement_groups (name, description, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING id::text`,
      [body.name, body.description ?? null, body.is_active]
    );
    res.status(201).json({ id: r.rows[0]!.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcement-groups] create', e);
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
}

export async function patchAnnouncementGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = patchSchema.parse(req.body);
    const r = await pool.query(
      `UPDATE announcement_groups SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         is_active = COALESCE($4, is_active),
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [id, body.name ?? null, body.description === undefined ? null : body.description, body.is_active ?? null]
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Grupo não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcement-groups] patch', e);
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
}

export async function getAnnouncementGroupMembers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const r = await pool.query<{ tenant_id: string }>(
      `SELECT tenant_id::text FROM announcement_group_members WHERE group_id = $1::uuid`,
      [id]
    );
    res.json({ tenant_ids: r.rows.map((x) => x.tenant_id) });
  } catch (e) {
    console.error('[announcement-groups] members get', e);
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
}

export async function putAnnouncementGroupMembers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = membersSchema.parse(req.body);

    const g = await pool.query(`SELECT 1 FROM announcement_groups WHERE id = $1::uuid LIMIT 1`, [id]);
    if (g.rows.length === 0) {
      res.status(404).json({ error: 'Grupo não encontrado' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM announcement_group_members WHERE group_id = $1::uuid`, [id]);
      for (const tid of body.tenant_ids) {
        await client.query(
          `INSERT INTO announcement_group_members (group_id, tenant_id) VALUES ($1::uuid, $2::uuid)
           ON CONFLICT (group_id, tenant_id) DO NOTHING`,
          [id, tid]
        );
      }
      await client.query(`UPDATE announcement_groups SET updated_at = NOW() WHERE id = $1::uuid`, [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, count: body.tenant_ids.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcement-groups] members put', e);
    res.status(500).json({ error: 'Erro ao guardar membros' });
  }
}
