import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { z } from 'zod';
import { notifyEligibleUsersForPublishedAnnouncement } from '../services/announcements/announcementPublishedNotifications.js';

const announcementType = z.enum(['whatsapp_only', 'whatsapp_and_updates_page']);
const categoryEnum = z.enum(['novidade', 'melhoria', 'correcao', 'aviso']);

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(500),
  type: announcementType,
  whatsapp_message: z.string().max(8000).default(''),
  page_summary: z.string().max(4000).optional().nullable(),
  page_content: z.string().max(200000).optional().nullable(),
  category: categoryEnum.optional().nullable(),
  banner_url: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  featured: z.boolean().optional(),
  version: z.string().max(80).optional().nullable(),
  visibility_group_id: z.string().uuid().optional().nullable(),
});

const patchAnnouncementSchema = createAnnouncementSchema.partial();

const sendSchema = z.object({
  group_id: z.string().uuid(),
  delay_seconds: z.number().int().min(0).max(3600).optional().default(5),
  scheduled_start_at: z.string().optional().nullable(),
});

async function resolvePhonesForTenants(tenantIds: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  if (tenantIds.length === 0) return m;
  const r = await pool.query<{ tenant_id: string; phone: string | null }>(
    `SELECT DISTINCT ON (u.tenant_id)
       u.tenant_id::text AS tenant_id,
       NULLIF(regexp_replace(COALESCE(u.whatsapp_number, p.whatsapp_number, ''), '\\D', '', 'g'), '') AS phone
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.tenant_id = ANY($1::uuid[])
     ORDER BY u.tenant_id, (COALESCE(u.whatsapp_number, p.whatsapp_number, '') <> '') DESC, u.created_at ASC`,
    [tenantIds]
  );
  for (const row of r.rows) {
    m.set(row.tenant_id, row.phone || null);
  }
  for (const id of tenantIds) {
    if (!m.has(id)) m.set(id, null);
  }
  return m;
}

export async function listAnnouncements(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT
         a.id::text,
         a.title,
         a.type,
         a.status,
         a.category,
         a.featured,
         a.published_at::text,
         a.created_at::text,
         a.updated_at::text,
         a.visibility_group_id::text
       FROM announcements a
       ORDER BY a.created_at DESC`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[announcements] list', e);
    res.status(500).json({ error: 'Erro ao listar anúncios' });
  }
}

export async function getAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const r = await pool.query(`SELECT * FROM announcements WHERE id = $1::uuid LIMIT 1`, [id]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    console.error('[announcements] get', e);
    res.status(500).json({ error: 'Erro ao carregar anúncio' });
  }
}

export async function createAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = createAnnouncementSchema.parse(req.body);
    const uid = req.userId ?? null;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO announcements (
         title, type, whatsapp_message, page_summary, page_content, category, banner_url, featured, version,
         visibility_group_id, status, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, COALESCE($8, false), $9,
         $10, 'draft', $11, $11
       ) RETURNING id::text`,
      [
        body.title,
        body.type,
        body.whatsapp_message,
        body.page_summary ?? null,
        body.page_content ?? null,
        body.category ?? null,
        body.banner_url ?? null,
        body.featured,
        body.version ?? null,
        body.visibility_group_id ?? null,
        uid,
      ]
    );
    res.status(201).json({ id: r.rows[0]!.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcements] create', e);
    res.status(500).json({ error: 'Erro ao criar anúncio' });
  }
}

export async function patchAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = patchAnnouncementSchema.parse(req.body);
    const uid = req.userId ?? null;
    const r = await pool.query(
      `UPDATE announcements SET
         title = COALESCE($2, title),
         type = COALESCE($3, type),
         whatsapp_message = COALESCE($4, whatsapp_message),
         page_summary = COALESCE($5, page_summary),
         page_content = COALESCE($6, page_content),
         category = COALESCE($7, category),
         banner_url = COALESCE($8, banner_url),
         featured = COALESCE($9, featured),
         version = COALESCE($10, version),
         visibility_group_id = COALESCE($11, visibility_group_id),
         updated_by = $12,
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [
        id,
        body.title ?? null,
        body.type ?? null,
        body.whatsapp_message ?? null,
        body.page_summary === undefined ? null : body.page_summary,
        body.page_content === undefined ? null : body.page_content,
        body.category === undefined ? null : body.category,
        body.banner_url === undefined ? null : body.banner_url,
        body.featured ?? null,
        body.version === undefined ? null : body.version,
        body.visibility_group_id === undefined ? null : body.visibility_group_id,
        uid,
      ]
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcements] patch', e);
    res.status(500).json({ error: 'Erro ao atualizar anúncio' });
  }
}

export async function publishAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const uid = req.userId ?? null;
    const r = await pool.query(
      `UPDATE announcements SET
         status = 'published',
         published_at = NOW(),
         updated_by = $2,
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [id, uid]
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    void notifyEligibleUsersForPublishedAnnouncement(id).catch((err) =>
      console.error('[announcements] notify on publish', err),
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[announcements] publish', e);
    res.status(500).json({ error: 'Erro ao publicar' });
  }
}

export async function unpublishAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const uid = req.userId ?? null;
    const r = await pool.query(
      `UPDATE announcements SET
         status = 'unpublished',
         updated_by = $2,
         updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [id, uid]
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[announcements] unpublish', e);
    res.status(500).json({ error: 'Erro ao despublicar' });
  }
}

export async function deleteAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const r = await pool.query<{ status: string }>(
      `SELECT status FROM announcements WHERE id = $1::uuid LIMIT 1`,
      [id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    if (r.rows[0]!.status === 'published') {
      res.status(409).json({
        error: 'Não é possível excluir um anúncio publicado. Despublique antes de excluir.',
      });
      return;
    }
    await withBillingWorkerRlsBypass(async () => {
      await pool.query(
        `DELETE FROM notifications WHERE entity_type = 'announcement' AND entity_id = $1::uuid`,
        [id],
      );
      await pool.query(`DELETE FROM announcements WHERE id = $1::uuid`, [id]);
    });
    res.status(204).send();
  } catch (e) {
    console.error('[announcements] delete', e);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
}

export async function postAnnouncementSend(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const body = sendSchema.parse(req.body);
    const uid = req.userId ?? null;

    const ann = await pool.query<{ whatsapp_message: string }>(
      `SELECT whatsapp_message FROM announcements WHERE id = $1::uuid LIMIT 1`,
      [id]
    );
    if (ann.rows.length === 0) {
      res.status(404).json({ error: 'Anúncio não encontrado' });
      return;
    }

    const grp = await pool.query(
      `SELECT 1 FROM announcement_groups WHERE id = $1::uuid AND is_active = true LIMIT 1`,
      [body.group_id]
    );
    if (grp.rows.length === 0) {
      res.status(400).json({ error: 'Grupo inválido ou inativo' });
      return;
    }

    const tenantsR = await pool.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id::text FROM announcement_group_members WHERE group_id = $1::uuid`,
      [body.group_id]
    );
    const tenantIds = tenantsR.rows.map((x) => x.tenant_id);
    if (tenantIds.length === 0) {
      res.status(400).json({ error: 'Grupo sem clientes' });
      return;
    }

    const phones = await resolvePhonesForTenants(tenantIds);
    const base =
      body.scheduled_start_at != null && body.scheduled_start_at !== ''
        ? new Date(body.scheduled_start_at)
        : new Date();
    if (Number.isNaN(base.getTime())) {
      res.status(400).json({ error: 'scheduled_start_at inválido' });
      return;
    }

    const delayMs = Math.max(0, body.delay_seconds) * 1000;
    const sendStarted = base.getTime() <= Date.now();

    const client = await pool.connect();
    let sendId: string;
    try {
      await client.query('BEGIN');
      const ins = await client.query<{ id: string }>(
        `INSERT INTO announcement_sends (
           announcement_id, group_id, status, delay_seconds, scheduled_start_at, created_by, started_at
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() ELSE NULL END
         ) RETURNING id::text`,
        [
          id,
          body.group_id,
          sendStarted ? 'processing' : 'pending',
          body.delay_seconds,
          body.scheduled_start_at ? base.toISOString() : null,
          uid,
          sendStarted,
        ]
      );
      sendId = ins.rows[0]!.id;

      tenantIds.sort();
      let i = 0;
      for (const tid of tenantIds) {
        const scheduledAt = new Date(base.getTime() + i * delayMs);
        const phone = phones.get(tid) ?? null;
        await client.query(
          `INSERT INTO announcement_send_recipients (
             send_id, tenant_id, phone, status, scheduled_at
           ) VALUES ($1::uuid, $2::uuid, $3, 'pending', $4)`,
          [sendId, tid, phone, scheduledAt.toISOString()]
        );
        i += 1;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({ send_id: sendId, recipients: tenantIds.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[announcements] send', e);
    res.status(500).json({ error: 'Erro ao enfileirar envio' });
  }
}

export async function listAnnouncementSends(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT
         s.id::text,
         s.announcement_id::text,
         s.group_id::text,
         s.status,
         s.delay_seconds,
         s.scheduled_start_at::text,
         s.started_at::text,
         s.finished_at::text,
         s.created_at::text,
         a.title AS announcement_title,
         g.name AS group_name
       FROM announcement_sends s
       INNER JOIN announcements a ON a.id = s.announcement_id
       INNER JOIN announcement_groups g ON g.id = s.group_id
       ORDER BY s.created_at DESC
       LIMIT 200`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[announcements] sends list', e);
    res.status(500).json({ error: 'Erro ao listar envios' });
  }
}

export async function getAnnouncementSend(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sendId = req.params.sendId;
    if (!sendId) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const head = await pool.query(
      `SELECT
         s.id::text,
         s.announcement_id::text,
         s.group_id::text,
         s.status,
         s.delay_seconds,
         s.scheduled_start_at::text,
         s.started_at::text,
         s.finished_at::text,
         s.created_at::text,
         a.title AS announcement_title,
         g.name AS group_name
       FROM announcement_sends s
       INNER JOIN announcements a ON a.id = s.announcement_id
       INNER JOIN announcement_groups g ON g.id = s.group_id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [sendId]
    );
    if (head.rows.length === 0) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    const rec = await pool.query(
      `SELECT
         id::text,
         tenant_id::text,
         phone,
         status,
         attempt_count,
         error_message,
         scheduled_at::text,
         sent_at::text
       FROM announcement_send_recipients
       WHERE send_id = $1::uuid
       ORDER BY scheduled_at ASC`,
      [sendId]
    );
    res.json({ send: head.rows[0], recipients: rec.rows });
  } catch (e) {
    console.error('[announcements] send get', e);
    res.status(500).json({ error: 'Erro ao carregar envio' });
  }
}
