import { pool } from '../utils/db.js';
import { hasKanbanAcquisitionLeadColumn } from './superadminOpsKanbanLeadService.js';

type AvatarFragments = { joins: string; resolverSelect: string };

/**
 * Lista cartões do board com enrich de conversa OU acquisition_lead (cartões operacionais).
 */
export async function queryEnrichedKanbanCards(
  boardId: string,
  tenantId: string,
  archivedClause: string,
  av: AvatarFragments,
): Promise<Record<string, unknown>[]> {
  const leadCol = await hasKanbanAcquisitionLeadColumn();

  if (!leadCol) {
    const q = `
      SELECT
        kc.id, kc.board_id, kc.column_id, kc.tenant_id, kc.conversation_id,
        kc.position, kc.metadata, kc.archived_at, kc.created_by_user_id, kc.updated_by_user_id,
        kc.created_at, kc.updated_at,
        c.display_name AS conv_display_name,
        c.contact_name AS conv_contact_name,
        c.profile_name AS conv_profile_name,
        c.phone_number AS conv_phone_number,
        c.canonical_phone AS conv_canonical_phone,
        c.last_message_preview AS conv_last_message_preview,
        c.last_message_at AS conv_last_message_at,
        COALESCE(c.unread_count, 0)::int AS conv_unread_count,
        c.client_id AS conv_client_id,
        c.lead_id AS conv_lead_id,
        ${av.resolverSelect}
        c.attendance_status AS conv_attendance_status,
        c.assigned_to_user_id AS conv_assigned_to_user_id,
        c.assigned_team_id AS conv_assigned_team_id,
        c.queue_id AS conv_queue_id,
        c.metadata AS conv_metadata,
        COALESCE(
          NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
          assignee.email
        ) AS conv_assignee_display,
        t_team.name AS conv_assigned_team_name,
        CASE
          WHEN c.client_id IS NOT NULL THEN 'client_linked'
          WHEN c.lead_id IS NOT NULL THEN 'lead_linked'
          WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
          ELSE 'unlinked'
        END AS conv_link_state,
        proposal_agg.proposal_pending_total,
        proposal_agg.proposal_accepted_total,
        NULL::uuid AS acquisition_lead_id,
        NULL::text AS op_lead_name,
        NULL::text AS op_lead_email,
        NULL::text AS op_lead_phone,
        NULL::text AS op_lead_source,
        NULL::text AS op_lead_stage,
        NULL::text AS op_activation_score
      FROM chat_kanban_cards kc
      INNER JOIN chat_conversations c ON c.id = kc.conversation_id
      ${av.joins}
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id
      LEFT JOIN teams t_team ON t_team.id = c.assigned_team_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN p.status = 'sent' THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_pending_total,
          COALESCE(SUM(CASE WHEN p.status IN ('accepted', 'invoiced') THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_accepted_total
        FROM proposals p
        INNER JOIN users pu ON pu.id = p.user_id AND pu.tenant_id = $2
        WHERE
          (c.client_id IS NOT NULL AND p.client_id = c.client_id)
          OR (c.client_id IS NULL AND c.lead_id IS NOT NULL AND p.lead_id = c.lead_id)
      ) proposal_agg ON TRUE
      WHERE kc.board_id = $1 AND kc.tenant_id = $2
      ${archivedClause}
      ORDER BY kc.column_id, kc.position ASC, kc.created_at ASC`;
    const r = await pool.query(q, [boardId, tenantId]);
    return r.rows as Record<string, unknown>[];
  }

  const q = `
    SELECT
      kc.id, kc.board_id, kc.column_id, kc.tenant_id, kc.conversation_id, kc.acquisition_lead_id,
      kc.position, kc.metadata, kc.archived_at, kc.created_by_user_id, kc.updated_by_user_id,
      kc.created_at, kc.updated_at,
      COALESCE(c.display_name, al.name, split_part(al.email, '@', 1)) AS conv_display_name,
      c.contact_name AS conv_contact_name,
      c.profile_name AS conv_profile_name,
      COALESCE(c.phone_number, al.phone) AS conv_phone_number,
      c.canonical_phone AS conv_canonical_phone,
      COALESCE(
        c.last_message_preview,
        CASE
          WHEN al.id IS NOT NULL THEN
            'Lead · ' || COALESCE(al.current_stage::text, '') ||
            CASE WHEN al.activation_score IS NOT NULL THEN ' · score ' || al.activation_score::text ELSE '' END
          ELSE NULL
        END
      ) AS conv_last_message_preview,
      COALESCE(c.last_message_at, al.created_at) AS conv_last_message_at,
      COALESCE(c.unread_count, 0)::int AS conv_unread_count,
      c.client_id AS conv_client_id,
      c.lead_id AS conv_lead_id,
      ${av.resolverSelect}
      c.attendance_status AS conv_attendance_status,
      c.assigned_to_user_id AS conv_assigned_to_user_id,
      c.assigned_team_id AS conv_assigned_team_id,
      c.queue_id AS conv_queue_id,
      COALESCE(c.metadata, kc.metadata) AS conv_metadata,
      COALESCE(
        NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
        assignee.email
      ) AS conv_assignee_display,
      t_team.name AS conv_assigned_team_name,
      CASE
        WHEN kc.acquisition_lead_id IS NOT NULL THEN 'acquisition_lead'
        WHEN c.client_id IS NOT NULL THEN 'client_linked'
        WHEN c.lead_id IS NOT NULL THEN 'lead_linked'
        WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
        ELSE 'unlinked'
      END AS conv_link_state,
      proposal_agg.proposal_pending_total,
      proposal_agg.proposal_accepted_total,
      al.name AS op_lead_name,
      al.email AS op_lead_email,
      al.phone AS op_lead_phone,
      al.source AS op_lead_source,
      al.current_stage::text AS op_lead_stage,
      al.activation_score::text AS op_activation_score
    FROM chat_kanban_cards kc
    LEFT JOIN chat_conversations c ON c.id = kc.conversation_id
    LEFT JOIN acquisition_leads al ON al.id = kc.acquisition_lead_id
    ${av.joins}
    LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
    LEFT JOIN profiles pf ON pf.id = assignee.id
    LEFT JOIN teams t_team ON t_team.id = c.assigned_team_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN p.status = 'sent' THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_pending_total,
        COALESCE(SUM(CASE WHEN p.status IN ('accepted', 'invoiced') THEN p.amount::numeric ELSE 0 END), 0)::double precision AS proposal_accepted_total
      FROM proposals p
      INNER JOIN users pu ON pu.id = p.user_id AND pu.tenant_id = $2
      WHERE c.id IS NOT NULL
        AND (
          (c.client_id IS NOT NULL AND p.client_id = c.client_id)
          OR (c.client_id IS NULL AND c.lead_id IS NOT NULL AND p.lead_id = c.lead_id)
        )
    ) proposal_agg ON TRUE
    WHERE kc.board_id = $1 AND kc.tenant_id = $2
      AND (kc.conversation_id IS NOT NULL OR kc.acquisition_lead_id IS NOT NULL)
    ${archivedClause}
    ORDER BY kc.column_id, kc.position ASC, kc.created_at ASC`;

  const r = await pool.query(q, [boardId, tenantId]);
  return r.rows as Record<string, unknown>[];
}

export async function queryEnrichedKanbanCardById(
  cardId: string,
  tenantId: string,
  av: AvatarFragments,
): Promise<Record<string, unknown> | null> {
  const leadCol = await hasKanbanAcquisitionLeadColumn();
  if (!leadCol) {
    const q = `
      SELECT kc.*, c.display_name AS conv_display_name
      FROM chat_kanban_cards kc
      INNER JOIN chat_conversations c ON c.id = kc.conversation_id
      WHERE kc.id = $1 AND kc.tenant_id = $2 LIMIT 1`;
    const r = await pool.query(q, [cardId, tenantId]);
    return (r.rows[0] as Record<string, unknown>) ?? null;
  }

  const q = `
    SELECT
      kc.id, kc.board_id, kc.column_id, kc.tenant_id, kc.conversation_id, kc.acquisition_lead_id,
      kc.position, kc.metadata, kc.archived_at, kc.created_by_user_id, kc.updated_by_user_id,
      kc.created_at, kc.updated_at,
      COALESCE(c.display_name, al.name, split_part(al.email, '@', 1)) AS conv_display_name,
      c.contact_name AS conv_contact_name,
      c.profile_name AS conv_profile_name,
      COALESCE(c.phone_number, al.phone) AS conv_phone_number,
      c.canonical_phone AS conv_canonical_phone,
      COALESCE(
        c.last_message_preview,
        CASE WHEN al.id IS NOT NULL THEN 'Lead · ' || COALESCE(al.current_stage::text, '') ELSE NULL END
      ) AS conv_last_message_preview,
      COALESCE(c.last_message_at, al.created_at) AS conv_last_message_at,
      COALESCE(c.unread_count, 0)::int AS conv_unread_count,
      c.client_id AS conv_client_id,
      c.lead_id AS conv_lead_id,
      ${av.resolverSelect}
      c.attendance_status AS conv_attendance_status,
      c.assigned_to_user_id AS conv_assigned_to_user_id,
      c.assigned_team_id AS conv_assigned_team_id,
      c.queue_id AS conv_queue_id,
      COALESCE(c.metadata, kc.metadata) AS conv_metadata,
      NULL::text AS conv_assignee_display,
      NULL::text AS conv_assigned_team_name,
      CASE WHEN kc.acquisition_lead_id IS NOT NULL THEN 'acquisition_lead' ELSE 'unlinked' END AS conv_link_state,
      0::double precision AS proposal_pending_total,
      0::double precision AS proposal_accepted_total,
      al.name AS op_lead_name,
      al.email AS op_lead_email,
      al.phone AS op_lead_phone,
      al.source AS op_lead_source,
      al.current_stage::text AS op_lead_stage,
      al.activation_score::text AS op_activation_score
    FROM chat_kanban_cards kc
    LEFT JOIN chat_conversations c ON c.id = kc.conversation_id
    LEFT JOIN acquisition_leads al ON al.id = kc.acquisition_lead_id
    ${av.joins}
    WHERE kc.id = $1 AND kc.tenant_id = $2
    LIMIT 1`;
  const r = await pool.query(q, [cardId, tenantId]);
  return (r.rows[0] as Record<string, unknown>) ?? null;
}
