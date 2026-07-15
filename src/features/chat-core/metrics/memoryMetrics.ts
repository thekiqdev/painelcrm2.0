/**
 * F5.12 — crescimento aproximado do Domain Store (contagens + bytes estimados).
 */

import type { ChatDomainState } from '../store/types';
import { isChatPerformanceTelemetryEnabled } from './performanceMetrics';

export type MemorySample = {
  at: number;
  conversations: number;
  messages: number;
  messageIds: number;
  estimatedBytes: number;
  label?: string;
};

const samples: MemorySample[] = [];
const MAX_SAMPLES = 100;

/** Estimativa heurística — não usa performance.memory (não disponível em todos browsers). */
export function estimateStoreBytes(state: ChatDomainState): number {
  const conversations = state.conversations.orderedIds.length;
  const messageIds = Object.keys(state.messages.byId).length;
  // ~800B conversa + ~400B mensagem (heurística F5.12)
  return conversations * 800 + messageIds * 400;
}

export function sampleStoreMemory(state: ChatDomainState, label?: string): MemorySample | null {
  if (!isChatPerformanceTelemetryEnabled()) return null;
  const conversations = state.conversations.orderedIds.length;
  const messageIds = Object.keys(state.messages.byId).length;
  let messages = 0;
  for (const ids of Object.values(state.messages.byConversationId)) {
    messages += ids?.length ?? 0;
  }
  const row: MemorySample = {
    at: Date.now(),
    conversations,
    messages,
    messageIds,
    estimatedBytes: estimateStoreBytes(state),
    label,
  };
  samples.push(row);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  return row;
}

/** Projeta bytes para baselines documentadas (sem alocar estado real). */
export function projectMemoryBaseline(conversations: number, messages: number): number {
  return conversations * 800 + messages * 400;
}

export function getMemoryMetricsSnapshot(): Readonly<{
  latest: MemorySample | null;
  samples: MemorySample[];
  projections: Record<string, number>;
}> {
  return {
    latest: samples.length > 0 ? samples[samples.length - 1]! : null,
    samples: [...samples],
    projections: {
      '100_conversations': projectMemoryBaseline(100, 0),
      '500_conversations': projectMemoryBaseline(500, 0),
      '1000_conversations': projectMemoryBaseline(1000, 0),
      '5000_messages': projectMemoryBaseline(0, 5000),
      '10000_messages': projectMemoryBaseline(0, 10000),
    },
  };
}

export function resetMemoryMetrics(): void {
  samples.length = 0;
}
