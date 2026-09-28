import { pool } from '../utils/db.js';
import { renderMessageTemplate, type MessageTemplateContext } from '../utils/renderMessageTemplate.js';
import {
  sendKanbanAutomationOutboundMedia,
  sendKanbanAutomationOutboundText,
} from '../controllers/chatController.js';
import { buildWhatsappTemplateMediaPublicUrlFromStoragePath } from './whatsappTemplateMediaStorageService.js';

export type WhatsappModelItemRow = {
  position: number;
  message_type: 'text' | 'image' | 'document';
  content: string | null;
  media_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  caption: string | null;
  delay_seconds: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve modelo WhatsApp (`template_type = model`) ativo para o tenant. */
export async function resolveWhatsappModelForTenant(
  tenantId: string,
  templateId: string,
): Promise<{ templateName: string; items: WhatsappModelItemRow[] } | null> {
  const t = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM whatsapp_message_templates
     WHERE id = $1 AND tenant_id = $2 AND template_type = 'model' AND is_active = true
     LIMIT 1`,
    [templateId, tenantId],
  );
  if (!t.rows[0]) return null;

  const items = await pool.query<WhatsappModelItemRow>(
    `SELECT position, message_type, content, media_url, storage_path, original_filename, caption, delay_seconds
     FROM whatsapp_message_template_items
     WHERE template_id = $1
     ORDER BY position ASC`,
    [templateId],
  );

  return { templateName: t.rows[0].name, items: items.rows };
}

export type SendWhatsappModelSequenceParams = {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  templateId: string;
  templateContext: MessageTemplateContext;
  /** manual: atraso entre itens limitado a 3s; kanban: até 3600s por item */
  mode: 'manual' | 'kanban';
  automationRef?: { boardId: string; columnId: string; cardId: string };
};

/**
 * Envia sequência completa; para na primeira falha de envio ao provider.
 * Texto vazio após render é ignorado (não conta como falha).
 */
export async function sendWhatsappModelSequence(
  params: SendWhatsappModelSequenceParams,
): Promise<{ ok: boolean; error?: string; failedItemIndex?: number }> {
  const resolved = await resolveWhatsappModelForTenant(params.tenantId, params.templateId);
  if (!resolved || resolved.items.length === 0) {
    return { ok: false, error: 'template_not_found_or_inactive' };
  }

  const metaSource = params.mode === 'manual' ? 'manual_whatsapp_model' : 'kanban_whatsapp_model';
  const { items } = resolved;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const rawDelay = Number(it.delay_seconds) || 0;
    const delayMs =
      params.mode === 'manual'
        ? Math.min(Math.max(0, rawDelay) * 1000, 3000)
        : Math.min(Math.max(0, rawDelay) * 1000, 3600 * 1000);
    if (delayMs > 0) await sleep(delayMs);

    const trace = {
      template_id: params.templateId,
      item_index: i,
      message_type: it.message_type,
    };

    if (it.message_type === 'text') {
      const text = renderMessageTemplate((it.content ?? '').trim(), params.templateContext).trim();
      if (!text) continue;
      const r = await sendKanbanAutomationOutboundText({
        actorUserId: params.actorUserId,
        conversationId: params.conversationId,
        text,
        automationRef: params.automationRef,
        metadataSource: metaSource,
        whatsappModelTrace: trace,
      });
      if (!r.ok) return { ok: false, error: r.error ?? 'send_text_failed', failedItemIndex: i };
      continue;
    }

    const url =
      (it.media_url ?? '').trim() || (it.storage_path ? buildWhatsappTemplateMediaPublicUrlFromStoragePath(it.storage_path) : '');
    if (!url) {
      return { ok: false, error: 'empty_media_url', failedItemIndex: i };
    }
    const caption = renderMessageTemplate((it.caption ?? '').trim(), params.templateContext);
    const r = await sendKanbanAutomationOutboundMedia({
      actorUserId: params.actorUserId,
      conversationId: params.conversationId,
      type: it.message_type === 'image' ? 'image' : 'document',
      fileUrl: url,
      storagePath: it.storage_path,
      fileName: (it.original_filename ?? '').trim() || undefined,
      caption: caption || null,
      mimeType: it.message_type === 'document' ? 'application/pdf' : undefined,
      automationRef: params.automationRef,
      metadataSource: metaSource,
      whatsappModelTrace: trace,
    });
    if (!r.ok) return { ok: false, error: r.error ?? 'send_media_failed', failedItemIndex: i };
  }

  return { ok: true };
}
