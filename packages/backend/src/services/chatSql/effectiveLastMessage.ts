/**
 * Phase 3 / MB-011 — expressão de “última mensagem” para ORDER BY da inbox.
 * Hot path: colunas denormalizadas (sem MAX correlacionado em chat_messages).
 * Rollback: CHAT_LIST_LEGACY_MESSAGES_MAX=1
 */

export function isChatListLegacyMessagesMaxEnabled(): boolean {
  return String(process.env.CHAT_LIST_LEGACY_MESSAGES_MAX || '') === '1';
}

export function buildMessagesMaxAtExpr(alias = 'c'): string {
  return `(SELECT MAX(COALESCE(m.sent_at, m.created_at))::timestamptz FROM chat_messages m WHERE m.conversation_id = ${alias}.id)`;
}

export type EffectiveLastMessageOptions = {
  slaPhase5Cols: boolean;
  /** When true, keep correlated MAX (parity / rollback). */
  useMessagesMax: boolean;
  conversationAlias?: string;
};

/**
 * Preserva semântica de ordenação; remove SubPlan MAX no default.
 */
export function buildEffectiveLastMessageExpr(opts: EffectiveLastMessageOptions): string {
  const alias = opts.conversationAlias ?? 'c';
  if (!opts.useMessagesMax) {
    if (opts.slaPhase5Cols) {
      return `COALESCE(
          ${alias}.last_message_at,
          GREATEST(${alias}.last_customer_message_at, ${alias}.last_agent_message_at),
          ${alias}.created_at
        )`;
    }
    return `COALESCE(${alias}.last_message_at, ${alias}.created_at)`;
  }

  const messagesMaxAtExpr = buildMessagesMaxAtExpr(alias);
  if (opts.slaPhase5Cols) {
    return `COALESCE(
          ${messagesMaxAtExpr},
          ${alias}.last_message_at,
          GREATEST(${alias}.last_customer_message_at, ${alias}.last_agent_message_at)
        )`;
  }
  return `COALESCE(
          ${messagesMaxAtExpr},
          ${alias}.last_message_at
        )`;
}
