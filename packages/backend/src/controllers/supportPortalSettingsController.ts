import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { checkPermission, ModulePermissionError } from '../permissions/index.js';

const putSchema = z.object({
  enabled: z.boolean(),
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  welcome_message: z.string().max(4000).nullable().optional(),
  logo_url: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.union([z.null(), z.string().url().max(2000)]).optional(),
  ),
  primary_color: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z
      .string()
      .max(32)
      .nullable()
      .optional()
      .refine((v) => v == null || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v), {
        message: 'Cor inválida (use formato #RRGGBB).',
      }),
  ),
  default_priority: z.enum(['low', 'normal', 'high', 'urgent']),
  allowed_category_ids: z.array(z.string().uuid()).nullable().optional(),
});

function respondPerm(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

async function assertSupportPortalSettingsPermission(userId: string, req: AuthRequest): Promise<void> {
  const ticketsOk = await checkPermission(
    { userId, tenantId: req.tenantId ?? null, role: null, module: 'tickets', action: 'edit' },
    req,
  );
  if (ticketsOk) return;
  const settingsOk = await checkPermission(
    { userId, tenantId: req.tenantId ?? null, role: null, module: 'settings', action: 'edit' },
    req,
  );
  if (settingsOk) return;
  throw new ModulePermissionError(403, 'Sem permissão para configurar o portal de suporte.');
}

function publicSupportPath(slug: string): string {
  return `/suporte/${slug}`;
}

async function getTenantSlug(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ slug: string }>(`SELECT slug FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]);
  return r.rows[0]?.slug?.trim() ? String(r.rows[0].slug).trim() : null;
}

export async function getSupportPortalSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertSupportPortalSettingsPermission(userId, req);

    const tenantSlug = await getTenantSlug(tenantId);
    const slug = tenantSlug ?? '';

    const rowR = await pool.query(
      `SELECT s.*
       FROM tenant_support_portal_settings s
       WHERE s.tenant_id = $1`,
      [tenantId],
    );

    const catR = await pool.query<{ id: string; name: string }>(
      `SELECT c.id, c.name
       FROM ticket_categories c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       ORDER BY c.name ASC`,
      [tenantId],
    );

    if (rowR.rows.length === 0) {
      res.json({
        enabled: false,
        slug,
        slug_locked: true,
        title: null,
        description: null,
        welcome_message: null,
        logo_url: null,
        primary_color: null,
        default_priority: 'normal',
        allowed_category_ids: null,
        public_url: slug ? publicSupportPath(slug) : null,
        tenant_categories: catR.rows,
      });
      return;
    }

    const s = rowR.rows[0] as Record<string, unknown>;
    res.json({
      enabled: Boolean(s.enabled),
      slug,
      slug_locked: true,
      title: s.title ?? null,
      description: s.description ?? null,
      welcome_message: s.welcome_message ?? null,
      logo_url: s.logo_url ?? null,
      primary_color: s.primary_color ?? null,
      default_priority: String(s.default_priority ?? 'normal'),
      allowed_category_ids: (s.allowed_category_ids as string[] | null) ?? null,
      public_url: slug ? publicSupportPath(slug) : null,
      tenant_categories: catR.rows,
    });
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('[support-portal] getSupportPortalSettings', error);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function putSupportPortalSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertSupportPortalSettingsPermission(userId, req);

    const rawBody = req.body as Record<string, unknown>;
    const tenantSlugResolved = await getTenantSlug(tenantId);
    if (typeof rawBody.slug === 'string' && rawBody.slug.trim() !== '') {
      const want = rawBody.slug.trim().toLowerCase();
      const official = (tenantSlugResolved ?? '').trim().toLowerCase();
      if (official && want !== official) {
        res.status(400).json({ error: 'O slug do suporte público segue o slug oficial da empresa e não pode ser alterado aqui.' });
        return;
      }
    }

    const body = putSchema.parse(req.body);

    const slugForStorage = (tenantSlugResolved ?? '').trim();
    const hasValidTenantSlug = slugForStorage.length >= 2;

    if (body.enabled && !hasValidTenantSlug) {
      res.status(400).json({
        error:
          'Defina o slug da empresa (mínimo 2 caracteres) nas configurações da conta para ativar o portal.',
      });
      return;
    }

    const existingRow = await pool.query<{ slug: string }>(
      `SELECT slug FROM tenant_support_portal_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    const storedSlugFallback = (existingRow.rows[0]?.slug ?? '').trim();

    let slug = slugForStorage;
    if (!hasValidTenantSlug) {
      if (existingRow.rows.length === 0) {
        res.status(400).json({
          error: 'Defina o slug da empresa nas configurações da conta para guardar as definições do portal.',
        });
        return;
      }
      slug = storedSlugFallback;
      if (slug.length < 2) {
        res.status(400).json({ error: 'Defina o slug da empresa nas configurações da conta.' });
        return;
      }
    }

    const allowedIds = body.allowed_category_ids;
    if (allowedIds && allowedIds.length > 0) {
      const ok = await pool.query(
        `SELECT COUNT(*)::int AS n
         FROM ticket_categories c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
         WHERE c.id = ANY($2::uuid[])`,
        [tenantId, allowedIds],
      );
      const n = ok.rows[0]?.n ?? 0;
      if (n !== allowedIds.length) {
        res.status(400).json({ error: 'Uma ou mais categorias não pertencem ao tenant.' });
        return;
      }
    }

    const logoUrl = body.logo_url && body.logo_url.trim() !== '' ? body.logo_url.trim() : null;
    const primaryColor =
      body.primary_color && body.primary_color.trim() !== '' ? body.primary_color.trim() : null;

    try {
      const ins = await pool.query(
        `INSERT INTO tenant_support_portal_settings (
          tenant_id, enabled, slug, title, description, welcome_message,
          logo_url, primary_color, default_priority, allowed_category_ids
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::ticket_priority, $10::uuid[])
        ON CONFLICT (tenant_id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          slug = EXCLUDED.slug,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          welcome_message = EXCLUDED.welcome_message,
          logo_url = EXCLUDED.logo_url,
          primary_color = EXCLUDED.primary_color,
          default_priority = EXCLUDED.default_priority,
          allowed_category_ids = EXCLUDED.allowed_category_ids,
          updated_at = now()
        RETURNING *`,
        [
          tenantId,
          body.enabled,
          slug,
          body.title ?? null,
          body.description ?? null,
          body.welcome_message ?? null,
          logoUrl,
          primaryColor,
          body.default_priority,
          allowedIds && allowedIds.length > 0 ? allowedIds : null,
        ],
      );
      res.json({
        enabled: Boolean(ins.rows[0]?.enabled),
        slug: hasValidTenantSlug ? slugForStorage : '',
        slug_locked: true,
        title: ins.rows[0]?.title ?? null,
        description: ins.rows[0]?.description ?? null,
        welcome_message: ins.rows[0]?.welcome_message ?? null,
        logo_url: ins.rows[0]?.logo_url ?? null,
        primary_color: ins.rows[0]?.primary_color ?? null,
        default_priority: String(ins.rows[0]?.default_priority ?? 'normal'),
        allowed_category_ids: (ins.rows[0]?.allowed_category_ids as string[] | null) ?? null,
        public_url: hasValidTenantSlug ? publicSupportPath(slugForStorage) : null,
      });
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      if (msg === '23505') {
        res.status(409).json({ error: 'Conflito ao guardar configurações do portal.' });
        return;
      }
      throw e;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0]?.message ?? 'Dados inválidos' });
      return;
    }
    if (respondPerm(res, error)) return;
    const err = error as { message?: string };
    if (err?.message?.includes('tenant_support_portal_settings_slug')) {
      res.status(400).json({ error: 'Slug inválido ou reservado.' });
      return;
    }
    console.error('[support-portal] putSupportPortalSettings', error);
    res.status(500).json({ error: 'Erro interno' });
  }
}
