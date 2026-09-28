import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest, requireTenantId } from '../middleware/auth.js';

const createSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(120),
  color: z.string().max(32).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(32).optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function listWhatsappTemplateCategories(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const r = await pool.query(
      `SELECT id, tenant_id, name, color, is_active, created_at, updated_at
       FROM whatsapp_template_categories
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId],
    );
    res.json({ items: r.rows });
  } catch (e: any) {
    if (e?.code === '42P01') {
      res.status(503).json({ error: 'Migração pendente: whatsapp_template_categories' });
      return;
    }
    console.error('[whatsappTemplateCategories] list', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar categorias' });
  }
}

export async function createWhatsappTemplateCategory(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const body = createSchema.parse(req.body || {});
    const r = await pool.query(
      `INSERT INTO whatsapp_template_categories (tenant_id, name, color, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, name, color, is_active, created_at, updated_at`,
      [tenantId, body.name.trim(), body.color?.trim() || null, body.is_active],
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Já existe uma categoria com este nome.' });
      return;
    }
    if (e?.code === '42P01') {
      res.status(503).json({ error: 'Migração pendente' });
      return;
    }
    console.error('[whatsappTemplateCategories] create', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar categoria' });
  }
}

export async function patchWhatsappTemplateCategory(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const { id } = req.params;
  try {
    const body = patchSchema.parse(req.body || {});
    const sets: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    if (body.name !== undefined) {
      sets.push(`name = $${n++}`);
      params.push(body.name.trim());
    }
    if (body.color !== undefined) {
      sets.push(`color = $${n++}`);
      params.push(body.color?.trim() || null);
    }
    if (body.is_active !== undefined) {
      sets.push(`is_active = $${n++}`);
      params.push(body.is_active);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }
    params.push(id, tenantId);
    const r = await pool.query(
      `UPDATE whatsapp_template_categories SET ${sets.join(', ')}
       WHERE id = $${n++} AND tenant_id = $${n}
       RETURNING id, tenant_id, name, color, is_active, created_at, updated_at`,
      params,
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Categoria não encontrada' });
      return;
    }
    res.json(r.rows[0]);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Já existe uma categoria com este nome.' });
      return;
    }
    console.error('[whatsappTemplateCategories] patch', e);
    res.status(500).json({ error: e?.message || 'Erro ao atualizar' });
  }
}

export async function deleteWhatsappTemplateCategory(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const { id } = req.params;
  try {
    const use = await pool.query(
      `SELECT COUNT(*)::int AS c FROM whatsapp_message_templates WHERE category_id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if ((use.rows[0]?.c ?? 0) > 0) {
      res.status(409).json({
        error: 'Não é possível eliminar: existem templates nesta categoria. Reassigne ou apague os templates primeiro.',
      });
      return;
    }
    const del = await pool.query(
      `DELETE FROM whatsapp_template_categories WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (del.rowCount === 0) {
      res.status(404).json({ error: 'Categoria não encontrada' });
      return;
    }
    res.status(204).send();
  } catch (e: any) {
    console.error('[whatsappTemplateCategories] delete', e);
    res.status(500).json({ error: e?.message || 'Erro ao eliminar' });
  }
}
