import type { AuthRequest } from '../../middleware/auth.js';

export type ChatInboxScope = 'owner' | 'tenant';
export type ChatChannelOrigin = 'all' | 'uazapi' | 'official';
/** Provider de inbox na API agregada F4.1+ (extensível em sprint futura). */
export type ChatListProvider = 'uazapi' | 'whatsapp_official';
export type ChatConversationView = 'list' | 'full';
export type ChatConversationSort =
  | 'last_message_at'
  | 'priority'
  | 'unread'
  | 'sla'
  | 'pinned';

export type AggregatedConversationsRequest = {
  userId: string;
  req: AuthRequest;
  inboxScope: ChatInboxScope;
  instanceIds: string[];
  singleInstanceId: string | null;
  apiVersion: 1 | 2;
  view: ChatConversationView;
  sort: ChatConversationSort;
  limit: number;
  cursor: string | null;
  search: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  attendanceFilter: string;
  conversationFilter: 'all' | 'groups';
  channelOrigin: ChatChannelOrigin;
  /**
   * @deprecated Legado HTTP — ignorado pelo SQL agregado F4.1+.
   * Mantido no parse para shadow/audit; use channelOrigin + provider.
   */
  includeWhatsAppOfficial: boolean;
  /** Provider efetivo da listagem agregada (F4.1 default: uazapi). */
  provider: ChatListProvider;
  unreadOnly: boolean;
  tagIds: string[];
  assignedToUserId: string | null;
  queueId: string | null;
  assignedTeamId: string | null;
  useAggregatedApi: boolean;
};

export type AggregatedListMeta = {
  apiVersion: 2;
  limit: number;
  returned: number;
  hasMore: boolean;
  nextCursor: string | null;
  sort: ChatConversationSort;
  view: ChatConversationView;
  instanceIds: string[];
  generatedAt: string;
  /** Provider aplicado na query (F4.1: uazapi). */
  provider?: ChatListProvider;
};

export type AggregatedListResult = {
  legacyItems: Record<string, unknown>[];
  envelope: {
    apiVersion: 2;
    items: Record<string, unknown>[];
    meta: AggregatedListMeta;
  };
  metrics: {
    sqlCount: number;
    queryMs: number;
    serializeMs: number;
    payloadBytes: number;
    responseMs: number;
  };
};

export type ShadowCompareSide = {
  totalMs: number;
  sqlQueryMs: number;
  sqlCount: number;
  payloadBytes: number;
  serializeMs: number;
  responseMs: number;
  memoryBytesDelta: number;
  cpuMs: number;
  rowCount: number;
  rowIds: string[];
};

export type ShadowCompareSample = {
  at: string;
  userId: string;
  instanceCount: number;
  filters: Record<string, unknown>;
  legacy: ShadowCompareSide;
  aggregated: ShadowCompareSide;
  diff: {
    rowCountDelta: number;
    idMismatch: boolean;
    orderMismatch: boolean;
    totalMsReductionPercent: number;
    sqlQueryMsReductionPercent: number;
    sqlCountReductionPercent: number;
    payloadReductionPercent: number;
    serializeMsReductionPercent: number;
    responseMsReductionPercent: number;
    memoryReductionPercent: number;
    cpuReductionPercent: number;
  };
};
