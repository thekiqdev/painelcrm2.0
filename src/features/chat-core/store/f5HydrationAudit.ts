/**
 * AUDIT F5 — instrumentação read-only (DEV / VITE_F5_HYDRATION_AUDIT=1).
 * Não altera lógica; apenas registra timeline de hidratação.
 */

import type { ChatDomainAction, ChatDomainState } from './types';

let sessionId = 0;
let applyCallCount = 0;
let dispatchSetCount = 0;
let selectorCallCount = 0;
let hookRenderCount = 0;

export function isF5HydrationAuditEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_F5_HYDRATION_AUDIT === '1';
}

export function auditAssignSessionId(id: number): void {
  sessionId = id;
}

export function auditGetSessionId(): number {
  return sessionId;
}

export function auditLogApplyStoreConversationList(params: {
  conversationCount: number;
  firstId: string | null;
  lastId: string | null;
  stack?: string;
}): void {
  if (!isF5HydrationAuditEnabled()) return;
  applyCallCount += 1;
  const stack = params.stack ?? new Error().stack ?? '';
  const shortStack = stack
    .split('\n')
    .slice(2, 6)
    .map((l) => l.trim())
    .join(' | ');
  console.debug('[F5-HYDRATION] applyStoreConversationList()', {
    call: applyCallCount,
    count: params.conversationCount,
    first: params.firstId,
    last: params.lastId,
    stack: shortStack,
    ts: performance.now(),
  });
}

export function auditLogConversationsSet(params: {
  orderedIdsBefore: number;
  orderedIdsAfter: number;
  actionCount: number;
}): void {
  if (!isF5HydrationAuditEnabled()) return;
  dispatchSetCount += 1;
  console.debug('[F5-HYDRATION] dispatch(conversations/set)', {
    call: dispatchSetCount,
    orderedIdsBefore: params.orderedIdsBefore,
    orderedIdsAfter: params.orderedIdsAfter,
    actionCount: params.actionCount,
    ts: performance.now(),
  });
}

export function auditLogStoreSnapshot(label: string, state: ChatDomainState): void {
  if (!isF5HydrationAuditEnabled()) return;
  console.debug(`[F5-HYDRATION] store@${label}`, {
    orderedIds: state.conversations.orderedIds.length,
    byId: Object.keys(state.conversations.byId).length,
    sessionId,
    ts: performance.now(),
  });
}

export function auditLogSelector(count: number): void {
  if (!isF5HydrationAuditEnabled()) return;
  selectorCallCount += 1;
  if (selectorCallCount <= 20 || selectorCallCount % 25 === 0) {
    console.debug('[F5-HYDRATION] selectChatConversationsForUi()', {
      call: selectorCallCount,
      count,
      ts: performance.now(),
    });
  }
}

export function auditLogHook(count: number, source: string): void {
  if (!isF5HydrationAuditEnabled()) return;
  hookRenderCount += 1;
  if (hookRenderCount <= 20 || hookRenderCount % 25 === 0) {
    console.debug('[F5-HYDRATION] useChatConversationList()', {
      render: hookRenderCount,
      count,
      source,
      ts: performance.now(),
    });
  }
}

export function auditLogDispatch(action: ChatDomainAction, before: ChatDomainState, after: ChatDomainState): void {
  if (!isF5HydrationAuditEnabled()) return;
  if (action.type === 'conversations/set') {
    auditLogConversationsSet({
      orderedIdsBefore: before.conversations.orderedIds.length,
      orderedIdsAfter: after.conversations.orderedIds.length,
      actionCount: action.conversations.length,
    });
    auditLogStoreSnapshot('after conversations/set', after);
  }
  if (action.type === 'store/reset') {
    console.debug('[F5-HYDRATION] dispatch(store/reset)', {
      orderedIdsBefore: before.conversations.orderedIds.length,
      ts: performance.now(),
    });
  }
}

export function auditGetCounters(): {
  applyStoreConversationList: number;
  dispatchConversationsSet: number;
  selectChatConversationsForUi: number;
  useChatConversationList: number;
} {
  return {
    applyStoreConversationList: applyCallCount,
    dispatchConversationsSet: dispatchSetCount,
    selectChatConversationsForUi: selectorCallCount,
    useChatConversationList: hookRenderCount,
  };
}

export function auditResetCounters(): void {
  applyCallCount = 0;
  dispatchSetCount = 0;
  selectorCallCount = 0;
  hookRenderCount = 0;
}
