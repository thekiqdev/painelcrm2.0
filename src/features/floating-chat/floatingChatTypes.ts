export type FloatingChatPanel = {
  conversationId: string;
  minimized: boolean;
};

export type FloatingChatPersistedV1 = {
  v: 1;
  listOpen: boolean;
  panels: Array<{ conversationId: string; minimized: boolean }>;
  /** Última janela focada (ordem Z / interação). */
  activeWindowId: string | null;
};
