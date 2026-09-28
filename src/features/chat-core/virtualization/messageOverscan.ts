/**
 * F6.4 — defaults da virtualização de mensagens.
 */

export const DEFAULT_MESSAGE_ROW_HEIGHT = 92;
export const DEFAULT_MESSAGE_OVERSCAN = 12;

export type MessageVirtualWindow = {
  visibleStart: number;
  visibleEnd: number;
  overscanStart: number;
  overscanEnd: number;
  scrollTop: number;
  viewportHeight: number;
  totalHeight: number;
  renderCount: number;
};

export type MessageVirtualItemLayout = {
  index: number;
  offsetTop: number;
  height: number;
};

export type MessageVirtualConfig = {
  overscan: number;
  estimatedRowHeight: number;
};

let configOverride: Partial<MessageVirtualConfig> | null = null;

export function setMessageVirtualConfigForTests(
  partial: Partial<MessageVirtualConfig> | null,
): void {
  configOverride = partial;
}

export function getMessageVirtualConfig(): MessageVirtualConfig {
  return {
    overscan: DEFAULT_MESSAGE_OVERSCAN,
    estimatedRowHeight: DEFAULT_MESSAGE_ROW_HEIGHT,
    ...configOverride,
  };
}
