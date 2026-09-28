import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';

export interface ProposalTimelineEventRow {
  id: string;
  proposal_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_user_id: string | null;
  created_at: string;
}

export async function insertProposalTimelineEvent(params: {
  proposalId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** Null para eventos públicos (ex.: visualização pelo cliente). */
  actorUserId?: string | null;
  /** Quando definido, usa a mesma transação do Kanban. */
  dbClient?: PoolClient;
}): Promise<void> {
  const q = `INSERT INTO proposal_timeline_events (proposal_id, event_type, payload, actor_user_id)
     VALUES ($1, $2, $3::jsonb, $4)`;
  const args = [params.proposalId, params.eventType, JSON.stringify(params.payload), params.actorUserId ?? null];
  if (params.dbClient) {
    await params.dbClient.query(q, args);
  } else {
    await pool.query(q, args);
  }
}

/** No máximo um evento `proposal_viewed` por dia civil (data `CURRENT_DATE` do PostgreSQL), por proposta. */
export async function maybeRecordProposalViewedPublic(proposalId: string): Promise<void> {
  const exists = await pool.query(
    `SELECT 1 FROM proposal_timeline_events
     WHERE proposal_id = $1 AND event_type = 'proposal_viewed'
       AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [proposalId]
  );
  if ((exists.rowCount ?? 0) > 0) return;
  await insertProposalTimelineEvent({
    proposalId,
    eventType: 'proposal_viewed',
    payload: { source: 'public_link' },
    actorUserId: null,
  });
}

export async function listProposalTimelineEvents(proposalId: string): Promise<ProposalTimelineEventRow[]> {
  const r = await pool.query<ProposalTimelineEventRow>(
    `SELECT id, proposal_id, event_type, payload, actor_user_id, created_at
     FROM proposal_timeline_events
     WHERE proposal_id = $1
     ORDER BY created_at ASC`,
    [proposalId]
  );
  return r.rows;
}
