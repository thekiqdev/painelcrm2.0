/**
 * F6.0 — fundação de preservação de scroll durante prepend (sem UI Load More).
 */

import { recordScrollPreservationTime } from '../metrics/cursorMetrics';
import { isChatPerformanceTelemetryEnabled, nowMs } from '../metrics/performanceMetrics';

export type ScrollAnchorSnapshot = {
  conversationId: string;
  scrollHeight: number;
  scrollTop: number;
  capturedAt: number;
};

/** Captura âncora antes do prepend (altura + top). */
export function captureScrollAnchor(
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>,
  conversationId: string,
): ScrollAnchorSnapshot {
  return {
    conversationId,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    capturedAt: Date.now(),
  };
}

/**
 * Restaura posição relativa após prepend (delta de scrollHeight).
 * Retorna o novo scrollTop aplicado.
 */
export function restoreScrollAnchor(
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>,
  snapshot: ScrollAnchorSnapshot,
): number {
  const t0 = nowMs();
  const delta = element.scrollHeight - snapshot.scrollHeight;
  const nextTop = snapshot.scrollTop + Math.max(0, delta);
  element.scrollTop = nextTop;
  if (isChatPerformanceTelemetryEnabled()) {
    recordScrollPreservationTime(nowMs() - t0);
  }
  return nextTop;
}

/** Persistência em memória por conversa (fundação; UI F6.1 pode usar). */
const anchors = new Map<string, ScrollAnchorSnapshot>();

export function saveConversationScrollAnchor(snapshot: ScrollAnchorSnapshot): void {
  anchors.set(snapshot.conversationId, snapshot);
}

export function loadConversationScrollAnchor(
  conversationId: string,
): ScrollAnchorSnapshot | null {
  return anchors.get(conversationId) ?? null;
}

export function clearConversationScrollAnchor(conversationId: string): void {
  anchors.delete(conversationId);
}

/** @internal testes */
export function resetScrollAnchorsForTests(): void {
  anchors.clear();
}
