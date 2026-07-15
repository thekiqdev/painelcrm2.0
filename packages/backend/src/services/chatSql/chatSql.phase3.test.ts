import { describe, expect, it } from 'vitest';
import {
  buildEffectiveLastMessageExpr,
  buildMessagesMaxAtExpr,
} from './effectiveLastMessage.js';
import {
  buildLegacyMessageCommentSelectSql,
  buildOptimizedMessageCommentJoinSql,
} from './messageCommentsSql.js';

describe('chatSql effectiveLastMessage (MB-011)', () => {
  it('hot path avoids correlated MAX', () => {
    const expr = buildEffectiveLastMessageExpr({
      slaPhase5Cols: false,
      useMessagesMax: false,
    });
    expect(expr).not.toContain('MAX(');
    expect(expr).toContain('last_message_at');
  });

  it('legacy rollback keeps MAX subquery', () => {
    const expr = buildEffectiveLastMessageExpr({
      slaPhase5Cols: true,
      useMessagesMax: true,
    });
    expect(expr).toContain(buildMessagesMaxAtExpr('c'));
    expect(expr).toContain('last_customer_message_at');
  });
});

describe('chatSql messageCommentsSql (MB-012)', () => {
  it('legacy has per-message COUNT and json_agg', () => {
    const sql = buildLegacyMessageCommentSelectSql();
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('json_agg');
    expect(sql).toContain('cmc.message_id = m.id');
  });

  it('optimized aggregates once scoped to conversation $1', () => {
    const { select, join } = buildOptimizedMessageCommentJoinSql();
    expect(select).toContain('cm_agg.internal_comment_count');
    expect(join).toContain('m_cm.conversation_id = $1');
    expect(join).toContain('GROUP BY cmc.message_id');
    expect(join).not.toMatch(/WHERE c\.message_id = m\.id/);
  });
});
