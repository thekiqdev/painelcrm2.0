/**
 * F6.4 — estado tipado da virtualização de mensagens no Domain Store.
 */

export type MessageVirtualizationState = {
  enabled: boolean;
  visibleStart: number;
  visibleEnd: number;
  overscanStart: number;
  overscanEnd: number;
  viewportHeight: number;
  scrollTop: number;
  conversationId: string | null;
};

export function createInitialMessageVirtualizationState(): MessageVirtualizationState {
  return {
    enabled: false,
    visibleStart: 0,
    visibleEnd: -1,
    overscanStart: 0,
    overscanEnd: -1,
    viewportHeight: 0,
    scrollTop: 0,
    conversationId: null,
  };
}
