import { pool } from '../../utils/db.js';
import type {
  CommunicationChannel,
  CommunicationDeliveryState,
  CommunicationMessageIntent,
  CommunicationProviderKey,
} from '../communicationTypes.js';

let tableExistsCache: boolean | undefined;

export async function communicationMessagesTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'communication_messages'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

export type CommunicationMessageRow = {
  id: string;
  tenant_id: string | null;
  channel: CommunicationChannel;
  provider: CommunicationProviderKey;
  message_intent: CommunicationMessageIntent;
  delivery_state: CommunicationDeliveryState;
  correlation_id: string;
  idempotency_key: string;
  recipient: string;
  provider_message_id: string | null;
  routing_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  shadow_mode: boolean;
  created_at: string;
  updated_at: string;
};

export async function insertCommunicationMessage(input: {
  tenantId?: string | null;
  channel: CommunicationChannel;
  provider: CommunicationProviderKey;
  messageIntent: CommunicationMessageIntent;
  deliveryState?: CommunicationDeliveryState;
  correlationId: string;
  idempotencyKey: string;
  recipient: string;
  providerMessageId?: string | null;
  routingJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  shadowMode: boolean;
}): Promise<{ inserted: boolean; row: CommunicationMessageRow | null }> {
  if (!(await communicationMessagesTableExists())) {
    return { inserted: false, row: null };
  }

  const r = await pool.query(
    `INSERT INTO communication_messages (
       tenant_id, channel, provider, message_intent, delivery_state,
       correlation_id, idempotency_key, recipient, provider_message_id,
       routing_json, metadata_json, shadow_mode, updated_at
     ) VALUES (
       $1, $2::communication_channel, $3::communication_provider_key,
       $4::communication_message_intent, $5::communication_delivery_state,
       $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, now()
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      input.tenantId ?? null,
      input.channel,
      input.provider,
      input.messageIntent,
      input.deliveryState ?? 'queued',
      input.correlationId,
      input.idempotencyKey,
      input.recipient,
      input.providerMessageId ?? null,
      JSON.stringify(input.routingJson ?? {}),
      JSON.stringify(input.metadataJson ?? {}),
      input.shadowMode,
    ],
  );

  if (r.rows.length === 0) {
    const existing = await pool.query(`SELECT * FROM communication_messages WHERE idempotency_key = $1`, [
      input.idempotencyKey,
    ]);
    return {
      inserted: false,
      row: existing.rows[0] ? mapRow(existing.rows[0]) : null,
    };
  }

  return { inserted: true, row: mapRow(r.rows[0]) };
}

export async function updateCommunicationMessageState(
  id: string,
  patch: {
    deliveryState: CommunicationDeliveryState;
    providerMessageId?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  if (!(await communicationMessagesTableExists())) return;
  await pool.query(
    `UPDATE communication_messages
     SET delivery_state = $2::communication_delivery_state,
         provider_message_id = COALESCE($3, provider_message_id),
         last_error = $4,
         updated_at = now()
     WHERE id = $1`,
    [id, patch.deliveryState, patch.providerMessageId ?? null, patch.lastError ?? null],
  );
}

function mapRow(row: Record<string, unknown>): CommunicationMessageRow {
  return {
    id: String(row.id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    channel: row.channel as CommunicationChannel,
    provider: row.provider as CommunicationProviderKey,
    message_intent: row.message_intent as CommunicationMessageIntent,
    delivery_state: row.delivery_state as CommunicationDeliveryState,
    correlation_id: String(row.correlation_id),
    idempotency_key: String(row.idempotency_key),
    recipient: String(row.recipient),
    provider_message_id: row.provider_message_id != null ? String(row.provider_message_id) : null,
    routing_json: (row.routing_json ?? {}) as Record<string, unknown>,
    metadata_json: (row.metadata_json ?? {}) as Record<string, unknown>,
    shadow_mode: Boolean(row.shadow_mode),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
