/**
 * F5.12 — Performance Baseline & Telemetry (observabilidade; sem mudança funcional).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createChatDomainStore,
  chatDomainActionCreators,
  setChatDomainStoreSessionForTests,
  syncStoreFromSocketEvent,
} from './index';
import {
  selectConversations,
  selectConversation,
  selectMessages,
  selectUnread,
  selectLoadingConversations,
  selectLoadingMessages,
} from './selectors';
import { selectConversationMessages } from './messageSelectors';
import {
  resetChatMigrationFlagsToDefaults,
  setChatMigrationFlagsForTests,
} from '@/lib/chatMigrationFlagManager';
import {
  isChatPerformanceTelemetryEnabled,
  beginPerfScenario,
  endPerfScenario,
  getLastScenarioResult,
} from '../metrics/performanceMetrics';
import { resetChatPerformanceMetrics, getChatPerformanceReport } from '../metrics/report';
import { recordRender, getRenderMetricsSnapshot } from '../metrics/renderMetrics';
import { getReducerMetricsSnapshot } from '../metrics/reducerMetrics';
import { getSelectorMetricsSnapshot } from '../metrics/selectorMetrics';
import {
  recordSubscriptionNotify,
  recordSubscriptionAttach,
  getSubscriptionMetricsSnapshot,
} from '../metrics/subscriptionMetrics';
import { recordHttpMetric, getHttpMetricsSnapshot } from '../metrics/httpMetrics';
import { getSocketMetricsSnapshot } from '../metrics/socketMetrics';
import { projectMemoryBaseline, sampleStoreMemory } from '../metrics/memoryMetrics';
import type { ChatMessage } from '@/services/chat';

describe('F5.12 performance baseline telemetry', () => {
  beforeEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetChatPerformanceMetrics();
    setChatDomainStoreSessionForTests(null);
  });

  afterEach(() => {
    resetChatMigrationFlagsToDefaults();
    resetChatPerformanceMetrics();
    setChatDomainStoreSessionForTests(null);
  });

  it('telemetry disabled when CHAT_CORE_METRICS=false', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: false });
    expect(isChatPerformanceTelemetryEnabled()).toBe(false);

    const store = createChatDomainStore();
    store.dispatch(chatDomainActionCreators.setConversations([]));
    recordRender('Chat.tsx');
    recordSubscriptionNotify('useChatMessages');
    recordHttpMetric({
      kind: 'GET conversations',
      endpoint: '/api/chat/conversations',
      method: 'GET',
      source: 'test',
    });

    const report = getChatPerformanceReport();
    expect(report.telemetryEnabled).toBe(false);
    expect(report.counters.reducers).toBe(0);
    expect(report.counters.renders).toBe(0);
    expect(report.counters.subscriptions).toBe(0);
    expect(report.counters.http).toBe(0);
  });

  it('records reducers when CHAT_CORE_METRICS=true', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    expect(isChatPerformanceTelemetryEnabled()).toBe(true);

    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          id: 'c1',
          instanceId: null,
          channel: 'uazapi',
          unreadCount: 0,
          lastMessageAt: null,
          lastMessagePreview: null,
          contactName: 'A',
          phoneNumber: null,
          attendanceStatus: null,
          assignedToUserId: null,
          clientId: null,
          leadId: null,
          conversationType: null,
          raw: {},
        },
      ]),
    );
    store.dispatch(chatDomainActionCreators.setSelectedConversation('c1'));
    store.dispatch(
      chatDomainActionCreators.setMessages('c1', [
        {
          id: 'm1',
          conversationId: 'c1',
          direction: 'incoming',
          body: 'hi',
          status: 'delivered',
          sentAt: '2026-07-13T12:00:00.000Z',
          externalMessageId: null,
          clientMessageId: null,
          raw: {},
        },
      ]),
    );

    const reducers = getReducerMetricsSnapshot();
    expect(reducers.total).toBeGreaterThanOrEqual(3);
    expect(reducers.byType['conversations/set']?.count).toBe(1);
    expect(reducers.byType['messages/set']?.count).toBe(1);
    expect(reducers.byType['selection/setConversation']?.count).toBe(1);
  });

  it('records selectors when executed', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          id: 'c1',
          instanceId: null,
          channel: 'uazapi',
          unreadCount: 1,
          lastMessageAt: null,
          lastMessagePreview: null,
          contactName: 'A',
          phoneNumber: null,
          attendanceStatus: null,
          assignedToUserId: null,
          clientId: null,
          leadId: null,
          conversationType: null,
          raw: {},
        },
      ]),
    );
    const state = store.getState();
    selectConversations(state);
    selectConversation(state, 'c1');
    selectMessages(state, 'c1');
    selectConversationMessages(state, 'c1');
    selectUnread(state);
    selectLoadingConversations(state);
    selectLoadingMessages(state, 'c1');

    const selectors = getSelectorMetricsSnapshot();
    expect(selectors.byName.selectConversations?.count).toBeGreaterThanOrEqual(1);
    expect(selectors.byName.selectConversation?.count).toBeGreaterThanOrEqual(1);
    expect(selectors.byName.selectMessages?.count).toBeGreaterThanOrEqual(1);
    expect(selectors.byName.selectConversationMessages?.count).toBeGreaterThanOrEqual(1);
    expect(selectors.byName.selectUnread?.count).toBeGreaterThanOrEqual(1);
    expect(selectors.byName.selectLoadingConversations?.count).toBeGreaterThanOrEqual(1);
    expect(selectors.byName.selectLoadingMessages?.count).toBeGreaterThanOrEqual(1);
  });

  it('records subscriptions by hook name', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    const detach = recordSubscriptionAttach('useChatConversationList');
    recordSubscriptionNotify('useChatConversationList');
    recordSubscriptionNotify('useChatMessages');
    recordSubscriptionNotify('useFloatingConversationMessages');
    detach();

    const snap = getSubscriptionMetricsSnapshot();
    expect(snap.notifyTotal).toBe(3);
    expect(snap.byHook.useChatConversationList).toBe(1);
    expect(snap.byHook.useChatMessages).toBe(1);
    expect(snap.byHook.useFloatingConversationMessages).toBe(1);
  });

  it('records socket apply latency via syncStoreFromSocketEvent', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_STORE: true, CHAT_CORE_METRICS: true });
    const store = createChatDomainStore();
    setChatDomainStoreSessionForTests(store);

    const legacyMessage = {
      id: 'm1',
      conversation_id: 'conv-1',
      direction: 'incoming',
      body: 'hello',
      status: 'delivered',
      sent_at: '2026-07-13T12:00:00.000Z',
    } as ChatMessage;

    syncStoreFromSocketEvent({
      kind: 'message.created',
      protocol: 'v2',
      payload: { message: legacyMessage },
      conversationId: 'conv-1',
      instanceId: null,
      receivedAt: Date.now(),
    });

    const socket = getSocketMetricsSnapshot();
    expect(socket.total).toBeGreaterThanOrEqual(1);
    expect(socket.byKind['message.created']?.count).toBeGreaterThanOrEqual(1);

    const incoming = getLastScenarioResult('incoming_message');
    expect(incoming).toBeDefined();
    expect(incoming!.delta.reducers).toBeGreaterThanOrEqual(1);
  });

  it('memory projections are deterministic for F6 comparison', () => {
    expect(projectMemoryBaseline(100, 0)).toBe(80_000);
    expect(projectMemoryBaseline(500, 0)).toBe(400_000);
    expect(projectMemoryBaseline(1000, 0)).toBe(800_000);
    expect(projectMemoryBaseline(0, 5000)).toBe(2_000_000);
    expect(projectMemoryBaseline(0, 10000)).toBe(4_000_000);

    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setConversations(
        Array.from({ length: 10 }, (_, i) => ({
          id: `c${i}`,
          instanceId: null,
          channel: 'uazapi' as const,
          unreadCount: 0,
          lastMessageAt: null,
          lastMessagePreview: null,
          contactName: null,
          phoneNumber: null,
          attendanceStatus: null,
          assignedToUserId: null,
          clientId: null,
          leadId: null,
          conversationType: null,
          raw: {},
        })),
      ),
    );
    const sample = sampleStoreMemory(store.getState(), 'test');
    expect(sample?.conversations).toBe(10);
    expect(sample!.estimatedBytes).toBe(projectMemoryBaseline(10, 0));
  });

  it('scenario chat_open captures deltas', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true });
    beginPerfScenario('chat_open');
    recordRender('Chat.tsx');
    recordHttpMetric({
      kind: 'GET instances',
      endpoint: '/api/chat/instances',
      method: 'GET',
      source: 'test',
    });
    const ended = endPerfScenario('chat_open');
    expect(ended).not.toBeNull();
    expect(ended!.delta.renders).toBe(1);
    expect(ended!.delta.http).toBe(1);

    const report = getChatPerformanceReport();
    expect(report.baselineTemplate.chat_open.renders).toBe(1);
    expect(report.baselineTemplate.chat_open.http_requests).toBe(1);
    expect(getRenderMetricsSnapshot().byTarget['Chat.tsx']).toBe(1);
    expect(getHttpMetricsSnapshot().byKind['GET instances']).toBe(1);
  });

  it('does not alter store behavior when metrics on', () => {
    setChatMigrationFlagsForTests({ CHAT_CORE_METRICS: true, CHAT_CORE_STORE: true });
    const store = createChatDomainStore();
    store.dispatch(
      chatDomainActionCreators.setConversations([
        {
          id: 'c1',
          instanceId: null,
          channel: 'uazapi',
          unreadCount: 0,
          lastMessageAt: null,
          lastMessagePreview: 'x',
          contactName: 'A',
          phoneNumber: null,
          attendanceStatus: null,
          assignedToUserId: null,
          clientId: null,
          leadId: null,
          conversationType: null,
          raw: {},
        },
      ]),
    );
    expect(selectConversations(store.getState()).map((c) => c.id)).toEqual(['c1']);
  });
});
