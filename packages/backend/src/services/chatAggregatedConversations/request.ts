import type { AuthRequest } from '../../middleware/auth.js';
import type { AggregatedConversationsRequest, ChatChannelOrigin, ChatConversationSort } from './types.js';
import { isChatAggregatedConversationsEnabled } from './featureFlags.js';
import { resolveAggregatedChannelScope } from './channelPredicate.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCsvUuids(raw: unknown): string[] {
  if (raw == null) return [];
  const parts: string[] = [];
  if (typeof raw === 'string') {
    parts.push(...raw.split(','));
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      parts.push(...String(item).split(','));
    }
  }
  return [...new Set(parts.map((s) => s.trim()).filter((s) => UUID_RE.test(s)))];
}

function parseSort(raw: unknown): ChatConversationSort {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (
    s === 'priority' ||
    s === 'unread' ||
    s === 'sla' ||
    s === 'pinned' ||
    s === 'last_message_at'
  ) {
    return s;
  }
  return 'last_message_at';
}

export function parseAggregatedConversationsRequest(req: AuthRequest): AggregatedConversationsRequest {
  const q = req.query;
  const inboxScope = q.inboxScope === 'tenant' ? 'tenant' : 'owner';
  const instanceIds = parseCsvUuids(q.instanceIds);
  const singleInstanceId =
    typeof q.instanceId === 'string' && q.instanceId.trim() ? q.instanceId.trim() : null;

  const apiVersionRaw =
    q.apiVersion === '2' ||
    String(q.apiVersion ?? '') === '2' ||
    String(req.headers['x-chat-api-version'] ?? '') === '2'
      ? 2
      : 1;

  const view = q.view === 'list' ? 'list' : 'full';
  const limitRaw = parseInt(String(q.limit ?? '200'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  const channelOriginRaw =
    typeof q.channelOrigin === 'string' ? q.channelOrigin.trim().toLowerCase() : '';
  const channelOrigin: ChatChannelOrigin =
    channelOriginRaw === 'uazapi' || channelOriginRaw === 'official' ? channelOriginRaw : 'all';

  const conversationFilterRaw =
    typeof q.conversationFilter === 'string' ? q.conversationFilter.trim().toLowerCase() : '';
  const conversationFilter = conversationFilterRaw === 'groups' ? 'groups' : 'all';

  const includeWhatsAppOfficial =
    String(q.includeWhatsAppOfficial || '') === '1' ||
    String(q.includeWhatsAppOfficial || '') === 'true';

  const unreadOnly =
    String(q.unreadOnly || '') === '1' || String(q.unreadOnly || '') === 'true';

  const tagIds = parseCsvUuids(q.tagIds);

  const useAggregatedApi =
    isChatAggregatedConversationsEnabled() &&
    (instanceIds.length > 0 || apiVersionRaw === 2);

  const withoutProvider: Omit<AggregatedConversationsRequest, 'provider'> = {
    userId: req.userId ?? '',
    req,
    inboxScope,
    instanceIds,
    singleInstanceId,
    apiVersion: apiVersionRaw,
    view,
    sort: parseSort(q.sort),
    limit,
    cursor: typeof q.cursor === 'string' && q.cursor.trim() ? q.cursor.trim() : null,
    search: typeof q.search === 'string' && q.search.trim() ? q.search.trim() : null,
    status: typeof q.status === 'string' && q.status.trim() ? q.status.trim() : null,
    startDate: typeof q.startDate === 'string' ? q.startDate : null,
    endDate: typeof q.endDate === 'string' ? q.endDate : null,
    attendanceFilter: typeof q.attendanceFilter === 'string' ? q.attendanceFilter : '',
    conversationFilter,
    channelOrigin,
    includeWhatsAppOfficial,
    unreadOnly,
    tagIds,
    assignedToUserId:
      typeof q.assignedToUserId === 'string' && UUID_RE.test(q.assignedToUserId.trim())
        ? q.assignedToUserId.trim()
        : null,
    queueId:
      typeof q.queueId === 'string' && UUID_RE.test(q.queueId.trim()) ? q.queueId.trim() : null,
    assignedTeamId:
      typeof q.assignedTeamId === 'string' && UUID_RE.test(q.assignedTeamId.trim())
        ? q.assignedTeamId.trim()
        : null,
    useAggregatedApi,
  };

  const { provider } = resolveAggregatedChannelScope(withoutProvider as AggregatedConversationsRequest);

  return { ...withoutProvider, provider };
}

/** Reconstrói pedido agregado equivalente a um GET legado (shadow). */
export function shadowRequestFromLegacyQuery(req: AuthRequest): AggregatedConversationsRequest {
  const parsed = parseAggregatedConversationsRequest(req);
  const ids =
    parsed.instanceIds.length > 0
      ? parsed.instanceIds
      : parsed.singleInstanceId
        ? [parsed.singleInstanceId]
        : [];
  return {
    ...parsed,
    instanceIds: ids,
    view: 'full',
    apiVersion: 1,
    useAggregatedApi: true,
  };
}

export function reductionPercent(legacy: number, aggregated: number): number {
  if (legacy <= 0) return 0;
  return Math.round(((legacy - aggregated) / legacy) * 10000) / 100;
}
