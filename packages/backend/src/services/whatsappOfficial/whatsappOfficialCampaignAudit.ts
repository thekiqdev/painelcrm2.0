import { pool } from '../../utils/db.js';

export type CampaignAuditEventType =
  | 'campaign_created'
  | 'campaign_recipient_queued'
  | 'campaign_send_started'
  | 'campaign_recipient_sent'
  | 'campaign_recipient_failed'
  | 'campaign_paused'
  | 'campaign_resumed'
  | 'campaign_cancelled'
  | 'campaign_completed';

export async function logCampaignAudit(params: {
  campaignId: string;
  eventType: CampaignAuditEventType | string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO whatsapp_official_campaign_audit_events (campaign_id, event_type, payload, created_by)
       VALUES ($1::uuid, $2, $3::jsonb, $4::uuid)`,
      [
        params.campaignId,
        params.eventType,
        JSON.stringify(params.payload ?? {}),
        params.createdBy ?? null,
      ]
    );
  } catch (e) {
    console.warn('[wa-campaign-audit] insert failed', (e as Error)?.message);
  }
}

/** Log estruturado no stdout (sem tokens). */
export function logCampaignStructured(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const safe = { event, ...fields };
  console.log('[wa-official-campaign]', JSON.stringify(safe));
}
