import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';

const templateTypeSchema = z.enum(['internal', 'whatsapp_official']);

function normalizeSlug(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  return t.length > 0 ? t.slice(0, 120) : null;
}

function normalizeVariables(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const s = x.trim().slice(0, 64);
    if (s) out.push(s);
  }
  return out.slice(0, 50);
}

const createSchema = z
  .object({
    template_type: templateTypeSchema,
    name: z.string().min(1, 'Nome é obrigatório').max(200),
    slug: z.string().max(120).optional().nullable(),
    category: z.string().max(120).optional().nullable(),
    content: z.string().min(1, 'Conteúdo é obrigatório').max(20000),
    variables: z.array(z.string().max(64)).max(50).optional(),
    is_active: z.boolean().optional().default(true),
    metadata: z.record(z.unknown()).optional(),
    provider_template_name: z.string().max(200).optional().nullable(),
    provider_language: z.string().max(32).optional().nullable(),
    provider_category: z.string().max(120).optional().nullable(),
    provider_status: z.string().max(64).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.template_type === 'whatsapp_official') {
      if (!data.provider_template_name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Nome técnico do template (provedor) é obrigatório para template oficial.',
          path: ['provider_template_name'],
        });
      }
      if (!data.provider_language?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Idioma é obrigatório para template oficial.',
          path: ['provider_language'],
        });
      }
    }
  });

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z.string().max(120).optional().nullable(),
    category: z.string().max(120).optional().nullable(),
    content: z.string().min(1).max(20000).optional(),
    variables: z.array(z.string().max(64)).max(50).optional(),
    is_active: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
    provider_template_name: z.string().max(200).optional().nullable(),
    provider_language: z.string().max(32).optional().nullable(),
    provider_category: z.string().max(120).optional().nullable(),
    provider_status: z.string().max(64).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasOfficialField =
      data.provider_template_name !== undefined ||
      data.provider_language !== undefined ||
      data.provider_category !== undefined ||
      data.provider_status !== undefined;
    if (!hasOfficialField) return;
    const nameOk = data.provider_template_name === undefined || !!data.provider_template_name?.trim();
    const langOk = data.provider_language === undefined || !!data.provider_language?.trim();
    if (!nameOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nome técnico não pode ser vazio.',
        path: ['provider_template_name'],
      });
    }
    if (!langOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Idioma não pode ser vazio.',
        path: ['provider_language'],
      });
    }
  });

type Row = {
  id: string;
  tenant_id: string;
  template_type: string;
  name: string;
  slug: string | null;
  category: string | null;
  content: string;
  variables: unknown;
  is_active: boolean;
  metadata: unknown;
  provider_template_name: string | null;
  provider_language: string | null;
  provider_category: string | null;
  provider_status: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToApi(r: Row) {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    template_type: r.template_type,
    name: r.name,
    slug: r.slug,
    category: r.category,
    content: r.content,
    variables: Array.isArray(r.variables) ? r.variables : [],
    is_active: r.is_active,
    metadata: r.metadata && typeof r.metadata === 'object' ? r.metadata : {},
    provider_template_name: r.provider_template_name,
    provider_language: r.provider_language,
    provider_category: r.provider_category,
    provider_status: r.provider_status,
    created_by_user_id: r.created_by_user_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listTenantChatTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa não disponível' });
      return;
    }

    const typeRaw = typeof req.query.type === 'string' ? req.query.type : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const activeRaw = typeof req.query.is_active === 'string' ? req.query.is_active : '';

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (typeRaw === 'internal' || typeRaw === 'whatsapp_official') {
      conditions.push(`template_type = $${i}`);
      params.push(typeRaw);
      i += 1;
    }

    if (activeRaw === 'true' || activeRaw === 'false') {
      conditions.push(`is_active = $${i}`);
      params.push(activeRaw === 'true');
      i += 1;
    }

    if (q.length > 0) {
      conditions.push(`name ILIKE $${i}`);
      params.push(`%${q}%`);
      i += 1;
    }

    const sql = `
      SELECT *
      FROM tenant_chat_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC, name ASC
    `;
    const result = await pool.query<Row>(sql, params);
    res.json({ items: result.rows.map(rowToApi) });
  } catch (e: any) {
    if (e?.code === '42P01') {
      res.status(503).json({ error: 'Migração pendente: modelos de chat da empresa' });
      return;
    }
    console.error('[tenantChatTemplates] list', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar templates' });
  }
}

export async function getTenantChatTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa não disponível' });
      return;
    }
    const { id } = req.params;
    const result = await pool.query<Row>(
      `SELECT * FROM tenant_chat_templates WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenantId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }
    res.json(rowToApi(result.rows[0]));
  } catch (e: any) {
    console.error('[tenantChatTemplates] get', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function createTenantChatTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Sessão inválida' });
      return;
    }

    const body = createSchema.parse(req.body || {});
    const slug = normalizeSlug(body.slug ?? null);
    const variables = normalizeVariables(body.variables);
    const meta =
      body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    const result = await pool.query<Row>(
      `
      INSERT INTO tenant_chat_templates (
        tenant_id, template_type, name, slug, category, content, variables, is_active, metadata,
        provider_template_name, provider_language, provider_category, provider_status,
        created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12,$13,$14)
      RETURNING *
      `,
      [
        tenantId,
        body.template_type,
        body.name.trim(),
        slug,
        body.category?.trim() || null,
        body.content,
        JSON.stringify(variables),
        body.is_active !== false,
        JSON.stringify(meta),
        body.template_type === 'whatsapp_official' ? body.provider_template_name?.trim() ?? null : null,
        body.template_type === 'whatsapp_official' ? body.provider_language?.trim() ?? null : null,
        body.provider_category?.trim() || null,
        body.provider_status?.trim() || null,
        userId,
      ],
    );

    res.status(201).json(rowToApi(result.rows[0]));
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    const err = e as { code?: string; message?: string };
    if (err.code === '23505') {
      res.status(409).json({ error: 'Já existe template com este nome ou slug neste tipo.' });
      return;
    }
    if (err.code === '42P01') {
      res.status(503).json({ error: 'Migração pendente' });
      return;
    }
    console.error('[tenantChatTemplates] create', e);
    res.status(500).json({ error: err?.message || 'Erro ao criar' });
  }
}

export async function patchTenantChatTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa não disponível' });
      return;
    }
    const { id } = req.params;
    const body = patchSchema.parse(req.body || {});

    const existing = await pool.query<Pick<Row, 'id' | 'template_type'>>(
      `SELECT id, template_type FROM tenant_chat_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }
    const kind = existing.rows[0].template_type;

    const sets: string[] = [];
    const params: unknown[] = [];
    let n = 1;

    if (body.name !== undefined) {
      sets.push(`name = $${n}`);
      params.push(body.name.trim());
      n += 1;
    }
    if (body.slug !== undefined) {
      sets.push(`slug = $${n}`);
      params.push(normalizeSlug(body.slug));
      n += 1;
    }
    if (body.category !== undefined) {
      sets.push(`category = $${n}`);
      params.push(body.category?.trim() || null);
      n += 1;
    }
    if (body.content !== undefined) {
      sets.push(`content = $${n}`);
      params.push(body.content);
      n += 1;
    }
    if (body.variables !== undefined) {
      sets.push(`variables = $${n}::jsonb`);
      params.push(JSON.stringify(normalizeVariables(body.variables)));
      n += 1;
    }
    if (body.is_active !== undefined) {
      sets.push(`is_active = $${n}`);
      params.push(body.is_active);
      n += 1;
    }
    if (body.metadata !== undefined) {
      sets.push(`metadata = $${n}::jsonb`);
      params.push(JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}));
      n += 1;
    }

    if (kind === 'whatsapp_official') {
      if (body.provider_template_name !== undefined) {
        sets.push(`provider_template_name = $${n}`);
        params.push(body.provider_template_name?.trim() || null);
        n += 1;
      }
      if (body.provider_language !== undefined) {
        sets.push(`provider_language = $${n}`);
        params.push(body.provider_language?.trim() || null);
        n += 1;
      }
      if (body.provider_category !== undefined) {
        sets.push(`provider_category = $${n}`);
        params.push(body.provider_category?.trim() || null);
        n += 1;
      }
      if (body.provider_status !== undefined) {
        sets.push(`provider_status = $${n}`);
        params.push(body.provider_status?.trim() || null);
        n += 1;
      }
    }

    if (sets.length === 0) {
      const r = await pool.query<Row>(
        `SELECT * FROM tenant_chat_templates WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      res.json(rowToApi(r.rows[0]));
      return;
    }

    params.push(id, tenantId);
    const result = await pool.query<Row>(
      `UPDATE tenant_chat_templates SET ${sets.join(', ')}
       WHERE id = $${n} AND tenant_id = $${n + 1}
       RETURNING *`,
      params,
    );
    res.json(rowToApi(result.rows[0]));
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    const err = e as { code?: string; message?: string };
    if (err.code === '23505') {
      res.status(409).json({ error: 'Conflito de nome ou slug.' });
      return;
    }
    console.error('[tenantChatTemplates] patch', e);
    res.status(500).json({ error: err?.message || 'Erro ao atualizar' });
  }
}

export async function deleteTenantChatTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa não disponível' });
      return;
    }
    const { id } = req.params;
    const del = await pool.query(`DELETE FROM tenant_chat_templates WHERE id = $1 AND tenant_id = $2`, [
      id,
      tenantId,
    ]);
    if (del.rowCount === 0) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }
    res.status(204).send();
  } catch (e: any) {
    console.error('[tenantChatTemplates] delete', e);
    res.status(500).json({ error: e?.message || 'Erro ao excluir' });
  }
}
