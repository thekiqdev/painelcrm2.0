/**
 * F6.3 — estado tipado da virtualização de conversas no Domain Store.
 */

export type ConversationVirtualizationState = {
  enabled: boolean;
  visibleStart: number;
  visibleEnd: number;
  overscanStart: number;
  overscanEnd: number;
  scrollTop: number;
  viewportHeight: number;
};

export function createInitialConversationVirtualizationState(): ConversationVirtualizationState {
  return {
    enabled: false,
    visibleStart: 0,
    visibleEnd: -1,
    overscanStart: 0,
    overscanEnd: -1,
    scrollTop: 0,
    viewportHeight: 0,
  };
}
