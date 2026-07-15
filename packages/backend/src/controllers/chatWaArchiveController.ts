import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { uazapiService } from '../services/uazapi.js';
import { SQL_CHAT_ACCESS_PREDICATE } from '../utils/chatConversationAccess.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { emitConversationUpdate } from '../services/websocketService.js';
import { emitToTenant } from '../services/realtimeService.js';
import { buildConversationUpdatedPayload } from '../services/communication/realtimePayloads.js';
import { DEFAULT_COMMUNICATION_PROVIDER } from '../services/communication/communicationTypes.js';

const waArchiveBodySchema = z.object({
  archived: z.boolean(),
});

/** Identificador aceito por POST /chat/archive (E.164 ou JID de grupo). */
export function resolveUazArchiveNumber(conversation: Record<string, unknown>): string | null {
  const meta =
    conversation.metadata && typeof conversation.metadata === 'object'
      ? (conversation.metadata as Record<string, unknown>)
      : {};
  const external =
    (typeof conversation.external_chat_id === 'string' && conversation.external_chat_id.trim()
      ? conversation.external_chat_id.trim()
      : null) ||
    (typeof meta.wa_chatid === 'string' && meta.wa_chatid.trim() ? meta.wa_chatid.trim() : null);

  if (external) {
    if (external.includes('@g.us') || external.includes('@newsletter')) {
      return external;
    }
    const local = external.split('@')[0]?.trim();
    if (local) return local.replace(/\D/g, '') || local;
  }

  const phone =
    typeof conversation.phone_number === 'string' ? conversation.phone_number : null;
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits) return digits;
  }

  return null;
}

function mapArchiveProviderError(err: unknown): { status: number; error: string; code: string } {
  const e = err as { status?: number; message?: string; payload?: { error?: string } };
  const status = typeof e?.status === 'number' ? e.status : 502;
  const message =
    (typeof e?.payload?.error === 'string' && e.payload.error) ||
    (typeof e?.message === 'string' && e.message) ||
    'Falha ao arquivar na UazAPI';

  if (status === 400) {
    return { status: 400, error: message, code: 'UAZAPI_ARCHIVE_BAD_REQUEST' };
  }
  if (status === 401) {
    return { status: 401, error: 'Token da instância UazAPI inválido', code: 'UAZAPI_UNAUTHORIZED' };
  }
  if (status === 503) {
    return { status: 503, error: message, code: 'UAZAPI_UNAVAILABLE' };
  }
  if (/no session|not connected|disconnected|session/i.test(message)) {
    return { status: 409, error: 'Instância WhatsApp desconectada', code: 'INSTANCE_DISCONNECTED' };
  }
  if (status === 500) {
    return { status: 502, error: message, code: 'UAZAPI_ARCHIVE_FAILED' };
  }
  return { status: status >= 400 && status < 600 ? status : 502, error: message, code: 'UAZAPI_ARCHIVE_FAILED' };
}

/**
 * PATCH /api/chat/conversations/:id/wa-archive
 * Body: { archived: boolean }
 * Persists CRM-owned `wa_archived` — never attendance_status. Sync/webhook must not write this field.
 */
export async function patchConversationWaArchive(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = waArchiveBodySchema.parse(req.body || {});

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token, i.status AS instance_status
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [id, userId],
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada', code: 'CONVERSATION_NOT_FOUND' });
      return;
    }

    const conversation = conversationResult.rows[0] as Record<string, unknown>;

    if (conversation.whatsapp_official_account_id) {
      res.status(400).json({
        error: 'Arquivamento WhatsApp via UazAPI não se aplica a conversas Cloud API',
        code: 'CLOUD_API_UNSUPPORTED',
      });
      return;
    }

    const provider =
      typeof conversation.provider === 'string' ? conversation.provider.trim().toLowerCase() : '';
    if (provider === 'whatsapp_official') {
      res.status(400).json({
        error: 'Arquivamento WhatsApp via UazAPI não se aplica a conversas Cloud API',
        code: 'CLOUD_API_UNSUPPORTED',
      });
      return;
    }

    const instanceStatus =
      typeof conversation.instance_status === 'string'
        ? conversation.instance_status.trim().toLowerCase()
        : '';
    if (instanceStatus && instanceStatus !== 'connected' && instanceStatus !== 'open') {
      res.status(409).json({
        error: 'Instância WhatsApp desconectada',
        code: 'INSTANCE_DISCONNECTED',
        instance_status: instanceStatus,
      });
      return;
    }

    const number = resolveUazArchiveNumber(conversation);
    if (!number) {
      res.status(400).json({
        error: 'Conversa sem identificador WhatsApp',
        code: 'MISSING_WHATSAPP_IDENTIFIER',
      });
      return;
    }

    const instanceToken = String(conversation.instance_token || '');
    if (!instanceToken) {
      res.status(500).json({ error: 'Instância sem token', code: 'MISSING_INSTANCE_TOKEN' });
      return;
    }

    try {
      await uazapiService.archiveChat(instanceToken, {
        number,
        archive: body.archived,
      });
    } catch (uazErr) {
      const mapped = mapArchiveProviderError(uazErr);
      console.warn('[WaArchive] UazAPI archiveChat failed', {
        conversationId: id,
        archived: body.archived,
        status: mapped.status,
        code: mapped.code,
        error: mapped.error,
      });
      res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
      return;
    }

    const updated = await pool.query(
      `
        UPDATE chat_conversations
        SET wa_archived = $1, updated_at = now()
        WHERE id = $2
        RETURNING *
      `,
      [body.archived, id],
    );

    const row = updated.rows[0] as Record<string, unknown>;
    const apiRow = conversationRowForClientApi(row);

    const ownerUserId = String(row.user_id || userId);
    emitConversationUpdate(ownerUserId, apiRow);

    const tenantRes = await pool.query<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
      [ownerUserId],
    );
    const tenantId = tenantRes.rows[0]?.tenant_id ?? null;
    if (tenantId) {
      emitToTenant(
        tenantId,
        'conversation.updated',
        buildConversationUpdatedPayload({
          provider: DEFAULT_COMMUNICATION_PROVIDER,
          conversation_id: String(row.id),
          last_message_preview:
            (row.last_message_preview as string | null) ?? null,
          last_message_at: (row.last_message_at as string | Date | null) ?? null,
          unread_count: Number(row.unread_count ?? 0),
          status: (row.status as string | null) ?? null,
          assigned_user_id: (row.assigned_to_user_id as string | null) ?? null,
          assigned_team_id: (row.assigned_team_id as string | null) ?? null,
          display_name:
            (row.display_name as string | null) ??
            (row.contact_name as string | null) ??
            null,
          avatar_url: (row.avatar_url as string | null) ?? null,
          wa_archived: Boolean(row.wa_archived),
        }),
      );
    }

    res.json({ success: true, conversation: apiRow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Payload inválido', code: 'INVALID_PAYLOAD', details: error.flatten() });
      return;
    }
    const message = error instanceof Error ? error.message : 'Falha ao atualizar arquivamento';
    console.error('[WaArchive] Unexpected error', { error: message, conversationId: req.params.id });
    res.status(500).json({ error: message, code: 'WA_ARCHIVE_INTERNAL' });
  }
}
