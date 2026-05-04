import { pool } from '../../utils/db.js';
import { sendTemplateMessage } from './whatsappOfficialClient.js';
import { getAccountCredentials } from './whatsappOfficialConfigService.js';
import {
  getWhatsappOfficialCampaignBatchSize,
  getWhatsappOfficialCampaignMaxAttempts,
  getWhatsappOfficialCampaignMaxPerMinute,
  getWhatsappOfficialCampaignSendIntervalMs,
  isWhatsappOfficialCampaignWorkerEnabled,
} from '../../config/whatsappOfficialCampaignEnv.js';
import { logCampaignAudit, logCampaignStructured } from './whatsappOfficialCampaignAudit.js';
import {
  maybeCompleteCampaign,
  mergeTemplateComponentsForPayload,
  refreshCampaignAggregates,
  loadCampaignSendContext,
} from './whatsappOfficialCampaignService.js';

const recentSendTimestamps: number[] = [];

function pruneMinuteWindow(now: number): void {
  const cutoff = now - 60_000;
  while (recentSendTimestamps.length > 0 && recentSendTimestamps[0]! < cutoff) {
    recentSendTimestamps.shift();
  }
}

function recordSend(): void {
  recentSendTimestamps.push(Date.now());
}

function backoffMs(attempt: number): number {
  const base = 60_000;
  const exp = Math.min(attempt - 1, 8);
  return Math.min(base * Math.pow(2, exp), 3_600_000);
}

export async function runWhatsappOfficialCampaignWorkerTick(): Promise<void> {
  if (!isWhatsappOfficialCampaignWorkerEnabled()) return;

  await pool.query(
    `UPDATE whatsapp_official_campaigns SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()`
  );

  pruneMinuteWindow(Date.now());
  const maxPerMinute = getWhatsappOfficialCampaignMaxPerMinute();
  const room = Math.max(0, maxPerMinute - recentSendTimestamps.length);
  if (room === 0) {
    return;
  }

  const batchSize = Math.min(getWhatsappOfficialCampaignBatchSize(), room);
  const intervalMs = getWhatsappOfficialCampaignSendIntervalMs();
  const maxAttempts = getWhatsappOfficialCampaignMaxAttempts();

  const claimed = await pool.query<{
    id: string;
    campaign_id: string;
    raw_payload: Record<string, unknown> | null;
  }>(
    `WITH next AS (
       SELECT r.id
       FROM whatsapp_official_campaign_recipients r
       INNER JOIN whatsapp_official_campaigns c ON c.id = r.campaign_id
       WHERE c.status = 'running'
         AND (c.scheduled_at IS NULL OR c.scheduled_at <= NOW())
         AND (
           r.status = 'queued'
           OR (r.status = 'failed' AND r.next_retry_at IS NOT NULL AND r.next_retry_at <= NOW())
         )
       ORDER BY r.created_at ASC
       FOR UPDATE OF r SKIP LOCKED
       LIMIT $1
     )
     UPDATE whatsapp_official_campaign_recipients r SET
       status = 'sending',
       attempt_count = r.attempt_count + 1,
       last_attempt_at = NOW(),
       next_retry_at = NULL,
       error_message = NULL
     FROM next
     WHERE r.id = next.id
     RETURNING r.id::text, r.campaign_id::text, COALESCE(r.raw_payload, '{}'::jsonb) AS raw_payload`,
    [batchSize]
  );

  for (const row of claimed.rows) {
    const ctx = await loadCampaignSendContext(row.campaign_id);
    if (!ctx || ctx.campaignStatus !== 'running') {
      await pool.query(
        `UPDATE whatsapp_official_campaign_recipients SET status = 'cancelled', error_message = 'Campanha não está em execução'
         WHERE id = $1::uuid`,
        [row.id]
      );
      await refreshCampaignAggregates(row.campaign_id);
      await maybeCompleteCampaign(row.campaign_id);
      continue;
    }

    const cred = await getAccountCredentials(ctx.accountId);
    if (!cred) {
      await pool.query(
        `UPDATE whatsapp_official_campaign_recipients SET
           status = 'failed',
           error_message = 'Credenciais da conta em falta',
           failed_at = NOW(),
           next_retry_at = NULL
         WHERE id = $1::uuid`,
        [row.id]
      );
      await refreshCampaignAggregates(row.campaign_id);
      await maybeCompleteCampaign(row.campaign_id);
      continue;
    }

    const payload = (row.raw_payload || {}) as Record<string, unknown>;
    const recPhone = await pool.query<{ recipient_phone: string }>(
      `SELECT recipient_phone FROM whatsapp_official_campaign_recipients WHERE id = $1::uuid`,
      [row.id]
    );
    const toPhone = recPhone.rows[0]?.recipient_phone || '';
    const components = mergeTemplateComponentsForPayload(ctx, payload);

    const r = await sendTemplateMessage(
      cred.phoneNumberId,
      cred.accessToken,
      toPhone,
      ctx.templateName,
      ctx.language,
      components
    );

    recordSend();

    if (r.ok && r.messages?.[0]?.id) {
      await pool.query(
        `UPDATE whatsapp_official_campaign_recipients SET
           status = 'sent',
           provider_message_id = $2,
           sent_at = NOW(),
           template_params = $3::jsonb,
           error_code = NULL,
           failed_at = NULL
         WHERE id = $1::uuid`,
        [row.id, r.messages[0].id, JSON.stringify(components)]
      );
      await logCampaignAudit({
        campaignId: row.campaign_id,
        eventType: 'campaign_recipient_sent',
        payload: { recipient_id: row.id },
      });
      logCampaignStructured('recipient_sent', { campaign_id: row.campaign_id, recipient_id: row.id });
    } else {
      const errText = (r.error || 'send failed').slice(0, 500);
      const qAttempt = await pool.query<{ attempt_count: number }>(
        `SELECT attempt_count FROM whatsapp_official_campaign_recipients WHERE id = $1::uuid`,
        [row.id]
      );
      const att = qAttempt.rows[0]?.attempt_count ?? maxAttempts;
      if (att >= maxAttempts) {
        await pool.query(
          `UPDATE whatsapp_official_campaign_recipients SET
             status = 'failed',
             error_message = $2,
             failed_at = NOW(),
             next_retry_at = NULL
           WHERE id = $1::uuid`,
          [row.id, errText]
        );
        await logCampaignAudit({
          campaignId: row.campaign_id,
          eventType: 'campaign_recipient_failed',
          payload: { recipient_id: row.id, error: errText },
        });
      } else {
        const nextAt = new Date(Date.now() + backoffMs(att));
        await pool.query(
          `UPDATE whatsapp_official_campaign_recipients SET
             status = 'failed',
             error_message = $2,
             failed_at = NOW(),
             next_retry_at = $3::timestamptz
           WHERE id = $1::uuid`,
          [row.id, errText, nextAt.toISOString()]
        );
      }
      logCampaignStructured('recipient_send_fail', { campaign_id: row.campaign_id, recipient_id: row.id });
    }

    await refreshCampaignAggregates(row.campaign_id);
    await maybeCompleteCampaign(row.campaign_id);

    if (intervalMs > 0) {
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }
}
