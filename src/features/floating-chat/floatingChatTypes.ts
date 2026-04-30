export type FloatingChatPanel = {
  conversationId: string;
  minimized: boolean;
};

/** Formato atual em `localStorage` (sem mensagens nem rascunhos). */
export type FloatingChatPersistedStateV1 = {
  version: 1;
  openConversationIds: string[];
  minimizedConversationIds: string[];
  minimizedOrder: string[];
  activeConversationId: string | null;
  listOpen: boolean;
};

/** Legado: `v` + `panels` (migrado na leitura). */
export type FloatingChatPersistedLegacyV1 = {
  v: 1;
  listOpen: boolean;
  panels: Array<{ conversationId: string; minimized: boolean }>;
  activeWindowId: string | null;
};
