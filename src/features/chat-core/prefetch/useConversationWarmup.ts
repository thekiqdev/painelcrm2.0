/**
 * F6.6 — hook Chat: Warm Window + Predictive Prefetch em idle.
 * Rollback: CHAT_CORE_STORE=OFF → no-op.
 */

import { useEffect, useMemo, useRef } from 'react';
import { loadMessagesCommand } from '../core/commands';
import { shouldUseChatDomainStore } from '../store/flags';
import { getChatDomainStoreSession } from '../store/session';
import {
  createPredictivePrefetchController,
  type PredictivePrefetchController,
} from './predictivePrefetch';
import {
  DEFAULT_WARM_CONVERSATION_COUNT,
  getWarmWindowEngine,
} from './warmWindow';
import { recordConversationOpenTime } from '../metrics/prefetchMetrics';
import { nowMs } from '../metrics/performanceMetrics';

export type UseConversationWarmupParams = {
  selectedConversationId: string | null;
  orderedIds: readonly string[];
  conversations: readonly {
    id: string;
    unreadCount?: number | null;
    lastMessageAt?: string | null;
  }[];
  enabled?: boolean;
  /** Capacidade da warm window (default 5). */
  warmCount?: number;
};

export type UseConversationWarmupResult = {
  enabled: boolean;
};

function fingerprintConversations(
  conversations: readonly {
    id: string;
    unreadCount?: number | null;
    lastMessageAt?: string | null;
  }[],
): string {
  return conversations
    .map((c) => `${c.id}:${c.unreadCount ?? 0}:${c.lastMessageAt ?? ''}`)
    .join('|');
}

/**
 * Pré-aquece vizinhos / unread / hot conversations em requestIdleCallback.
 * Cancela ao mudar seleção ou interação (pointer/keydown/wheel).
 */
export function useConversationWarmup(
  params: UseConversationWarmupParams,
): UseConversationWarmupResult {
  const storeOn = shouldUseChatDomainStore();
  const enabled = (params.enabled ?? true) && storeOn;
  const warmCount = params.warmCount ?? DEFAULT_WARM_CONVERSATION_COUNT;

  const controllerRef = useRef<PredictivePrefetchController | null>(null);
  const conversationsRef = useRef(params.conversations);
  conversationsRef.current = params.conversations;
  const orderedRef = useRef(params.orderedIds);
  orderedRef.current = params.orderedIds;

  const orderedKey = useMemo(() => params.orderedIds.join('|'), [params.orderedIds]);
  const conversationsKey = useMemo(
    () => fingerprintConversations(params.conversations),
    [params.conversations],
  );

  useEffect(() => {
    if (!enabled) return;

    const warmEngine = getWarmWindowEngine(warmCount);
    const controller = createPredictivePrefetchController({
      warmEngine,
      maxCount: warmCount,
      idleOnly: true,
      getState: () => getChatDomainStoreSession()?.getState() ?? null,
      load: (conversationId) => loadMessagesCommand(conversationId),
    });
    controllerRef.current = controller;

    const onInteract = () => {
      controller.cancel('interaction');
    };

    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract, { passive: true });
    window.addEventListener('wheel', onInteract, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
      window.removeEventListener('wheel', onInteract);
      controller.cancel('unmount');
      controllerRef.current = null;
    };
  }, [enabled, warmCount]);

  useEffect(() => {
    if (!enabled) return;
    const controller = controllerRef.current;
    if (!controller) return;

    const selectedId = params.selectedConversationId;
    if (selectedId) {
      const t0 = nowMs();
      const warmEngine = getWarmWindowEngine(warmCount);
      const state = getChatDomainStoreSession()?.getState() ?? null;
      warmEngine.noteOpenOutcome(selectedId, state);
      warmEngine.recordOpen(selectedId);
      recordConversationOpenTime(Math.max(0, nowMs() - t0));
    }

    controller.schedule({
      selectedId,
      orderedIds: orderedRef.current,
      conversations: conversationsRef.current,
    });

    return () => {
      controller.cancel('selection-change');
    };
  }, [enabled, warmCount, params.selectedConversationId, orderedKey, conversationsKey]);

  return { enabled };
}
