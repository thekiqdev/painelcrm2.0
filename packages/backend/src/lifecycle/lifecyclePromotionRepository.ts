import { pool } from '../utils/db.js';

export type InsertLifecycleTransitionInput = {
  acquisitionLeadId?: string | null;
  tenantId?: string | null;
  cardId?: string | null;
  eventType: string;
  sourceBoardId?: string | null;
  sourceColumnId?: string | null;
  destinationBoardId?: string | null;
  destinationColumnId?: string | null;
  result: string;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertLifecycleTransition(input: InsertLifecycleTransitionInput): Promise<string | null> {
  try {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO ops_lifecycle_transitions (
         acquisition_lead_id, tenant_id, card_id, event_type,
         source_board_id, source_column_id, destination_board_id, destination_column_id,
         result, correlation_id, metadata_json
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4,
         $5::uuid, $6::uuid, $7::uuid, $8::uuid,
         $9, $10, $11::jsonb
       )
       RETURNING id::text`,
      [
        input.acquisitionLeadId ?? null,
        input.tenantId ?? null,
        input.cardId ?? null,
        input.eventType,
        input.sourceBoardId ?? null,
        input.sourceColumnId ?? null,
        input.destinationBoardId ?? null,
        input.destinationColumnId ?? null,
        input.result,
        input.correlationId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return r.rows[0]?.id ?? null;
  } catch (e) {
    console.error('[lifecycle_promotion] audit_insert_failed', { error: e, event_type: input.eventType });
    return null;
  }
}
