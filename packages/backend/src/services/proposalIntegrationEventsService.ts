import { pool } from '../utils/db.js';

export async function recordProposalIntegrationEvent(params: {
  tenantId: string;
  proposalId: string;
  eventKey: string;
  payload: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO proposal_integration_events (tenant_id, proposal_id, event_key, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id::text AS id`,
      [params.tenantId, params.proposalId, params.eventKey, JSON.stringify(params.payload)]
    );
    return r.rows[0]?.id ?? null;
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '42P01') return null;
    console.error('[recordProposalIntegrationEvent]', e);
    return null;
  }
}

export interface ProposalIntegrationEventRow {
  id: string;
  proposal_id: string;
  event_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function listProposalIntegrationEvents(
  proposalId: string,
  tenantId: string,
  limit = 100
): Promise<ProposalIntegrationEventRow[]> {
  const r = await pool.query<ProposalIntegrationEventRow>(
    `SELECT e.id, e.proposal_id::text AS proposal_id, e.event_key, e.payload, e.created_at::text AS created_at
     FROM proposal_integration_events e
     INNER JOIN proposals p ON p.id = e.proposal_id
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
     WHERE e.proposal_id = $1 AND e.tenant_id = $2
     ORDER BY e.created_at DESC
     LIMIT $3`,
    [proposalId, tenantId, Math.min(Math.max(limit, 1), 500)]
  );
  return r.rows;
}
