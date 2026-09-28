/**
 * Etapa 5 — acesso à conversa: dono da instância OU mesmo tenant (inbox partilhado).
 * `userPlaceholder` é o placeholder SQL do utilizador autenticado (ex.: '$2', '$3').
 */
export function sqlChatAccessPredicate(userPlaceholder: string): string {
  return `(
  c.user_id = ${userPlaceholder}
  OR EXISTS (
    SELECT 1 FROM users cc_owner
    INNER JOIN users cc_actor ON cc_actor.id = ${userPlaceholder}
    WHERE cc_owner.id = c.user_id
      AND cc_owner.tenant_id IS NOT NULL
      AND cc_actor.tenant_id IS NOT NULL
      AND cc_owner.tenant_id = cc_actor.tenant_id
  )
)`;
}

/** Atalho: conversa $1, utilizador $2 */
export const SQL_CHAT_ACCESS_PREDICATE = sqlChatAccessPredicate('$2');
