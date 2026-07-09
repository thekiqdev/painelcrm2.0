import { pool } from '../../utils/db.js';
import {
  hasAssignedTeamColumn,
  hasAttendanceColumns,
  hasChatPhase5SlaColumns,
} from '../../utils/chatAttendanceSchema.js';
import { canChatAction } from '../chatAccess.js';
import { fetchInstanceForOperate } from '../../utils/chatInstanceAccess.js';
import { canAccessWhatsappOfficialOperationalChat } from '../../utils/whatsappOfficialOperationalAccess.js';
import {
  isWhatsappOfficialSuperadminEnabled,
  isWhatsappOfficialTenantEnabled,
} from '../../config/whatsappOfficialEnv.js';
import { isWhatsappGroupsEnabled } from '../../config/whatsappGroupsEnv.js';
import { readKanbanTagIdsFromConversationMetadata } from '../chatKanbanConversationKanbanTagsService.js';
import { DEFAULT_KANBAN_TAG_COLOR_UI } from '../chatKanbanTagStore.js';
import { resolveTenantIdForUser } from '../../utils/resolveTenantIdForUser.js';
import type { AggregatedConversationsRequest, AggregatedListResult } from './types.js';
import { resolveAggregatedChannelScope } from './channelPredicate.js';
import { buildAggregatedConversationsQuery } from './queryBuilder.js';
import { buildNextCursor } from './cursor.js';
import { mapConversationRowsForClient } from './rowMapper.js';
import { logChatAggregatedDev } from './featureFlags.js';

async function hasLeadIdColumn(): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'lead_id'
    ) AS exists`,
  );
  return Boolean(r.rows[0]?.exists);
}

async function attachKanbanTags(
  rows: Record<string, unknown>[],
  userId: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const tenantId = await resolveTenantIdForUser(userId);
  if (!tenantId) {
    for (const row of rows) row.tags = [];
    return 0;
  }

  const allTagIds = new Set<string>();
  const convToTagIds = new Map<string, string[]>();
  for (const row of rows) {
    const ids = readKanbanTagIdsFromConversationMetadata(row.metadata);
    convToTagIds.set(String(row.id), ids);
    ids.forEach((id) => allTagIds.add(id));
  }

  if (allTagIds.size === 0) {
    for (const row of rows) row.tags = [];
    return 0;
  }

  const tr = await pool.query<{ id: string; label: string; color: string | null }>(
    `SELECT id::text, label, color FROM chat_kanban_tags WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, [...allTagIds]],
  );
  const byId = new Map(tr.rows.map((x) => [x.id, x]));
  for (const row of rows) {
    const ids = convToTagIds.get(String(row.id)) ?? [];
    row.tags = ids
      .map((id) => {
        const t = byId.get(id);
        if (!t) return null;
        const color = t.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI;
        return { id, label: t.label, name: t.label, color };
      })
      .filter((x): x is { id: string; label: string; name: string; color: string } => Boolean(x));
  }
  return 1;
}

export async function validateAggregatedConversationsAccess(
  request: AggregatedConversationsRequest,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!(await canChatAction(request.userId, 'view', request.req))) {
    return { ok: false, status: 403, error: 'Sem permissão para acessar o chat.' };
  }

  const { filter } = resolveAggregatedChannelScope(request);

  if (filter === 'whatsapp_official' && !canAccessWhatsappOfficialOperationalChat(request.req)) {
    return { ok: true };
  }

  if (filter === 'uazapi') {
    for (const instanceId of request.instanceIds) {
      const inst = await fetchInstanceForOperate(request.userId, instanceId);
      if (!inst) {
        return { ok: false, status: 404, error: `Instância não encontrada ou sem acesso: ${instanceId}` };
      }
    }
  }

  return { ok: true };
}

export async function listAggregatedConversations(
  request: AggregatedConversationsRequest,
  options?: { parityMode?: boolean },
): Promise<AggregatedListResult> {
  const responseStart = Date.now();
  const queryStart = Date.now();

  const attendanceCols = await hasAttendanceColumns();
  const teamCols = attendanceCols && (await hasAssignedTeamColumn());
  const slaPhase5Cols = await hasChatPhase5SlaColumns();
  const leadColumnAvailable = await hasLeadIdColumn();
  const groupsFeat = isWhatsappGroupsEnabled();
  const viewAll = attendanceCols ? await canChatAction(request.userId, 'view_all', request.req) : false;
  const parityMode = options?.parityMode ?? request.view === 'full';

  const built = buildAggregatedConversationsQuery(request, {
    attendanceCols,
    teamCols,
    slaPhase5Cols,
    leadColumnAvailable,
    groupsFeat,
    superadminOfficialEnabled:
      Boolean(request.req.user?.is_super_admin) && isWhatsappOfficialSuperadminEnabled(),
    tenantOfficialEnabled: isWhatsappOfficialTenantEnabled(),
    viewAll,
    parityMode,
  });

  const queryResult = await pool.query(built.sql, built.params);
  const queryMs = Date.now() - queryStart;
  let sqlCount = 1;

  const rawRows = queryResult.rows as Record<string, unknown>[];
  const hasMore = rawRows.length > built.limit;
  const pageRows = hasMore ? rawRows.slice(0, built.limit) : rawRows;

  sqlCount += await attachKanbanTags(pageRows, request.userId);

  const legacyItems = mapConversationRowsForClient(pageRows, request.view);
  const serializeStart = Date.now();
  const payloadForMeasure = request.apiVersion === 2 ? { items: legacyItems } : legacyItems;
  const payloadBytes = Buffer.byteLength(JSON.stringify(payloadForMeasure), 'utf8');
  const serializeMs = Date.now() - serializeStart;

  const nextCursor = hasMore ? buildNextCursor(request.sort, pageRows[pageRows.length - 1]) : null;
  const responseMs = Date.now() - responseStart;

  const envelope = {
    apiVersion: 2 as const,
    items: legacyItems,
    meta: {
      apiVersion: 2 as const,
      limit: built.limit,
      returned: legacyItems.length,
      hasMore,
      nextCursor,
      sort: request.sort,
      view: request.view,
      instanceIds: request.instanceIds,
      generatedAt: new Date().toISOString(),
      provider: request.provider,
    },
  };

  logChatAggregatedDev('aggregated_list', {
    userId: request.userId,
    instanceIds: request.instanceIds,
    view: request.view,
    sort: request.sort,
    rowCount: legacyItems.length,
    queryMs,
    sqlCount,
    payloadBytes,
  });

  return {
    legacyItems,
    envelope,
    metrics: {
      sqlCount,
      queryMs,
      serializeMs,
      payloadBytes,
      responseMs,
    },
  };
}
