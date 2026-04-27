import { Response } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { AuthRequest, requireTenantId } from '../middleware/auth.js';
import { ensureWhatsAppTemplateDefaults } from '../services/whatsappTemplateDefaultsService.js';
import { buildChatManualTemplateContext } from '../utils/chatManualTemplateContext.js';
import { sendWhatsappModelSequence } from '../services/whatsappModelSequenceService.js';
import {
  assertWhatsappTemplateUploadAllowed,
  buildWhatsappTemplateFinalPath,
  buildWhatsappTemplateMediaPublicUrl,
  buildWhatsappTemplateMediaPublicUrlFromStoragePath,
  buildWhatsappTemplateTempPath,
  isWhatsappTemplateTempPath,
  moveWhatsappTemplateFile,
  writeWhatsappTemplateFile,
  type WhatsappTemplateMediaType,
} from '../services/whatsappTemplateMediaStorageService.js';

const templateItemSchema = z
  .object({
    message_type: z.enum(['text', 'image', 'document']),
    content: z.string().max(20000).optional().nullable(),
    media_url: z.string().max(2000).optional().nullable(),
    storage_provider: z.string().max(64).optional().nullable(),
    storage_path: z.string().max(2000).optional().nullable(),
    original_filename: z.string().max(255).optional().nullable(),
    mime_type: z.string().max(255).optional().nullable(),
    file_size_bytes: z.number().int().min(0).optional().nullable(),
    image_width: z.number().int().min(1).max(12000).optional().nullable(),
    image_height: z.number().int().min(1).max(12000).optional().nullable(),
    caption: z.string().max(2000).optional().nullable(),
    delay_seconds: z.number().int().min(0).max(3600),
  })
  .superRefine((d, ctx) => {
    if (d.message_type === 'text') {
      if (!d.content?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Conteúdo de texto obrigatório.', path: ['content'] });
      }
    } else if (!d.storage_path?.trim() && !d.media_url?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Arquivo obrigatório para imagem/documento.',
        path: ['storage_path'],
      });
    }
  });

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  category_id: z.string().uuid('Categoria inválida'),
  description: z.string().max(2000).optional().nullable(),
  slug: z.string().max(120).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  items: z.array(templateItemSchema).min(1, 'Adicione pelo menos uma mensagem').max(20),
});

const patchTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category_id: z.string().uuid().optional(),
  description: z.string().max(2000).optional().nullable(),
  slug: z.string().max(120).optional().nullable(),
  is_active: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1).max(20).optional(),
});

const uploadBodySchema = z.object({
  media_type: z.enum(['image', 'document']),
});

type TemplateItemInput = z.infer<typeof templateItemSchema>;

async function assertCategoryOwned(tenantId: string, categoryId: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM whatsapp_template_categories WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
    categoryId,
    tenantId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

async function resolveMediaForTemplateItem(params: {
  tenantId: string;
  templateId: string;
  item: TemplateItemInput;
}): Promise<{
  storage_provider: string | null;
  storage_path: string | null;
  media_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  image_width: number | null;
  image_height: number | null;
}> {
  const item = params.item;
  if (item.message_type === 'text') {
    return {
      storage_provider: null,
      storage_path: null,
      media_url: null,
      original_filename: null,
      mime_type: null,
      file_size_bytes: null,
      image_width: null,
      image_height: null,
    };
  }
  const incomingStoragePath = (item.storage_path ?? '').trim();
  const incomingFilename = (item.original_filename ?? '').trim();
  const mediaType: WhatsappTemplateMediaType = item.message_type === 'image' ? 'image' : 'document';
  const incomingMime = (item.mime_type ?? '').trim() || (mediaType === 'document' ? 'application/pdf' : '');
  const incomingSize =
    typeof item.file_size_bytes === 'number' && Number.isFinite(item.file_size_bytes)
      ? item.file_size_bytes
      : null;
  const provider = (item.storage_provider ?? '').trim() || 'local';

  if (incomingStoragePath) {
    if (!incomingStoragePath.startsWith(`tenants/${params.tenantId}/whatsapp-templates/`)) {
      throw new Error('storage_path inválido para a empresa atual.');
    }
    let finalStoragePath = incomingStoragePath;
    if (isWhatsappTemplateTempPath(params.tenantId, incomingStoragePath)) {
      const finalPath = buildWhatsappTemplateFinalPath({
        tenantId: params.tenantId,
        templateId: params.templateId,
        mediaType,
        originalFilename: incomingFilename || `upload-${mediaType}`,
      });
      await moveWhatsappTemplateFile(incomingStoragePath, finalPath);
      finalStoragePath = finalPath;
    }
    const mediaUrl = buildWhatsappTemplateMediaPublicUrlFromStoragePath(finalStoragePath);
    return {
      storage_provider: provider,
      storage_path: finalStoragePath,
      media_url: mediaUrl,
      original_filename: incomingFilename || null,
      mime_type: incomingMime || null,
      file_size_bytes: incomingSize,
      image_width: item.image_width ?? null,
      image_height: item.image_height ?? null,
    };
  }

  const legacyUrl = (item.media_url ?? '').trim();
  if (!legacyUrl) {
    throw new Error('Arquivo obrigatório para imagem/documento.');
  }
  return {
    storage_provider: provider,
    storage_path: null,
    media_url: legacyUrl,
    original_filename: incomingFilename || null,
    mime_type: incomingMime || null,
    file_size_bytes: incomingSize,
    image_width: item.image_width ?? null,
    image_height: item.image_height ?? null,
  };
}

async function insertItems(client: PoolClient, tenantId: string, templateId: string, items: TemplateItemInput[]): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const media = await resolveMediaForTemplateItem({ tenantId, templateId, item: it });
    await client.query(
      `INSERT INTO whatsapp_message_template_items (
        template_id, position, message_type, content, media_url, storage_provider, storage_path, original_filename,
        mime_type, file_size_bytes, image_width, image_height, caption, delay_seconds, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, '{}'::jsonb)`,
      [
        templateId,
        i,
        it.message_type,
        it.message_type === 'text' ? it.content!.trim() : null,
        media.media_url,
        media.storage_provider,
        media.storage_path,
        media.original_filename,
        media.mime_type,
        media.file_size_bytes,
        media.image_width,
        media.image_height,
        it.caption?.trim() || null,
        it.delay_seconds,
      ],
    );
  }
}

async function loadTemplateWithItems(tenantId: string, templateId: string): Promise<Record<string, unknown> | null> {
  const t = await pool.query(
    `SELECT t.*, c.name AS category_name
     FROM whatsapp_message_templates t
     INNER JOIN whatsapp_template_categories c ON c.id = t.category_id AND c.tenant_id = t.tenant_id
     WHERE t.id = $1 AND t.tenant_id = $2
     LIMIT 1`,
    [templateId, tenantId],
  );
  if (!t.rows[0]) return null;
  const items = await pool.query(
    `SELECT id, template_id, position, message_type, content, media_url, storage_provider, storage_path, original_filename,
            mime_type, file_size_bytes, image_width, image_height, caption, delay_seconds, metadata, created_at, updated_at
     FROM whatsapp_message_template_items
     WHERE template_id = $1
     ORDER BY position ASC`,
    [templateId],
  );
  return { ...t.rows[0], items: items.rows };
}

export async function listWhatsappMessageTemplates(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    await ensureWhatsAppTemplateDefaults(tenantId);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : '';
    const isActive = typeof req.query.is_active === 'string' ? req.query.is_active : '';
    const templateTypeRaw = typeof req.query.template_type === 'string' ? req.query.template_type.trim() : '';
    const templateType =
      templateTypeRaw === 'automatic' || templateTypeRaw === 'model' ? templateTypeRaw : '';

    const conditions: string[] = ['t.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let n = 2;
    if (q) {
      conditions.push(`(t.name ILIKE $${n} OR COALESCE(t.description, '') ILIKE $${n})`);
      params.push(`%${q}%`);
      n++;
    }
    if (categoryId && z.string().uuid().safeParse(categoryId).success) {
      conditions.push(`t.category_id = $${n++}`);
      params.push(categoryId);
    }
    if (isActive === 'true') conditions.push('t.is_active = true');
    else if (isActive === 'false') conditions.push('t.is_active = false');
    if (templateType) {
      conditions.push(`t.template_type = $${n++}`);
      params.push(templateType);
    }

    const sql = `
      SELECT t.id, t.tenant_id, t.category_id, t.template_type, t.name, t.slug, t.description, t.is_active, t.is_system_default,
             t.seed_key, t.metadata, t.created_by_user_id, t.created_at, t.updated_at,
             c.name AS category_name,
             (SELECT COUNT(*)::int FROM whatsapp_message_template_items i WHERE i.template_id = t.id) AS message_count
      FROM whatsapp_message_templates t
      INNER JOIN whatsapp_template_categories c ON c.id = t.category_id AND c.tenant_id = t.tenant_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.updated_at DESC`;

    const r = await pool.query(sql, params);
    res.json({ items: r.rows });
  } catch (e: any) {
    if (e?.code === '42P01') {
      res.status(503).json({ error: 'Migração pendente: whatsapp_message_templates' });
      return;
    }
    console.error('[whatsappMessageTemplates] list', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar' });
  }
}

export async function getWhatsappMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const { id } = req.params;
  try {
    await ensureWhatsAppTemplateDefaults(tenantId);
    const full = await loadTemplateWithItems(tenantId, id);
    if (!full) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }
    res.json(full);
  } catch (e: any) {
    console.error('[whatsappMessageTemplates] get', e);
    res.status(500).json({ error: e?.message || 'Erro ao carregar' });
  }
}

export async function postWhatsappMessageTemplateMediaUpload(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { media_type } = uploadBodySchema.parse(req.body || {});
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'Arquivo obrigatório (campo file).' });
      return;
    }
    assertWhatsappTemplateUploadAllowed(media_type, file.mimetype, file.size);

    const tempPath = buildWhatsappTemplateTempPath({
      tenantId,
      mediaType: media_type,
      originalFilename: file.originalname || `upload-${media_type}`,
    });
    await writeWhatsappTemplateFile(tempPath, file.buffer);

    const publicUrl = buildWhatsappTemplateMediaPublicUrl(req, tempPath);
    res.json({
      storage_provider: 'local',
      storage_path: tempPath,
      media_url: publicUrl,
      original_filename: file.originalname || null,
      mime_type: file.mimetype || null,
      file_size_bytes: file.size,
      image_width: null,
      image_height: null,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao processar upload' });
  }
}

export async function createWhatsappMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const userId = req.userId ?? null;
  try {
    const body = createTemplateSchema.parse(req.body || {});
    if (!(await assertCategoryOwned(tenantId, body.category_id))) {
      res.status(400).json({ error: 'Categoria inválida para esta empresa.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO whatsapp_message_templates (
          tenant_id, category_id, template_type, name, slug, description, is_active, is_system_default, seed_key, metadata, created_by_user_id
        ) VALUES ($1, $2, 'model', $3, $4, $5, $6, false, NULL, '{}'::jsonb, $7)
        RETURNING id`,
        [
          tenantId,
          body.category_id,
          body.name.trim(),
          body.slug?.trim() || null,
          body.description?.trim() || null,
          body.is_active,
          userId,
        ],
      );
      const templateId = ins.rows[0].id as string;
      await insertItems(client, tenantId, templateId, body.items);
      await client.query('COMMIT');
      const full = await loadTemplateWithItems(tenantId, templateId);
      if (!full) {
        res.status(500).json({ error: 'Template criado mas falhou ao carregar.' });
        return;
      }
      res.status(201).json(full);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Slug já em uso nesta empresa.' });
      return;
    }
    console.error('[whatsappMessageTemplates] create', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar' });
  }
}

export async function patchWhatsappMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const { id } = req.params;
  try {
    const body = patchTemplateSchema.parse(req.body || {});
    if (body.category_id && !(await assertCategoryOwned(tenantId, body.category_id))) {
      res.status(400).json({ error: 'Categoria inválida para esta empresa.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sets: string[] = [];
      const params: unknown[] = [];
      let n = 1;
      if (body.name !== undefined) {
        sets.push(`name = $${n++}`);
        params.push(body.name.trim());
      }
      if (body.category_id !== undefined) {
        sets.push(`category_id = $${n++}`);
        params.push(body.category_id);
      }
      if (body.description !== undefined) {
        sets.push(`description = $${n++}`);
        params.push(body.description?.trim() || null);
      }
      if (body.slug !== undefined) {
        sets.push(`slug = $${n++}`);
        params.push(body.slug?.trim() || null);
      }
      if (body.is_active !== undefined) {
        sets.push(`is_active = $${n++}`);
        params.push(body.is_active);
      }
      if (sets.length === 0 && !body.items) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Nenhum campo para atualizar' });
        return;
      }
      if (sets.length > 0) {
        params.push(id, tenantId);
        const up = await client.query(
          `UPDATE whatsapp_message_templates SET ${sets.join(', ')} WHERE id = $${n++} AND tenant_id = $${n}`,
          params,
        );
        if (up.rowCount === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Template não encontrado' });
          return;
        }
      } else {
        const ex = await client.query(`SELECT 1 FROM whatsapp_message_templates WHERE id = $1 AND tenant_id = $2`, [
          id,
          tenantId,
        ]);
        if (ex.rowCount === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Template não encontrado' });
          return;
        }
      }
      if (body.items) {
        await client.query(`DELETE FROM whatsapp_message_template_items WHERE template_id = $1`, [id]);
        await insertItems(client, tenantId, id, body.items);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const full = await loadTemplateWithItems(tenantId, id);
    if (!full) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }
    res.json(full);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    if (e?.code === '23505') {
      res.status(409).json({ error: 'Slug já em uso nesta empresa.' });
      return;
    }
    console.error('[whatsappMessageTemplates] patch', e);
    res.status(500).json({ error: e?.message || 'Erro ao atualizar' });
  }
}

export async function deleteWhatsappMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const { id } = req.params;
  try {
    const sys = await pool.query(`SELECT seed_key FROM whatsapp_message_templates WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
      id,
      tenantId,
    ]);
    if (sys.rows[0]?.seed_key) {
      res.status(400).json({ error: 'Não é possível eliminar templates padrão do sistema.' });
      return;
    }
    const del = await pool.query(`DELETE FROM whatsapp_message_templates WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (del.rowCount === 0) {
      res.status(404).json({ error: 'Template não encontrado' });
      return;
    }
    res.status(204).send();
  } catch (e: any) {
    console.error('[whatsappMessageTemplates] delete', e);
    res.status(500).json({ error: e?.message || 'Erro ao eliminar' });
  }
}

const sendSequenceBodySchema = z.object({
  conversation_id: z.string().uuid('Conversa inválida'),
});

/**
 * Envia a sequência completa de um modelo WhatsApp (`template_type = model`) na conversa.
 * Uso manual pelo operador (delays entre itens limitados no serviço).
 */
export async function postWhatsappMessageTemplateSendSequence(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const actorUserId = req.userId;
  if (!actorUserId) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  const templateId = req.params.id;
  if (!z.string().uuid().safeParse(templateId).success) {
    res.status(400).json({ error: 'ID do modelo inválido' });
    return;
  }
  try {
    const body = sendSequenceBodySchema.parse(req.body);
    const ctx = await buildChatManualTemplateContext({
      tenantId,
      actorUserId,
      conversationId: body.conversation_id,
    });
    if (!ctx) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const result = await sendWhatsappModelSequence({
      tenantId,
      actorUserId,
      conversationId: body.conversation_id,
      templateId,
      templateContext: ctx,
      mode: 'manual',
    });

    const att = await pool.query<{ attendance_status: string | null; assigned_to_user_id: string | null }>(
      `SELECT c.attendance_status, c.assigned_to_user_id
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [body.conversation_id, tenantId],
    );
    const row = att.rows[0];
    const snap = row?.attendance_status ?? 'unassigned';
    const statusLabel = result.ok ? 'success' : 'failed';
    const reason = [
      'automation_type=manual_whatsapp_model_sequence',
      `status=${statusLabel}`,
      `template_id=${templateId}`,
      result.ok
        ? 'detail=completed'
        : `error=${result.error ?? 'unknown'};failed_item=${result.failedItemIndex ?? 'none'}`,
    ].join(';');

    try {
      await pool.query(
        `INSERT INTO chat_conversation_assignment_history (
          conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          body.conversation_id,
          tenantId,
          snap,
          snap,
          row?.assigned_to_user_id ?? null,
          row?.assigned_to_user_id ?? null,
          null,
          actorUserId,
          'manual_whatsapp_model_sequence',
          reason.slice(0, 2000),
        ],
      );
    } catch (auditErr) {
      console.error('[whatsappMessageTemplates] send-sequence audit', auditErr);
    }

    if (!result.ok) {
      if (result.error === 'template_not_found_or_inactive') {
        res.status(404).json({
          error: 'Modelo não encontrado ou inativo',
          code: result.error,
          failedItemIndex: result.failedItemIndex,
        });
        return;
      }
      res.status(502).json({
        error: 'Falha ao enviar uma ou mais mensagens do modelo',
        code: result.error,
        failedItemIndex: result.failedItemIndex,
      });
      return;
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    console.error('[whatsappMessageTemplates] send-sequence', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao enviar sequência' });
  }
}
