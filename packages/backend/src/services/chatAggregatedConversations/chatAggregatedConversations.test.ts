import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  decodeConversationCursor,
  encodeConversationCursor,
  buildNextCursor,
} from './cursor.js';
import {
  parseAggregatedConversationsRequest,
  reductionPercent,
  shadowRequestFromLegacyQuery,
} from './request.js';
import {
  buildAggregatedConversationsQuery,
  buildEffectiveLastMessageExpr,
} from './queryBuilder.js';
import {
  resolveAggregatedChannelScope,
  appendAggregatedChannelPredicateSql,
} from './channelPredicate.js';
import {
  buildShadowDiff,
  resetChatAggregatedShadowSamples,
  getChatAggregatedShadowSamples,
  recordShadowCompareSample,
} from './shadowMetrics.js';
import {
  isChatAggregatedConversationsEnabled,
  isChatAggregatedApiShadowEnabled,
} from './featureFlags.js';
import {
  clearChatMigrationFlagsCacheForTests,
  setChatMigrationFlagsCacheForTests,
} from '../chatMigrationFlags/service.js';
import type { AggregatedConversationsRequest } from './types.js';
import type { AuthRequest } from '../../middleware/auth.js';

function mockReq(query: Record<string, unknown> = {}, headers: Record<string, string> = {}): AuthRequest {
  return {
    userId: '11111111-1111-1111-1111-111111111111',
    query,
    headers,
    user: { is_super_admin: false },
  } as unknown as AuthRequest;
}

describe('chatAggregatedConversations F4a', () => {
  beforeEach(() => {
    clearChatMigrationFlagsCacheForTests();
  });

  afterEach(() => {
    clearChatMigrationFlagsCacheForTests();
  });

  it('keeps aggregated flag off by default', () => {
    expect(isChatAggregatedConversationsEnabled()).toBe(false);
    expect(isChatAggregatedApiShadowEnabled()).toBe(false);
  });

  it('parses instanceIds and apiVersion=2', () => {
    setChatMigrationFlagsCacheForTests({ CHAT_AGGREGATED_CHAT: true });
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const req = mockReq({
      instanceIds: `${id},bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
      apiVersion: '2',
      view: 'list',
      sort: 'unread',
      limit: '50',
      cursor: encodeConversationCursor({
        sort: 'last_message_at',
        t: '2026-07-08T12:00:00.000Z',
        id,
      }),
    });
    const parsed = parseAggregatedConversationsRequest(req);
    expect(parsed.useAggregatedApi).toBe(true);
    expect(parsed.apiVersion).toBe(2);
    expect(parsed.view).toBe('list');
    expect(parsed.sort).toBe('unread');
    expect(parsed.limit).toBe(50);
    expect(parsed.instanceIds).toHaveLength(2);
  });

  it('does not activate aggregated api when flag off', () => {
    clearChatMigrationFlagsCacheForTests();
    const req = mockReq({
      instanceIds: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      apiVersion: '2',
    });
    expect(parseAggregatedConversationsRequest(req).useAggregatedApi).toBe(false);
  });

  it('builds keyset cursor filter without OFFSET', () => {
    const request = {
      userId: 'u1',
      inboxScope: 'tenant',
      instanceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      sort: 'last_message_at',
      limit: 200,
      tagIds: [],
      cursor: encodeConversationCursor({
        sort: 'last_message_at',
        t: '2026-07-08T10:00:00.000Z',
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    } as AggregatedConversationsRequest;

    const built = buildAggregatedConversationsQuery(request, {
      attendanceCols: true,
      teamCols: true,
      slaPhase5Cols: false,
      leadColumnAvailable: true,
      groupsFeat: true,
      superadminOfficialEnabled: false,
      tenantOfficialEnabled: false,
      viewAll: true,
      parityMode: false,
    });

    expect(built.sql).toContain('LIMIT 201');
    expect(built.sql).not.toMatch(/\bOFFSET\b/i);
    expect(built.sql).toContain('c.id < $');
    expect(built.params.length).toBeGreaterThan(1);
  });

  it('uses fast last_message_at expr in list mode', () => {
    const expr = buildEffectiveLastMessageExpr({
      attendanceCols: true,
      teamCols: false,
      slaPhase5Cols: true,
      leadColumnAvailable: true,
      groupsFeat: true,
      superadminOfficialEnabled: false,
      tenantOfficialEnabled: false,
      viewAll: true,
      parityMode: false,
    });
    expect(expr).toContain('c.last_message_at');
    expect(expr).not.toContain('chat_messages');
  });

  it('uses denormalized last_message_at in parity mode by default (Phase 3)', () => {
    const expr = buildEffectiveLastMessageExpr({
      attendanceCols: true,
      teamCols: false,
      slaPhase5Cols: true,
      leadColumnAvailable: true,
      groupsFeat: true,
      superadminOfficialEnabled: false,
      tenantOfficialEnabled: false,
      viewAll: true,
      parityMode: true,
    });
    expect(expr).toContain('last_message_at');
    expect(expr).not.toContain('chat_messages');
  });

  it('parity mode can restore MAX via CHAT_LIST_LEGACY_MESSAGES_MAX=1', () => {
    const prev = process.env.CHAT_LIST_LEGACY_MESSAGES_MAX;
    process.env.CHAT_LIST_LEGACY_MESSAGES_MAX = '1';
    try {
      const expr = buildEffectiveLastMessageExpr({
        attendanceCols: true,
        teamCols: false,
        slaPhase5Cols: true,
        leadColumnAvailable: true,
        groupsFeat: true,
        superadminOfficialEnabled: false,
        tenantOfficialEnabled: false,
        viewAll: true,
        parityMode: true,
      });
      expect(expr).toContain('chat_messages');
      expect(expr).toContain('MAX(');
    } finally {
      if (prev === undefined) delete process.env.CHAT_LIST_LEGACY_MESSAGES_MAX;
      else process.env.CHAT_LIST_LEGACY_MESSAGES_MAX = prev;
    }
  });

  it('computes reduction percent', () => {
    expect(reductionPercent(100, 25)).toBe(75);
    expect(reductionPercent(0, 10)).toBe(0);
  });

  it('records shadow compare samples with diff', () => {
    resetChatAggregatedShadowSamples();
    recordShadowCompareSample({
      at: new Date().toISOString(),
      userId: 'u1',
      instanceCount: 3,
      filters: {},
      legacy: {
        totalMs: 1000,
        sqlQueryMs: 800,
        sqlCount: 3,
        payloadBytes: 500_000,
        serializeMs: 40,
        responseMs: 1000,
        memoryBytesDelta: 1000,
        cpuMs: 50,
        rowCount: 10,
        rowIds: ['a', 'b'],
      },
      aggregated: {
        totalMs: 200,
        sqlQueryMs: 150,
        sqlCount: 1,
        payloadBytes: 120_000,
        serializeMs: 10,
        responseMs: 200,
        memoryBytesDelta: 400,
        cpuMs: 20,
        rowCount: 10,
        rowIds: ['a', 'b'],
      },
      diff: buildShadowDiff(
        {
          totalMs: 1000,
          sqlQueryMs: 800,
          sqlCount: 3,
          payloadBytes: 500_000,
          serializeMs: 40,
          responseMs: 1000,
          memoryBytesDelta: 1000,
          cpuMs: 50,
          rowCount: 10,
          rowIds: ['a', 'b'],
        },
        {
          totalMs: 200,
          sqlQueryMs: 150,
          sqlCount: 1,
          payloadBytes: 120_000,
          serializeMs: 10,
          responseMs: 200,
          memoryBytesDelta: 400,
          cpuMs: 20,
          rowCount: 10,
          rowIds: ['a', 'b'],
        },
      ),
    });
    const samples = getChatAggregatedShadowSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0]?.diff.totalMsReductionPercent).toBe(80);
    expect(samples[0]?.diff.sqlCountReductionPercent).toBeCloseTo(66.67);
  });

  it('shadowRequestFromLegacyQuery maps single instanceId', () => {
    const req = mockReq({
      instanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      inboxScope: 'tenant',
      attendanceFilter: 'mine',
    });
    const shadow = shadowRequestFromLegacyQuery(req);
    expect(shadow.instanceIds).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    expect(shadow.view).toBe('full');
  });

  it('round-trips cursor codec', () => {
    const encoded = encodeConversationCursor({
      sort: 'priority',
      t: '2026-01-01T00:00:00.000Z',
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      priority: 'high',
    });
    const decoded = decodeConversationCursor(encoded);
    expect(decoded?.sort).toBe('priority');
    expect(decoded?.id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(
      buildNextCursor('last_message_at', {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        effective_last_message_at: '2026-02-01T00:00:00.000Z',
      }),
    ).toBeTruthy();
  });
});

describe('chatAggregatedConversations F4.1 UazAPI hotfix', () => {
  const instanceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function baseRequest(
    overrides: Partial<AggregatedConversationsRequest> = {},
  ): AggregatedConversationsRequest {
    return {
      userId: 'u1',
      req: mockReq(),
      inboxScope: 'tenant',
      instanceIds: [instanceId],
      singleInstanceId: null,
      apiVersion: 2,
      view: 'list',
      sort: 'last_message_at',
      limit: 200,
      cursor: null,
      search: null,
      status: null,
      startDate: null,
      endDate: null,
      attendanceFilter: '',
      conversationFilter: 'all',
      channelOrigin: 'all',
      includeWhatsAppOfficial: true,
      provider: 'uazapi',
      unreadOnly: false,
      tagIds: [],
      assignedToUserId: null,
      queueId: null,
      assignedTeamId: null,
      useAggregatedApi: true,
      ...overrides,
    };
  }

  const queryCtx = {
    attendanceCols: true,
    teamCols: true,
    slaPhase5Cols: false,
    leadColumnAvailable: true,
    groupsFeat: true,
    superadminOfficialEnabled: false,
    tenantOfficialEnabled: false,
    viewAll: true,
    parityMode: false,
  };

  it('defaults provider to uazapi for channelOrigin all', () => {
    const scope = resolveAggregatedChannelScope(baseRequest());
    expect(scope.provider).toBe('uazapi');
    expect(scope.filter).toBe('uazapi');
  });

  it('ignores includeWhatsAppOfficial=1 and filters UazAPI by instanceIds', () => {
    const built = buildAggregatedConversationsQuery(
      baseRequest({ includeWhatsAppOfficial: true, channelOrigin: 'all' }),
      queryCtx,
    );
    expect(built.sql).toContain('c.instance_id = ANY(');
    expect(built.sql).toContain('c.whatsapp_official_account_id IS NULL');
  });

  it('uses official filter only when channelOrigin=official', () => {
    const built = buildAggregatedConversationsQuery(
      baseRequest({ channelOrigin: 'official', provider: 'whatsapp_official' }),
      queryCtx,
    );
    expect(built.sql).toContain('c.whatsapp_official_account_id IS NOT NULL');
    expect(built.sql).not.toContain('c.instance_id = ANY(');
  });

  it('parse sets provider uazapi even with legacy includeWhatsAppOfficial', () => {
    setChatMigrationFlagsCacheForTests({ CHAT_AGGREGATED_CHAT: true });
    const parsed = parseAggregatedConversationsRequest(
      mockReq({
        instanceIds: instanceId,
        apiVersion: '2',
        includeWhatsAppOfficial: '1',
        channelOrigin: 'all',
      }),
    );
    expect(parsed.provider).toBe('uazapi');
    expect(parsed.includeWhatsAppOfficial).toBe(true);
  });

  it('appendAggregatedChannelPredicateSql with empty instanceIds still scopes uazapi', () => {
    let sql = 'SELECT 1 WHERE 1=1';
    const params: unknown[] = [];
    sql = appendAggregatedChannelPredicateSql(
      sql,
      params,
      baseRequest({ instanceIds: [], channelOrigin: 'uazapi' }),
    );
    expect(sql).toContain('c.instance_id IS NOT NULL');
    expect(sql).toContain('c.whatsapp_official_account_id IS NULL');
    expect(params).toHaveLength(0);
  });
});
