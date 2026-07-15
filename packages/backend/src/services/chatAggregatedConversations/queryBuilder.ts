import type { AggregatedConversationsRequest, ChatConversationSort } from './types.js';
import { decodeConversationCursor } from './cursor.js';
import { appendAggregatedChannelPredicateSql } from './channelPredicate.js';
import {
  buildEffectiveLastMessageExpr as buildSharedEffectiveLastMessageExpr,
  isChatListLegacyMessagesMaxEnabled,
} from '../chatSql/effectiveLastMessage.js';

export type QueryBuildContext = {
  attendanceCols: boolean;
  teamCols: boolean;
  slaPhase5Cols: boolean;
  leadColumnAvailable: boolean;
  groupsFeat: boolean;
  superadminOfficialEnabled: boolean;
  tenantOfficialEnabled: boolean;
  viewAll: boolean;
  /** Shadow / view=full — mesma semântica de ordenação que o legado. */
  parityMode: boolean;
};

export type BuiltAggregatedQuery = {
  sql: string;
  params: unknown[];
  effectiveLastMessageExpr: string;
  limit: number;
};

function priorityRankExpr(): string {
  return `CASE COALESCE(c.priority, 'normal')
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END`;
}

function pinnedExpr(): string {
  return `COALESCE((c.metadata->>'inbox_pinned')::boolean, false)`;
}

function slaSortExpr(slaPhase5Cols: boolean): string {
  if (slaPhase5Cols) {
    return `COALESCE(c.last_customer_message_at, c.last_message_at, c.created_at)`;
  }
  return `COALESCE(c.last_message_at, c.created_at)`;
}

export function buildEffectiveLastMessageExpr(ctx: QueryBuildContext): string {
  // Hot path aggregated (parityMode false): denormalized — alinhado MB-011/MB-013.
  // parityMode: MAX opcional via env (shadow/parity); default sem MAX após Phase 3.
  if (!ctx.parityMode) {
    return `COALESCE(c.last_message_at, c.created_at)`;
  }
  return buildSharedEffectiveLastMessageExpr({
    slaPhase5Cols: ctx.slaPhase5Cols,
    useMessagesMax: isChatListLegacyMessagesMaxEnabled(),
  });
}

function buildOrderBy(sort: ChatConversationSort, effectiveLastMessageExpr: string, ctx: QueryBuildContext): string {
  const pinned = pinnedExpr();
  const pinnedPrefix =
    sort === 'pinned'
      ? `${pinned} DESC NULLS LAST, `
      : `${pinned} DESC NULLS LAST, `;

  switch (sort) {
    case 'priority':
      return `ORDER BY ${pinnedPrefix}${priorityRankExpr()} ASC, (${effectiveLastMessageExpr}) DESC NULLS LAST, c.id DESC`;
    case 'unread':
      return `ORDER BY ${pinnedPrefix}COALESCE(c.unread_count, 0) DESC, (${effectiveLastMessageExpr}) DESC NULLS LAST, c.id DESC`;
    case 'sla':
      return `ORDER BY ${pinnedPrefix}${slaSortExpr(ctx.slaPhase5Cols)} DESC NULLS LAST, c.id DESC`;
    case 'pinned':
      return `ORDER BY ${pinned} DESC NULLS LAST, (${effectiveLastMessageExpr}) DESC NULLS LAST, c.id DESC`;
    case 'last_message_at':
    default:
      return `ORDER BY ${pinnedPrefix}
        CASE WHEN (${effectiveLastMessageExpr}) IS NULL THEN 1 ELSE 0 END ASC,
        (${effectiveLastMessageExpr}) DESC NULLS LAST,
        c.id DESC`;
  }
}

function buildCursorSql(
  sort: ChatConversationSort,
  cursor: ReturnType<typeof decodeConversationCursor>,
  effectiveLastMessageExpr: string,
  params: unknown[],
  ctx: QueryBuildContext,
): string {
  if (!cursor) return '';
  params.push(cursor.id);
  const idParam = params.length;

  if (sort === 'unread' && cursor.unread != null) {
    params.push(cursor.unread);
    const unreadParam = params.length;
    if (cursor.t) {
      params.push(cursor.t);
      const tParam = params.length;
      return ` AND (
        COALESCE(c.unread_count, 0) < $${unreadParam}
        OR (COALESCE(c.unread_count, 0) = $${unreadParam} AND (${effectiveLastMessageExpr}) < $${tParam}::timestamptz)
        OR (COALESCE(c.unread_count, 0) = $${unreadParam} AND (${effectiveLastMessageExpr}) = $${tParam}::timestamptz AND c.id < $${idParam}::uuid)
      )`;
    }
    return ` AND (
      COALESCE(c.unread_count, 0) < $${unreadParam}
      OR (COALESCE(c.unread_count, 0) = $${unreadParam} AND c.id < $${idParam}::uuid)
    )`;
  }

  if (cursor.t) {
    params.push(cursor.t);
    const tParam = params.length;
    return ` AND (
      (${effectiveLastMessageExpr}) < $${tParam}::timestamptz
      OR ((${effectiveLastMessageExpr}) = $${tParam}::timestamptz AND c.id < $${idParam}::uuid)
    )`;
  }

  return ` AND c.id < $${idParam}::uuid`;
}

export function buildAggregatedConversationsQuery(
  request: AggregatedConversationsRequest,
  ctx: QueryBuildContext,
): BuiltAggregatedQuery {
  const params: unknown[] = [request.userId];
  const effectiveLastMessageExpr = buildEffectiveLastMessageExpr(ctx);
  const decodedCursor = decodeConversationCursor(request.cursor);

  const officialVisibilitySql = `
    AND (
      c.instance_id IS NOT NULL
      OR (
        c.whatsapp_official_account_id IS NOT NULL
        AND (
          (${ctx.superadminOfficialEnabled ? 'true' : 'false'}) AND EXISTS (
            SELECT 1 FROM whatsapp_official_accounts wa_vis
            WHERE wa_vis.id = c.whatsapp_official_account_id
              AND wa_vis.owner_scope = 'superadmin'
              AND (wa_vis.inbox_user_id IS NULL OR wa_vis.inbox_user_id = $1::uuid)
          )
          OR
          (${ctx.tenantOfficialEnabled ? 'true' : 'false'}) AND EXISTS (
            SELECT 1 FROM whatsapp_official_accounts wa_vis
            INNER JOIN users u_me ON u_me.id = $1::uuid
            WHERE wa_vis.id = c.whatsapp_official_account_id
              AND wa_vis.tenant_id IS NOT NULL
              AND u_me.tenant_id IS NOT NULL
              AND wa_vis.tenant_id = u_me.tenant_id
          )
        )
      )
    )`;

  const whereOwnerOrTenant =
    request.inboxScope === 'owner'
      ? 'c.user_id = $1'
      : `(
      c.user_id = $1
      OR EXISTS (
        SELECT 1 FROM users u_owner
        INNER JOIN users u_me ON u_me.id = $1
        WHERE u_owner.id = c.user_id
          AND u_owner.tenant_id IS NOT NULL
          AND u_me.tenant_id IS NOT NULL
          AND u_owner.tenant_id = u_me.tenant_id
      )
    )`;

  const leadSelect = ctx.leadColumnAvailable ? 'c.lead_id' : 'NULL::uuid as lead_id';
  const leadJoinSql = ctx.leadColumnAvailable
    ? 'LEFT JOIN leads l ON l.id = c.lead_id AND l.user_id = c.user_id'
    : '';

  const attendanceSelectAndJoins = ctx.attendanceCols
    ? {
        select: `c.attendance_status,
        c.assigned_to_user_id,
        c.queue_id,
        ${ctx.teamCols ? 'c.assigned_team_id,\n        t_chat_team.name AS assigned_team_name,' : 'NULL::uuid AS assigned_team_id,\n        NULL::text AS assigned_team_name,'}
        c.assigned_at,
        c.closed_at,
        c.last_assignment_reason,
        assignee.email AS assignee_email,
        COALESCE(
          NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
          assignee.email
        ) AS assignee_display,
        COALESCE(
          NULLIF(TRIM(pf.avatar_url), ''),
          NULLIF(TRIM(assignee.avatar_url), '')
        ) AS assignee_avatar_url,`,
        joins: `
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id${ctx.teamCols ? '\n      LEFT JOIN teams t_chat_team ON t_chat_team.id = c.assigned_team_id' : ''}`,
      }
    : {
        select: `'pending'::text AS attendance_status,
        NULL::uuid AS assigned_to_user_id,
        NULL::uuid AS queue_id,
        NULL::timestamptz AS assigned_at,
        NULL::timestamptz AS closed_at,
        NULL::text AS last_assignment_reason,
        NULL::text AS assignee_email,
        NULL::text AS assignee_display,
        NULL::text AS assignee_avatar_url,`,
        joins: '',
      };

  const listSelect = `
        c.id,
        c.user_id,
        c.instance_id,
        c.provider,
        c.external_chat_id,
        c.conversation_type,
        c.display_name,
        c.contact_name,
        c.profile_name,
        c.phone_number,
        c.canonical_phone,
        COALESCE(c.avatar_cached_url, c.avatar_url) AS avatar_url,
        c.last_message_preview,
        c.last_message_at,
        ${effectiveLastMessageExpr} AS effective_last_message_at,
        c.unread_count,
        COALESCE(c.wa_archived, false) AS wa_archived,
        c.status,
        c.client_id,
        ${leadSelect},
        c.whatsapp_official_account_id,
        c.priority,
        ${attendanceSelectAndJoins.select}
        COALESCE(i.name, wa.display_phone_number, wa.verified_name, 'WhatsApp Oficial') as instance_name,
        CASE
          WHEN c.client_id IS NOT NULL THEN 'client_linked'
          WHEN ${ctx.leadColumnAvailable ? 'c.lead_id IS NOT NULL' : 'false'} THEN 'lead_linked'
          WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
          ELSE 'unlinked'
        END as link_state`;

  const fullExtraSelect = ctx.parityMode
    ? `,
        c.external_fast_id,
        c.avatar_cached_url,
        c.avatar_source_url,
        cl.whatsapp_avatar_url AS client_whatsapp_avatar_url,
        cl.whatsapp_avatar_cached_url AS client_whatsapp_avatar_cached_url,
        ${ctx.leadColumnAvailable ? `l.whatsapp_avatar_url AS lead_whatsapp_avatar_url,
        l.whatsapp_avatar_cached_url AS lead_whatsapp_avatar_cached_url,` : `NULL::text AS lead_whatsapp_avatar_url,
        NULL::text AS lead_whatsapp_avatar_cached_url,`}
        cc_ext.display_name AS communication_display_name,
        cc_ext.profile_avatar_url AS communication_avatar_url,
        cc_ext.communication_avatar_cached_url,
        c.identity_state,
        c.history_sync_status,
        c.last_history_sync_reason,
        c.metadata,
        c.created_at,
        c.updated_at,
        ${
          ctx.slaPhase5Cols
            ? `c.first_response_at,
        c.last_customer_message_at,
        c.last_agent_message_at,`
            : ''
        }
        COALESCE(c.metadata->>'link_source', 'system') as link_source,
        COALESCE(c.metadata->>'link_confidence', 'review') as link_confidence,
        CASE
          WHEN ${ctx.leadColumnAvailable ? 'c.lead_id IS NOT NULL' : 'false'} THEN (
            SELECT l2.status FROM leads l2 WHERE l2.id = c.lead_id AND l2.user_id = c.user_id LIMIT 1
          )
          ELSE NULL
        END as lead_status`
    : `,
        c.metadata,
        c.created_at,
        c.updated_at`;

  const lateralJoin = ctx.parityMode
    ? `
      LEFT JOIN LATERAL (
        SELECT cc.display_name, cc.profile_avatar_url, cc.avatar_cached_url AS communication_avatar_cached_url
        FROM communication_contacts cc
        WHERE cc.provider = CASE
          WHEN NULLIF(btrim(c.provider), '') = 'whatsapp_official' THEN 'whatsapp_official'
          ELSE COALESCE(NULLIF(btrim(c.provider), ''), 'whatsapp_uazapi')
        END
          AND cc.tenant_id = (SELECT tenant_id FROM users WHERE id = $1 LIMIT 1)
          AND (
            (c.canonical_chat_id IS NOT NULL AND btrim(c.canonical_chat_id) <> '' AND cc.provider_contact_id = c.canonical_chat_id)
            OR (c.external_chat_id IS NOT NULL AND btrim(c.external_chat_id) <> '' AND cc.provider_contact_id = c.external_chat_id)
            OR (c.canonical_phone IS NOT NULL AND btrim(c.canonical_phone) <> '' AND cc.phone = regexp_replace(c.canonical_phone, '\\D', '', 'g'))
            OR (c.phone_number IS NOT NULL AND btrim(c.phone_number) <> '' AND cc.phone = regexp_replace(c.phone_number, '\\D', '', 'g'))
          )
        ORDER BY cc.updated_at DESC
        LIMIT 1
      ) cc_ext ON true`
    : '';

  let sql = `
      SELECT
        ${listSelect}${fullExtraSelect}
      FROM chat_conversations c
      LEFT JOIN chat_instances i ON i.id = c.instance_id
      LEFT JOIN whatsapp_official_accounts wa ON wa.id = c.whatsapp_official_account_id
      ${ctx.parityMode ? 'LEFT JOIN clients cl ON cl.id = c.client_id AND cl.user_id = c.user_id' : ''}
      ${leadJoinSql}
      ${lateralJoin}${attendanceSelectAndJoins.joins}
      WHERE ${whereOwnerOrTenant}
      ${officialVisibilitySql}
    `;

  sql = appendAggregatedChannelPredicateSql(sql, params, request);

  if (!ctx.groupsFeat) {
    sql += ` AND (COALESCE(c.conversation_type, 'direct') <> 'group' AND c.external_chat_id NOT LIKE '%@g.us')`;
  } else if (request.conversationFilter === 'groups') {
    sql += ` AND (c.conversation_type = 'group' OR c.external_chat_id LIKE '%@g.us')`;
  }

  if (ctx.attendanceCols) {
    const af = request.attendanceFilter;
    if (af === 'wa_archived') {
      sql += ` AND COALESCE(c.wa_archived, false) = true`;
    } else if (af === 'mine') {
      params.push(request.userId);
      sql += ` AND c.assigned_to_user_id = $${params.length} AND c.attendance_status = 'in_progress'`;
    } else if (af === 'unassigned') {
      sql += ` AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND (c.attendance_status IS DISTINCT FROM 'closed')
          AND (c.attendance_status IS DISTINCT FROM 'archived')`;
      if (ctx.teamCols) sql += ` AND (c.assigned_team_id IS NULL)`;
    } else if (af === 'queue' || af === 'queued') {
      sql += ` AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND (c.attendance_status IS DISTINCT FROM 'closed')
          AND (c.attendance_status IS DISTINCT FROM 'archived')`;
      if (ctx.teamCols) sql += ` AND (c.assigned_team_id IS NULL)`;
    } else if (af === 'waiting' || af === 'waiting_customer') {
      sql += ` AND c.attendance_status = 'waiting_customer'`;
    } else if (af === 'closed') {
      sql += ` AND c.attendance_status IN ('closed', 'archived')`;
    } else if (af === 'team') {
      if (ctx.teamCols) {
        params.push(request.userId);
        sql += ` AND c.assigned_team_id IS NOT NULL
          AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = c.assigned_team_id AND tm.user_id = $${params.length}
          )`;
      } else {
        sql += ` AND FALSE`;
      }
    }
  }

  // WhatsApp archive isolation: only the Arquivadas filter includes wa_archived=true (groups too).
  if (request.attendanceFilter !== 'wa_archived') {
    sql += ` AND COALESCE(c.wa_archived, false) = false`;
  }

  if (request.assignedToUserId) {
    params.push(request.assignedToUserId);
    sql += ` AND c.assigned_to_user_id = $${params.length}::uuid`;
  }
  if (request.queueId) {
    params.push(request.queueId);
    sql += ` AND c.queue_id = $${params.length}::uuid`;
  }
  if (request.assignedTeamId) {
    params.push(request.assignedTeamId);
    sql += ` AND c.assigned_team_id = $${params.length}::uuid`;
  }

  if (request.status) {
    params.push(request.status);
    sql += ` AND c.status = $${params.length}`;
  }

  if (request.search) {
    params.push(`%${request.search.toLowerCase()}%`);
    sql += ` AND (
        LOWER(COALESCE(c.contact_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.profile_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.phone_number, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.display_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.canonical_phone, '')) LIKE $${params.length}
      )`;
  }

  if (request.startDate) {
    params.push(new Date(request.startDate));
    sql += ` AND (COALESCE(c.last_message_at, c.created_at) >= $${params.length})`;
  }
  if (request.endDate) {
    params.push(new Date(request.endDate));
    sql += ` AND (COALESCE(c.last_message_at, c.created_at) <= $${params.length})`;
  }

  if (request.unreadOnly) {
    sql += ` AND COALESCE(c.unread_count, 0) > 0`;
  }

  if ((request.tagIds?.length ?? 0) > 0) {
    params.push(request.tagIds);
    sql += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.metadata->'kanban_tag_ids', '[]'::jsonb)) tid
      WHERE tid::uuid = ANY($${params.length}::uuid[])
    )`;
  }

  if (ctx.attendanceCols && !ctx.viewAll) {
    if (ctx.teamCols) {
      sql += ` AND (
          c.assigned_to_user_id = $1
          OR (
            c.assigned_team_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = c.assigned_team_id AND tm.user_id = $1)
          )
          OR (
            c.assigned_to_user_id IS NULL
            AND (c.attendance_status IS NULL OR c.attendance_status NOT IN ('closed', 'archived'))
          )
        )`;
    } else {
      sql += ` AND (
          c.assigned_to_user_id = $1
          OR (
            c.assigned_to_user_id IS NULL
            AND (c.attendance_status IS NULL OR c.attendance_status NOT IN ('closed', 'archived'))
          )
        )`;
    }
  }

  sql += buildCursorSql(request.sort, decodedCursor, effectiveLastMessageExpr, params, ctx);
  sql += ` ${buildOrderBy(request.sort, effectiveLastMessageExpr, ctx)}`;
  sql += ` LIMIT ${request.limit + 1}`;

  return { sql, params, effectiveLastMessageExpr, limit: request.limit };
}
