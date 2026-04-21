/**
 * Modelos de proposta (`proposal_templates`) — área exclusiva; não são linhas em `proposals`.
 * Permissões: módulo `proposals` (mesmo padrão de contract_templates + contracts).
 */
import { Response } from 'express';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';

const proposalItemSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).optional().default(0),
  total: z.number().min(0).optional(),
});

const postAcceptBillingModeSchema = z.enum(['none', 'notify_team', 'auto_pending_invoice']);

const templateBodySchema = z.object({
  name: z.string().min(1),
  default_title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  amount: z.number().min(0),
  items: z.array(proposalItemSchema).default([]),
  funnel_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  post_accept_billing_mode: postAcceptBillingModeSchema.optional(),
  is_active: z.boolean().optional(),
});

function formatRow(row: Record<string, unknown>): Record<string, unknown> {
  let items: unknown[] = [];
  const rawItems = row.items;
  if (Array.isArray(rawItems)) items = rawItems;
  else if (typeof rawItems === 'string') {
    try {
      const p = JSON.parse(rawItems);
      if (Array.isArray(p)) items = p;
    } catch {
      items = [];
    }
  }
  return {
    ...row,
    items,
    amount: row.amount != null ? parseFloat(String(row.amount)) : 0,
  };
}

export async function listProposalTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const activeOnly = String(req.query.activeOnly || '') === 'true';
    let q = `SELECT pt.* FROM proposal_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = $1
       WHERE 1=1`;
    const params: unknown[] = [tenantId];
    if (activeOnly) {
      q += ' AND pt.is_active = true';
    }
    q += ' ORDER BY pt.name ASC';
    const r = await pool.query(q, params);
    res.json(r.rows.map((row) => formatRow(row as Record<string, unknown>)));
  } catch (e) {
    console.error('[proposalTemplates] list', e);
    res.status(500).json({ error: 'Erro ao listar modelos' });
  }
}

export async function getProposalTemplateById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const r = await pool.query(
      `SELECT pt.* FROM proposal_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE pt.id = $1`,
      [id, userId],
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Modelo não encontrado' });
      return;
    }
    res.json(formatRow(r.rows[0] as Record<string, unknown>));
  } catch (e) {
    console.error('[proposalTemplates] get', e);
    res.status(500).json({ error: 'Erro ao carregar modelo' });
  }
}

export async function createProposalTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const body = templateBodySchema.parse(req.body);
    await assertModulePermission(userId, 'proposals', 'create', undefined, req);

    const postMode = body.post_accept_billing_mode ?? 'none';
    const r = await pool.query(
      `INSERT INTO proposal_templates (
        user_id, name, default_title, description, amount, items, funnel_id, stage_id,
        post_accept_billing_mode, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        body.name.trim(),
        body.default_title?.trim() || null,
        body.description?.trim() || null,
        body.amount,
        JSON.stringify(body.items ?? []),
        body.funnel_id ?? null,
        body.stage_id ?? null,
        postMode,
        body.is_active !== false,
      ],
    );
    res.status(201).json(formatRow(r.rows[0] as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors.map((x) => x.message).join('; ') });
      return;
    }
    const pg = error as { code?: string };
    if (pg?.code === '42P01') {
      res.status(503).json({ error: 'Execute as migrações (128_proposal_templates.sql).' });
      return;
    }
    console.error('[proposalTemplates] create', error);
    res.status(500).json({ error: 'Erro ao criar modelo' });
  }
}

export async function updateProposalTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = templateBodySchema.partial().parse(req.body);

    const existing = await pool.query<{ user_id: string }>(
      `SELECT pt.user_id FROM proposal_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE pt.id = $1`,
      [id, userId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Modelo não encontrado' });
      return;
    }
    const ownerId = existing.rows[0].user_id;
    await assertModulePermission(userId, 'proposals', 'edit', { ownerId }, req);

    const sets: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    if (body.name !== undefined) {
      sets.push(`name = $${n++}`);
      params.push(body.name.trim());
    }
    if (body.default_title !== undefined) {
      sets.push(`default_title = $${n++}`);
      params.push(body.default_title?.trim() || null);
    }
    if (body.description !== undefined) {
      sets.push(`description = $${n++}`);
      params.push(body.description?.trim() || null);
    }
    if (body.amount !== undefined) {
      sets.push(`amount = $${n++}`);
      params.push(body.amount);
    }
    if (body.items !== undefined) {
      sets.push(`items = $${n++}::jsonb`);
      params.push(JSON.stringify(body.items));
    }
    if (body.funnel_id !== undefined) {
      sets.push(`funnel_id = $${n++}`);
      params.push(body.funnel_id);
    }
    if (body.stage_id !== undefined) {
      sets.push(`stage_id = $${n++}`);
      params.push(body.stage_id);
    }
    if (body.post_accept_billing_mode !== undefined) {
      sets.push(`post_accept_billing_mode = $${n++}`);
      params.push(body.post_accept_billing_mode);
    }
    if (body.is_active !== undefined) {
      sets.push(`is_active = $${n++}`);
      params.push(body.is_active);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nada para atualizar' });
      return;
    }
    params.push(id);
    const r = await pool.query(
      `UPDATE proposal_templates SET ${sets.join(', ')} WHERE id = $${n} RETURNING *`,
      params,
    );
    res.json(formatRow(r.rows[0] as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors.map((x) => x.message).join('; ') });
      return;
    }
    console.error('[proposalTemplates] update', error);
    res.status(500).json({ error: 'Erro ao atualizar modelo' });
  }
}

export async function deleteProposalTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query<{ user_id: string }>(
      `SELECT pt.user_id FROM proposal_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE pt.id = $1`,
      [id, userId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Modelo não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'delete', { ownerId: existing.rows[0].user_id }, req);
    await pool.query(`DELETE FROM proposal_templates WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[proposalTemplates] delete', error);
    res.status(500).json({ error: 'Erro ao excluir modelo' });
  }
}
