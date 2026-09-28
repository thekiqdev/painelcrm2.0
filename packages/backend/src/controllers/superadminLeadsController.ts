import type { Response } from 'express';
import type { PoolClient } from 'pg';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { z } from 'zod';
import { prepareSuperadminClientsFromCsv, prepareSuperadminLeadsFromCsv } from '../services/superadmin/superadminLeadCsvImport.js';

const createLeadSchema = z.object({
  name: z.string().min(1).max(500),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  company: z.string().max(500).optional().nullable(),
  source: z.string().max(500).optional().nullable(),
  status: z.string().max(200).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});

const patchLeadSchema = createLeadSchema.partial();

const importCsvSchema = z.object({
  csv_text: z.string().min(1).max(12_000_000),
});

const groupCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
});

const groupPatchSchema = groupCreateSchema.partial();

const membersSchema = z.object({
  lead_ids: z.array(z.string().uuid()),
});

async function ensureLeadGroupByName(client: PoolClient, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const found = await client.query<{ id: string }>(
    `SELECT id::text FROM superadmin_lead_groups WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
    [trimmed]
  );
  if (found.rows[0]?.id) return found.rows[0].id;
  const ins = await client.query<{ id: string }>(
    `INSERT INTO superadmin_lead_groups (name) VALUES ($1) RETURNING id::text`,
    [trimmed]
  );
  return ins.rows[0]?.id ?? null;
}

async function attachLeadToGroup(client: PoolClient, groupId: string, leadId: string): Promise<void> {
  await client.query(
    `INSERT INTO superadmin_lead_group_members (group_id, lead_id) VALUES ($1::uuid, $2::uuid)
     ON CONFLICT (group_id, lead_id) DO NOTHING`,
    [groupId, leadId]
  );
}

export async function listSuperadminLeads(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT l.id::text,
              l.name,
              l.email,
              l.phone,
              l.company,
              l.source,
              l.status,
              l.import_kind,
              l.assignee_label,
              l.active_label,
              l.created_at::text,
              COALESCE(
                (SELECT string_agg(g.name, ', ' ORDER BY g.name)
                 FROM superadmin_lead_group_members m
                 INNER JOIN superadmin_lead_groups g ON g.id = m.group_id
                 WHERE m.lead_id = l.id),
                ''
              ) AS group_names
       FROM superadmin_leads l
       ORDER BY l.created_at DESC
       LIMIT 800`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[superadmin-leads] list', e);
    res.status(500).json({ error: 'Erro ao listar leads' });
  }
}

export async function createSuperadminLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = createLeadSchema.parse(req.body);
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO superadmin_leads (
         name, email, phone, company, source, status, notes, import_kind
       ) VALUES ($1, $2, $3, $4, COALESCE($5, 'Manual'), $6, $7, 'lead_csv')
       RETURNING id::text`,
      [
        body.name,
        body.email ?? null,
        body.phone ?? null,
        body.company ?? null,
        body.source ?? null,
        body.status ?? null,
        body.notes ?? null,
      ]
    );
    res.status(201).json({ id: ins.rows[0]!.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[superadmin-leads] create', e);
    res.status(500).json({ error: 'Erro ao criar lead' });
  }
}

export async function patchSuperadminLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = patchLeadSchema.parse(req.body);
    const r = await pool.query(
      `UPDATE superadmin_leads SET
         name = COALESCE($2, name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         company = COALESCE($5, company),
         source = COALESCE($6, source),
         status = COALESCE($7, status),
         notes = COALESCE($8, notes),
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [
        id,
        body.name ?? null,
        body.email === undefined ? null : body.email,
        body.phone === undefined ? null : body.phone,
        body.company === undefined ? null : body.company,
        body.source === undefined ? null : body.source,
        body.status === undefined ? null : body.status,
        body.notes === undefined ? null : body.notes,
      ]
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[superadmin-leads] patch', e);
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
}

export async function deleteSuperadminLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const r = await pool.query(`DELETE FROM superadmin_leads WHERE id = $1::uuid RETURNING id`, [id]);
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '23503') {
      res.status(409).json({ error: 'Lead referenciado em envios de anúncio — não é possível excluir.' });
      return;
    }
    console.error('[superadmin-leads] delete', e);
    res.status(500).json({ error: 'Erro ao excluir lead' });
  }
}

export async function importSuperadminLeadsCsv(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = importCsvSchema.parse(req.body);
    const { prepared, skipped } = prepareSuperadminLeadsFromCsv(body.csv_text);

    const client = await pool.connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      for (const row of prepared) {
        const p = row.payload;
        const ins = await client.query<{ id: string }>(
          `INSERT INTO superadmin_leads (
             name, email, phone, company, source, status, notes, assignee_label, import_kind
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'lead_csv')
           RETURNING id::text`,
          [
            p.name,
            p.email,
            p.phone,
            p.company,
            p.source,
            p.status,
            p.notes,
            p.assignee_label,
          ]
        );
        const leadId = ins.rows[0]!.id;
        inserted += 1;
        if (p.group_name) {
          const gid = await ensureLeadGroupByName(client, p.group_name);
          if (gid) await attachLeadToGroup(client, gid, leadId);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({
      inserted,
      skipped_count: skipped.length,
      skipped_preview: skipped.slice(0, 50),
      warns_preview: prepared.filter((x) => x.warn).slice(0, 20),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[superadmin-leads] import leads csv', e);
    res.status(500).json({ error: 'Erro ao importar CSV de leads' });
  }
}

export async function importSuperadminClientsCsv(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = importCsvSchema.parse(req.body);
    const { prepared, skipped } = prepareSuperadminClientsFromCsv(body.csv_text);

    const client = await pool.connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      for (const row of prepared) {
        const p = row.payload;
        const ins = await client.query<{ id: string }>(
          `INSERT INTO superadmin_leads (
             name, email, phone, company, source, status, import_kind, active_label
           ) VALUES ($1, $2, $3, $4, 'Importação clientes CSV', $5, 'client_csv', $6)
           RETURNING id::text`,
          [p.name, p.email, p.phone, p.company, p.active_label, p.active_label]
        );
        const leadId = ins.rows[0]!.id;
        inserted += 1;
        if (p.group_name) {
          const gid = await ensureLeadGroupByName(client, p.group_name);
          if (gid) await attachLeadToGroup(client, gid, leadId);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({
      inserted,
      skipped_count: skipped.length,
      skipped_preview: skipped.slice(0, 50),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[superadmin-leads] import clients csv', e);
    res.status(500).json({ error: 'Erro ao importar CSV de clientes' });
  }
}

export async function listSuperadminLeadGroups(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT g.id::text, g.name, g.description, g.is_active, g.created_at::text, g.updated_at::text,
              COUNT(m.lead_id)::text AS member_count
       FROM superadmin_lead_groups g
       LEFT JOIN superadmin_lead_group_members m ON m.group_id = g.id
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
    console.error('[superadmin-lead-groups] list', e);
    res.status(500).json({ error: 'Erro ao listar grupos' });
  }
}

export async function createSuperadminLeadGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = groupCreateSchema.parse(req.body);
    const r = await pool.query<{ id: string }>(
      `INSERT INTO superadmin_lead_groups (name, description, is_active)
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
    console.error('[superadmin-lead-groups] create', e);
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
}

export async function patchSuperadminLeadGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = groupPatchSchema.parse(req.body);
    const r = await pool.query(
      `UPDATE superadmin_lead_groups SET
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
    console.error('[superadmin-lead-groups] patch', e);
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
}

export async function getSuperadminLeadGroupMembers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const r = await pool.query<{ lead_id: string }>(
      `SELECT lead_id::text FROM superadmin_lead_group_members WHERE group_id = $1::uuid`,
      [id]
    );
    res.json({ lead_ids: r.rows.map((x) => x.lead_id) });
  } catch (e) {
    console.error('[superadmin-lead-groups] members get', e);
    res.status(500).json({ error: 'Erro ao carregar membros' });
  }
}

export async function putSuperadminLeadGroupMembers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = membersSchema.parse(req.body);
    const g = await pool.query(`SELECT id FROM superadmin_lead_groups WHERE id = $1::uuid LIMIT 1`, [id]);
    if (g.rows.length === 0) {
      res.status(404).json({ error: 'Grupo não encontrado' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM superadmin_lead_group_members WHERE group_id = $1::uuid`, [id]);
      for (const lid of body.lead_ids) {
        const ok = await client.query(`SELECT 1 FROM superadmin_leads WHERE id = $1::uuid LIMIT 1`, [lid]);
        if (ok.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: `Lead inválido: ${lid}` });
          return;
        }
        await client.query(
          `INSERT INTO superadmin_lead_group_members (group_id, lead_id) VALUES ($1::uuid, $2::uuid)`,
          [id, lid]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[superadmin-lead-groups] members put', e);
    res.status(500).json({ error: 'Erro ao guardar membros' });
  }
}

/** Lista id + nome + telefone para seleção em grupos (sem paginação pesada). */
export async function listSuperadminLeadsPicker(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT id::text, name, phone, email, company FROM superadmin_leads ORDER BY name ASC LIMIT 5000`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[superadmin-leads] picker', e);
    res.status(500).json({ error: 'Erro ao listar leads' });
  }
}

/** Grupos ativos para disparo de anúncios (com contagem de leads com telefone). */
export async function listSuperadminLeadGroupsForAnnouncements(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT g.id::text,
              g.name,
              COUNT(DISTINCT l.id) FILTER (
                WHERE NULLIF(regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g'), '') IS NOT NULL
                  AND length(regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g')) >= 8
              )::text AS reachable_count
       FROM superadmin_lead_groups g
       INNER JOIN superadmin_lead_group_members m ON m.group_id = g.id
       INNER JOIN superadmin_leads l ON l.id = m.lead_id
       WHERE g.is_active = true
       GROUP BY g.id
       HAVING COUNT(DISTINCT l.id) > 0
       ORDER BY g.name ASC`
    );
    res.json(
      r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        reachable_count: Number(row.reachable_count ?? 0),
      }))
    );
  } catch (e) {
    console.error('[superadmin-leads] announcement groups', e);
    res.status(500).json({ error: 'Erro ao listar grupos de leads' });
  }
}
