/**
 * F6.3 — tipos e defaults da virtualização de conversas.
 */

export const DEFAULT_CONVERSATION_ROW_HEIGHT = 72;
export const DEFAULT_CONVERSATION_OVERSCAN = 10;

export type ConversationVirtualWindow = {
  visibleStart: number;
  visibleEnd: number;
  overscanStart: number;
  overscanEnd: number;
  scrollTop: number;
  viewportHeight: number;
  totalHeight: number;
  renderCount: number;
};

export type ConversationVirtualItemLayout = {
  index: number;
  offsetTop: number;
  height: number;
};

export type ConversationVirtualConfig = {
  overscan: number;
  estimatedRowHeight: number;
};

let configOverride: Partial<ConversationVirtualConfig> | null = null;

export function setConversationVirtualConfigForTests(
  partial: Partial<ConversationVirtualConfig> | null,
): void {
  configOverride = partial;
}

export function getConversationVirtualConfig(): ConversationVirtualConfig {
  return {
    overscan: DEFAULT_CONVERSATION_OVERSCAN,
    estimatedRowHeight: DEFAULT_CONVERSATION_ROW_HEIGHT,
    ...configOverride,
  };
}
