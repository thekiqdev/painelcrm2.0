import { pool } from '../utils/db.js';
import { isAcquisitionActivationTrackingEnabled } from './acquisitionFlags.js';
import { logActivation } from './acquisitionLogger.js';
import type { ActivationEventType } from './acquisitionTypes.js';

let tableExistsCache: boolean | undefined;

async function eventsTableExists(): Promise<boolean> {
  if (tableExistsCache !== undefined) return tableExistsCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'acquisition_activation_events'`,
  );
  tableExistsCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return tableExistsCache;
}

export async function trackActivationEvent(input: {
  acquisitionLeadId?: string | null;
  tenantId?: string | null;
  eventType: ActivationEventType;
  correlationId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ tracked: boolean }> {
  const enabled = await isAcquisitionActivationTrackingEnabled({ tenantId: input.tenantId ?? null });
  if (!enabled) {
    logActivation('track_skipped', { event_type: input.eventType, reason: 'flag_off' });
    return { tracked: false };
  }

  if (!(await eventsTableExists())) return { tracked: false };

  await pool.query(
    `INSERT INTO acquisition_activation_events (
       acquisition_lead_id, tenant_id, event_type, correlation_id, metadata_json
     ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.acquisitionLeadId ?? null,
      input.tenantId ?? null,
      input.eventType,
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  logActivation('event_tracked', {
    event_type: input.eventType,
    acquisition_lead_id: input.acquisitionLeadId ?? null,
    tenant_id: input.tenantId ?? null,
    correlation_id: input.correlationId,
  });

  return { tracked: true };
}

export async function countActivationEventsForLead(acquisitionLeadId: string): Promise<number> {
  if (!(await eventsTableExists())) return 0;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM acquisition_activation_events WHERE acquisition_lead_id = $1`,
    [acquisitionLeadId],
  );
  return parseInt(r.rows[0]?.c ?? '0', 10);
}

export async function listActivationEventsForLead(acquisitionLeadId: string): Promise<string[]> {
  if (!(await eventsTableExists())) return [];
  const r = await pool.query<{ event_type: string }>(
    `SELECT event_type FROM acquisition_activation_events WHERE acquisition_lead_id = $1 ORDER BY created_at ASC`,
    [acquisitionLeadId],
  );
  return r.rows.map((row) => row.event_type);
}
