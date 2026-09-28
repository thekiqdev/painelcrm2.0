/**
 * Phase 3 / MB-012 — comentários internos no load de mensagens.
 * Hot path: 1 agregação scoped à conversa (JOIN), sem COUNT/json_agg correlacionado por msg.
 * Rollback: CHAT_MESSAGES_LEGACY_COMMENT_SUBQUERY=1
 */

export function isChatMessagesLegacyCommentSubqueryEnabled(): boolean {
  return String(process.env.CHAT_MESSAGES_LEGACY_COMMENT_SUBQUERY || '') === '1';
}

/** Fragmento SELECT legado (2 SubPlans por linha). */
export function buildLegacyMessageCommentSelectSql(): string {
  return `
        (
          SELECT COUNT(*)::int
          FROM chat_message_comments cmc
          WHERE cmc.message_id = m.id AND cmc.deleted_at IS NULL
        ) AS internal_comment_count,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', c.id,
                'author_user_id', c.author_user_id,
                'comment_text', c.comment_text,
                'created_at', c.created_at,
                'author_email', au.email,
                'author_display', COALESCE(
                  NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
                  split_part(au.email, '@', 1)
                )
              )
              ORDER BY c.created_at ASC
            ),
            '[]'::json
          )
          FROM chat_message_comments c
          INNER JOIN users au ON au.id = c.author_user_id
          LEFT JOIN profiles pr ON pr.id = au.id
          WHERE c.message_id = m.id AND c.deleted_at IS NULL
        ) AS internal_comments`;
}

/**
 * JOIN + fragmento SELECT otimizado.
 * Usa o mesmo placeholder `$1` da conversation_id da query de mensagens.
 */
export function buildOptimizedMessageCommentJoinSql(): {
  select: string;
  join: string;
} {
  return {
    select: `
        COALESCE(cm_agg.internal_comment_count, 0) AS internal_comment_count,
        COALESCE(cm_agg.internal_comments, '[]'::json) AS internal_comments`,
    join: `
        LEFT JOIN (
          SELECT
            cmc.message_id,
            COUNT(*)::int AS internal_comment_count,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', cmc.id,
                  'author_user_id', cmc.author_user_id,
                  'comment_text', cmc.comment_text,
                  'created_at', cmc.created_at,
                  'author_email', au.email,
                  'author_display', COALESCE(
                    NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
                    split_part(au.email, '@', 1)
                  )
                )
                ORDER BY cmc.created_at ASC
              ),
              '[]'::json
            ) AS internal_comments
          FROM chat_message_comments cmc
          INNER JOIN chat_messages m_cm ON m_cm.id = cmc.message_id AND m_cm.conversation_id = $1
          INNER JOIN users au ON au.id = cmc.author_user_id
          LEFT JOIN profiles pr ON pr.id = au.id
          WHERE cmc.deleted_at IS NULL
          GROUP BY cmc.message_id
        ) cm_agg ON cm_agg.message_id = m.id`,
  };
}
