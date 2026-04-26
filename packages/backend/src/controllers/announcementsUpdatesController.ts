import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { z } from 'zod';
import * as notificationService from '../services/notifications.js';

function buildVisibilityClause(
  isSuperAdmin: boolean,
  tenantId: string | null,
  params: unknown[],
): string {
  if (isSuperAdmin) return 'TRUE';
  if (!tenantId) return 'FALSE';
  params.push(tenantId);
  return `(a.visibility_group_id IS NULL OR EXISTS (
      SELECT 1 FROM announcement_group_members m
      WHERE m.group_id = a.visibility_group_id AND m.tenant_id = $${params.length}::uuid
    ))`;
}

function readSelectSql(isSuper: boolean, userId: string | null, params: unknown[]): string {
  if (isSuper) return 'TRUE AS read';
  if (!userId) return 'FALSE AS read';
  params.push(userId);
  return `(EXISTS (
      SELECT 1 FROM announcement_reads ar
      WHERE ar.announcement_id = a.id AND ar.user_id = $${params.length}::uuid
    )) AS read`;
}

export async function listPublishedUpdates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const isSuper = req.user?.is_super_admin === true;
    const tenantId = req.tenantId ?? null;
    const userId = req.userId ?? null;
    const params: unknown[] = [];
    const vis = buildVisibilityClause(isSuper, tenantId, params);
    const readSel = readSelectSql(isSuper, userId, params);

    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    let catClause = '';
    if (category && ['novidade', 'melhoria', 'correcao', 'aviso'].includes(category)) {
      params.push(category);
      catClause = `AND a.category = $${params.length}`;
    }

    const r = await pool.query(
      `SELECT
         a.id::text,
         a.title,
         a.type,
         a.page_summary,
         a.category,
         a.banner_url,
         a.featured,
         a.version,
         a.published_at::text,
         a.created_at::text,
         ${readSel}
       FROM announcements a
       WHERE a.status = 'published'
         AND a.type = 'whatsapp_and_updates_page'
         AND a.published_at IS NOT NULL
         AND (${vis})
         ${catClause}
       ORDER BY a.published_at DESC, a.created_at DESC
       LIMIT 100`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[announcements/updates] list', e);
    res.status(500).json({ error: 'Erro ao listar atualizações' });
  }
}

export async function getPublishedUpdate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const isSuper = req.user?.is_super_admin === true;
    const tenantId = req.tenantId ?? null;
    const params: unknown[] = [];
    const vis = buildVisibilityClause(isSuper, tenantId, params);
    params.push(id);

    const r = await pool.query(
      `SELECT
         a.id::text,
         a.title,
         a.type,
         a.page_summary,
         a.page_content,
         a.category,
         a.banner_url,
         a.featured,
         a.version,
         a.published_at::text,
         a.created_at::text
       FROM announcements a
       WHERE a.id = $${params.length}::uuid
         AND a.status = 'published'
         AND a.type = 'whatsapp_and_updates_page'
         AND a.published_at IS NOT NULL
         AND (${vis})
       LIMIT 1`,
      params
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    console.error('[announcements/updates] get', e);
    res.status(500).json({ error: 'Erro ao carregar atualização' });
  }
}

export async function getUpdatesUnreadCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const isSuper = req.user?.is_super_admin === true;
    if (isSuper) {
      res.json({ count: 0 });
      return;
    }
    const tenantId = req.tenantId ?? null;
    const userId = req.userId ?? null;
    if (!tenantId || !userId) {
      res.json({ count: 0 });
      return;
    }
    const params: unknown[] = [];
    const vis = buildVisibilityClause(false, tenantId, params);
    params.push(userId);
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM announcements a
       WHERE a.status = 'published'
         AND a.type = 'whatsapp_and_updates_page'
         AND a.published_at IS NOT NULL
         AND (${vis})
         AND NOT EXISTS (
           SELECT 1 FROM announcement_reads ar
           WHERE ar.announcement_id = a.id AND ar.user_id = $${params.length}::uuid
         )`,
      params
    );
    res.json({ count: parseInt(r.rows[0]?.count ?? '0', 10) });
  } catch (e) {
    console.error('[announcements/updates] unread-count', e);
    res.status(500).json({ error: 'Erro ao contar não lidas' });
  }
}

const markReadsBody = z.object({
  announcement_ids: z.array(z.string().uuid()).optional(),
});

export async function postMarkUpdatesRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const isSuper = req.user?.is_super_admin === true;
    if (isSuper) {
      res.json({ marked: 0 });
      return;
    }
    const tenantId = req.tenantId ?? null;
    const userId = req.userId ?? null;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Tenant necessário para marcar leituras' });
      return;
    }
    const body = markReadsBody.parse(req.body ?? {});
    const params: unknown[] = [];
    const vis = buildVisibilityClause(false, tenantId, params);

    let ids: string[];
    if (body.announcement_ids && body.announcement_ids.length > 0) {
      ids = body.announcement_ids;
    } else {
      const listR = await pool.query<{ id: string }>(
        `SELECT a.id::text
         FROM announcements a
         WHERE a.status = 'published'
           AND a.type = 'whatsapp_and_updates_page'
           AND a.published_at IS NOT NULL
           AND (${vis})
         ORDER BY a.published_at DESC
         LIMIT 500`,
        params
      );
      ids = listR.rows.map((x) => x.id);
    }

    if (ids.length === 0) {
      res.json({ marked: 0 });
      return;
    }

    const verifyParams: unknown[] = [...params, ids];
    const anyIdx = params.length + 1;
    const okR = await pool.query<{ id: string }>(
      `SELECT a.id::text
       FROM announcements a
       WHERE a.id = ANY($${anyIdx}::uuid[])
         AND a.status = 'published'
         AND a.type = 'whatsapp_and_updates_page'
         AND a.published_at IS NOT NULL
         AND (${vis})`,
      verifyParams
    );
    const allowed = okR.rows.map((x) => x.id);
    if (allowed.length === 0) {
      res.json({ marked: 0 });
      return;
    }

    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, tenant_id, user_id)
       SELECT x::uuid, $1::uuid, $2::uuid
       FROM unnest($3::uuid[]) AS t(x)
       ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [tenantId, userId, allowed]
    );

    await notificationService.markAnnouncementNotificationsAsReadForUser(userId, allowed);

    res.json({ marked: allowed.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcements/updates] mark-read', e);
    res.status(500).json({ error: 'Erro ao marcar leituras' });
  }
}
