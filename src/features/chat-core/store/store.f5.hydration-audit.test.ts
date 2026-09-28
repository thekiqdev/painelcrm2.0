/**
 * AUDIT F5 — timeline de hidratação (simulação da abertura /chat).
 * Não altera produção; reproduz sequência documentada em Chat.tsx + Floating.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { setChatMigrationFlagsForTests, resetChatMigrationFlagsToDefaults } from '@/lib/chatMigrationFlagManager';
import {
  getChatDomainStoreSession,
  resetChatDomainStoreSession,
} from './session';
import { applyStoreConversationList } from './consolidation';
import { selectChatConversationsForUi } from './chatSelectors';
import { syncStoreFromCommandResult } from './integration';
import { auditGetCounters, auditResetCounters } from './f5HydrationAudit';
import { bootstrapChatCoreStoreSession } from '../runtime/storeBootstrap';

vi.mock('../core/chatCore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../core/chatCore')>();
  return {
    ...mod,
    bootstrapChatCoreStoreShadow: vi.fn().mockResolvedValue(undefined),
  };
});

type TimelineEvent = {
  t: string;
  stage: string;
  orderedIds: number;
  byId: number;
  selector: number;
  detail?: string;
};

function snap(label: string, events: TimelineEvent[], detail?: string): void {
  const store = getChatDomainStoreSession();
  const state = store?.getState();
  events.push({
    t: label,
    stage: label,
    orderedIds: state?.conversations.orderedIds.length ?? 0,
    byId: state ? Object.keys(state.conversations.byId).length : 0,
    selector: state ? selectChatConversationsForUi(state).length : 0,
    detail,
  });
}

function legacyConversation(id: string) {
  return {
    id,
    user_id: 'u1',
    external_chat_id: `${id}@s.whatsapp.net`,
    instance_id: 'inst-1',
    contactName: `Contact ${id}`,
    lastMessagePreview: `preview-${id}`,
    lastMessageAt: '2026-07-09T12:00:00.000Z',
    unreadCount: 0,
  };
}

describe('AUDIT F5 store hydration timeline', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_F5_HYDRATION_AUDIT', '1');
    resetChatMigrationFlagsToDefaults();
    resetChatDomainStoreSession();
    auditResetCounters();
    setChatMigrationFlagsForTests({
      CHAT_CORE_STORE: true,
      CHAT_AGGREGATED_CHAT: true,
      CHAT_AGGREGATED_FLOAT: true,
    });
  });

  it('reproduces /chat open — happy path with 50 conversations', async () => {
    const events: TimelineEvent[] = [];

    // T0 — flags loaded (simulated)
    snap('T0 flags=ON', events, 'CHAT_CORE_STORE=true');

    // T1 — bootstrap (Chat loadInstances → bootstrapChatF3Session)
    bootstrapChatCoreStoreSession({ userId: 'u1', tenantId: 't1' });
    snap('T1 bootstrap', events, 'instances only, no inbox hydrate');

    // T2 — store session lazy-created on first access
    const store = getChatDomainStoreSession()!;
    const sessionRefA = store;
    snap('T2 session-created', events, `sessionId=1 ref=${String(store)}`);

    // T3 — HTTP/repository returns 50 (use real API shape sample)
    const apiSample = JSON.parse(
      readFileSync('C:/Users/kssan/AppData/Local/Temp/api-first-item.json', 'utf8'),
    );
    const fifty = Array.from({ length: 50 }, (_, i) =>
      i === 0 ? apiSample : legacyConversation(`conv-${i}`),
    );
    snap('T3 repository', events, `httpCount=${fifty.length}`);

    // T4 — loadConversations → applyStoreConversationList
    applyStoreConversationList(fifty);
    snap('T4 applyStoreConversationList(50)', events);

    // T5 — selector/hook read
    snap('T5 selector+hook-read', events);

    const counters = auditGetCounters();
    expect(counters.applyStoreConversationList).toBe(1);
    expect(counters.dispatchConversationsSet).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)?.orderedIds).toBe(50);
    expect(events.at(-1)?.selector).toBe(50);

    // singleton — same reference
    const sessionRefB = getChatDomainStoreSession();
    expect(sessionRefB).toBe(sessionRefA);

    // eslint-disable-next-line no-console
    console.log('AUDIT_TIMELINE_HAPPY', JSON.stringify({ events, counters }, null, 2));
  });

  it('reproduces overwrite — Chat 50 then Floating loadInboxCommand subset', async () => {
    const events: TimelineEvent[] = [];
    getChatDomainStoreSession();
    const fifty = Array.from({ length: 50 }, (_, i) => legacyConversation(`c-${i}`));
    applyStoreConversationList(fifty);
    snap('after Chat load', events, 'count=50');

    const three = [legacyConversation('x-1'), legacyConversation('x-2'), legacyConversation('x-3')];
    applyStoreConversationList(three);
    snap('after Floating loadInboxCommand', events, 'count=3');

    expect(events.at(-1)?.orderedIds).toBe(3);
    expect(auditGetCounters().applyStoreConversationList).toBe(2);

    // eslint-disable-next-line no-console
    console.log('AUDIT_TIMELINE_OVERWRITE', JSON.stringify(events, null, 2));
  });

  it('reproduces clear — applyStoreConversationList([]) after hydrate', () => {
    const events: TimelineEvent[] = [];
    applyStoreConversationList([legacyConversation('a'), legacyConversation('b')]);
    snap('after hydrate 2', events);

    applyStoreConversationList([]);
    snap('after applyStoreConversationList([])', events);

    expect(events.at(-1)?.orderedIds).toBe(0);
    expect(auditGetCounters().applyStoreConversationList).toBe(2);

    // eslint-disable-next-line no-console
    console.log('AUDIT_TIMELINE_CLEAR', JSON.stringify(events, null, 2));
  });

  it('reproduces skip — enabledInstanceIds empty: load never runs', () => {
    const events: TimelineEvent[] = [];
    bootstrapChatCoreStoreSession({ userId: 'u1', tenantId: 't1' });
    snap('bootstrap only — no loadConversations', events, 'enabledInstanceIds=0 guard');

    expect(getChatDomainStoreSession()?.getState().conversations.orderedIds.length).toBe(0);
    expect(auditGetCounters().applyStoreConversationList).toBe(0);

    // eslint-disable-next-line no-console
    console.log('AUDIT_TIMELINE_SKIP', JSON.stringify(events, null, 2));
  });
});
