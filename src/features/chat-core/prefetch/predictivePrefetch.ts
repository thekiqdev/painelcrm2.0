/**
 * F6.6 — Predictive Prefetch.
 * Constrói fila por prioridade e carrega em idle (requestIdleCallback).
 * Usa loadMessagesCommand sem alterar a API do comando.
 */

import type { ChatConversationId } from '../domain/types';
import type { ChatDomainState } from '../store/types';
import { scheduleIdleTask } from '@/lib/scheduleIdleTask';
import {
  computeHeatScore,
  type HeatConversationInput,
} from './heatScore';
import {
  DEFAULT_WARM_CONVERSATION_COUNT,
  isConversationAlreadyWarm,
  type WarmWindowEngine,
} from './warmWindow';
import {
  recordIdlePrefetch,
  recordPrefetchCancellation,
  recordPrefetchHit,
  recordPrefetchMiss,
  recordPrefetchRequest,
} from '../metrics/prefetchMetrics';

export type PrefetchConversationMeta = HeatConversationInput;

export type BuildPrefetchQueueParams = {
  selectedId: ChatConversationId | null;
  lastOpenedId: ChatConversationId | null;
  orderedIds: readonly ChatConversationId[];
  conversations: readonly PrefetchConversationMeta[];
  /** Já aquecidas / com openCount (do Warm Window). */
  warmEngine: WarmWindowEngine;
  maxCount?: number;
  nowMs?: number;
};

/**
 * Prioridade (spec F6.6):
 * 1. conversa atualmente aberta
 * 2. última conversa aberta
 * 3. imediatamente acima
 * 4. imediatamente abaixo
 * 5. não lidas
 * 6. atividade recente (heat)
 */
export function buildPrefetchQueue(params: BuildPrefetchQueueParams): ChatConversationId[] {
  const max = Math.max(1, params.maxCount ?? DEFAULT_WARM_CONVERSATION_COUNT);
  const ordered = params.orderedIds;
  const selected = params.selectedId;
  const lastOpened = params.lastOpenedId;
  const seen = new Set<ChatConversationId>();
  const out: ChatConversationId[] = [];

  const push = (id: ChatConversationId | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  push(selected);
  push(lastOpened && lastOpened !== selected ? lastOpened : null);

  if (selected) {
    const idx = ordered.indexOf(selected);
    if (idx >= 0) {
      push(ordered[idx - 1]);
      push(ordered[idx + 1]);
    }
  }

  const metaById = new Map(params.conversations.map((c) => [c.id, c]));
  const withHeat = ordered
    .map((id) => {
      const base = metaById.get(id) ?? { id };
      const entry = params.warmEngine.getEntry(id);
      return {
        id,
        unreadCount: base.unreadCount ?? 0,
        lastMessageAt: base.lastMessageAt ?? null,
        openCount: entry?.openCount ?? base.openCount ?? 0,
        lastOpenedAt: entry?.lastOpenedAt ?? base.lastOpenedAt ?? null,
        heatScore: 0,
      };
    })
    .map((c) => ({
      ...c,
      heatScore: computeHeatScore(c, { nowMs: params.nowMs }),
    }));

  const unread = withHeat
    .filter((c) => (c.unreadCount ?? 0) > 0)
    .sort((a, b) => b.heatScore - a.heatScore);
  for (const c of unread) {
    if (out.length >= max) break;
    push(c.id);
  }

  const byActivity = [...withHeat].sort((a, b) => b.heatScore - a.heatScore);
  for (const c of byActivity) {
    if (out.length >= max) break;
    push(c.id);
  }

  return out.slice(0, max);
}

export type PrefetchLoader = (conversationId: ChatConversationId) => Promise<unknown>;

export type PredictivePrefetchOptions = {
  warmEngine: WarmWindowEngine;
  getState: () => ChatDomainState | null;
  load: PrefetchLoader;
  maxCount?: number;
  /** Prefetch apenas via idle (default true). */
  idleOnly?: boolean;
  idleTimeoutMs?: number;
  idleFallbackMs?: number;
};

export type PredictivePrefetchController = {
  /** Agenda prefetch idle; cancela agenda/generation anterior. */
  schedule(params: {
    selectedId: ChatConversationId | null;
    orderedIds: readonly ChatConversationId[];
    conversations: readonly PrefetchConversationMeta[];
  }): void;
  /** Cancela idle + in-flight generation. */
  cancel(reason?: string): void;
  /** Prefetch síncrono (testes / stress) — respeita Window Cache. */
  runImmediate(params: {
    selectedId: ChatConversationId | null;
    orderedIds: readonly ChatConversationId[];
    conversations: readonly PrefetchConversationMeta[];
  }): Promise<ChatConversationId[]>;
  getInFlight(): ReadonlySet<ChatConversationId>;
  getLastQueue(): readonly ChatConversationId[];
};

export function createPredictivePrefetchController(
  options: PredictivePrefetchOptions,
): PredictivePrefetchController {
  const idleOnly = options.idleOnly !== false;
  const maxCount = options.maxCount ?? DEFAULT_WARM_CONVERSATION_COUNT;
  let generation = 0;
  let cancelIdle: (() => void) | null = null;
  let lastQueue: ChatConversationId[] = [];
  const inFlight = new Set<ChatConversationId>();

  const cancel = (reason = 'manual') => {
    if (cancelIdle) {
      cancelIdle();
      cancelIdle = null;
      recordPrefetchCancellation(reason);
    }
    generation += 1;
  };

  const runQueue = async (
    queue: ChatConversationId[],
    gen: number,
  ): Promise<ChatConversationId[]> => {
    const loaded: ChatConversationId[] = [];
    for (const id of queue) {
      if (gen !== generation) break;
      const state = options.getState();
      if (isConversationAlreadyWarm(state, id)) {
        options.warmEngine.markWarm(id);
        recordPrefetchHit(id);
        continue;
      }
      if (inFlight.has(id)) continue;
      inFlight.add(id);
      recordPrefetchRequest(id);
      try {
        await options.load(id);
        if (gen !== generation) break;
        options.warmEngine.markWarm(id);
        recordPrefetchMiss(id);
        loaded.push(id);
      } catch {
        /* prefetch best-effort — não propaga para UI */
      } finally {
        inFlight.delete(id);
      }
    }
    return loaded;
  };

  const build = (params: {
    selectedId: ChatConversationId | null;
    orderedIds: readonly ChatConversationId[];
    conversations: readonly PrefetchConversationMeta[];
  }) =>
    buildPrefetchQueue({
      selectedId: params.selectedId,
      lastOpenedId: options.warmEngine.getLastOpenedId(),
      orderedIds: params.orderedIds,
      conversations: params.conversations,
      warmEngine: options.warmEngine,
      maxCount,
    });

  return {
    schedule(params) {
      cancel('reschedule');
      const queue = build(params);
      lastQueue = queue;
      const gen = generation;

      const start = () => {
        cancelIdle = null;
        recordIdlePrefetch(queue.length);
        void runQueue(queue, gen);
      };

      if (!idleOnly) {
        start();
        return;
      }

      cancelIdle = scheduleIdleTask(start, {
        timeout: options.idleTimeoutMs ?? 3500,
        fallbackDelay: options.idleFallbackMs ?? 800,
      });
    },

    cancel,

    async runImmediate(params) {
      const queue = build(params);
      lastQueue = queue;
      const gen = ++generation;
      return runQueue(queue, gen);
    },

    getInFlight() {
      return inFlight;
    },

    getLastQueue() {
      return lastQueue;
    },
  };
}
