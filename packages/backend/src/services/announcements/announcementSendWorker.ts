import type { Pool, PoolClient } from 'pg';
import { dispatchPlatformWhatsAppText } from '../notificationsEngine/whatsappChannelDispatcher.js';
import { resolvePlatformWhatsAppOutboundReady } from '../platformNotifications/platformNotificationDispatchContext.js';

/** null = ainda não sabemos; true = schema OK; false = tabelas de fila ausentes (migração não aplicada). */
let announcementsSendQueueSchemaAvailable: boolean | null = null;
let announcementsSendSchemaProbeAtMs = 0;

function disableAnnouncementsSendWorkerMissingSchema(): void {
  if (announcementsSendQueueSchemaAvailable === false) return;
  announcementsSendQueueSchemaAvailable = false;
  console.warn(
    '[announcements/send] Fila de envio pausada: tabelas de anúncios não existem na base. ' +
      'Aplique database/init/154_announcements_module.sql (ou supabase/migrations/20260426120000_announcements_module.sql). ' +
      'O worker volta a tentar automaticamente após ~60s (ou reinicie o backend).',
  );
}

async function finalizeSendIfDone(client: PoolClient, sendId: string): Promise<void> {
  const pending = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM announcement_send_recipients WHERE send_id = $1 AND status = 'pending'`,
    [sendId]
  );
  if (Number(pending.rows[0]?.c ?? 0) > 0) return;
  await client.query(
    `UPDATE announcement_sends SET finished_at = COALESCE(finished_at, NOW()), status = 'completed' WHERE id = $1 AND status <> 'cancelled'`,
    [sendId]
  );
}

/**
 * Processa um destinatário pendente da fila de anúncios (WhatsApp plataforma + delay por linha).
 */
export async function processAnnouncementSendRecipientsOnce(pool: Pool): Promise<void> {
  if (announcementsSendQueueSchemaAvailable === false) {
    const now = Date.now();
    if (now - announcementsSendSchemaProbeAtMs < 60_000) {
      return;
    }
    announcementsSendSchemaProbeAtMs = now;
    announcementsSendQueueSchemaAvailable = null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lock = await client.query<{ id: string }>(
      `SELECT r.id
       FROM announcement_send_recipients r
       INNER JOIN announcement_sends s ON s.id = r.send_id
       WHERE r.status = 'pending'
         AND r.scheduled_at <= NOW()
         AND s.status IN ('pending', 'processing')
       ORDER BY r.scheduled_at ASC
       LIMIT 1
       FOR UPDATE OF r SKIP LOCKED`
    );

    announcementsSendQueueSchemaAvailable = true;

    if (lock.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const recipientId = lock.rows[0]!.id;

    const rowQ = await client.query<{
      recipient_id: string;
      send_id: string;
      tenant_id: string;
      phone: string | null;
      attempt_count: number;
      whatsapp_message: string;
    }>(
      `SELECT
         r.id::text AS recipient_id,
         r.send_id::text AS send_id,
         r.tenant_id::text AS tenant_id,
         r.phone,
         r.attempt_count,
         a.whatsapp_message
       FROM announcement_send_recipients r
       INNER JOIN announcement_sends s ON s.id = r.send_id
       INNER JOIN announcements a ON a.id = s.announcement_id
       WHERE r.id = $1::uuid
       FOR UPDATE OF r`,
      [recipientId]
    );

    const row = rowQ.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE announcement_sends SET status = 'processing', started_at = COALESCE(started_at, NOW()) WHERE id = $1::uuid AND status = 'pending'`,
      [row.send_id]
    );

    if (!row.phone || row.phone.replace(/\D/g, '').length < 8) {
      await client.query(
        `UPDATE announcement_send_recipients
         SET status = 'skipped', error_message = 'Sem telefone válido', updated_at = NOW()
         WHERE id = $1::uuid`,
        [row.recipient_id]
      );
      await client.query('COMMIT');
      const fin = await pool.connect();
      try {
        await finalizeSendIfDone(fin, row.send_id);
      } finally {
        fin.release();
      }
      return;
    }

    const outbound = await resolvePlatformWhatsAppOutboundReady(pool);
    if (!outbound) {
      await client.query(
        `UPDATE announcement_send_recipients
         SET status = 'failed',
             attempt_count = attempt_count + 1,
             error_message = 'WhatsApp da plataforma indisponível (configure instância em Notificações da plataforma).',
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [row.recipient_id]
      );
      await client.query('COMMIT');
      const c2 = await pool.connect();
      try {
        await finalizeSendIfDone(c2, row.send_id);
      } finally {
        c2.release();
      }
      return;
    }

    const sendResult = await dispatchPlatformWhatsAppText({
      instanceToken: outbound.instanceToken,
      phone: row.phone,
      text: row.whatsapp_message,
    });

    if (sendResult.ok) {
      await client.query(
        `UPDATE announcement_send_recipients
         SET status = 'sent', sent_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid`,
        [row.recipient_id]
      );
    } else {
      await client.query(
        `UPDATE announcement_send_recipients
         SET status = 'failed',
             attempt_count = attempt_count + 1,
             error_message = $2,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [row.recipient_id, sendResult.error.slice(0, 500)]
      );
    }

    await client.query('COMMIT');

    const c3 = await pool.connect();
    try {
      await finalizeSendIfDone(c3, row.send_id);
    } finally {
      c3.release();
    }
  } catch (e: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const err = e as { code?: string; message?: string };
    if (err?.code === '42P01') {
      const msg = String(err.message ?? '');
      if (
        msg.includes('announcement_send_recipients') ||
        msg.includes('announcement_sends') ||
        msg.includes('announcements')
      ) {
        disableAnnouncementsSendWorkerMissingSchema();
        return;
      }
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function processAnnouncementSendRecipientsBatch(pool: Pool, rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await processAnnouncementSendRecipientsOnce(pool);
  }
}
