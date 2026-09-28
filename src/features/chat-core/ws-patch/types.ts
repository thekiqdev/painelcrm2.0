/**
 * Tipos do módulo WS Patch (F2).
 */

export type ChatWsPatchEventKind =
  | 'message.created'
  | 'conversation.updated'
  | 'message.updated'
  | 'conversation.deleted'
  | 'conversation.attendance_updated';

export type ChatWsPatchResult = {
  /** Verdadeiro quando o patch substituiu o fluxo legado (invalidate/refetch) para este evento. */
  applied: boolean;
  eventKind: ChatWsPatchEventKind | 'unknown';
  /** Motivo do fallback legado (payload insuficiente, flag off, cache ausente, etc.). */
  reason?: string;
  /** Escopos atualizados sem HTTP (diagnóstico / métricas). */
  scopes?: string[];
};

export type ChatWsPatchContext = {
  /** Conversa com janela ativa no float (não incrementa unread na lista). */
  isActiveConversation?: boolean;
  /** Conversa com painel minimizado (atualiza minimized-meta). */
  isMinimizedConversation?: boolean;
};
