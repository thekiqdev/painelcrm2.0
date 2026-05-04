import crypto from 'crypto';
import { pool } from '../../utils/db.js';
import { shouldVerifyWhatsappOfficialWebhookSignature } from '../../config/whatsappOfficialEnv.js';
import { getAccountCredentials } from './whatsappOfficialConfigService.js';
import { ingestOfficialInboundText, updateOutgoingStatusByWamid } from './whatsappOfficialChatIngestService.js';
import {
  emitOperationalOfficialInbound,
  emitOperationalOfficialMessageStatus,
} from './whatsappOfficialOperationalRealtime.js';
import { refreshCampaignAggregates } from './whatsappOfficialCampaignService.js';

function verifySignatureWithSecret(secret: string, rawBody: Buffer, sigHex: string): boolean {
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(sigHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): Promise<boolean> {
  if (!shouldVerifyWhatsappOfficialWebhookSignature()) {
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const sigHex = signatureHeader.slice('sha256='.length);
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM whatsapp_official_accounts
     WHERE app_secret_ciphertext IS NOT NULL AND btrim(app_secret_ciphertext) <> ''`
  );
  for (const row of r.rows) {
    const cred = await getAccountCredentials(row.id);
    if (!cred?.appSecretPlain) continue;
    if (verifySignatureWithSecret(cred.appSecretPlain, rawBody, sigHex)) {
      return true;
    }
  }
  return false;
}

function mapDeliveryStatus(s: string): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const x = (s || '').toLowerCase();
  if (x === 'sent') return 'sent';
  if (x === 'delivered') return 'delivered';
  if (x === 'read') return 'read';
  if (x === 'failed') return 'failed';
  return null;
}

export async function processWhatsappOfficialWebhookPayload(body: unknown): Promise<void> {
  const root = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{
            from?: string;
            id?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
          }>;
          statuses?: Array<{
            id?: string;
            status?: string;
            recipient_id?: string;
            errors?: Array<{ code?: number; title?: string }>;
          }>;
        };
      }>;
    }>;
  };

  const entries = root.entry || [];
  for (const ent of entries) {
    const changes = ent.changes || [];
    for (const ch of changes) {
      const val = ch.value;
      if (!val?.metadata?.phone_number_id) continue;
      const pnid = val.metadata.phone_number_id;
      const acc = await pool.query<{ id: string; inbox_user_id: string | null }>(
        `SELECT id::text, inbox_user_id::text FROM whatsapp_official_accounts
         WHERE phone_number_id = $1 AND is_active = true LIMIT 1`,
        [pnid]
      );
      if (acc.rows.length === 0) continue;
      const accountId = acc.rows[0]!.id;
      const inboxUserId = acc.rows[0]!.inbox_user_id;

      if (inboxUserId) {
        for (const msg of val.messages || []) {
          if (msg.type !== 'text' || !msg.text?.body || !msg.id || !msg.from) continue;
          const ing = await ingestOfficialInboundText({
            accountId,
            inboxUserId,
            fromPhoneDigits: msg.from,
            wamid: msg.id,
            textBody: msg.text.body,
            timestampSec: msg.timestamp,
          });
          if (!ing.isDuplicateInbound) {
            await emitOperationalOfficialInbound({
              inboxUserId,
              conversationId: ing.conversationId,
              messageId: ing.messageId,
            });
          }
        }
      }

      for (const st of val.statuses || []) {
        const wamid = st.id;
        const rawSt = st.status || '';
        const mapped = mapDeliveryStatus(rawSt);
        if (!wamid || !mapped) continue;

        const n = await updateOutgoingStatusByWamid({ wamid, status: mapped });
        if (n > 0 && inboxUserId) {
          await emitOperationalOfficialMessageStatus(wamid);
        }

        const ds =
          mapped === 'delivered' ? 'delivered' : mapped === 'read' ? 'read' : mapped === 'sent' ? 'sent' : 'failed';
        const errCode =
          ds === 'failed' && Array.isArray(st.errors) && st.errors[0]?.code != null
            ? String(st.errors[0]!.code)
            : null;
        const errMsg =
          ds === 'failed' && Array.isArray(st.errors) && st.errors[0]?.title
            ? String(st.errors[0]!.title).slice(0, 500)
            : null;

        const upd = await pool.query<{ campaign_id: string }>(
          `UPDATE whatsapp_official_campaign_recipients SET
             status = CASE
               WHEN $2::text = 'failed' THEN 'failed'
               WHEN $2::text = 'read' THEN 'read'
               WHEN $2::text = 'delivered' THEN 'delivered'
               WHEN $2::text = 'sent' THEN 'sent'
               ELSE status
             END,
             delivered_at = CASE WHEN $2::text IN ('delivered', 'read') AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
             read_at = CASE WHEN $2::text = 'read' AND read_at IS NULL THEN NOW() ELSE read_at END,
             failed_at = CASE WHEN $2::text = 'failed' AND failed_at IS NULL THEN NOW() ELSE failed_at END,
             error_code = COALESCE($3::text, error_code),
             error_message = COALESCE($4::text, error_message)
           WHERE provider_message_id = $1
           RETURNING campaign_id::text`,
          [wamid, ds, errCode, errMsg]
        );
        for (const row of upd.rows) {
          await refreshCampaignAggregates(row.campaign_id);
        }
      }
    }
  }
}
