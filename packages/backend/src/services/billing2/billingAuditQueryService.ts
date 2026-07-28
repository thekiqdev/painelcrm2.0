/**
 * Billing 2.0 Sprint 7 — query / export de billing_audit_events.
 */
import { pool } from '../../utils/db.js';

export type BillingAuditEventListItem = {
  id: string;
  actor: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  origin: string | null;
  correlation_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type ListBillingAuditEventsQuery = {
  tenant_id?: string | null;
  billing_id?: string | null;
  subscription_id?: string | null;
  action?: string | null;
  entity_type?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

function parseDateBound(raw: string | null | undefined, endOfDay: boolean): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function resolveTenantEntityIds(tenantId: string): Promise<string[]> {
  const [billings, subs] = await Promise.all([
    pool.query<{ id: string }>(
      `SELECT id::text AS id FROM tenant_billing WHERE tenant_id = $1::uuid ORDER BY created_at DESC LIMIT 500`,
      [tenantId]
    ),
    pool.query<{ id: string }>(
      `SELECT id::text AS id FROM subscriptions WHERE tenant_id = $1::uuid AND type = 'saas' LIMIT 50`,
      [tenantId]
    ),
  ]);
  return Array.from(
    new Set([tenantId, ...billings.rows.map((r) => r.id), ...subs.rows.map((r) => r.id)])
  );
}

export async function listBillingAuditEvents(
  query: ListBillingAuditEventsQuery = {}
): Promise<{ events: BillingAuditEventListItem[]; total: number }> {
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const offset = Math.max(0, query.offset ?? 0);
  const params: unknown[] = [];
  const where: string[] = [];

  const fromIso = parseDateBound(query.from, false);
  const toIso = parseDateBound(query.to, true);
  if (fromIso) {
    params.push(fromIso);
    where.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`created_at <= $${params.length}::timestamptz`);
  }
  if (query.action?.trim()) {
    params.push(query.action.trim());
    where.push(`action = $${params.length}`);
  }
  if (query.entity_type?.trim()) {
    params.push(query.entity_type.trim());
    where.push(`entity_type = $${params.length}`);
  }
  if (query.billing_id?.trim()) {
    params.push(query.billing_id.trim());
    where.push(
      `((entity_type = 'tenant_billing' AND entity_id = $${params.length}) OR correlation_id ILIKE '%' || $${params.length} || '%')`
    );
  }
  if (query.subscription_id?.trim()) {
    params.push(query.subscription_id.trim());
    where.push(`(entity_type = 'subscription' AND entity_id = $${params.length})`);
  }
  if (query.tenant_id?.trim()) {
    const entityIds = await resolveTenantEntityIds(query.tenant_id.trim());
    params.push(entityIds);
    where.push(`entity_id = ANY($${params.length}::text[])`);
  }
  if (query.q?.trim()) {
    params.push(`%${query.q.trim()}%`);
    where.push(
      `(action ILIKE $${params.length} OR COALESCE(reason,'') ILIKE $${params.length} OR actor ILIKE $${params.length} OR COALESCE(correlation_id,'') ILIKE $${params.length})`
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM billing_audit_events ${whereClause}`,
    params
  );
  const total = Number.parseInt(countR.rows[0]?.c ?? '0', 10) || 0;

  params.push(limit);
  const limIdx = params.length;
  params.push(offset);
  const offIdx = params.length;

  const r = await pool.query(
    `SELECT id::text AS id, actor, actor_type, action, entity_type, entity_id, reason, origin,
            correlation_id, payload, created_at
     FROM billing_audit_events
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );

  const events: BillingAuditEventListItem[] = r.rows.map((row) => ({
    id: String(row.id),
    actor: String(row.actor),
    actor_type: String(row.actor_type),
    action: String(row.action),
    entity_type: String(row.entity_type),
    entity_id: row.entity_id != null ? String(row.entity_id) : null,
    reason: row.reason != null ? String(row.reason) : null,
    origin: row.origin != null ? String(row.origin) : null,
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    payload:
      row.payload != null && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : null,
    created_at: String(row.created_at),
  }));

  return { events, total };
}

export async function exportBillingAuditEventsCsv(
  query: ListBillingAuditEventsQuery
): Promise<string> {
  const { events } = await listBillingAuditEvents({
    ...query,
    limit: Math.min(5000, query.limit ?? 5000),
    offset: 0,
  });

  const header = [
    'id',
    'created_at',
    'actor',
    'actor_type',
    'action',
    'entity_type',
    'entity_id',
    'reason',
    'origin',
    'correlation_id',
  ];
  const escape = (v: string | null | undefined) => {
    const s = v ?? '';
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const e of events) {
    lines.push(
      [
        e.id,
        e.created_at,
        e.actor,
        e.actor_type,
        e.action,
        e.entity_type,
        e.entity_id,
        e.reason,
        e.origin,
        e.correlation_id,
      ]
        .map((x) => escape(x))
        .join(',')
    );
  }
  return lines.join('\n');
}
