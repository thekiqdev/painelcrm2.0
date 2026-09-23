import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { resolveChatMessageMediaAccess } from '../services/chatMessageMediaAccessService.js';
import { emitMessageUpdated } from '../services/websocketService.js';
import { pool } from '../utils/db.js';
import { contractFromDbRow } from '../utils/chatMessageContract.js';

/**
 * GET /api/chat/messages/:messageId/media?disposition=inline|attachment
 * Devolve URL assinada temporária (nossa). Recupera stubs via UazAPI se necessário.
 */
export async function getMessageMedia(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const messageId = String(req.params.messageId || '').trim();
    const dispositionRaw = String(req.query.disposition || 'inline').toLowerCase();
    const disposition = dispositionRaw === 'attachment' ? 'attachment' : 'inline';

    const resolved = await resolveChatMessageMediaAccess({
      userId,
      messageId,
      disposition,
    });

    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    if (resolved.result.recovered) {
      try {
        const msgQ = await pool.query(`SELECT * FROM chat_messages WHERE id = $1 LIMIT 1`, [
          messageId,
        ]);
        const row = msgQ.rows[0];
        if (row) {
          emitMessageUpdated(
            resolved.ownerUserId,
            { ...row, message_contract: contractFromDbRow(row) },
            resolved.conversationId
          );
        }
      } catch (e) {
        console.warn(
          '[getMessageMedia] emitMessageUpdated failed',
          e instanceof Error ? e.message : e
        );
      }
    }

    res.json({
      url: resolved.result.url,
      relativeUrl: resolved.result.relativeUrl,
      fileName: resolved.result.fileName,
      mimeType: resolved.result.mimeType,
      expiresAt: resolved.result.expiresAt,
      expiresAtUnix: resolved.result.expiresAtUnix,
      recovered: resolved.result.recovered,
      disposition: resolved.result.disposition,
    });
  } catch (error: unknown) {
    console.error('getMessageMedia:', error);
    res.status(500).json({ error: 'Falha ao resolver mídia da mensagem' });
  }
}
