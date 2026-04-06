import { pool } from '../utils/db.js';

export type ClientTimelineEventName =
  | 'chat_match_client_success'
  | 'chat_link_manual'
  | 'chat_link_auto_effective'
  | 'chat_link_migrated_lead_to_client'
  | 'chat_invoice_sent'
  | 'chat_invoice_created'
  | 'invoice_paid';

export interface CreateClientTimelineEventInput {
  tenantId: string;
  clientId: string;
  eventName: ClientTimelineEventName;
  source: string;
  actorType: 'user' | 'system' | 'integration';
  actorId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  eventKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ClientTimelineEventRow {
  id: string;
  tenant_id: string;
  client_id: string;
  event_name: ClientTimelineEventName;
  source: string;
  actor_type: 'user' | 'system' | 'integration';
  actor_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  event_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function createClientTimelineEvent(input: CreateClientTimelineEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO client_timeline_events (
      tenant_id, client_id, event_name, source, actor_type, actor_id,
      reference_type, reference_id, event_key, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
    [
      input.tenantId,
      input.clientId,
      input.eventName,
      input.source,
      input.actorType,
      input.actorId ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.eventKey ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

export async function listClientTimelineEvents(params: {
  tenantId: string;
  clientId: string;
  limit?: number;
  offset?: number;
}): Promise<ClientTimelineEventRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const result = await pool.query<ClientTimelineEventRow>(
    `SELECT id, tenant_id, client_id, event_name, source, actor_type, actor_id,
            reference_type, reference_id, event_key, metadata, created_at
     FROM client_timeline_events
     WHERE tenant_id = $1
       AND client_id = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [params.tenantId, params.clientId, limit, offset]
  );
  return result.rows;
}
